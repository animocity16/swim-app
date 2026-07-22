"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type SwimmerRow = {
  name: string;
  age: number;
  club: string;
  school: string;
  group: "primary" | "following";
};

type TimeRow = {
  swimmerName: string;
  event: string;
  course: string;
  time: string;
  date: string | null;
  meetName: string | null;
  place: number | null;
};

type ParseResult = {
  swimmers: SwimmerRow[];
  times: TimeRow[];
  errors: string[];
};

type ImportStatus = "idle" | "parsing" | "preview" | "importing" | "done";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMs(timeStr: string): number | null {
  if (!timeStr) return null;
  const s = timeStr.trim();
  if (s.includes(":")) {
    const [min, sec] = s.split(":");
    const [secs, hundredths] = sec.split(".");
    return (
      Number(min) * 60_000 +
      Number(secs) * 1_000 +
      Number((hundredths ?? "0").padEnd(2, "0").slice(0, 2)) * 10
    );
  }
  const [secs, hundredths] = s.split(".");
  return (
    Number(secs) * 1_000 +
    Number((hundredths ?? "0").padEnd(2, "0").slice(0, 2)) * 10
  );
}

function normaliseEvent(raw: string): string {
  const e = raw.trim();
  const map: Record<string, string> = {
    "50 freestyle": "50 Freestyle", "100 freestyle": "100 Freestyle",
    "200 freestyle": "200 Freestyle", "400 freestyle": "400 Freestyle",
    "800 freestyle": "800 Freestyle", "1500 freestyle": "1500 Freestyle",
    "50 backstroke": "50 Backstroke", "100 backstroke": "100 Backstroke",
    "200 backstroke": "200 Backstroke",
    "50 breaststroke": "50 Breaststroke", "100 breaststroke": "100 Breaststroke",
    "200 breaststroke": "200 Breaststroke",
    "50 butterfly": "50 Butterfly", "100 butterfly": "100 Butterfly",
    "200 butterfly": "200 Butterfly",
    "200 im": "200 IM", "400 im": "400 IM",
  };
  return map[e.toLowerCase()] ?? e;
}

function normaliseCourse(raw: string): "LCM" | "SCM" | "SCY" {
  const c = raw.trim().toUpperCase();
  if (c === "SCM") return "SCM";
  if (c === "SCY") return "SCY";
  return "LCM";
}

function excelTimeToSwimTime(val: number): string | null {
  const totalSeconds = Math.round(val * 86400 * 100) / 100;
  if (totalSeconds <= 0 || totalSeconds > 7200) return null;
  const mins = Math.floor(totalSeconds / 60);
  const secs = (totalSeconds % 60).toFixed(2).padStart(5, "0");
  return mins > 0 ? `${mins}:${secs}` : `${secs}`;
}

function stripClubFromName(raw: string): { name: string; club: string } {
  const match = raw.trim().match(/^(.+?)\s*[\(\[（]([^\)\]）]+)[\)\]）]\s*$/);
  if (match) return { name: match[1].trim(), club: match[2].trim() };
  return { name: raw.trim(), club: "" };
}

function parseExcelDate(raw: string): string | null {
  if (!raw) return null;
  const num = Number(raw);
  if (!isNaN(num) && num > 1000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  return raw;
}

function parseSheet(workbook: XLSX.WorkBook): ParseResult {
  const errors: string[] = [];
  const swimmers: SwimmerRow[] = [];
  const times: TimeRow[] = [];

  // ── Swimmers sheet ──
  const ws1 = workbook.Sheets["Swimmers"];
  if (!ws1) {
    errors.push("Could not find the 'Swimmers' sheet.");
  } else {
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws1, {
      header: ["name", "age", "club", "school", "group"],
      range: 5,
      defval: "",
    });
    for (const row of rows) {
      const rawName = String(row.name ?? "").trim();
      if (!rawName) continue;
      const age = Number(row.age);
      if (!age || isNaN(age)) continue;
      const { name, club: clubFromName } = stripClubFromName(rawName);
      const club = String(row.club ?? "").trim() || clubFromName;
      const group = String(row.group ?? "").toLowerCase().includes("following")
        ? "following" : "primary";
      swimmers.push({ name, age, club, school: String(row.school ?? "").trim(), group });
    }
  }

  // ── Times sheet ──
  const ws2 = workbook.Sheets["Times"];
  if (!ws2) {
    errors.push("Could not find the 'Times' sheet.");
  } else {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws2, {
      header: ["swimmerName", "event", "course", "time", "date", "meetName", "place"],
      range: 5,
      defval: "",
    });
    for (const row of rows) {
      const rawName = String(row.swimmerName ?? "").trim();
      if (!rawName) continue;
      const { name: swimmerName } = stripClubFromName(rawName);
      const event = String(row.event ?? "").trim();
      const course = String(row.course ?? "").trim();
      if (!event) continue;

      let timeStr: string | null = null;
      const rawTime = row.time;
      if (typeof rawTime === "number" && rawTime > 0 && rawTime < 1) {
        timeStr = excelTimeToSwimTime(rawTime);
      } else {
        timeStr = String(rawTime ?? "").trim() || null;
      }

      if (!timeStr) continue;
      const ms = timeToMs(timeStr);
      if (!ms || ms <= 0 || ms > 7_200_000) {
        errors.push(`Row skipped — invalid time "${timeStr}" for ${swimmerName}`);
        continue;
      }
      times.push({
        swimmerName,
        event: normaliseEvent(event),
        course: normaliseCourse(course),
        time: timeStr,
        date: String(row.date ?? "").trim() || null,
        meetName: String(row.meetName ?? "").trim() || null,
        place: row.place ? Number(row.place) : null,
      });
    }
  }

  return { swimmers, times, errors };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpreadsheetImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importedCounts, setImportedCounts] = useState({ swimmers: 0, times: 0 });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportStatus("parsing");
    setParsed(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const result = parseSheet(wb);
        setParsed(result);
        setImportStatus("preview");
      } catch {
        setParsed({ swimmers: [], times: [], errors: ["Could not read file — make sure it's the Natrix template."] });
        setImportStatus("preview");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImport() {
    if (!parsed) return;
    setImportStatus("importing");
    setImportErrors([]);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const errors: string[] = [...parsed.errors];
    let swimmersCreated = 0;
    let timesCreated = 0;
    const swimmerIdMap = new Map<string, number>();
    const total = parsed.swimmers.length + parsed.times.length;
    let done = 0;
    setProgress({ done, total });

    // ── 1. Create / match swimmers ──
    for (const sw of parsed.swimmers) {
      const { data: existing } = await supabase
        .from("swimmers").select("id, name")
        .eq("user_id", user.id).ilike("name", sw.name).limit(1);

      if (existing && existing.length > 0) {
        swimmerIdMap.set(sw.name.toLowerCase(), existing[0].id);
      } else {
        const { data, error } = await supabase
          .from("swimmers")
          .insert({
            user_id: user.id,
            name: sw.name,
            age: sw.age,
            swim_club: sw.club || null,
            school: sw.school || null,
            group_type: sw.group,
          })
          .select("id").single();

        if (error) {
          errors.push(`Could not create swimmer "${sw.name}": ${error.message}`);
        } else {
          swimmerIdMap.set(sw.name.toLowerCase(), data.id);
          swimmersCreated++;
        }
      }
      done++;
      setProgress({ done, total });
    }

    // ── 2. Import times ──
    for (const t of parsed.times) {
      const key = t.swimmerName.toLowerCase();
      let swimmerId: number | undefined = swimmerIdMap.get(key);

      if (!swimmerId) {
        for (const [k, id] of swimmerIdMap.entries()) {
          if (k.includes(key.split(" ")[0]) || key.includes(k.split(" ")[0])) {
            swimmerId = id;
            break;
          }
        }
      }

      if (!swimmerId) {
        const { data } = await supabase
          .from("swimmers").select("id, name")
          .eq("user_id", user.id)
          .ilike("name", `%${t.swimmerName.split(" ")[0]}%`).limit(1);
        if (data && data.length > 0) swimmerId = data[0].id;
      }

      if (!swimmerId) {
        errors.push(`Skipped "${t.event}" for "${t.swimmerName}" — swimmer not found`);
        done++;
        setProgress({ done, total });
        continue;
      }

      const ms = timeToMs(t.time);
      if (!ms) { done++; setProgress({ done, total }); continue; }

      const { data: existing } = await supabase
        .from("swim_times").select("id")
        .eq("swimmer_id", swimmerId).eq("event", t.event)
        .eq("course", t.course).eq("time_ms", ms).limit(1);

      if (existing && existing.length > 0) {
        done++; setProgress({ done, total }); continue;
      }

      const { error } = await supabase.from("swim_times").insert({
        swimmer_id: swimmerId,
        event: t.event,
        course: t.course,
        time_ms: ms,
        swam_at: t.date ? parseExcelDate(t.date) : null,
        meet_name: t.meetName || null,
        place: t.place || null,
      });

      if (error) {
        errors.push(`Could not save "${t.event}" for "${t.swimmerName}": ${error.message}`);
      } else {
        timesCreated++;
      }
      done++;
      setProgress({ done, total });
    }

    setImportedCounts({ swimmers: swimmersCreated, times: timesCreated });
    setImportErrors(errors);
    setImportStatus("done");
  }

  function reset() {
    setImportStatus("idle");
    setParsed(null);
    setFileName("");
    setProgress({ done: 0, total: 0 });
    setImportErrors([]);
    setImportedCounts({ swimmers: 0, times: 0 });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-4">

      {/* Step 1 — Download */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "#D97706" }}>
            1
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Download the template</p>
            <p className="text-xs text-white/45 mt-0.5">Fill in your swimmers and their existing times</p>
          </div>
        </div>

        <a
          href="/natrix_import_template.xlsx"
          download
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition"
          style={{ background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.3)" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v8M5 7l3 3 3-3M3 12h10" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ color: "#FDE68A" }}>Download Natrix Template (.xlsx)</span>
        </a>

        <div className="rounded-2xl p-3 space-y-1.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs text-white/60 font-medium">The template has 2 sheets:</p>
          <p className="text-xs text-white/45">📋 <span className="text-white/60">Swimmers</span> — name, age, club, school, group</p>
          <p className="text-xs text-white/45">⏱ <span className="text-white/60">Times</span> — one row per swim result</p>
          <p className="text-xs text-white/30 pt-1">Works in Excel, Google Sheets, or Numbers</p>
        </div>
      </div>

      {/* Step 2 — Upload */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: importStatus !== "idle" ? "#D97706" : "rgba(255,255,255,0.15)" }}
          >
            2
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Upload your filled template</p>
            <p className="text-xs text-white/45 mt-0.5">We&apos;ll create profiles and import all times automatically</p>
          </div>
        </div>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />

        {importStatus === "idle" && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-black/20 py-8 transition hover:border-amber-400/50 hover:bg-white/5"
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 20V8M9 13l5-5 5 5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="3" y="3" width="22" height="22" rx="5" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" />
            </svg>
            <p className="text-sm font-semibold text-white/50">Tap to upload template</p>
            <p className="text-xs text-white/30">.xlsx, .xls or .csv</p>
          </button>
        )}

        {importStatus === "parsing" && (
          <div className="flex items-center justify-center py-8 gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
            <p className="text-sm text-white/60">Reading {fileName}…</p>
          </div>
        )}

        {importStatus === "preview" && parsed && (
          <div className="space-y-4">
            <p className="text-xs text-white/40 truncate">📄 {fileName}</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-widest text-white/40">Swimmers</p>
                <p className="mt-1 text-3xl font-bold text-white">{parsed.swimmers.length}</p>
                <p className="mt-0.5 text-xs text-white/40">profiles to create</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-widest text-white/40">Times</p>
                <p className="mt-1 text-3xl font-bold text-white">{parsed.times.length}</p>
                <p className="mt-0.5 text-xs text-white/40">results to import</p>
              </div>
            </div>

            {parsed.swimmers.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="px-4 py-2 text-[10px] uppercase tracking-widest text-white/30 bg-white/5">Swimmers detected</p>
                {parsed.swimmers.slice(0, 8).map((sw, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 border-t border-white/8">
                    <div>
                      <p className="text-sm font-medium text-white">{sw.name}</p>
                      <p className="text-xs text-white/40">Age {sw.age}{sw.club ? ` · ${sw.club}` : ""}</p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                      style={sw.group === "primary"
                        ? { background: "rgba(217,119,6,0.2)", color: "#FDE68A" }
                        : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
                    >
                      {sw.group === "primary" ? "My Swimmer" : "Following"}
                    </span>
                  </div>
                ))}
                {parsed.swimmers.length > 8 && (
                  <p className="px-4 py-2 text-xs text-white/30 border-t border-white/8">+ {parsed.swimmers.length - 8} more</p>
                )}
              </div>
            )}

            {parsed.errors.length > 0 && (
              <div className="rounded-2xl p-4 space-y-1" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <p className="text-xs font-semibold text-red-300">Rows skipped</p>
                {parsed.errors.map((e, i) => <p key={i} className="text-xs text-red-200/70">{e}</p>)}
              </div>
            )}

            {parsed.swimmers.length === 0 && parsed.times.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-red-300 text-center">Nothing found — make sure you&apos;re using the Natrix template.</p>
                <button type="button" onClick={reset} className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10">Try again</button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button type="button" onClick={handleImport} className="flex-1 rounded-2xl py-4 text-base font-bold text-white transition" style={{ background: "#D97706" }}>
                  Import all
                </button>
                <button type="button" onClick={reset} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white/60 transition hover:bg-white/10">
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {importStatus === "importing" && (
          <div className="space-y-4 py-4">
            <p className="text-center text-sm font-semibold text-white">Importing… {progress.done} / {progress.total}</p>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%", background: "#D97706" }}
              />
            </div>
            <p className="text-center text-xs text-white/40">Don&apos;t close the app</p>
          </div>
        )}

        {importStatus === "done" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5 text-center space-y-2" style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(253,230,138,0.25)" }}>
              <p className="text-3xl">🎉</p>
              <p className="text-base font-bold text-white">Import complete!</p>
              <p className="text-sm text-white/60">
                {importedCounts.swimmers > 0 && `${importedCounts.swimmers} swimmer${importedCounts.swimmers === 1 ? "" : "s"} created`}
                {importedCounts.swimmers > 0 && importedCounts.times > 0 && " · "}
                {importedCounts.times > 0 && `${importedCounts.times} time${importedCounts.times === 1 ? "" : "s"} imported`}
              </p>
            </div>

            {importErrors.length > 0 && (
              <div className="rounded-2xl p-4 space-y-1" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <p className="text-xs font-semibold text-red-300">Some rows skipped</p>
                {importErrors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-red-200/70">{e}</p>)}
                {importErrors.length > 5 && <p className="text-xs text-red-200/50">+ {importErrors.length - 5} more</p>}
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => router.push("/swimmers")} className="flex-1 rounded-2xl py-4 text-base font-bold text-white transition" style={{ background: "#D97706" }}>
                View swimmers
              </button>
              <button type="button" onClick={reset} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white/60 transition hover:bg-white/10">
                Import more
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}