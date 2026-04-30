// ─── lib/swimCloudParser.ts ───────────────────────────────────────────────────
//
// Parses SwimCloud screenshots — both screen types:
//
// TYPE A: Event results list (multiple swimmers, one event)
//   Desktop: "1  Rumiao Liu  Elite Swim Club  36.08  PB  -2.86"
//   Mobile:  "13\nMikaela Loh\nSingapore Swimming Club\n34.63"
//
// TYPE B: Swimmer summary (one swimmer, all events)
//   Desktop: "50 Free  Timed Finals  34.63  PB  -1.20  13th"
//   Mobile:  "50 Free\nTimed Finals\n34.63  PB  -1.20  13th"
//
// Scrolled Type A screenshots (no event header visible) produce results
// with event: "Unknown Event" so the parent can manually assign in the UI.

import { parseAgeBand } from "@/lib/ageBandParser";
import type { ParsedSwimResult } from "@/lib/ocrMultiEventParser";

// ─── Detection ────────────────────────────────────────────────────────────────

export function isSwimCloudText(rawText: string): boolean {
  const lower = rawText.toLowerCase();

  // Strongest signal: URL bar visible in phone screenshot
  if (lower.includes("swimcloud.com")) return true;

  // SwimCloud page furniture
  const hasMeetDashboard = lower.includes("meet dashboard");
  const hasTimedFinals = lower.includes("timed finals");
  const hasImprovementDelta = /[+\-]\d+\.\d{2}/.test(rawText);
  const hasCompleted = /completed\s*[·•]\s*\w+\s+\d+/i.test(rawText);

  if (hasTimedFinals && (hasMeetDashboard || hasImprovementDelta || hasCompleted)) return true;

  return false;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const EVENT_DISTANCES = [50, 100, 200, 400, 800, 1500];
const TIME_RE = /\b(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})\b/;
const PLACE_SUFFIX_RE = /\b(\d{1,3})(?:st|nd|rd|th)\b/i;

function timeToMs(s: string): number {
  const clean = s.trim();
  if (clean.includes(":")) {
    const [mm, rest] = clean.split(":");
    const [sec, hh] = rest.split(".");
    return Number(mm) * 60_000 + Number(sec) * 1_000 + Number(hh ?? "0") * 10;
  }
  const [sec, hh] = clean.split(".");
  return Number(sec) * 1_000 + Number(hh ?? "0") * 10;
}

function detectCourse(text: string): "LCM" | "SCM" | "SCY" | "UNKNOWN" {
  const t = text.toLowerCase();
  if (t.includes("lcm") || t.includes("long course")) return "LCM";
  if (t.includes("scm") || t.includes("short course meter")) return "SCM";
  if (t.includes("scy") || t.includes("yard")) return "SCY";
  // SwimCloud shows "LCM" in the meet header — check for it
  if (/\bLCM\b/.test(text)) return "LCM";
  if (/\bSCM\b/.test(text)) return "SCM";
  return "UNKNOWN";
}

function extractMeetDate(text: string): string | null {
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  // "Mar 13–15, 2026" or "Mar 13, 2026"
  const m = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:[–\-]\d{1,2})?,?\s+(\d{4})\b/i
  );
  if (m) {
    const month = months[m[1].slice(0, 3).toLowerCase()];
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month != null && !isNaN(day) && !isNaN(year)) {
      return new Date(Date.UTC(year, month, day)).toISOString().split("T")[0];
    }
  }
  return null;
}

function extractMeetName(lines: string[]): string | null {
  const meetRe = /championship|juniors|national|open|invitational|classic|snag|etc\b|nsg\b|jic\b|snsc|pesta|double age|age group/i;
  for (const line of lines.slice(0, 8)) {
    if (line.length >= 5 && meetRe.test(line)) return line.trim();
  }
  return null;
}

function normaliseEvent(raw: string): { event: string; distance: number; stroke: string } | null {
  // Strip "Timed Finals", "Heats", "Extracted", "Prelims" suffixes
  const s = raw.replace(/\s*(Timed Finals?|Finals?|Heats?|Extracted|Prelims?|MED-R\s*\([^)]+\)).*/i, "").trim();

  const m = s.match(/^(\d+)\s+(.+)$/);
  if (!m) return null;

  const distance = parseInt(m[1], 10);
  if (!EVENT_DISTANCES.includes(distance)) return null;

  const rawStroke = m[2].toLowerCase().trim();

  let stroke = "";
  let eventName = "";

  if (/^free/.test(rawStroke) || rawStroke === "f") { stroke = "FREE"; eventName = `${distance} Freestyle`; }
  else if (/^back/.test(rawStroke)) { stroke = "BACK"; eventName = `${distance} Backstroke`; }
  else if (/^breast/.test(rawStroke)) { stroke = "BREAST"; eventName = `${distance} Breaststroke`; }
  else if (/^fly/.test(rawStroke) || /^butterfly/.test(rawStroke)) { stroke = "FLY"; eventName = `${distance} Butterfly`; }
  else if (/^im$/.test(rawStroke) || /^medley/.test(rawStroke) || /^med/.test(rawStroke)) { stroke = "IM"; eventName = `${distance} IM`; }
  else return null;

  return { event: eventName, distance, stroke };
}

// ─── TYPE B — Swimmer summary ─────────────────────────────────────────────────

function isSwimmerSummaryPage(lines: string[]): boolean {
  // Multiple event rows like "50 Free" or "100 Back" (without a place number before them)
  let eventOnlyLines = 0;
  for (const line of lines) {
    if (/^(50|100|200|400|800|1500)\s+(Free|Back|Breast|Fly|IM|Medley)/i.test(line)) {
      eventOnlyLines++;
    }
  }
  return eventOnlyLines >= 2;
}

function parseSwimmerSummary(rawText: string, lines: string[]): ParsedSwimResult[] {
  const course = detectCourse(rawText);
  const swamAt = extractMeetDate(rawText);
  const meetName = extractMeetName(lines);
  const ageBand = parseAgeBand(rawText);
  const results: ParsedSwimResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match event line: "50 Free", "100 Back", "200 Fly Timed Finals", etc.
    if (!/^(50|100|200|400|800|1500)\s+(Free|Back|Breast|Fly|IM|Medley)/i.test(line)) continue;

    const built = normaliseEvent(line);
    if (!built) continue;

    // Find the time — on same line (desktop) or next 1-2 lines (mobile)
    let timeStr: string | null = null;
    let place: number | null = null;

    for (let j = i; j <= Math.min(i + 3, lines.length - 1); j++) {
      const search = lines[j];
      const tMatch = search.match(TIME_RE);
      if (tMatch) {
        timeStr = tMatch[1];
        const pMatch = search.match(PLACE_SUFFIX_RE);
        if (pMatch) place = parseInt(pMatch[1], 10);
        break;
      }
    }

    if (!timeStr) continue;
    const timeMs = timeToMs(timeStr);
    if (timeMs <= 0 || timeMs > 1_800_000) continue;

    results.push({
      event: built.event,
      distance: built.distance,
      stroke: built.stroke,
      name: null, // resolved via fuzzy match in scan page
      timeStr,
      timeMs,
      course,
      confidence: 8,
      rawBlock: lines.slice(Math.max(0, i - 1), i + 4),
      swamAt,
      meetName,
      place,
      ageBand,
    });
  }

  return results;
}

// ─── TYPE A — Event results list ──────────────────────────────────────────────

function parseEventResultsList(rawText: string, lines: string[]): ParsedSwimResult[] {
  const course = detectCourse(rawText);
  const swamAt = extractMeetDate(rawText);
  const meetName = extractMeetName(lines);
  const ageBand = parseAgeBand(rawText);
  const results: ParsedSwimResult[] = [];

  // Try to find event from header
  // Desktop: "50 Back · Women · 10" or "50 Back  Women  10"
  // Mobile: event is in a filter bar we may or may not see
  let eventInfo: { event: string; distance: number; stroke: string } | null = null;

  for (const line of lines.slice(0, 12)) {
    // Strip gender/age qualifiers and try to parse
    const stripped = line
      .replace(/[·•]/g, " ")
      .replace(/\b(Women|Men|Mixed|Girls|Boys|Open)\b.*/i, "")
      .trim();
    const built = normaliseEvent(stripped);
    if (built) { eventInfo = built; break; }
  }

  // ── Desktop format: "1  Rumiao Liu  Elite Swim Club  36.08  PB  -2.86" ──
  // Number + name are on the SAME line
  const desktopRowRe = /^(\d{1,3})\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,5})\s+/;
  let desktopRows = 0;
  for (const line of lines) {
    if (desktopRowRe.test(line) && TIME_RE.test(line)) desktopRows++;
  }

  if (desktopRows >= 2) {
    // Desktop parse
    for (const line of lines) {
      const rowMatch = line.match(desktopRowRe);
      if (!rowMatch) continue;
      const tMatch = line.match(TIME_RE);
      if (!tMatch) continue;

      const place = parseInt(rowMatch[1], 10);
      if (place < 1 || place > 999) continue;

      // Name: everything between place and team — take words before the last long word (team)
      const afterPlace = line.slice(rowMatch[0].length - rowMatch[2].length).trim();
      const beforeTime = afterPlace.slice(0, afterPlace.indexOf(tMatch[0])).trim();
      // Heuristic: name is 2-4 words, team is what follows
      const words = beforeTime.split(/\s{2,}|\t/); // desktop uses wide spacing
      const name = (words[0] ?? beforeTime.split(/\s+/).slice(0, 3).join(" ")).trim();

      const timeStr = tMatch[1];
      const timeMs = timeToMs(timeStr);
      if (timeMs <= 0 || timeMs > 1_800_000) continue;

      results.push({
        event: eventInfo?.event ?? "Unknown Event",
        distance: eventInfo?.distance ?? 0,
        stroke: eventInfo?.stroke ?? "UNKNOWN",
        name,
        timeStr,
        timeMs,
        course,
        confidence: eventInfo ? 7 : 3,
        rawBlock: [line],
        swamAt,
        meetName,
        place,
        ageBand,
      });
    }
    return results;
  }

  // ── Mobile format: each entry is number / name / club / time on separate lines ──
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Place number alone on a line
    const placeOnlyMatch = line.match(/^(\d{1,3})$/);
    if (!placeOnlyMatch) continue;

    const place = parseInt(placeOnlyMatch[1], 10);
    if (place < 1 || place > 999) continue;

    const nameLine = lines[i + 1] ?? "";
    const teamLine = lines[i + 2] ?? "";
    const timeLine = lines[i + 3] ?? "";

    // Name line: starts with capital, no digits, reasonable length
    if (!nameLine || /^\d/.test(nameLine) || nameLine.length < 3 || nameLine.length > 60) continue;
    if (/^(timed finals?|finals?|heats?|search|events?|meet dashboard)/i.test(nameLine)) continue;

    // Find time in the next few lines
    const timeMatch =
      timeLine.match(TIME_RE) ||
      teamLine.match(TIME_RE);
    if (!timeMatch) continue;

    const timeStr = timeMatch[1];
    const timeMs = timeToMs(timeStr);
    if (timeMs <= 0 || timeMs > 1_800_000) continue;

    results.push({
      event: eventInfo?.event ?? "Unknown Event",
      distance: eventInfo?.distance ?? 0,
      stroke: eventInfo?.stroke ?? "UNKNOWN",
      name: nameLine.trim(),
      timeStr,
      timeMs,
      course,
      confidence: eventInfo ? 7 : 3,
      rawBlock: [line, nameLine, teamLine, timeLine],
      swamAt,
      meetName,
      place,
      ageBand,
    });

    i += 3; // consumed 3 look-ahead lines
  }

  return results;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function parseSwimCloudOCR(rawText: string): ParsedSwimResult[] {
  const lines = rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const results = isSwimmerSummaryPage(lines)
    ? parseSwimmerSummary(rawText, lines)
    : parseEventResultsList(rawText, lines);

  // Dedup by event + time
  const seen = new Map<string, ParsedSwimResult>();
  for (const r of results) {
    const key = `${r.event}|${r.timeStr}|${r.place ?? ""}`;
    if (!seen.has(key)) seen.set(key, r);
  }

  return Array.from(seen.values());
}