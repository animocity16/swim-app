"use client";

import React, { useState } from "react";
import { createWorker } from "tesseract.js";

type Props = {
  swimmerId: number;
  swimmerName: string;
  clubHint?: string;
  onSaved?: (text: string) => void;
};

export default function SwimScan({
  swimmerId,
  swimmerName,
  clubHint,
  onSaved,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [rawText, setRawText] = useState("");
  const [showRaw, setShowRaw] = useState(false);

  async function handleScan() {
    setMsg("");
    setRawText("");

    if (!file) {
      setMsg("Please choose a screenshot first.");
      return;
    }

    if (!swimmerId) {
      setMsg("Missing swimmer ID.");
      return;
    }

    if (!swimmerName) {
      setMsg("Missing swimmer name.");
      return;
    }

    setBusy(true);

    try {
      const text = await ocrImageToText(file);
      setRawText(text);
      onSaved?.(text);
      setMsg("Scan complete.");
    } catch (error: any) {
      setMsg(error?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-white">SwimScan</h3>
          <p className="mt-1 text-sm text-white/55">
            Scan race results for {swimmerName}
            {clubHint ? ` (${clubHint})` : ""}.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
          {swimmerName}
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-blue-400 bg-black/40 px-6 py-12 text-center transition hover:border-blue-300 hover:bg-black/60">
        <div className="text-xl font-bold text-white">
          {file ? file.name : "📸 Click to upload screenshot"}
        </div>

        <div className="mt-2 text-sm text-white/70">
          PNG or JPG • Meet results screenshot
        </div>

        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </label>

      <button
        onClick={handleScan}
        disabled={busy || !file}
        className="mt-6 w-full rounded-2xl bg-blue-500 px-4 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Scanning..." : "🚀 Scan screenshot"}
      </button>

      {msg && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
          {msg}
        </div>
      )}

      {rawText && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-sm text-slate-300 underline"
          >
            {showRaw ? "Hide OCR raw text" : "Show OCR raw text"}
          </button>

          {showRaw && (
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-black/10 bg-white p-3 text-xs text-black">
              {rawText}
            </pre>
          )}
        </div>
      )}
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