import { NextRequest, NextResponse } from "next/server";

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

// ─── PDF text extraction (server-side, no worker needed) ──────────────────────

async function extractText(buffer: ArrayBuffer): Promise<string> {
  // pdfjs-dist legacy build runs fine in Node without a worker
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjsLib.getDocument({
    data: buffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str ?? "")
      .join(" ")
      .replace(/\s{2,}/g, "\n");
    fullText += pageText + "\n";
  }
  return fullText;
}

// ─── Parser (same logic as before) ─────────────────────────────────────────────

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

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!swimmerNamesRaw) {
      return NextResponse.json({ error: "No swimmer names provided" }, { status: 400 });
    }

    const swimmerNames: string[] = JSON.parse(swimmerNamesRaw);
    const buffer = await file.arrayBuffer();

    const text = await extractText(buffer);
    const parsed = parsePDF(text, swimmerNames);

    return NextResponse.json({ events: parsed });
  } catch (err) {
    console.error("PDF parse error:", err);
    const message = err instanceof Error ? err.message : "Failed to parse PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}