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
};

type ParseOptions = {
  swimmerName?: string;
  defaultCourse?: "LCM" | "SCM" | "SCY" | "UNKNOWN";
};

const DISTANCES = [50, 100, 200, 400, 800, 1500];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[|()[\]{}]/g, " ")
    .replace(/[^a-z0-9:.+\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function timeToMs(timeStr: string) {
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

function detectCourse(text: string): "LCM" | "SCM" | "SCY" | "UNKNOWN" {
  const t = normalizeText(text);

  if (
    t.includes("50 meter") ||
    t.includes("50m") ||
    t.includes("long course") ||
    t === "lcm" ||
    t.includes(" lcm")
  ) {
    return "LCM";
  }

  if (
    t.includes("25 meter") ||
    t.includes("25m") ||
    t.includes("short course meters") ||
    t === "scm" ||
    t.includes(" scm")
  ) {
    return "SCM";
  }

  if (
    t.includes("25 yard") ||
    t.includes("25y") ||
    t.includes("short course yards") ||
    t === "scy" ||
    t.includes(" scy")
  ) {
    return "SCY";
  }

  return "UNKNOWN";
}

function extractTime(line: string): string | null {
  const lower = normalizeText(line);

  if (
    lower.includes("improvement") ||
    lower.includes("split") ||
    lower.includes("reaction") ||
    lower.includes("seed") ||
    lower.includes("delta")
  ) {
    return null;
  }

  // normal formats first
  const normalMatch = line.match(/\b(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})\b/);
  if (normalMatch) return normalMatch[1];

  // OCR sometimes returns compact time like 4350 instead of 43.50
  // only trust this on lines that also mention Place
  if (lower.includes("place")) {
    const compactMatches = line.match(/\b\d{3,4}\b/g);
    if (compactMatches) {
      // choose the last 3-4 digit number on the line, which is usually the time,
      // not the event number like 404
      const raw = compactMatches[compactMatches.length - 1];

      if (raw.length === 4) {
        return `${raw.slice(0, 2)}.${raw.slice(2)}`;
      }

      if (raw.length === 3) {
        return `${raw.slice(0, 1)}.${raw.slice(1)}`;
      }
    }
  }

  return null;
}

function detectDistance(text: string): number | null {
  for (const d of DISTANCES) {
    if (new RegExp(`\\b${d}\\b`).test(text)) return d;
  }
  return null;
}

function detectStroke(text: string): string | null {
  const t = normalizeText(text);

  if (t.includes("freestyle") || t.includes(" free")) return "Freestyle";
  if (t.includes("butterfly") || t.includes(" fly")) return "Butterfly";
  if (t.includes("backstroke") || t.includes(" back")) return "Backstroke";
  if (t.includes("breaststroke") || t.includes(" breast")) return "Breaststroke";

  if (
    t.includes("individual medley") ||
    t.includes(" medley") ||
    t.includes(" im") ||
    t.includes("i m")
  ) {
    return "IM";
  }

  return null;
}

function looksLikeEventLine(line: string) {
  const t = normalizeText(line);

  if (!t) return false;

  const distance = detectDistance(t);
  if (!distance) return false;

  if (
    t.includes("relay") ||
    t.includes("improvement") ||
    t.includes("split") ||
    t.includes("points") ||
    t.includes("summary")
  ) {
    return false;
  }

  return true;
}

function buildEvent(line: string): { event: string; distance: number; stroke: string } | null {
  const t = normalizeText(line);

  const distance = detectDistance(t);
  let stroke = detectStroke(t);

  if (!distance) return null;

  if (!stroke) {
    if (t.includes("back")) stroke = "Backstroke";
    else if (t.includes("fly")) stroke = "Butterfly";
    else if (t.includes("free")) stroke = "Freestyle";
    else if (t.includes("breast")) stroke = "Breaststroke";
    else if (t.includes("im")) stroke = "IM";
  }

  if (!stroke) return null;

  return {
    event: `${distance} ${stroke}`,
    distance,
    stroke,
  };
}

function extractGlobalCourse(lines: string[]) {
  for (const line of lines.slice(0, 20)) {
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

export function parseSwimOCRText(
  rawText: string,
  options: ParseOptions = {}
): ParsedSwimResult[] {
  const lines = cleanLines(rawText);
  const extractedCourse = extractGlobalCourse(lines);
  const globalCourse =
    extractedCourse !== "UNKNOWN"
      ? extractedCourse
      : options.defaultCourse ?? "UNKNOWN";

  const results: ParsedSwimResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];

    if (!looksLikeEventLine(current)) continue;

    const built = buildEvent(current);
    if (!built) continue;

    let foundTime: string | null = null;
    let foundCourse: "LCM" | "SCM" | "SCY" | "UNKNOWN" = globalCourse;
    const rawBlock = [current];

    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const next = lines[j];
      const nextNorm = normalizeText(next);
      rawBlock.push(next);

      const nextCourse = detectCourse(next);
      if (nextCourse !== "UNKNOWN") {
        foundCourse = nextCourse;
      }

      if (nextNorm.includes("improvement")) continue;
      if (nextNorm.includes("split")) continue;

      const time = extractTime(next);
      if (time) {
        foundTime = time;
        break;
      }

      if (j > i + 1 && looksLikeEventLine(next)) {
        rawBlock.pop();
        break;
      }
    }

    if (!foundTime) continue;

    results.push({
      event: built.event,
      distance: built.distance,
      stroke: built.stroke,
      name: options.swimmerName ?? null,
      timeStr: foundTime,
      timeMs: timeToMs(foundTime),
      course: foundCourse,
      confidence: 4,
      rawBlock,
    });
  }

  const deduped = new Map<string, ParsedSwimResult>();

  for (const item of results) {
    const key = `${item.event.toLowerCase()}|${item.timeStr}|${item.course}`;
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