"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { slugify } from "@/lib/slug";
import AddToHomeScreenPrompt from "@/app/components/add-to-home-screen-prompt";

const PENDING_MATCH_KEY = "natrix_pending_match";

type ResultRow = {
  matched_name: string;
  team_name: string | null;
  match_similarity: number;
  event_name: string;
  finals_time_text: string | null;
  finals_time_ms: number | null;
  meet_name: string | null;
  session_date: string | null;
  event_result_count: number;
};

type CandidateRow = {
  swimmer_name: string;
  team_name: string | null;
  match_similarity: number;
  exact_token_matches: number;
  event_result_count: number;
};

type LeaderboardRow = {
  swimmer_name: string;
  team_name: string | null;
  finals_time_text: string | null;
  finals_time_ms: number;
  place: number;
  is_target: boolean;
  is_first: boolean;
  total_entrants: number;
};

type FoundResult = {
  swimmerName: string;
  team: string | null;
  headline: {
    event: string;
    personalBest: { time: string | null; meet: string | null; date: string | null; ms: number | null } | null;
    mostRecent: { time: string | null; meet: string | null; date: string | null } | null;
    isSameSwim: boolean;
  };
  totalEventsFound: number;
  totalResultsFound: number;
  leaderboard: LeaderboardRow[] | null;
  // The next-best time this swimmer has in this same event, used to work
  // out "improved by X.XXs". `dated: true` means it's a genuinely earlier
  // swim (clean progression story); `dated: false` means we only know it's
  // another swim of theirs, not necessarily an earlier one (missing dates
  // in the source data), so the copy is phrased more carefully.
  previousBest: { ms: number; dated: boolean } | null;
  insight: string | null;
};

// Either nothing found, a single swimmer's results, or — when a name is
// ambiguous (multiple real swimmers plausibly match, e.g. two "Olivia Lim"s)
// — a short pick-list so the parent can choose the right one instead of the
// search silently guessing and showing a stranger's results.
type SearchState =
  | { kind: "notFound" }
  | { kind: "picking"; candidates: CandidateRow[]; totalMatches: number }
  | { kind: "found"; result: FoundResult };

function toDisplayName(hyTekName: string): string {
  const [last, rest] = hyTekName.split(",").map((s) => s.trim());
  if (!rest) return hyTekName;
  return `${rest} ${last}`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function buildFoundResult(rows: ResultRow[]): FoundResult {
  const headlineEventName = [...rows].sort((a, b) => {
    if (b.event_result_count !== a.event_result_count) return b.event_result_count - a.event_result_count;
    return (a.finals_time_ms ?? Infinity) - (b.finals_time_ms ?? Infinity);
  })[0].event_name;

  const headlineRows = rows.filter((r) => r.event_name === headlineEventName && r.finals_time_ms !== null);
  const personalBest = [...headlineRows].sort((a, b) => (a.finals_time_ms ?? Infinity) - (b.finals_time_ms ?? Infinity))[0];
  const mostRecent = [...headlineRows].sort((a, b) => {
    if (!a.session_date) return 1;
    if (!b.session_date) return -1;
    return b.session_date.localeCompare(a.session_date);
  })[0];

  const distinctEvents = Array.from(new Set(rows.map((r) => r.event_name)));

  // What's the next-best time this swimmer has in this event, so we can
  // say "improved by X.XXs"? Prefer a genuinely earlier-dated swim; fall
  // back to just their next-best time if dates are missing in the data.
  let previousBest: FoundResult["previousBest"] = null;
  if (personalBest) {
    const others = headlineRows.filter((r) => r !== personalBest && r.finals_time_ms !== null);
    const datedEarlier = personalBest.session_date
      ? others.filter((r) => r.session_date && r.session_date < personalBest.session_date!)
      : [];
    if (datedEarlier.length > 0) {
      const best = [...datedEarlier].sort((a, b) => (a.finals_time_ms ?? Infinity) - (b.finals_time_ms ?? Infinity))[0];
      previousBest = { ms: best.finals_time_ms!, dated: true };
    } else if (others.length > 0) {
      const secondBest = [...others].sort((a, b) => (a.finals_time_ms ?? Infinity) - (b.finals_time_ms ?? Infinity))[0];
      previousBest = { ms: secondBest.finals_time_ms!, dated: false };
    }
  }

  return {
    swimmerName: toDisplayName(rows[0].matched_name),
    team: rows[0].team_name,
    headline: {
      event: headlineEventName,
      personalBest: personalBest
        ? {
            time: personalBest.finals_time_text,
            meet: personalBest.meet_name,
            date: personalBest.session_date,
            ms: personalBest.finals_time_ms,
          }
        : null,
      mostRecent: mostRecent
        ? { time: mostRecent.finals_time_text, meet: mostRecent.meet_name, date: mostRecent.session_date }
        : null,
      isSameSwim:
        !!personalBest && !!mostRecent &&
        personalBest.finals_time_ms === mostRecent.finals_time_ms &&
        personalBest.meet_name === mostRecent.meet_name,
    },
    totalEventsFound: distinctEvents.length,
    totalResultsFound: rows.length,
    leaderboard: null,
    previousBest,
    insight: null,
  };
}

// Turns "Girls 10 Year Olds 50 LC Meter Freestyle" into "50 Free" — short,
// readable event labels for the narrative insight line.
function parseEventShort(eventName: string): string {
  const distance = parseDistanceMeters(eventName);
  const strokes: [RegExp, string][] = [
    [/freestyle/i, "Free"],
    [/backstroke/i, "Back"],
    [/breaststroke/i, "Breast"],
    [/butterfly/i, "Fly"],
    [/medley/i, "IM"],
  ];
  const stroke = strokes.find(([re]) => re.test(eventName))?.[1] ?? "";
  return distance ? `${distance} ${stroke}`.trim() : eventName;
}

// Natrix's single most compelling observation about this swim — chosen
// from a priority list, not a wall of stats. Most exciting fact wins;
// falls back to the closeness-to-next-placing gap if nothing bigger applies.
function pickInsight(result: FoundResult): string | null {
  const firstName = result.swimmerName.split(" ")[0];
  const hl = result.headline;

  if (hl.isSameSwim && result.previousBest) {
    return `This was ${firstName}'s fastest ${parseEventShort(hl.event)} on record! 🎉`;
  }

  if (result.previousBest && hl.personalBest?.ms != null) {
    const improvementMs = result.previousBest.ms - hl.personalBest.ms;
    if (improvementMs > 0) {
      const gap = formatGap(improvementMs);
      return result.previousBest.dated
        ? `${firstName} improved ${gap}s from her previous best!`
        : `${firstName} was ${gap}s faster here than her other best swim in this event.`;
    }
  }

  if (result.leaderboard) {
    const target = result.leaderboard.find((r) => r.is_target);
    if (target) {
      const percent = Math.ceil((target.place / target.total_entrants) * 100);
      if (percent <= 50) {
        return `${firstName} placed in the top ${percent}% of the field!`;
      }
    }
  }

  if (result.leaderboard) {
    const idx = result.leaderboard.findIndex((r) => r.is_target);
    if (idx > 0) {
      const above = result.leaderboard[idx - 1];
      const gap = formatGap(result.leaderboard[idx].finals_time_ms - above.finals_time_ms);
      return `${firstName} was only ${gap}s behind #${above.place} for the next spot!`;
    }
    if (idx === 0 && result.leaderboard.length > 1) {
      const below = result.leaderboard[1];
      const gap = formatGap(below.finals_time_ms - result.leaderboard[0].finals_time_ms);
      return `${firstName} led the pack by ${gap}s!`;
    }
  }

  return null;
}

function formatGap(ms: number) {
  return (ms / 1000).toFixed(2);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// Pulls the race distance out of a HyTek-style event name (e.g. "Girls 10
// Year Olds 50 LC Meter Freestyle" -> 50) so we can show an average speed
// alongside the raw time — most parents read "1.44 m/s" faster than a split.
function parseDistanceMeters(eventName: string): number | null {
  const match = eventName.match(/(\d+)\s*(?:LC|SC)\s*Meter/i);
  return match ? parseInt(match[1], 10) : null;
}

export default function SwimmerSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<SearchState | null>(null);
  const [searchedFor, setSearchedFor] = useState("");

  async function fetchFullResult(exactName: string): Promise<FoundResult | null> {
    const { data, error } = await supabase.rpc("search_public_swimmer", {
      p_query: exactName,
      p_exact_name: exactName,
    });
    if (error || !data || (data as ResultRow[]).length === 0) return null;
    const rows = data as ResultRow[];
    const result = buildFoundResult(rows);

    const pb = result.headline.personalBest;
    if (pb && pb.meet && pb.ms !== null) {
      const { data: lbData } = await supabase.rpc("get_event_leaderboard_slice", {
        p_meet_name: pb.meet,
        p_event_name: result.headline.event,
        p_finals_time_ms: pb.ms,
        p_swimmer_name: rows[0].matched_name,
      });
      if (lbData && (lbData as LeaderboardRow[]).length > 1) {
        result.leaderboard = lbData as LeaderboardRow[];
      }
    }

    result.insight = pickInsight(result);
    return result;
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;

    setLoading(true);
    setState(null);
    setSearchedFor(q);

    const { data, error } = await supabase.rpc("search_public_swimmer_candidates", { p_query: q });

    if (error || !data || (data as CandidateRow[]).length === 0) {
      setState({ kind: "notFound" });
      setLoading(false);
      return;
    }

    const candidates = data as CandidateRow[];
    const topScore = Math.max(...candidates.map((c) => c.exact_token_matches));
    const topTier = candidates.filter((c) => c.exact_token_matches === topScore);

    if (topTier.length === 1) {
      // Unambiguous — same swimmer wins by a clear margin, so skip the
      // picker and go straight to their results like a normal search.
      const result = await fetchFullResult(topTier[0].swimmer_name);
      setState(result ? { kind: "found", result } : { kind: "notFound" });
    } else if (topTier.length <= 6) {
      // A small, genuine tie (e.g. two "Olivia Lim"s) — show them all.
      setState({ kind: "picking", candidates: topTier, totalMatches: topTier.length });
    } else {
      // A common surname on its own (e.g. "Tan") can tie dozens of real
      // swimmers. Rather than silently showing an arbitrary 6 by score, sort
      // alphabetically (predictable, fair) and nudge toward a first name.
      const sorted = [...topTier].sort((a, b) =>
        toDisplayName(a.swimmer_name).localeCompare(toDisplayName(b.swimmer_name))
      );
      setState({ kind: "picking", candidates: sorted.slice(0, 8), totalMatches: topTier.length });
    }
    setLoading(false);
  }

  async function handlePickCandidate(swimmerName: string) {
    setLoading(true);
    const result = await fetchFullResult(swimmerName);
    setState(result ? { kind: "found", result } : { kind: "notFound" });
    setLoading(false);
  }

  function handleSeeFullHistory() {
    if (state?.kind !== "found") {
      router.push("/signup");
      return;
    }
    sessionStorage.setItem(
      PENDING_MATCH_KEY,
      JSON.stringify({ displayName: state.result.swimmerName, team: state.result.team ?? null })
    );
    router.push("/signup");
  }

  return (
    <div className="shell">
      <div className="container-app md:max-w-2xl md:px-10">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl"
            style={{ background: "rgba(217,119,6,0.25)", border: "1px solid rgba(253,230,138,0.3)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="Natrix" className="h-full w-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Find your swimmer&apos;s results</h1>
          <p className="mt-2 text-sm text-white/50">
            Search any competitive swimmer in Singapore. Real results, no account needed.
          </p>
          <p className="mt-2 text-xs text-white/30">
            Currently showing Singapore Aquatics&ndash;sanctioned meets only. Club-only, non-sanctioned meets aren&apos;t
            included yet.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Sara Wong"
            className="input"
            autoFocus
          />
          <button type="submit" disabled={loading || query.trim().length < 2} className="btn-block" style={{ width: "auto", paddingInline: "22px" }}>
            {loading ? "…" : "Search"}
          </button>
        </form>

        {loading && <p className="mt-6 text-center text-sm text-white/50">Digging through meet records…</p>}

        {!loading && state?.kind === "notFound" && (
          <div className="card mt-6 text-center">
            <p className="text-white/80">
              No results for <strong>&ldquo;{searchedFor}&rdquo;</strong> yet.
            </p>
            <p className="mt-2 text-xs text-white/40">
              We currently track SNAG, Singapore Swim Series, SNSC, SAQ ETP, and Short-Course Invitational meets from
              2026 onward.
            </p>
          </div>
        )}

        {!loading && state?.kind === "picking" && (
          <div className="card mt-6">
            <p className="mb-1 text-sm font-semibold text-white">
              A few swimmers match &ldquo;{searchedFor}&rdquo;
            </p>
            <p className="mb-4 text-xs text-white/40">
              {state.totalMatches > state.candidates.length
                ? `Showing ${state.candidates.length} of ${state.totalMatches} — try adding a first name to narrow it down.`
                : "Tap the right one to see their results."}
            </p>
            <div className="flex flex-col gap-2">
              {state.candidates.map((c) => (
                <button
                  key={c.swimmer_name}
                  type="button"
                  onClick={() => handlePickCandidate(c.swimmer_name)}
                  className="card-soft flex items-center justify-between text-left"
                  style={{ width: "100%" }}
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{toDisplayName(c.swimmer_name)}</div>
                    {c.team_name && <div className="text-xs text-white/40">{c.team_name}</div>}
                  </div>
                  <span className="text-xs" style={{ color: "#FDE68A" }}>
                    Select →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && state?.kind === "found" && (
          <>
            <div className="card mt-6">
              <div
                className="mb-1 inline-block rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.25)", color: "#FDE68A" }}
              >
                Match found
              </div>
              <h2 className="mt-2 text-xl font-bold text-white">{state.result.swimmerName}</h2>
              {state.result.team && <div className="text-sm text-white/50">{state.result.team}</div>}

              <div className="mt-4 border-t border-white/10 pt-3 text-sm font-semibold text-white/70">
                {state.result.headline.event}
              </div>

              <div className="mt-3 flex flex-wrap gap-3">
                {state.result.headline.personalBest && (
                  <div className="card-soft flex-1" style={{ minWidth: "150px" }}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-white/40">Personal Best</div>
                    <div className="text-2xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {state.result.headline.personalBest.time}
                    </div>
                    <div className="text-[11px] text-white/40">
                      {state.result.headline.personalBest.meet}
                      {formatDate(state.result.headline.personalBest.date) &&
                        ` · ${formatDate(state.result.headline.personalBest.date)}`}
                    </div>
                    {(() => {
                      const distance = parseDistanceMeters(state.result.headline.event);
                      const ms = state.result.headline.personalBest?.ms;
                      if (!distance || !ms) return null;
                      const speed = (distance / (ms / 1000)).toFixed(2);
                      const first = state.result.leaderboard?.find((r) => r.is_first);
                      const gapToFirst = first && !first.is_target ? formatGap(ms - first.finals_time_ms) : null;
                      return (
                        <div className="mt-2 flex flex-col gap-0.5 border-t border-white/10 pt-2 text-[11px] text-white/50">
                          <span>Avg speed: {speed} m/s</span>
                          {gapToFirst && <span>{gapToFirst}s behind 1st place</span>}
                        </div>
                      );
                    })()}
                  </div>
                )}
                {state.result.leaderboard && state.result.leaderboard.some((r) => r.is_target) && (
                  <div className="card-soft flex-1" style={{ minWidth: "150px" }}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-white/40">Placing</div>
                    <div className="text-2xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {ordinal(state.result.leaderboard.find((r) => r.is_target)!.place)}
                    </div>
                    <div className="text-[11px] text-white/40">
                      of {state.result.leaderboard[0].total_entrants} swimmers
                    </div>
                  </div>
                )}
                {!state.result.headline.isSameSwim && state.result.headline.mostRecent && (
                  <div className="card-soft flex-1" style={{ minWidth: "150px" }}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-white/40">Most Recent</div>
                    <div className="text-2xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {state.result.headline.mostRecent.time}
                    </div>
                    <div className="text-[11px] text-white/40">
                      {state.result.headline.mostRecent.meet}
                      {formatDate(state.result.headline.mostRecent.date) &&
                        ` · ${formatDate(state.result.headline.mostRecent.date)}`}
                    </div>
                  </div>
                )}
              </div>

              {state.result.insight && (
                <div
                  className="mt-4 rounded-xl px-4 py-3"
                  style={{ background: "rgba(217,119,6,0.14)", border: "1px solid rgba(253,230,138,0.3)" }}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#FDE68A" }}>
                    Natrix noticed 👀
                  </div>
                  <p className="mt-1 text-sm font-medium text-white">{state.result.insight}</p>
                </div>
              )}

              {state.result.leaderboard && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  {(() => {
                    const rows = state.result.leaderboard!;
                    return (
                      <>
                        <div className="mb-3 text-sm font-semibold text-white">How they stacked up</div>
                        <div className="flex flex-col gap-1">
                          {rows.map((r, i) => (
                            <div key={`${r.swimmer_name}-${r.place}`}>
                              {i > 0 && r.place - rows[i - 1].place > 1 && (
                                <div className="py-0 text-center text-xs text-white/30">···</div>
                              )}
                              <div
                                className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm"
                                style={
                                  r.is_target
                                    ? {
                                        background: "rgba(217,119,6,0.22)",
                                        border: "1px solid rgba(253,230,138,0.4)",
                                      }
                                    : { background: "rgba(255,255,255,0.04)" }
                                }
                              >
                                <div className="flex items-center gap-3">
                                  <span className="w-5 text-xs font-bold text-white/40">#{r.place}</span>
                                  <div>
                                    <div className={r.is_target ? "font-semibold text-white" : "text-white/80"}>
                                      {toDisplayName(r.swimmer_name)}
                                      {r.is_target && (
                                        <span className="ml-2 text-[10px] font-bold" style={{ color: "#FDE68A" }}>
                                          THEM
                                        </span>
                                      )}
                                    </div>
                                    {r.team_name && <div className="text-[11px] text-white/40">{r.team_name}</div>}
                                  </div>
                                </div>
                                <span
                                  className="text-sm font-bold"
                                  style={{
                                    fontVariantNumeric: "tabular-nums",
                                    color: r.is_target ? "#FDE68A" : undefined,
                                  }}
                                >
                                  {r.finals_time_text}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="mt-5 text-center">
                <p className="mb-3 text-xs text-white/50">
                  We found {state.result.totalEventsFound} event{state.result.totalEventsFound === 1 ? "" : "s"} and{" "}
                  {state.result.totalResultsFound} result{state.result.totalResultsFound === 1 ? "" : "s"} for{" "}
                  {state.result.swimmerName.split(" ")[0]}.
                </p>
                <button type="button" onClick={handleSeeFullHistory} className="btn-block">
                  Track {state.result.swimmerName.split(" ")[0]} with Natrix →
                </button>
                <p className="mt-2 text-[11px] text-white/40">
                  Unlock her complete swimming history, progress and automatic result tracking.
                </p>
                <Link
                  href={`/swimmer/${slugify(state.result.swimmerName)}`}
                  className="mt-3 inline-block text-xs font-semibold"
                  style={{ color: "#FDE68A" }}
                >
                  View shareable page →
                </Link>
              </div>
            </div>

            <AddToHomeScreenPrompt show={true} />
          </>
        )}
      </div>
    </div>
  );
}
