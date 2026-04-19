"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorker } from "tesseract.js";
import { parseSwimOCRText, type ParsedSwimResult } from "@/lib/ocrMultiEventParser";
import { detectMeetType } from "@/lib/parseSwimOCRFlow";
import { parse400IMSplitsFromOCR } from "@/lib/parse400IMSplits";
import {
  parseEventResultsOCR,
  isEventResultsPage,
  type EventResultRow,
} from "@/lib/ocrEventResultsParser";
import { canonicalCourse, canonicalEventName } from "@/lib/events";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type Swimmer = {
  id: number;
  name: string;
  age: number;
  swim_club?: string | null;
  school?: string | null;
  group_type?: string | null;
};

type Step = "idle" | "scanning" | "done";
type ScanMode = "single" | "event_results" | "400im" | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fuzzyMatchSwimmer(ocrName: string, swimmers: Swimmer[]): Swimmer | null {
  const clean = ocrName.trim().toLowerCase();
  const ocrWords = clean.split(/\s+/);

  const exact = swimmers.find((s) => s.name.toLowerCase() === clean);
  if (exact) return exact;

  const bySubstring = swimmers.find((s) => clean.includes(s.name.toLowerCase()));
  if (bySubstring) return bySubstring;

  const byFirstName = swimmers.find((s) => {
    const profileFirst = s.name.toLowerCase().split(/\s+/)[0];
    return ocrWords.includes(profileFirst);
  });
  if (byFirstName) return byFirstName;

  const ocrFirst = ocrWords[0];
  const ocrSurnameInitial = ocrWords[1]?.[0] ?? null;

  if (ocrFirst) {
    const byInitial = swimmers.find((s) => {
      const parts = s.name.toLowerCase().split(/\s+/);
      const profileFirst = parts[0];
      const profileSurnameInitial = parts[1]?.[0] ?? null;
      if (profileFirst !== ocrFirst) return false;
      if (!profileSurnameInitial || !ocrSurnameInitial) return true;
      return profileSurnameInitial === ocrSurnameInitial;
    });
    if (byInitial) return byInitial;
  }

  return null;
}

/** Parse a user-typed time string like "1:27.54" or "35.76" into milliseconds */
function parseTimeStr(str: string): number | null {
  const s = str.trim();
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(s)) {
    const [mm, rest] = s.split(":");
    const [sec, hun] = rest.split(".");
    return Number(mm) * 60_000 + Number(sec) * 1_000 + Number(hun) * 10;
  }
  if (/^\d{1,2}\.\d{2}$/.test(s)) {
    const [sec, hun] = s.split(".");
    return Number(sec) * 1_000 + Number(hun) * 10;
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

// ─── Upload slot button ───────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

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
  const [showInfo, setShowInfo] = useState(false);

  // ── Single mode state ──────────────────────────────────────────────────────
  // After scan: show review card (event + editable time) then swimmer picker
  const [parsedResult, setParsedResult] = useState<ParsedSwimResult | null>(null);
  const [detectedEvent, setDetectedEvent] = useState<string | null>(null);
  const [editedTime, setEditedTime] = useState<string>("");       // user-editable
  const [timeError, setTimeError] = useState<string | null>(null);
  const [autoMatchedSwimmer, setAutoMatchedSwimmer] = useState<Swimmer | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSwimmer, setSavedSwimmer] = useState<Swimmer | null>(null);

  // ── Event results mode state ───────────────────────────────────────────────
  const [eventRows, setEventRows] = useState<EventResultRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [savingSelected, setSavingSelected] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [rowTypes, setRowTypes] = useState<Record<number, "mine" | "follow">>({});

  const ref1 = useRef<HTMLInputElement | null>(null);
  const ref2 = useRef<HTMLInputElement | null>(null);

  useEffect(() => { void loadSwimmers(); }, []);

  async function loadSwimmers() {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      await new Promise((r) => setTimeout(r, 800));
      session = (await supabase.auth.getSession()).data.session;
    }
    if (!session) { router.replace("/login"); return; }

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
    setScanMode(null);
    setParsedResult(null); setDetectedEvent(null);
    setEditedTime(""); setTimeError(null);
    setAutoMatchedSwimmer(null); setShowPicker(false);
    setIsSaving(false); setSavedSwimmer(null);
    setEventRows([]); setSelectedRows(new Set());
    setSavingSelected(false); setSavedNames([]); setRowTypes({});
    setShowInfo(false);
    if (ref1.current) ref1.current.value = "";
    if (ref2.current) ref2.current.value = "";
  }

  // ── Save a single result directly (no re-parse) ────────────────────────────
  // This is called after user confirms the time and picks a swimmer.
  // Saving directly avoids OCR mis-reads being committed without review.

  async function saveSingleDirectly(swimmer: Swimmer) {
    if (!parsedResult) return;

    const confirmedMs = parseTimeStr(editedTime);
    if (!confirmedMs) {
      setTimeError("Please enter a valid time (e.g. 35.76 or 1:27.54)");
      return;
    }
    setTimeError(null);
    setIsSaving(true);

    const eventName = canonicalEventName(parsedResult.event);
    const courseName = canonicalCourse(parsedResult.course);

    if (!eventName) {
      setMessage("⚠️ Could not determine event name.");
      setIsSaving(false);
      return;
    }

    // Duplicate check
    const { data: existing } = await supabase
      .from("swim_times").select("id")
      .eq("swimmer_id", swimmer.id)
      .eq("event", eventName)
      .eq("course", courseName)
      .eq("time_ms", confirmedMs)
      .limit(1);

    if (existing && existing.length > 0) {
      setMessage("This result is already saved.");
      setSavedSwimmer(swimmer);
      setShowPicker(false);
      setIsSaving(false);
      return;
    }

    const meetType = detectMeetType(rawText, parsedResult.meetName ?? null);

    const { error } = await supabase.from("swim_times").insert({
      swimmer_id: swimmer.id,
      event: eventName,
      course: courseName,
      time_ms: confirmedMs,
      place: parsedResult.place ?? null,
      meet_name: parsedResult.meetName ?? null,
      swam_at: parsedResult.swamAt ?? null,
      meet_type: meetType,
    });

    if (error) {
      setMessage(`⚠️ ${error.message}`);
    } else {
      setMessage(`✓ Saved to ${swimmer.name}`);
      setSavedSwimmer(swimmer);
      setShowPicker(false);
      setAutoMatchedSwimmer(swimmer);
    }

    setIsSaving(false);
  }

  // ── Event results: save selected rows ─────────────────────────────────────

  function toggleRow(index: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  async function handleSaveSelected() {
    if (selectedRows.size === 0) return;
    setSavingSelected(true);
    const saved: string[] = [];
    const errors: string[] = [];

    const firstClub = eventRows[0]?.club ?? null;
    const meetType = detectMeetType(rawText, firstClub);

    for (const index of Array.from(selectedRows)) {
      const row = eventRows[index];
      if (!row) continue;

      const matched = fuzzyMatchSwimmer(row.name, swimmers);
      if (!matched) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { errors.push(`${row.name}: not logged in`); continue; }

        let schoolName: string | null = null;
        let clubName: string | null = null;
        if (row.club) {
          const { data: schoolRow } = await supabase
            .from("sg_schools").select("full_name")
            .eq("code", row.club.trim().toUpperCase()).maybeSingle();
          if (schoolRow) { schoolName = schoolRow.full_name; }
          else { clubName = row.club; }
        }

        const { data: newSwimmer, error: createErr } = await supabase
          .from("swimmers")
          .insert({
            user_id: user.id,
            name: row.name.trim(),
            age: row.age ?? null,
            swim_club: clubName,
            school: schoolName,
            group_type: rowTypes[index] === "mine" ? "primary" : "following",
          })
          .select().single();

        if (createErr || !newSwimmer) {
          errors.push(`${row.name}: couldn't create profile${createErr ? ` (${createErr.message})` : ""}`);
          continue;
        }

        await loadSwimmers();
        const eventName2 = canonicalEventName(row.event ?? "");
        const courseName2 = canonicalCourse(row.course ?? "LCM");
        if (!eventName2) { errors.push(`${row.name}: no event`); continue; }
        await supabase.from("swim_times").insert({
          swimmer_id: newSwimmer.id,
          event: eventName2,
          course: courseName2,
          time_ms: row.timeMs,
          place: row.place ?? null,
          meet_name: row.meetName ?? null,
          swam_at: row.swamAt ?? null,
          meet_type: meetType,
        });
        saved.push(`${row.name} (added)`);
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

      if (existing && existing.length > 0) { errors.push(`${row.name}: already saved`); continue; }

      if (row.club && meetType === "NSG" && !matched.school) {
        const { data: schoolRow } = await supabase
          .from("sg_schools").select("full_name")
          .eq("code", row.club.trim().toUpperCase()).maybeSingle();
        if (schoolRow) {
          await supabase.from("swimmers").update({ school: schoolRow.full_name }).eq("id", matched.id);
        }
      }

      const { error } = await supabase.from("swim_times").insert({
        swimmer_id: matched.id,
        event: eventName,
        course: courseName,
        time_ms: row.timeMs,
        place: row.place ?? null,
        meet_name: row.meetName ?? null,
        swam_at: row.swamAt ?? null,
        meet_type: meetType,
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

  // ── Main scan handler ─────────────────────────────────────────────────────

  async function handleScan() {
    if (!file1) return;
    setStep("scanning");
    setProgress(0); setMessage(""); setRawText("");
    setScanMode(null);
    setParsedResult(null); setDetectedEvent(null);
    setEditedTime(""); setTimeError(null);
    setAutoMatchedSwimmer(null); setShowPicker(false);
    setSavedSwimmer(null);
    setEventRows([]); setSelectedRows(new Set()); setSavedNames([]); setRowTypes({});

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
      console.log("RAW OCR:", combined);
      const isEventPage = isEventResultsPage(combined);

      if (isEventPage) {
        // ── Event results mode ────────────────────────────────────────────
        setScanMode("event_results");
        const parsed = parseEventResultsOCR(combined);
        setEventRows(parsed.results);

        const preSelected = new Set<number>();
        parsed.results.forEach((row, idx) => {
          if (fuzzyMatchSwimmer(row.name, swimmers)) preSelected.add(idx);
        });
        setSelectedRows(preSelected);
        setMessage(parsed.results.length === 0 ? "⚠️ No results detected." : "");

      } else {
        // ── Single swimmer mode ───────────────────────────────────────────
        setScanMode("single");
        const results = parseSwimOCRText(combined, { swimmerName: "" });
        const first = results[0];

        if (!first) {
          setMessage("⚠️ No result detected. Try again with a clearer screenshot.");
        } else {
          setParsedResult(first);
          setDetectedEvent(first.event);
          setEditedTime(first.timeStr ?? "");

          // Try to auto-match swimmer from OCR-extracted name
          const ocrName = first.name ?? null;
          if (ocrName && ocrName.trim().length > 0) {
            const matched = fuzzyMatchSwimmer(ocrName, swimmers);
            if (matched) {
              setAutoMatchedSwimmer(matched);
              setShowPicker(false);
              // ✅ Don't auto-save — show review card first so user can verify the time
            } else {
              setShowPicker(true);
            }
          } else {
            setShowPicker(true);
          }
        }
      }

      setStep("done");
    } catch (err: any) {
      setMessage(`❌ ${err?.message ?? "Unknown error"}`);
      setStep("done");
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

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

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
              SwimScan
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
              Scan result
            </h1>
          </div>
          {step === "idle" && primarySwimmers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              className="mt-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-white/40 transition hover:bg-white/10 hover:text-white/70"
            >
              ⓘ
            </button>
          )}
        </div>

        {/* ── Info panel ────────────────────────────────────────────────────── */}
        {showInfo && step === "idle" && (
          <div
            className="rounded-2xl p-4 space-y-2 text-sm text-white/55"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="font-medium text-white/70">Two scan modes — auto detected:</p>
            <p>📋 <span className="text-white/70">Swim detail</span> — single result, review time before saving</p>
            <p>📊 <span className="text-white/70">Event results</span> — full rankings, tick who to save</p>
            <p className="pt-1 text-white/35 text-xs">Screen 2 is optional — use for splits that continue to a second screenshot.</p>
          </div>
        )}

        {/* ── No swimmers ───────────────────────────────────────────────────── */}
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

        {/* ── IDLE — upload UI ──────────────────────────────────────────────── */}
        {step === "idle" && primarySwimmers.length > 0 && (
          <div className="space-y-4">
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

        {/* ── SCANNING ─────────────────────────────────────────────────────── */}
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

        {/* ── DONE ─────────────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="space-y-4">

            {/* Status message */}
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

            {/* ── SINGLE MODE ─────────────────────────────────────────────── */}
            {scanMode === "single" && parsedResult && !savedSwimmer && (
              <div className="space-y-3">

                {/* ✅ Review card — event + editable time */}
                <div
                  className="rounded-2xl p-4 space-y-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/40">Detected result</p>
                    <p className="mt-1 text-base font-semibold text-white">{detectedEvent}</p>
                    {parsedResult.meetName && (
                      <p className="text-xs text-white/35 mt-0.5">{parsedResult.meetName}</p>
                    )}
                  </div>

                  {/* Editable time field */}
                  <div>
                    <p className="text-xs text-white/40 mb-1.5">Time — tap to edit if incorrect</p>
                    <input
                      type="text"
                      value={editedTime}
                      onChange={(e) => { setEditedTime(e.target.value); setTimeError(null); }}
                      placeholder="e.g. 35.76 or 1:27.54"
                      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-2xl font-bold text-white placeholder-white/20 outline-none focus:border-amber-400/50"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    />
                    {timeError && (
                      <p className="mt-1 text-xs text-red-300">{timeError}</p>
                    )}
                  </div>
                </div>

                {/* Auto-matched swimmer */}
                {autoMatchedSwimmer && !showPicker && (
                  <div className="space-y-2">
                    <p className="text-sm text-white/50">Save to</p>
                    <div
                      className="flex items-center gap-3 rounded-2xl p-3"
                      style={{ background: "rgba(186,117,23,0.1)", border: "1px solid rgba(186,117,23,0.3)" }}
                    >
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                        style={{ background: avatarColor(0).bg, color: avatarColor(0).text }}
                      >
                        {getInitials(autoMatchedSwimmer.name)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{autoMatchedSwimmer.name}</p>
                        <p className="text-xs text-white/40">
                          Age {autoMatchedSwimmer.age}{autoMatchedSwimmer.swim_club ? ` · ${autoMatchedSwimmer.swim_club}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setAutoMatchedSwimmer(null); setShowPicker(true); }}
                        className="text-xs text-white/35 underline"
                      >
                        Change
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveSingleDirectly(autoMatchedSwimmer)}
                      disabled={isSaving}
                      className="w-full rounded-2xl py-4 text-base font-bold text-white transition disabled:opacity-50"
                      style={{ background: "#D97706" }}
                    >
                      {isSaving ? "Saving…" : `Save to ${autoMatchedSwimmer.name}`}
                    </button>
                  </div>
                )}

                {/* Swimmer picker (no auto-match or user tapped "Change") */}
                {showPicker && (
                  <div className="space-y-2">
                    <p className="text-sm text-white/50">Who should this be saved to?</p>
                    {primarySwimmers.map((swimmer, index) => {
                      const colors = avatarColor(index);
                      return (
                        <button
                          key={swimmer.id}
                          type="button"
                          onClick={() => void saveSingleDirectly(swimmer)}
                          disabled={isSaving}
                          className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10 disabled:opacity-50"
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
              </div>
            )}

            {/* ── SINGLE MODE — saved confirmation ───────────────────────── */}
            {scanMode === "single" && savedSwimmer && (
              <div
                className="rounded-2xl p-4 space-y-1"
                style={{ background: "rgba(186,117,23,0.08)", border: "1px solid rgba(186,117,23,0.2)" }}
              >
                <p className="text-xs text-white/40 uppercase tracking-widest">Saved to</p>
                <p className="text-base font-semibold text-white">{savedSwimmer.name}</p>
                {detectedEvent && <p className="text-sm text-white/50">{detectedEvent}</p>}
                {editedTime && <p className="text-2xl font-bold text-white">{editedTime}</p>}
              </div>
            )}

            {/* ── EVENT RESULTS MODE ──────────────────────────────────────── */}
            {scanMode === "event_results" && eventRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {eventRows[0]?.event ?? "Event"} results
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
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
                  const isCurrentSwimmer = !!fuzzyMatchSwimmer(row.name, primarySwimmers);

                  return (
                    <div key={`${row.name}-${index}`} className="space-y-1.5">
                      <button
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

                      {/* "My Swimmer" / "Following" toggle for unrecognised names */}
                      {isSelected && !fuzzyMatchSwimmer(row.name, swimmers) && (
                        <div className="flex gap-2 pl-2">
                          <button
                            type="button"
                            onClick={() => setRowTypes((p) => ({ ...p, [index]: "mine" }))}
                            className="rounded-xl px-3 py-1.5 text-xs font-medium transition"
                            style={
                              rowTypes[index] === "mine"
                                ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)" }
                            }
                          >
                            👶 My Swimmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setRowTypes((p) => ({ ...p, [index]: "follow" }))}
                            className="rounded-xl px-3 py-1.5 text-xs font-medium transition"
                            style={
                              rowTypes[index] === "follow"
                                ? { background: "rgba(99,179,237,0.2)", border: "1px solid rgba(144,205,244,0.4)", color: "#90CDF4" }
                                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)" }
                            }
                          >
                            👁 Following
                          </button>
                        </div>
                      )}
                    </div>
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
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10"
            >
              Scan another
            </button>
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}