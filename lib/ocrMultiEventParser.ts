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

function repairOCRSeconds(sec: number): number {
  // OCR commonly misreads 5→6 in tens digit (e.g. 55→65). Subtract 10 to reverse.
  if (sec >= 60 && sec < 70) return sec - 10;
  if (sec >= 60) return sec % 60;
  return sec;
}

function timeToMs(timeStr: string) {
  if (!timeStr) return 0;

  if (timeStr.includes(":")) {
    const [mm, ss] = timeStr.split(":");
    const [sec, hundredths] = ss.split(".");
    const rawSec = Number(sec);
    const fixedSec = rawSec >= 60 ? repairOCRSeconds(rawSec) : rawSec;
    return (
      Number(mm) * 60_000 +
      fixedSec * 1000 +
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
function guessMeetName(lines: string[]): string | null {
  const UI_LABELS = /swim\s*detail|swim\s*scan|swim\s*meet\s*detail/i;

  const meetLike = lines.find((line) => {
    if (UI_LABELS.test(line)) return false;
    if (/^[&<>|*#]+/.test(line.trim())) return false;
    return /\b(meet|cup|championship|championships|trials|league|invitational|swim|awards|aquatics|swimfaster|series|juniors|nationals|classic|open)\b/i.test(line);
  });
  return meetLike ?? null;
}

// ─── FIX 2: guessNameFromLines ────────────────────────────────────────────────
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
    if (/\b(splits|total|finals|prelims|heat|lane)\b/i.test(line)) return false;
    if (/\b(place|time|rank|nals)\b/i.test(line)) return false;
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

function extractFinalTimeMs(rawText: string): number {
  function parseAnyTime(t: string): number {
    const parts = t.split(":");
    if (parts.length === 3) {
      return Number(parts[0]) * 60_000 + Number(parts[1]) * 1_000 + Number(parts[2]) * 10;
    }
    return timeToMs(t);
  }

  // "PLACE FINALS ENTRY\n13 34.63 35.09" — grab first time after the header + place number.
  // \s+ matches newlines so this works even when OCR splits the header across lines.
  const placeBlock = rawText.match(/PLACE\s+FINALS\s+ENTRY\s+\d+\s+([\d:.]+)/i);
  if (placeBlock) {
    const ms = parseAnyTime(placeBlock[1]);
    if (ms > 5_000) return ms;
  }

  // "Total 3:04.78" or "Total 3:19:19" — split-screen with splits section
  const totalMatch = rawText.match(/Total\s+([\d:.]+)/i);
  if (totalMatch) {
    const ms = parseAnyTime(totalMatch[1]);
    if (ms > 5_000) return ms;
  }

  // Fallback: "FINALS\n34.63" — OCR split the column header from its value
  const finalsCol = rawText.match(/\bFINALS\b\s+([\d:.]+)/i);
  if (finalsCol) {
    const ms = parseAnyTime(finalsCol[1]);
    if (ms > 5_000 && ms < 1_800_000) return ms;
  }

  return 0;
}

// ── parseSplitsDirectly ───────────────────────────────────────────────────────
// Reads splits matching the actual OCR output pattern from Meet Mobile:
//
//   SPLITS
//   43.81            ← leg time
//   50 Free          ← label
//   43.81            ← cumulative time
//   4937             ← next leg (sometimes OCR drops the decimal: "4937" = "49.37")
//   100 Free
//   1:33.18
//   ...
//
// Strategy: find each "<dist> <stroke>" or "<dist> <stroke> Split" line, then
// take the time on the line BEFORE it as splitMs and the line AFTER as cumulativeMs.
// Handles OCR-dropped decimals ("4418" → "44.18", "4937" → "49.37").

function parseSplitsDirectly(rawText: string, finalMs: number): ParsedSplit[] {
  // ── Strategy: Cumulative-sequence extraction via DP ───────────────────────
  //
  //  1. Strip "X Stroke Split" rows and their noise times carefully
  //  2. Collect all standalone time values from SPLITS sections
  //  3. Detect target chain length from event distance (400 Free = 8 splits)
  //  4. Find the chain of EXACTLY that length ending nearest finalMs,
  //     with minimum leg-time variance as tiebreaker
  //  5. Generate labels mathematically

  function repairTimeToMs(s: string): number {
    const t = s.trim();
    if (/^\d{1,2}:\d{2}\.\d{2}$/.test(t)) {
      const [mm, rest] = t.split(":");
      const [sec, hun] = rest.split(".");
      return Number(mm) * 60_000 + Number(sec) * 1_000 + Number(hun) * 10;
    }
    if (/^\d{1,2}\.\d{2}$/.test(t)) {
      const [sec, hun] = t.split(".");
      return Number(sec) * 1_000 + Number(hun) * 10;
    }
    // OCR-dropped decimal e.g. "4937" → 49.37s
    if (/^\d{4}$/.test(t)) {
      const sec = Number(t.slice(0, 2));
      const hun = Number(t.slice(2));
      if (sec < 60 && hun < 100) return sec * 1_000 + hun * 10;
    }
    return 0;
  }

  const isTimeOnly = (s: string) =>
    /^(\d{1,2}[:.]\d{2}[:.]\d{2}|\d{1,2}\.\d{2}|\d{4})$/.test(s.trim());

  const isSplitLabel = (s: string) =>
    /\bsplit\b/i.test(s) && /\b(free|back|fly|butterfly|breast|backstroke|breaststroke)\b/i.test(s);

  const isValidLabel = (s: string) =>
    !isSplitLabel(s) &&
    /\b(free|back|fly|butterfly|breast|backstroke|breaststroke)\b/i.test(s) &&
    /\b\d+\b/.test(s);

  const rawLines = rawText.split("\n").map((l) => l.trim());

  // ── Step 1: Detect event distance for target chain length ─────────────────
  // 400 Free → 8 splits of 50m, 50 Fly SC → 2 splits of 25m, etc.
  const eventDistMatch = rawText.match(/\b(50|100|200|400|800|1500)\s*(meter|m)?\s*(free|freestyle|back|backstroke|fly|butterfly|breast|breaststroke|medley|im)\b/i);
  const eventDist = eventDistMatch ? Number(eventDistMatch[1]) : 0;
  // 50m events split at 25m (turn + finish); all others split every 50m
  const splitUnit = eventDist === 50 ? 25 : 50;
  const targetChainLength = eventDist > 0 ? eventDist / splitUnit : 0; // 0 = unconstrained

  // ── Step 2: Mark Split label lines and their noise times for removal ───────
  const removeIdx = new Set<number>();
  for (let i = 0; i < rawLines.length; i++) {
    if (!isSplitLabel(rawLines[i])) continue;
    removeIdx.add(i);
    if (i > 0 && isTimeOnly(rawLines[i - 1])) {
      const lineBeforeTime = rawLines[i - 2] ?? "";
      if (!isValidLabel(lineBeforeTime)) removeIdx.add(i - 1);
    }
    if (i < rawLines.length - 1 && isTimeOnly(rawLines[i + 1])) {
      const ms = repairTimeToMs(rawLines[i + 1]);
      if (ms > 60_000) removeIdx.add(i + 1);
    }
  }

  // ── Step 3: Collect time values from SPLITS sections ─────────────────────
  const collectedTimes: number[] = [];
  let inSplits = false;

  for (let i = 0; i < rawLines.length; i++) {
    if (removeIdx.has(i)) continue;
    const line = rawLines[i];
    if (!line) continue;
    if (
      /\bsplits?\b/i.test(line) &&
      !/\b(free|back|fly|breast|im)\b/i.test(line) &&
      !/\d{2,}/i.test(line)
    ) { inSplits = true; continue; }
    if (/\btotal\b/i.test(line)) { inSplits = false; continue; }
    if (!inSplits) continue;
    if (isTimeOnly(line)) {
      const ms = repairTimeToMs(line);
      if (ms > 0) collectedTimes.push(ms);
    }
  }

  if (collectedTimes.length === 0) return [];

  // ── Step 4: DP — keep ALL equal-length chains at each position ────────────
  // MIN_LEG is deliberately low (8s) to allow unusual splits like 13.14s
  // which can occur due to unusual pacing or OCR quirks.
  const MIN_LEG = 8_000;
  // 25m legs (50m SC events) can be ~15-18s; 50m legs should be ≥ 20s
  const MIN_FIRST = splitUnit === 25 ? 8_000 : 20_000;
  const MAX_LEG = 130_000; // 2m10s maximum
  const TOLERANCE = 5_000;

  const candidates = [...new Set(collectedTimes)]
    .filter((ms) => ms > 0 && ms <= finalMs + TOLERANCE)
    .sort((a, b) => a - b);

  const withFinal = [...new Set([...candidates, finalMs])].sort((a, b) => a - b);

  // 2D DP: dp[k][i] = best chain of length k ending at withFinal[i]
  // The anchor (first cumulative = 50m leg) is identified as the first time
  // collected from SPLITS sections that is plausibly a 50m leg (≥ MIN_FIRST,
  // ≤ 90s). This uses OCR order which reflects screenshot upload order.
  // Fallback: allow any start ≥ MIN_FIRST if no anchor found.
  const MAX_FIRST_LEG = 90_000; // 50m leg should be ≤ 90s
  let anchorMs = 0;
  for (const t of collectedTimes) {
    if (t >= MIN_FIRST && t <= MAX_FIRST_LEG) { anchorMs = t; break; }
  }

  const maxChainLen = targetChainLength > 0 ? targetChainLength : 20;
  const dp2d: (number[] | null)[][] = Array.from(
    { length: maxChainLen + 1 },
    () => Array(withFinal.length).fill(null)
  );

  // Length-1 chains: only start from the anchor (or any valid start if no anchor)
  for (let i = 0; i < withFinal.length; i++) {
    const isValidStart = anchorMs > 0
      ? withFinal[i] === anchorMs  // use the anchor
      : withFinal[i] >= MIN_FIRST; // fallback: any valid first leg
    if (isValidStart) dp2d[1][i] = [withFinal[i]];
  }

  function legVariance(chain: number[]): number {
    const legs = chain.map((cum, i) => (i === 0 ? cum : cum - chain[i - 1]));
    const mean = legs.reduce((a, b) => a + b, 0) / legs.length;
    return legs.reduce((a, b) => a + (b - mean) ** 2, 0) / legs.length;
  }

  function isBetter(candidate: number[], current: number[]): boolean {
    // Primary: smaller first element (= smaller 50m leg, most reliable anchor)
    if (candidate[0] !== current[0]) return candidate[0] < current[0];
    // Secondary: lower leg-time variance
    return legVariance(candidate) < legVariance(current);
  }

  for (let k = 2; k <= maxChainLen; k++) {
    for (let i = 0; i < withFinal.length; i++) {
      for (let j = 0; j < i; j++) {
        const leg = withFinal[i] - withFinal[j];
        if (leg < MIN_LEG || leg > MAX_LEG) continue;
        if (!dp2d[k - 1][j]) continue;
        const prevChain = dp2d[k - 1][j] as number[];
        const candidate = [...prevChain, withFinal[i]];
        const current = dp2d[k][i];
        if (!current || isBetter(candidate, current)) {
          dp2d[k][i] = candidate;
        }
      }
    }
  }

  // ── Step 5: Select best chain of target length ending near finalMs ─────────
  let best: number[] | null = null;

  // Try exact target length first
  const tryLength = (len: number) => {
    for (let i = 0; i < withFinal.length; i++) {
      if (Math.abs(withFinal[i] - finalMs) <= TOLERANCE && dp2d[len]?.[i]) {
        const c = dp2d[len][i]!;
        if (!best || isBetter(c, best)) best = c;
      }
    }
  };

  if (targetChainLength > 0) {
    tryLength(targetChainLength);
    // Fallback: try adjacent lengths if exact doesn't work
    if (!best) {
      for (let delta = 1; delta <= 3; delta++) {
        tryLength(targetChainLength - delta);
        tryLength(targetChainLength + delta);
        if (best) break;
      }
    }
  } else {
    // No target — use longest available
    for (let k = maxChainLen; k >= 1; k--) {
      tryLength(k);
      if (best) break;
    }
  }

  if (!best) return [];
  const bestChain = best as number[];

  // ── Step 6: Build splits with mathematical labels ─────────────────────────
  function strokeLabel(text: string): string {
    const t = text.toLowerCase();
    if (t.includes("butterfly") || / fly\b/i.test(t)) return "Fly";
    if (t.includes("backstroke") || / back\b/i.test(t)) return "Back";
    if (t.includes("breaststroke") || / breast\b/i.test(t)) return "Breast";
    return "Free";
  }
  const stroke = strokeLabel(rawText);

  return bestChain.map((cumMs, idx) => {
    const legMs = idx === 0 ? cumMs : cumMs - bestChain[idx - 1];
    const dist = (idx + 1) * splitUnit;
    return {
      label: `${dist} ${stroke}`,
      order: idx + 1,
      distance: dist,
      splitMs: legMs,
      cumulativeMs: cumMs,
    };
  });
}


function extractPlaceFromDetailScreen(rawText: string, lines: string[]): number | null {
  const m1 = rawText.match(/PLACE\s+FINALS\s+ENTRY[\r\n]+\s*(\d{1,3})\b/i);
  if (m1) { const p = Number(m1[1]); if (p >= 1 && p <= 999) return p; }

  const m2 = rawText.match(/\bfinals?\s+(\d{1,3})\s+\d+[:.]/i);
  if (m2) { const p = Number(m2[1]); if (p >= 1 && p <= 999) return p; }

  for (const line of lines) {
    const t = line.toLowerCase().replace(/[|()\[\]{}]/g, " ").trim();
    const m = t.match(/\bplace[: ]+(\d{1,3})\b/);
    if (m) { const p = Number(m[1]); if (p >= 1 && p <= 999) return p; }
  }

  return null;
}

function parseSingleSplitScreen(
  rawText: string,
  lines: string[],
  options: ParseOptions
): ParsedSwimResult[] {
  const globalCourse = detectCourse(rawText) || options.defaultCourse || "UNKNOWN";
  const swamAt = extractMeetDate(rawText);
  const meetName = guessMeetName(lines);
  const place = extractPlaceFromDetailScreen(rawText, lines);
  const resolvedName = guessNameFromLines(lines, options);

  const bestEventLine = lines.find(looksLikeNormalEventLine);
  if (!bestEventLine) return [];

  const bestEvent = buildEventFromLine(bestEventLine);
  if (!bestEvent) return [];

  let finalTimeMs = extractFinalTimeMs(rawText);

  if (finalTimeMs <= 0) {
    const finalsLine = lines.find((l) => /finals/i.test(l));
    if (finalsLine) {
      const idx = lines.indexOf(finalsLine);
      const nextLine = lines[idx + 1] ?? "";
      const times = extractAllTimes(nextLine);
      if (times.length >= 1) finalTimeMs = timeToMs(times[0]);
    }
  }

  if (finalTimeMs <= 0 || finalTimeMs > 1_800_000) return [];

  const finalTimeStr = msToTime(finalTimeMs);

  const splits = parseSplitsDirectly(rawText, finalTimeMs);

  const correctedCourse = inferCourseFromSplits(globalCourse, bestEvent.distance, splits);

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
      timeStr: msToTime(timeMs),
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

  // (400 IM was previously rejected outright — removing that block since the
  // new parseSplitsDirectly handles all IM events including 400 IM correctly.)

  // Collapse ALL whitespace before checking for swim detail screen signals.
  // PSM 12 sparse-text mode often splits "PLACE FINALS ENTRY" across separate
  // lines ("PLACE" / "FINALS" / "ENTRY"), so a per-line check silently fails.
  // Collapsing first is the same technique isEventResultsPage already uses.
  const flatRaw = rawText.replace(/\s+/g, " ").toUpperCase();
  const isSwimDetailScreen =
    flatRaw.includes("PLACE FINALS ENTRY") ||
    flatRaw.includes("SWIM DETAIL");

  const results = (isSplitScreen(lines) || isSwimDetailScreen)
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