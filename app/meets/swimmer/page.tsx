"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// ─── Design tokens (same look as the rest of the app) ────────────────────────

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(255,255,255,0.9)",
  boxShadow: "0 10px 24px rgba(0,25,55,0.10)",
};
const INK = "#0B2A54";
const MUTED = "#71859A";
const ACCENT = "var(--natrix-font-colour, #168AE8)";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>;

type Result = {
  key: string;
  meetId: string | null;
  meetName: string;
  meetDate: string | null;
  event: string;
  timeText: string | null;
  timeMs: number | null;
  place: number | null;
  age: number | null;
  team: string | null;
};

type MeetGroup = {
  groupKey: string;
  meetId: string | null;
  meetName: string;
  meetDate: string | null;
  results: Result[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick(row: RawRow, keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function toStr(v: unknown): string | null {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function normalise(row: RawRow, i: number): Result {
  return {
    key: `${toStr(row.id) ?? i}-${i}`,
    meetId: toStr(row.meet_id),
    meetName: toStr(row._meet_name) ?? "Meet",
    meetDate: toStr(pick(row, ["_meet_date", "session_date"])),
    event: toStr(pick(row, ["event_name", "event"])) ?? "Event",
    timeText: toStr(pick(row, ["finals_time_text", "time_text", "final_time_text"])),
    timeMs: toNum(pick(row, ["finals_time_ms", "time_ms"])),
    place: toNum(pick(row, ["finals_place", "place", "finals_rank", "rank"])),
    age: toNum(pick(row, ["swimmer_age", "age"])),
    team: toStr(pick(row, ["team_name", "team", "club"])),
  };
}

// Meet results store names as "Last, First". Show "First Last".
function displayName(raw: string): string {
  const idx = raw.indexOf(",");
  const flipped = idx > -1 ? `${raw.slice(idx + 1).trim()} ${raw.slice(0, idx).trim()}` : raw.trim();
  return flipped.replace(/\s+/g, " ");
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2);
}

function timeOf(r: Result): string {
  return r.timeText ?? (r.timeMs != null ? formatMs(r.timeMs) : "—");
}

function placeStyle(place: number | null): { bg: string; border: string; color: string } {
  if (place === 1) return { bg: "#FEF3C7", border: "#FDE68A", color: "#B45309" };
  if (place === 2) return { bg: "#F1F5F9", border: "#E2E8F0", color: "#64748B" };
  if (place === 3) return { bg: "#FFEDD5", border: "#FED7AA", color: "#C2410C" };
  return { bg: "#F7FAFC", border: "#E1EDF5", color: "#9FB3C6" };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SwimmerLookupPage() {
  const router = useRouter();

  const [swimmerName, setSwimmerName] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  const [followState, setFollowState] = useState<"idle" | "busy" | "done">("idle");
  const [followMsg, setFollowMsg] = useState("");

  // Read ?name=…&team=… from the address bar once, in the browser.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const name = sp.get("name");
    if (!name) {
      router.replace("/meets?tab=all");
      return;
    }
    setSwimmerName(name);
    setTeamName(sp.get("team"));
  }, [router]);

  useEffect(() => {
    if (!swimmerName) return;
    let cancelled = false;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const { data, error: rpcError } = await supabase.rpc("get_swimmer_results", {
        p_swimmer_name: swimmerName,
        p_team_name: teamName,
      });
      if (cancelled) return;
      if (rpcError) {
        setError("Couldn't load this swimmer right now. Please try again.");
        setLoading(false);
        return;
      }
      setResults(((data ?? []) as RawRow[]).map(normalise));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [swimmerName, teamName, router]);

  // Results come back newest meet first, so the first age we see is the latest.
  const latestAge = useMemo(() => results.find((r) => r.age != null)?.age ?? null, [results]);
  const club = teamName ?? results.find((r) => r.team)?.team ?? null;

  // Fastest swim per event
  const bests = useMemo(() => {
    const map = new Map<string, Result>();
    for (const r of results) {
      if (r.timeMs == null) continue;
      const cur = map.get(r.event);
      if (!cur || r.timeMs < (cur.timeMs ?? Infinity)) map.set(r.event, r);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.event.localeCompare(b.event, undefined, { numeric: true })
    );
  }, [results]);

  const bestMsByEvent = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bests) if (b.timeMs != null) m.set(b.event, b.timeMs);
    return m;
  }, [bests]);

  // Results grouped by meet, newest first
  const meetGroups: MeetGroup[] = useMemo(() => {
    const map = new Map<string, MeetGroup>();
    for (const r of results) {
      const groupKey = r.meetId ?? r.meetName;
      if (!map.has(groupKey)) {
        map.set(groupKey, { groupKey, meetId: r.meetId, meetName: r.meetName, meetDate: r.meetDate, results: [] });
      }
      map.get(groupKey)!.results.push(r);
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      results: [...g.results].sort((a, b) => a.event.localeCompare(b.event, undefined, { numeric: true })),
    }));
  }, [results]);

  async function follow() {
    if (!swimmerName || !club) return;
    setFollowState("busy");
    setFollowMsg("");
    try {
      const res = await fetch("/api/follow-result-swimmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swimmerName, teamName: club, age: latestAge }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setFollowMsg(json?.error ?? "Couldn't follow that swimmer. Please try again.");
        setFollowState("idle");
      } else {
        setFollowState("done");
      }
    } catch {
      setFollowMsg("Couldn't follow that swimmer. Please check your connection.");
      setFollowState("idle");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="shell">
      <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      <div className="container-app space-y-4">

        {/* Header */}
        <div className="pt-2">
          <Link href="/meets?tab=all" style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>
            ← Search
          </Link>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginTop: "8px" }}>
            <div style={{ minWidth: 0 }}>
              <h1 className="text-2xl font-bold tracking-tight text-white" style={{ lineHeight: 1.15 }}>
                {swimmerName ? displayName(swimmerName) : "Loading…"}
              </h1>
              {!loading && !error && (
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", marginTop: "4px" }}>
                  {[club, latestAge != null ? `Age ${latestAge}` : null, `${results.length} results`, `${meetGroups.length} meets`]
                    .filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {!loading && !error && club && (
              <button
                type="button"
                onClick={follow}
                disabled={followState !== "idle"}
                style={{
                  flexShrink: 0, padding: "9px 16px", borderRadius: "999px",
                  fontSize: "12px", fontWeight: 700,
                  cursor: followState === "idle" ? "pointer" : "default",
                  border: followState === "done" ? "1px solid #BBF7D0" : "none",
                  background: followState === "done" ? "#DCFCE7" : ACCENT,
                  color: followState === "done" ? "#15803D" : "#fff",
                  opacity: followState === "busy" ? 0.6 : 1,
                }}
              >
                {followState === "done" ? "Following ✓" : followState === "busy" ? "…" : "Follow"}
              </button>
            )}
          </div>
          {followMsg && (
            <p style={{ fontSize: "13px", color: "#FCA5A5", marginTop: "8px" }}>{followMsg}</p>
          )}
        </div>

        {loading && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                height: "72px", background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(255,255,255,0.8)", borderRadius: "20px",
                animation: "pulse 2s ease-in-out infinite",
              }} />
            ))}
          </>
        )}

        {!loading && error && (
          <div className="rounded-[28px] p-8 text-center" style={CARD}>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>⚠️</div>
            <p className="font-semibold" style={{ color: INK }}>{error}</p>
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <div className="rounded-[28px] p-8 text-center" style={CARD}>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>🏊</div>
            <p className="font-semibold" style={{ color: INK }}>No results found</p>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>We couldn&apos;t find saved results for this swimmer.</p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            {/* Best times */}
            {bests.length > 0 && (
              <div className="rounded-[22px] p-4" style={CARD}>
                <p style={{ fontSize: "13px", fontWeight: 700, color: INK, marginBottom: "10px" }}>
                  ⚡ Best times
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {bests.map((b) => (
                    <div key={b.event} style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      background: "#F7FAFC", borderRadius: "12px", padding: "8px 10px",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "12.5px", fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {b.event}
                        </p>
                        <p style={{ fontSize: "10px", color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {[b.meetName, formatDate(b.meetDate)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span style={{ fontSize: "14px", fontWeight: 800, color: ACCENT, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                        {timeOf(b)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Every meet, newest first */}
            {meetGroups.map((g) => (
              <div key={g.groupKey} className="rounded-[22px] p-4" style={CARD}>
                <div style={{ marginBottom: "10px" }}>
                  {g.meetId ? (
                    <Link
                      href={`/meets/all/${encodeURIComponent(g.meetId)}`}
                      style={{ fontSize: "13px", fontWeight: 700, color: INK, textDecoration: "none" }}
                    >
                      {g.meetName} ›
                    </Link>
                  ) : (
                    <p style={{ fontSize: "13px", fontWeight: 700, color: INK }}>{g.meetName}</p>
                  )}
                  {formatDate(g.meetDate) && (
                    <p style={{ fontSize: "10.5px", color: MUTED, marginTop: "2px" }}>{formatDate(g.meetDate)}</p>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {g.results.map((r) => {
                    const ps = placeStyle(r.place);
                    const isBest = r.timeMs != null && bestMsByEvent.get(r.event) === r.timeMs;
                    return (
                      <div key={r.key} style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        background: "#F7FAFC", borderRadius: "12px", padding: "8px 10px",
                      }}>
                        <div style={{
                          width: "26px", height: "26px", borderRadius: "8px", flexShrink: 0,
                          background: ps.bg, border: `1px solid ${ps.border}`, color: ps.color,
                          fontSize: "11px", fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {r.place ?? "–"}
                        </div>
                        <p style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.event}
                        </p>
                        {isBest && (
                          <span style={{
                            fontSize: "8px", fontWeight: 700, letterSpacing: "0.06em",
                            background: "rgba(22,138,232,0.14)", color: ACCENT,
                            borderRadius: "5px", padding: "1px 5px", flexShrink: 0,
                          }}>BEST</span>
                        )}
                        <span style={{ fontSize: "13px", fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                          {timeOf(r)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
