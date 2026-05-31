"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultRow = {
  id: number;
  event: string;
  course: string;
  time_ms: number;
  place: number | null;
  swam_at: string | null;
  swimmer_id: number;
  swimmer_name: string;
  swim_club: string | null;
  is_pb: boolean;
};

type EventGroup = {
  event: string;
  course: string;
  results: ResultRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatCourseFull(course: string | null): string {
  if (!course) return "";
  if (course === "SCM") return "Short Course · Metres";
  if (course === "LCM") return "Long Course · Metres";
  if (course === "SCY") return "Short Course · Yards";
  return course;
}

const STROKE_ORDER = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM", "Other"];

function getStroke(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breaststroke") || e.includes("breast")) return "Breaststroke";
  if (e.includes("backstroke") || e.includes("back")) return "Backstroke";
  if (e.includes("butterfly") || e.includes("fly")) return "Butterfly";
  if (e.includes("freestyle") || e.includes("free")) return "Freestyle";
  if (e.includes("medley") || e.endsWith(" im") || e === "im") return "IM";
  return "Other";
}

function getDistance(event: string): number {
  const m = event.match(/\d+/);
  return m ? Number(m[0]) : 9999;
}

// ─── Place badge ──────────────────────────────────────────────────────────────

function PlaceBadge({ place, rank }: { place: number | null; rank: number }) {
  const displayNum = place ?? rank;

  const PLACE_STYLES: Record<number, { bg: string; border: string; color: string }> = {
    1: { bg: "rgba(234,179,8,0.18)",   border: "rgba(253,230,138,0.4)",  color: "#FDE68A" },
    2: { bg: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.35)", color: "#CBD5E1" },
    3: { bg: "rgba(180,100,50,0.18)",  border: "rgba(180,100,50,0.4)",   color: "#FDBA74" },
  };

  const s = PLACE_STYLES[displayNum] ?? {
    bg: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.38)",
  };

  return (
    <div style={{
      width: "26px",
      height: "26px",
      borderRadius: "8px",
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.color,
      fontSize: "11px",
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      {displayNum}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MeetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetName = decodeURIComponent(params.slug as string);

  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [meetDate, setMeetDate] = useState<string | null>(null);
  const [course, setCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (meetName) void load();
  }, [meetName]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    // ── 1. Get all swimmers for this user ─────────────────────────────────────
    const { data: swimmers } = await supabase
      .from("swimmers")
      .select("id, name, swim_club");

    const swimmerMap = new Map<number, { name: string; swim_club: string | null }>();
    for (const s of (swimmers ?? []) as { id: number; name: string; swim_club: string | null }[]) {
      swimmerMap.set(s.id, { name: s.name, swim_club: s.swim_club ?? null });
    }

    const swimmerIds = Array.from(swimmerMap.keys());
    if (swimmerIds.length === 0) { setLoading(false); return; }

    // ── 2. Get all times for this specific meet ───────────────────────────────
    const { data: meetTimes } = await supabase
      .from("swim_times")
      .select("id, event, course, time_ms, place, swam_at, swimmer_id")
      .in("swimmer_id", swimmerIds)
      .eq("meet_name", meetName);

    const meetTimesArr = (meetTimes ?? []) as {
      id: number; event: string; course: string; time_ms: number;
      place: number | null; swam_at: string | null; swimmer_id: number;
    }[];

    if (meetTimesArr.length === 0) { setLoading(false); return; }

    // ── 3. Build PB map from ALL times (to flag PBs correctly) ───────────────
    const { data: allTimes } = await supabase
      .from("swim_times")
      .select("swimmer_id, event, course, time_ms")
      .in("swimmer_id", swimmerIds);

    const pbMap = new Map<string, number>(); // key: "swimmerId|event|course" → best ms ever
    for (const t of (allTimes ?? []) as { swimmer_id: number; event: string; course: string; time_ms: number }[]) {
      const key = `${t.swimmer_id}|${t.event}|${t.course}`;
      const existing = pbMap.get(key);
      if (!existing || t.time_ms < existing) pbMap.set(key, t.time_ms);
    }

    // ── 4. Set meet metadata from first row ───────────────────────────────────
    const firstRow = meetTimesArr[0];
    setMeetDate(firstRow.swam_at);
    setCourse(firstRow.course);

    // ── 5. Build ResultRow array ──────────────────────────────────────────────
    const rows: ResultRow[] = meetTimesArr.map((t) => {
      const sw = swimmerMap.get(t.swimmer_id);
      const pbKey = `${t.swimmer_id}|${t.event}|${t.course}`;
      const bestEver = pbMap.get(pbKey);
      return {
        id: t.id,
        event: t.event,
        course: t.course,
        time_ms: t.time_ms,
        place: t.place,
        swam_at: t.swam_at,
        swimmer_id: t.swimmer_id,
        swimmer_name: sw?.name ?? "Unknown",
        swim_club: sw?.swim_club ?? null,
        is_pb: bestEver === t.time_ms,
      };
    });

    // ── 6. Group by event + course ────────────────────────────────────────────
    const groupMap = new Map<string, EventGroup>();
    for (const row of rows) {
      const key = `${row.event}|${row.course}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { event: row.event, course: row.course, results: [] });
      }
      groupMap.get(key)!.results.push(row);
    }

    // ── 7. Sort groups: stroke order → distance ───────────────────────────────
    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
      const sA = STROKE_ORDER.indexOf(getStroke(a.event));
      const sB = STROKE_ORDER.indexOf(getStroke(b.event));
      if (sA !== sB) return sA - sB;
      return getDistance(a.event) - getDistance(b.event);
    });

    // ── 8. Sort results within each group by time asc ─────────────────────────
    for (const g of sortedGroups) {
      g.results.sort((a, b) => a.time_ms - b.time_ms);
    }

    setGroups(sortedGroups);
    setLoading(false);
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app">
          <div className="pt-2">
            <button
              type="button"
              onClick={() => router.push("/meets")}
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Meets
            </button>
          </div>
          <p className="muted">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => router.push("/meets")}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Meets
          </button>

          <h1 className="text-2xl font-bold tracking-tight text-white leading-snug">
            {meetName}
          </h1>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {meetDate && (
              <span style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "20px",
                padding: "3px 10px",
                fontSize: "11px",
                color: "rgba(255,255,255,0.55)",
                fontWeight: 500,
              }}>
                {formatDate(meetDate)}
              </span>
            )}
            {course && (
              <span style={{
                background: "rgba(217,119,6,0.15)",
                border: "1px solid rgba(253,230,138,0.22)",
                borderRadius: "20px",
                padding: "3px 10px",
                fontSize: "11px",
                color: "#FDE68A",
                fontWeight: 600,
              }}>
                {formatCourseFull(course)}
              </span>
            )}
          </div>
        </div>

        {/* Empty */}
        {groups.length === 0 ? (
          <div
            className="rounded-3xl p-8 text-center"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <p style={{ color: "rgba(255,255,255,0.45)" }}>No results found for this meet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {groups.map((group) => (
              <div key={`${group.event}|${group.course}`}>

                {/* Event label */}
                <p style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.35)",
                  marginBottom: "8px",
                  paddingLeft: "2px",
                }}>
                  {group.event}
                </p>

                {/* Result rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {group.results.map((r, idx) => (
                    <div
                      key={r.id}
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.09)",
                        borderRadius: "14px",
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      {/* Place badge (scanned place) or positional rank (1-based within group) */}
                      <PlaceBadge place={r.place} rank={idx + 1} />

                      {/* Name + club */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#fff",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {r.swimmer_name}
                          </span>
                          {r.is_pb && (
                            <span style={{
                              fontSize: "9px",
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              background: "rgba(217,119,6,0.25)",
                              color: "#FDE68A",
                              borderRadius: "5px",
                              padding: "2px 5px",
                              flexShrink: 0,
                            }}>
                              PB
                            </span>
                          )}
                        </div>
                        {r.swim_club && (
                          <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "1px" }}>
                            {r.swim_club}
                          </p>
                        )}
                      </div>

                      {/* Time */}
                      <span style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#FDE68A",
                        fontVariantNumeric: "tabular-nums",
                        flexShrink: 0,
                      }}>
                        {formatMs(r.time_ms)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}