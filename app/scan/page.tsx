"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createWorker } from "tesseract.js";
import { supabase } from "@/lib/supabaseClient";
import { parseSwimOCRText } from "@/lib/ocrMultiEventParser";
import type { ParsedSwimResult } from "@/lib/ocrMultiEventParser";
import SpreadsheetImport from "./SpreadsheetImport";

// ─── Types ────────────────────────────────────────────────────────────────────

type Swimmer = {
  id: number;
  name: string;
  age: number;
  swim_club?: string | null;
  gender?: string | null;
  group_type?: string | null;
};

type MatchMethod = "exact" | "full_fuzzy" | "first_name" | "initial" | "none";

type MatchResult = {
  swimmer: Swimmer | null;
  confidence: number; // 0–1
  method: MatchMethod;
};

type QueueStatus = "pending" | "processing" | "parsed" | "error";

type QueueItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  resultCount: number;
  error?: string;
};

type PendingResult = {
  key: string;
  parsed: ParsedSwimResult;
  match: MatchResult;
  swimmerId: number | null;
  confirmed: boolean;
  saved: boolean;
  skipped: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msToTime(ms: number): string {
  const totalHundredths = Math.round(ms / 10);
  const minutes = Math.floor(totalHundredths / 6000);
  const secHundredths = totalHundredths % 6000;
  const seconds = Math.floor(secHundredths / 100);
  const hundredths = secHundredths % 100;
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }
  return `${seconds}.${String(hundredths).padStart(2, "0")}`;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

// ─── Fuzzy swimmer match ──────────────────────────────────────────────────────
//
// KEY INSIGHT: OCR often picks up garbage tokens from Meet Mobile UI chrome
// (e.g. "ZINE Ena Ang" when the real name is "Ena Ang"). The fix is to check
// whether ALL *swimmer* name tokens appear in the OCR tokens — not the other
// way around. If the swimmer's full name is a subset of the OCR blob, it's a
// strong match regardless of what other junk surrounds it.

function fuzzyMatchSwimmer(ocrName: string | null, swimmers: Swimmer[]): MatchResult {
  const none: MatchResult = { swimmer: null, confidence: 0, method: "none" };
  if (!ocrName || !swimmers.length) return none;

  // If there is exactly one swimmer, always return them — no ambiguity possible
  if (swimmers.length === 1) {
    return { swimmer: swimmers[0], confidence: 1, method: "exact" };
  }

  const raw = normName(ocrName);
  const tokens = raw.split(" ").filter(Boolean);
  if (!tokens.length) return none;

  let best: MatchResult = none;

  for (const swimmer of swimmers) {
    const sName = normName(swimmer.name);
    const sTokens = sName.split(" ").filter(Boolean);

    // Exact full match
    if (raw === sName) return { swimmer, confidence: 1, method: "exact" };

    // ✅ KEY FIX: All *swimmer* tokens found in OCR tokens (handles garbage prefix/suffix)
    // e.g. "ZINE Ena Ang" → ocrTokens has "ena" and "ang" → matches "Ena Ang" ✓
    if (sTokens.length >= 2) {
      const allSwimmerTokensFound = sTokens.every((st) =>
        tokens.some((t) => t === st || t.startsWith(st) || st.startsWith(t))
      );
      if (allSwimmerTokensFound) {
        // Perfect token-for-token → 0.95, OCR had extra garbage → 0.89
        const conf = tokens.length === sTokens.length ? 0.95 : 0.89;
        if (conf > best.confidence) best = { swimmer, confidence: conf, method: "full_fuzzy" };
        continue;
      }
    }

    // All OCR tokens found in swimmer name (clean subset match, no garbage)
    if (tokens.length >= 2) {
      const allOcrTokensFound = tokens.every((t) =>
        sTokens.some((st) => st.startsWith(t) || t.startsWith(st))
      );
      if (allOcrTokensFound) {
        const conf = 0.88;
        if (conf > best.confidence) best = { swimmer, confidence: conf, method: "full_fuzzy" };
        continue;
      }
    }

    // Initial match: "J Loh" → "Julian Loh"
    if (tokens.length >= 2 && tokens[0].length === 1) {
      const firstOk = sTokens[0]?.startsWith(tokens[0]);
      const lastOk = sTokens[sTokens.length - 1] === tokens[tokens.length - 1];
      if (firstOk && lastOk) {
        const conf = 0.72;
        if (conf > best.confidence) best = { swimmer, confidence: conf, method: "initial" };
        continue;
      }
    }

    // First name only (OCR missed last name)
    if (tokens[0] && tokens[0].length >= 3 && sTokens[0] === tokens[0]) {
      const conf = 0.55;
      if (conf > best.confidence) best = { swimmer, confidence: conf, method: "first_name" };
    }
  }

  return best;
}

// ─── Full-text swimmer search (fallback when name extraction fails) ───────────
// Searches the entire raw OCR text for any swimmer name from the database.
// Handles cases where Tesseract merges lines and the name regex fails.

function findSwimmerInText(rawText: string, swimmers: Swimmer[]): MatchResult {
  const none: MatchResult = { swimmer: null, confidence: 0, method: "none" };
  if (!rawText || !swimmers.length) return none;

  const textNorm = rawText.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

  for (const swimmer of swimmers) {
    const nameNorm = swimmer.name.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    if (textNorm.includes(nameNorm)) {
      return { swimmer, confidence: 0.85, method: "full_fuzzy" };
    }
    const tokens = nameNorm.split(" ").filter((t) => t.length >= 3);
    if (tokens.length >= 2 && tokens.every((t) => textNorm.includes(t))) {
      return { swimmer, confidence: 0.78, method: "full_fuzzy" };
    }
  }

  return none;
}

async function isDuplicate(swimmerId: number, r: ParsedSwimResult): Promise<boolean> {
  let q = supabase
    .from("swim_times")
    .select("id", { count: "exact", head: true })
    .eq("swimmer_id", swimmerId)
    .eq("event", r.event)
    .eq("course", r.course)
    .eq("time_ms", r.timeMs);

  if (r.swamAt)   q = q.eq("swam_at",   r.swamAt);
  if (r.meetName) q = q.eq("meet_name", r.meetName);

  const { count } = await q;
  return (count ?? 0) > 0;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOW_CONF_THRESHOLD = 0.80; // below this → warn + require confirmation
const AUTO_CONF_THRESHOLD = 0.88; // at or above → auto-confirmed

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScanPage() {
  const router = useRouter();
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);
  const processingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [workerReady, setWorkerReady] = useState(false);
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [pendingResults, setPendingResults] = useState<PendingResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [dupCount, setDupCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<"scan" | "import">("scan");

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    void init();
    return () => { void workerRef.current?.terminate(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    const { data } = await supabase
      .from("swimmers")
      .select("id, name, age, swim_club, gender, group_type")
      .eq("user_id", session.user.id)
      .order("name");
    setSwimmers((data as Swimmer[]) ?? []);

    workerRef.current = await createWorker("eng");
    setWorkerReady(true);
  }

  // ─── Add files to queue ───────────────────────────────────────────────────

  const addFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (!images.length) return;

      const newItems: QueueItem[] = images.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "pending",
        resultCount: 0,
      }));

      setQueue((prev) => [...prev, ...newItems]);
      void runQueue(newItems);
    },
    // swimmers captured via ref below to avoid stale closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workerReady]
  );

  // Keep swimmers in a ref so the queue callback always has fresh data
  const swimmersRef = useRef<Swimmer[]>([]);
  useEffect(() => { swimmersRef.current = swimmers; }, [swimmers]);

  // ─── Sequential queue processor ───────────────────────────────────────────

  async function runQueue(items: QueueItem[]) {
    if (processingRef.current) return;
    processingRef.current = true;

    for (const item of items) {
      // Mark processing
      setQueue((prev) =>
        prev.map((q) => q.id === item.id ? { ...q, status: "processing" } : q)
      );

      try {
        if (!workerRef.current) workerRef.current = await createWorker("eng");

        const { data: { text } } = await workerRef.current.recognize(item.file);
        const results = parseSwimOCRText(text, {});

        const newPending: PendingResult[] = results.map((r, i) => {
          // Primary match: use name extracted by parser
          const match = fuzzyMatchSwimmer(r.name, swimmersRef.current);
          // Fallback: search full OCR text for any swimmer name (handles merged lines)
          const finalMatch = match.swimmer
            ? match
            : findSwimmerInText(text, swimmersRef.current);
          const autoConfirm = finalMatch.confidence >= AUTO_CONF_THRESHOLD;
          return {
            key: `${item.id}-${i}`,
            parsed: r,
            match: finalMatch,
            swimmerId: autoConfirm ? (finalMatch.swimmer?.id ?? null) : null,
            confirmed: autoConfirm,
            saved: false,
            skipped: false,
          };
        });

        setPendingResults((prev) => [...prev, ...newPending]);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "parsed", resultCount: results.length }
              : q
          )
        );
      } catch (err) {
        console.error("OCR error:", err);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error", error: "OCR failed — try a clearer screenshot" } : q
          )
        );
      }
    }

    processingRef.current = false;
  }

  // ─── Drag and drop ────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  // ─── Update a pending result ──────────────────────────────────────────────

  function updatePending(key: string, patch: Partial<PendingResult>) {
    setPendingResults((prev) =>
      prev.map((p) => p.key === key ? { ...p, ...patch } : p)
    );
  }

  // ─── Save all confirmed results ───────────────────────────────────────────

  async function handleSaveAll() {
    setSaving(true);
    let saved = 0;
    let dups = 0;

    const toSave = pendingResults.filter((p) => !p.saved && !p.skipped && p.confirmed && p.swimmerId);

    for (const pr of toSave) {
      const dup = await isDuplicate(pr.swimmerId!, pr.parsed);
      if (dup) {
        dups++;
        updatePending(pr.key, { saved: true });
        continue;
      }

      const { data: timeData, error } = await supabase
        .from("swim_times")
        .insert({
          swimmer_id: pr.swimmerId,
          event: pr.parsed.event,
          course: pr.parsed.course,
          time_ms: pr.parsed.timeMs,
          swam_at: pr.parsed.swamAt ?? null,
          meet_name: pr.parsed.meetName ?? null,
          place: pr.parsed.place ?? null,
        })
        .select("id")
        .single();

      if (!error && timeData && pr.parsed.splits?.length) {
        await supabase.from("swim_splits").insert(
          pr.parsed.splits.map((s) => ({
            swim_time_id: timeData.id,
            label: s.label,
            order: s.order,
            distance: s.distance ?? null,
            split_ms: s.splitMs,
            cumulative_ms: s.cumulativeMs ?? null,
          }))
        );
      }

      if (!error) {
        saved++;
        updatePending(pr.key, { saved: true });
      }
    }

    setSavedCount((c) => c + saved);
    setDupCount((c) => c + dups);
    setSaving(false);
  }

  // ─── Derived state ────────────────────────────────────────────────────────

  const active = pendingResults.filter((p) => !p.saved && !p.skipped);
  const readyToSave = active.filter((p) => p.confirmed && p.swimmerId);
  const needsAttention = active.filter((p) => !p.confirmed || !p.swimmerId);
  const allDone = pendingResults.length > 0 && active.length === 0;
  const isProcessing = queue.some((q) => q.status === "processing" || q.status === "pending");

  // ─── Reset ────────────────────────────────────────────────────────────────

  function handleReset() {
    queue.forEach((q) => URL.revokeObjectURL(q.previewUrl));
    setQueue([]);
    setPendingResults([]);
    setSavedCount(0);
    setDupCount(0);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
            Natrix
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Scan</h1>
        </div>

        {/* Tab toggle */}
        <div
          className="flex rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
        >
          {(["scan", "import"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition"
              style={
                activeTab === tab
                  ? { background: "rgba(217,119,6,0.25)", color: "#FDE68A" }
                  : { color: "rgba(255,255,255,0.4)" }
              }
            >
              {tab === "scan" ? "📷 Scan" : "📥 Import"}
            </button>
          ))}
        </div>

        {/* ── Import tab ─────────────────────────────────────────────────── */}
        {activeTab === "import" ? (
          <SpreadsheetImport />
        ) : (
          <>
            {/* ── Drop zone ───────────────────────────────────────────────── */}
            {!allDone && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => workerReady && fileInputRef.current?.click()}
                className="rounded-3xl transition-all"
                style={{
                  border: dragging
                    ? "2px dashed #FDE68A"
                    : "2px dashed rgba(255,255,255,0.15)",
                  background: dragging
                    ? "rgba(217,119,6,0.08)"
                    : "rgba(255,255,255,0.03)",
                  padding: "36px 24px",
                  textAlign: "center",
                  cursor: workerReady ? "pointer" : "default",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
                />
                {!workerReady ? (
                  <>
                    <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-amber-400/50 border-t-amber-400 animate-spin" />
                    <p className="text-sm text-white/40">Initialising scanner...</p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 36 }}>📷</p>
                    <p className="mt-3 text-base font-semibold text-white">
                      {dragging ? "Drop to scan!" : "Drop screenshots here"}
                    </p>
                    <p className="mt-1 text-xs text-white/40">
                      Tap to pick files · multiple screenshots supported
                    </p>
                    {queue.length > 0 && (
                      <p className="mt-3 text-xs" style={{ color: "#FDE68A" }}>
                        + Add more screenshots
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Queue list ──────────────────────────────────────────────── */}
            {queue.length > 0 && !allDone && (
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
                  Queue · {queue.filter((q) => q.status === "parsed").length}/{queue.length} processed
                </p>

                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {/* Thumbnail */}
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="h-10 w-10 flex-shrink-0 rounded-xl object-cover"
                    />

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{item.file.name}</p>
                      <p
                        className="mt-0.5 text-xs"
                        style={{
                          color:
                            item.status === "error"
                              ? "#FCA5A5"
                              : item.status === "parsed"
                              ? "#6EE7B7"
                              : "#FDE68A",
                        }}
                      >
                        {item.status === "pending"
                          ? "Waiting..."
                          : item.status === "processing"
                          ? "Reading image..."
                          : item.status === "parsed"
                          ? item.resultCount === 0
                            ? "No results found — try a clearer screenshot"
                            : `${item.resultCount} result${item.resultCount === 1 ? "" : "s"} found`
                          : item.error ?? "Error"}
                      </p>
                    </div>

                    {/* Spinner */}
                    {item.status === "processing" && (
                      <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-amber-400/50 border-t-amber-400 animate-spin" />
                    )}
                    {item.status === "parsed" && item.resultCount > 0 && (
                      <span className="text-sm" style={{ color: "#6EE7B7" }}>✓</span>
                    )}
                    {item.status === "error" && (
                      <span className="text-sm" style={{ color: "#FCA5A5" }}>✗</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Pending results — review panel ──────────────────────────── */}
            {active.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
                  Results · {active.length} to review
                  {needsAttention.length > 0 && (
                    <span style={{ color: "#FDE68A" }}> · {needsAttention.length} need attention</span>
                  )}
                </p>

                {active.map((pr) => {
                  const isLow = pr.match.confidence > 0 && pr.match.confidence < LOW_CONF_THRESHOLD;
                  const noMatch = !pr.match.swimmer;

                  return (
                    <div
                      key={pr.key}
                      className="rounded-3xl p-4 space-y-3"
                      style={{
                        background: isLow
                          ? "rgba(217,119,6,0.07)"
                          : "rgba(255,255,255,0.05)",
                        border: isLow
                          ? "1px solid rgba(253,230,138,0.22)"
                          : "1px solid rgba(255,255,255,0.09)",
                      }}
                    >
                      {/* Event + time row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-bold text-white">{pr.parsed.event}</p>
                          <p className="mt-0.5 text-xs text-white/40">
                            {pr.parsed.course}
                            {pr.parsed.meetName ? ` · ${pr.parsed.meetName}` : ""}
                            {pr.parsed.swamAt ? ` · ${pr.parsed.swamAt}` : ""}
                            {pr.parsed.place != null ? ` · 🏁 Place ${pr.parsed.place}` : ""}
                          </p>
                          {pr.parsed.splits && pr.parsed.splits.length > 0 && (
                            <p className="mt-1 text-xs text-white/30">
                              {pr.parsed.splits.length} splits included
                            </p>
                          )}
                        </div>
                        <p className="text-xl font-bold flex-shrink-0" style={{ color: "#FDE68A" }}>
                          {msToTime(pr.parsed.timeMs)}
                        </p>
                      </div>

                      {/* Swimmer assignment */}
                      {noMatch ? (
                        /* No match at all — must pick manually */
                        <div
                          className="rounded-2xl px-3 py-3 space-y-2"
                          style={{
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.2)",
                          }}
                        >
                          <p className="text-xs font-medium" style={{ color: "#FCA5A5" }}>
                            ⚠️ Couldn&apos;t match swimmer
                            {pr.parsed.name ? ` — OCR read "${pr.parsed.name}"` : ""}
                          </p>
                          <select
                            className="input text-sm"
                            value={pr.swimmerId ?? (swimmers.length === 1 ? swimmers[0].id : "")}
                            onChange={(e) => {
                              const id = Number(e.target.value) || null;
                              updatePending(pr.key, { swimmerId: id, confirmed: false });
                            }}
                          >
                            <option value="">Assign to swimmer...</option>
                            {swimmers.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          {(pr.swimmerId || swimmers.length === 1) && (
                            <button
                              type="button"
                              onClick={() => {
                                const id = pr.swimmerId ?? swimmers[0]?.id ?? null;
                                updatePending(pr.key, { swimmerId: id, confirmed: true });
                              }}
                              className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition"
                              style={{ background: "#D97706" }}
                            >
                              Yes, save to{" "}
                              {swimmers.find((s) => s.id === (pr.swimmerId ?? swimmers[0]?.id))?.name}
                            </button>
                          )}
                        </div>
                      ) : isLow ? (
                        /* Low confidence — warn and require explicit confirmation */
                        <div
                          className="rounded-2xl px-3 py-3 space-y-2"
                          style={{
                            background: "rgba(217,119,6,0.10)",
                            border: "1px solid rgba(253,230,138,0.22)",
                          }}
                        >
                          <p className="text-xs font-medium" style={{ color: "#FDE68A" }}>
                            ⚠️ OCR read &ldquo;{pr.parsed.name}&rdquo; — best match is{" "}
                            <span className="text-white">{pr.match.swimmer?.name}</span>
                          </p>
                          <p className="text-xs text-white/40">Low confidence · confirm or pick another swimmer</p>
                          <select
                            className="input text-sm"
                            value={pr.swimmerId ?? pr.match.swimmer?.id ?? ""}
                            onChange={(e) => {
                              const id = Number(e.target.value) || null;
                              updatePending(pr.key, { swimmerId: id, confirmed: !!id });
                            }}
                          >
                            <option value="">Pick swimmer...</option>
                            {swimmers.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          {pr.swimmerId && (
                            <button
                              type="button"
                              onClick={() => updatePending(pr.key, { confirmed: true })}
                              className="w-full rounded-xl py-2 text-xs font-bold text-white transition"
                              style={{ background: "#D97706" }}
                            >
                              Yes, save to {swimmers.find((s) => s.id === pr.swimmerId)?.name}
                            </button>
                          )}
                        </div>
                      ) : (
                        /* High confidence — auto-confirmed, show as confirmed */
                        <div
                          className="flex items-center gap-2 rounded-2xl px-3 py-2"
                          style={{
                            background: "rgba(110,231,183,0.07)",
                            border: "1px solid rgba(110,231,183,0.18)",
                          }}
                        >
                          <span style={{ color: "#6EE7B7", fontSize: 14 }}>✓</span>
                          <p className="text-xs text-white/70">
                            Matched to{" "}
                            <span className="font-semibold text-white">{pr.match.swimmer?.name}</span>
                          </p>
                          <button
                            type="button"
                            className="ml-auto text-xs text-white/25 hover:text-white/50 transition"
                            onClick={() => {
                              // Let them change their mind
                              updatePending(pr.key, { confirmed: false, swimmerId: null });
                            }}
                          >
                            Change
                          </button>
                        </div>
                      )}

                      {/* Skip link */}
                      <button
                        type="button"
                        className="text-xs text-white/25 hover:text-white/40 transition"
                        onClick={() => updatePending(pr.key, { skipped: true })}
                      >
                        Skip this result
                      </button>
                    </div>
                  );
                })}

                {/* Save bar */}
                <div
                  className="rounded-3xl p-4 space-y-3"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {needsAttention.length > 0 && (
                    <p className="text-xs text-white/40 text-center">
                      {needsAttention.length} result{needsAttention.length === 1 ? "" : "s"} still need a swimmer assigned
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving || readyToSave.length === 0}
                    className="w-full rounded-2xl py-4 text-base font-bold text-white transition disabled:opacity-40"
                    style={{ background: "#D97706" }}
                  >
                    {saving
                      ? "Saving..."
                      : `Save ${readyToSave.length} result${readyToSave.length === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            )}

            {/* ── All done state ──────────────────────────────────────────── */}
            {allDone && (
              <div
                className="rounded-3xl p-6 text-center space-y-2"
                style={{
                  background: "rgba(110,231,183,0.07)",
                  border: "1px solid rgba(110,231,183,0.2)",
                }}
              >
                <p style={{ fontSize: 36 }}>🎉</p>
                <p className="text-lg font-bold text-white">
                  {savedCount > 0
                    ? `${savedCount} result${savedCount === 1 ? "" : "s"} saved!`
                    : "Done!"}
                </p>
                {dupCount > 0 && (
                  <p className="text-xs text-white/40">
                    {dupCount} duplicate{dupCount === 1 ? "" : "s"} skipped — already in your history
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold text-white transition"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  Scan more screenshots
                </button>
              </div>
            )}

            {/* ── Empty state / how it works ──────────────────────────────── */}
            {queue.length === 0 && (
              <div
                className="rounded-3xl p-5 space-y-3"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <p className="text-[10px] font-medium uppercase tracking-widest text-white/25 mb-1">
                  How it works
                </p>
                {[
                  { icon: "📱", text: "Screenshot your swimmer's result from Meet Mobile" },
                  { icon: "📷", text: "Drop or pick the image — scan multiple at once" },
                  { icon: "⚡", text: "Natrix reads the event, time and date automatically" },
                  { icon: "✓",  text: "Confirm the swimmer and tap Save" },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                    <p className="text-sm text-white/45 leading-snug">{item.text}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}