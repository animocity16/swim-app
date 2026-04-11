import { supabase } from "./supabaseClient";
import { parseSwimOCRText } from "./ocrMultiEventParser";
import { parse200IMSplitsFromOCR } from "./ocrSplitParser";
import { parse400IMSplitsFromOCR } from "./parse400IMSplits";
import { canonicalCourse, canonicalEventName } from "./events";

type AnyParsedResult = {
  swimmerName?: string;
  name?: string;
  age?: number | string | null;
  club?: string | null;
  event?: string | null;
  course?: string | null;
  timeMs?: number | string | null;
  time_ms?: number | string | null;
  swamAt?: string | null;
  swam_at?: string | null;
  meetName?: string | null;
  meet_name?: string | null;
  place?: number | string | null;
  confidence?: number | null;
  splits?: Array<{
    label: string;
    order: number;
    distance: number | null;
    splitMs: number;
    cumulativeMs?: number | null;
  }>;
};

type ParsedSplitRow = {
  label: string;
  order: number;
  distance: number;
  splitMs: number;
  cumulativeMs: number | null;
};

export type OCRFlowResult = {
  parsedResults: AnyParsedResult[];
  savedCount: number;
  splitSavedCount: number;
  errors: string[];
  waitingForSecondShot?: boolean;
};

type ParseAndSaveOptions = {
  swimmerId: number;
  swimmerName: string;
  defaultCourse?: string;
};

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getSwimmerName(result: AnyParsedResult, fallbackName: string): string {
  return String(result.swimmerName || result.name || fallbackName || "").trim();
}

function getTimeMs(result: AnyParsedResult): number | null {
  return safeNumber(result.timeMs ?? result.time_ms);
}

function getSwamAt(result: AnyParsedResult): string | null {
  const value = result.swamAt || result.swam_at || null;
  return typeof value === "string" ? value.trim() : null;
}

function getMeetName(result: AnyParsedResult): string | null {
  const value = result.meetName || result.meet_name || null;
  return typeof value === "string" ? value.trim() : null;
}

function normalizeEventName(eventName: string | null | undefined): string {
  return canonicalEventName(String(eventName || "").trim());
}

function normalizeCourseName(
  course: string | null | undefined,
  fallback = "LCM"
): string {
  return canonicalCourse(String(course || fallback || "").trim());
}

function is200IMEvent(eventName: string): boolean {
  const e = eventName.toUpperCase();
  return e.includes("200") && (e.includes("IM") || e.includes("INDIVIDUAL MEDLEY"));
}

function is400IMEvent(eventName: string): boolean {
  const e = eventName.toUpperCase();
  return e.includes("400") && (e.includes("IM") || e.includes("INDIVIDUAL MEDLEY"));
}

function timeStrToMs(raw: string): number | null {
  const s = raw.trim().replace(/[OoQ]/g, "0").replace(/[Il]/g, "1");
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length !== 2) return null;
    const min = Number(parts[0]);
    const sec = Number(parts[1]);
    if (isNaN(min) || isNaN(sec)) return null;
    return Math.round((min * 60 + sec) * 1000);
  }
  if (/^\d{4}$/.test(s)) {
    const sec = Number(`${s.slice(0, 2)}.${s.slice(2)}`);
    return isNaN(sec) ? null : Math.round(sec * 1000);
  }
  if (/^\d{5}$/.test(s)) {
    const min = Number(s.slice(0, 1));
    const sec = Number(`${s.slice(1, 3)}.${s.slice(3)}`);
    if (isNaN(min) || isNaN(sec)) return null;
    return Math.round((min * 60 + sec) * 1000);
  }
  if (/^\d{3}\.\d{1,2}$/.test(s)) {
    const min = Number(s[0]);
    const sec = Number(s.slice(1));
    if (isNaN(min) || isNaN(sec)) return null;
    return Math.round((min * 60 + sec) * 1000);
  }
  const sec = Number(s);
  return isNaN(sec) ? null : Math.round(sec * 1000);
}

function ordinalSplitLabel(position: number): string {
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  const suffix = suffixes[position] ?? "th";
  return `${position}${suffix} 50`;
}

// ✅ Max reasonable times per distance (ms) — rejects clock times like "4:07 PM"
// Even the slowest age-group swimmer won't exceed these
const MAX_TIME_BY_DISTANCE: Record<number, number> = {
  50: 120_000,    // 2 minutes
  100: 240_000,   // 4 minutes
  200: 480_000,   // 8 minutes
  400: 960_000,   // 16 minutes
  800: 1_800_000, // 30 minutes
  1500: 3_600_000, // 60 minutes
};

const MIN_TIME_BY_DISTANCE: Record<number, number> = {
  50: 20_000,   // 20 seconds
  100: 40_000,  // 40 seconds
  200: 80_000,  // 80 seconds
  400: 200_000, // ~3:20
  800: 450_000, // ~7:30
  1500: 900_000, // ~15:00
};

function isReasonableSwimTime(distanceM: number, timeMs: number): boolean {
  const max = MAX_TIME_BY_DISTANCE[distanceM] ?? 3_600_000;
  const min = MIN_TIME_BY_DISTANCE[distanceM] ?? 0;
  return timeMs >= min && timeMs <= max;
}

function parseGenericSplits(
  rawOCRText: string,
  eventDistance: number,
  strokeKeyword: string,
  totalMs?: number | null
): ParsedSplitRow[] {
  const lines = rawOCRText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const expectedDistances: number[] = [];
  for (let d = 50; d <= eventDistance; d += 50) {
    expectedDistances.push(d);
  }

  const strokeRegex = new RegExp(strokeKeyword, "i");
  const cumulativeByDist = new Map<number, number>();
  let pendingMs: number | null = null;

  for (const line of lines) {
    if (/total|split|summary|entry|event/i.test(line)) {
      pendingMs = null;
      continue;
    }

    // ✅ Skip clock times — lines containing AM or PM
    if (/\b(am|pm)\b/i.test(line)) {
      pendingMs = null;
      continue;
    }

    const isStandalone =
      /^\d{1,2}\.\d{2}$/.test(line) ||
      /^\d{1,2}:\d{2}\.\d{2}$/.test(line) ||
      /^\d{4}$/.test(line);

    if (isStandalone) {
      pendingMs = timeStrToMs(line);
      continue;
    }

    for (const dist of expectedDistances) {
      if (cumulativeByDist.has(dist)) continue;

      const distRegex = new RegExp(`\\b${dist}\\b`);
      if (!distRegex.test(line) || !strokeRegex.test(line)) continue;

      const allTimes = line.match(/(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2}|\d{4})/g);
      const lastTimeStr = allTimes ? allTimes[allTimes.length - 1] : null;
      const cumulativeMs = lastTimeStr ? timeStrToMs(lastTimeStr) : pendingMs;

      if (cumulativeMs && cumulativeMs > 0 && cumulativeMs < 400_000) {
        cumulativeByDist.set(dist, cumulativeMs);
      }

      pendingMs = null;
      break;
    }
  }

  // If the final distance checkpoint is missing, fill with totalMs
  const finalDist = eventDistance;
  if (!cumulativeByDist.has(finalDist) && totalMs && totalMs > 0) {
    cumulativeByDist.set(finalDist, totalMs);
  }

  if (cumulativeByDist.size === 0) return [];

  const splits: ParsedSplitRow[] = [];
  let prevCumulativeMs = 0;
  let position = 0;

  for (const dist of expectedDistances) {
    const cumulativeMs = cumulativeByDist.get(dist);
    if (cumulativeMs == null) {
      prevCumulativeMs = 0;
      continue;
    }

    position++;
    const legMs = prevCumulativeMs > 0 ? cumulativeMs - prevCumulativeMs : cumulativeMs;

    if (legMs > 0) {
      splits.push({
        label: ordinalSplitLabel(position),
        order: position,
        distance: dist,
        splitMs: legMs,
        cumulativeMs,
      });
    }

    prevCumulativeMs = cumulativeMs;
  }

  return splits.sort((a, b) => a.distance - b.distance);
}

function getStrokeKeyword(eventName: string): string {
  const e = eventName.toUpperCase();
  if (e.includes("FREE")) return "Free";
  if (e.includes("BACK")) return "Back";
  if (e.includes("BREAST")) return "Breast";
  if (e.includes("FLY") || e.includes("BUTTERFLY")) return "Fly";
  return "Free";
}

// ✅ Use splits already parsed and calculated by ocrMultiEventParser if available
// Only fall back to re-parsing raw OCR if no splits were found on the result object
function getSplitsForResult(
  result: AnyParsedResult,
  rawOCRText: string,
  totalMs?: number | null
): ParsedSplitRow[] {
  const eventName = normalizeEventName(result.event);

  // ✅ First: use splits already on the result (includes calculated 2nd 50)
  if (result.splits && result.splits.length > 0) {
    return result.splits
      .filter((s) => s.distance != null && s.splitMs > 0)
      .map((s, i) => ({
        label: s.label,
        order: s.order ?? i + 1,
        distance: s.distance!,
        splitMs: s.splitMs,
        cumulativeMs: s.cumulativeMs ?? null,
      }));
  }

  // Fallback: re-parse from raw OCR text
  if (is200IMEvent(eventName)) {
    const parsed = parse200IMSplitsFromOCR(rawOCRText);
    return parsed.splits
      .filter((s) => s.splitMs != null)
      .map((s, i) => ({
        label: `${s.distance} ${s.stroke}`,
        order: i + 1,
        distance: s.distance,
        splitMs: s.splitMs!,
        cumulativeMs: s.cumulativeMs ?? null,
      }));
  }

  if (is400IMEvent(eventName)) {
    const parsed = parse400IMSplitsFromOCR(rawOCRText);
    return parsed.splits
      .filter((s) => s.legMs != null)
      .map((s, i) => ({
        label: s.label,
        order: i + 1,
        distance: s.distance,
        splitMs: s.legMs!,
        cumulativeMs: s.cumulativeMs ?? null,
      }));
  }

  const distMatch = eventName.match(/\b(100|200)\b/);
  if (distMatch) {
    const dist = Number(distMatch[1]);
    const stroke = getStrokeKeyword(eventName);
    const splits = parseGenericSplits(rawOCRText, dist, stroke, totalMs);
    if (splits.length > 0) return splits;
  }

  return [];
}

async function isDuplicate(
  swimmerId: number,
  eventName: string,
  courseName: string,
  timeMs: number,
  swamAt: string | null
): Promise<boolean> {
  let query = supabase
    .from("swim_times")
    .select("id")
    .eq("swimmer_id", swimmerId)
    .eq("event", eventName)
    .eq("course", courseName)
    .eq("time_ms", timeMs);

  if (swamAt) {
    query = query.eq("swam_at", swamAt);
  }

  const { data } = await query.limit(1);
  return (data?.length ?? 0) > 0;
}

async function saveSwimTime(input: {
  swimmerId: number;
  result: AnyParsedResult;
  fallbackCourse?: string;
}): Promise<{ swimTimeId: number | null; error?: string; duplicate?: boolean }> {
  const eventName = normalizeEventName(input.result.event);
  const courseName = normalizeCourseName(input.result.course, input.fallbackCourse || "LCM");
  const timeMs = getTimeMs(input.result);

  if (!eventName) return { swimTimeId: null, error: "Missing event name" };
  if (!courseName) return { swimTimeId: null, error: "Missing course name" };
  if (timeMs === null) return { swimTimeId: null, error: "Missing or invalid time" };

  // ✅ Reject obvious clock times before saving
  const distMatch = eventName.match(/\b(50|100|200|400|800|1500)\b/);
  if (distMatch) {
    const dist = Number(distMatch[1]);
    if (!isReasonableSwimTime(dist, timeMs)) {
      return { swimTimeId: null, error: `Rejected "${eventName}" — time ${timeMs}ms looks like a clock time, not a swim time` };
    }
  }

  const swamAt = getSwamAt(input.result);

  const duplicate = await isDuplicate(input.swimmerId, eventName, courseName, timeMs, swamAt);
  if (duplicate) return { swimTimeId: null, duplicate: true };

  const payload: Record<string, unknown> = {
    swimmer_id: input.swimmerId,
    event: eventName,
    course: courseName,
    time_ms: timeMs,
  };

  if (swamAt) payload.swam_at = swamAt;

  const meetName = getMeetName(input.result);
  if (meetName) payload.meet_name = meetName;

  if (safeNumber(input.result.place) !== null) {
    payload.place = Number(input.result.place);
  }

  const { data, error } = await supabase
    .from("swim_times")
    .insert(payload)
    .select("id")
    .single();

  if (error) return { swimTimeId: null, error: error.message };

  return { swimTimeId: data?.id ?? null };
}

async function saveSplits(input: {
  swimTimeId: number;
  swimmerId: number;
  eventName: string;
  courseName: string;
  splits: ParsedSplitRow[];
}): Promise<{ count: number; error?: string }> {
  if (!input.splits.length) return { count: 0 };

  const rows = input.splits.map((split) => ({
    swim_time_id: input.swimTimeId,
    swimmer_id: input.swimmerId,
    event: input.eventName,
    course: input.courseName,
    split_label: split.label,
    split_order: split.order,
    split_distance: split.distance,
    split_time_ms: split.splitMs,
    cumulative_ms: split.cumulativeMs,
  }));

  const { error } = await supabase.from("swim_splits").insert(rows);
  if (error) return { count: 0, error: error.message };
  return { count: rows.length };
}

export async function parseAndSaveSwimOCR(
  rawOCRText: string,
  options: ParseAndSaveOptions
): Promise<OCRFlowResult> {
  const errors: string[] = [];
  let savedCount = 0;
  let splitSavedCount = 0;

  if (!rawOCRText.trim()) {
    return { parsedResults: [], savedCount: 0, splitSavedCount: 0, errors: ["OCR text is empty"] };
  }

  // 400 IM — dedicated parser
  const is400IM = /400\s*(meter|m)?\s*im/i.test(rawOCRText);
  if (is400IM) {
    const parsed = parse400IMSplitsFromOCR(rawOCRText);

    if (!parsed.finalTimeMs) {
      return {
        parsedResults: [],
        savedCount: 0,
        splitSavedCount: 0,
        errors: ["Could not detect final time from 400 IM screenshots"],
      };
    }

    const fakeResult: AnyParsedResult = {
      event: "400 IM",
      course: parsed.course ?? "LCM",
      timeMs: parsed.finalTimeMs,
      swamAt: parsed.date ?? null,
      name: parsed.swimmerName ?? options.swimmerName,
    };

    const swimTimeRes = await saveSwimTime({
      swimmerId: options.swimmerId,
      result: fakeResult,
      fallbackCourse: options.defaultCourse || "LCM",
    });

    if (swimTimeRes.duplicate) {
      return {
        parsedResults: [fakeResult],
        savedCount: 0,
        splitSavedCount: 0,
        errors: ["This result has already been saved — same event, time and date."],
      };
    }

    if (!swimTimeRes.swimTimeId) {
      return {
        parsedResults: [fakeResult],
        savedCount: 0,
        splitSavedCount: 0,
        errors: [swimTimeRes.error ?? "Failed to save 400 IM"],
      };
    }

    savedCount = 1;

    const splits = getSplitsForResult(fakeResult, rawOCRText, parsed.finalTimeMs);
    if (splits.length > 0) {
      const splitRes = await saveSplits({
        swimTimeId: swimTimeRes.swimTimeId,
        swimmerId: options.swimmerId,
        eventName: "400 IM",
        courseName: normalizeCourseName(parsed.course, "LCM"),
        splits,
      });
      if (splitRes.error) {
        errors.push(`Could not save 400 IM splits: ${splitRes.error}`);
      } else {
        splitSavedCount = splitRes.count;
      }
    }

    return { parsedResults: [fakeResult], savedCount, splitSavedCount, errors };
  }

  // All other events
  let parsedResults: AnyParsedResult[] = [];

  try {
    parsedResults = (parseSwimOCRText(rawOCRText, {
      swimmerName: options.swimmerName,
    }) || []) as AnyParsedResult[];
  } catch (error) {
    return {
      parsedResults: [],
      savedCount: 0,
      splitSavedCount: 0,
      errors: [error instanceof Error ? error.message : "Failed to parse OCR text"],
    };
  }

  if (parsedResults.length === 0) {
    return {
      parsedResults: [],
      savedCount: 0,
      splitSavedCount: 0,
      errors: ["No swim results detected from OCR text"],
    };
  }

  for (const result of parsedResults) {
    const swimmerName = getSwimmerName(result, options.swimmerName);
    const eventName = normalizeEventName(result.event);
    const courseName = normalizeCourseName(result.course, options.defaultCourse || "LCM");
    const totalMs = getTimeMs(result);

    if (!swimmerName) {
      errors.push(`Skipped — swimmer name missing (${eventName || "Unknown event"})`);
      continue;
    }

    if (!eventName) {
      errors.push(`Skipped "${swimmerName}" — event name missing`);
      continue;
    }

    const swimTimeRes = await saveSwimTime({
      swimmerId: options.swimmerId,
      result,
      fallbackCourse: options.defaultCourse || "LCM",
    });

    if (swimTimeRes.duplicate) {
      errors.push(`"${eventName}" on this date already saved — skipped.`);
      continue;
    }

    if (!swimTimeRes.swimTimeId) {
      errors.push(`Could not save "${swimmerName}" (${eventName}): ${swimTimeRes.error || "Unknown error"}`);
      continue;
    }

    savedCount += 1;

    // ✅ Use splits from the parsed result object first (includes calculated 2nd 50)
    const splits = getSplitsForResult(result, rawOCRText, totalMs);
    if (splits.length > 0) {
      const splitRes = await saveSplits({
        swimTimeId: swimTimeRes.swimTimeId,
        swimmerId: options.swimmerId,
        eventName,
        courseName,
        splits,
      });
      if (splitRes.error) {
        errors.push(`Could not save splits for "${swimmerName}" (${eventName}): ${splitRes.error}`);
      } else {
        splitSavedCount += splitRes.count;
      }
    }
  }

  return { parsedResults, savedCount, splitSavedCount, errors };
}