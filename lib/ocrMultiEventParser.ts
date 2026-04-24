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

type BuiltEvent = {
  event: string;
  distance: number;
  stroke: string;
};

const EVENT_DISTANCES = [50, 100, 200, 400, 800, 1500];
const SPLIT_DISTANCES = [
  25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400,
  450, 500, 550, 600, 650, 700, 750, 800, 1500,
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[|()[\]{}]/g, " ")
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9:.+\-/, ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupRawLine(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLines(rawText: string) {
  return rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map(cleanupRawLine)
    .filter(Boolean);
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

export function msToTime(ms: number) {
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

  const hasStroke =
    /\b(freestyle|butterfly|backstroke|breaststroke|\bfly\b|\bback\b|\bbreast\b|\bfree\b|medley|\bim\b)\b/.test(
      t
    );
  const hasEventDistance = /\b(50|100|200|400|800|1500)\b/.test(t);
  if (hasStroke && hasEventDistance) return "UNKNOWN";

  if (/\blcm\b|\blong course\b/.test(t)) return "LCM";
  if (/\bscm\b|\bshort course meters?\b/.test(t)) return "SCM";
  if (/\bscy\b|\bshort course yards?\b|\byards?\b/.test(t)) return "SCY";

  return "UNKNOWN";
}

function detectStroke(text: string): string | null {
  const t = normalizeText(text);

  if (/\b(im|individual medley|medley)\b/.test(t)) return "IM";
  if (/\b(freestyle|free)\b/.test(t)) return "FREE";
  if (/\b(backstroke|back)\b/.test(t)) return "BACK";
  if (/\b(breaststroke|breast)\b/.test(t)) return "BREAST";
  if (/\b(butterfly|fly)\b/.test(t)) return "FLY";

  return null;
}

function detectDistance(text: string, choices: number[]): number | null {
  const t = normalizeText(text);

  for (const value of choices) {
    if (new RegExp(`\\b${value}\\b`).test(t)) return value;
  }

  return null;
}

function extractTime(line: string): string | null {
  const matches =
    line.match(/\b(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\b/g) ?? [];

  if (matches.length === 0) return null;

  return matches[0]!;
}

function extractAllTimes(line: string): string[] {
  return line.match(/\b(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\b/g) ?? [];
}

function extractMeetDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const short = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2})\b/);
  if (short) {
    const [, d, m, y] = short;
    return `20${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function detectPlace(line: string): number | null {
  const t = normalizeText(line);

  const match =
    t.match(/\bplace[: ]+(\d{1,2})\b/) ||
    t.match(/\bpos(?:ition)?[: ]+(\d{1,2})\b/) ||
    t.match(/^(\d{1,2})\b/);

  if (!match) return null;

  const value = Number(match[1]);
  return Number.isNaN(value) ? null : value;
}

function normalizeEventName(distance: number, stroke: string): string {
  if (stroke === "IM") return `${distance} IM`;
  if (stroke === "FREE") return `${distance} Freestyle`;
  if (stroke === "BACK") return `${distance} Backstroke`;
  if (stroke === "BREAST") return `${distance} Breaststroke`;
  if (stroke === "FLY") return `${distance} Butterfly`;
  return `${distance}`;
}

function normalizeSplitLabel(distance: number, stroke: string): string {
  if (stroke === "IM") return `${distance} IM`;
  if (stroke === "FREE") return `${distance} Free`;
  if (stroke === "BACK") return `${distance} Back`;
  if (stroke === "BREAST") return `${distance} Breast`;
  if (stroke === "FLY") return `${distance} Fly`;
  return `${distance}`;
}

function buildEventFromLine(line: string): BuiltEvent | null {
  const distance = detectDistance(line, EVENT_DISTANCES);
  const stroke = detectStroke(line);
  if (!distance || !stroke) return null;

  return {
    event: normalizeEventName(distance, stroke),
    distance,
    stroke,
  };
}

function isSkippableLine(line: string) {
  const t = normalizeText(line);
  if (!t) return true;

  return (
    t.includes("improvement") ||
    t.includes("points") ||
    t.includes("completed") ||
    t.includes("entry") ||
    t.includes("dropped") ||
    t.includes("relay") ||
    t.includes("summary")
  );
}

function looksLikeNormalEventLine(line: string) {
  const t = normalizeText(line);
  if (!t) return false;

  const hasStroke =
    t.includes("free") ||
    t.includes("back") ||
    t.includes("fly") ||
    t.includes("breast") ||
    t.includes("medley") ||
    t.includes("im");

  if (!hasStroke) return false;

  const distance = detectDistance(t, EVENT_DISTANCES);
  if (!distance) return false;

  if (
    t.includes("relay") ||
    t.includes("split") ||
    t.includes("total") ||
    t.includes("improvement") ||
    t.includes("points") ||
    t.includes("summary") ||
    t.includes("completed") ||
    t.includes("entry") ||
    t.includes("dropped")
  ) {
    return false;
  }

  const words = t.split(" ").filter(Boolean);
  if (words.length <= 3) return false;

  return true;
}

function inferCourseFromSplits(
  globalCourse: "LCM" | "SCM" | "SCY" | "UNKNOWN",
  _eventDistance: number,
  _splits: ParsedSplit[]
) {
  return globalCourse;
}

function parseIMSplitsFromDedicatedParser(rawText: string, distance: number): ParsedSplit[] {
  if (distance !== 200) return [];

  const parsed = parse200IMSplitsFromOCR(rawText);
  if (!parsed?.splits?.length) return [];

  return parsed.splits.map((s: any, idx: number) => ({
    label: `${s.distance} ${s.stroke}`,
    order: idx + 1,
    distance: s.distance,
    splitMs: s.splitMs,
    cumulativeMs: s.cumulativeMs ?? null,
  }));
}

function fillMissingLastSplit(
  splits: ParsedSplit[],
  eventDistance: number,
  eventStroke: string,
  finalTimeMs: number
): ParsedSplit[] {
  if (!splits.length) return splits;
  if (splits.some((s) => s.distance === eventDistance)) return splits;

  const last = splits[splits.length - 1];
  const lastCum =
    last.cumulativeMs ??
    splits.reduce((sum, s) => sum + s.splitMs, 0);

  const remaining = finalTimeMs - lastCum;
  if (remaining <= 0) return splits;

  return [
    ...splits,
    {
      label: normalizeSplitLabel(eventDistance, eventStroke),
      order: splits.length + 1,
      distance: eventDistance,
      splitMs: remaining,
      cumulativeMs: finalTimeMs,
    },
  ];
}

function parseGenericSplitRows(
  lines: string[],
  eventDistance: number,
  eventStroke: string
): ParsedSplit[] {
  const splits: ParsedSplit[] = [];
  const MAX_LEG_MS = 90_000;
  let pendingMs: number | null = null;

  function remapSequentialDistances(rows: ParsedSplit[]): ParsedSplit[] {
    if (!rows.length) return rows;
    if (eventStroke === "IM") return rows;

    const step = eventDistance / rows.length;
    if (!Number.isInteger(step) || step <= 0) return rows;

    const distances = rows.map((r) => r.distance ?? 0);
    const hasDuplicates = new Set(distances).size !== distances.length;
    const isOutOfOrder = distances.some((d, i) => i > 0 && d <= distances[i - 1]);

    if (!hasDuplicates && !isOutOfOrder) return rows;

    return rows.map((row, index) => {
      const distance = step * (index + 1);
      return {
        ...row,
        order: index + 1,
        distance,
        label: normalizeSplitLabel(distance, eventStroke),
      };
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = cleanupRawLine(lines[i]);
    if (!line) continue;

    const norm = normalizeText(line);

    if (norm === "splits" || norm === "split") {
      pendingMs = null;
      continue;
    }

    // Skip Meet Mobile's intermediate cumulative rows e.g. "100 Free Split 1:31.23"
    // These are labelled "X [stroke] Split" and are cumulative markers, not leg times
    if (/\bsplit\b/i.test(line) && detectDistance(line, SPLIT_DISTANCES)) {
      pendingMs = null;
      continue;
    }

    if (norm.includes("total")) {
      pendingMs = null;
      continue;
    }

    const distance = detectDistance(line, SPLIT_DISTANCES);
    const stroke = detectStroke(line);
    const timeStrings = extractAllTimes(line);
    const timesOnLine = timeStrings.map((t) => timeToMs(t)).filter((ms) => ms > 0);

    if (norm.includes("split") && (!distance || !stroke || timesOnLine.length === 0)) {
      pendingMs = null;
      continue;
    }

    const standaloneTime = extractTime(line);
    if (standaloneTime && normalizeText(line) === normalizeText(standaloneTime)) {
      const ms = timeToMs(standaloneTime);
      if (ms > 5000 && ms <= MAX_LEG_MS) {
        pendingMs = ms;
      } else {
        pendingMs = null;
      }
      continue;
    }

    if (!distance || !stroke) {
      pendingMs = null;
      continue;
    }

    if (stroke !== eventStroke) {
      pendingMs = null;
      continue;
    }

    if (distance > eventDistance) {
      pendingMs = null;
      continue;
    }

    const validTimes = timesOnLine.filter((ms) => ms > 5000);
    const legMs = validTimes.find((ms) => ms <= MAX_LEG_MS) ?? null;
    const cumulativeMs =
      validTimes.find((ms) => legMs != null && ms > legMs) ??
      validTimes.find((ms) => ms > MAX_LEG_MS) ??
      null;

    if (legMs != null) {
      splits.push({
        label: normalizeSplitLabel(distance, eventStroke),
        order: splits.length + 1,
        distance,
        splitMs: legMs,
        cumulativeMs,
      });
      pendingMs = null;
      continue;
    }

    const nextLine = cleanupRawLine(lines[i + 1] ?? "");
    const nextTimes = extractAllTimes(nextLine)
      .map((t) => timeToMs(t))
      .filter((ms) => ms > 5000);

    const nextLeg = nextTimes.find((ms) => ms <= MAX_LEG_MS) ?? null;
    if (nextLeg != null) {
      const nextCumulative = nextTimes.find((ms) => ms > nextLeg) ?? null;

      splits.push({
        label: normalizeSplitLabel(distance, eventStroke),
        order: splits.length + 1,
        distance,
        splitMs: nextLeg,
        cumulativeMs: nextCumulative,
      });

      pendingMs = null;
      i += 1;
      continue;
    }

    if (pendingMs != null && pendingMs > 5000 && pendingMs <= MAX_LEG_MS) {
      splits.push({
        label: normalizeSplitLabel(distance, eventStroke),
        order: splits.length + 1,
        distance,
        splitMs: pendingMs,
        cumulativeMs: null,
      });
      pendingMs = null;
      continue;
    }

    pendingMs = null;
  }

  return remapSequentialDistances(splits);
}

// ─── FIX 1: guessMeetName ────────────────────────────────────────────────────
// Previously matched ANY line containing "swim", which caught Meet Mobile's
// "SWIM DETAIL" UI label. Now we explicitly reject those UI strings first.
function guessMeetName(lines: string[]): string | null {
  // Known Meet Mobile UI labels that contain "swim" but are NOT meet names
  const UI_LABELS = /swim\s*detail|swim\s*scan|swim\s*meet\s*detail/i;

  const meetLike = lines.find((line) => {
    if (UI_LABELS.test(line)) return false;
    // Also reject lines that are obviously table headers (e.g. "& SWIM DETAIL <")
    if (/^[&<>|*#]+/.test(line.trim())) return false;
    return /\b(meet|cup|championship|championships|trials|league|invitational|swim)\b/i.test(line);
  });
  return meetLike ?? null;
}

// ─── FIX 2: guessNameFromLines ────────────────────────────────────────────────
// Previously "nals PLACE TIME" passed the filter because "nals" isn't the full
// word "finals". Now we block: any line containing "place" or "time" as words,
// lines that appear to be truncated "finals" ("nals"), and all-caps header lines.
function guessNameFromLines(lines: string[], options: ParseOptions): string | null {
  if (options.swimmerName?.trim()) return options.swimmerName.trim();

  const candidate = lines.find((line) => {
    const t = normalizeText(line);
    if (!t) return false;
    if (looksLikeNormalEventLine(line)) return false;
    if (extractTime(line)) return false;
    if (detectCourse(line) !== "UNKNOWN") return false;
    if (detectPlace(line) != null) return false;
    if (isSkippableLine(line)) return false;
    // Existing filter: common table-row keywords
    if (/\b(splits|total|finals|prelims|heat|lane)\b/i.test(line)) return false;
    // NEW: reject lines with "place" or "time" as standalone words (table headers)
    if (/\b(place|time|rank|nals)\b/i.test(line)) return false;
    // NEW: reject lines that are ALL-CAPS only (table headers like "PLACE TIME")
    if (/^[A-Z\s&<>|]+$/.test(line.trim()) && line.trim().length > 3) return false;
    return /^[A-Za-z ,.'-]{4,}$/.test(line);
  });

  return candidate ?? null;
}

function isSplitScreen(lines: string[]) {
  const hasSplitsHeader = lines.some((line) => /^splits$/i.test(line.trim()));
  const hasTotal = lines.some((line) => /^total\b/i.test(line.trim()));
  return hasSplitsHeader || hasTotal;
}

function parseSingleSplitScreen(
  rawText: string,
  lines: string[],
  options: ParseOptions
): ParsedSwimResult[] {
  const globalCourse = detectCourse(rawText) || options.defaultCourse || "UNKNOWN";
  const swamAt = extractMeetDate(rawText);
  const meetName = guessMeetName(lines);
  const place = lines.map(detectPlace).find((v) => v != null) ?? null;
  const resolvedName = guessNameFromLines(lines, options);

  const bestEventLine = lines.find(looksLikeNormalEventLine);
  if (!bestEventLine) return [];

  const bestEvent = buildEventFromLine(bestEventLine);
  if (!bestEvent) return [];

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
    if (totalStr) {
      finalTimeStr = totalStr;
      finalTimeMs = timeToMs(totalStr);
    }
  }

  if (!finalTimeStr || finalTimeMs <= 0) {
    const finalsLine = lines.find((l) => /finals/i.test(l));
    if (finalsLine) {
      const idx = lines.indexOf(finalsLine);
      const nextLine = lines[idx + 1] ?? "";
      const times = extractAllTimes(nextLine);
      if (times.length >= 1) {
        finalTimeStr = times[0];
        finalTimeMs = timeToMs(times[0]);
      }
    }
  }

  if ((!finalTimeStr || finalTimeMs <= 0) && bestEvent.stroke === "IM") {
    const parsedIM = parse200IMSplitsFromOCR(rawText);
    if (parsedIM.totalMs != null) {
      finalTimeMs = parsedIM.totalMs;
      finalTimeStr = msToTime(parsedIM.totalMs);
    }
  }

  if (!finalTimeStr || finalTimeMs <= 0) return [];
  if (finalTimeMs > 1_800_000) return [];

  splits = fillMissingLastSplit(
    splits,
    bestEvent.distance,
    bestEvent.stroke,
    finalTimeMs
  );

  const correctedCourse = inferCourseFromSplits(
    globalCourse,
    bestEvent.distance,
    splits
  );

  return [
    {
      event: bestEvent.event,
      distance: bestEvent.distance,
      stroke: bestEvent.stroke,
      name: resolvedName,
      timeStr: finalTimeStr,
      timeMs: finalTimeMs,
      course: correctedCourse,
      confidence: splits.length > 0 ? 7 : 4,
      rawBlock: lines,
      swamAt: swamAt || null,
      meetName: meetName || null,
      place,
      splits: splits.length > 0 ? splits : undefined,
    },
  ];
}

function parseNormalEventBlocks(
  rawText: string,
  lines: string[],
  options: ParseOptions
): ParsedSwimResult[] {
  const results: ParsedSwimResult[] = [];
  const detectedDate = extractMeetDate(rawText);
  const foundCourse =
    detectCourse(rawText) !== "UNKNOWN"
      ? detectCourse(rawText)
      : options.defaultCourse ?? "UNKNOWN";
  const meetName = guessMeetName(lines);
  const resolvedName = guessNameFromLines(lines, options);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!looksLikeNormalEventLine(line)) continue;

    const built = buildEventFromLine(line);
    if (!built) continue;

    const rawBlock = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 8));
    let foundTime: string | null = null;
    let foundPlace: number | null = detectPlace(line);

    for (let j = i; j < Math.min(lines.length, i + 8); j++) {
      const next = lines[j];
      const nextNorm = normalizeText(next);

      const maybePlace = detectPlace(next);
      if (maybePlace != null && foundPlace == null) foundPlace = maybePlace;

      if (isSkippableLine(next)) continue;

      if (/^total\s+/i.test(next.trim())) {
        const totalTime = extractTime(next);
        if (totalTime) {
          foundTime = totalTime;
          break;
        }
      }

      if (
        nextNorm.includes("finals") ||
        nextNorm.includes("prelims") ||
        nextNorm.includes("heat") ||
        nextNorm.includes("lane")
      ) {
        const maybeTime = extractTime(next);
        if (maybeTime) {
          foundTime = maybeTime;
          break;
        }
        continue;
      }

      const time = extractTime(next);
      if (time) {
        foundTime = time;
        break;
      }
    }

    if (!foundTime) continue;

    const timeMs = timeToMs(foundTime);
    if (built.distance === 100 && timeMs < 40_000) continue;
    if (built.distance === 200 && timeMs < 80_000) continue;
    if (built.distance === 50 && timeMs < 20_000) continue;
    if (timeMs > 1_800_000) continue;

    results.push({
      event: built.event,
      distance: built.distance,
      stroke: built.stroke,
      name: resolvedName,
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

export function parseSwimOCRText(
  rawText: string,
  options: ParseOptions = {}
): ParsedSwimResult[] {
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
    if (!existing || item.confidence > existing.confidence) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.timeMs - b.timeMs;
  });
}

export function parseSingleSwimOCRText(
  rawText: string,
  options: ParseOptions = {}
): ParsedSwimResult | null {
  return parseSwimOCRText(rawText, options)[0] ?? null;
}