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

const IM_ORDER: Array<{
  distance: number;
  stroke: StrokeKey;
  labelRegex: RegExp;
}> = [
  { distance: 50, stroke: "FLY", labelRegex: /\b50\b.*\b(fly|butterfly)\b/i },
  { distance: 100, stroke: "BACK", labelRegex: /\b100\b.*\bback\b/i },
  { distance: 150, stroke: "BREAST", labelRegex: /\b150\b.*\b(breast|breaststroke)\b/i },
  { distance: 200, stroke: "FREE", labelRegex: /\b200\b.*\b(free|freestyle)\b/i },
];

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

  // common OCR start-char issue: D08.10 => 108.10
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

  // 10810 => 1:08.10, 31432 => 3:14.32
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
  if (/\b200\s*(meter|m)?\s*im\b/i.test(text)) return "200 IM";
  if (/\b200\s*(meter|m)?\s*individual\s*medley\b/i.test(text)) return "200 IM";
  return null;
}

function extractTotalMs(lines: string[]): number | null {
  for (const line of lines) {
    if (!/\b(total|final)\b/i.test(line)) continue;

    const tokens = extractLikelyTimeTokens(line);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const ms = timeStringToMs(tokens[i]);
      if (ms != null && ms >= 120000 && ms <= 300000) {
        return ms;
      }
    }
  }

  for (const line of lines) {
    const tokens = extractLikelyTimeTokens(line);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const ms = timeStringToMs(tokens[i]);
      if (ms != null && ms >= 120000 && ms <= 300000) {
        return ms;
      }
    }
  }

  return null;
}

function pickReasonableLegToken(tokens: string[]): number | null {
  const parsed = tokens
    .map((token) => timeStringToMs(token))
    .filter((ms): ms is number => ms != null);

  // 200 IM 50-leg ranges; broad but not absurd
  const reasonable = parsed.filter((ms) => ms >= 15000 && ms <= 90000);

  if (reasonable.length === 0) return null;

  // prefer shorter token as leg split, not total/cumulative
  return reasonable[0];
}

function pickReasonableCumulativeToken(tokens: string[]): number | null {
  const parsed = tokens
    .map((token) => timeStringToMs(token))
    .filter((ms): ms is number => ms != null);

  if (parsed.length === 0) return null;

  // prefer the largest number on/near the line as cumulative
  return parsed.sort((a, b) => b - a)[0];
}

function isReasonableLegForIndex(ms: number | null, legIndex: number): boolean {
  if (ms == null) return false;

  const ranges: Array<[number, number]> = [
    [20000, 70000], // fly
    [20000, 80000], // back
    [25000, 90000], // breast
    [20000, 80000], // free
  ];

  const [min, max] = ranges[legIndex] ?? [15000, 120000];
  return ms >= min && ms <= max;
}

function isReasonableCumulativeForIndex(ms: number | null, legIndex: number): boolean {
  if (ms == null) return false;

  const ranges: Array<[number, number]> = [
    [20000, 70000],   // 50
    [50000, 140000],  // 100
    [80000, 210000],  // 150
    [120000, 300000], // 200
  ];

  const [min, max] = ranges[legIndex] ?? [15000, 300000];
  return ms >= min && ms <= max;
}

function buildCandidate(
  line: string,
  prevLine?: string,
  nextLine?: string,
  distance?: number,
  stroke?: StrokeKey
): SplitCandidate {
  const sameTokens = extractLikelyTimeTokens(line);
  const prevTokens = prevLine ? extractLikelyTimeTokens(prevLine) : [];
  const nextTokens = nextLine ? extractLikelyTimeTokens(nextLine) : [];

  const legMs =
    pickReasonableLegToken(prevTokens) ??
    pickReasonableLegToken(sameTokens) ??
    pickReasonableLegToken(nextTokens);

  const cumulativeMs =
    pickReasonableCumulativeToken(sameTokens) ??
    pickReasonableCumulativeToken(nextTokens) ??
    pickReasonableCumulativeToken(prevTokens);

  return {
    distance: distance ?? 0,
    stroke: stroke ?? "FREE",
    rawLine: line,
    legMs,
    cumulativeMs,
  };
}

function computeCumulativesFromLegs(legs: Array<number | null>, totalMs: number | null) {
  const cumulatives: Array<number | null> = [];
  let running = 0;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg == null) {
      cumulatives.push(null);
      continue;
    }

    running += leg;
    cumulatives.push(running);
  }

  if (totalMs != null && cumulatives[3] != null) {
    const last = cumulatives[3];
    if (last != null && Math.abs(last - totalMs) > 8000) {
      return null;
    }
  }

  return cumulatives;
}

function computeLegsFromCumulatives(cumulatives: Array<number | null>, totalMs: number | null) {
  const finalCumulatives = [...cumulatives];
  if (finalCumulatives[3] == null && totalMs != null) {
    finalCumulatives[3] = totalMs;
  }

  const legs: Array<number | null> = [];

  for (let i = 0; i < finalCumulatives.length; i++) {
    const current = finalCumulatives[i];
    if (current == null) {
      legs.push(null);
      continue;
    }

    if (i === 0) {
      legs.push(current);
      continue;
    }

    const prev = finalCumulatives[i - 1];
    if (prev != null && current > prev) {
      legs.push(current - prev);
    } else {
      legs.push(null);
    }
  }

  return {
    legs,
    cumulatives: finalCumulatives,
  };
}

function scoreLegPlan(legs: Array<number | null>, totalMs: number | null): number {
  let score = 0;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg == null) continue;
    count += 1;
    sum += leg;

    if (isReasonableLegForIndex(leg, i)) score += 3;
    else score -= 4;
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

function scoreCumulativePlan(cumulatives: Array<number | null>, legs: Array<number | null>, totalMs: number | null): number {
  let score = 0;
  let prev: number | null = null;

  for (let i = 0; i < cumulatives.length; i++) {
    const cur = cumulatives[i];
    if (cur == null) continue;

    if (isReasonableCumulativeForIndex(cur, i)) score += 2;
    else score -= 3;

    if (prev != null && cur > prev) score += 1;
    if (prev != null && cur <= prev) score -= 4;

    prev = cur;
  }

  score += scoreLegPlan(legs, totalMs);

  return score;
}

function chooseBestPlan(candidates: SplitCandidate[], totalMs: number | null) {
  const legOnly: Array<number | null> = candidates.map((c) => c.legMs);
  const cumulativeOnly: Array<number | null> = candidates.map((c) => c.cumulativeMs);

  const legOnlyCumulatives = computeCumulativesFromLegs(legOnly, totalMs);
  const legOnlyScore =
    legOnlyCumulatives == null ? -999 : scoreCumulativePlan(legOnlyCumulatives, legOnly, totalMs);

  const cumulativePlan = computeLegsFromCumulatives(cumulativeOnly, totalMs);
  const cumulativeScore = scoreCumulativePlan(
    cumulativePlan.cumulatives,
    cumulativePlan.legs,
    totalMs
  );

  if (legOnlyScore >= cumulativeScore && legOnlyCumulatives != null) {
    return {
      source: "legs" as const,
      legs: legOnly,
      cumulatives: legOnlyCumulatives,
    };
  }

  return {
    source: "cumulatives" as const,
    legs: cumulativePlan.legs,
    cumulatives: cumulativePlan.cumulatives,
  };
}

export function parse200IMSplitsFromOCR(rawText: string): OCRSplitParseResult {
  const text = normalizeOCRText(rawText);
  const lines = text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const warnings: string[] = [];
  const eventName = detectEventName(text);
  const totalMs = extractTotalMs(lines);

  const candidates: SplitCandidate[] = IM_ORDER.map((item) => ({
    distance: item.distance,
    stroke: item.stroke,
    rawLine: "",
    legMs: null,
    cumulativeMs: null,
  }));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = lines[i - 1];
    const nextLine = lines[i + 1];

    for (let j = 0; j < IM_ORDER.length; j++) {
      const target = IM_ORDER[j];
      if (!target.labelRegex.test(line)) continue;

      candidates[j] = buildCandidate(
        line,
        prevLine,
        nextLine,
        target.distance,
        target.stroke
      );
    }
  }

  if (totalMs == null) {
    warnings.push("Total race time was not confidently detected.");
  }

  const plan = chooseBestPlan(candidates, totalMs);

  if (plan.source === "legs") {
    warnings.push("Using direct leg split OCR reconstruction.");
  } else {
    warnings.push("Using cumulative OCR reconstruction.");
  }

  const splits: OCRSplit[] = IM_ORDER.map((item, index) => ({
    distance: item.distance,
    stroke: item.stroke,
    cumulativeLabel: `${item.distance} ${item.stroke}`,
    cumulativeMs: plan.cumulatives[index] ?? null,
    splitMs: plan.legs[index] ?? null,
    rawLine: candidates[index]?.rawLine ?? "",
  }));

  for (let i = 0; i < splits.length; i++) {
    if (splits[i].splitMs != null && !isReasonableLegForIndex(splits[i].splitMs, i)) {
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

  return {
    eventName,
    totalMs,
    splits,
    warnings,
    confidence,
  };
}

export function formatParsed200IMSplits(result: OCRSplitParseResult) {
  return {
    event: result.eventName ?? "200 IM",
    total: msToTime(result.totalMs),
    splits: result.splits.map((s) => ({
      distance: s.distance,
      stroke: s.stroke,
      cumulative: msToTime(s.cumulativeMs),
      split: msToTime(s.splitMs),
      rawLine: s.rawLine,
    })),
    confidence: result.confidence,
    warnings: result.warnings,
  };
}