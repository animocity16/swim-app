"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorker } from "tesseract.js";
import { supabase } from "@/lib/supabaseClient";
import { parseSwimOCRText } from "@/lib/ocrMultiEventParser";
import { parseAndSaveSwimOCR } from "@/lib/parseSwimOCRFlow";
import { parse400IMSplitsFromOCR } from "@/lib/parse400IMSplits";
import {
  parseEventResultsOCR,
  isEventResultsPage,
  type EventResultRow,
} from "@/lib/ocrEventResultsParser";
import { canonicalCourse, canonicalEventName } from "@/lib/events";

type Swimmer = {
  id: number;
  name: string;
  age: number;
  swim_club?: string | null;
  group_type?: string | null;
};

type Step = "idle" | "scanning" | "done";
type ScanMode = "single" | "event_results" | "400im" | null;

// ✅ Multi-strategy fuzzy name matching
// Handles OCR name variations vs shortened profile names
//
// Strategy 1: Exact full name match — "Mikaela Loh" = "Mikaela Loh"
// Strategy 2: Profile name is substring of OCR name
//             "Kimi Rachel" found inside "Kimi Rachel Koh"
//             "Olivia Lim" found inside "En Ning Olivia Lim"
// Strategy 3: Any word in OCR name matches profile first name
//             "Mikaela" in profile, "Mikaela" appears in OCR name
// Strategy 4: OCR first name + surname initial matches profile
//             "Mikaela L" matches "Mikaela Loh"
function fuzzyMatchSwimmer(ocrName: string, swimmers: Swimmer[]): Swimmer | null {
  const clean = ocrName.trim().toLowerCase();
  const ocrWords = clean.split(/\s+/);

  // Strategy 1: Exact full name
  const exact = swimmers.find((s) => s.name.toLowerCase() === clean);
  if (exact) return exact;

  // Strategy 2: Profile full name appears as substring in OCR name
  // e.g. profile "Olivia Lim" found inside OCR "En Ning Olivia Lim"
  // e.g. profile "Kimi Rachel" found inside OCR "Kimi Rachel Koh"
  const bySubstring = swimmers.find((s) => {
    const profileName = s.name.toLowerCase();
    return clean.includes(profileName);
  });
  if (bySubstring) return bySubstring;

  // Strategy 3: Any word in OCR name matches the first word of a profile
  // e.g. OCR has "Mikaela" somewhere and profile first name is "Mikaela"
  const byFirstName = swimmers.find((s) => {
    const profileFirst = s.name.toLowerCase().split(/\s+/)[0];
    return ocrWords.includes(profileFirst);
  });
  if (byFirstName) return byFirstName;

  // Strategy 4: OCR first word + surname initial matches profile first word + initial
  // e.g. OCR "Tessa N..." matches profile "Tessa Ng"
  const ocrFirst = ocrWords[0];
  const ocrSurnameInitial = ocrWords[1]?.[0] ?? null;

  if (ocrFirst) {
    const byInitial = swimmers.find((s) => {
      const parts = s.name.toLowerCase().split(/\s+/);
      const profileFirst = parts[0];
      const profileSurnameInitial = parts[1]?.[0] ?? null;
      if (profileFirst !== ocrFirst) return false;
      if (!profileSurnameInitial || !ocrSurnameInitial) return true; // first name only match
      return profileSurnameInitial === ocrSurnameInitial;
    });
    if (byInitial) return byInitial;
  }

  return null;
}

function formatMs(ms?: number | null) {
  if (ms == null || isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  { bg: "#92400E", text: "#FDE68A" },
  { bg: "#78350F", text: "#FCD34D" },
  { bg: "#854F0B", text: "#FAC775" },
  { bg: "#633806", text: "#EF9F27" },
  { bg: "#412402", text: "#BA7517" },
];

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export default function ScanPage() {
  const router = useRouter();
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [primarySwimmers, setPrimarySwimmers] = useState<Swimmer[]>([]);
  const [loadingSwimmers, setLoadingSwimmers] = useState(true);

  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [rawText, setRawText] = useState("");
  const [scanMode, setScanMode] = useState<ScanMode>(null);

  // Single swim state
  const [detectedEvent, setDetectedEvent] = useState<string | null>(null);
  const [detectedTime, setDetectedTime] = useState<string | null>(null);
  const [matchedSwimmer, setMatchedSwimmer] = useState<Swimmer | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [singleSaved, setSingleSaved] = useState(false);

  // Event results state
  const [eventRows, setEventRows] = useState<EventResultRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [savingSelected, setSavingSelected] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);

  const ref1 = useRef<HTMLInputElement | null>(null);
  const ref2 = useRef<HTMLInputElement | null>(null);

  useEffect(() => { void loadSwimmers(); }, []);

  async function loadSwimmers() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { router.replace("/login"); return; }

    // ✅ Load ALL swimmers (primary + following) for fuzzy matching
    // But only show primary swimmers in the picker UI
    const { data } = await supabase
      .from("swimmers")
      .select("id, name, age, swim_club, group_type")
      .order("name", { ascending: true });

    const all = (data as Swimmer[]) || [];
    setSwimmers(all);
    setPrimarySwimmers(all.filter((s) => s.group_type === "primary"));
    setLoadingSwimmers(false);
  }

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
    setStep("idle"); setProgress(0); setMessage(""); setRawText("");
    setScanMode(null); setDetectedEvent(null);
    setDetectedTime(null); setMatchedSwimmer(null);
    setShowPicker(false); setSingleSaved(false);
    setEventRows([]); setSelectedRows(new Set());
    setSavingSelected(false); setSavedNames([]);
    if (ref1.current) ref1.current.value = "";
    if (ref2.current) ref2.current.value = "";
  }

  function toggleRow(index: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  // ✅ Save single swim to a specific swimmer
  async function saveSingleToSwimmer(swimmer: Swimmer) {
    try {
      const saveResult = await parseAndSaveSwimOCR(rawText, {
        swimmerId: swimmer.id,
        swimmerName: swimmer.name,
        defaultCourse: "LCM",
      });
      if (saveResult.savedCount === 0) {
        setMessage(`⚠️ ${saveResult.errors[0] || "Nothing saved."}`);
      } else {
        setMessage(`✓ Saved to ${swimmer.name} — ${saveResult.savedCount} swim(s), ${saveResult.splitSavedCount} split row(s).`);
        setSingleSaved(true);
      }
    } catch (err: any) {
      setMessage(`⚠️ Save error: ${err?.message ?? "Unknown"}`);
    }
    setShowPicker(false);
    setMatchedSwimmer(swimmer);
  }

  // ✅ Save selected event results rows
  async function handleSaveSelected() {
    if (selectedRows.size === 0) return;
    setSavingSelected(true);
    const saved: string[] = [];
    const errors: string[] = [];

    for (const index of Array.from(selectedRows)) {
      const row = eventRows[index];
      if (!row) continue;

      // ✅ Match against ALL swimmers (primary + following)
      const matched = fuzzyMatchSwimmer(row.name, swimmers);
      if (!matched) {
        errors.push(`${row.name}: no matching swimmer profile`);
        continue;
      }

      const eventName = canonicalEventName(row.event ?? "");
      const courseName = canonicalCourse(row.course ?? "LCM");
      if (!eventName) { errors.push(`${row.name}: no event`); continue; }

      const { data: existing } = await supabase
        .from("swim_times").select("id")
        .eq("swimmer_id", matched.id)
        .eq("event", eventName).eq("course", courseName)
        .eq("time_ms", row.timeMs).limit(1);

      if (existing && existing.length > 0) {
        errors.push(`${row.name}: already saved`);
        continue;
      }

      const { error } = await supabase.from("swim_times").insert({
        swimmer_id: matched.id,
        event: eventName,
        course: courseName,
        time_ms: row.timeMs,
        place: row.place ?? null,
        meet_name: row.meetName ?? null,
        swam_at: row.swamAt ?? null,
      });

      error ? errors.push(`${row.name}: ${error.message}`) : saved.push(row.name);
    }

    setSavedNames((prev) => [...prev, ...saved]);
    setMessage(
      saved.length > 0
        ? `✓ Saved ${saved.length} result(s)${errors.length > 0 ? ` · Issues: ${errors.join(", ")}` : ""}`
        : `⚠️ Nothing saved. ${errors.join(", ")}`
    );
    setSavingSelected(false);
    setSelectedRows(new Set());
  }

  async function handleScan() {
    if (!file1) return;
    setStep("scanning");
    setProgress(0); setMessage(""); setRawText("");
    setScanMode(null); setDetectedEvent(null);
    setDetectedTime(null); setMatchedSwimmer(null); setShowPicker(false);
    setSingleSaved(false); setEventRows([]); setSelectedRows(new Set()); setSavedNames([]);

    try {
      const files = [file1, file2].filter(Boolean) as File[];
      let combined = "";

      for (let i = 0; i < files.length; i++) {
        const worker = await createWorker("eng", 1, {
          logger: (m: any) => {
            if (m.status === "recognizing text") {
              setProgress((i / files.length) * 100 + (m.progress * 100) / files.length);
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

      if (isEventPage) {
        // ✅ EVENT RESULTS PAGE — show checklist
        setScanMode("event_results");
        const parsed = parseEventResultsOCR(combined);
        setEventRows(parsed.results);

        // Pre-tick rows that fuzzy match any swimmer in the app
        const preSelected = new Set<number>();
        parsed.results.forEach((row, idx) => {
          if (fuzzyMatchSwimmer(row.name, swimmers)) preSelected.add(idx);
        });
        setSelectedRows(preSelected);
        setMessage(parsed.results.length === 0 ? "⚠️ No results detected." : "");

      } else {
        // ✅ SINGLE SWIM DETAIL — try to auto-match swimmer name
        setScanMode(is400IM ? "400im" : "single");
        const results = parseSwimOCRText(combined, { swimmerName: "" });
        const first = results[0];

        if (first) {
          setDetectedEvent(first.event);
          setDetectedTime(first.timeStr ?? null);
          const ocrName = first.name ?? null;

          if (ocrName) {
            // ✅ Try fuzzy match against ALL swimmers
            const matched = fuzzyMatchSwimmer(ocrName, swimmers);
            if (matched) {
              setMatchedSwimmer(matched);
              await saveSingleToSwimmer(matched);
            } else {
              // No match — show picker with primary swimmers only
              setShowPicker(true);
              setMessage(`Could not match "${ocrName}" — please select who to save to.`);
            }
          } else {
            setShowPicker(true);
            setMessage("Couldn't detect swimmer name — please select who to save to.");
          }
        } else {
          setMessage("⚠️ No result detected. Try again with a clearer screenshot.");
        }
      }

      setStep("done");
    } catch (err: any) {
      setMessage(`❌ ${err?.message ?? "Unknown error"}`);
      setStep("done");
    }
  }

  if (loadingSwimmers) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
            SwimScan
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            Scan result
          </h1>
        </div>

        {/* No swimmers state */}
        {primarySwimmers.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-base font-semibold text-white">No swimmers added yet</p>
            <p className="mt-1 text-sm text-white/40">Add a swimmer in My Kids first.</p>
            <button
              type="button"
              onClick={() => router.push("/swimmers")}
              className="mt-4 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white"
              style={{ background: "#D97706" }}
            >
              Go to My Kids
            </button>
          </div>
        )}

        {/* IDLE — upload UI */}
        {step === "idle" && primarySwimmers.length > 0 && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-3 text-sm text-white/50 space-y-1"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="font-medium text-white/70">Two scan modes — auto detected:</p>
              <p>📋 Swim detail — single result with splits, name matched automatically</p>
              <p>📊 Event results — full rankings, pre-ticks your swimmers</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SlotButton
                label="Screen 1" hint="Required" preview={preview1}
                inputRef={ref1} required
                onChange={(e) => handleFile(e, setFile1, setPreview1)}
              />
              <SlotButton
                label="Screen 2" hint="Optional" preview={preview2}
                inputRef={ref2}
                onChange={(e) => handleFile(e, setFile2, setPreview2)}
              />
            </div>

            <button
              type="button"
              onClick={handleScan}
              disabled={!file1}
              className="w-full rounded-2xl py-4 text-lg font-bold text-white transition disabled:opacity-40"
              style={{ background: file1 ? "#D97706" : "rgba(255,255,255,0.1)" }}
            >
              Scan
            </button>
          </div>
        )}

        {/* SCANNING */}
        {step === "scanning" && (
          <div className="space-y-4 pt-8">
            <p className="text-center text-lg font-semibold text-white">
              Scanning… {Math.round(progress)}%
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${progress}%`, background: "#D97706" }}
              />
            </div>
            <p className="text-center text-sm text-white/40">Reading screenshot</p>
          </div>
        )}

        {/* DONE */}
        {step === "done" && (
          <div className="space-y-4">

            {/* Message */}
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

            {/* SINGLE SWIM — auto matched and saved */}
            {scanMode !== "event_results" && matchedSwimmer && singleSaved && (
              <div
                className="rounded-2xl p-4 space-y-1"
                style={{ background: "rgba(186,117,23,0.08)", border: "1px solid rgba(186,117,23,0.2)" }}
              >
                <p className="text-xs text-white/40 uppercase tracking-widest">Saved to</p>
                <p className="text-base font-semibold text-white">{matchedSwimmer.name}</p>
                {detectedEvent && <p className="text-sm text-white/50">{detectedEvent}</p>}
                {detectedTime && <p className="text-2xl font-bold text-white">{detectedTime}</p>}
              </div>
            )}

            {/* SINGLE SWIM — no match, show picker */}
            {scanMode !== "event_results" && showPicker && (
              <div className="space-y-3">
                {(detectedEvent || detectedTime) && (
                  <div
                    className="rounded-2xl p-3"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {detectedEvent && <p className="text-sm text-white/60">{detectedEvent}</p>}
                    {detectedTime && <p className="text-2xl font-bold text-white mt-1">{detectedTime}</p>}
                  </div>
                )}
                <p className="text-sm text-white/50">Who should this be saved to?</p>
                {primarySwimmers.map((swimmer, index) => {
                  const colors = avatarColor(index);
                  return (
                    <button
                      key={swimmer.id}
                      type="button"
                      onClick={() => void saveSingleToSwimmer(swimmer)}
                      className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
                    >
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                        style={{ background: colors.bg, color: colors.text }}
                      >
                        {getInitials(swimmer.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{swimmer.name}</p>
                        <p className="text-xs text-white/40">
                          Age {swimmer.age}{swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* EVENT RESULTS — checklist */}
            {scanMode === "event_results" && eventRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {eventRows[0]?.event ?? "Event"} results
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {eventRows.length} swimmers · tick who to save
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRows(new Set(eventRows.map((_, i) => i)))}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRows(new Set())}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
                    >
                      None
                    </button>
                  </div>
                </div>

                {eventRows.map((row, index) => {
                  const isSelected = selectedRows.has(index);
                  const alreadySaved = savedNames.includes(row.name);
                  const hasProfile = !!fuzzyMatchSwimmer(row.name, swimmers);

                  return (
                    <button
                      key={index}
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
                          className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center"
                          style={
                            isSelected || alreadySaved
                              ? { background: "#D97706", border: "1px solid #D97706" }
                              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)" }
                          }
                        >
                          {(isSelected || alreadySaved) && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <span className="text-xs text-white/30 w-8 flex-shrink-0">#{row.place}</span>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-semibold truncate"
                            style={{ color: hasProfile ? "#EF9F27" : "white" }}
                          >
                            {row.name}
                            {hasProfile && (
                              <span className="ml-2 text-[10px] opacity-60">in app</span>
                            )}
                          </p>
                          {row.club && (
                            <p className="text-xs text-white/30">
                              {row.club}{row.age ? ` · Age ${row.age}` : ""}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-white flex-shrink-0">{row.timeStr}</p>
                      </div>
                    </button>
                  );
                })}

                {selectedRows.size > 0 && (
                  <button
                    type="button"
                    onClick={handleSaveSelected}
                    disabled={savingSelected}
                    className="w-full rounded-2xl py-4 text-lg font-bold text-white transition disabled:opacity-50"
                    style={{ background: "#D97706" }}
                  >
                    {savingSelected
                      ? "Saving..."
                      : `Save ${selectedRows.size} result${selectedRows.size === 1 ? "" : "s"}`}
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={reset}
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white/60 transition hover:bg-white/10"
            >
              Scan another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SlotButton({
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
      className="relative flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-3 text-center transition hover:border-amber-400/50 hover:bg-white/5"
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
        <img src={preview} alt={label} className="max-h-40 rounded-xl object-contain" />
      ) : (
        <>
          <span className="text-2xl text-white/15">📷</span>
          <p className="mt-1 text-xs font-semibold text-white/40">{label}</p>
          <p className="mt-0.5 text-[10px] text-white/20">{hint}</p>
        </>
      )}
    </div>
  );
}