"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  swimmerName: string; // as stored, e.g. "Tan, Alex"
  team: string | null;
  age: number | null;
  event: string;
  timeText: string | null;
  timeMs: number | null;
  place: number | null;
};

type EventGroup = { event: string; results: Result[] };

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
    swimmerName: toStr(pick(row, ["swimmer_name", "name"])) ?? "Unknown",
    team: toStr(pick(row, ["team_name", "team", "club"])),
    age: toNum(pick(row, ["swimmer_age", "age"])),
    event: toStr(pick(row, ["event_name", "event"])) ?? "Event",
    timeText: toStr(pick(row, ["finals_time_text", "time_text", "final_time_text"])),
    timeMs: toNum(pick(row, ["finals_time_ms", "time_ms"])),
    place: toNum(pick(row, ["finals_place", "place", "finals_rank", "rank"])),
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

function placeStyle(place: number | null): { bg: string; border: string; color: string } {
  if (place === 1) return { bg: "#FEF3C7", border: "#FDE68A", color: "#B45309" };
  if (place === 2) return { bg: "#F1F5F9", border: "#E2E8F0", color: "#64748B" };
  if (place === 3) return { bg: "#FFEDD5", border: "#FED7AA", color: "#C2410C" };
  return { bg: "#F7FAFC", border: "#E1EDF5", color: "#9FB3C6" };
}

function sortResults(a: Result, b: Result): number {
  if (a.place != null && b.place != null && a.place !== b.place) return a.place - b.place;
  if (a.place != null && b.place == null) return -1;
  if (a.place == null && b.place != null) return 1;
  if (a.timeMs != null && b.timeMs != null) return a.timeMs - b.timeMs;
  if (a.timeMs != null) return -1;
  if (b.timeMs != null) return 1;
  return a.swimmerName.localeCompare(b.swimmerName);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AllMeetDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const meetId = decodeURIComponent(String(params?.id ?? ""));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meetName, setMeetName] = useState("");
  const [meetDate, setMeetDate] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  const [swimmerQuery, setSwimmerQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");

  // follow state, keyed by "name|team"
  const [followingKey, setFollowingKey] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [followError, setFollowError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const [infoRes, resultsRes] = await Promise.all([
        supabase.rpc("get_meet_info", { p_meet_id: meetId }),
        supabase.rpc("get_meet_results", { p_meet_id: meetId }),
      ]);
      if (cancelled) return;

      if (resultsRes.error) {
        setError("Couldn't load this meet right now. Please try again.");
        setLoading(false);
        return;
      }

      const info = ((infoRes.data ?? []) as { meet_name: string; start_date: string | null }[])[0];
      setMeetName(info?.meet_name ?? "Meet");
      setMeetDate(info?.start_date ?? null);
      setResults(((resultsRes.data ?? []) as RawRow[]).map(normalise));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [meetId, router]);

  const events = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) set.add(r.event);
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [results]);

  const groups: EventGroup[] = useMemo(() => {
    const words = swimmerQuery.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const map = new Map<string, Result[]>();
    for (const r of results) {
      if (eventFilter !== "all" && r.event !== eventFilter) continue;
      if (words.length > 0) {
        const hay = r.swimmerName.toLowerCase();
        if (!words.every((w) => hay.includes(w))) continue;
      }
      if (!map.has(r.event)) map.set(r.event, []);
      map.get(r.event)!.push(r);
    }
    return Array.from(map.entries())
      .map(([event, list]) => ({ event, results: [...list].sort(sortResults) }))
      .sort((a, b) => a.event.localeCompare(b.event, undefined, { numeric: true }));
  }, [results, swimmerQuery, eventFilter]);

  const swimmerCount = useMemo(
    () => new Set(results.map((r) => r.swimmerName)).size,
    [results]
  );

  async function follow(r: Result) {
    if (!r.team) return;
    const key = `${r.swimmerName}|${r.team}`;
    setFollowingKey(key);
    setFollowError("");
    try {
      const res = await fetch("/api/follow-result-swimmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swimmerName: r.swimmerName, teamName: r.team, age: r.age }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setFollowError(json?.error ?? "Couldn't follow that swimmer. Please try again.");
      } else {
        setFollowed((prev) => ({ ...prev, [key]: true }));
      }
    } catch {
      setFollowError("Couldn't follow that swimmer. Please check your connection.");
    }
    setFollowingKey(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="shell">
      <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      <div className="container-app space-y-4">

        {/* Header */}
        <div className="pt-2">
          <Link href="/meets" style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>
            ← Meets
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white" style={{ lineHeight: 1.15 }}>
            {loading ? "Loading…" : meetName}
          </h1>
          {!loading && !error && (
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", marginTop: "4px" }}>
              {[formatDate(meetDate), `${swimmerCount} swimmers`, `${results.length} results`]
                .filter(Boolean).join(" · ")}
            </p>
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
            <p className="font-semibold" style={{ color: INK }}>No results in this meet yet</p>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>Check back after the next update.</p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            {/* Filters */}
            <div style={{ ...CARD, borderRadius: "18px", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" stroke={INK} strokeWidth="2" />
                  <path d="M16 16L21 21" stroke={INK} strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={swimmerQuery}
                  onChange={(e) => setSwimmerQuery(e.target.value)}
                  placeholder="Find a swimmer in this meet…"
                  style={{
                    flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
                    padding: "6px 0", fontSize: "15px", color: INK,
                  }}
                />
              </div>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "12px",
                  border: "1px solid #E1EDF5", background: "#F7FAFC",
                  fontSize: "13px", fontWeight: 600, color: INK,
                }}
              >
                <option value="all">All events</option>
                {events.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

            {followError && (
              <p style={{ fontSize: "13px", color: "#FCA5A5", padding: "2px 4px" }}>{followError}</p>
            )}

            {groups.length === 0 ? (
              <div className="rounded-[28px] p-8 text-center" style={CARD}>
                <div style={{ fontSize: "32px", marginBottom: "10px" }}>🔎</div>
                <p className="font-semibold" style={{ color: INK }}>No matching swimmers</p>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>Try a different spelling or clear the event filter.</p>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.event} className="rounded-[22px] p-4" style={CARD}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: INK, marginBottom: "10px" }}>{g.event}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {g.results.map((r) => {
                      const key = `${r.swimmerName}|${r.team ?? ""}`;
                      const isFollowed = followed[key];
                      const busy = followingKey === key;
                      const ps = placeStyle(r.place);
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
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: "13px", fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {displayName(r.swimmerName)}
                            </p>
                            <p style={{ fontSize: "10px", color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {[r.team, r.age != null ? `Age ${r.age}` : null].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <span style={{ fontSize: "13px", fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                            {r.timeText ?? (r.timeMs != null ? formatMs(r.timeMs) : "—")}
                          </span>
                          {r.team && (
                            <button
                              type="button"
                              disabled={busy || isFollowed}
                              onClick={() => follow(r)}
                              style={{
                                flexShrink: 0, padding: "6px 10px", borderRadius: "999px",
                                fontSize: "11px", fontWeight: 700, cursor: busy || isFollowed ? "default" : "pointer",
                                border: isFollowed ? "1px solid #BBF7D0" : "none",
                                background: isFollowed ? "#DCFCE7" : ACCENT,
                                color: isFollowed ? "#15803D" : "#fff",
                                opacity: busy ? 0.6 : 1,
                              }}
                            >
                              {isFollowed ? "Following ✓" : busy ? "…" : "Follow"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
