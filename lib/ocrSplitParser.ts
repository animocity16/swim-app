export type OCRSplit = {
  distance: number;
  stroke: "FLY" | "BACK" | "BREAST" | "FREE";
  cumulativeLabel: string | null;
  cumulativeMs: number | null;
  splitMs: number | null;
  rawLine: string;
};

export type OCRSplitParseResult = {
  eventName: string | null;
  totalMs: number | null;
  splits: OCRSplit[];
  warnings: string[];
  confidence: number;
};

type StrokeKey = OCRSplit["stroke"];

type SplitCandidate = {
  distance: number;
  stroke: StrokeKey;
  rawLine: string;
  legMs: number | null;
  cumulativeMs: number | null;
};

// ─── 200 IM leg order (50m per leg) ──────────────────────────────────────────
const IM_ORDER_200: Array<{
  distance: number;
  stroke: StrokeKey;
  labelRegex: RegExp;
}> = [
  { distance: 50,  stroke: "FLY",   labelRegex: /\b50\b.*\b(fly|butterfly)\b/i },
  { distance: 100, stroke: "BACK",  labelRegex: /\b100\b.*\bback\b/i },
  { distance: 150, stroke: "BREAST",labelRegex: /\b150\b.*\b(breast|breaststroke)\b/i },
  { distance: 200, stroke: "FREE",  labelRegex: /\b200\b.*\b(free|freestyle)\b/i },
];



// ─── 400 IM leg order (100m per leg) ─────────────────────────────────────────
const IM_ORDER_400: Array<{
  distance: number;
  stroke: StrokeKey;
  labelRegex: RegExp;
}> = [
  { distance: 100, stroke: "FLY",   labelRegex: /\b100\b.*\b(fly|butterfly)\b/i },
  { distance: 200, stroke: "BACK",  labelRegex: /\b200\b.*\bback\b/i },
  { distance: 300, stroke: "BREAST",labelRegex: /\b300\b.*\b(breast|breaststroke)\b/i },
  { distance: 400, stroke: "FREE",  labelRegex: /\b400\b.*\b(free|freestyle)\b/i },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function normalizeOCRText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[()<>]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTimeToken(raw: string): string {
  let s = raw.trim();
  s = s.replace(/[OoQ]/g, "0");
  s = s.replace(/[Il]/g, "1");
  s = s.replace(/[Ss]/g, "5");
  s = s.replace(/[Bb]/g, "8");
  s = s.replace(/^[Dd]/, "1");
  s = s.replace(/[^0-9:.]/g, "");
  return s;
}

function timeStringToMs(raw: string): number | null {
  const s = normalizeTimeToken(raw);
  if (!s) return null;

  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length !== 2) return null;
    const min = Number(parts[0]);
    const sec = Number(parts[1]);
    if (Number.isNaN(min) || Number.isNaN(sec)) return null;
    return Math.round((min * 60 + sec) * 1000);
  }

  // 4292 => 42.92
  if (/^\d{4}$/.test(s)) {
    const sec = Number(`${s.slice(0, 2)}.${s.slice(2)}`);
    if (Number.isNaN(sec)) return null;
    return Math.round(sec * 1000);
  }

  // 10810 => 1:08.10
  if (/^\d{5}$/.test(s)) {
    const minDigits = s.length - 4;
    const min = Number(s.slice(0, minDigits));
    const sec = Number(`${s.slice(minDigits, minDigits + 2)}.${s.slice(minDigits + 2)}`);
    if (Number.isNaN(min) || Number.isNaN(sec)) return null;
    return Math.round((min * 60 + sec) * 1000);
  }

  // 55.85
  if (/^\d{1,2}\.\d{1,2}$/.test(s)) {
    const sec = Number(s);
    if (Number.isNaN(sec)) return null;
    return Math.round(sec * 1000);
  }

  // 108.10 => 1:08.10
  if (/^\d{3}\.\d{1,2}$/.test(s)) {
    const min = Number(s[0]);
    const sec = Number(s.slice(1));
    if (Number.isNaN(min) || Number.isNaN(sec)) return null;
    return Math.round((min * 60 + sec) * 1000);
  }

  return null;
}

function msToTime(ms: number | null): string {
  if (ms == null || Number.isNaN(ms)) return "-";
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

function extractLikelyTimeTokens(line: string): string[] {
  return line.match(/\b[0-9OoQIlSsBbDd:.]{4,8}\b/g)?.map((x) => x.trim()) ?? [];
}

function detectEventName(text: string): string | null {
  if (/\b400\s*(meter|m)?\s*im\b/i.test(text)) return "400 IM";
  if (/\b400\s*(meter|m)?\s*individual\s*medley\b/i.test(text)) return "400 IM";
  if (/\b200\s*(meter|m)?\s*im\b/i.test(text)) return "200 IM";
  if (/\b200\s*(meter|m)?\s*individual\s*medley\b/i.test(text)) return "200 IM";
  return null;
}

// ─── 200 IM total time: 1:40 – 5:00 (100000–300000ms) ───────────────────────
function extractTotalMs200(lines: string[]): number | null {
  for (const line of lines) {
    if (!/\b(total|final)\b/i.test(line)) continue;
    const tokens = extractLikelyTimeTokens(line);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const ms = timeStringToMs(tokens[i]);
      if (ms != null && ms >= 100000 && ms <= 300000) return ms;
    }
  }
  for (const line of lines) {
    const tokens = extractLikelyTimeTokens(line);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const ms = timeStringToMs(tokens[i]);
      if (ms != null && ms >= 100000 && ms <= 300000) return ms;
    }
  }
  return null;
}

// ─── 400 IM total time: 3:40 – 10:00 (220000–600000ms) ──────────────────────
function extractTotalMs400(lines: string[]): number | null {
  for (const line of lines) {
    if (!/\b(total|final)\b/i.test(line)) continue;
    const tokens = extractLikelyTimeTokens(line);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const ms = timeStringToMs(tokens[i]);
      if (ms != null && ms >= 220000 && ms <= 600000) return ms;
    }
  }
  for (const line of lines) {
    const tokens = extractLikelyTimeTokens(line);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const ms = timeStringToMs(tokens[i]);
      if (ms != null && ms >= 220000 && ms <= 600000) return ms;
    }
  }
  return null;
}



function pickReasonableLegToken(tokens: string[], minMs: number, maxMs: number): number | null {
  const parsed = tokens
    .map((token) => timeStringToMs(token))
    .filter((ms): ms is number => ms != null);
  const reasonable = parsed.filter((ms) => ms >= minMs && ms <= maxMs);
  if (reasonable.length === 0) return null;
  return reasonable[0];
}

function pickReasonableCumulativeToken(tokens: string[]): number | null {
  const parsed = tokens
    .map((token) => timeStringToMs(token))
    .filter((ms): ms is number => ms != null);
  if (parsed.length === 0) return null;
  return parsed.sort((a, b) => b - a)[0];
}

// ─── 200 IM leg reasonableness (50m legs) ────────────────────────────────────
function isReasonableLegForIndex200(ms: number | null, legIndex: number): boolean {
  if (ms == null) return false;
  const ranges: Array<[number, number]> = [
    [20000, 70000], // fly 50m
    [20000, 80000], // back 50m
    [25000, 90000], // breast 50m
    [20000, 80000], // free 50m
  ];
  const [min, max] = ranges[legIndex] ?? [15000, 120000];
  return ms >= min && ms <= max;
}



// ─── 400 IM leg reasonableness (100m legs) ───────────────────────────────────
function isReasonableLegForIndex400(ms: number | null, legIndex: number): boolean {
  if (ms == null) return false;
  const ranges: Array<[number, number]> = [
    [45000, 130000], // fly 100m
    [50000, 140000], // back 100m
    [60000, 160000], // breast 100m
    [45000, 130000], // free 100m
  ];
  const [min, max] = ranges[legIndex] ?? [40000, 180000];
  return ms >= min && ms <= max;
}

function isReasonableCumulativeForIndex200(ms: number | null, legIndex: number): boolean {
  if (ms == null) return false;
  const ranges: Array<[number, number]> = [
    [20000,  70000],  // 50
    [50000, 140000],  // 100
    [80000, 210000],  // 150
   [120000, 300000],  // 200
  ];
  const [min, max] = ranges[legIndex] ?? [15000, 300000];
  return ms >= min && ms <= max;
}

function isReasonableCumulativeForIndex400(ms: number | null, legIndex: number): boolean {
  if (ms == null) return false;
  const ranges: Array<[number, number]> = [
    [ 45000, 130000], // 100
    [100000, 260000], // 200
    [160000, 400000], // 300
    [220000, 600000], // 400
  ];
  const [min, max] = ranges[legIndex] ?? [40000, 600000];
  return ms >= min && ms <= max;
}

function buildCandidate(
  line: string,
  prevLine: string | undefined,
  nextLine: string | undefined,
  distance: number,
  stroke: StrokeKey,
  legMin: number,
  legMax: number
): SplitCandidate {
  const sameTokens = extractLikelyTimeTokens(line);
  const prevTokens = prevLine ? extractLikelyTimeTokens(prevLine) : [];
  const nextTokens = nextLine ? extractLikelyTimeTokens(nextLine) : [];

  const legMs =
    pickReasonableLegToken(prevTokens, legMin, legMax) ??
    pickReasonableLegToken(sameTokens, legMin, legMax) ??
    pickReasonableLegToken(nextTokens, legMin, legMax);

  const cumulativeMs =
    pickReasonableCumulativeToken(sameTokens) ??
    pickReasonableCumulativeToken(nextTokens) ??
    pickReasonableCumulativeToken(prevTokens);

  return { distance, stroke, rawLine: line, legMs, cumulativeMs };
}

function computeCumulativesFromLegs(legs: Array<number | null>, totalMs: number | null, tolerance: number) {
  const cumulatives: Array<number | null> = [];
  let running = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg == null) { cumulatives.push(null); continue; }
    running += leg;
    cumulatives.push(running);
  }
  const last = cumulatives[cumulatives.length - 1];
  if (totalMs != null && last != null && Math.abs(last - totalMs) > tolerance) return null;
  return cumulatives;
}

function computeLegsFromCumulatives(cumulatives: Array<number | null>, totalMs: number | null) {
  const finalCumulatives = [...cumulatives];
  if (finalCumulatives[finalCumulatives.length - 1] == null && totalMs != null) {
    finalCumulatives[finalCumulatives.length - 1] = totalMs;
  }
  const legs: Array<number | null> = [];
  for (let i = 0; i < finalCumulatives.length; i++) {
    const current = finalCumulatives[i];
    if (current == null) { legs.push(null); continue; }
    if (i === 0) { legs.push(current); continue; }
    const prev = finalCumulatives[i - 1];
    legs.push(prev != null && current > prev ? current - prev : null);
  }
  return { legs, cumulatives: finalCumulatives };
}

function scoreLegPlan200(legs: Array<number | null>, totalMs: number | null): number {
  let score = 0; let sum = 0; let count = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg == null) continue;
    count++; sum += leg;
    if (isReasonableLegForIndex200(leg, i)) score += 3; else score -= 4;
  }
  if (count === 4) score += 4;
  if (count >= 3) score += 2;
  if (totalMs != null && count > 0) {
    const diff = Math.abs(sum - totalMs);
    if (diff <= 4000) score += 6;
    else if (diff <= 8000) score += 3;
    else if (diff <= 15000) score += 1;
    else score -= 5;
  }
  return score;
}

function scoreLegPlan400(legs: Array<number | null>, totalMs: number | null): number {
  let score = 0; let sum = 0; let count = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg == null) continue;
    count++; sum += leg;
    if (isReasonableLegForIndex400(leg, i)) score += 3; else score -= 4;
  }
  if (count === 4) score += 4;
  if (count >= 3) score += 2;
  if (totalMs != null && count > 0) {
    const diff = Math.abs(sum - totalMs);
    if (diff <= 8000) score += 6;
    else if (diff <= 15000) score += 3;
    else if (diff <= 25000) score += 1;
    else score -= 5;
  }
  return score;
}

function scoreCumulativePlan200(cumulatives: Array<number | null>, legs: Array<number | null>, totalMs: number | null): number {
  let score = 0; let prev: number | null = null;
  for (let i = 0; i < cumulatives.length; i++) {
    const cur = cumulatives[i];
    if (cur == null) continue;
    if (isReasonableCumulativeForIndex200(cur, i)) score += 2; else score -= 3;
    if (prev != null && cur > prev) score += 1;
    if (prev != null && cur <= prev) score -= 4;
    prev = cur;
  }
  score += scoreLegPlan200(legs, totalMs);
  return score;
}

function scoreCumulativePlan400(cumulatives: Array<number | null>, legs: Array<number | null>, totalMs: number | null): number {
  let score = 0; let prev: number | null = null;
  for (let i = 0; i < cumulatives.length; i++) {
    const cur = cumulatives[i];
    if (cur == null) continue;
    if (isReasonableCumulativeForIndex400(cur, i)) score += 2; else score -= 3;
    if (prev != null && cur > prev) score += 1;
    if (prev != null && cur <= prev) score -= 4;
    prev = cur;
  }
  score += scoreLegPlan400(legs, totalMs);
  return score;
}

function chooseBestPlan200(candidates: SplitCandidate[], totalMs: number | null) {
  const legOnly = candidates.map((c) => c.legMs);
  const cumulativeOnly = candidates.map((c) => c.cumulativeMs);
  const legOnlyCumulatives = computeCumulativesFromLegs(legOnly, totalMs, 15000);
  const legOnlyScore = legOnlyCumulatives == null ? -999 : scoreCumulativePlan200(legOnlyCumulatives, legOnly, totalMs);
  const cumulativePlan = computeLegsFromCumulatives(cumulativeOnly, totalMs);
  const cumulativeScore = scoreCumulativePlan200(cumulativePlan.cumulatives, cumulativePlan.legs, totalMs);
  if (legOnlyScore >= cumulativeScore && legOnlyCumulatives != null) {
    return { source: "legs" as const, legs: legOnly, cumulatives: legOnlyCumulatives };
  }
  return { source: "cumulatives" as const, legs: cumulativePlan.legs, cumulatives: cumulativePlan.cumulatives };
}

function chooseBestPlan400(candidates: SplitCandidate[], totalMs: number | null) {
  const legOnly = candidates.map((c) => c.legMs);
  const cumulativeOnly = candidates.map((c) => c.cumulativeMs);
  const legOnlyCumulatives = computeCumulativesFromLegs(legOnly, totalMs, 25000);
  const legOnlyScore = legOnlyCumulatives == null ? -999 : scoreCumulativePlan400(legOnlyCumulatives, legOnly, totalMs);
  const cumulativePlan = computeLegsFromCumulatives(cumulativeOnly, totalMs);
  const cumulativeScore = scoreCumulativePlan400(cumulativePlan.cumulatives, cumulativePlan.legs, totalMs);
  if (legOnlyScore >= cumulativeScore && legOnlyCumulatives != null) {
    return { source: "legs" as const, legs: legOnly, cumulatives: legOnlyCumulatives };
  }
  return { source: "cumulatives" as const, legs: cumulativePlan.legs, cumulatives: cumulativePlan.cumulatives };
}

// ─── 200 IM parser ────────────────────────────────────────────────────────────

export function parse200IMSplitsFromOCR(rawText: string): OCRSplitParseResult {
  const text = normalizeOCRText(rawText);
  const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const warnings: string[] = [];
  const eventName = detectEventName(text);
  const totalMs = extractTotalMs200(lines);

  const candidates: SplitCandidate[] = IM_ORDER_200.map((item) => ({
    distance: item.distance, stroke: item.stroke, rawLine: "", legMs: null, cumulativeMs: null,
  }));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < IM_ORDER_200.length; j++) {
      const target = IM_ORDER_200[j];
      if (!target.labelRegex.test(line)) continue;
      candidates[j] = buildCandidate(line, lines[i - 1], lines[i + 1], target.distance, target.stroke, 15000, 90000);
    }
  }

  if (totalMs == null) warnings.push("Total race time was not confidently detected.");

  const plan = chooseBestPlan200(candidates, totalMs);
  plan.source === "legs"
    ? warnings.push("Using direct leg split OCR reconstruction.")
    : warnings.push("Using cumulative OCR reconstruction.");

  const splits: OCRSplit[] = IM_ORDER_200.map((item, index) => ({
    distance: item.distance,
    stroke: item.stroke,
    cumulativeLabel: `${item.distance} ${item.stroke}`,
    cumulativeMs: plan.cumulatives[index] ?? null,
    splitMs: plan.legs[index] ?? null,
    rawLine: candidates[index]?.rawLine ?? "",
  }));

  for (let i = 0; i < splits.length; i++) {
    if (splits[i].splitMs != null && !isReasonableLegForIndex200(splits[i].splitMs, i)) {
      warnings.push(`Split at ${splits[i].distance}m looks unusual.`);
    }
  }

  let confidence = 0;
  if (eventName === "200 IM") confidence += 2;
  if (totalMs != null) confidence += 2;
  confidence += splits.filter((s) => s.splitMs != null).length;
  confidence += splits.filter((s) => s.cumulativeMs != null).length;
  confidence -= Math.min(warnings.length, 3);
  if (confidence < 0) confidence = 0;
  if (confidence > 10) confidence = 10;

  return { eventName, totalMs, splits, warnings, confidence };
}

// ─── 400 IM parser ────────────────────────────────────────────────────────────

export function parse400IMSplitsFromOCR(rawText: string): OCRSplitParseResult {
  const text = normalizeOCRText(rawText);
  const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const warnings: string[] = [];
  const eventName = detectEventName(text);
  const totalMs = extractTotalMs400(lines);

  const candidates: SplitCandidate[] = IM_ORDER_400.map((item) => ({
    distance: item.distance, stroke: item.stroke, rawLine: "", legMs: null, cumulativeMs: null,
  }));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < IM_ORDER_400.length; j++) {
      const target = IM_ORDER_400[j];
      if (!target.labelRegex.test(line)) continue;
      candidates[j] = buildCandidate(line, lines[i - 1], lines[i + 1], target.distance, target.stroke, 40000, 180000);
    }
  }

  if (totalMs == null) warnings.push("Total race time was not confidently detected.");

  const plan = chooseBestPlan400(candidates, totalMs);
  plan.source === "legs"
    ? warnings.push("Using direct leg split OCR reconstruction.")
    : warnings.push("Using cumulative OCR reconstruction.");

  const splits: OCRSplit[] = IM_ORDER_400.map((item, index) => ({
    distance: item.distance,
    stroke: item.stroke,
    cumulativeLabel: `${item.distance} ${item.stroke}`,
    cumulativeMs: plan.cumulatives[index] ?? null,
    splitMs: plan.legs[index] ?? null,
    rawLine: candidates[index]?.rawLine ?? "",
  }));

  for (let i = 0; i < splits.length; i++) {
    if (splits[i].splitMs != null && !isReasonableLegForIndex400(splits[i].splitMs, i)) {
      warnings.push(`Split at ${splits[i].distance}m looks unusual.`);
    }
  }

  let confidence = 0;
  if (eventName === "400 IM") confidence += 2;
  if (totalMs != null) confidence += 2;
  confidence += splits.filter((s) => s.splitMs != null).length;
  confidence += splits.filter((s) => s.cumulativeMs != null).length;
  confidence -= Math.min(warnings.length, 3);
  if (confidence < 0) confidence = 0;
  if (confidence > 10) confidence = 10;

  return { eventName, totalMs, splits, warnings, confidence };
}

export function formatParsed200IMSplits(result: OCRSplitParseResult) {
  return {
    event: result.eventName ?? "200 IM",
    total: msToTime(result.totalMs),
    splits: result.splits.map((s) => ({
      distance: s.distance, stroke: s.stroke,
      cumulative: msToTime(s.cumulativeMs), split: msToTime(s.splitMs), rawLine: s.rawLine,
    })),
    confidence: result.confidence,
    warnings: result.warnings,
  };
}