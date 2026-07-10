import { NextRequest, NextResponse } from "next/server";
import { getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── PDF text extraction ─────────────────────────────────────────────────────
// Reconstructs row breaks by inserting a newline wherever there's a large gap
// between text chunks (column boundaries) — unpdf's simple extractText() merges
// everything into one blob, which breaks our row-based parser.

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    type Item = { str: string; x: number; y: number };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: Item[] = (content.items as any[])
      .filter((it) => "str" in it && it.str.trim() !== "")
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));

    // Group into rows by y-coordinate (same row = same vertical position on page)
    const Y_TOLERANCE = 2;
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: Item[][] = [];
    for (const item of sorted) {
      const row = rows.find((r) => Math.abs(r[0].y - item.y) <= Y_TOLERANCE);
      if (row) row.push(item);
      else rows.push([item]);
    }

    // Sort each row left-to-right, then join into one line
    const pageLines = rows.map((row) =>
      row.sort((a, b) => a.x - b.x).map((it) => it.str).join(" ")
    );

    fullText += pageLines.join("\n") + "\n";
  }

  return fullText;
}

// ─── Parser ─────────────────────────────────────────────────────────────────────

function parsePDF(text: string, swimmerNames: string[]): ParsedEvent[] {
  const results: ParsedEvent[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentEvent = { number: 0, name: "", distance: 0, stroke: "" };
  let currentHeat = 0;
  let currentStartTime: string | null = null;

  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, "").trim();

  const swimmerNormed = swimmerNames.map((n) => ({
    original: n,
    parts: normalise(n).split(/\s+/),
  }));

  function matchSwimmer(lineName: string): string | null {
    const normedLine = normalise(lineName);
    const partsLine = normedLine.split(/\s+/);
    for (const sw of swimmerNormed) {
      const allMatch = sw.parts.every((p) => partsLine.includes(p));
      if (allMatch) return sw.original;
    }
    return null;
  }

  const eventRe = /^Event\s+(\d+)\s+.+?(\d+)\s+LC\s+Meter\s+(.+)$/i;
  const heatStartRe = /^Heat\s+(\d+)\s+of\s+\d+.*?Starts at\s+(\d+:\d+\s+[AP]M)/i;
  const heatRe = /^Heat\s+(\d+)/i;
  const laneRe = /^(\d)\s+(.+?)\s+\d+\s+[A-Z0-9\-]+\s+([\d:]+\.?\d*|NT)\s*$/;

  for (const line of lines) {
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

    const heatStartMatch = line.match(heatStartRe);
    if (heatStartMatch) {
      currentHeat = parseInt(heatStartMatch[1]);
      currentStartTime = heatStartMatch[2];
      continue;
    }

    const heatMatch = line.match(heatRe);
    if (heatMatch && !heatStartMatch) {
      currentHeat = parseInt(heatMatch[1]);
      continue;
    }

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

// ─── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const swimmerNamesRaw = formData.get("swimmerNames") as string | null;
    const debug = formData.get("debug") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!swimmerNamesRaw) {
      return NextResponse.json({ error: "No swimmer names provided" }, { status: 400 });
    }

    const swimmerNames: string[] = JSON.parse(swimmerNamesRaw);
    const debugSearch = (formData.get("debugSearch") as string | null) ?? "";
    const buffer = await file.arrayBuffer();

    const text = await extractTextFromPdf(buffer);
    const parsed = parsePDF(text, swimmerNames);

    if (debug) {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      let windowLines = lines.slice(0, 80);

      if (debugSearch.trim()) {
        const idx = lines.findIndex((l) => l.toLowerCase().includes(debugSearch.trim().toLowerCase()));
        if (idx !== -1) {
          const start = Math.max(0, idx - 15);
          const end = Math.min(lines.length, idx + 25);
          windowLines = lines.slice(start, end).map((l, i) => `[${start + i}] ${l}`);
        } else {
          windowLines = [`No line found containing "${debugSearch}"`];
        }
      } else {
        windowLines = windowLines.map((l, i) => `[${i}] ${l}`);
      }

      return NextResponse.json({
        events: parsed,
        debug: {
          swimmerNames,
          totalLines: lines.length,
          rawTextSample: text.slice(0, 3000),
          first80Lines: windowLines,
        },
      });
    }

    return NextResponse.json({ events: parsed });
  } catch (err) {
    console.error("PDF parse error:", err);
    const message = err instanceof Error ? err.message : "Failed to parse PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}