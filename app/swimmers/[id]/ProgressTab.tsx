"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { canonicalCourse, canonicalEventName, eventKey } from "@/lib/events";

type Props = {
  swimmerId: number;
  swimmerName: string;
};

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
  rows: TimeRow[];
  pb: number;
  first: number;
  deltaMs: number;
};

const SERIES_COLORS = [
  "#FDE68A", "#6EE7B7", "#93C5FD", "#F9A8D4", "#C4B5FD",
  "#FCA5A5", "#86EFAC", "#FCD34D", "#67E8F9", "#FDBA74",
];

function getDate(row: TimeRow): number {
  const d = row.swam_at ?? row.created_at;
  if (!d) return 0;
  return new Date(d).getTime();
}

function getDateLabel(row: TimeRow): string {
  const d = row.swam_at ?? row.created_at;
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function shortEventName(event: string): string {
  return canonicalEventName(event)
    .replace("Freestyle", "Free")
    .replace("Backstroke", "Back")
    .replace("Breaststroke", "Breast")
    .replace("Butterfly", "Fly")
    .replace("Individual Medley", "IM");
}

// ✅ Interactive sparkline — tapping a dot shows its details
function MiniSparkline({
  rows,
  color,
  onTap,
  tappedRow,
}: {
  rows: TimeRow[];
  color: string;
  onTap: (row: TimeRow | null) => void;
  tappedRow: TimeRow | null;
}) {
  const times = rows.map((r) => r.time_ms);
  if (times.length < 2) return null;

  const W = 300;
  const H = 64;
  const pad = 8;

  const min = Math.min(...times);
  const max = Math.max(...times);
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
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ overflow: "visible", touchAction: "manipulation" }}
    >
      <defs>
        <linearGradient id={`fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fill */}
      <path d={fillD} fill={`url(#fill-${color.replace("#", "")})`} />

      {/* Line */}
      <path d={pathD} stroke={color} strokeWidth="2" fill="none"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />

      {/* Tappable dots */}
      {pts.map((p, i) => {
        const isPB = p.row.time_ms === min;
        const isTapped = tappedRow?.id === p.row.id;
        const isLatest = i === pts.length - 1;

        return (
          <g
            key={p.row.id}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onTap(isTapped ? null : p.row);
            }}
          >
            {/* Large invisible touch target */}
            <circle cx={p.x} cy={p.y} r={18} fill="transparent" />

            {/* Tap/hover ring */}
            {isTapped && (
              <circle cx={p.x} cy={p.y} r={10} fill={color} opacity="0.15" />
            )}

            {/* PB outer ring */}
            {isPB && (
              <circle cx={p.x} cy={p.y} r={8} fill="none"
                stroke={color} strokeWidth="1.2" opacity="0.45" />
            )}

            {/* Latest dot ring */}
            {isLatest && !isPB && (
              <circle cx={p.x} cy={p.y} r={7} fill="none"
                stroke={color} strokeWidth="1" opacity="0.3" />
            )}

            {/* Dot */}
            <circle
              cx={p.x}
              cy={p.y}
              r={isTapped ? 6 : isPB || isLatest ? 4.5 : 3}
              fill={color}
              opacity={isTapped ? 1 : isPB || isLatest ? 0.9 : 0.55}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function ProgressTab({ swimmerId, swimmerName }: Props) {
  const [rows, setRows] = useState<TimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // ✅ Per-series tapped dot state
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
      .map(([key, eventRows], index) => {
        const sorted = [...eventRows].sort((a, b) => getDate(a) - getDate(b));
        const times = sorted.map((r) => r.time_ms);
        const pb = Math.min(...times);
        const first = times[0];
        return {
          key,
          shortLabel: shortEventName(eventRows[0].event),
          course: canonicalCourse(eventRows[0].course),
          color: SERIES_COLORS[index % SERIES_COLORS.length],
          rows: sorted,
          pb,
          first,
          deltaMs: first - pb,
        };
      });
  }, [rows]);

  function setTappedDot(key: string, row: TimeRow | null) {
    setTappedDots((prev) => ({ ...prev, [key]: row }));
  }

  if (loading) return <p className="muted">Loading...</p>;

  if (rows.length === 0) {
    return (
      <div className="card-soft text-center py-8">
        <p className="text-white font-semibold">No times yet</p>
        <p className="text-white/50 text-sm mt-1">Scan results to start tracking progress.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <div style={{ padding: "0 2px" }}>
        <p className="text-xs text-white/40">
          {swimmerName} · {allSeries.length} event{allSeries.length === 1 ? "" : "s"} tracked · tap any dot for details
        </p>
      </div>

      {allSeries.map((series) => {
        const isExpanded = expandedKey === series.key;
        const isImproving = series.deltaMs > 0;
        const tappedRow = tappedDots[series.key] ?? null;

        return (
          <div
            key={series.key}
            className="rounded-3xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.09)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            {/* Header */}
            <button
              type="button"
              onClick={() => {
                setExpandedKey(isExpanded ? null : series.key);
                setTappedDot(series.key, null);
              }}
              className="w-full text-left"
              style={{ padding: "16px 20px 0" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: series.color, flexShrink: 0, marginTop: 2,
                  }} />
                  <div>
                    <p className="text-base font-bold text-white">{series.shortLabel}</p>
                    <p className="text-xs text-white/40">
                      {series.course} · {series.rows.length} result{series.rows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl font-bold text-white">{formatMs(series.pb)}</p>
                  <p className="text-[10px] mt-0.5" style={{
                    color: isImproving ? "#6EE7B7" : series.deltaMs < 0 ? "#FCA5A5" : "rgba(255,255,255,0.3)",
                  }}>
                    {series.deltaMs > 0
                      ? `▼ ${formatMs(series.deltaMs)}`
                      : series.deltaMs < 0
                      ? `▲ ${formatMs(Math.abs(series.deltaMs))}`
                      : "No change"}
                  </p>
                </div>
              </div>
            </button>

            {/* Sparkline */}
            {series.rows.length >= 2 && (
              <div style={{ padding: "10px 12px 0", margin: "0 -2px" }}>
                <MiniSparkline
                  rows={series.rows}
                  color={series.color}
                  onTap={(row) => setTappedDot(series.key, row)}
                  tappedRow={tappedRow}
                />
              </div>
            )}

            {/* ✅ Dot detail card — appears when a dot is tapped */}
            {tappedRow ? (
              <div style={{ padding: "10px 20px 14px" }}>
                <div
                  className="rounded-2xl px-4 py-3 flex items-center justify-between"
                  style={{
                    background: `${series.color}18`,
                    border: `1px solid ${series.color}35`,
                  }}
                >
                  <div>
                    <p className="text-lg font-bold text-white">{formatMs(tappedRow.time_ms)}</p>
                    {tappedRow.meet_name && (
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                        {tappedRow.meet_name}
                      </p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {getDateLabel(tappedRow)}
                    </p>
                  </div>
                  {tappedRow.time_ms === series.pb && (
                    <span
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={{ background: `${series.color}25`, color: series.color }}
                    >
                      PB
                    </span>
                  )}
                </div>
              </div>
            ) : (
              series.rows.length >= 2 && (
                <div style={{ padding: "6px 20px 14px", textAlign: "center" }}>
                  <p className="text-[9px] text-white/20">
                    {isExpanded ? "tap header to collapse" : "tap dots for details · tap header for full list"}
                  </p>
                </div>
              )
            )}

            {/* Single result */}
            {series.rows.length === 1 && (
              <div style={{ padding: "8px 20px 16px" }}>
                <p className="text-xs text-white/30">Only 1 result — scan more to see progress</p>
              </div>
            )}

            {/* Expanded results list */}
            {isExpanded && series.rows.length >= 2 && (
              <div style={{ padding: "0 20px 16px" }}>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12 }}>
                  <p className="text-[9px] uppercase tracking-wider text-white/30 mb-3">All results</p>
                  <div className="space-y-2">
                    {[...series.rows].reverse().map((row) => {
                      const isPB = row.time_ms === series.pb;
                      return (
                        <div
                          key={row.id}
                          className="flex items-center justify-between rounded-2xl px-3 py-2"
                          style={{
                            background: isPB ? `${series.color}15` : "rgba(255,255,255,0.05)",
                            border: `1px solid ${isPB ? `${series.color}30` : "rgba(255,255,255,0.08)"}`,
                          }}
                        >
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {formatMs(row.time_ms)}
                              {isPB && (
                                <span className="ml-2 text-[10px] font-bold" style={{ color: series.color }}>
                                  PB
                                </span>
                              )}
                            </p>
                            {row.meet_name && (
                              <p className="text-xs text-white/40">{row.meet_name}</p>
                            )}
                          </div>
                          <p className="text-xs text-white/30">{getDateLabel(row)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}