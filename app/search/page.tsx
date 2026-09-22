"use client";

import { useEffect, useState } from "react";
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

  // Public Search only: hide the signed-in bottom nav without changing BottomNav.tsx.
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "natrix-search-hide-bottom-nav";
    style.textContent = "nav.fixed { display: none !important; }";
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);
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
      <div className="container-app md:max-w-4xl md:px-8">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 pb-5">
          <Link href="/search" className="flex items-center gap-3">
            <img
              src="/natrix-favicon.svg"
              alt="Natrix"
              className="h-10 w-10 object-contain"
            />
            <div>
              <div className="text-xl font-bold tracking-tight text-white">Natrix</div>
              <div className="text-[10px] text-white/40">Swim Smarter Together</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white/80"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full px-4 py-2 text-xs font-bold text-white"
              style={{ background: "#1688E8" }}
            >
              Sign up
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden pb-6 pt-2 md:grid md:grid-cols-[0.9fr_1.1fr] md:items-center md:gap-8 md:pb-8">
          <div className="relative mx-auto mb-2 flex h-[190px] max-w-[300px] items-end justify-center md:mb-0 md:h-[300px]">
            <img
              src="/natrix-mascot-search.png"
              alt="Natrix swim mascot"
              className="relative z-10 h-full w-full object-contain object-bottom"
              onError={(event) => {
                event.currentTarget.src = "/natrix-favicon.svg";
                event.currentTarget.className =
                  "relative z-10 h-28 w-28 self-center object-contain opacity-90";
              }}
            />
            <div
              aria-hidden="true"
              className="absolute bottom-3 left-1/2 h-12 w-[80%] -translate-x-1/2 rounded-[50%] blur-2xl"
              style={{ background: "rgba(103,214,255,0.22)" }}
            />
          </div>

          <div className="text-center md:text-left">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-200/80">
              Singapore swim results
            </p>

            <h1 className="text-[36px] font-bold leading-[1.02] tracking-[-0.04em] text-white md:text-5xl">
              Find your swimmer
            </h1>

            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/65 md:mx-0 md:text-base">
              Search real meet results, personal bests and race context. No account needed.
            </p>

            <form
              onSubmit={handleSearch}
              className="mx-auto mt-5 flex max-w-xl gap-2 rounded-[22px] p-2 md:mx-0"
              style={{
                background: "rgba(255,255,255,0.96)",
                border: "1px solid rgba(255,255,255,0.9)",
                boxShadow: "0 16px 36px rgba(0,25,50,0.22)",
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" stroke="#12385F" strokeWidth="2" />
                  <path d="M16 16L21 21" stroke="#12385F" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter swimmer name..."
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent py-3 text-[15px] outline-none"
                  style={{ color: "#0C2C50" }}
                />
              </div>

              <button
                type="submit"
                disabled={loading || query.trim().length < 2}
                className="rounded-[17px] px-5 py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#2B9CF3,#0871D8)" }}
              >
                {loading ? "…" : "Search"}
              </button>
            </form>

            <p className="mt-3 text-[11px] leading-relaxed text-white/35">
              Singapore Aquatics-sanctioned meets currently supported. Club-only and non-sanctioned meets are not included yet.
            </p>
          </div>
        </section>

        {/* Guest value */}
        {!state && !loading && (
          <section
            className="grid grid-cols-3 gap-2 rounded-[26px] p-3 md:gap-4 md:p-4"
            style={{
              background: "rgba(255,255,255,0.93)",
              border: "1px solid rgba(255,255,255,0.84)",
              boxShadow: "0 14px 34px rgba(0,30,60,0.14)",
            }}
          >
            {[
              { icon: "▤", title: "Real Results", text: "Official times and PBs" },
              { icon: "▥", title: "Race Context", text: "Placing and nearby swimmers" },
              { icon: "✦", title: "Natrix Insight", text: "A simple read on the swim" },
            ].map((item) => (
              <div key={item.title} className="px-1 py-3 text-center md:px-4">
                <div
                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-base font-bold"
                  style={{ background: "#E8F6FF", color: "#0B79D8" }}
                >
                  {item.icon}
                </div>
                <div className="mt-2 text-[11px] font-bold md:text-sm" style={{ color: "#0A2D5D" }}>
                  {item.title}
                </div>
                <div className="mt-1 text-[9px] leading-snug md:text-[11px]" style={{ color: "#697E93" }}>
                  {item.text}
                </div>
              </div>
            ))}
          </section>
        )}

        {loading && (
          <div
            className="mt-6 rounded-[26px] px-5 py-8 text-center"
            style={{
              background: "rgba(255,255,255,0.94)",
              border: "1px solid rgba(255,255,255,0.84)",
              boxShadow: "0 14px 34px rgba(0,30,60,0.14)",
            }}
          >
            <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-sky-100 border-t-sky-600" />
            <p className="text-sm font-semibold" style={{ color: "#0B2A54" }}>
              Searching meet records…
            </p>
          </div>
        )}

        {!loading && state?.kind === "notFound" && (
          <div
            className="mt-6 rounded-[26px] p-6 text-center"
            style={{
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 14px 34px rgba(0,30,60,0.14)",
            }}
          >
            <div className="text-3xl">🔎</div>
            <h2 className="mt-2 text-lg font-bold" style={{ color: "#0B2A54" }}>
              No results for &ldquo;{searchedFor}&rdquo;
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed" style={{ color: "#6A7E94" }}>
              Try the swimmer&apos;s full name. We currently track selected Singapore Aquatics meets from 2026 onward.
            </p>
          </div>
        )}

        {!loading && state?.kind === "picking" && (
          <div
            className="mt-6 rounded-[26px] p-5 md:p-6"
            style={{
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 14px 34px rgba(0,30,60,0.14)",
            }}
          >
            <h2 className="text-lg font-bold" style={{ color: "#0B2A54" }}>
              Which swimmer did you mean?
            </h2>
            <p className="mb-4 mt-1 text-xs" style={{ color: "#6A7E94" }}>
              {state.totalMatches > state.candidates.length
                ? `Showing ${state.candidates.length} of ${state.totalMatches} matches. Add a first name to narrow it down.`
                : "Tap the right swimmer to see their results."}
            </p>

            <div className="flex flex-col gap-2">
              {state.candidates.map((c) => (
                <button
                  key={c.swimmer_name}
                  type="button"
                  onClick={() => handlePickCandidate(c.swimmer_name)}
                  className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition active:scale-[0.99]"
                  style={{ background: "#F3F9FD", border: "1px solid #DCECF5" }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold" style={{ color: "#0B2A54" }}>
                      {toDisplayName(c.swimmer_name)}
                    </div>
                    {c.team_name && (
                      <div className="truncate text-xs" style={{ color: "#71849A" }}>
                        {c.team_name}
                      </div>
                    )}
                  </div>
                  <span className="ml-3 text-xs font-bold" style={{ color: "#0876DC" }}>
                    View →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && state?.kind === "found" && (
          <>
            <section
              className="mt-6 overflow-hidden rounded-[28px]"
              style={{
                background: "rgba(250,253,255,0.97)",
                border: "1px solid rgba(255,255,255,0.88)",
                boxShadow: "0 18px 44px rgba(0,30,60,0.18)",
              }}
            >
              <div className="p-5 md:p-6">
                <div
                  className="inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: "#E8F8F0", color: "#11835B" }}
                >
                  ✓ Match found
                </div>

                <h2 className="mt-3 text-2xl font-bold tracking-tight" style={{ color: "#0B2A54" }}>
                  {state.result.swimmerName}
                </h2>

                {state.result.team && (
                  <p className="mt-0.5 text-sm" style={{ color: "#65788D" }}>
                    {state.result.team}
                  </p>
                )}

                <div
                  className="mt-4 rounded-2xl px-4 py-3"
                  style={{ background: "#EDF8FE", border: "1px solid #D8ECF7" }}
                >
                  <div className="text-sm font-bold" style={{ color: "#143B67" }}>
                    {state.result.headline.event}
                  </div>
                  {state.result.headline.personalBest && (
                    <div className="mt-1 text-[11px]" style={{ color: "#73869A" }}>
                      {state.result.headline.personalBest.meet}
                      {formatDate(state.result.headline.personalBest.date) &&
                        ` · ${formatDate(state.result.headline.personalBest.date)}`}
                    </div>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  {state.result.headline.personalBest && (
                    <div
                      className="rounded-2xl p-4"
                      style={{ background: "#F5FAFD", border: "1px solid #E0ECF3" }}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#71849A" }}>
                        Personal Best
                      </div>
                      <div
                        className="mt-1 text-3xl font-bold"
                        style={{ color: "#0B2A54", fontVariantNumeric: "tabular-nums" }}
                      >
                        {state.result.headline.personalBest.time}
                      </div>

                      {(() => {
                        const distance = parseDistanceMeters(state.result.headline.event);
                        const ms = state.result.headline.personalBest?.ms;
                        if (!distance || !ms) return null;
                        const speed = (distance / (ms / 1000)).toFixed(2);
                        const first = state.result.leaderboard?.find((r) => r.is_first);
                        const gapToFirst =
                          first && !first.is_target ? formatGap(ms - first.finals_time_ms) : null;

                        return (
                          <div className="mt-2 text-[11px] leading-relaxed" style={{ color: "#6C8095" }}>
                            <div>Avg speed {speed} m/s</div>
                            {gapToFirst && <div>{gapToFirst}s behind 1st place</div>}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {state.result.leaderboard && state.result.leaderboard.some((r) => r.is_target) && (
                    <div
                      className="rounded-2xl p-4"
                      style={{ background: "#F5FAFD", border: "1px solid #E0ECF3" }}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#71849A" }}>
                        Placing
                      </div>
                      <div
                        className="mt-1 text-3xl font-bold"
                        style={{ color: "#0B2A54", fontVariantNumeric: "tabular-nums" }}
                      >
                        {ordinal(state.result.leaderboard.find((r) => r.is_target)!.place)}
                      </div>
                      <div className="mt-2 text-[11px]" style={{ color: "#6C8095" }}>
                        of {state.result.leaderboard[0].total_entrants} swimmers
                      </div>
                    </div>
                  )}

                  {!state.result.headline.isSameSwim && state.result.headline.mostRecent && (
                    <div
                      className="col-span-2 rounded-2xl p-4"
                      style={{ background: "#F5FAFD", border: "1px solid #E0ECF3" }}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#71849A" }}>
                        Most Recent
                      </div>
                      <div
                        className="mt-1 text-2xl font-bold"
                        style={{ color: "#0B2A54", fontVariantNumeric: "tabular-nums" }}
                      >
                        {state.result.headline.mostRecent.time}
                      </div>
                      <div className="text-[11px]" style={{ color: "#6C8095" }}>
                        {state.result.headline.mostRecent.meet}
                        {formatDate(state.result.headline.mostRecent.date) &&
                          ` · ${formatDate(state.result.headline.mostRecent.date)}`}
                      </div>
                    </div>
                  )}
                </div>

                {state.result.insight && (
                  <div
                    className="mt-4 rounded-2xl px-4 py-3"
                    style={{ background: "#FFF4D6", border: "1px solid #F0D57D" }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#976500" }}>
                      Natrix noticed 👀
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-relaxed" style={{ color: "#493500" }}>
                      {state.result.insight}
                    </p>
                  </div>
                )}
              </div>

              {state.result.leaderboard && (
                <div className="border-t px-5 py-5 md:px-6" style={{ borderColor: "#DDEAF2" }}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-bold" style={{ color: "#0B2A54" }}>
                      How they stacked up
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#92A0AF" }}>
                      Race context
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {state.result.leaderboard.map((r, i) => (
                      <div key={`${r.swimmer_name}-${r.place}`}>
                        {i > 0 && r.place - state.result.leaderboard![i - 1].place > 1 && (
                          <div className="py-0.5 text-center text-xs" style={{ color: "#A5B1BC" }}>
                            ···
                          </div>
                        )}

                        <div
                          className="flex items-center justify-between rounded-xl px-3 py-2"
                          style={
                            r.is_target
                              ? { background: "#FFF5D8", border: "1px solid #F0D267" }
                              : { background: "#F6FAFC", border: "1px solid #E7EEF3" }
                          }
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="w-6 flex-shrink-0 text-xs font-bold" style={{ color: "#74869A" }}>
                              #{r.place}
                            </span>
                            <div className="min-w-0">
                              <div
                                className="truncate text-sm font-semibold"
                                style={{ color: r.is_target ? "#493500" : "#173D66" }}
                              >
                                {toDisplayName(r.swimmer_name)}
                                {r.is_target && (
                                  <span className="ml-2 text-[9px] font-bold uppercase" style={{ color: "#9A6900" }}>
                                    Your swimmer
                                  </span>
                                )}
                              </div>
                              {r.team_name && (
                                <div className="truncate text-[10px]" style={{ color: "#8A98A7" }}>
                                  {r.team_name}
                                </div>
                              )}
                            </div>
                          </div>

                          <span
                            className="ml-3 text-sm font-bold"
                            style={{
                              color: r.is_target ? "#9A6900" : "#173D66",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {r.finals_time_text}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="border-t px-5 py-5 text-center md:px-6"
                style={{
                  borderColor: "#DDEAF2",
                  background: "linear-gradient(135deg,#EAF7FF,#FAFDFF)",
                }}
              >
                <p className="text-xs" style={{ color: "#647A91" }}>
                  We found {state.result.totalEventsFound} event{state.result.totalEventsFound === 1 ? "" : "s"} and{" "}
                  {state.result.totalResultsFound} result{state.result.totalResultsFound === 1 ? "" : "s"} for{" "}
                  {state.result.swimmerName.split(" ")[0]}.
                </p>

                <button
                  type="button"
                  onClick={handleSeeFullHistory}
                  className="mt-3 w-full rounded-2xl py-3.5 text-sm font-bold text-white transition active:scale-[0.99]"
                  style={{
                    background: "linear-gradient(135deg,#2B9CF3,#0871D8)",
                    boxShadow: "0 8px 20px rgba(0,106,220,0.2)",
                  }}
                >
                  Track {state.result.swimmerName.split(" ")[0]} with Natrix →
                </button>

                <p className="mx-auto mt-2 max-w-sm text-[11px] leading-relaxed" style={{ color: "#73869A" }}>
                  Create a free account for saved swimmers, progress, comparisons and automatic result updates.
                </p>

                <Link
                  href={`/swimmer/${slugify(state.result.swimmerName)}`}
                  className="mt-3 inline-block text-xs font-bold"
                  style={{ color: "#0876DC" }}
                >
                  View shareable page →
                </Link>
              </div>
            </section>

            <AddToHomeScreenPrompt show={true} />
          </>
        )}

        {!state && !loading && (
          <section
            className="mt-6 overflow-hidden rounded-[28px] px-5 py-5 md:flex md:items-center md:justify-between md:gap-6 md:px-7"
            style={{
              background: "linear-gradient(135deg,rgba(225,247,255,0.96),rgba(245,252,255,0.98))",
              border: "1px solid rgba(255,255,255,0.88)",
              boxShadow: "0 14px 34px rgba(0,30,60,0.13)",
            }}
          >
            <div>
              <div className="text-lg font-bold" style={{ color: "#0B2A54" }}>
                Track your swimmer with Natrix
              </div>
              <p className="mt-1 max-w-lg text-xs leading-relaxed" style={{ color: "#61788F" }}>
                Search first. Sign up when you want saved swimmers, progress, comparisons and automatic result alerts.
              </p>
            </div>

            <Link
              href="/signup"
              className="mt-4 inline-flex rounded-full px-5 py-3 text-sm font-bold text-white md:mt-0 md:flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#2B9CF3,#0871D8)" }}
            >
              Sign up free →
            </Link>
          </section>
        )}

        <footer className="pb-2 pt-7 text-center text-[10px] leading-relaxed text-white/30">
          Natrix · Singapore · Built for swim families
        </footer>
      </div>
    </div>
  );
}
