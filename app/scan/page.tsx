"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorker } from "tesseract.js";
import { parseSwimOCRText, type ParsedSwimResult } from "@/lib/ocrMultiEventParser";

import {
  parseEventResultsOCR,
  isEventResultsPage,
  type EventResultRow,
} from "@/lib/ocrEventResultsParser";
import {
  parseSwimmerScheduleOCR,
  isSwimmerSchedulePage,
  type ScheduleResultRow,
} from "@/lib/ocrSwimmerScheduleParser";
import { canonicalCourse, canonicalEventName } from "@/lib/events";
import { supabase } from "@/lib/supabaseClient";
import SpreadsheetImport from "./SpreadsheetImport";


// ─── Meet name presets ────────────────────────────────────────────────────────

const CUSTOM_MEETS_KEY = "natrix_custom_meets";

function getMeetPresets(): string[] {
  const currentYear = new Date().getFullYear();
  const snagNumber = 56 + (currentYear - 2026);
  const jicNumber  = 39 + (currentYear - 2026);
  const snscNumber = 21 + (currentYear - 2026);
  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  return [
    "Swim Series 1",
    "Swim Series 2",
    `${ordinal(snagNumber)} SNAG ${currentYear}`,
    `NSG ${currentYear}`,
    `Pesta Sukan ${currentYear}`,
    `ETC ${currentYear}`,
    `${ordinal(jicNumber)} JIC ${currentYear}`,
    `${ordinal(snscNumber)} SNSC ${currentYear}`,
    "Club Time Trial",
    "Time Trial",
  ];
}

function loadCustomMeets(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MEETS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function saveCustomMeet(name: string) {
  try {
    const existing = loadCustomMeets();
    const trimmed = name.trim();
    if (!trimmed || existing.includes(trimmed)) return;
    localStorage.setItem(CUSTOM_MEETS_KEY, JSON.stringify([trimmed, ...existing].slice(0, 20)));
  } catch {}
}

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
type ScanMode = "single" | "event_results" | "swimmer_schedule" | null;
type Source = "screenshot" | "spreadsheet";
type MeetCourse = "LCM" | "SCM";

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

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function stripNamePrefix(name: string): string {
  return name.replace(/^(INS|SCR|DNS|DNF|DQ|DSQ|NT|NS|HD|WD)\s+/i, "").trim();
}

const GARBAGE_NAME_WORDS = /\b(place|time|heat|lane|finals?|nals|prelims?|rank|split|total|detail|result|event|swim)\b/i;

function isValidPersonName(name: string): boolean {
  const t = name.trim();
  if (t.length < 3 || t.length > 50) return false;
  if (!/^[A-Za-z ,.'"-]+$/.test(t)) return false;
  if (!t.includes(" ")) return false;
  if (/^[A-Z\s]+$/.test(t)) return false;
  if (GARBAGE_NAME_WORDS.test(t)) return false;
  return true;
}

function detectMeetType(rawText: string, hint: string | null): string {
  const combined = ((hint ?? "") + " " + rawText).toLowerCase();
  if (/\bnsg\b|national school games/i.test(combined)) return "NSG";
  if (/\bsnag\b|singapore national age group|national age group/i.test(combined)) return "SNAG";
  return "CLUB";
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

// ─── Upload slot ──────────────────────────────────────────────────────────────

function SlotButton({
  label, hint, preview, inputRef, required, onChange,
}: {
  label: string; hint: string; preview: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  required?: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/30 p-2 text-center transition hover:border-amber-400/50 hover:bg-white/5"
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
      {required && !preview && (
        <span className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[8px] uppercase tracking-wider"
          style={{ background: "rgba(186,117,23,0.2)", color: "#EF9F27" }}>
          Required
        </span>
      )}
      {preview ? (
        <img src={preview} alt={label} className="max-h-36 rounded-xl object-contain" />
      ) : (
        <>
          <span className="text-xl text-white/20">📷</span>
          <p className="mt-1 text-[11px] font-semibold text-white/55">{label}</p>
          <p className="mt-0.5 text-[9px] text-white/30">{hint}</p>
        </>
      )}
    </div>
  );
}

// ─── Source picker ────────────────────────────────────────────────────────────

function SourcePicker({ source, onChange }: { source: Source; onChange: (s: Source) => void }) {
  const options: { value: Source; icon: string; label: string; hint: string }[] = [
    { value: "screenshot", icon: "📷", label: "Screenshot", hint: "Meet Mobile" },
    { value: "spreadsheet", icon: "📊", label: "Spreadsheet", hint: "Bulk import" },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-1.5 rounded-2xl p-1.5"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {options.map((opt) => {
        const active = source === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 text-xs font-semibold transition"
            style={active
              ? { background: "#D97706", color: "#fff", boxShadow: "0 2px 8px rgba(217,119,6,0.3)" }
              : { background: "transparent", color: "rgba(255,255,255,0.45)" }}
          >
            <span className="flex items-center gap-1.5">
              <span className="text-sm">{opt.icon}</span>
              <span>{opt.label}</span>
            </span>
            <span className="text-[10px] font-normal opacity-70">{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScanPage() {
  const router = useRouter();
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [primarySwimmers, setPrimarySwimmers] = useState<Swimmer[]>([]);
  const [loadingSwimmers, setLoadingSwimmers] = useState(true);

  const [source, setSource] = useState<Source>("screenshot");

  // ── Meet course — persists across resets (set once per session/meet) ───────
  const [meetCourse, setMeetCourse] = useState<MeetCourse>("LCM");

  // ── File slots ────────────────────────────────────────────────────────────
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [file3, setFile3] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [preview3, setPreview3] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [rawText, setRawText] = useState("");
  const [scanMode, setScanMode] = useState<ScanMode>(null);
  const [showInfo, setShowInfo] = useState(false);

  // ── Single mode ───────────────────────────────────────────────────────────
  const [parsedResult, setParsedResult] = useState<ParsedSwimResult | null>(null);
  const [detectedEvent, setDetectedEvent] = useState<string | null>(null);
  const [editedTime, setEditedTime] = useState<string>("");
  const [editedCourse, setEditedCourse] = useState<"LCM" | "SCM" | "SCY">("LCM");
  const [timeError, setTimeError] = useState<string | null>(null);
  const [autoMatchedSwimmer, setAutoMatchedSwimmer] = useState<Swimmer | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSwimmer, setSavedSwimmer] = useState<Swimmer | null>(null);

  // ── Event results mode ────────────────────────────────────────────────────
  const [eventRows, setEventRows] = useState<EventResultRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [savingSelected, setSavingSelected] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [rowTypes, setRowTypes] = useState<Record<number, "mine" | "follow">>({});

  // ── Swimmer schedule mode ─────────────────────────────────────────────────
  const [scheduleResults, setScheduleResults] = useState<ScheduleResultRow[]>([]);
  const [scheduleSwimmerName, setScheduleSwimmerName] = useState<string | null>(null);
  const [scheduleMeetName, setScheduleMeetName] = useState<string | null>(null);
  const [selectedScheduleRows, setSelectedScheduleRows] = useState<Set<number>>(new Set());
  const [scheduleMatchedSwimmer, setScheduleMatchedSwimmer] = useState<Swimmer | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // ── New swimmer creation ──────────────────────────────────────────────────
  const [creatingNewSwimmer, setCreatingNewSwimmer] = useState(false);
  const [newSwimmerName, setNewSwimmerName] = useState("");
  const [newSwimmerAge, setNewSwimmerAge] = useState("");
  const [newSwimmerClub, setNewSwimmerClub] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  // ── Manual meet metadata ──────────────────────────────────────────────────
  const [manualMeetName, setManualMeetName] = useState("");
  const [manualMeetDate, setManualMeetDate] = useState("");
  const [customMeets, setCustomMeets] = useState<string[]>([]);
  const [eventMeetName, setEventMeetName] = useState("");
  const [eventMeetDate, setEventMeetDate] = useState("");

  const ref1 = useRef<HTMLInputElement | null>(null);
  const ref2 = useRef<HTMLInputElement | null>(null);
  const ref3 = useRef<HTMLInputElement | null>(null);

  useEffect(() => { void loadSwimmers(); }, []);

  async function loadSwimmers() {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      await new Promise((r) => setTimeout(r, 800));
      session = (await supabase.auth.getSession()).data.session;
    }
    if (!session) { router.replace("/login"); return; }
    const { data } = await supabase.from("swimmers")
      .select("id, name, age, swim_club, group_type").order("name", { ascending: true });
    const all = (data as Swimmer[]) || [];
    setSwimmers(all);
    setPrimarySwimmers(all.filter((s) => s.group_type === "primary"));
    setLoadingSwimmers(false);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>, setFile: (f: File | null) => void, setPreview: (s: string | null) => void) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  // NOTE: meetCourse is intentionally NOT reset here — it persists for the whole session
  function reset() {
    setFile1(null); setFile2(null); setFile3(null);
    setPreview1(null); setPreview2(null); setPreview3(null);
    setStep("idle"); setProgress(0); setMessage(""); setRawText("");
    setScanMode(null);
    setParsedResult(null); setDetectedEvent(null);
    setEditedTime(""); setEditedCourse(meetCourse); setTimeError(null);
    setAutoMatchedSwimmer(null); setShowPicker(false);
    setIsSaving(false); setSavedSwimmer(null);
    setEventRows([]); setSelectedRows(new Set());
    setSavingSelected(false); setSavedNames([]); setRowTypes({});
    setScheduleResults([]); setScheduleSwimmerName(null); setScheduleMeetName(null);
    setSelectedScheduleRows(new Set()); setScheduleMatchedSwimmer(null);
    setShowSchedulePicker(false); setSavingSchedule(false);
    setManualMeetName(""); setManualMeetDate(""); setEventMeetName(""); setEventMeetDate("");
    setCreatingNewSwimmer(false); setNewSwimmerName(""); setNewSwimmerAge("");
    setNewSwimmerClub(""); setShowCreateForm(false);
    setShowInfo(false);
    if (ref1.current) ref1.current.value = "";
    if (ref2.current) ref2.current.value = "";
    if (ref3.current) ref3.current.value = "";
  }

  // ── Save single result ────────────────────────────────────────────────────

  async function saveSingleDirectly(swimmer: Swimmer) {
    if (!parsedResult) return;
    const confirmedMs = parseTimeStr(editedTime);
    if (!confirmedMs) { setTimeError("Please enter a valid time (e.g. 35.76 or 1:27.54)"); return; }
    setTimeError(null);
    setIsSaving(true);
    const eventName = canonicalEventName(parsedResult.event);
    const courseName = canonicalCourse(editedCourse);
    if (!eventName) { setMessage("⚠️ Could not determine event name."); setIsSaving(false); return; }
    const { data: existing } = await supabase.from("swim_times").select("id")
      .eq("swimmer_id", swimmer.id).eq("event", eventName).eq("course", courseName).eq("time_ms", confirmedMs).limit(1);
    if (existing && existing.length > 0) {
      setMessage("This result is already saved."); setSavedSwimmer(swimmer); setShowPicker(false); setIsSaving(false); return;
    }
    const meetType = detectMeetType(rawText, parsedResult.meetName ?? null);
    const { data: swimRow, error } = await supabase.from("swim_times").insert({
      swimmer_id: swimmer.id, event: eventName, course: courseName,
      time_ms: confirmedMs, place: parsedResult.place ?? null,
      meet_name: parsedResult.meetName ?? null, swam_at: parsedResult.swamAt ?? null, meet_type: meetType,
    }).select().single();
    if (error) { setMessage(`⚠️ ${error.message}`); } else {
      const splits = parsedResult.splits;
      if (swimRow && splits && splits.length > 0) {
        const splitRows = splits
          .filter((s) => typeof s.splitMs === "number" && s.splitMs > 0)
          .map((s, idx) => ({
            swim_time_id: swimRow.id,
            swimmer_id: swimmer.id,
            event: eventName,
            course: courseName,
            split_label: s.label,
            split_order: idx + 1,
            split_distance: s.distance,
            split_time_ms: s.splitMs,
            cumulative_time_ms: s.cumulativeMs ?? null,
          }));
        if (splitRows.length > 0) {
          await supabase.from("swim_splits").insert(splitRows);
        }
      }
      setMessage(`✓ Saved to ${swimmer.name}`); setSavedSwimmer(swimmer); setShowPicker(false); setAutoMatchedSwimmer(swimmer);
    }
    setIsSaving(false);
  }

  // ── Create new swimmer + save single result ───────────────────────────────

  async function handleCreateNewSwimmerAndSaveSingle() {
    if (!parsedResult || !newSwimmerName.trim()) return;
    const confirmedMs = parseTimeStr(editedTime);
    if (!confirmedMs) { setTimeError("Please enter a valid time (e.g. 35.76 or 1:27.54)"); return; }
    setCreatingNewSwimmer(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage("⚠️ Not logged in."); setCreatingNewSwimmer(false); return; }

    let schoolName: string | null = null;
    let clubName: string | null = null;
    if (newSwimmerClub.trim()) {
      const { data: schoolRow } = await supabase.from("sg_schools").select("full_name")
        .eq("code", newSwimmerClub.trim().toUpperCase()).maybeSingle();
      if (schoolRow) { schoolName = schoolRow.full_name; } else { clubName = newSwimmerClub.trim(); }
    }

    const { data: newSwimmer, error: createErr } = await supabase.from("swimmers").insert({
      user_id: user.id, name: newSwimmerName.trim(),
      age: newSwimmerAge ? Number(newSwimmerAge) : null,
      swim_club: clubName, school: schoolName, group_type: "following",
    }).select().single();

    if (createErr || !newSwimmer) {
      setMessage(`⚠️ Couldn't create swimmer: ${createErr?.message ?? "Unknown error"}`);
      setCreatingNewSwimmer(false); return;
    }

    await loadSwimmers();
    const eventName = canonicalEventName(parsedResult.event);
    const courseName = canonicalCourse(editedCourse);
    const meetType = detectMeetType(rawText, parsedResult.meetName ?? null);
    const { error } = await supabase.from("swim_times").insert({
      swimmer_id: newSwimmer.id, event: eventName, course: courseName,
      time_ms: confirmedMs, place: parsedResult.place ?? null,
      meet_name: parsedResult.meetName ?? null, swam_at: parsedResult.swamAt ?? null, meet_type: meetType,
    });

    if (error) { setMessage(`⚠️ ${error.message}`); } else {
      setMessage(`✓ Created ${newSwimmer.name} and saved result`);
      setSavedSwimmer(newSwimmer as Swimmer);
      setShowPicker(false); setShowCreateForm(false);
    }
    setCreatingNewSwimmer(false);
  }

  // ── Save event results ────────────────────────────────────────────────────

  function toggleRow(index: number) {
    setSelectedRows((prev) => { const next = new Set(prev); next.has(index) ? next.delete(index) : next.add(index); return next; });
  }

  async function handleSaveSelected() {
    if (selectedRows.size === 0) return;
    setSavingSelected(true);
    const saved: string[] = []; const errors: string[] = [];
    const firstClub = eventRows[0]?.club ?? null;
    const meetType = detectMeetType(rawText, firstClub);
    const resolvedEventMeetName = eventMeetName.trim() || null;
    if (eventMeetName.trim()) {
      saveCustomMeet(eventMeetName.trim());
      setCustomMeets(loadCustomMeets());
    }
    for (const index of Array.from(selectedRows)) {
      const row = eventRows[index];
      if (!row) continue;
      const matched = fuzzyMatchSwimmer(row.name, swimmers);
      if (!matched) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { errors.push(`${row.name}: not logged in`); continue; }
        let schoolName: string | null = null; let clubName: string | null = null;
        if (row.club) {
          const { data: schoolRow } = await supabase.from("sg_schools").select("full_name")
            .eq("code", row.club.trim().toUpperCase()).maybeSingle();
          if (schoolRow) { schoolName = schoolRow.full_name; } else { clubName = row.club; }
        }
        const { data: newSwimmer, error: createErr } = await supabase.from("swimmers").insert({
          user_id: user.id, name: row.name.trim(), age: row.age ?? null,
          swim_club: clubName, school: schoolName,
          group_type: rowTypes[index] === "mine" ? "primary" : "following",
        }).select().single();
        if (createErr || !newSwimmer) { errors.push(`${row.name}: couldn't create profile`); continue; }
        await loadSwimmers();
        const en2 = canonicalEventName(row.event ?? "");
        // meetCourse always wins — parent sets this explicitly at top of scan session
        const cn2 = canonicalCourse(meetCourse);
        if (!en2) { errors.push(`${row.name}: no event`); continue; }
        await supabase.from("swim_times").insert({
          swimmer_id: newSwimmer.id, event: en2, course: cn2, time_ms: row.timeMs,
          place: row.place ?? null, meet_name: resolvedEventMeetName ?? row.meetName ?? null, swam_at: eventMeetDate.trim() || row.swamAt ?? null, meet_type: meetType,
        });
        saved.push(`${row.name} (added)`); continue;
      }
      const eventName = canonicalEventName(row.event ?? "");
      // meetCourse always wins — parent sets this explicitly at top of scan session
      const courseName = canonicalCourse(meetCourse);
      if (!eventName) { errors.push(`${row.name}: no event`); continue; }
      const { data: existing } = await supabase.from("swim_times").select("id")
        .eq("swimmer_id", matched.id).eq("event", eventName).eq("course", courseName).eq("time_ms", row.timeMs).limit(1);
      if (existing && existing.length > 0) { errors.push(`${row.name}: already saved`); continue; }
      const { error } = await supabase.from("swim_times").insert({
        swimmer_id: matched.id, event: eventName, course: courseName, time_ms: row.timeMs,
        place: row.place ?? null, meet_name: resolvedEventMeetName ?? row.meetName ?? null, swam_at: eventMeetDate.trim() || row.swamAt ?? null, meet_type: meetType,
      });
      error ? errors.push(`${row.name}: ${error.message}`) : saved.push(row.name);
    }
    setSavedNames((prev) => [...prev, ...saved]);
    setMessage(saved.length > 0
      ? `✓ Saved ${saved.length} result(s)${errors.length > 0 ? ` · Issues: ${errors.join(", ")}` : ""}`
      : `⚠️ Nothing saved. ${errors.join(", ")}`);
    setSavingSelected(false); setSelectedRows(new Set());
  }

  // ── Save swimmer schedule results ─────────────────────────────────────────

  function toggleScheduleRow(index: number) {
    setSelectedScheduleRows((prev) => { const next = new Set(prev); next.has(index) ? next.delete(index) : next.add(index); return next; });
  }

  async function handleSaveSchedule(swimmer: Swimmer) {
    if (selectedScheduleRows.size === 0) return;
    setSavingSchedule(true);
    const saved: string[] = []; const errors: string[] = [];
    const meetType = detectMeetType(rawText, null);
    const resolvedMeetName = manualMeetName.trim() || scheduleMeetName || null;
    if (manualMeetName.trim()) {
      saveCustomMeet(manualMeetName.trim());
      setCustomMeets(loadCustomMeets());
    }
    const resolvedSwamAt = manualMeetDate.trim() || null;

    for (const index of Array.from(selectedScheduleRows)) {
      const row = scheduleResults[index];
      if (!row) continue;
      const eventName = canonicalEventName(row.event);
      // meetCourse always wins — parent sets this explicitly at top of scan session
      const courseName = canonicalCourse(meetCourse);
      if (!eventName) { errors.push(`${row.event}: unknown event`); continue; }
      const { data: existing } = await supabase.from("swim_times").select("id")
        .eq("swimmer_id", swimmer.id).eq("event", eventName).eq("course", courseName).eq("time_ms", row.timeMs).limit(1);
      if (existing && existing.length > 0) { errors.push(`${row.event}: already saved`); continue; }
      const { error } = await supabase.from("swim_times").insert({
        swimmer_id: swimmer.id, event: eventName, course: courseName,
        time_ms: row.timeMs, place: row.place ?? null,
        meet_name: resolvedMeetName,
        swam_at: resolvedSwamAt ?? row.swamAt ?? null,
        meet_type: meetType,
      });
      error ? errors.push(`${row.event}: ${error.message}`) : saved.push(row.event);
    }

    setMessage(saved.length > 0
      ? `✓ Saved ${saved.length} result(s) for ${swimmer.name}${errors.length > 0 ? ` · Issues: ${errors.join(", ")}` : ""}`
      : `⚠️ Nothing saved. ${errors.join(", ")}`);
    setSavingSchedule(false);
    setSelectedScheduleRows(new Set());
    setScheduleMatchedSwimmer(swimmer);
    setShowSchedulePicker(false);
  }

  // ── Create new swimmer + save schedule results ────────────────────────────

  async function handleCreateNewSwimmerAndSaveSchedule() {
    if (!newSwimmerName.trim() || selectedScheduleRows.size === 0) return;
    setCreatingNewSwimmer(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage("⚠️ Not logged in."); setCreatingNewSwimmer(false); return; }

    let schoolName: string | null = null;
    let clubName: string | null = null;
    if (newSwimmerClub.trim()) {
      const { data: schoolRow } = await supabase.from("sg_schools").select("full_name")
        .eq("code", newSwimmerClub.trim().toUpperCase()).maybeSingle();
      if (schoolRow) { schoolName = schoolRow.full_name; } else { clubName = newSwimmerClub.trim(); }
    }

    const { data: newSwimmer, error: createErr } = await supabase.from("swimmers").insert({
      user_id: user.id, name: newSwimmerName.trim(),
      age: newSwimmerAge ? Number(newSwimmerAge) : null,
      swim_club: clubName, school: schoolName, group_type: "following",
    }).select().single();

    if (createErr || !newSwimmer) {
      setMessage(`⚠️ Couldn't create swimmer: ${createErr?.message ?? "Unknown error"}`);
      setCreatingNewSwimmer(false); return;
    }

    await loadSwimmers();
    setShowCreateForm(false);
    await handleSaveSchedule(newSwimmer as Swimmer);
    setCreatingNewSwimmer(false);
  }

  // ── Main scan ─────────────────────────────────────────────────────────────

  async function handleScan() {
    if (!file1) return;
    setStep("scanning");
    setProgress(0); setMessage(""); setRawText(""); setScanMode(null);
    setParsedResult(null); setDetectedEvent(null); setEditedTime(""); setTimeError(null);
    setAutoMatchedSwimmer(null); setShowPicker(false); setSavedSwimmer(null);
    setEventRows([]); setSelectedRows(new Set()); setSavedNames([]); setRowTypes({});
    setScheduleResults([]); setScheduleSwimmerName(null); setScheduleMeetName(null);
    setSelectedScheduleRows(new Set()); setScheduleMatchedSwimmer(null); setShowSchedulePicker(false);
    setManualMeetName(""); setManualMeetDate(""); setEventMeetDate("");
    setCreatingNewSwimmer(false); setNewSwimmerName(""); setNewSwimmerAge("");
    setNewSwimmerClub(""); setShowCreateForm(false);

    try {
      // All three slots — filter out nulls
      const files = [file1, file2, file3].filter(Boolean) as File[];
      let combined = "";
      let currentFileIdx = 0;
      const worker = await createWorker("eng", 1, {
        logger: (m: any) => {
          if (m.status === "recognizing text") {
            setProgress((currentFileIdx / files.length) * 100 + (m.progress * 100) / files.length);
          }
        },
      });
      try {
        await (worker as any).setParameters({ tessedit_pageseg_mode: "12" });
        for (let i = 0; i < files.length; i++) {
          currentFileIdx = i;
          const { data: { text } } = await worker.recognize(files[i]);
          combined += text + "\n\n";
        }
      } finally {
        await worker.terminate();
      }

      setRawText(combined);

      if (isSwimmerSchedulePage(combined)) {
        setScanMode("swimmer_schedule");
        const parsed = parseSwimmerScheduleOCR(combined);
        const nonRelayResults = parsed.results.filter((r) => !r.isRelay);

        // Apply meetCourse fallback to any UNKNOWN course values
        const correctedResults = nonRelayResults.map((r) => ({
          ...r,
          course: r.course && r.course !== "UNKNOWN" ? r.course : meetCourse,
        }));

        setScheduleResults(correctedResults);
        setScheduleSwimmerName(parsed.swimmerName);
        setScheduleMeetName(parsed.meetName);
        if (parsed.meetName) setManualMeetName(parsed.meetName);
        setSelectedScheduleRows(new Set(correctedResults.map((_, i) => i)));

        if (parsed.swimmerName) {
          const cleanedName = stripNamePrefix(parsed.swimmerName);
          if (isValidPersonName(cleanedName)) {
            const matched = fuzzyMatchSwimmer(cleanedName, swimmers);
            if (matched) {
              setScheduleMatchedSwimmer(matched);
              setShowSchedulePicker(false);
              setShowCreateForm(false);
            } else {
              setNewSwimmerName(cleanedName);
              setNewSwimmerAge("");
              setNewSwimmerClub("");
              setShowSchedulePicker(true);
              setShowCreateForm(false);
            }
          } else {
            setShowSchedulePicker(true);
          }
        } else {
          setShowSchedulePicker(true);
        }
        setMessage(correctedResults.length === 0 ? "⚠️ No individual events detected." : "");

      } else if (isEventResultsPage(combined)) {
        setScanMode("event_results");
        const parsed = parseEventResultsOCR(combined);

        // Apply meetCourse fallback to any UNKNOWN course values
        const correctedResults = parsed.results.map((r) => ({
          ...r,
          course: r.course && r.course !== "UNKNOWN" ? r.course : meetCourse,
        }));

        setEventRows(correctedResults);
        const preSelected = new Set<number>();
        correctedResults.forEach((row, idx) => { if (fuzzyMatchSwimmer(row.name, swimmers)) preSelected.add(idx); });
        setSelectedRows(preSelected);
        setMessage(correctedResults.length === 0 ? "⚠️ No results detected." : "");

      } else {
        setScanMode("single");
        // Pass meetCourse as defaultCourse so the parser uses it when it can't detect from the screenshot
        const results = parseSwimOCRText(combined, { swimmerName: "", defaultCourse: meetCourse });
        const first = results[0];
        if (!first) {
          setMessage("⚠️ No result detected. Try again with a clearer screenshot.");
        } else {
          setParsedResult(first);
          setDetectedEvent(first.event);
          setEditedTime(first.timeStr ?? "");
          // Use meetCourse when OCR couldn't detect course from screenshot
          const detectedCourse = first.course === "UNKNOWN" ? meetCourse : first.course as "LCM" | "SCM" | "SCY";
          setEditedCourse(detectedCourse);
          const ocrName = first.name ?? null;
          if (ocrName && ocrName.trim().length > 0 && isValidPersonName(stripNamePrefix(ocrName))) {
            const cleanedName = stripNamePrefix(ocrName);
            const matched = fuzzyMatchSwimmer(cleanedName, swimmers);
            if (matched) {
              setAutoMatchedSwimmer(matched);
              setShowPicker(false);
              setShowCreateForm(false);
            } else {
              setNewSwimmerName(cleanedName);
              setNewSwimmerAge("");
              setNewSwimmerClub("");
              setShowPicker(true);
              setShowCreateForm(false);
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

  if (loadingSwimmers) return (
    <div className="shell"><div className="container-app"><p className="muted">Loading...</p></div></div>
  );

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>SwimScan</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Add results</h1>
          </div>
          {source === "screenshot" && step === "idle" && primarySwimmers.length > 0 && (
            <button type="button" onClick={() => setShowInfo((v) => !v)}
              className="mt-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm text-white/40 transition hover:bg-white/10">
              ⓘ
            </button>
          )}
        </div>

        {/* Source picker */}
        <SourcePicker source={source} onChange={setSource} />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/*   SCREENSHOT TAB                                                    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {source === "screenshot" && (
          <>
            {/* Info panel */}
            {showInfo && step === "idle" && (
              <div className="rounded-2xl p-4 space-y-2 text-sm text-white/55"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="font-medium text-white/70">Three scan modes — auto detected:</p>
                <p>📋 <span className="text-white/70">Swim detail</span> — single result, review before saving</p>
                <p>📊 <span className="text-white/70">Event results</span> — full rankings, tick who to save</p>
                <p>🏊 <span className="text-white/70">Swimmer schedule</span> — all events for one swimmer, save whole meet at once</p>
                <p className="pt-1 text-white/35 text-xs">Use Screens 2 &amp; 3 for longer schedules that need multiple screenshots.</p>
              </div>
            )}

            {/* No swimmers */}
            {primarySwimmers.length === 0 && (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
                <p className="text-base font-semibold text-white">No swimmers added yet</p>
                <p className="mt-1 text-sm text-white/40">Add a swimmer in My Kids first, or use the Spreadsheet tab to bulk-import.</p>
                <button type="button" onClick={() => router.push("/swimmers")}
                  className="mt-4 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white" style={{ background: "#D97706" }}>
                  Go to My Kids
                </button>
              </div>
            )}

            {/* IDLE — meet course toggle + 3 slots */}
            {step === "idle" && primarySwimmers.length > 0 && (
              <div className="space-y-4">

                {/* ── Meet course toggle ──────────────────────────────────── */}
                <div className="rounded-2xl p-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white/70">Meet course</p>
                      <p className="text-[10px] text-white/35 mt-0.5">Set once — applies to all scans this session</p>
                    </div>
                    <div className="flex rounded-xl overflow-hidden"
                      style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                      {(["LCM", "SCM"] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setMeetCourse(c)}
                          className="px-4 py-2 text-sm font-bold transition"
                          style={meetCourse === c
                            ? { background: "#D97706", color: "#fff" }
                            : { background: "transparent", color: "rgba(255,255,255,0.4)" }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── 3 screenshot slots ──────────────────────────────────── */}
                <div className="grid grid-cols-3 gap-2">
                  <SlotButton label="Screen 1" hint="Required" preview={preview1} inputRef={ref1} required
                    onChange={(e) => handleFile(e, setFile1, setPreview1)} />
                  <SlotButton label="Screen 2" hint="Optional" preview={preview2} inputRef={ref2}
                    onChange={(e) => handleFile(e, setFile2, setPreview2)} />
                  <SlotButton label="Screen 3" hint="Optional" preview={preview3} inputRef={ref3}
                    onChange={(e) => handleFile(e, setFile3, setPreview3)} />
                </div>
                <button type="button" onClick={handleScan} disabled={!file1}
                  className="w-full rounded-2xl py-4 text-lg font-bold text-white transition disabled:opacity-40"
                  style={{ background: file1 ? "#D97706" : "rgba(255,255,255,0.1)" }}>
                  Scan
                </button>
              </div>
            )}

            {/* SCANNING */}
            {step === "scanning" && (
              <div className="space-y-4 pt-8">
                <p className="text-center text-lg font-semibold text-white">Scanning… {Math.round(progress)}%</p>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${progress}%`, background: "#D97706" }} />
                </div>
                <p className="text-center text-sm text-white/40">Reading screenshot</p>
              </div>
            )}

            {/* DONE */}
            {step === "done" && (
              <div className="space-y-4">

                {/* TEMP DEBUG — shows raw OCR text. Remove after fixing splits. */}
                {rawText && (
                  <div className="rounded-2xl p-3"
                    style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)" }}>
                    <p className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: "#FDE68A" }}>
                      🐛 Debug — raw OCR (screenshot this and send)
                    </p>
                    <pre className="overflow-auto whitespace-pre-wrap text-[10px] leading-tight text-white/70" style={{ maxHeight: "300px", fontFamily: "monospace" }}>
                      {rawText}
                    </pre>
                  </div>
                )}

                {message && (
                  <div className="rounded-2xl border p-3 text-sm" style={
                    message.startsWith("✓")
                      ? { background: "rgba(186,117,23,0.12)", border: "1px solid rgba(186,117,23,0.3)", color: "#EF9F27" }
                      : { background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.2)", color: "#F09595" }
                  }>{message}</div>
                )}

                {/* ── SINGLE MODE ───────────────────────────────────────────────── */}
                {scanMode === "single" && parsedResult && !savedSwimmer && (
                  <div className="space-y-3">
                    <div className="rounded-2xl p-4 space-y-3"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      <div>
                        <p className="text-xs uppercase tracking-widest text-white/40">Detected result</p>
                        <p className="mt-1 text-base font-semibold text-white">{detectedEvent}</p>
                        {parsedResult.meetName && <p className="text-xs text-white/35 mt-0.5">{parsedResult.meetName}</p>}
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-1.5">Time — tap to edit if incorrect</p>
                        <input type="text" value={editedTime}
                          onChange={(e) => { setEditedTime(e.target.value); setTimeError(null); }}
                          placeholder="e.g. 35.76 or 1:27.54"
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-2xl font-bold text-white placeholder-white/20 outline-none focus:border-amber-400/50"
                          style={{ fontVariantNumeric: "tabular-nums" }} />
                        {timeError && <p className="mt-1 text-xs text-red-300">{timeError}</p>}
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-1.5">Course</p>
                        <div className="flex gap-2">
                          {(["LCM", "SCM", "SCY"] as const).map((c) => (
                            <button key={c} type="button" onClick={() => setEditedCourse(c)}
                              className="flex-1 rounded-xl py-2 text-sm font-bold transition"
                              style={editedCourse === c
                                ? { background: "#D97706", color: "#fff" }
                                : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {autoMatchedSwimmer && !showPicker && (
                      <div className="space-y-2">
                        <p className="text-sm text-white/50">Save to</p>
                        <div className="flex items-center gap-3 rounded-2xl p-3"
                          style={{ background: "rgba(186,117,23,0.1)", border: "1px solid rgba(186,117,23,0.3)" }}>
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                            style={{ background: avatarColor(0).bg, color: avatarColor(0).text }}>
                            {getInitials(autoMatchedSwimmer.name)}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-white">{autoMatchedSwimmer.name}</p>
                            <p className="text-xs text-white/40">Age {autoMatchedSwimmer.age}{autoMatchedSwimmer.swim_club ? ` · ${autoMatchedSwimmer.swim_club}` : ""}</p>
                          </div>
                          <button type="button" onClick={() => { setAutoMatchedSwimmer(null); setShowPicker(true); }}
                            className="text-xs text-white/35 underline">Change</button>
                        </div>
                        <button type="button" onClick={() => void saveSingleDirectly(autoMatchedSwimmer)}
                          disabled={isSaving}
                          className="w-full rounded-2xl py-4 text-base font-bold text-white transition disabled:opacity-50"
                          style={{ background: "#D97706" }}>
                          {isSaving ? "Saving…" : `Save to ${autoMatchedSwimmer.name}`}
                        </button>
                      </div>
                    )}

                    {showPicker && !showCreateForm && (
                      <div className="space-y-3">
                        {newSwimmerName.trim().length > 0 && (
                          <div className="rounded-2xl p-4 space-y-3"
                            style={{ background: "rgba(186,117,23,0.08)", border: "1px solid rgba(186,117,23,0.25)" }}>
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 text-base">🔍</span>
                              <div>
                                <p className="text-sm font-semibold text-white">&quot;{newSwimmerName}&quot; isn&apos;t in your swimmers yet</p>
                                <p className="mt-0.5 text-xs text-white/45">Create a new profile, or save to an existing swimmer below.</p>
                              </div>
                            </div>
                            <button type="button" onClick={() => setShowCreateForm(true)}
                              className="w-full rounded-xl py-3 text-sm font-bold text-white"
                              style={{ background: "#D97706" }}>
                              + Create &quot;{newSwimmerName}&quot;
                            </button>
                          </div>
                        )}
                        {!newSwimmerName.trim() && (
                          <>
                            <p className="text-sm text-white/50">Save to an existing swimmer:</p>
                            {primarySwimmers.map((swimmer, index) => {
                              const colors = avatarColor(index);
                              return (
                                <button key={swimmer.id} type="button" onClick={() => void saveSingleDirectly(swimmer)}
                                  disabled={isSaving}
                                  className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10 disabled:opacity-50">
                                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                                    style={{ background: colors.bg, color: colors.text }}>{getInitials(swimmer.name)}</div>
                                  <div>
                                    <p className="text-sm font-semibold text-white">{swimmer.name}</p>
                                    <p className="text-xs text-white/40">Age {swimmer.age}{swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}

                    {showPicker && showCreateForm && (
                      <div className="rounded-2xl p-4 space-y-4"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">New swimmer details</p>
                          <button type="button" onClick={() => setShowCreateForm(false)} className="text-xs text-white/35 underline">Cancel</button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-white/40">Name</label>
                            <input type="text" value={newSwimmerName} onChange={(e) => setNewSwimmerName(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-white/40">Age</label>
                              <input type="number" value={newSwimmerAge} onChange={(e) => setNewSwimmerAge(e.target.value)}
                                placeholder="e.g. 10"
                                className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50" />
                            </div>
                            <div>
                              <label className="text-xs text-white/40">Club / School code</label>
                              <input type="text" value={newSwimmerClub} onChange={(e) => setNewSwimmerClub(e.target.value)}
                                placeholder="e.g. TLSC"
                                className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50" />
                            </div>
                          </div>
                        </div>
                        <button type="button" onClick={() => void handleCreateNewSwimmerAndSaveSingle()}
                          disabled={creatingNewSwimmer || !newSwimmerName.trim()}
                          className="w-full rounded-2xl py-4 text-sm font-bold text-white transition disabled:opacity-50"
                          style={{ background: "#D97706" }}>
                          {creatingNewSwimmer ? "Creating…" : "Create swimmer & save result"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {scanMode === "single" && savedSwimmer && (
                  <div className="rounded-2xl p-4 space-y-1"
                    style={{ background: "rgba(186,117,23,0.08)", border: "1px solid rgba(186,117,23,0.2)" }}>
                    <p className="text-xs text-white/40 uppercase tracking-widest">Saved to</p>
                    <p className="text-base font-semibold text-white">{savedSwimmer.name}</p>
                    {detectedEvent && <p className="text-sm text-white/50">{detectedEvent}</p>}
                    {editedTime && <p className="text-2xl font-bold text-white">{editedTime}</p>}
                  </div>
                )}

                {/* ── SWIMMER SCHEDULE MODE ─────────────────────────────────────── */}
                {scanMode === "swimmer_schedule" && scheduleResults.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{scheduleSwimmerName ?? "Swimmer"}&apos;s meet results</p>
                        <p className="mt-0.5 text-xs text-white/40">{scheduleResults.length} events · tick to select</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setSelectedScheduleRows(new Set(scheduleResults.map((_, i) => i)))}
                          className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white active:bg-white/20">All</button>
                        <button type="button" onClick={() => setSelectedScheduleRows(new Set())}
                          className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white active:bg-white/20">None</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {scheduleResults.map((row, index) => {
                        const isSelected = selectedScheduleRows.has(index);
                        return (
                          <button key={`${row.event}-${index}`} type="button" onClick={() => toggleScheduleRow(index)}
                            className="w-full rounded-2xl border p-3 text-left transition"
                            style={isSelected
                              ? { background: "rgba(186,117,23,0.12)", border: "1px solid rgba(186,117,23,0.4)" }
                              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <div className="flex items-center gap-3">
                              <div className="h-5 w-5 flex-shrink-0 rounded-md flex items-center justify-center"
                                style={isSelected
                                  ? { background: "#D97706", border: "1px solid #D97706" }
                                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)" }}>
                                {isSelected && (
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white">{row.event}</p>
                                {row.place != null && <p className="text-xs text-white/40">Place #{row.place}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-white">{row.timeStr}</p>
                                <p className="text-[10px] text-white/30">{row.course}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-2xl p-4 space-y-4"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="text-xs font-medium uppercase tracking-widest text-white/40">Meet details</p>
                      <div className="space-y-2">
                        <label className="text-xs text-white/40">Meet name</label>
                        <div className="flex flex-wrap gap-1.5">
                          {[...getMeetPresets(), ...customMeets.filter(m => !getMeetPresets().includes(m))].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setManualMeetName(manualMeetName === preset ? "" : preset)}
                              className="rounded-full px-3 py-1 text-xs font-medium transition-all"
                              style={manualMeetName === preset
                                ? { background: "#D97706", color: "#fff", border: "1px solid #D97706" }
                                : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.12)" }}>
                              {preset}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={manualMeetName}
                          onChange={(e) => setManualMeetName(e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value.trim()) {
                              saveCustomMeet(e.target.value.trim());
                              setCustomMeets(loadCustomMeets());
                            }
                          }}
                          placeholder="Or type a meet name…"
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-amber-400/50" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-white/40">Date swum</label>
                        <input type="date" value={manualMeetDate} onChange={(e) => setManualMeetDate(e.target.value)}
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                          style={{ colorScheme: "dark" }} />
                      </div>
                    </div>

                    {scheduleMatchedSwimmer && !showSchedulePicker && selectedScheduleRows.size > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 rounded-2xl p-3"
                          style={{ background: "rgba(186,117,23,0.1)", border: "1px solid rgba(186,117,23,0.3)" }}>
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                            style={{ background: avatarColor(0).bg, color: avatarColor(0).text }}>
                            {getInitials(scheduleMatchedSwimmer.name)}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-white">{scheduleMatchedSwimmer.name}</p>
                            <p className="text-xs text-white/40">Age {scheduleMatchedSwimmer.age}{scheduleMatchedSwimmer.swim_club ? ` · ${scheduleMatchedSwimmer.swim_club}` : ""}</p>
                          </div>
                          <button type="button" onClick={() => { setScheduleMatchedSwimmer(null); setShowSchedulePicker(true); }}
                            className="text-xs text-white/35 underline">Change</button>
                        </div>
                        <button type="button" onClick={() => void handleSaveSchedule(scheduleMatchedSwimmer)}
                          disabled={savingSchedule || selectedScheduleRows.size === 0}
                          className="w-full rounded-2xl py-4 text-base font-bold text-white transition disabled:opacity-50"
                          style={{ background: "#D97706" }}>
                          {savingSchedule ? "Saving…" : `Save ${selectedScheduleRows.size} event${selectedScheduleRows.size === 1 ? "" : "s"} to ${scheduleMatchedSwimmer.name}`}
                        </button>
                      </div>
                    )}

                    {showSchedulePicker && selectedScheduleRows.size > 0 && !showCreateForm && (
                      <div className="space-y-3">
                        {newSwimmerName.trim().length > 0 && (
                          <div className="rounded-2xl p-4 space-y-3"
                            style={{ background: "rgba(186,117,23,0.08)", border: "1px solid rgba(186,117,23,0.25)" }}>
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 text-base">🔍</span>
                              <div>
                                <p className="text-sm font-semibold text-white">&quot;{newSwimmerName}&quot; isn&apos;t in your swimmers yet</p>
                                <p className="mt-0.5 text-xs text-white/45">Create a new profile, or save to an existing swimmer below.</p>
                              </div>
                            </div>
                            <button type="button" onClick={() => setShowCreateForm(true)}
                              className="w-full rounded-xl py-3 text-sm font-bold text-white"
                              style={{ background: "#D97706" }}>
                              + Create &quot;{newSwimmerName}&quot;
                            </button>
                          </div>
                        )}
                        {!newSwimmerName.trim() && (
                          <>
                            <p className="text-sm text-white/50">Save to an existing swimmer:</p>
                            {primarySwimmers.map((swimmer, index) => {
                              const colors = avatarColor(index);
                              return (
                                <button key={swimmer.id} type="button" onClick={() => void handleSaveSchedule(swimmer)}
                                  disabled={savingSchedule}
                                  className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10 disabled:opacity-50">
                                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                                    style={{ background: colors.bg, color: colors.text }}>{getInitials(swimmer.name)}</div>
                                  <div>
                                    <p className="text-sm font-semibold text-white">{swimmer.name}</p>
                                    <p className="text-xs text-white/40">Age {swimmer.age}{swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}

                    {showSchedulePicker && showCreateForm && (
                      <div className="rounded-2xl p-4 space-y-4"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">New swimmer details</p>
                          <button type="button" onClick={() => setShowCreateForm(false)} className="text-xs text-white/35 underline">Cancel</button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-white/40">Name</label>
                            <input type="text" value={newSwimmerName} onChange={(e) => setNewSwimmerName(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-white/40">Age</label>
                              <input type="number" value={newSwimmerAge} onChange={(e) => setNewSwimmerAge(e.target.value)}
                                placeholder="e.g. 10"
                                className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50" />
                            </div>
                            <div>
                              <label className="text-xs text-white/40">Club / School code</label>
                              <input type="text" value={newSwimmerClub} onChange={(e) => setNewSwimmerClub(e.target.value)}
                                placeholder="e.g. TLSC"
                                className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50" />
                            </div>
                          </div>
                        </div>
                        <button type="button" onClick={() => void handleCreateNewSwimmerAndSaveSchedule()}
                          disabled={creatingNewSwimmer || !newSwimmerName.trim()}
                          className="w-full rounded-2xl py-4 text-sm font-bold text-white transition disabled:opacity-50"
                          style={{ background: "#D97706" }}>
                          {creatingNewSwimmer ? "Creating…" : `Create swimmer & save ${selectedScheduleRows.size} event${selectedScheduleRows.size === 1 ? "" : "s"}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ── EVENT RESULTS MODE ────────────────────────────────────────── */}
                {scanMode === "event_results" && eventRows.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{eventRows[0]?.event ?? "Event"} results</p>
                        <p className="mt-0.5 text-xs text-white/40">{eventRows.length} swimmers · tick who to save</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setSelectedRows(new Set(eventRows.map((_, i) => i)))}
                          className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white active:bg-white/20">All</button>
                        <button type="button" onClick={() => setSelectedRows(new Set())}
                          className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white active:bg-white/20">None</button>
                      </div>
                    </div>
                    {eventRows.map((row, index) => {
                      const isSelected = selectedRows.has(index);
                      const isSaved = savedNames.includes(row.name);
                      return (
                        <button key={`${row.name}-${index}`} type="button"
                          onClick={() => !isSaved && toggleRow(index)}
                          className="w-full rounded-2xl border p-3 text-left transition"
                          style={isSaved
                            ? { background: "rgba(186,117,23,0.06)", border: "1px solid rgba(186,117,23,0.2)", opacity: 0.6 }
                            : isSelected
                            ? { background: "rgba(186,117,23,0.12)", border: "1px solid rgba(186,117,23,0.4)" }
                            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <div className="flex items-center gap-3">
                            <div className="h-5 w-5 flex-shrink-0 rounded-md flex items-center justify-center"
                              style={isSelected && !isSaved
                                ? { background: "#D97706", border: "1px solid #D97706" }
                                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)" }}>
                              {(isSelected || isSaved) && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{row.name}</p>
                              {row.club && <p className="text-xs text-white/40">{row.club}{row.age ? ` · Age ${row.age}` : ""}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-white">{row.timeStr}</p>
                              {row.place != null && <p className="text-xs text-white/40">#{row.place}</p>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {selectedRows.size > 0 && (
                      <div className="space-y-3">
                        <div className="rounded-2xl p-4 space-y-4"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <p className="text-xs font-medium uppercase tracking-widest text-white/40">Meet details</p>
                          <div className="space-y-2">
                            <label className="text-xs text-white/40">Meet name</label>
                            <div className="flex flex-wrap gap-1.5">
                              {[...getMeetPresets(), ...customMeets.filter(m => !getMeetPresets().includes(m))].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setEventMeetName(eventMeetName === preset ? "" : preset)}
                                  className="rounded-full px-3 py-1 text-xs font-medium transition-all"
                                  style={eventMeetName === preset
                                    ? { background: "#D97706", color: "#fff", border: "1px solid #D97706" }
                                    : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.12)" }}>
                                  {preset}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={eventMeetName}
                              onChange={(e) => setEventMeetName(e.target.value)}
                              onBlur={(e) => {
                                if (e.target.value.trim()) {
                                  saveCustomMeet(e.target.value.trim());
                                  setCustomMeets(loadCustomMeets());
                                }
                              }}
                              placeholder="Or type a meet name…"
                              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-amber-400/50" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-white/40">Date swum</label>
                            <input type="date" value={eventMeetDate} onChange={(e) => setEventMeetDate(e.target.value)}
                              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                              style={{ colorScheme: "dark" }} />
                          </div>
                        </div>
                        <button type="button" onClick={() => void handleSaveSelected()}
                          disabled={savingSelected}
                          className="w-full rounded-2xl py-4 text-base font-bold text-white transition disabled:opacity-50"
                          style={{ background: "#D97706" }}>
                          {savingSelected ? "Saving…" : `Save ${selectedRows.size} result${selectedRows.size === 1 ? "" : "s"}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Scan another */}
                <button type="button" onClick={reset}
                  className="w-full rounded-2xl border border-white/15 bg-white/5 py-4 text-base font-semibold text-white/60 transition hover:bg-white/10">
                  Scan another
                </button>

              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/*   SPREADSHEET TAB                                                   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {source === "spreadsheet" && (
          <SpreadsheetImport />
        )}

      </div>
    </div>
  );
}