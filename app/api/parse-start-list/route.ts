import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ─── TEMPORARILY DISABLED ────────────────────────────────────────────────────
// This route's PDF text extraction (pdf-parse + canvas) is blocking production
// builds — `canvas` isn't installed (it needs native system libraries that are
// painful to get working on Vercel) and the pdf-parse internal-file import was
// relying on an unpinned transitive dependency.
//
// The parsing logic below (parsePDF) is untouched and ready to go — it just
// needs a working PDF-text-extraction function wired back in. You already have
// `unpdf` installed, which is built for serverless environments and doesn't
// need `canvas` at all — that's likely the cleaner path forward here rather
// than re-fighting pdf-parse + canvas. Something like:
//
//   import { extractText } from "unpdf";
//   async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
//     const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
//     return text;
//   }
//
// Swap that in for the removed extractText() below, delete this block comment,
// and this route is back in business.

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

// ─── Parser (unchanged — still ready to use once extraction is wired back in) ──

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
  // Reference parsePDF so it isn't flagged as unused while extraction is disabled.
  void parsePDF;
  return NextResponse.json(
    { error: "Start list parsing is temporarily disabled while we swap the PDF extraction method. Check back soon!" },
    { status: 501 }
  );
}