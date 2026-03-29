"use client";

import React, { useMemo, useState } from "react";
import { createWorker } from "tesseract.js";
import { supabase } from "@/lib/supabaseClient";
import SwimTimesSection from "./SwimTimesSection";

type Extracted = {
  event: string;
  course: "LCM" | "SCM";
  matchedLine: string;
  place: number | null;
  club: string | null;
  age: number | null;
  timeStr: string;
  timeMs: number;
  rawText: string;
};

type Props = {
  swimmerId: number;
  swimmerName: string;
  clubHint?: string;
  onSaved?: () => void;
};

export default function MeetMobileImport({
  swimmerId,
  swimmerName,
  clubHint,
  onSaved,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const headerRight = useMemo(() => {
    const clubText = clubHint ? ` (${clubHint})` : "";
    return `${swimmerName || "—"}${clubText}`;
  }, [swimmerName, clubHint]);

  async function handleScan() {
    setMsg("");
    setExtracted(null);

    if (!file) {
      setMsg("❌ Please choose a screenshot first.");
      return;
    }

    if (!swimmerId) {
      setMsg("❌ swimmerId is missing. Pass swimmerId into MeetMobileImport.");
      return;
    }

    if (!swimmerName) {
      setMsg("❌ swimmerName is missing. Pass swimmerName into MeetMobileImport.");
      return;
    }

    setBusy(true);

    try {
      const rawText = await ocrImageToText(file);

      const parsed = parseMeetMobileOCR(rawText, swimmerName);

      if (!parsed) {
        setMsg("⚠️ Could not confirm this screenshot belongs to this swimmer.");
        setExtracted({
          event: "Unknown",
          course: detectCourse(rawText),
          matchedLine: "",
          place: null,
          club: null,
          age: null,
          timeStr: "",
          timeMs: 0,
          rawText,
        });
        return;
      }

      const finalExtract: Extracted = {
        ...parsed,
        rawText,
      };

      setExtracted(finalExtract);

      const payload = {
        swimmer_id: swimmerId,
        event: extractEvent(finalExtract.event),
        course: finalExtract.course,
        time_ms: finalExtract.timeMs,
        meet_name: "MeetMobile Import",
        meet_date: null as string | null,
        notes: `Matched line: ${finalExtract.matchedLine || "—"}`,
      };

      const result = await saveToSupabase(payload);

      if (result.skipped) {
        setMsg("✅ Already saved (duplicate).");
      } else {
        setMsg("✅ Saved to Supabase!");
      }

      onSaved?.();
    } catch (e: any) {
      setMsg("❌ " + (e?.message ?? "Unknown error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">MeetMobile Screenshot Import</h2>
        <div className="text-sm text-gray-600">{headerRight}</div>
      </div>

      <div className="mt-4">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <button
        onClick={handleScan}
        disabled={busy || !file}
        className="mt-4 w-full rounded-xl border px-4 py-3 text-lg font-semibold hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? "Scanning..." : "Scan screenshot"}
      </button>

      {msg && <div className="mt-4 rounded-xl border p-3 text-sm">{msg}</div>}

      <div className="mt-5 rounded-2xl border p-4">
        <div className="mb-3 text-lg font-semibold">Extracted</div>

        {!extracted ? (
          <div className="text-sm text-gray-500">No data yet.</div>
        ) : (
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-500">Event:</span>{" "}
              <span className="font-semibold">{extracted.event}</span>
            </div>

            <div>
              <span className="text-gray-500">Course:</span>{" "}
              <span className="font-semibold">{extracted.course}</span>
            </div>

            <div>
              <span className="text-gray-500">Matched line:</span>{" "}
              <span className="font-semibold">
                {extracted.matchedLine || "—"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <span className="text-gray-500">Place:</span>{" "}
                <span className="font-semibold">{extracted.place ?? "—"}</span>
              </div>

              <div>
                <span className="text-gray-500">Club:</span>{" "}
                <span className="font-semibold">{extracted.club ?? "—"}</span>
              </div>

              <div>
                <span className="text-gray-500">Age:</span>{" "}
                <span className="font-semibold">{extracted.age ?? "—"}</span>
              </div>

              <div>
                <span className="text-gray-500">Time:</span>{" "}
                <span className="font-semibold">{extracted.timeStr || "—"}</span>
              </div>
            </div>

            <div className="mt-4 border-t pt-4">
              <div className="text-sm text-gray-500">time_ms (for Supabase):</div>
              <div className="text-2xl font-bold">
                {extracted.timeMs ? extracted.timeMs : "—"}
              </div>
            </div>

            <button
              onClick={() => setShowRaw((v) => !v)}
              className="mt-3 text-sm text-gray-600 underline"
              type="button"
            >
              {showRaw ? "Hide OCR raw text (debug)" : "Show OCR raw text (debug)"}
            </button>

            {showRaw && (
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border bg-gray-50 p-3 text-xs">
                {extracted.rawText || "(empty)"}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

async function ocrImageToText(file: File): Promise<string> {
  const worker = await createWorker("eng");

  try {
    const {
      data: { text },
    } = await worker.recognize(file);

    return text || "";
  } finally {
    await worker.terminate();
  }
}

async function saveToSupabase(payload: {
  swimmer_id: number;
  event: string;
  course: string;
  time_ms: number;
  meet_name: string;
  meet_date: string | null;
  notes: string;
}): Promise<{ skipped: boolean }> {
  const { data: existing, error: checkErr } = await supabase
    .from("swim_times")
    .select("id")
    .eq("swimmer_id", payload.swimmer_id)
    .eq("event", payload.event)
    .eq("course", payload.course)
    .eq("time_ms", payload.time_ms)
    .limit(1);

  if (checkErr) {
    throw new Error(checkErr.message);
  }

  if (existing && existing.length > 0) {
    return { skipped: true };
  }

  const { error } = await supabase.from("swim_times").insert([payload]);

  if (error) {
    throw new Error(error.message);
  }

  return { skipped: false };
}

function parseMeetMobileOCR(raw: string, swimmerName: string) {
  const text = raw.replace(/\r/g, "");

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let matchedLine = "";
  let club: string | null = null;
  let age: number | null = null;
  let place: number | null = null;
  let timeStr: string | null = null;
  let event: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (!matchedLine && looksLikeSwimmerName(line, swimmerName)) {
      matchedLine = line;
    }

    if (line.includes("|")) {
      const parts = line.split("|");

      if (parts.length === 2) {
        const maybeClub = parts[0].trim();
        const maybeAge = parseInt(parts[1].trim(), 10);

        if (maybeClub) club = maybeClub;
        if (!Number.isNaN(maybeAge)) age = maybeAge;
      }
    }

    if (line.toUpperCase().includes("PLACE")) {
      const next = lines[i + 1] ?? "";
      const sameLineDigits = line.replace(/[^\d]/g, "");
      const nextLineDigits = next.replace(/[^\d]/g, "");

      if (sameLineDigits) {
        const parsedPlace = parseInt(sameLineDigits, 10);
        if (!Number.isNaN(parsedPlace)) place = parsedPlace;
      } else if (nextLineDigits) {
        const parsedPlace = parseInt(nextLineDigits, 10);
        if (!Number.isNaN(parsedPlace)) place = parsedPlace;
      }
    }

    if (line.toUpperCase().includes("FINALS")) {
      const tokenFromSameLine = extractTimeToken(line);
      const tokenFromNextLine = extractTimeToken(lines[i + 1] ?? "");

      if (tokenFromSameLine) {
        timeStr = normalizeTimeToken(tokenFromSameLine);
      } else if (tokenFromNextLine) {
        timeStr = normalizeTimeToken(tokenFromNextLine);
      }
    }

    if (
      !event &&
      (lower.includes("meter") || /\b\d+\s*m\s*/i.test(line)) &&
      !lower.includes("split") &&
      !lower.includes("event summary") &&
      !lower.includes("combined")
    ) {
      const cleanedEvent = extractEvent(line);
      if (cleanedEvent !== "Unknown") {
        event = cleanedEvent;
      }
    }
  }

  if (!matchedLine || !timeStr) {
    return null;
  }

  const course = detectCourse(text);
  const timeMs = timeToMs(timeStr);

  return {
    event: event || "Unknown",
    course,
    matchedLine,
    place,
    club,
    age,
    timeStr,
    timeMs,
  };
}

function detectCourse(text: string): "LCM" | "SCM" {
  const t = text.toUpperCase();

  if (/\b50\s*M\b/.test(t)) return "LCM";
  if (/\b25\s*M\b/.test(t)) return "SCM";

  if (/\bLCM\b/.test(t)) return "LCM";
  if (/\bSCM\b/.test(t)) return "SCM";

  return "LCM";
}

function extractEvent(text: string): string {
  let cleaned = text
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = cleaned.replace(
    /^(girls?|boys?|women|men|mixed)\s+[a-z0-9&\-\s]+?(?=\d+\s*(meter|m)\b)/i,
    ""
  ).trim();

  cleaned = cleaned.replace(/^(girls?|boys?|women|men|mixed)\s+/i, "").trim();

  let m = cleaned.match(/\b(\d+)\s*(meter|m)?\s*individual medley\b/i);
  if (m) return `${m[1]} IM`;

  m = cleaned.match(
    /\b(\d+)\s*(meter|m)?\s*(backstroke|freestyle|butterfly|breaststroke)\b/i
  );
  if (m) return `${m[1]} ${strokeShortName(m[3])}`;

  m = cleaned.match(/\b(\d+)\s*(meter|m)?\s*(back|free|fly|breast|im)\b/i);
  if (m) return `${m[1]} ${capitalize(m[3])}`;

  return "Unknown";
}

function timeToMs(t: string): number {
  if (t.includes(":")) {
    const [mm, ss] = t.split(":");
    const minutes = parseInt(mm, 10);
    const seconds = parseFloat(ss);
    return Math.round((minutes * 60 + seconds) * 1000);
  }

  return Math.round(parseFloat(t) * 1000);
}

function capitalize(s: string) {
  const x = s.toLowerCase();

  if (x === "im") return "IM";

  return x.charAt(0).toUpperCase() + x.slice(1);
}

function extractTimeToken(line: string): string | null {
  const cleaned = line.replace(",", ".");

  const m1 = cleaned.match(/(\d+:\d+\.\d+)/);
  if (m1) return m1[1];

  const m2 = cleaned.match(/(\d+\.\d+)/);
  if (m2) return m2[1];

  const m3 = cleaned.match(/\b(\d{3,4})\b/);
  if (m3) return m3[1];

  return null;
}

function normalizeTimeToken(token: string): string {
  const t = token.replace(",", ".");

  if (t.includes(":") || t.includes(".")) return t;

  if (/^\d{4}$/.test(t)) return `${t.slice(0, 2)}.${t.slice(2)}`;
  if (/^\d{3}$/.test(t)) return `${t.slice(0, 1)}.${t.slice(1)}`;

  return t;
}

function strokeShortName(s: string): string {
  const x = s.toLowerCase();

  if (x === "backstroke") return "Back";
  if (x === "freestyle") return "Free";
  if (x === "butterfly") return "Fly";
  if (x === "breaststroke") return "Breast";

  return capitalize(s);
}

function looksLikeSwimmerName(line: string, swimmerName: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const lineNorm = normalize(line);
  const swimmerNorm = normalize(swimmerName);

  if (!lineNorm || !swimmerNorm) return false;

  if (lineNorm.includes(swimmerNorm)) return true;

  const swimmerParts = swimmerNorm.split(" ").filter((p) => p.length >= 3);
  const matchedParts = swimmerParts.filter((part) => lineNorm.includes(part));

  if (swimmerParts.length >= 2) {
    return matchedParts.length >= 2;
  }

  return matchedParts.length >= 1;
}