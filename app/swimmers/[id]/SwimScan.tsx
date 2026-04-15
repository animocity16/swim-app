"use client";

import { useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import {
  parseSwimOCRText,
  type ParsedSwimResult,
} from "@/lib/ocrMultiEventParser";
import { parseAndSaveSwimOCR } from "@/lib/parseSwimOCRFlow";
import { parse400IMSplitsFromOCR } from "@/lib/parse400IMSplits";
import {
  parseEventResultsOCR,
  isEventResultsPage,
  type EventResultRow,
} from "@/lib/ocrEventResultsParser";
import { supabase } from "@/lib/supabaseClient";
import { canonicalCourse, canonicalEventName } from "@/lib/events";
import Result400IMCard from "@/app/components/Result400IMCard";
import DetectedOCRResultCard from "../../components/DetectedOCRResultCard";

type Props = {
  swimmerId: number;
  swimmerName: string;
  clubHint?: string;
  onSaved?: (text: string) => void;
};

type Step = "idle" | "scanning" | "done";
type ScanMode = "single" | "event_results" | "400im" | null;

function formatTime(ms: number | null) {
  if (ms == null || isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
  return seconds.toFixed(2);
}

export default function SwimScan({ swimmerId, swimmerName, clubHint }: Props) {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [rawText, setRawText] = useState("");
  const [showInfo, setShowInfo] = useState(false);

  const [results, setResults] = useState<ParsedSwimResult[]>([]);
  const [result400IM, setResult400IM] = useState<ReturnType<typeof parse400IMSplitsFromOCR> | null>(null);

  const [scanMode, setScanMode] = useState<ScanMode>(null);
  const [eventRows, setEventRows] = useState<EventResultRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [savingSelected, setSavingSelected] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);

  const ref1 = useRef<HTMLInputElement | null>(null);
  const ref2 = useRef<HTMLInputElement | null>(null);

  function handleFile(
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
    setPreview: (s: string | null) => void
  ) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function reset() {
    setFile1(null); setFile2(null);
    setPreview1(null); setPreview2(null);
    setStep("idle"); setProgress(0);
    setMessage(""); setRawText("");
    setResults([]); setResult400IM(null);
    setScanMode(null); setEventRows([]);
    setSelectedRows(new Set()); setSavingSelected(false); setSavedNames([]);
    setShowInfo(false);
    if (ref1.current) ref1.current.value = "";
    if (ref2.current) ref2.current.value = "";
  }

  function toggleRow(index: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectAll() { setSelectedRows(new Set(eventRows.map((_, i) => i))); }
  function selectNone() { setSelectedRows(new Set()); }

  async function handleSaveSelected() {
    if (selectedRows.size === 0) { setMessage("⚠️ Please select at least one swimmer to save."); return; }

    setSavingSelected(true);
    setMessage("");

    const saved: string[] = [];
    const errors: string[] = [];

    for (const index of Array.from(selectedRows)) {
      const row = eventRows[index];
      if (!row) continue;

      const eventName = canonicalEventName(row.event ?? "");
      const courseName = canonicalCourse(row.course ?? "LCM");

      if (!eventName) { errors.push(`${row.name}: could not determine event`); continue; }

      const { data: existing } = await supabase
        .from("swim_times").select("id")
        .eq("swimmer_id", swimmerId).eq("event", eventName)
        .eq("course", courseName).eq("time_ms", row.timeMs).limit(1);

      if (existing && existing.length > 0) { errors.push(`${row.name}: already saved`); continue; }

      const payload: Record<string, unknown> = {
        swimmer_id: swimmerId,
        event: eventName,
        course: courseName,
        time_ms: row.timeMs,
        place: row.place ?? null,
        meet_name: row.meetName ?? null,
        swam_at: row.swamAt ?? null,
      };

      const { error } = await supabase.from("swim_times").insert(payload);
      if (error) { errors.push(`${row.name}: ${error.message}`); }
      else { saved.push(row.name); }
    }

    setSavedNames(saved);

    if (saved.length > 0 && errors.length === 0) {
      setMessage(`✓ Saved ${saved.length} result(s): ${saved.join(", ")}`);
    } else if (saved.length > 0) {
      setMessage(`✓ Saved ${saved.length} result(s). Issues: ${errors.join(" | ")}`);
    } else {
      setMessage(`⚠️ Nothing saved. ${errors.join(" | ")}`);
    }

    setSavingSelected(false);
    setSelectedRows(new Set());
  }

  async function handleScan() {
    if (!file1) { setMessage("Please upload at least Screen 1."); return; }
    if (!swimmerId) { setMessage("Missing swimmer ID."); return; }
    if (!swimmerName) { setMessage("Missing swimmer name."); return; }

    setStep("scanning");
    setProgress(0); setMessage(""); setScanMode(null);
    setEventRows([]); setSelectedRows(new Set()); setSavedNames([]);

    try {
      const files = [file1, file2].filter(Boolean) as File[];
      let combined = "";

      for (let i = 0; i < files.length; i++) {
        const worker = await createWorker("eng", 1, {
          logger: (m: any) => {
            if (m.status === "recognizing text") {
              const base = (i / files.length) * 100;
              setProgress(base + (m.progress * 100) / files.length);
            }
          },
        });
        try {
          const { data: { text } } = await worker.recognize(files[i]);
          combined += text + "\n\n";
        } finally {
          await worker.terminate();
        }
      }

      setRawText(combined);

      const is400IM = /400\s*(meter|m)?\s*im/i.test(combined);
      const isEventPage = isEventResultsPage(combined);

      if (is400IM) {
        setScanMode("400im");
        const parsed = parse400IMSplitsFromOCR(combined);
        setResult400IM(parsed);
        setResults([]); setEventRows([]);

        try {
          const saveResult = await parseAndSaveSwimOCR(combined, { swimmerId, swimmerName, defaultCourse: "LCM" });
          if (saveResult.savedCount === 0) {
            setMessage("⚠️ " + (saveResult.errors[0] || "Nothing was saved."));
          } else {
            setMessage(`✓ Saved ${saveResult.savedCount} swim(s), ${saveResult.splitSavedCount} split row(s).`);
          }
        } catch (saveErr: any) {
          setMessage(`⚠️ Save error: ${saveErr?.message ?? "Unknown"}`);
        }

      } else if (isEventPage) {
        setScanMode("event_results");
        const parsed = parseEventResultsOCR(combined);
        setEventRows(parsed.results);
        setResults([]); setResult400IM(null);

        const currentNameLower = swimmerName.toLowerCase().trim();
        const preSelected = new Set<number>();
        parsed.results.forEach((row, index) => {
          if (
            row.name.toLowerCase().includes(currentNameLower) ||
            currentNameLower.includes(row.name.toLowerCase().split(" ")[0])
          ) {
            preSelected.add(index);
          }
        });
        setSelectedRows(preSelected);

        if (parsed.results.length === 0) {
          setMessage("⚠️ No swimmer results detected. Try the single swim detail screen instead.");
        } else {
          setMessage("");
        }

      } else {
        setScanMode("single");
        const preview = parseSwimOCRText(combined, { swimmerName });
        setResults(preview);
        setResult400IM(null); setEventRows([]);

        try {
          const saveResult = await parseAndSaveSwimOCR(combined, { swimmerId, swimmerName, defaultCourse: "LCM" });
          if (saveResult.savedCount === 0) {
            setMessage("⚠️ " + (saveResult.errors[0] || "Nothing was saved."));
          } else {
            setMessage(`✓ Saved ${saveResult.savedCount} swim(s), ${saveResult.splitSavedCount} split row(s).${saveResult.errors.length > 0 ? " Errors: " + saveResult.errors.join(" | ") : ""}`);
          }
        } catch (saveErr: any) {
          setMessage(`⚠️ Save error: ${saveErr?.message ?? "Unknown"}`);
        }
      }

      setStep("done");

    } catch (err: any) {
      setMessage(`❌ Error: ${err?.message ?? "Unknown error"}`);
      setStep("done");
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-white">SwimScan</h3>
          <p className="mt-1 text-sm text-white/55">
            Scan race results for {swimmerName}{clubHint ? ` (${clubHint})` : ""}.
          </p>
        </div>

        {/* ⓘ Info toggle — replaces the always-visible explainer block */}
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-white/40 transition hover:bg-white/10 hover:text-white/70"
          aria-label="How scanning works"
        >
          ⓘ
        </button>
      </div>

      {/* Collapsible info panel */}
      {showInfo && (
        <div
          className="rounded-2xl p-4 space-y-2 text-sm text-white/55"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p className="font-medium text-white/70">Two scan modes — auto detected:</p>
          <p>📋 <span className="text-white/70">Swim detail</span> — single result with splits, saves automatically</p>
          <p>📊 <span className="text-white/70">Event results</span> — full rankings, tick who to save</p>
          <p className="pt-1 text-white/35 text-xs">Screen 2 is optional — use it for split pages that continue onto a second screenshot.</p>
        </div>
      )}

      {/* ── IDLE — upload UI ──────────────────────────────────────────────── */}
      {step === "idle" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <ScreenSlot
              label="Screen 1"
              hint="Swim detail or event results"
              preview={preview1}
              inputRef={ref1}
              required
              onChange={(e) => handleFile(e, setFile1, setPreview1)}
            />
            <ScreenSlot
              label="Screen 2"
              hint="Splits continued (optional)"
              preview={preview2}
              inputRef={ref2}
              onChange={(e) => handleFile(e, setFile2, setPreview2)}
            />
          </div>

          {message && <p className="text-sm text-red-300">{message}</p>}

          <button
            type="button"
            onClick={handleScan}
            disabled={!file1}
            className="w-full rounded-2xl px-4 py-4 text-lg font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: file1 ? "#D97706" : "rgba(255,255,255,0.1)" }}
          >
            Scan and save
          </button>
        </>
      )}

      {/* ── SCANNING ─────────────────────────────────────────────────────── */}
      {step === "scanning" && (
        <div className="space-y-3">
          <p className="text-sm text-white/60">Scanning… {Math.round(progress)}%</p>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%`, background: "#D97706" }}
            />
          </div>
        </div>
      )}

      {/* ── DONE ─────────────────────────────────────────────────────────── */}
      {step === "done" && (
        <>
          {message && (
            <div
              className="rounded-2xl border p-3 text-sm"
              style={
                message.startsWith("✓")
                  ? { background: "rgba(186,117,23,0.12)", border: "1px solid rgba(186,117,23,0.3)", color: "#EF9F27" }
                  : { background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.2)", color: "#F09595" }
              }
            >
              {message}
            </div>
          )}

          {/* EVENT RESULTS — checklist */}
          {scanMode === "event_results" && eventRows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {eventRows[0]?.event ?? "Event"} results detected
                  </p>
                  <p className="mt-0.5 text-xs text-white/45">
                    {eventRows.length} swimmers · tick who to save to {swimmerName}&apos;s profile
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAll} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">All</button>
                  <button type="button" onClick={selectNone} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">None</button>
                </div>
              </div>

              <div className="space-y-2">
                {eventRows.map((row, index) => {
                  const isSelected = selectedRows.has(index);
                  const alreadySaved = savedNames.includes(row.name);
                  const isCurrentSwimmer = row.name.toLowerCase().includes(swimmerName.toLowerCase().split(" ")[0]);

                  return (
                    <button
                      key={`${row.name}-${index}`}
                      type="button"
                      onClick={() => !alreadySaved && toggleRow(index)}
                      disabled={alreadySaved}
                      className="w-full rounded-2xl border p-3 text-left transition"
                      style={
                        alreadySaved
                          ? { background: "rgba(186,117,23,0.08)", border: "1px solid rgba(186,117,23,0.2)", opacity: 0.6 }
                          : isSelected
                          ? { background: "rgba(186,117,23,0.12)", border: "1px solid rgba(186,117,23,0.4)" }
                          : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                      }
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-5 w-5 flex-shrink-0 rounded-md flex items-center justify-center"
                          style={
                            isSelected || alreadySaved
                              ? { background: "#D97706", border: "1px solid #D97706" }
                              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)" }
                          }
                        >
                          {(isSelected || alreadySaved) && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>

                        <div className="w-10 text-center">
                          <span className="text-xs text-white/40">#{row.place}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold" style={{ color: isCurrentSwimmer ? "#FDE68A" : "white" }}>
                            {row.name}
                            {isCurrentSwimmer && <span className="ml-2 text-[10px] opacity-60">your swimmer</span>}
                          </p>
                          {row.club && (
                            <p className="text-xs text-white/40">{row.club}{row.age ? ` · Age ${row.age}` : ""}</p>
                          )}
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-semibold text-white">{row.timeStr}</p>
                          {alreadySaved && <p className="text-[10px]" style={{ color: "#FDE68A" }}>Saved</p>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedRows.size > 0 && (
                <button
                  type="button"
                  onClick={handleSaveSelected}
                  disabled={savingSelected}
                  className="w-full rounded-2xl px-4 py-4 text-lg font-bold text-white transition disabled:opacity-50"
                  style={{ background: "#D97706" }}
                >
                  {savingSelected
                    ? "Saving..."
                    : `Save ${selectedRows.size} selected swimmer${selectedRows.size === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          )}

          {/* SINGLE SWIMMER MODE */}
          {scanMode === "single" && (
            <>
              {result400IM && <Result400IMCard result={result400IM} />}
              {results.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-widest text-white/40">Detected results</p>
                  {results.map((result, index) => (
                    <DetectedResultBlock
                      key={`${result.event}-${result.timeStr}-${index}`}
                      result={result}
                      swimmerName={swimmerName}
                      rawText={rawText}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={reset}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10"
          >
            Scan Another
          </button>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScreenSlot({
  label, hint, preview, inputRef, required, onChange,
}: {
  label: string;
  hint: string;
  preview: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  required?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/30 p-3 text-center transition hover:border-amber-400/50 hover:bg-white/5"
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
      {required && !preview && (
        <span
          className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider"
          style={{ background: "rgba(186,117,23,0.2)", color: "#EF9F27" }}
        >
          Required
        </span>
      )}
      {preview ? (
        <img src={preview} alt={label} className="max-h-44 rounded-xl object-contain" />
      ) : (
        <>
          <span className="text-2xl text-white/20">📷</span>
          <p className="mt-1 text-xs font-semibold text-white/55">{label}</p>
          <p className="mt-0.5 text-[10px] text-white/30">{hint}</p>
        </>
      )}
    </div>
  );
}

function DetectedResultBlock({
  result, swimmerName, rawText,
}: {
  result: ParsedSwimResult;
  swimmerName: string;
  rawText: string;
}) {
  const splits = result.splits ?? [];
  const splitMap = new Map<number, number>();
  for (const split of splits) {
    if (split.distance != null && split.splitMs != null) {
      splitMap.set(split.distance, split.splitMs);
    }
  }

  const firstHalf = splitMap.has(50) && splitMap.has(100) ? splitMap.get(50)! + splitMap.get(100)! : null;
  const secondHalf = splitMap.has(150) && splitMap.has(200) ? splitMap.get(150)! + splitMap.get(200)! : null;
  const fastest = splits.length > 0 ? Math.min(...splits.map((s) => s.splitMs)) : null;
  const slowest = splits.length > 0 ? Math.max(...splits.map((s) => s.splitMs)) : null;

  return (
    <div className="space-y-4">
      <DetectedOCRResultCard
        rawText={rawText}
        event={result.event}
        swimmer={result.name || swimmerName}
        course={result.course}
        date={result.swamAt || null}
        timeMs={result.timeMs}
        confidence={result.confidence}
      />
      {(firstHalf != null || secondHalf != null || fastest != null) && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm font-semibold text-white/70">Split insight</p>
          {firstHalf != null && <p className="mt-3 text-sm text-white/70">First 100: {formatTime(firstHalf)}</p>}
          {secondHalf != null && <p className="mt-1 text-sm text-white/70">Second 100: {formatTime(secondHalf)}</p>}
          {firstHalf != null && secondHalf != null && (
            <p className="mt-2 text-sm font-medium" style={{ color: secondHalf < firstHalf ? "#6EE7B7" : secondHalf > firstHalf ? "#FCA5A5" : "#FDE68A" }}>
              {secondHalf < firstHalf ? "🔥 Negative split" : secondHalf > firstHalf ? "🏁 Positive split" : "Even split"}
            </p>
          )}
          {fastest != null && slowest != null && (
            <p className="mt-3 text-sm text-white/55">Fastest: {formatTime(fastest)} · Slowest: {formatTime(slowest)}</p>
          )}
        </div>
      )}
    </div>
  );
}