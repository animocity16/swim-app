"use client";

import { useState } from "react";
import { createWorker } from "tesseract.js";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  name: string;
  time: string;
  place: number | null;
  raw: string;
  club: string | null;
  age: number | null;
  age_group: string | null;
  event: string;
};

const TIME_RE = /\b(\d{1,2}:\d{2}\.\d{1,2}|\d{2,3}\.\d{1,2})\b/;

function inputClass(hasIssue = false) {
  return `input h-12 ${hasIssue ? "border-red-400/50" : ""}`;
}

function textareaClass(hasIssue = false) {
  return `input min-h-[90px] ${hasIssue ? "border-red-400/50" : ""}`;
}

function cleanName(raw: string): string {
  return raw
    .replace(/^place\s+\d*\s*/i, "")
    .replace(/^\d+\s+/, "")
    .replace(/[^a-zA-Z\s\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStroke(text: string): string {
  const lower = text.toLowerCase();

  if (lower.includes("backstroke") || /\bback\b/.test(lower)) {
    return "Backstroke";
  }
  if (lower.includes("breaststroke") || /\bbreast\b/.test(lower)) {
    return "Breaststroke";
  }
  if (lower.includes("butterfly") || /\bfly\b/.test(lower)) {
    return "Butterfly";
  }
  if (
    lower.includes("individual medley") ||
    /\bmedley\b/.test(lower) ||
    /\bim\b/.test(lower)
  ) {
    return "IM";
  }
  if (lower.includes("freestyle") || /\bfree\b/.test(lower)) {
    return "Freestyle";
  }

  return "";
}

function detectBaseEvent(text: string): {
  gender: string;
  distance: string;
  stroke: string;
  headerAgeGroup: string | null;
  isOpen: boolean;
} {
  const lower = text.toLowerCase();

  let gender = "";
  if (/\bgirls\b/.test(lower)) gender = "Girls";
  else if (/\bboys\b/.test(lower)) gender = "Boys";

  let distance = "";
  const distanceMatch =
    text.match(/\b(25|50|100|200|400|800|1500)\s*meter\b/i) ||
    text.match(/\b(25|50|100|200|400|800|1500)\s*m\b/i);

  if (distanceMatch) {
    distance = `${distanceMatch[1]}m`;
  }

  const stroke = normalizeStroke(text);

  const isOpen = /\bopen\b/i.test(text);
  let headerAgeGroup: string | null = null;

  if (isOpen) {
    headerAgeGroup = "Open";
  }

  if (!headerAgeGroup) {
    const rangeMatch = text.match(
      /\b(6|7|8|9|10|11|12|13|14|15|16|17|18)\s*[-–]\s*(6|7|8|9|10|11|12|13|14|15|16|17|18)\b/
    );
    if (rangeMatch) {
      headerAgeGroup = `${rangeMatch[1]}-${rangeMatch[2]}`;
    }
  }

  if (!headerAgeGroup) {
    const underMatch = text.match(
      /\b(6|7|8|9|10|11|12|13|14|15|16|17|18)\s*(?:&\s*under|under|and under)\b/i
    );
    if (underMatch) {
      headerAgeGroup = `${underMatch[1]}&U`;
    }
  }

  return {
    gender,
    distance,
    stroke,
    headerAgeGroup,
    isOpen,
  };
}

function detectSectionAgeGroup(text: string): string | null {
  const yearOldMatches = [
    ...text.matchAll(
      /\b(6|7|8|9|10|11|12|13|14|15|16|17|18)\s*year\s*olds?\b/gi
    ),
  ];

  if (yearOldMatches.length > 0) {
    const last = yearOldMatches[yearOldMatches.length - 1];
    return `${last[1]} Year Olds`;
  }

  if (/\bopen\b/i.test(text)) {
    return "Open";
  }

  const rangeMatch = text.match(
    /\b(6|7|8|9|10|11|12|13|14|15|16|17|18)\s*[-–]\s*(6|7|8|9|10|11|12|13|14|15|16|17|18)\b/
  );
  if (rangeMatch) {
    return `${rangeMatch[1]}-${rangeMatch[2]}`;
  }

  const underMatch = text.match(
    /\b(6|7|8|9|10|11|12|13|14|15|16|17|18)\s*(?:&\s*under|under|and under)\b/i
  );
  if (underMatch) {
    return `${underMatch[1]}&U`;
  }

  return null;
}

function extractClubAndAge(combined: string): {
  club: string | null;
  age: number | null;
} {
  let n = combined.toUpperCase();

  n = n
    .replace(/[\[\(\{]/g, "|")
    .replace(/[\]\)\}]/g, "")
    .replace(/\bTIME\b/g, " ")
    .replace(/DROPPED\s*:?\s*[\+\-]?\d+[\.\d]*/g, " ")
    .replace(/ADDED\s*:?\s*[\+\-]?\d+[\.\d]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  n = n
    .replace(/\b(ESC|CSC|TLSC|APSC|ACE)[A-Z]*?([0-9]{1,2})\b/g, "$1|$2")
    .replace(/CSCLIO\b/g, "CSC|10")
    .replace(/CSCLO\b/g, "CSC|10")
    .replace(/CSCL0\b/g, "CSC|10")
    .replace(/CSCIO\b/g, "CSC|10")
    .replace(/CSCI0\b/g, "CSC|10")
    .replace(/CSC1O\b/g, "CSC|10")
    .replace(/ESCL0\b/g, "ESC|10")
    .replace(/ESCI0\b/g, "ESC|10")
    .replace(/ESC1O\b/g, "ESC|10")
    .replace(/TLSCL0\b/g, "TLSC|10")
    .replace(/TLSCI0\b/g, "TLSC|10")
    .replace(/TLSC1O\b/g, "TLSC|10")
    .replace(/APSCL0\b/g, "APSC|10")
    .replace(/APSCI0\b/g, "APSC|10")
    .replace(/APSC1O\b/g, "APSC|10")
    .replace(/\b(ESC|CSC|TLSC|APSC|ACE)\s+(\d{1,2})\b/g, "$1|$2");

  const matches = [
    ...n.matchAll(/\b(ESC|CSC|TLSC|APSC|ACE)\s*\|\s*(\d{1,2})\b/g),
  ];

  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    return {
      club: last[1],
      age: Number(last[2]),
    };
  }

  if (
    n.includes("CSCLIO") ||
    n.includes("CSCLO") ||
    n.includes("CSCL0") ||
    n.includes("CSCIO") ||
    n.includes("CSCI0") ||
    n.includes("CSC1O")
  ) {
    return { club: "CSC", age: 10 };
  }

  if (n.includes("ESCI0") || n.includes("ESCL0") || n.includes("ESC10")) {
    return { club: "ESC", age: 10 };
  }

  if (n.includes("TLSCI0") || n.includes("TLSCL0") || n.includes("TLSC10")) {
    return { club: "TLSC", age: 10 };
  }

  if (n.includes("APSCI0") || n.includes("APSCL0") || n.includes("APSC10")) {
    return { club: "APSC", age: 10 };
  }

  if (n.includes("ACE")) {
    const ageMatch = n.match(/\b(6|7|8|9|10|11|12|13|14|15|16|17|18)\b/);
    return {
      club: "ACE",
      age: ageMatch ? Number(ageMatch[1]) : null,
    };
  }

  return {
    club: null,
    age: null,
  };
}

function timeToMs(time: string): number {
  if (time.includes(":")) {
    const [mins, secs] = time.split(":");
    return Math.round((Number(mins) * 60 + Number(secs)) * 1000);
  }
  return Math.round(Number(time) * 1000);
}

function buildEventName(parts: {
  gender: string;
  ageGroup: string | null;
  distance: string;
  stroke: string;
}): string {
  return [parts.gender, parts.ageGroup, parts.distance, parts.stroke]
    .filter(Boolean)
    .join(" ") || "Unknown";
}

function parseRows(rawText: string): Row[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const base = detectBaseEvent(rawText);
  const results: Row[] = [];
  let activeSectionAgeGroup: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    const sectionAgeGroup = detectSectionAgeGroup(line);
    if (sectionAgeGroup) {
      activeSectionAgeGroup = sectionAgeGroup;
    }

    if (
      /^(girls|boys)\s/i.test(line) ||
      lower.includes("event details") ||
      lower.includes("finals - results") ||
      lower === "time" ||
      lower === "place"
    ) {
      continue;
    }

    const timeMatch = line.match(TIME_RE);
    if (!timeMatch) continue;

    const time = timeMatch[0];
    const timeIndex = line.indexOf(time);

    let name = "";

    if (lower.startsWith("dropped:") || lower.startsWith("added:")) {
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prev = lines[j];
        const prevLower = prev.toLowerCase();

        if (TIME_RE.test(prev)) break;

        if (
          prevLower.startsWith("dropped:") ||
          prevLower.startsWith("added:") ||
          prevLower === "place" ||
          prevLower === "time" ||
          /^\d{1,2}$/.test(prev)
        ) {
          continue;
        }

        const candidate = cleanName(prev);
        if (candidate.length >= 3 && /[A-Z][a-z]/.test(candidate)) {
          name = candidate;
          break;
        }
      }
    } else {
      name = cleanName(line.substring(0, timeIndex));
    }

    if (!name || name.length < 3) continue;

    const prevLine = lines[i - 1] || "";
    const nextLine = lines[i + 1] || "";
    const nextNextLine = lines[i + 2] || "";

    const context = [prevLine, line, nextLine, nextNextLine]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    let { club, age } = extractClubAndAge(context);

    if (!club || !age) {
      const widerContext = [
        lines[i - 1] || "",
        lines[i] || "",
        lines[i + 1] || "",
        lines[i + 2] || "",
        lines[i + 3] || "",
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const fallback = extractClubAndAge(widerContext);

      if (!club && fallback.club) club = fallback.club;
      if (!age && fallback.age) age = fallback.age;
    }

    const chosenAgeGroup =
      age != null
        ? `${age} Year Olds`
        : activeSectionAgeGroup ||
          base.headerAgeGroup ||
          (base.isOpen ? "Open" : null);

    const event = buildEventName({
      gender: base.gender,
      ageGroup: chosenAgeGroup,
      distance: base.distance,
      stroke: base.stroke,
    });

    if (
      results.some(
        (r) => r.name === name && r.time === time && r.event === event
      )
    ) {
      continue;
    }

    results.push({
      name,
      time,
      place: null,
      raw: context.substring(0, 220),
      club,
      age,
      age_group: chosenAgeGroup,
      event,
    });
  }

  return results;
}

function rankRowsByTime(rows: Row[]): Row[] {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const key = row.event || "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const rankedRows: Row[] = [];

  for (const [, groupRows] of groups) {
    const sorted = [...groupRows].sort(
      (a, b) => timeToMs(a.time) - timeToMs(b.time)
    );

    sorted.forEach((row, index) => {
      rankedRows.push({
        ...row,
        place: index + 1,
      });
    });
  }

  return rankedRows;
}

export default function ScanPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Ready");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [runningOcr, setRunningOcr] = useState(false);

  function updateRow<K extends keyof Row>(
    index: number,
    field: K,
    value: Row[K]
  ) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function deleteRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function handleAgeChange(index: number, value: string) {
    const trimmed = value.trim();
    const nextAge = trimmed === "" ? null : Number(trimmed);
    const safeAge = Number.isNaN(nextAge) ? null : nextAge;

    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;

        const nextAgeGroup =
          safeAge != null ? `${safeAge} Year Olds` : row.age_group;

        const gender = row.event.includes("Girls")
          ? "Girls"
          : row.event.includes("Boys")
            ? "Boys"
            : "";

        const distanceMatch = row.event.match(
          /\b(25|50|100|200|400|800|1500)m\b/i
        );
        const distance = distanceMatch ? distanceMatch[0] : "";

        const stroke = normalizeStroke(row.event);

        const nextEvent = buildEventName({
          gender,
          ageGroup: nextAgeGroup,
          distance,
          stroke,
        });

        return {
          ...row,
          age: safeAge,
          age_group: nextAgeGroup,
          event: nextEvent,
        };
      })
    );
  }

  async function handleRunOcr() {
    if (!file) {
      setStatus("Please upload a screenshot first");
      return;
    }

    setRunningOcr(true);
    setStatus("Reading image...");
    setText("");
    setRows([]);

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      worker = await createWorker("eng");
      const result = await worker.recognize(file);
      const extractedText = result.data.text || "";

      setText(extractedText);

      const parsed = parseRows(extractedText);
      const ranked = rankRowsByTime(parsed);

      setRows(ranked);
      setStatus(`OCR complete (${ranked.length} rows found)`);
    } catch (err) {
      console.error("OCR error:", err);
      setStatus("OCR failed");
    } finally {
      if (worker) {
        await worker.terminate();
      }
      setRunningOcr(false);
    }
  }

  async function handleSave() {
    if (rows.length === 0) {
      alert("No data to save");
      return;
    }

    setSaving(true);
    setStatus("Saving results...");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("Auth error:", userError);
        alert("Could not check login.");
        setStatus("Could not check login.");
        return;
      }

      if (!user) {
        alert("You must be logged in.");
        setStatus("You must be logged in.");
        return;
      }

      const payload = rows.map((r) => ({
        swimmer_name: r.name.trim(),
        time: r.time.trim(),
        place: r.place ?? null,
        source: "ocr",
        club: r.club?.trim() || null,
        age: r.age ?? null,
        age_group: r.age_group?.trim() || null,
        event: r.event.trim(),
        user_id: user.id,
      }));

      const { error } = await supabase.from("swim_results").insert(payload);

      if (error) {
        console.error("Supabase save error:", error);
        console.error("message:", error?.message);
        console.error("details:", error?.details);
        console.error("hint:", error?.hint);
        console.error("code:", error?.code);

        alert(`Error saving data: ${error?.message || "Unknown error"}`);
        setStatus(`Error saving data: ${error?.message || "Unknown error"}`);
        return;
      }

      alert("Saved to database 🚀");
      setStatus(`Saved ${payload.length} rows to database`);
    } catch (err) {
      console.error("Unexpected save error:", err);
      alert("Something went wrong while saving");
      setStatus("Something went wrong while saving");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold">Scan Results</h1>

        <p className="text-sm text-white/70">{status}</p>
        <p className="text-sm text-white/70">
          {file ? `Selected: ${file.name}` : "No file selected"}
        </p>

        <div className="flex flex-wrap gap-3">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/15">
            Upload screenshot
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <button
            type="button"
            onClick={handleRunOcr}
            disabled={runningOcr}
            className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runningOcr ? "Running OCR..." : "Run OCR"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || rows.length === 0}
            className="inline-flex items-center justify-center rounded-2xl border border-green-400/30 bg-green-500/20 px-4 py-3 text-sm font-medium text-white hover:bg-green-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Results"}
          </button>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-medium">Parsed Results</h2>

          {rows.length === 0 ? (
            <div className="text-sm text-white/50">No rows yet</div>
          ) : (
            <div className="space-y-4">
              {rows.map((r, i) => {
                const missingName = !r.name.trim();
                const missingEvent = !r.event.trim();
                const missingTime = !r.time.trim();
                const missingAgeGroup = !r.age_group?.trim();

                return (
                  <div
                    key={i}
                    className="space-y-3 rounded-2xl border border-white/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm text-white/50">
                        Result #{i + 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteRow(i)}
                        className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20"
                      >
                        Delete Row
                      </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-white/50">
                          Name
                        </label>
                        <input
                          className={inputClass(missingName)}
                          value={r.name}
                          onChange={(e) =>
                            updateRow(i, "name", e.target.value)
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-white/50">
                          Event
                        </label>
                        <input
                          className={inputClass(missingEvent)}
                          value={r.event}
                          onChange={(e) =>
                            updateRow(i, "event", e.target.value)
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-white/50">
                          Age Group
                        </label>
                        <input
                          className={inputClass(missingAgeGroup)}
                          value={r.age_group ?? ""}
                          onChange={(e) =>
                            updateRow(
                              i,
                              "age_group",
                              e.target.value.trim() || null
                            )
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-white/50">
                          Time
                        </label>
                        <input
                          className={inputClass(missingTime)}
                          value={r.time}
                          onChange={(e) =>
                            updateRow(i, "time", e.target.value)
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-white/50">
                          Place
                        </label>
                        <input
                          className={inputClass(false)}
                          value={r.place ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            updateRow(
                              i,
                              "place",
                              v === ""
                                ? null
                                : Number.isNaN(Number(v))
                                  ? null
                                  : Number(v)
                            );
                          }}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-white/50">
                          Club
                        </label>
                        <input
                          className={inputClass(false)}
                          value={r.club ?? ""}
                          onChange={(e) =>
                            updateRow(i, "club", e.target.value.trim() || null)
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-white/50">
                          Age
                        </label>
                        <input
                          className={inputClass(false)}
                          inputMode="numeric"
                          value={r.age ?? ""}
                          onChange={(e) => handleAgeChange(i, e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-white/50">
                        Raw OCR
                      </label>
                      <textarea
                        className={textareaClass(false)}
                        value={r.raw}
                        onChange={(e) => updateRow(i, "raw", e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-lg font-medium">OCR Raw Text</h2>
          <textarea className="input min-h-[200px]" value={text} readOnly />
        </div>
      </div>
    </main>
  );
}