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
  improvementPct: number;
};

function getStrokeColor(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breaststroke") || e.includes("breast")) return "#34D399";
  if (e.includes("backstroke") || e.includes("back")) return "#A78BFA";
  if (e.includes("butterfly") || e.includes("fly")) return "#FB923C";
  if (e.includes("freestyle") || e.includes("free")) return "#38BDF8";
  if (e.includes("medley") || e.includes("im")) return "#F472B6";
  return "#FDE68A";
}

function formatMs(ms?: number | null): string {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function formatDelta(ms: number): string {
  if (ms <= 0) return "0.00s";
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatDate(value?: string | null): string {
  if (!value) return "Date unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function rowDate(row: TimeRow): number {
  const raw = row.swam_at ?? row.created_at;
  if (!raw) return 0;

  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function shortEventName(event: string): string {
  const canonical = canonicalEventName(event);

  return canonical
    .replace("Freestyle", "Free")
    .replace("Backstroke", "Back")
    .replace("Breaststroke", "Breast")
    .replace("Butterfly", "Fly");
}

function countPbMoments(rows: TimeRow[]): number {
  if (rows.length === 0) return 0;

  let best = Number.POSITIVE_INFINITY;
  let count = 0;

  for (const row of rows) {
    if (row.time_ms < best) {
      best = row.time_ms;
      count++;
    }
  }

  return count;
}

function makeInsight(series: EventSeries): string {
  const { rows, shortLabel, deltaMs, pb } = series;

  if (rows.length === 1) {
    return `This is the first ${shortLabel} result on record. Add another race to start seeing progression.`;
  }

  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const latestDrop = previous.time_ms - latest.time_ms;
  const latestIsPB = latest.time_ms === pb;
  const pbMoments = countPbMoments(rows);

  if (latestIsPB && latestDrop > 0) {
    return `${series.shortLabel}'s latest swim was a new PB — ${formatDelta(latestDrop)} faster than the previous race.`;
  }

  if (pbMoments >= 3) {
    return `${series.shortLabel} has set ${pbMoments} PBs across ${rows.length} recorded races.`;
  }

  if (deltaMs > 0) {
    return `${series.shortLabel} has improved ${formatDelta(deltaMs)} since the first recorded race.`;
  }

  return `${series.shortLabel} has ${rows.length} races on record. Keep adding results to build a clearer progression picture.`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
        color: "rgba(255,255,255,0.28)",
      }}
    >
      <path
        d="M7 4L12 9L7 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProgressChart({
  series,
  selectedRow,
  onSelect,
}: {
  series: EventSeries;
  selectedRow: TimeRow | null;
  onSelect: (row: TimeRow | null) => void;
}) {
  const rows = series.rows;

  const W = 640;
  const H = 220;
  const PAD_X = 34;
  const PAD_TOP = 24;
  const PAD_BOTTOM = 38;

  const times = rows.map((r) => r.time_ms);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const range = Math.max(max - min, 1000);

  // Faster times should appear higher on the chart.
  function xFor(i: number): number {
    if (rows.length <= 1) return W / 2;
    return PAD_X + (i / (rows.length - 1)) * (W - PAD_X * 2);
  }

  function yFor(ms: number): number {
    const normalized = (ms - min) / range;
    return PAD_TOP + normalized * (H - PAD_TOP - PAD_BOTTOM);
  }

  const points = rows.map((row, i) => ({
    row,
    x: xFor(i),
    y: yFor(row.time_ms),
  }));

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="space-y-3">
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: "rgba(0,10,30,0.32)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block", touchAction: "manipulation" }}
          aria-label={`${series.shortLabel} progression chart`}
        >
          {[0.25, 0.5, 0.75].map((fraction) => {
            const y = PAD_TOP + fraction * (H - PAD_TOP - PAD_BOTTOM);
            return (
              <line
                key={fraction}
                x1={PAD_X}
                x2={W - PAD_X}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
            );
          })}

          <polyline
            points={linePoints}
            fill="none"
            stroke={series.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />

          {points.map(({ row, x, y }, i) => {
            const isPB = row.time_ms === series.pb;
            const isSelected = selectedRow?.id === row.id;

            return (
              <g
                key={row.id}
                onClick={() => onSelect(isSelected ? null : row)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 11 : 8}
                  fill={isPB ? "#FDE68A" : series.color}
                  stroke={isSelected ? "#FFFFFF" : "rgba(0,0,0,0.35)"}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {i === 0 && (
                  <text
                    x={x}
                    y={H - 12}
                    textAnchor="middle"
                    fontSize="16"
                    fill="rgba(255,255,255,0.35)"
                  >
                    First
                  </text>
                )}
                {i === rows.length - 1 && rows.length > 1 && (
                  <text
                    x={x}
                    y={H - 12}
                    textAnchor="middle"
                    fontSize="16"
                    fill="rgba(255,255,255,0.35)"
                  >
                    Latest
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {selectedRow ? (
        <div
          className="rounded-2xl px-4 py-3"
          style={{
            background: `${series.color}10`,
            border: `1px solid ${series.color}24`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                {formatDate(selectedRow.swam_at ?? selectedRow.created_at)}
              </p>
              <p className="mt-0.5 truncate text-xs text-white/40">
                {selectedRow.meet_name || "Meet not recorded"}
              </p>
            </div>
            <p className="flex-shrink-0 text-lg font-bold text-white">
              {formatMs(selectedRow.time_ms)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-center text-[10px] text-white/25">
          Tap a dot to see the race details
        </p>
      )}
    </div>
  );
}

export default function ProgressTab({ swimmerId, swimmerName }: Props) {
  const [rows, setRows] = useState<TimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Record<string, TimeRow | null>>({});

  useEffect(() => {
    void load();
  }, [swimmerId]);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("swim_times")
      .select("id, event, course, time_ms, swam_at, created_at, meet_name")
      .eq("swimmer_id", swimmerId)
      .order("swam_at", { ascending: true });

    if (error) {
      console.error("ProgressTab: failed to load swim times", error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as TimeRow[]);
    setLoading(false);
  }

  const allSeries = useMemo<EventSeries[]>(() => {
    const grouped = new Map<string, TimeRow[]>();

    for (const row of rows) {
      const canonicalEvent = canonicalEventName(row.event);
      const canonicalCourseValue = canonicalCourse(row.course);
      const key = eventKey(canonicalEvent, canonicalCourseValue);

      const existing = grouped.get(key) ?? [];
      existing.push({
        ...row,
        event: canonicalEvent,
        course: canonicalCourseValue,
      });
      grouped.set(key, existing);
    }

    return Array.from(grouped.entries())
      .map(([key, eventRows]) => {
        const sorted = [...eventRows].sort((a, b) => {
          const dateDiff = rowDate(a) - rowDate(b);
          if (dateDiff !== 0) return dateDiff;
          return a.id - b.id;
        });

        const first = sorted[0].time_ms;
        const pb = Math.min(...sorted.map((r) => r.time_ms));
        const deltaMs = Math.max(first - pb, 0);
        const improvementPct = first > 0 ? (deltaMs / first) * 100 : 0;

        return {
          key,
          shortLabel: shortEventName(sorted[0].event),
          course: canonicalCourse(sorted[0].course),
          color: getStrokeColor(sorted[0].event),
          rows: sorted,
          pb,
          first,
          deltaMs,
          improvementPct,
        };
      })
      .sort((a, b) => {
        const aDistance = Number(a.shortLabel.match(/\d+/)?.[0] ?? 9999);
        const bDistance = Number(b.shortLabel.match(/\d+/)?.[0] ?? 9999);

        if (aDistance !== bDistance) return aDistance - bDistance;
        return a.shortLabel.localeCompare(b.shortLabel);
      });
  }, [rows]);

  const totalRaces = rows.length;
  const improvedEvents = allSeries.filter((s) => s.deltaMs > 0).length;

  const strongestProgress = useMemo(() => {
    return [...allSeries]
      .filter((s) => s.rows.length >= 2 && s.improvementPct > 0)
      .sort((a, b) => b.improvementPct - a.improvementPct)[0] ?? null;
  }, [allSeries]);

  function toggleSeries(key: string) {
    setExpandedKey((current) => (current === key ? null : key));
  }

  function setSelectedRow(key: string, row: TimeRow | null) {
    setSelectedRows((current) => ({
      ...current,
      [key]: row,
    }));
  }

  if (loading) {
    return (
      <div className="space-y-3 py-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-3xl"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-3xl py-8 text-center"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <p className="text-sm font-semibold text-white">No times yet</p>
        <p className="mt-1 text-xs text-white/40">
          Add or scan results to start tracking progress.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall summary */}
      <div
        className="rounded-3xl p-4"
        style={{
          background: "rgba(255,255,255,0.055)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
          Overall progress
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div>
            <p className="text-xl font-bold text-white">{allSeries.length}</p>
            <p className="text-[10px] text-white/35">events tracked</p>
          </div>
          <div>
            <p className="text-xl font-bold text-white">{totalRaces}</p>
            <p className="text-[10px] text-white/35">races recorded</p>
          </div>
          <div>
            <p className="text-xl font-bold" style={{ color: "#6EE7B7" }}>
              {improvedEvents}
            </p>
            <p className="text-[10px] text-white/35">events improved</p>
          </div>
        </div>

        {strongestProgress && (
          <div
            className="mt-4 rounded-2xl px-4 py-3"
            style={{
              background: `${strongestProgress.color}0D`,
              border: `1px solid ${strongestProgress.color}20`,
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
              Natrix noticed
            </p>
            <p className="mt-1 text-sm text-white/70">
              {swimmerName} has improved{" "}
              <span className="font-bold text-white">
                {strongestProgress.improvementPct.toFixed(1)}%
              </span>{" "}
              in {strongestProgress.shortLabel} since the first recorded race.
            </p>
          </div>
        )}
      </div>

      {/* Event list */}
      <div className="space-y-2">
        <p className="px-1 text-[10px] font-medium uppercase tracking-widest text-white/30">
          Event progress
        </p>

        {allSeries.map((series) => {
          const isOpen = expandedKey === series.key;
          const hasProgress = series.rows.length >= 2;
          const selectedRow = selectedRows[series.key] ?? null;

          return (
            <div
              key={series.key}
              className="overflow-hidden rounded-3xl"
              style={{
                background: isOpen
                  ? "rgba(0,20,45,0.48)"
                  : "rgba(255,255,255,0.045)",
                border: isOpen
                  ? `1px solid ${series.color}30`
                  : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <button
                type="button"
                onClick={() => toggleSeries(series.key)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ background: series.color }}
                  />

                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-bold"
                      style={{ color: series.color }}
                    >
                      {series.shortLabel}
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/30">
                      {series.course} · {series.rows.length} race
                      {series.rows.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <p className="text-[10px] uppercase tracking-wide text-white/30">
                      PB
                    </p>
                    <p className="text-lg font-bold text-white">
                      {formatMs(series.pb)}
                    </p>

                    {hasProgress && series.deltaMs > 0 ? (
                      <p
                        className="mt-0.5 text-[10px] font-semibold"
                        style={{ color: "#6EE7B7" }}
                      >
                        ↓ {formatDelta(series.deltaMs)} faster
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-white/25">
                        {hasProgress ? "No PB drop yet" : "First result"}
                      </p>
                    )}
                  </div>

                  <div className="ml-1 flex-shrink-0">
                    <Chevron open={isOpen} />
                  </div>
                </div>
              </button>

              {isOpen && (
                <div
                  className="space-y-4 px-4 pb-4"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="grid grid-cols-3 gap-2 pt-4">
                    <div
                      className="rounded-2xl p-3"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-white/25">
                        First
                      </p>
                      <p className="mt-1 text-sm font-bold text-white/70">
                        {formatMs(series.first)}
                      </p>
                    </div>

                    <div
                      className="rounded-2xl p-3"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-white/25">
                        PB
                      </p>
                      <p className="mt-1 text-sm font-bold text-white">
                        {formatMs(series.pb)}
                      </p>
                    </div>

                    <div
                      className="rounded-2xl p-3"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-white/25">
                        Improved
                      </p>
                      <p
                        className="mt-1 text-sm font-bold"
                        style={{
                          color:
                            series.deltaMs > 0
                              ? "#6EE7B7"
                              : "rgba(255,255,255,0.45)",
                        }}
                      >
                        {series.deltaMs > 0
                          ? `${series.improvementPct.toFixed(1)}%`
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {hasProgress ? (
                    <ProgressChart
                      series={series}
                      selectedRow={selectedRow}
                      onSelect={(row) => setSelectedRow(series.key, row)}
                    />
                  ) : (
                    <div
                      className="rounded-2xl px-4 py-5 text-center"
                      style={{
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <p className="text-sm font-semibold text-white/65">
                        One result recorded
                      </p>
                      <p className="mt-1 text-xs text-white/35">
                        Add another {series.shortLabel} result to start the progression chart.
                      </p>
                    </div>
                  )}

                  <div
                    className="rounded-2xl px-4 py-3"
                    style={{
                      background: `${series.color}0B`,
                      border: `1px solid ${series.color}18`,
                    }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                      Natrix noticed
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-white/55">
                      {makeInsight(series)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
