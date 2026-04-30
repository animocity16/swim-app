// ─── lib/ocrRouter.ts ─────────────────────────────────────────────────────────
//
// Single entry point for all OCR parsing. Detects the screenshot source and
// routes to the correct parser. All paths return ParsedSwimResult[] so the
// scan page never needs to know which source was used.
//
// Three routes:
//   1. SwimCloud          → parseSwimCloudOCR   (swimmer summary or event list)
//   2. Meet Mobile events → parseEventResultsOCR (multi-swimmer event results page)
//   3. Meet Mobile detail → parseSwimOCRText     (single-swimmer split/detail screen)

import { parseSwimOCRText } from "@/lib/ocrMultiEventParser";
import type { ParsedSwimResult } from "@/lib/ocrMultiEventParser";
import { parseSwimCloudOCR, isSwimCloudText } from "@/lib/ocrSwimCloudParser";
import { parseEventResultsOCR, isEventResultsPage } from "@/lib/ocrEventResultsParser";
import type { EventResultRow } from "@/lib/ocrEventResultsParser";
import { parseAgeBand } from "@/lib/ageBandParser";

// ─── Convert EventResultRow → ParsedSwimResult ────────────────────────────────

function parseEventName(event: string): { distance: number; stroke: string } {
  const m = event.match(/^(\d+)\s+(.+)$/);
  if (!m) return { distance: 0, stroke: "UNKNOWN" };
  const distance = parseInt(m[1], 10);
  const rawStroke = m[2].toLowerCase();
  let stroke = "UNKNOWN";
  if (rawStroke.includes("free")) stroke = "FREE";
  else if (rawStroke.includes("back")) stroke = "BACK";
  else if (rawStroke.includes("breast")) stroke = "BREAST";
  else if (rawStroke.includes("fly") || rawStroke.includes("butterfly")) stroke = "FLY";
  else if (rawStroke.includes("im") || rawStroke.includes("medley")) stroke = "IM";
  return { distance, stroke };
}

function eventRowToSwimResult(
  row: EventResultRow,
  ageBand: string | null
): ParsedSwimResult | null {
  if (!row.event || row.timeMs <= 0) return null;
  const { distance, stroke } = parseEventName(row.event);
  if (!distance || stroke === "UNKNOWN") return null;
  return {
    event: row.event,
    distance,
    stroke,
    name: row.name ?? null,
    timeStr: row.timeStr,
    timeMs: row.timeMs,
    course: row.course,
    confidence: 7,
    rawBlock: [],
    swamAt: row.swamAt ?? null,
    meetName: row.meetName ?? null,
    place: row.place ?? null,
    ageBand,
  };
}

// ─── Main router ──────────────────────────────────────────────────────────────

export function routeOCR(rawText: string): ParsedSwimResult[] {
  // Route 1: SwimCloud
  if (isSwimCloudText(rawText)) {
    return parseSwimCloudOCR(rawText);
  }

  // Route 2: Meet Mobile multi-swimmer event results page
  if (isEventResultsPage(rawText)) {
    const parsed = parseEventResultsOCR(rawText);
    const ageBand = parseAgeBand(rawText);
    const results = parsed.results
      .map((row) => eventRowToSwimResult(row, ageBand))
      .filter((r): r is ParsedSwimResult => r !== null);
    return results;
  }

  // Route 3: Meet Mobile single-swimmer detail / split screen (default)
  return parseSwimOCRText(rawText, {});
}