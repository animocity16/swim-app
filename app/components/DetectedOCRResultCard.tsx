"use client";

import { parse200IMSplitsFromOCR } from "@/lib/ocrSplitParser";

type Props = {
  rawText: string;
  event?: string | null;
  swimmer?: string | null;
  course?: string | null;
  date?: string | null;
  timeMs?: number | null;
  confidence?: number | null;
};

function formatTime(ms: number | null | undefined) {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalHundredths = Math.round(ms / 10);
  const minutes = Math.floor(totalHundredths / 6000);
  const secHundredths = totalHundredths % 6000;
  const seconds = Math.floor(secHundredths / 100);
  const hundredths = secHundredths % 100;
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }
  return `${seconds}.${String(hundredths).padStart(2, "0")}`;
}

function SplitBox({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">
        {formatTime(value)}
      </div>
    </div>
  );
}

function is200IM(event: string | null | undefined): boolean {
  if (!event) return false;
  const e = event.toUpperCase();
  return e.includes("200") && (e.includes("IM") || e.includes("INDIVIDUAL MEDLEY") || e.includes("MEDLEY"));
}

export default function DetectedOCRResultCard({
  rawText,
  event,
  swimmer,
  course,
  date,
  timeMs,
  confidence,
}: Props) {
  const displayEvent = event ?? "Unknown Event";
  const displaySwimmer = swimmer ?? "Unknown";
  const displayCourse = course ?? "LCM";
  const displayConfidence = confidence ?? 0;

  // ✅ Only run the 200IM parser if the event actually IS a 200 IM
  // For everything else (100 Back, 50 Free, etc.) just use the timeMs prop directly
  const isIM = is200IM(event);
  const parsed = isIM ? parse200IMSplitsFromOCR(rawText) : null;

  const displayTime = isIM ? (parsed?.totalMs ?? timeMs ?? null) : timeMs;

  const fly = parsed?.splits[0]?.splitMs ?? null;
  const back = parsed?.splits[1]?.splitMs ?? null;
  const breast = parsed?.splits[2]?.splitMs ?? null;
  const free = parsed?.splits[3]?.splitMs ?? null;

  const warnings = parsed?.warnings ?? [];

  return (
    <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-8">
      <div className="text-4xl font-bold tracking-tight text-white">
        {displayEvent}
      </div>

      <div className="mt-4 text-2xl text-white/70">
        {displaySwimmer} • {displayCourse}
      </div>

      <div className="mt-8 text-6xl font-bold leading-none text-white">
        {formatTime(displayTime)}
      </div>

      {/* Only show the IM split boxes for 200 IM events */}
      {isIM && (
        <div className="mt-8 grid grid-cols-2 gap-3">
          <SplitBox label="Fly" value={fly} />
          <SplitBox label="Back" value={back} />
          <SplitBox label="Breast" value={breast} />
          <SplitBox label="Free" value={free} />
        </div>
      )}

      <div className="mt-8 space-y-2 text-sm text-white/50">
        <div>Date: {date ?? "-"}</div>
        <div>Confidence: {displayConfidence}</div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-200">
          {warnings.map((warning, index) => (
            <div key={`${warning}-${index}`}>{warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}