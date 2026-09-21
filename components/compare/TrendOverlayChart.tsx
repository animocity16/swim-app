"use client";

// Save this file as: components/compare/TrendOverlayChart.tsx
// (create the "compare" folder inside components if it doesn't exist yet)

type TrendPoint = {
  ms: number;
  swam_at: string | null;
};

export type TrendSeries = {
  id: number;
  label: string;
  color: string;
  points: TrendPoint[];
};

function formatMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function formatDelta(ms: number): string {
  return `${(Math.abs(ms) / 1000).toFixed(2)}s`;
}

function formatShortDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function rowTime(point: TrendPoint): number {
  if (!point.swam_at) return 0;
  const t = new Date(point.swam_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Chronological points only — undated rows are dropped, since a date-based
// axis can't place them meaningfully next to a rival's dated swims.
function cleanSeries(series: TrendSeries): TrendSeries {
  const dated = series.points.filter((p) => !!p.swam_at);
  dated.sort((a, b) => rowTime(a) - rowTime(b));
  return { ...series, points: dated };
}

function computeGapInsight(a: TrendSeries, b: TrendSeries): string | null {
  if (a.points.length === 0 || b.points.length === 0) return null;

  const startGap = Math.abs(a.points[0].ms - b.points[0].ms);
  const endGap = Math.abs(
    a.points[a.points.length - 1].ms - b.points[b.points.length - 1].ms
  );

  if (Math.abs(startGap - endGap) < 50) return null;

  const verb = endGap < startGap ? "narrowed" : "widened";
  const fromDate = formatShortDate(a.points[0].swam_at);
  return `Gap ${verb} from ${formatDelta(startGap)} to ${formatDelta(endGap)} since ${fromDate}`;
}

export default function TrendOverlayChart({
  series,
}: {
  series: TrendSeries[];
}) {
  const cleaned = series.map(cleanSeries).filter((s) => s.points.length > 0);

  if (cleaned.length === 0) {
    return (
      <div
        className="rounded-2xl px-4 py-5 text-center"
        style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-xs text-white/40">No dated results yet for this event.</p>
      </div>
    );
  }

  const W = 300;
  const H = 150;
  const PAD_X = 24;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 32;

  const allTimes = cleaned.flatMap((s) => s.points.map((p) => p.ms));
  const minMs = Math.min(...allTimes);
  const maxMs = Math.max(...allTimes);
  const msRange = Math.max(maxMs - minMs, 500);

  const allDates = cleaned.flatMap((s) => s.points.map((p) => rowTime(p)));
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const dateRange = Math.max(maxDate - minDate, 1);

  function xFor(point: TrendPoint): number {
    if (cleaned.every((s) => s.points.length <= 1)) return W / 2;
    const t = rowTime(point);
    return PAD_X + ((t - minDate) / dateRange) * (W - PAD_X * 2);
  }

  // Faster times sit higher on the chart.
  function yFor(ms: number): number {
    const normalized = (ms - minMs) / msRange;
    return PAD_TOP + normalized * (H - PAD_TOP - PAD_BOTTOM);
  }

  const insight = cleaned.length === 2 ? computeGapInsight(cleaned[0], cleaned[1]) : null;

  return (
    <div className="space-y-2">
      <div
        className="overflow-hidden rounded-2xl"
        style={{ background: "rgba(0,10,30,0.32)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block" }}
          role="img"
          aria-label="Progression comparison over time"
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

          {cleaned.map((s) => {
            const points = s.points.map((p) => ({ x: xFor(p), y: yFor(p.ms) }));
            const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
            const last = points[points.length - 1];

            return (
              <g key={s.id}>
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 2.5} fill={s.color} />
                ))}
                {last && (
                  <text x={last.x} y={last.y - 8} textAnchor="middle" fontSize="9" fill={s.color}>
                    {formatMs(s.points[s.points.length - 1].ms)}
                  </text>
                )}
              </g>
            );
          })}

          <text x={PAD_X} y={H - 8} fontSize="9" fill="rgba(255,255,255,0.3)">
            {formatShortDate(cleaned[0].points[0].swam_at)}
          </text>
          <text x={W - PAD_X} y={H - 8} fontSize="9" fill="rgba(255,255,255,0.3)" textAnchor="end">
            {formatShortDate(
              cleaned.reduce((latest, s) => {
                const t = rowTime(s.points[s.points.length - 1]);
                return t > latest ? t : latest;
              }, 0) === maxDate
                ? cleaned.find((s) => rowTime(s.points[s.points.length - 1]) === maxDate)?.points.slice(-1)[0]
                    ?.swam_at ?? null
                : null
            )}
          </text>
        </svg>
      </div>

      <div className="flex flex-wrap gap-3">
        {cleaned.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-[11px] text-white/60">
              {s.label} · {formatMs(s.points[s.points.length - 1].ms)}
            </span>
          </div>
        ))}
      </div>

      {insight && <p className="text-[11px] text-white/35">{insight}</p>}
    </div>
  );
}
