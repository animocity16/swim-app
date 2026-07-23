"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorker } from "tesseract.js";
import {
  parseSwimCloudRankingsOCR,
  isSwimCloudRankingsPage,
  type SwimCloudRankingRow,
} from "@/lib/ocrSwimCloudRankingsParser";
import { canonicalCourse, canonicalEventName } from "@/lib/events";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ──────────────────────────────────────────────────────────────────

type Swimmer = {
  id: number;
  name: string;
  age: number;
  swim_club?: string | null;
  group_type?: string | null;
};

type Step = "idle" | "scanning" | "done";
type MeetCourse = "LCM" | "SCM";

// ─── Helpers (carried over unchanged from the Meet Mobile scan flow) ────────

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

function detectMeetType(rawText: string, hint: string | null): string {
  const combined = ((hint ?? "") + " " + rawText).toLowerCase();
  if (/\bnsg\b|national school games/i.test(combined)) return "NSG";
  if (/\bsnag\b|singapore national age group|national age group/i.test(combined)) return "SNAG";
  return "CLUB";
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

// ─── Upload slot ──────────────────────────────────────────────────────────

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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SwimCloudScanPage() {
  const router = useRouter();
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [loadingSwimmers, setLoadingSwimmers] = useState(true);

  const [meetCourse, setMeetCourse] = useState<MeetCourse>("LCM");

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
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [routeDebug, setRouteDebug] = useState("");

  const [rows, setRows] = useState<SwimCloudRankingRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [savingSelected, setSavingSelected] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);

  const [manualMeetName, setManualMeetName] = useState("");
  const [manualMeetDate, setManualMeetDate] = useState("");

  const ref1 = useRef<HTMLInputElement | null>(null);
  const ref2 = useRef<HTMLInputElement | null>(null);
  const ref3 = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadSwimmers();
  }, []);

  async function loadSwimmers() {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      await new Promise((r) => setTimeout(r, 800));
      session = (await supabase.auth.getSession()).data.session;
    }
    if (!session) { router.replace("/login"); return; }
    const { data } = await supabase.from("swimmers")
      .select("id, name, age, swim_club, group_type").order("name", { ascending: true });
    setSwimmers((data as Swimmer[]) || []);
    setLoadingSwimmers(false);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>, setFile: (f: File | null) => void, setPreview: (s: string | null) => void) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function reset() {
    setFile1(null); setFile2(null); setFile3(null);
    setPreview1(null); setPreview2(null); setPreview3(null);
    setStep("idle"); setProgress(0); setMessage(""); setRawText(""); setRouteDebug("");
    setRows([]); setSelectedRows(new Set());
    setSavingSelected(false); setSavedNames([]);
    setManualMeetName(""); setManualMeetDate("");
    if (ref1.current) ref1.current.value = "";
    if (ref2.current) ref2.current.value = "";
    if (ref3.current) ref3.current.value = "";
  }

  function toggleRow(index: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  async function handleCopyRawText() {
    try {
      await navigator.clipboard.writeText(rawText);
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy"), 1500);
    } catch {
      setCopyLabel("Failed");
      setTimeout(() => setCopyLabel("Copy"), 1500);
    }
  }

  async function handleScan() {
    if (!file1) return;
    setStep("scanning");
    setProgress(0); setMessage(""); setRawText(""); setRouteDebug("");
    setRows([]); setSelectedRows(new Set()); setSavedNames([]);

    try {
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
        await (worker as any).setParameters({ tessedit_pageseg_mode: "6" });
        for (let i = 0; i < files.length; i++) {
          currentFileIdx = i;
          const { data: { text } } = await worker.recognize(files[i]);
          combined += text + "\n\n";
        }
      } finally {
        await worker.terminate();
      }

      setRawText(combined);

      const _isRankings = isSwimCloudRankingsPage(combined);
      setRouteDebug(`isSwimCloudRankingsPage=${_isRankings} combined.length=${combined.length}`);

      if (!_isRankings) {
        setMessage("⚠️ This doesn't look like a SwimCloud rankings page. Try a clearer screenshot.");
      }

      const parsed = parseSwimCloudRankingsOCR(combined);
      const correctedResults = parsed.results.map((r) => ({
        ...r,
        course: meetCourse,
      }));
      setRows(correctedResults);
      if (parsed.meetName) setManualMeetName(parsed.meetName);

      const preSelected = new Set<number>();
      correctedResults.forEach((row, idx) => {
        if (fuzzyMatchSwimmer(row.name, swimmers)) preSelected.add(idx);
      });
      setSelectedRows(preSelected);

      if (correctedResults.length === 0) {
        setMessage("⚠️ No results detected. Try again with a clearer screenshot.");
      }

      setStep("done");
    } catch (err: any) {
      setMessage(`❌ ${err?.message ?? "Unknown error"}`);
      setStep("done");
    }
  }

  async function handleSaveSelected() {
    if (selectedRows.size === 0) return;
    setSavingSelected(true);
    const saved: string[] = [];
    const errors: string[] = [];
    const firstClub = rows[0]?.club ?? null;
    const meetType = detectMeetType(rawText, firstClub);
    const resolvedMeetName = manualMeetName.trim() || null;

    for (const index of Array.from(selectedRows)) {
      const row = rows[index];
      if (!row) continue;

      const eventName = canonicalEventName(row.event ?? "");
      const courseName = canonicalCourse(meetCourse);
      if (!eventName) { errors.push(`${row.name}: no event`); continue; }

      const matched = fuzzyMatchSwimmer(row.name, swimmers);

      if (!matched) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { errors.push(`${row.name}: not logged in`); continue; }
        const { data: newSwimmer, error: createErr } = await supabase.from("swimmers").insert({
          user_id: user.id, name: row.name.trim(), age: null,
          swim_club: row.club, group_type: "following",
        }).select().single();
        if (createErr || !newSwimmer) { errors.push(`${row.name}: couldn't create profile`); continue; }
        await loadSwimmers();
        await supabase.from("swim_times").insert({
          swimmer_id: newSwimmer.id, event: eventName, course: courseName, time_ms: row.timeMs,
          place: row.place ?? null, meet_name: resolvedMeetName, swam_at: manualMeetDate.trim() || null,
          meet_type: meetType,
        });
        saved.push(`${row.name} (added)`);
        continue;
      }

      const dupQuery = supabase.from("swim_times").select("id")
        .eq("swimmer_id", matched.id).eq("event", eventName).eq("course", courseName).eq("time_ms", row.timeMs);
      if (resolvedMeetName) dupQuery.eq("meet_name", resolvedMeetName);
      const { data: existing } = await dupQuery.limit(1);
      if (existing && existing.length > 0) { errors.push(`${row.name}: already saved`); continue; }

      const { error } = await supabase.from("swim_times").insert({
        swimmer_id: matched.id, event: eventName, course: courseName, time_ms: row.timeMs,
        place: row.place ?? null, meet_name: resolvedMeetName, swam_at: manualMeetDate.trim() || null,
        meet_type: meetType,
      });
      error ? errors.push(`${row.name}: ${error.message}`) : saved.push(row.name);
    }

    setSavedNames((prev) => [...prev, ...saved]);
    setMessage(saved.length > 0
      ? `✓ Saved ${saved.length} result(s)${errors.length > 0 ? ` · Issues: ${errors.join(", ")}` : ""}`
      : `⚠️ Nothing saved. ${errors.join(", ")}`);
    setSavingSelected(false);
    setSelectedRows(new Set());
  }

  if (loadingSwimmers) return (
    <div className="shell"><div className="container-app"><p className="muted">Loading...</p></div></div>
  );

  return (
    <div className="shell">
      <div className="container-app space-y-5 pb-28">
        <div className="pt-2">
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
            SwimScan
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">SwimCloud rankings</h1>
          <p className="mt-1 text-xs text-white/40">
            Screenshot an event rankings page and we'll pull out every swimmer's time.
          </p>
        </div>

        {step !== "done" && (
          <>
            {/* Course selector — SwimCloud never shows this on screen */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-white/50">Course</p>
              <div className="flex gap-2">
                {(["LCM", "SCM"] as MeetCourse[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setMeetCourse(c)}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition"
                    style={{
                      background: meetCourse === c ? "#D97706" : "rgba(255,255,255,0.06)",
                      color: meetCourse === c ? "#1C1204" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Screenshot slots */}
            <div className="grid grid-cols-3 gap-2">
              <SlotButton label="Screenshot 1" hint="Rankings page" preview={preview1} inputRef={ref1} required
                onChange={(e) => handleFile(e, setFile1, setPreview1)} />
              <SlotButton label="Screenshot 2" hint="Optional" preview={preview2} inputRef={ref2}
                onChange={(e) => handleFile(e, setFile2, setPreview2)} />
              <SlotButton label="Screenshot 3" hint="Optional" preview={preview3} inputRef={ref3}
                onChange={(e) => handleFile(e, setFile3, setPreview3)} />
            </div>
            <p className="text-[10px] text-white/30">
              Add more slots if the rankings list scrolls past what fits in one screenshot.
            </p>

            <button
              type="button"
              disabled={!file1 || step === "scanning"}
              onClick={handleScan}
              className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
              style={{ background: "#D97706", color: "#1C1204" }}
            >
              {step === "scanning" ? `Scanning… ${Math.round(progress)}%` : "Scan rankings"}
            </button>

            {message && (
              <p className="text-center text-xs text-white/50">{message}</p>
            )}
          </>
        )}

        {step === "done" && (
          <div className="space-y-4">
            {message && (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center text-xs text-white/60">
                {message}
              </p>
            )}

            {rows.length > 0 && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/50">Meet name</label>
                  <input
                    value={manualMeetName}
                    onChange={(e) => setManualMeetName(e.target.value)}
                    placeholder="e.g. Pesta Sukan"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/50">Meet date (optional)</label>
                  <input
                    type="date"
                    value={manualMeetDate}
                    onChange={(e) => setManualMeetDate(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white"
                  />
                </div>

                <div className="space-y-2">
                  {rows.map((row, i) => {
                    const matched = fuzzyMatchSwimmer(row.name, swimmers);
                    const color = avatarColor(i);
                    const checked = selectedRows.has(i);
                    return (
                      <label
                        key={i}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                        style={{ borderColor: checked ? "rgba(253,230,138,0.3)" : undefined }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(i)}
                          className="h-4 w-4 shrink-0"
                        />
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                          style={{ background: color.bg, color: color.text }}
                        >
                          {getInitials(row.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            #{row.place} {row.name}
                          </p>
                          <p className="truncate text-[11px] text-white/40">
                            {row.club ?? "No club"} {matched ? "· existing profile" : "· new profile will be created"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-white">{row.timeStr}</p>
                          <p className="text-[10px] text-white/40">{row.event}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={selectedRows.size === 0 || savingSelected}
                  onClick={handleSaveSelected}
                  className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
                  style={{ background: "#D97706", color: "#1C1204" }}
                >
                  {savingSelected ? "Saving…" : `Save ${selectedRows.size} selected`}
                </button>
              </>
            )}

            {savedNames.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] font-semibold text-white/50">Saved this session</p>
                <p className="mt-1 text-xs text-white/70">{savedNames.join(", ")}</p>
              </div>
            )}

            {/* ── Debug: raw OCR text ── kept intentionally, same as Meet Mobile scan */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Raw OCR text (debug)
                </p>
                <button
                  type="button"
                  onClick={handleCopyRawText}
                  className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-white/60"
                >
                  {copyLabel}
                </button>
              </div>
              {routeDebug && (
                <p className="mt-1 text-[10px] text-white/30">{routeDebug}</p>
              )}
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/50">
                {rawText || "(empty)"}
              </pre>
            </div>

            <button type="button" onClick={reset}
              className="w-full rounded-2xl border border-white/15 bg-white/5 py-4 text-base font-semibold text-white/60 transition hover:bg-white/10">
              Scan another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}