"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { canonicalCourse, canonicalEventName, eventKey } from "@/lib/events";

type Props = { swimmerId: number; swimmerName: string };

type TimeRow = {
  id: number;
  event: string;
  course: string;
  time_ms: number;
  swam_at?: string | null;
  created_at?: string | null;
  meet_name?: string | null;
};

type EventSeries = {
  key: string;
  shortLabel: string;
  course: string;
  color: string;
  strokeColor: string;
  rows: TimeRow[];
  pb: number;
  first: number;
  deltaMs: number;
};

// ─── Stroke colours ───────────────────────────────────────────────────────────

function getStrokeColor(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breaststroke") || e.includes("breast")) return "#34D399";
  if (e.includes("backstroke") || e.includes("back")) return "#A78BFA";
  if (e.includes("butterfly") || e.includes("fly")) return "#FB923C";
  if (e.includes("freestyle") || e.includes("free")) return "#38BDF8";
  if (e.includes("medley") || e.includes("im")) return "#F472B6";
  return "#FDE68A";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2);
}

function formatDate(row: TimeRow): string {
  const d = row.swam_at ?? row.created_at;
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function getDateMs(row: TimeRow): number {
  const d = row.swam_at ?? row.created_at;
  return d ? new Date(d).getTime() : 0;
}

function shortEventName(event: string): string {
  return canonicalEventName(event)
    .replace("Freestyle", "Free").replace("Backstroke", "Back")
    .replace("Breaststroke", "Breast").replace("Butterfly", "Fly");
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function MiniSparkline({ rows, color, onTap, tappedRow }: {
  rows: TimeRow[]; color: string;
  onTap: (row: TimeRow | null) => void; tappedRow: TimeRow | null;
}) {
  const times = rows.map((r) => r.time_ms);
  if (times.length < 2) return null;
  const W = 300, H = 60, pad = 6;
  const min = Math.min(...times), max = Math.max(...times);
  const range = max - min || 1000;
  const pts = times.map((t, i) => ({
    x: pad + (i / (times.length - 1)) * (W - pad * 2),
    y: H - pad - ((max - t) / range) * (H - pad * 2),
    row: rows[i],
  }));
  const pathD = pts.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    const prev = pts[i - 1];
    const cpx = ((prev.x + p.x) / 2).toFixed(1);
    return `${d} C ${cpx} ${prev.y.toFixed(1)} ${cpx} ${p.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }, "");
  const fillD = `${pathD} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ overflow: "visible", touchAction: "manipulation" }}>
      <defs>
        <linearGradient id={`fg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#fg-${color.replace("#", "")})`} />
      <path d={pathD} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const isPB = p.row.time_ms === min;
        const isTapped = tappedRow?.id === p.row.id;
        const isLatest = i === pts.length - 1;
        return (
          <g key={p.row.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onTap(isTapped ? null : p.row); }}>
            <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
            {isTapped && <circle cx={p.x} cy={p.y} r={10} fill={color} opacity="0.15" />}
            {isPB && <circle cx={p.x} cy={p.y} r={8} fill="none" stroke={color} strokeWidth="1.2" opacity="0.4" />}
            {isLatest && !isPB && <circle cx={p.x} cy={p.y} r={7} fill="none" stroke={color} strokeWidth="1" opacity="0.3" />}
            <circle cx={p.x} cy={p.y}
              r={isTapped ? 6 : isPB || isLatest ? 4.5 : 3}
              fill={color} opacity={isTapped ? 1 : isPB || isLatest ? 0.9 : 0.5} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProgressTab({ swimmerId, swimmerName }: Props) {
  const [rows, setRows] = useState<TimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [tappedDots, setTappedDots] = useState<Record<string, TimeRow | null>>({});

  useEffect(() => { void loadTimes(); }, [swimmerId]);

  async function loadTimes() {
    setLoading(true);
    const { data } = await supabase
      .from("swim_times")
      .select("id, event, course, time_ms, swam_at, created_at, meet_name")
      .eq("swimmer_id", swimmerId)
      .order("created_at", { ascending: true });
    setRows((data as TimeRow[]) || []);
    setLoading(false);
  }

  const allSeries = useMemo<EventSeries[]>(() => {
    const map = new Map<string, TimeRow[]>();
    for (const row of rows) {
      const key = eventKey(canonicalEventName(row.event), canonicalCourse(row.course));
      const existing = map.get(key) || [];
      existing.push(row);
      map.set(key, existing);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([key, eventRows]) => {
        const sorted = [...eventRows].sort((a, b) => getDateMs(a) - getDateMs(b));
        const times = sorted.map((r) => r.time_ms);
        const pb = Math.min(...times);
        const first = times[0];
        const color = getStrokeColor(eventRows[0].event);
        return {
          key,
          shortLabel: shortEventName(eventRows[0].event),
          course: canonicalCourse(eventRows[0].course),
          color,
          strokeColor: color,
          rows: sorted,
          pb,
          first,
          deltaMs: first - pb,
        };
      });
  }, [rows]);

  const bestImprovement = useMemo(() => {
    return allSeries.filter((s) => s.deltaMs > 0).sort((a, b) => b.deltaMs - a.deltaMs)[0] ?? null;
  }, [allSeries]);

  function setTappedDot(key: string, row: TimeRow | null) {
    setTappedDots((prev) => ({ ...prev, [key]: row }));
  }

  if (loading) return <div className="py-4 text-center text-sm text-white/40">Loading…</div>;

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center">
        <p className="text-sm font-semibold text-white">No times yet</p>
        <p className="mt-1 text-xs text-white/40">Scan results to start tracking progress.</p>
      </div>
    );
  }

  const multiResultSeries = allSeries.filter((s) => s.rows.length >= 2);
  const singleResultSeries = allSeries.filter((s) => s.rows.length === 1);

  return (
    <div className="space-y-4">

      {/* Summary header */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
          {allSeries.length} event{allSeries.length === 1 ? "" : "s"} tracked
        </p>
        {multiResultSeries.length > 0 && (
          <p className="text-[10px] text-white/25">tap dots for details</p>
        )}
      </div>

      {/* Best improvement highlight */}
      {bestImprovement && (
        <div className="rounded-2xl p-4 flex items-center gap-4"
          style={{ background: `${bestImprovement.color}12`, border: `1px solid ${bestImprovement.color}30` }}>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 mb-1">Best improvement</p>
            <p className="text-sm font-semibold text-white">{bestImprovement.shortLabel} · {bestImprovement.course}</p>
            <p className="text-xs text-white/40 mt-0.5">
              {formatMs(bestImprovement.first)} → {formatMs(bestImprovement.pb)} · {bestImprovement.rows.length} swims
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold" style={{ color: "#6EE7B7" }}>▼ {formatMs(bestImprovement.deltaMs)}</p>
            <p className="text-[10px] text-white/30 mt-0.5">faster</p>
          </div>
        </div>
      )}

      {/* PB ranking bar chart — all events */}
      {allSeries.length > 1 && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
          <p className="px-4 pt-3 pb-2 text-[10px] font-medium uppercase tracking-widest text-white/30">Personal bests</p>
          <div className="px-4 pb-4 space-y-2.5">
            {allSeries.map((s) => {
              const maxPB = Math.max(...allSeries.map((x) => x.pb));
              const pct = Math.max(20, (1 - (s.pb - Math.min(...allSeries.map((x) => x.pb))) / (maxPB - Math.min(...allSeries.map((x) => x.pb)) + 1)) * 85 + 15);
              return (
                <div key={s.key} className="flex items-center gap-3">
                  {/* text-sm matches rest of app (was text-xs) */}
                  <p className="text-sm text-white/60 flex-shrink-0 w-20 truncate">{s.shortLabel}</p>
                  <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${pct}%`, background: `${s.color}60`, minWidth: 40 }}>
                    </div>
                  </div>
                  {/* text-sm font-bold matches rest of app (was text-xs font-bold) */}
                  <p className="text-sm font-bold text-white flex-shrink-0 w-16 text-right">{formatMs(s.pb)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sparkline cards — events with multiple results */}
      {multiResultSeries.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 px-1">Progress charts</p>
          {multiResultSeries.map((series) => {
            const isExpanded = expandedKey === series.key;
            const isImproving = series.deltaMs > 0;
            const tappedRow = tappedDots[series.key] ?? null;

            return (
              <div key={series.key} className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>

                {/* Header */}
                <button type="button"
                  onClick={() => { setExpandedKey(isExpanded ? null : series.key); setTappedDot(series.key, null); }}
                  className="w-full text-left px-4 pt-4 pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: series.color }} />
                      <div>
                        <p className="text-sm font-semibold text-white">{series.shortLabel}</p>
                        <p className="text-[10px] text-white/35 mt-0.5">
                          {series.course} · {series.rows.length} results
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-white">{formatMs(series.pb)}</p>
                      <p className="text-[10px] mt-0.5"
                        style={{ color: isImproving ? "#6EE7B7" : series.deltaMs < 0 ? "#FCA5A5" : "rgba(255,255,255,0.3)" }}>
                        {series.deltaMs > 0 ? `▼ ${formatMs(series.deltaMs)}` : series.deltaMs < 0 ? `▲ ${formatMs(Math.abs(series.deltaMs))}` : "No change"}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Sparkline */}
                <div className="px-3 pt-2 pb-1">
                  <MiniSparkline rows={series.rows} color={series.color}
                    onTap={(row) => setTappedDot(series.key, row)} tappedRow={tappedRow} />
                </div>

                {/* Tapped dot detail */}
                {tappedRow ? (
                  <div className="px-4 pb-4">
                    <div className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                      style={{ background: `${series.color}15`, border: `1px solid ${series.color}30` }}>
                      <div>
                        <p className="text-sm font-bold text-white">{formatMs(tappedRow.time_ms)}</p>
                        {tappedRow.meet_name && <p className="text-[11px] text-white/50 mt-0.5">{tappedRow.meet_name}</p>}
                        <p className="text-[10px] text-white/35 mt-0.5">{formatDate(tappedRow)}</p>
                      </div>
                      {tappedRow.time_ms === series.pb && (
                        <span className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                          style={{ background: `${series.color}25`, color: series.color }}>PB</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="px-4 pb-3">
                    <p className="text-[9px] text-white/20 text-center">
                      {isExpanded ? "tap header to collapse" : "tap a dot · tap header for full list"}
                    </p>
                  </div>
                )}

                {/* Expanded full list */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/8 pt-3 space-y-2">
                    <p className="text-[9px] uppercase tracking-wider text-white/25 mb-2">All results</p>
                    {[...series.rows].reverse().map((row) => {
                      const isPB = row.time_ms === series.pb;
                      return (
                        <div key={row.id} className="flex items-center justify-between rounded-xl px-3 py-2"
                          style={{
                            background: isPB ? `${series.color}12` : "rgba(255,255,255,0.04)",
                            border: `1px solid ${isPB ? `${series.color}25` : "rgba(255,255,255,0.07)"}`,
                          }}>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{formatMs(row.time_ms)}</span>
                              {isPB && <span className="text-[9px] font-bold" style={{ color: series.color }}>PB</span>}
                            </div>
                            {row.meet_name && <p className="text-[10px] text-white/35">{row.meet_name}</p>}
                          </div>
                          <p className="text-[10px] text-white/30">{formatDate(row)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Single result events — compact list */}
      {singleResultSeries.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
          <p className="px-4 pt-3 pb-2 text-[10px] font-medium uppercase tracking-widest text-white/30">
            First results — scan again to track progress
          </p>
          {singleResultSeries.map((s, i) => (
            <div key={s.key} className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: i === 0 ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                <p className="text-sm font-medium text-white/70">{s.shortLabel}</p>
                <p className="text-[10px] text-white/30">{s.course}</p>
              </div>
              <p className="text-sm font-bold" style={{ color: "#FDE68A" }}>{formatMs(s.pb)}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}