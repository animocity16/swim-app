// app/demo/meets/[slug]/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { DEMO_TIMES, DEMO_SWIMMERS, formatDate, getInitials } from "@/lib/demoData";
import { calcFinaPoints } from "@/lib/finaPoints";

const STROKE_ORDER = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];

function getStroke(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breast")) return "Breaststroke";
  if (e.includes("back")) return "Backstroke";
  if (e.includes("fly")) return "Butterfly";
  if (e.includes("free")) return "Freestyle";
  if (e.includes("im")) return "IM";
  return "Other";
}

function getDistance(event: string): number {
  const m = event.match(/\d+/);
  return m ? Number(m[0]) : 9999;
}

const AVATAR = [
  { bg: "#854F0B", text: "#FAC775" },
  { bg: "#185FA5", text: "#B5D4F4" },
  { bg: "#0F6E56", text: "#9FE1CB" },
  { bg: "#72243E", text: "#F4C0D1" },
  { bg: "#3C3489", text: "#CECBF6" },
];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const RANK_STYLES: Record<number, { bg: string; border: string; numColor: string }> = {
  1: { bg: "rgba(234,179,8,0.15)",   border: "rgba(234,179,8,0.4)",    numColor: "#FDE68A" },
  2: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)",  numColor: "#CBD5E1" },
  3: { bg: "rgba(180,100,50,0.15)",  border: "rgba(180,100,50,0.35)",  numColor: "#FDBA74" },
};

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2);
}

type ResultRow = {
  id: number;
  event: string;
  swimmer_id: number;
  swimmer_name: string;
  swim_club: string;
  time_ms: number;
  is_pb?: boolean;
  fina_points: number | null;
};

export default function DemoMeetDetailPage() {
  const params = useParams();
  const raw = params?.slug;
  const meetName = decodeURIComponent(typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "");
  const [expandedSwimmerId, setExpandedSwimmerId] = useState<number | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(true);

  const swimmerById = useMemo(() => new Map(DEMO_SWIMMERS.map((s) => [s.id, s])), []);

  const rows: ResultRow[] = useMemo(() => {
    return DEMO_TIMES.filter((t) => t.meet_name === meetName).map((t) => {
      const sw = swimmerById.get(t.swimmer_id);
      return {
        id: t.id,
        event: t.event,
        swimmer_id: t.swimmer_id,
        swimmer_name: sw?.name ?? "Unknown",
        swim_club: sw?.swim_club ?? "",
        time_ms: t.time_ms,
        is_pb: t.is_pb,
        fina_points: calcFinaPoints(t.time_ms, t.event, t.course, sw?.gender ?? null),
      };
    });
  }, [meetName, swimmerById]);

  const groups = useMemo(() => {
    const byEvent = new Map<string, ResultRow[]>();
    for (const r of rows) {
      if (!byEvent.has(r.event)) byEvent.set(r.event, []);
      byEvent.get(r.event)!.push(r);
    }
    const arr = Array.from(byEvent.entries()).map(([event, results]) => ({
      event,
      results: [...results].sort((a, b) => a.time_ms - b.time_ms),
    }));
    return arr.sort((a, b) => {
      const sA = STROKE_ORDER.indexOf(getStroke(a.event));
      const sB = STROKE_ORDER.indexOf(getStroke(b.event));
      if (sA !== sB) return sA - sB;
      return getDistance(a.event) - getDistance(b.event);
    });
  }, [rows]);

  const leaderboard = useMemo(() => {
    const map = new Map<number, {
      swimmer_id: number; name: string; gold: number; silver: number; bronze: number;
      total_points: number; breakdown: { event: string; rank: number; points: number }[];
    }>();
    for (const g of groups) {
      g.results.forEach((r, idx) => {
        const rank = idx + 1;
        if (!map.has(r.swimmer_id)) {
          map.set(r.swimmer_id, { swimmer_id: r.swimmer_id, name: r.swimmer_name, gold: 0, silver: 0, bronze: 0, total_points: 0, breakdown: [] });
        }
        const e = map.get(r.swimmer_id)!;
        if (rank === 1) e.gold++;
        else if (rank === 2) e.silver++;
        else if (rank === 3) e.bronze++;
        if (r.fina_points != null) {
          e.total_points += r.fina_points;
          e.breakdown.push({ event: g.event, rank, points: r.fina_points });
        }
      });
    }
    return Array.from(map.values()).sort((a, b) => b.total_points - a.total_points);
  }, [groups]);

  const latestDate = rows.reduce<string | null>((acc, r) => {
    const t = DEMO_TIMES.find((x) => x.id === r.id);
    if (!t?.swam_at) return acc;
    return !acc || t.swam_at > acc ? t.swam_at : acc;
  }, null);

  if (rows.length === 0) {
    return (
      <div className="shell">
        <div className="container-app space-y-5">
          <Link href="/demo/meets" className="text-white/50 text-sm">← Meets</Link>
          <p className="text-white/50 text-sm">No results found for this meet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">
        <Link href="/demo/meets" className="flex items-center gap-2 text-white/50 text-sm pt-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Meets
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-white">{meetName}</h1>
          <p className="text-sm text-white/40 mt-1">{formatDate(latestDate)} · {rows.length} results</p>
        </div>

        {/* Top Performers leaderboard */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <button type="button" onClick={() => setLeaderboardOpen((v) => !v)}
            className="w-full flex items-center justify-between">
            <span className="text-sm font-bold text-white flex items-center gap-1.5">🏆 Top Performers</span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
              style={{ transform: leaderboardOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", opacity: 0.4 }}>
              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {leaderboardOpen && (
            <div className="mt-3 space-y-1.5">
              {leaderboard.map((entry, idx) => {
                const isOpen = expandedSwimmerId === entry.swimmer_id;
                return (
                  <div key={entry.swimmer_id} className="rounded-xl overflow-hidden"
                    style={{ background: idx === 0 ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.03)" }}>
                    <button type="button" onClick={() => setExpandedSwimmerId(isOpen ? null : entry.swimmer_id)}
                      className="w-full flex items-center gap-2.5 p-2.5 text-left">
                      <span className="text-[11px] font-bold text-white/30 w-4 flex-shrink-0">{idx + 1}</span>
                      <span className="text-sm font-semibold text-white flex-1 min-w-0 truncate">{entry.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {entry.gold > 0 && <span className="text-[11px] font-bold" style={{ color: "#FDE68A" }}>🥇{entry.gold}</span>}
                        {entry.silver > 0 && <span className="text-[11px] font-bold" style={{ color: "#CBD5E1" }}>🥈{entry.silver}</span>}
                        {entry.bronze > 0 && <span className="text-[11px] font-bold" style={{ color: "#FDBA74" }}>🥉{entry.bronze}</span>}
                        <span className="rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-white/40" style={{ background: "rgba(255,255,255,0.06)" }}>
                          {entry.total_points} pts
                        </span>
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"
                          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", opacity: 0.35 }}>
                          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-2.5 pb-2.5 pl-9 space-y-1.5">
                        {entry.breakdown.map((b, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <span className="text-white/55">{b.event}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-bold" style={{ color: b.rank <= 3 ? RANK_STYLES[b.rank].numColor : "rgba(255,255,255,0.4)" }}>
                                {b.rank === 1 ? "1st" : b.rank === 2 ? "2nd" : b.rank === 3 ? "3rd" : `${b.rank}th`}
                              </span>
                              <span className="text-white/60 font-semibold min-w-[48px] text-right">{b.points} pts</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Event groups */}
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.event}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">
                {g.event} <span className="text-white/20">· {g.results.length}</span>
              </p>
              <div className="space-y-1.5">
                {g.results.map((r, idx) => {
                  const rank = idx + 1;
                  const colors = AVATAR[DEMO_SWIMMERS.findIndex((s) => s.id === r.swimmer_id) % AVATAR.length];
                  const style = RANK_STYLES[rank];
                  return (
                    <div key={r.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                      style={style ? { background: style.bg, border: `1px solid ${style.border}` } : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <span className="w-5 text-center text-xs font-bold flex-shrink-0" style={{ color: style?.numColor ?? "rgba(255,255,255,0.35)" }}>
                        {MEDAL[rank] ?? rank}
                      </span>
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                        style={{ background: colors.bg, color: colors.text }}>
                        {getInitials(r.swimmer_name)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {r.swimmer_name}
                          {r.is_pb && (
                            <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(110,231,183,0.15)", color: "#6EE7B7" }}>PB</span>
                          )}
                        </p>
                        <p className="text-[10px] text-white/35 truncate">{r.swim_club}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-white">{formatMs(r.time_ms)}</p>
                        {r.fina_points != null && <p className="text-[10px] text-white/35">{r.fina_points} pts</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
