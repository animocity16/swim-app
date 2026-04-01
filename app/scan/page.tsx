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

  const TIME_RE = /\b(\d{1,2}:\d{2}\.\d{1,2}|\d{2,3}\.\d{1,2})\b/;

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
      const ranked = rankRowsByTime(parsed);

      setRows(ranked);
      setStatus(`OCR complete (${ranked.length} rows found)`);

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

  function parseRows(rawText: string): Row[] {
    const lines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const results: Row[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      if (
        /^(girls|boys)\s/i.test(line) ||
        lower.includes("event details") ||
        lower.includes("year olds") ||
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

      if (results.some((r) => r.name === name && r.time === time)) continue;

      const nextLine = lines[i + 1] || "";
      const context = [line, nextLine]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const { club, age } = extractClubAndAge(context);

      results.push({
        name,
        time,
        place: null, // place now comes from ranking by time
        raw: context.substring(0, 220),
        club,
        age,
      });
    }

    return results;
  }

  function cleanName(raw: string): string {
    return raw
      .replace(/^place\s+\d*\s*/i, "")
      .replace(/^\d+\s+/, "")
      .replace(/[^a-zA-Z\s\-']/g, "")
      .replace(/\s+/g, " ")
      .trim();
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

    if (
      n.includes("ESCI0") ||
      n.includes("ESCL0") ||
      n.includes("ESC10")
    ) {
      return { club: "ESC", age: 10 };
    }

    if (
      n.includes("TLSCI0") ||
      n.includes("TLSCL0") ||
      n.includes("TLSC10")
    ) {
      return { club: "TLSC", age: 10 };
    }

    if (
      n.includes("APSCI0") ||
      n.includes("APSCL0") ||
      n.includes("APSC10")
    ) {
      return { club: "APSC", age: 10 };
    }

    if (n.includes("ACE")) {
      const ageMatch = n.match(/\b(6|7|8|9|10|11|12)\b/);
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

  function rankRowsByTime(rows: Row[]): Row[] {
    const sorted = [...rows].sort((a, b) => timeToMs(a.time) - timeToMs(b.time));

    const placeMap = new Map<string, number>();

    sorted.forEach((row, index) => {
      placeMap.set(`${row.name}|${row.time}`, index + 1);
    });

    return rows.map((row) => ({
      ...row,
      place: placeMap.get(`${row.name}|${row.time}`) ?? null,
    }));
  }

  function timeToMs(time: string): number {
    if (time.includes(":")) {
      const [mins, secs] = time.split(":");
      return Math.round((Number(mins) * 60 + Number(secs)) * 1000);
    }
    return Math.round(Number(time) * 1000);
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