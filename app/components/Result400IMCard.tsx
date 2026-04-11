"use client";

import { Parse400IMResult, Split400IM } from "@/lib/parse400IMSplits";

function formatMs(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms)) return "-";
  const totalHundredths = Math.round(ms / 10);
  const minutes = Math.floor(totalHundredths / 6000);
  const secH = totalHundredths % 6000;
  const seconds = Math.floor(secH / 100);
  const hundredths = secH % 100;
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }
  return `${seconds}.${String(hundredths).padStart(2, "0")}`;
}

const STROKE_CONFIG = {
  FLY:    { label: "Butterfly",    bg: "bg-yellow-500/10",  border: "border-yellow-400/20",  text: "text-yellow-200" },
  BACK:   { label: "Backstroke",   bg: "bg-blue-500/10",    border: "border-blue-400/20",    text: "text-blue-200" },
  BREAST: { label: "Breaststroke", bg: "bg-purple-500/10",  border: "border-purple-400/20",  text: "text-purple-200" },
  FREE:   { label: "Freestyle",    bg: "bg-emerald-500/10", border: "border-emerald-400/20", text: "text-emerald-200" },
};

function StrokeSection({
  stroke,
  splits,
  total,
}: {
  stroke: Split400IM["stroke"];
  splits: Split400IM[];
  total: number | null;
}) {
  const c = STROKE_CONFIG[stroke];
  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wider ${c.text}`}>
          {c.label}
        </p>
        <p className={`text-base font-bold ${c.text}`}>{formatMs(total)}</p>
      </div>
      <div className="space-y-2">
        {splits.map((split) => (
          <div key={split.distance} className="flex items-center justify-between">
            <p className="text-xs text-white/50">{split.label}</p>
            <div className="text-right">
              <p className="text-sm font-semibold text-white">
                {formatMs(split.legMs)}
              </p>
              <p className="text-[10px] text-white/35">
                {formatMs(split.cumulativeMs)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "green" | "red";
}) {
  const color =
    highlight === "green"
      ? "text-emerald-300"
      : highlight === "red"
      ? "text-red-300"
      : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function Result400IMCard({
  result,
}: {
  result: Parse400IMResult;
}) {
  const droppedPositive =
    result.droppedMs != null ? Math.abs(result.droppedMs) : null;
  const improved = result.droppedMs != null && result.droppedMs < 0;

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <p className="text-xs uppercase tracking-widest text-white/40">
          {result.meetName ?? "Swim Meet"}
        </p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-white">
          {result.eventName ?? "400 IM"}
        </h2>
        {result.swimmerName && (
          <p className="mt-1 text-white/60">{result.swimmerName}</p>
        )}
        {result.date && (
          <p className="mt-0.5 text-sm text-white/40">
            {result.date} · {result.course ?? "LCM"}
          </p>
        )}

        <div className="mt-5 text-6xl font-bold leading-none tracking-tight text-white">
          {formatMs(result.finalTimeMs)}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {result.place != null && (
            <Stat label="Place" value={`#${result.place}`} />
          )}
          {result.entryTimeMs != null && (
            <Stat label="Entry" value={formatMs(result.entryTimeMs)} />
          )}
          {droppedPositive != null && (
            <Stat
              label="Dropped"
              value={`${improved ? "-" : "+"}${formatMs(droppedPositive)}`}
              highlight={improved ? "green" : "red"}
            />
          )}
        </div>
      </div>

      {/* Splits by stroke */}
      <p className="px-1 text-xs font-semibold uppercase tracking-widest text-white/40">
        Splits
      </p>
      <StrokeSection
        stroke="FLY"
        splits={result.splits.filter((s) => s.stroke === "FLY")}
        total={result.strokeSplits.fly}
      />
      <StrokeSection
        stroke="BACK"
        splits={result.splits.filter((s) => s.stroke === "BACK")}
        total={result.strokeSplits.back}
      />
      <StrokeSection
        stroke="BREAST"
        splits={result.splits.filter((s) => s.stroke === "BREAST")}
        total={result.strokeSplits.breast}
      />
      <StrokeSection
        stroke="FREE"
        splits={result.splits.filter((s) => s.stroke === "FREE")}
        total={result.strokeSplits.free}
      />

      {result.warnings.length > 0 && (
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200 space-y-1">
          {result.warnings.map((w, i) => (
            <p key={i}>⚠️ {w}</p>
          ))}
        </div>
      )}

      <p className="text-right text-xs text-white/30">
        Confidence: {result.confidence}%
      </p>
    </div>
  );
}