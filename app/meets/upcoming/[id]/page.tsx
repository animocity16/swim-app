"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { createWorker } from "tesseract.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type UpcomingMeet = {
  id: string;
  name: string;
  location: string | null;
  meet_type: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

type MeetEvent = {
  id: string;
  meet_id: string;
  swimmer_name: string;
  event_number: number;
  event_name: string;
  distance: number;
  stroke: string;
  heat: number;
  lane: number;
  seed_time: string | null;
  start_time: string | null;
  warmup_time: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string | null): string {
  const s = new Date(start);
  if (isNaN(s.getTime())) return "";
  const startStr = s.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (!end) return startStr + " " + s.getFullYear();
  const e = new Date(end);
  if (isNaN(e.getTime())) return startStr + " " + s.getFullYear();
  return `${startStr} – ${e.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

// ─── PDF Parser ───────────────────────────────────────────────────────────────

type ParsedEvent = {
  eventNumber: number;
  eventName: string;
  distance: number;
  stroke: string;
  heat: number;
  lane: number;
  seedTime: string | null;
  startTime: string | null;
  swimmerName: string;
};

function parsePDF(text: string, swimmerNames: string[]): ParsedEvent[] {
  const results: ParsedEvent[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentEvent = { number: 0, name: "", distance: 0, stroke: "" };
  let currentHeat = 0;
  let currentStartTime: string | null = null;

  // Normalise swimmer names for fuzzy matching
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s]/g, "").trim();

  const swimmerNormed = swimmerNames.map((n) => ({
    original: n,
    normed: normalise(n),
    parts: normalise(n).split(/\s+/),
  }));

  function matchSwimmer(lineName: string): string | null {
    // PDF format: "Loh, Mikaela" → try reversed + normal
    const normedLine = normalise(lineName);
    const partsLine = normedLine.split(/\s+/);

    for (const sw of swimmerNormed) {
      // All parts of swimmer name appear in line
      const allMatch = sw.parts.every((p) => partsLine.includes(p));
      if (allMatch) return sw.original;
    }
    return null;
  }

  // Event header pattern: "Event 501 Boys 7-12 50 LC Meter Backstroke"
  const eventRe = /^Event\s+(\d+)\s+.+?(\d+)\s+LC\s+Meter\s+(.+)$/i;
  // Heat header: "Heat 1 of 23 Finals Starts at 09:00 AM"
  const heatStartRe = /^Heat\s+(\d+)\s+of\s+\d+.*?Starts at\s+(\d+:\d+\s+[AP]M)/i;
  const heatRe = /^Heat\s+(\d+)/i;
  // Lane row: "4 Taguchi, Maxwell Shouki 12 SSC 34.31"
  const laneRe = /^(\d)\s+(.+?)\s+\d+\s+[A-Z0-9\-]+\s+([\d:]+\.?\d*|NT)\s*$/;

  for (const line of lines) {
    // Event header
    const evMatch = line.match(eventRe);
    if (evMatch) {
      const distance = parseInt(evMatch[2]);
      const strokeRaw = evMatch[3].trim();
      currentEvent = {
        number: parseInt(evMatch[1]),
        name: `${distance}m ${strokeRaw}`,
        distance,
        stroke: strokeRaw,
      };
      currentHeat = 0;
      currentStartTime = null;
      continue;
    }

    // Heat with start time
    const heatStartMatch = line.match(heatStartRe);
    if (heatStartMatch) {
      currentHeat = parseInt(heatStartMatch[1]);
      currentStartTime = heatStartMatch[2];
      continue;
    }

    // Heat without start time
    const heatMatch = line.match(heatRe);
    if (heatMatch && !heatStartMatch) {
      currentHeat = parseInt(heatMatch[1]);
      continue;
    }

    // Lane row — check if any swimmer matches
    if (currentEvent.number > 0 && currentHeat > 0) {
      const laneMatch = line.match(laneRe);
      if (laneMatch) {
        const lane = parseInt(laneMatch[1]);
        const namePart = laneMatch[2];
        const seedRaw = laneMatch[3];
        const matched = matchSwimmer(namePart);
        if (matched) {
          results.push({
            eventNumber: currentEvent.number,
            eventName: currentEvent.name,
            distance: currentEvent.distance,
            stroke: currentEvent.stroke,
            heat: currentHeat,
            lane,
            seedTime: seedRaw === "NT" ? null : seedRaw,
            startTime: currentStartTime,
            swimmerName: matched,
          });
        }
      }
    }
  }

  return results;
}

// ─── PDF text-layer extraction (fast path, runs in the browser) ─────────────
// Some start lists export with a real, selectable text layer, in which case
// we can read it directly - instant and free, no OCR needed.
//
// HY-TEK Meet Manager start lists are often printed in TWO newspaper-style
// columns per page (left column top-to-bottom, then right column top-to-bottom)
// to save paper. If we naively group text into rows purely by y-coordinate,
// a left-column row and a right-column row that happen to sit at the same
// page height get sorted left-to-right and glued into ONE line - silently
// merging two unrelated heats and scrambling the event/heat state our line
// parser relies on.
//
// Fix: detect the column gap on each page, split items into left/right
// columns BEFORE row-grouping, and process each column as its own top-to-
// bottom line stream - matching the actual human reading order of the page.

async function getPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  // Load the worker file straight out of the installed pdfjs-dist package
  // instead of fetching it from an external CDN at runtime. This guarantees
  // the worker always matches the exact version bundled with the app (no
  // version-mismatch or CORS/network surprises in production), and is the
  // pattern pdfjs-dist itself recommends for bundlers like Next.js.
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  return pdfjsLib;
}

async function extractTextFromTextLayer(file: File): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    type Item = { str: string; x: number; y: number };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: Item[] = (content.items as any[])
      .filter((it) => "str" in it && it.str.trim() !== "")
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));

    if (items.length === 0) continue;

    const xs = [...new Set(items.map((it) => it.x))].sort((a, b) => a - b);
    let splitX: number | null = null;
    if (xs.length > 1) {
      const pageWidth = xs[xs.length - 1] - xs[0];
      let maxGap = 0;
      let gapMid = 0;
      for (let j = 1; j < xs.length; j++) {
        const gap = xs[j] - xs[j - 1];
        const mid = xs[j - 1] + gap / 2;
        const relPos = pageWidth > 0 ? (mid - xs[0]) / pageWidth : 0;
        if (gap > maxGap && relPos > 0.35 && relPos < 0.65) {
          maxGap = gap;
          gapMid = mid;
        }
      }
      if (maxGap > 40) {
        splitX = gapMid;
      }
    }

    const columns: Item[][] =
      splitX === null
        ? [items]
        : [
            items.filter((it) => it.x < (splitX as number)),
            items.filter((it) => it.x >= (splitX as number)),
          ];

    const pageLines: string[] = [];
    const Y_TOLERANCE = 2;

    for (const colItems of columns) {
      if (colItems.length === 0) continue;
      const sorted = [...colItems].sort((a, b) => b.y - a.y || a.x - b.x);
      const rows: Item[][] = [];
      for (const item of sorted) {
        const row = rows.find((r) => Math.abs(r[0].y - item.y) <= Y_TOLERANCE);
        if (row) row.push(item);
        else rows.push([item]);
      }
      const colLines = rows.map((row) =>
        row.sort((a, b) => a.x - b.x).map((it) => it.str).join(" ")
      );
      pageLines.push(...colLines);
    }

    fullText += pageLines.join("\n") + "\n";
  }

  return fullText;
}

// ─── OCR fallback (scanned / image-only PDFs) ────────────────────────────────
// Some start lists have NO real text layer at all - the whole results table
// is a single full-page image per page, with only a tiny caption as actual
// text. Text extraction has nothing real to return in that case, so we
// render each page to a canvas and run OCR on it instead, splitting into
// left/right halves first to preserve the same two-column reading order as
// the text-layer path above. This all runs in the browser - no server
// timeout risk, just a wait while your phone/laptop does the work.

// Canvas → Blob, wrapped as a Promise. Tesseract's worker runs in a separate
// thread and talks to the page via postMessage, which can carry a Blob but
// can't carry a live <canvas> element - handing it a raw canvas is what was
// throwing "undefined is not a function" on iOS Safari.
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not convert page image to a blob for OCR."));
    }, "image/png");
  });
}

async function extractTextViaOcr(
  file: File,
  onProgress?: (message: string) => void
): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const worker = await createWorker("eng", 1, {
    logger: (m: any) => {
      if (m.status === "recognizing text") {
        onProgress?.(`Reading text (${Math.round(m.progress * 100)}%)...`);
      }
    },
  });
  await (worker as any).setParameters({ tessedit_pageseg_mode: "6" });

  let fullText = "";
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(`Reading page ${i} of ${pdf.numPages} (this can take a bit)...`);

      const page = await pdf.getPage(i);
      const scale = 3; // higher scale = sharper text = better OCR accuracy
      const viewport = page.getViewport({ scale });

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = viewport.width;
      pageCanvas.height = viewport.height;
      const pageCtx = pageCanvas.getContext("2d")!;
      await page.render({ canvasContext: pageCtx, viewport, canvas: pageCanvas }).promise;

      const halfWidth = Math.floor(pageCanvas.width / 2);
      const halves: [number, number][] = [
        [0, halfWidth],
        [halfWidth, pageCanvas.width - halfWidth],
      ];

      for (const [startX, w] of halves) {
        const colCanvas = document.createElement("canvas");
        colCanvas.width = w;
        colCanvas.height = pageCanvas.height;
        const colCtx = colCanvas.getContext("2d")!;
        colCtx.drawImage(pageCanvas, startX, 0, w, pageCanvas.height, 0, 0, w, pageCanvas.height);

        const blob = await canvasToBlob(colCanvas);
        const { data: ocrData } = await worker.recognize(blob);
        fullText += ocrData.text + "\n";
      }
    }
  } finally {
    await worker.terminate();
  }

  return fullText;
}

async function extractStartListText(
  file: File,
  onProgress?: (message: string) => void
): Promise<{ text: string; usedOcr: boolean }> {
  onProgress?.("Reading PDF text...");

  // The text-layer attempt is wrapped so that ANY failure here (not just
  // "no text found") falls through to OCR rather than failing the whole
  // upload - text-layer reading is a nice-to-have fast path, OCR is the
  // path that actually has to work for image-only PDFs like this one.
  let textLayerResult = "";
  try {
    textLayerResult = await extractTextFromTextLayer(file);
  } catch (err) {
    console.error("Text-layer extraction failed, falling back to OCR:", err);
  }

  // Heuristic: a real text layer for a start list should contain at least
  // one "Event ..." header. If it doesn't, there's no usable text layer -
  // the PDF is image-only - so fall back to OCR.
  const looksLikeRealTextLayer = /Event\s+\d+/i.test(textLayerResult);
  if (looksLikeRealTextLayer) {
    return { text: textLayerResult, usedOcr: false };
  }

  onProgress?.("No readable text found - running OCR instead...");
  const ocrResult = await extractTextViaOcr(file, onProgress);
  return { text: ocrResult, usedOcr: true };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      height: "72px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "16px",
      animation: "pulse 2s ease-in-out infinite",
    }} />
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event,
  onWarmupSaved,
}: {
  event: MeetEvent;
  onWarmupSaved: (eventId: string, value: string | null) => void;
}) {
  const [warmup, setWarmup] = useState(event.warmup_time ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = warmup.trim();
    if (trimmed === (event.warmup_time ?? "")) return;
    setSaving(true);
    const { error } = await supabase
      .from("meet_events")
      .update({ warmup_time: trimmed || null })
      .eq("id", event.id);
    setSaving(false);
    if (!error) onWarmupSaved(event.id, trimmed || null);
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "16px",
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
            {event.event_name}
          </p>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
            Event {event.event_number} · Heat {event.heat} · Lane {event.lane}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {event.seed_time && (
            <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
              {event.seed_time}
            </p>
          )}
          {event.start_time && (
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>
              ~{event.start_time}
            </p>
          )}
        </div>
      </div>

      <div style={{
        marginTop: "10px",
        paddingTop: "10px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}>
        <span style={{
          fontSize: "10px", color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase", letterSpacing: "0.06em",
          flexShrink: 0,
        }}>
          Warm up
        </span>
        <input
          type="text"
          placeholder="e.g. 8:15 AM"
          value={warmup}
          onChange={(e) => setWarmup(e.target.value)}
          onBlur={save}
          style={{
            flex: 1, background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px",
            padding: "6px 10px", color: "#fff", fontSize: "12px",
            outline: "none", boxSizing: "border-box", minWidth: 0,
          }}
        />
        {saving && (
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
            Saving…
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Swimmer group (collapsible) ───────────────────────────────────────────────

function SwimmerGroup({
  name,
  events,
  defaultOpen,
  onWarmupSaved,
}: {
  name: string;
  events: MeetEvent[];
  defaultOpen: boolean;
  onWarmupSaved: (eventId: string, value: string | null) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "14px",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{name}</span>
          <span style={{
            fontSize: "10px", fontWeight: 700, color: "rgba(100,180,255,0.8)",
            background: "rgba(100,180,255,0.12)", borderRadius: "20px", padding: "2px 8px",
          }}>
            {events.length}
          </span>
        </span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <path d="M4 6L8 10L12 6" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px", paddingLeft: "4px" }}>
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} onWarmupSaved={onWarmupSaved} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Swimmer picker (collapsible) ──────────────────────────────────────────────

function SwimmerPicker({
  swimmerGroups,
  selectedSwimmers,
  onToggle,
  onBulkToggle,
}: {
  swimmerGroups: { name: string; group_type: string | null }[];
  selectedSwimmers: string[];
  onToggle: (name: string) => void;
  onBulkToggle: (group: string[], select: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const primary = swimmerGroups.filter((s) => s.group_type === "primary").map((s) => s.name);
  const following = swimmerGroups.filter((s) => s.group_type !== "primary").map((s) => s.name);

  const Pill = ({ name }: { name: string }) => {
    const active = selectedSwimmers.includes(name);
    return (
      <button
        type="button"
        onClick={() => onToggle(name)}
        style={{
          padding: "7px 14px",
          borderRadius: "20px",
          border: `1px solid ${active ? "rgba(100,180,255,0.4)" : "rgba(255,255,255,0.12)"}`,
          background: active ? "rgba(100,180,255,0.15)" : "rgba(255,255,255,0.04)",
          color: active ? "rgba(150,200,255,0.95)" : "rgba(255,255,255,0.4)",
          fontSize: "12px",
          fontWeight: active ? 600 : 400,
          cursor: "pointer",
        }}
      >
        {active ? "✓ " : ""}{name}
      </button>
    );
  };

  const GroupHeader = ({ label, group }: { label: string; group: string[] }) => {
    const allSelected = group.every((n) => selectedSwimmers.includes(n));
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </p>
        <button
          type="button"
          onClick={() => onBulkToggle(group, !allSelected)}
          style={{ fontSize: "11px", color: "rgba(100,180,255,0.8)", background: "none", border: "none", cursor: "pointer" }}
        >
          {allSelected ? "Clear" : "Select all"}
        </button>
      </div>
    );
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "14px",
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", background: "none", border: "none", cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", flexShrink: 0 }}>Swimmers</span>
          <span style={{
            fontSize: "12px", color: "rgba(255,255,255,0.4)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {selectedSwimmers.length === 0
              ? "None selected"
              : selectedSwimmers.length <= 2
                ? selectedSwimmers.join(", ")
                : `${selectedSwimmers[0]} +${selectedSwimmers.length - 1} more`}
          </span>
        </span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}
        >
          <path d="M4 6L8 10L12 6" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {primary.length > 0 && (
            <div>
              <GroupHeader label="My Swimmers" group={primary} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {primary.map((name) => <Pill key={name} name={name} />)}
              </div>
            </div>
          )}
          {following.length > 0 && (
            <div>
              <GroupHeader label="Following" group={following} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {following.map((name) => <Pill key={name} name={name} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UpcomingMeetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const meetId = params.id as string;

  const [meet, setMeet] = useState<UpcomingMeet | null>(null);
  const [events, setEvents] = useState<MeetEvent[]>([]);
  const [swimmerNames, setSwimmerNames] = useState<string[]>([]);
  const [swimmerGroups, setSwimmerGroups] = useState<{ name: string; group_type: string | null }[]>([]);
  const [selectedSwimmers, setSelectedSwimmers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<{ swimmerNames: string[]; totalLines: number; rawTextSample: string; first80Lines: string[] } | null>(null);
  const [debugSearchTerm, setDebugSearchTerm] = useState("");
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    // Load meet
    const { data: meetData } = await supabase
      .from("upcoming_meets")
      .select("*")
      .eq("id", meetId)
      .single();

    if (!meetData) { router.replace("/meets"); return; }
    setMeet(meetData as UpcomingMeet);

    // Load this user's swimmers
    const { data: swimmers } = await supabase
      .from("swimmers")
      .select("name, group_type")
      .eq("user_id", session.user.id);
    const swimmerList = (swimmers ?? []) as { name: string; group_type: string | null }[];
    const names = swimmerList.map((s) => s.name);
    setSwimmerNames(names);
    setSwimmerGroups(swimmerList);
    // Default: only "primary" (My Swimmers) selected, not the whole Following list
    const primaryNames = swimmerList.filter((s) => s.group_type === "primary").map((s) => s.name);
    setSelectedSwimmers(primaryNames.length > 0 ? primaryNames : names);

    // Load saved events for this meet
    const { data: eventsData } = await supabase
      .from("meet_events")
      .select("*")
      .eq("meet_id", meetId)
      .order("event_number", { ascending: true });

    setEvents((eventsData ?? []) as MeetEvent[]);
    setLoading(false);
  }, [meetId, router]);

  useEffect(() => { void load(); }, [load]);

  function toggleSwimmer(name: string) {
    setSelectedSwimmers((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function bulkToggleSwimmers(group: string[], select: boolean) {
    setSelectedSwimmers((prev) =>
      select
        ? Array.from(new Set([...prev, ...group]))
        : prev.filter((n) => !group.includes(n))
    );
  }

  function handleWarmupSaved(eventId: string, value: string | null) {
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, warmup_time: value } : e))
    );
  }

  function buildDebugInfo(text: string) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    let windowLines = lines.slice(0, 80);

    if (debugSearchTerm.trim()) {
      const idx = lines.findIndex((l) => l.toLowerCase().includes(debugSearchTerm.trim().toLowerCase()));
      if (idx !== -1) {
        const start = Math.max(0, idx - 15);
        const end = Math.min(lines.length, idx + 25);
        windowLines = lines.slice(start, end).map((l, i) => `[${start + i}] ${l}`);
      } else {
        windowLines = [`No line found containing "${debugSearchTerm}"`];
      }
    } else {
      windowLines = windowLines.map((l, i) => `[${i}] ${l}`);
    }

    return {
      swimmerNames: selectedSwimmers,
      totalLines: lines.length,
      rawTextSample: text.slice(0, 3000),
      first80Lines: windowLines,
    };
  }

  async function runDebugSearch() {
    if (!lastFile) return;
    const { text } = await extractStartListText(lastFile);
    setDebugData(buildDebugInfo(text));
  }

  async function handlePDFUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith(".pdf")) return;

    if (selectedSwimmers.length === 0) {
      setUploadError("Select at least one swimmer to match events for.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadStatus(null);
    setLastFile(file);

    try {
      // Runs entirely in the browser — text extraction first, and OCR (also
      // in-browser) only if the PDF turns out to have no real text layer.
      // Nothing is uploaded to a server for this step.
      const { text } = await extractStartListText(file, (msg) => setUploadStatus(msg));

      setDebugData(buildDebugInfo(text));

      const parsed: ParsedEvent[] = parsePDF(text, selectedSwimmers);

      if (parsed.length === 0) {
        setUploadError("No matching swimmers found in this PDF. Check the start list is for the right session.");
        setUploading(false);
        setUploadStatus(null);
        return;
      }

      // Upsert events — accumulates across multiple PDF uploads (different
      // days/sessions) instead of wiping previously imported events. Re-uploading
      // the same session's PDF just refreshes those specific events.
      // Note: warmup_time is deliberately NOT included here — it's a manually
      // entered field, and re-uploading a PDF must never wipe it out.
      const rows = parsed.map((ev) => ({
        meet_id: meetId,
        swimmer_name: ev.swimmerName,
        event_number: ev.eventNumber,
        event_name: ev.eventName,
        distance: ev.distance,
        stroke: ev.stroke,
        heat: ev.heat,
        lane: ev.lane,
        seed_time: ev.seedTime,
        start_time: ev.startTime,
      }));

      const { error } = await supabase
        .from("meet_events")
        .upsert(rows, { onConflict: "meet_id,swimmer_name,event_number" });
      if (error) throw new Error(error.message);

      await load();
    } catch (err) {
      // Full message + stack, not just Safari's truncated one-liner - this
      // is the only console you get on a phone with no Mac to plug into.
      const detail =
        err instanceof Error
          ? `${err.message}${err.stack ? "\n\n" + err.stack : ""}`
          : String(err);
      setUploadError(detail);
    }

    setUploading(false);
    setUploadStatus(null);
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="shell">
        <div className="container-app space-y-4 pt-4">
          <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }

  if (!meet) return null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="shell">
      <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      <div className="container-app space-y-4">

        {/* Back + Header */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(100,180,255,0.8)", fontSize: "13px", padding: "0 0 8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L6 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Meets
          </button>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
            {meet.name}
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
            {[formatDateRange(meet.start_date, meet.end_date), meet.location].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Swimmer picker — collapsed by default to keep the page short */}
        {swimmerNames.length > 0 && (
          <SwimmerPicker
            swimmerGroups={swimmerGroups}
            selectedSwimmers={selectedSwimmers}
            onToggle={toggleSwimmer}
            onBulkToggle={bulkToggleSwimmers}
          />
        )}

        {/* PDF Upload */}
        <div>
          <label
            htmlFor="pdf-upload"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: "8px",
              background: events.length > 0 ? "rgba(255,255,255,0.03)" : "rgba(100,180,255,0.07)",
              border: `1px dashed ${events.length > 0 ? "rgba(255,255,255,0.1)" : "rgba(100,180,255,0.3)"}`,
              borderRadius: "16px", padding: "20px 16px",
              cursor: uploading ? "not-allowed" : "pointer",
              textAlign: "center",
            }}
          >
            {uploading ? (
              <>
                <div style={{ fontSize: "24px" }}>⏳</div>
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
                  {uploadStatus ?? "Reading PDF..."}
                </p>
              </>
            ) : events.length > 0 ? (
              <>
                <div style={{ fontSize: "20px" }}>📄</div>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                  Re-upload start list PDF
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: "28px" }}>📋</div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "rgba(100,180,255,0.9)" }}>
                  Import start list PDF
                </p>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
                  Tap to upload your session start list
                </p>
              </>
            )}
          </label>
          <input
            id="pdf-upload"
            type="file"
            accept=".pdf"
            onChange={handlePDFUpload}
            disabled={uploading}
            style={{ display: "none" }}
          />
          {uploadError && (
            <pre style={{
              fontSize: "11px", color: "#f87171", marginTop: "8px", textAlign: "left",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: "10px", padding: "10px", maxHeight: "200px", overflowY: "auto",
              fontFamily: "monospace",
            }}>
              {uploadError}
            </pre>
          )}
        </div>

        {debugData && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "16px",
            padding: "14px",
            fontFamily: "monospace",
            fontSize: "10px",
            color: "rgba(255,255,255,0.6)",
            whiteSpace: "pre-wrap",
            maxHeight: "400px",
            overflowY: "auto",
          }}>
            <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
              <input
                type="text"
                placeholder="Search e.g. Mikaela or BREAK"
                value={debugSearchTerm}
                onChange={(e) => setDebugSearchTerm(e.target.value)}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "8px", padding: "6px 10px", color: "#fff", fontSize: "11px", outline: "none",
                }}
              />
              <button
                type="button"
                onClick={runDebugSearch}
                style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: "rgba(100,180,255,0.25)", color: "#fff", fontSize: "11px", cursor: "pointer" }}
              >
                Find
              </button>
            </div>
            <p style={{ color: "#FDE68A", fontWeight: 700, marginBottom: "6px" }}>
              DEBUG — swimmer names in DB: {JSON.stringify(debugData.swimmerNames)}
            </p>
            <p style={{ color: "#FDE68A", fontWeight: 700, marginBottom: "6px" }}>
              Total lines extracted: {debugData.totalLines}
            </p>
            <p style={{ color: "#93C5FD", fontWeight: 700, marginTop: "10px", marginBottom: "6px" }}>
              First 80 lines:
            </p>
            {debugData.first80Lines.map((line, i) => (
              <div key={i}>{i}: {line}</div>
            ))}
          </div>
        )}

        {/* Events list */}
        {events.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {events.length} event{events.length !== 1 ? "s" : ""} across {new Set(events.map((e) => e.swimmer_name)).size} swimmer{new Set(events.map((e) => e.swimmer_name)).size !== 1 ? "s" : ""}
            </p>
            {(() => {
              const grouped = new Map<string, MeetEvent[]>();
              for (const ev of events) {
                const key = ev.swimmer_name || "Unknown";
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(ev);
              }
              const names = Array.from(grouped.keys()).sort();
              return names.map((name, i) => (
                <SwimmerGroup
                  key={name}
                  name={name}
                  events={grouped.get(name)!}
                  defaultOpen={names.length === 1 || i === 0}
                  onWarmupSaved={handleWarmupSaved}
                />
              ));
            })()}
          </div>
        ) : (
          !uploading && (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px", padding: "24px",
              textAlign: "center",
            }}>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.2)" }}>
                Events will appear here after PDF import
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
