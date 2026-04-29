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
};

export default function ScanPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Ready");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleRunOcr() {
    if (!file) {
      setStatus("Please upload a screenshot first");
      return;
    }
    setStatus("Reading image...");
    setText("");
    setRows([]);
    try {
      const worker = await createWorker("eng");
      const result = await worker.recognize(file);
      const extractedText = result.data.text || "";
      setText(extractedText);
      const parsed = parseRows(extractedText);
      setRows(parsed);
      setStatus(`OCR complete (${parsed.length} rows found)`);
      await worker.terminate();
    } catch (err) {
      console.error(err);
      setStatus("OCR failed");
    }
  }

  async function handleSave() {
    if (rows.length === 0) {
      alert("No data to save");
      return;
    }
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        swimmer_name: r.name,
        time: r.time,
        place: r.place ?? null,
        source: "ocr",
        club: r.club ?? null,
        age: r.age ?? null,
      }));
      const { error } = await supabase.from("swim_results").insert(payload);
      if (error) {
        console.error("Supabase save error:", error);
        alert(`Error saving data: ${error.message}`);
        return;
      }
      alert("Saved to database 🚀");
      setStatus(`Saved ${payload.length} rows to database`);
    } catch (err) {
      console.error(err);
      alert("Something went wrong while saving");
    } finally {
      setSaving(false);
    }
  }

  // ─── PARSING ────────────────────────────────────────────────────────────────

  // Valid swim times: 1:20.23 or 25.12 (2-digit seconds minimum)
  const TIME_RE = /\b(\d{1,2}:\d{2}\.\d{1,2}|\d{2,3}\.\d{1,2})\b/;

  function parseRows(rawText: string): Row[] {
    const lines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const results: Row[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      // ── Skip pure header / metadata lines ──────────────────────────────────
      if (
        /^(girls|boys)\s/i.test(line) ||
        lower.includes("event details") ||
        lower.includes("year olds") ||
        lower === "time" ||
        lower === "place"
      )
        continue;

      const timeMatch = line.match(TIME_RE);
      if (!timeMatch) continue;

      const time = timeMatch[0];
      const timeIndex = line.indexOf(time);

      // ── Name extraction ─────────────────────────────────────────────────────
      let name = "";

      if (lower.startsWith("dropped:") || lower.startsWith("added:")) {
        // FIX: Time is on a Dropped/Added line — walk backwards to find the name.
        // This is why Kimi Rachel Koh was going missing before.
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const prev = lines[j];
          const prevLower = prev.toLowerCase();

          // Stop walking back if we hit another time (different swimmer's block)
          if (TIME_RE.test(prev)) break;

          // Skip lines that aren't useful for names
          if (
            prevLower.startsWith("dropped:") ||
            prevLower.startsWith("added:") ||
            prevLower === "place" ||
            prevLower === "time" ||
            /^\d{1,2}$/.test(prev)
          )
            continue;

          const candidate = cleanName(prev);
          if (candidate.length >= 3 && /[A-Z][a-z]/.test(candidate)) {
            name = candidate;
            break;
          }
        }
      } else {
        // Normal case: name sits before the time on the same line
        name = cleanName(line.substring(0, timeIndex));
      }

      if (!name || name.length < 3) continue;

      // Avoid duplicates
      if (results.some((r) => r.name === name && r.time === time)) continue;

      // ── Build context window (±2 lines) ─────────────────────────────────────
      const context = lines
        .slice(Math.max(0, i - 2), Math.min(lines.length, i + 3))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const afterTime = line.substring(timeIndex + time.length);
      const nextLine = lines[i + 1] || "";

      const place = extractPlace(afterTime, nextLine);
      const { club, age } = extractClubAndAge(context);

      results.push({
        name,
        time,
        place,
        raw: context.substring(0, 200),
        club,
        age,
      });
    }

    return results;
  }

  function cleanName(raw: string): string {
    return raw
      .replace(/^place\s+\d*\s*/i, "") // strip "PLACE 5 " prefix
      .replace(/^\d+\s+/, "")           // strip leading place number
      .replace(/[^a-zA-Z\s\-']/g, "")  // letters, spaces, hyphens, apostrophes only
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractPlace(afterTime: string, nextLine: string): number | null {
    // FIX: Exclude numbers immediately followed by ")" — these are OCR artifacts
    // (e.g. the "5)" that was bleeding from Kimi's place into Menggqi's raw)
    const afterMatch = afterTime.match(/^[\s]*(\d{1,2})(?!\))\b/);
    if (afterMatch) {
      const p = Number(afterMatch[1]);
      if (p >= 1 && p <= 99) return p;
    }

    // Fallback: standalone number at start of next line
    const nextMatch = nextLine.match(/^(\d{1,2})\b/);
    if (nextMatch) {
      const p = Number(nextMatch[1]);
      if (p >= 1 && p <= 30) return p;
    }

    return null;
  }

  function extractClubAndAge(combined: string): {
    club: string | null;
    age: number | null;
  } {
    let n = combined.toUpperCase();

    // Normalise brackets → pipe, strip noise words
    n = n
      .replace(/[\[\(\{]/g, "|")
      .replace(/[\]\)\}]/g, "")
      .replace(/\bTIME\b/g, " ")
      .replace(/\bPLACE\b/g, " ")
      .replace(/DROPPED\s*:?\s*[\+\-]?\d+[\.\d]*/g, " ")
      .replace(/ADDED\s*:?\s*[\+\-]?\d+[\.\d]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // ── Fix OCR club-code mangling ────────────────────────────────────────────

    // ESC variants
    n = n
      .replace(/ESCI(?=\d)/g, "ESC|")
      .replace(/ESCL(?=\d)/g, "ESC|")
      .replace(/ESC1(?=\d)/g, "ESC|")
      .replace(/\bESC(?=\d)/g, "ESC|");

    // CSC variants — CSCLIO is now included
    n = n
      .replace(/CSCLIO\b/g, "CSC|10")
      .replace(/CSCLO\b/g,  "CSC|10")
      .replace(/CSCL0\b/g,  "CSC|10")
      .replace(/CSCIO\b/g,  "CSC|10")
      .replace(/CSCI0\b/g,  "CSC|10")
      .replace(/CSC1O\b/g,  "CSC|10")
      .replace(/CSCL(?=\d)/g, "CSC|")
      .replace(/CSCI(?=\d)/g, "CSC|")
      .replace(/\bCSC(?=\d)/g, "CSC|");

    // TLSC variants
    n = n
      .replace(/TLSCI(?=\d)/g, "TLSC|")
      .replace(/TLSCL(?=\d)/g, "TLSC|")
      .replace(/\bTLSC(?=\d)/g, "TLSC|");

    // APSC variants
    n = n
      .replace(/APSCI(?=\d)/g, "APSC|")
      .replace(/APSCL(?=\d)/g, "APSC|")
      .replace(/\bAPSC(?=\d)/g, "APSC|");

    // Catch "CLUB  NUMBER" (space-separated, no pipe yet)
    n = n.replace(/\b(ESC|CSC|TLSC|APSC)\s+(\d{1,2})\b/g, "$1|$2");

    // FIX: Allow optional whitespace around the pipe so "TLSC | 10" and "TLSC |10" both match
    const match = n.match(/\b(ESC|CSC|TLSC|APSC)\s*\|\s*(\d{1,2})\b/);

    if (match) {
      return { club: match[1], age: Number(match[2]) };
    }

    return { club: null, age: null };
  }

  // ─── UI ─────────────────────────────────────────────────────────────────────

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
            className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/15"
          >
            Run OCR
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
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="rounded-xl border border-white/10 p-3">
                  <div><strong>Name:</strong> {r.name}</div>
                  <div><strong>Time:</strong> {r.time}</div>
                  <div><strong>Place:</strong> {r.place ?? "-"}</div>
                  <div><strong>Club:</strong> {r.club ?? "-"}</div>
                  <div><strong>Age:</strong> {r.age ?? "-"}</div>
                  <div className="mt-2 break-words text-xs text-white/50">
                    <strong>Raw:</strong> {r.raw}
                  </div>
                </div>
              ))}
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
