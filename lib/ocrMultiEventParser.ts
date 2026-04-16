import { parse200IMSplitsFromOCR } from "@/lib/ocrSplitParser";

export type ParsedSplit = {
  label: string;
  order: number;
  distance: number | null;
  splitMs: number;
  cumulativeMs?: number | null;
};

export type ParsedSwimResult = {
  event: string;
  distance: number;
  stroke: string;
  name: string | null;
  timeStr: string;
  timeMs: number;
  course: "LCM" | "SCM" | "SCY" | "UNKNOWN";
  confidence: number;
  rawBlock: string[];
  swamAt?: string | null;
  meetName?: string | null;
  place?: number | null;
  splits?: ParsedSplit[];
};

type ParseOptions = {
  swimmerName?: string;
  defaultCourse?: "LCM" | "SCM" | "SCY" | "UNKNOWN";
};

const EVENT_DISTANCES = [50, 100, 200, 400, 800, 1500];
const SPLIT_DISTANCES = [25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 1500];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[|()[\]{}]/g, " ")
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9:.+\-/, ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function timeToMs(timeStr: string) {
  if (!timeStr) return 0;
  if (timeStr.includes(":")) {
    const [mm, ss] = timeStr.split(":");
    const [sec, hundredths] = ss.split(".");
    return (
      Number(mm) * 60_000 +
      Number(sec) * 1000 +
      Number(hundredths ?? "0") * 10
    );
  }
  const [sec, hundredths] = timeStr.split(".");
  return Number(sec) * 1000 + Number(hundredths ?? "0") * 10;
}

function msToTime(ms: number) {
  if (!ms || Number.isNaN(ms)) return "";
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

function detectCourse(text: string): "LCM" | "SCM" | "SCY" | "UNKNOWN" {
  const t = normalizeText(text);
  if (t.includes("50 meter") || t.includes("long course") || t === "lcm" || t.includes(" lcm") || t.includes("meter")) return "LCM";
  if (t.includes("25 meter") || t.includes("short course meters") || t === "scm" || t.includes(" scm")) return "SCM";
  if (t.includes("25 yard") || t.includes("yard") || t.includes("short course yards") || t === "scy" || t.includes(" scy")) return "SCY";
  return "UNKNOWN";
}

function extractTime(line: string): string | null {
  if (/\b(am|pm)\b/i.test(line)) return null;
  const direct = line.match(/\b(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\b/);
  if (direct) return direct[1];
  return null;
}

function fourDigitToMs(raw: string): number | null {
  if (!/^\d{4}$/.test(raw.trim())) return null;
  const s = raw.trim();
  if (s.startsWith("0")) return null;
  const sec = Number(`${s.slice(0, 2)}.${s.slice(2)}`);
  if (isNaN(sec) || sec <= 0) return null;
  return Math.round(sec * 1000);
}

function extractPlace(line: string, nextLine: string = ""): number | null {
  // "PLACE 6", "place: 6", "place|6"
  const placeMatch = line.match(/place[:\s|]*([0-9]{1,3})/i);
  if (placeMatch) {
    const parsed = parseInt(placeMatch[1], 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 999) return parsed;
  }
  // "Finals 6 37.70" — place number before time on finals line
  const finalsMatch = line.match(/finals\s+(\d{1,3})\s+[\d:.]+/i);
  if (finalsMatch) {
    const parsed = parseInt(finalsMatch[1], 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 999) return parsed;
  }
  // "PLACE FINALS ENTRY" on one line, "1 36.39 36.50" on next
  if (/^PLACE\s+(FINALS|SEMI|ENTRY)/i.test(line) && nextLine) {
    const m = nextLine.match(/^(\d{1,3})\s/);
    if (m) {
      const p = parseInt(m[1], 10);
      if (!isNaN(p) && p >= 1 && p <= 999) return p;
    }
  }
  return null;
}

function detectDistance(text: string, allowed: number[] = EVENT_DISTANCES): number | null {
  const t = normalizeText(text);
  for (const d of allowed) {
    if (new RegExp(`\\b${d}\\b`).test(t)) return d;
  }
  return null;
}

function detectStroke(text: string): string | null {
  const t = normalizeText(text);
  if (t.includes("freestyle") || t.includes(" free")) return "Freestyle";
  if (t.includes("butterfly") || t.includes(" fly")) return "Butterfly";
  if (t.includes("backstroke") || t.includes(" back")) return "Backstroke";
  if (t.includes("breaststroke") || t.includes(" breast")) return "Breaststroke";
  if (t.includes("individual medley") || t.includes(" medley") || t.includes(" im") || t.includes("i m")) return "IM";
  return null;
}

function buildEvent(line: string): { event: string; distance: number; stroke: string } | null {
  const distance = detectDistance(line, EVENT_DISTANCES);
  const stroke = detectStroke(line);
  if (!distance || !stroke) return null;
  return { event: `${distance} ${stroke}`, distance, stroke };
}

function extractGlobalCourse(lines: string[]) {
  for (const line of lines.slice(0, 30)) {
    const course = detectCourse(line);
    if (course !== "UNKNOWN") return course;
  }
  return "UNKNOWN";
}

function cleanLines(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/\s+/g, " "))
    .filter(Boolean);
}

function extractMeetDate(rawText: string): string | null {
  const text = rawText.replace(/\r/g, "\n");
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const monthMatch = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.,|/-]*(\d{1,2})[\s,|/-]*(\d{4})\b/i
  );
  if (monthMatch) {
    const monthText = monthMatch[1].slice(0, 3).toLowerCase();
    const day = Number(monthMatch[2]);
    const year = Number(monthMatch[3]);
    const month = monthMap[monthText];
    if (month != null && !Number.isNaN(day) && !Number.isNaN(year) && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month, day)).toISOString().split("T")[0];
    }
  }

  const dmyMatch = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year) && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return new Date(Date.UTC(year, month - 1, day)).toISOString().split("T")[0];
    }
  }
  return null;
}

// ✅ Extract meet name from OCR text.
//
// Meet Mobile shows the meet name in the swim detail screen like this:
//   "EVENT 56th SNAG Juniors"         → "56th SNAG Juniors"
//   "EVENT Singapore Age Group Open"  → "Singapore Age Group Open"
//
// Three strategies tried in order:
//   1. "EVENT [meet name]" line  — most reliable Meet Mobile pattern
//   2. "MEET [meet name]" line   — fallback
//   3. Scan first 20 lines for a line containing known meet keywords
function extractMeetName(rawText: string): string | null {
  const lines = rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Strategy 0: NSG meet name — OCR garbles "EVENT" as "EUS" or similar
  // Look for lines containing NSG/SPSSC/JR keywords directly
  for (const line of lines.slice(0, 10)) {
    if (/\bNSG\b/i.test(line) || /\bSPSSC\b/i.test(line)) {
      // Strip leading garbled chars (EUS, &, etc.) before the real meet name
      const cleaned = line.replace(/^[^A-Z0-9]*(?:EUS|EVENT)?\s*/i, "").trim();
      if (cleaned.length >= 4) return cleaned;
    }
  }

  // Strategy 1: "EVENT [meet name]"
  for (const line of lines) {
    const eventMatch = line.match(/^EVENT\s+(.+)$/i);
    if (eventMatch) {
      const candidate = eventMatch[1].trim();
      if (/^\d+$/.test(candidate)) continue;
      if (detectStroke(candidate) !== null && detectDistance(candidate) !== null) continue;
      if (candidate.length < 4) continue;
      // Block known non-meet-name keywords
      if (/^(summary|details|results|splits|total|completed|entry|finals|heat|lane|status|dropped|seed)$/i.test(candidate)) continue;
      return candidate;
    }
  }

  // Strategy 2: "MEET [meet name]"
  for (const line of lines) {
    const meetMatch = line.match(/^MEET\s+(.+)$/i);
    if (meetMatch) {
      const candidate = meetMatch[1].trim();
      if (candidate.length >= 4) return candidate;
    }
  }

  // Strategy 3: scan first 20 lines for known meet keywords
  const meetKeywords = /championship|championships|open|invitational|junior|juniors|classic|cup|trophy|gala|relay|carnival|national|regional|age.?group|series|aquatic|swim.?meet|swimming/i;

  for (const line of lines.slice(0, 20)) {
    if (line.length < 5 || line.length > 100) continue;
    if (/\b(am|pm)\b/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/place|lane|heat|finals|entry|seed|status|dropped|completed|summary|split|total|result/i.test(line)) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;
    // Skip event description lines like "102 Girls 9-10 100 Meter Back"
    if (/^\d+\s+(girls|boys|women|men)/i.test(line)) continue;
    if (meetKeywords.test(line)) return line.trim();
  }

  return null;
}

function isSplitScreen(lines: string[]) {
  const joined = normalizeText(lines.join(" "));
  return joined.includes("splits") && joined.includes("total");
}

function normalizeSplitLabel(cumulativeDistance: number, stroke: string) {
  const strokeShort =
    stroke === "Freestyle" ? "Free"
    : stroke === "Backstroke" ? "Back"
    : stroke === "Breaststroke" ? "Breast"
    : stroke === "Butterfly" ? "Fly"
    : stroke === "IM" ? "IM"
    : stroke;
  return `${cumulativeDistance} ${strokeShort}`;
}

// ✅ Fill in the missing last split for ANY multi-lap event.
// Only fills when exactly 1 leg is missing at the end.
// Covers 100/200/400/800 Free, Back, Breast, Fly.
function fillMissingLastSplit(
  splits: ParsedSplit[],
  eventDistance: number,
  eventStroke: string,
  finalTimeMs: number
): ParsedSplit[] {
  if (eventDistance % 50 !== 0) return splits;
  const expectedLegCount = eventDistance / 50;
  if (splits.length === 0 || splits.length !== expectedLegCount - 1) return splits;

  const sumFound = splits.reduce((acc, s) => acc + s.splitMs, 0);
  const missingMs = finalTimeMs - sumFound;
  if (missingMs <= 0 || missingMs > finalTimeMs) return splits;

  return [
    ...splits,
    {
      label: normalizeSplitLabel(eventDistance, eventStroke),
      order: splits.length + 1,
      distance: eventDistance,
      splitMs: missingMs,
      cumulativeMs: finalTimeMs,
    },
  ];
}

function parseGenericSplitRows(lines: string[], eventDistance: number, eventStroke: string) {
  const splits: ParsedSplit[] = [];
  let pendingMs: number | null = null;

  for (const line of lines) {
    const norm = normalizeText(line);
    if (!norm) continue;
    if (norm.includes("total")) continue;
    if (norm.includes("event summary")) continue;
    if (norm.includes("heat place")) continue;
    if (norm.includes("lane")) continue;
    if (norm.includes("meet home")) continue;
    if (/\b(am|pm)\b/i.test(line)) continue;

    const fourDigit = line.trim().match(/^(\d{4})$/);
    if (fourDigit) {
      const ms = fourDigitToMs(fourDigit[1]);
      if (ms && ms > 5000 && ms < 120000) {
        pendingMs = ms;
        continue;
      }
    }

    const standaloneTime = extractTime(line);
    if (standaloneTime && normalizeText(line) === normalizeText(standaloneTime)) {
      pendingMs = timeToMs(standaloneTime);
      continue;
    }

    const distance = detectDistance(line, SPLIT_DISTANCES);
    const stroke = detectStroke(line);
    if (!distance || !stroke) continue;
    if (stroke !== eventStroke) continue;
    if (distance > eventDistance) continue;
    if (norm.includes("split")) continue;
    if (!pendingMs) continue;
    if (pendingMs < 5000) { pendingMs = null; continue; }

    splits.push({
      label: normalizeSplitLabel(distance, eventStroke),
      order: splits.length + 1,
      distance,
      splitMs: pendingMs,
      cumulativeMs: null,
    });
    pendingMs = null;
  }

  return splits.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
}

function parseIMSplitsFromDedicatedParser(rawText: string, eventDistance: number): ParsedSplit[] {
  if (eventDistance !== 200) return [];
  const parsed = parse200IMSplitsFromOCR(rawText);
  return parsed.splits
    .filter((split) => split.splitMs != null)
    .map((split, index) => {
      const label =
        split.stroke === "FLY" ? `${split.distance} Fly`
        : split.stroke === "BACK" ? `${split.distance} Back`
        : split.stroke === "BREAST" ? `${split.distance} Breast`
        : `${split.distance} Free`;
      return { label, order: index + 1, distance: split.distance, splitMs: split.splitMs!, cumulativeMs: split.cumulativeMs ?? null };
    });
}

function parseSingleSplitScreen(rawText: string, lines: string[], options: ParseOptions): ParsedSwimResult[] {
  const extractedCourse = extractGlobalCourse(lines);
  const globalCourse = extractedCourse !== "UNKNOWN" ? extractedCourse : options.defaultCourse ?? "LCM";
  const swamAt = extractMeetDate(rawText);
  const meetName = extractMeetName(rawText);

  let bestEvent: { event: string; distance: number; stroke: string } | null = null;

  for (const line of lines) {
    const built = buildEvent(line);
    if (!built) continue;
    const t = normalizeText(line);
    if (t.includes("girls") || t.includes("boys") || t.includes("women") || t.includes("men") || t.includes("meter") || t.includes("yard")) {
      bestEvent = built;
      break;
    }
    if (!bestEvent || built.distance > bestEvent.distance) bestEvent = built;
  }

  if (!bestEvent) return [];

  let place: number | null = null;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const nextLineStr = li + 1 < lines.length ? lines[li + 1] : "";
    const maybePlace = extractPlace(line, nextLineStr);
    if (maybePlace != null) { place = maybePlace; break; }
  }

  let splits: ParsedSplit[] = [];
  if (bestEvent.stroke === "IM" && bestEvent.distance === 200) {
    splits = parseIMSplitsFromDedicatedParser(rawText, bestEvent.distance);
  }
  if (splits.length === 0) {
    splits = parseGenericSplitRows(lines, bestEvent.distance, bestEvent.stroke);
  }

  let finalTimeStr: string | null = null;
  let finalTimeMs = 0;

  const totalLine = lines.find((line) => /^total\s+/i.test(line.trim()));
  if (totalLine) {
    const totalStr = extractTime(totalLine);
    if (totalStr) { finalTimeStr = totalStr; finalTimeMs = timeToMs(totalStr); }
  }

  if (!finalTimeStr || finalTimeMs <= 0) {
    const finalsLine = lines.find((l) => /finals/i.test(l));
    if (finalsLine) {
      const idx = lines.indexOf(finalsLine);
      const nextLine = lines[idx + 1] ?? "";
      const times = nextLine.match(/\b(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\b/g);
      if (times && times.length >= 1) {
        finalTimeStr = times[0];
        finalTimeMs = timeToMs(times[0]);
      }
    }
  }

  if ((!finalTimeStr || finalTimeMs <= 0) && bestEvent.stroke === "IM") {
    const parsedIM = parse200IMSplitsFromOCR(rawText);
    if (parsedIM.totalMs != null) { finalTimeMs = parsedIM.totalMs; finalTimeStr = msToTime(parsedIM.totalMs); }
  }

  if (!finalTimeStr || finalTimeMs <= 0) return [];
  if (finalTimeMs > 1800000) return [];

  // ✅ Fill missing last split for ANY multi-lap event
  splits = fillMissingLastSplit(splits, bestEvent.distance, bestEvent.stroke, finalTimeMs);

  return [{
    event: bestEvent.event,
    distance: bestEvent.distance,
    stroke: bestEvent.stroke,
    name: options.swimmerName ?? null,
    timeStr: finalTimeStr,
    timeMs: finalTimeMs,
    course: globalCourse,
    confidence: splits.length > 0 ? 7 : 4,
    rawBlock: lines,
    swamAt: swamAt || null,
    meetName: meetName || null,
    place,
    splits: splits.length > 0 ? splits : undefined,
  }];
}

function looksLikeNormalEventLine(line: string) {
  const t = normalizeText(line);
  if (!t) return false;
  const hasStroke =
    t.includes("free") || t.includes("back") || t.includes("fly") ||
    t.includes("breast") || t.includes("medley") || t.includes("im");
  if (!hasStroke) return false;
  const distance = detectDistance(t, EVENT_DISTANCES);
  if (!distance) return false;
  if (
    t.includes("relay") || t.includes("split") || t.includes("total") ||
    t.includes("improvement") || t.includes("points") || t.includes("summary") ||
    t.includes("completed") || t.includes("entry") || t.includes("dropped")
  ) return false;
  const words = t.split(" ").filter(Boolean);
  if (words.length <= 3) return false;
  return true;
}

function isSkippableLine(line: string): boolean {
  const norm = normalizeText(line);
  return (
    /completed/i.test(norm) ||
    /dropped/i.test(norm) ||
    /entry/i.test(norm) ||
    /status/i.test(norm) ||
    /^e /.test(norm) ||
    /seed/i.test(norm) ||
    /\b(am|pm)\b/i.test(line)
  );
}

function parseNormalEventBlocks(rawText: string, lines: string[], options: ParseOptions): ParsedSwimResult[] {
  const extractedCourse = extractGlobalCourse(lines);
  const globalCourse = extractedCourse !== "UNKNOWN" ? extractedCourse : options.defaultCourse ?? "LCM";
  const detectedDate = extractMeetDate(rawText);
  const meetName = extractMeetName(rawText);
  const results: ParsedSwimResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const currentNorm = normalizeText(current);

    if (!looksLikeNormalEventLine(current)) continue;
    if (currentNorm.includes("relay")) continue;

    const built = buildEvent(current);
    if (!built) continue;

    let foundTime: string | null = null;
    let foundPlace: number | null = null;
    let foundCourse: "LCM" | "SCM" | "SCY" | "UNKNOWN" = globalCourse;
    const rawBlock = [current];

    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const next = lines[j];
      const nextNorm = normalizeText(next);
      rawBlock.push(next);

      const nextCourse = detectCourse(next);
      if (nextCourse !== "UNKNOWN") foundCourse = nextCourse;

      const maybePlace = extractPlace(next, j + 1 < lines.length ? lines[j + 1] : "");
      if (maybePlace != null) foundPlace = maybePlace;

      if (j > i + 1 && looksLikeNormalEventLine(next)) {
        rawBlock.pop();
        break;
      }

      if (isSkippableLine(next)) continue;

      if (/^total\s+/i.test(next.trim())) {
        const totalTime = extractTime(next);
        if (totalTime) { foundTime = totalTime; break; }
      }

      if (
        nextNorm.includes("finals") ||
        nextNorm.includes("prelims") ||
        nextNorm.includes("heat") ||
        nextNorm.includes("lane")
      ) {
        const maybeTime = extractTime(next);
        if (maybeTime) { foundTime = maybeTime; break; }
        continue;
      }

      const time = extractTime(next);
      if (time) { foundTime = time; break; }
    }

    if (!foundTime) continue;

    const timeMs = timeToMs(foundTime);
    if (built.distance === 100 && timeMs < 40000) continue;
    if (built.distance === 200 && timeMs < 80000) continue;
    if (built.distance === 50 && timeMs < 20000) continue;
    if (timeMs > 1800000) continue;

    results.push({
      event: built.event,
      distance: built.distance,
      stroke: built.stroke,
      name: options.swimmerName ?? null,
      timeStr: foundTime,
      timeMs,
      course: foundCourse,
      confidence: 4,
      rawBlock,
      swamAt: detectedDate || null,
      meetName: meetName || null,
      place: foundPlace,
    });
  }

  return results;
}

export function parseSwimOCRText(rawText: string, options: ParseOptions = {}): ParsedSwimResult[] {
  const lines = cleanLines(rawText);

  const is400IM = /400\s*(meter|m)?\s*im/i.test(rawText);
  if (is400IM) return [];

  const results = isSplitScreen(lines)
    ? parseSingleSplitScreen(rawText, lines, options)
    : parseNormalEventBlocks(rawText, lines, options);

  const deduped = new Map<string, ParsedSwimResult>();
  for (const item of results) {
    const key = `${item.event.toLowerCase()}|${item.timeStr}|${item.course}|${item.swamAt ?? ""}|${item.place ?? ""}`;
    const existing = deduped.get(key);
    if (!existing || item.confidence > existing.confidence) deduped.set(key, item);
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.timeMs - b.timeMs;
  });
}