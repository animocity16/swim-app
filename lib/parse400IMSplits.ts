export type Split400IM = {
  label: string;
  stroke: "FLY" | "BACK" | "BREAST" | "FREE";
  distance: number;
  legMs: number | null;
  cumulativeMs: number | null;
};

export type Parse400IMResult = {
  eventName: string | null;
  meetName: string | null;
  swimmerName: string | null;
  date: string | null;
  course: string | null;
  finalTimeMs: number | null;
  entryTimeMs: number | null;
  droppedMs: number | null;
  place: number | null;
  splits: Split400IM[];
  strokeSplits: {
    fly: number | null;
    back: number | null;
    breast: number | null;
    free: number | null;
  };
  warnings: string[];
  confidence: number;
};

function normalize(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function timeToMs(raw: string): number | null {
  const s = raw.trim()
    .replace(/[OoQ]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/[^0-9:.]/g, "");

  if (!s) return null;

  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length !== 2) return null;
    const min = Number(parts[0]);
    const sec = Number(parts[1]);
    if (isNaN(min) || isNaN(sec)) return null;
    return Math.round((min * 60 + sec) * 1000);
  }

  // 5-digit: "34357" => 3:43.57
  if (/^\d{5}$/.test(s)) {
    const min = Number(s[0]);
    const sec = Number(s.slice(1, 3));
    const hun = Number(s.slice(3));
    return Math.round((min * 60 + sec) * 1000 + hun * 10);
  }

  // 4-digit: "4360" => 43.60
  if (/^\d{4}$/.test(s)) {
    const sec = Number(`${s.slice(0, 2)}.${s.slice(2)}`);
    if (isNaN(sec)) return null;
    return Math.round(sec * 1000);
  }

  const sec = Number(s);
  if (isNaN(sec)) return null;
  return Math.round(sec * 1000);
}

function extractStandaloneTime(line: string): number | null {
  const trimmed = line.trim();
  if (/^[\d]{4,5}$/.test(trimmed)) return timeToMs(trimmed);
  if (/^\d{1,2}\.\d{2}$/.test(trimmed)) return timeToMs(trimmed);
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(trimmed)) return timeToMs(trimmed);
  return null;
}

type StrokeKey = Split400IM["stroke"];

const EXPECTED: Array<{
  distance: number;
  stroke: StrokeKey;
  label: string;
  regex: RegExp;
}> = [
  { distance: 50,  stroke: "FLY",    label: "50 Fly",     regex: /\b50\b.*(fly|butterfly)/i },
  { distance: 100, stroke: "FLY",    label: "100 Fly",    regex: /\b100\b.*(fly|butterfly)/i },
  { distance: 150, stroke: "BACK",   label: "150 Back",   regex: /\b150\b.*back/i },
  // ✅ "oo Back" is OCR misread of "200 Back"
  { distance: 200, stroke: "BACK",   label: "200 Back",   regex: /(\b200\b|^oo\b|^2oo\b).*back/i },
  { distance: 250, stroke: "BREAST", label: "250 Breast", regex: /\b250\b.*breast/i },
  { distance: 300, stroke: "BREAST", label: "300 Breast", regex: /\b300\b.*breast/i },
  { distance: 350, stroke: "FREE",   label: "350 Free",   regex: /\b350\b.*(free|freestyle)/i },
  { distance: 400, stroke: "FREE",   label: "400 Free",   regex: /\b400\b.*(free|freestyle)/i },
];

const SPLIT_LABELS: Array<{ stroke: StrokeKey; regex: RegExp }> = [
  { stroke: "FLY",    regex: /fly.*split|split.*fly/i },
  { stroke: "BACK",   regex: /back.*split|split.*back/i },
  { stroke: "BREAST", regex: /breast.*split|split.*breast/i },
  { stroke: "FREE",   regex: /free.*split|split.*free/i },
];

export function parse400IMSplitsFromOCR(rawText: string): Parse400IMResult {
  const warnings: string[] = [];
  const text = normalize(rawText);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let eventName: string | null = null;
  let meetName: string | null = null;
  let date: string | null = null;
  let course: string | null = null;
  let swimmerName: string | null = null;
  let finalTimeMs: number | null = null;
  let entryTimeMs: number | null = null;
  let droppedMs: number | null = null;
  let place: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/400\s*(meter|m)?\s*im/i.test(line)) {
      eventName = "400 IM";
      course = /meter/i.test(line) ? "LCM" : /yard/i.test(line) ? "SCY" : "LCM";
    }

    if (!meetName && /snag|juniors|open|championship|invitational|classic/i.test(line)) {
      meetName = line.trim();
    }

    const dateMatch = line.match(
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.,|/-]*(\d{1,2})[\s,|/-]*(\d{4})/i
    );
    if (dateMatch) date = dateMatch[0];

    // Swimmer name — two capitalised words, ignore lines with brackets/numbers
    if (!swimmerName && /^[\(\d]*[A-Z][a-z]+ [A-Z][a-z]+/.test(line)) {
      swimmerName = line.replace(/^\(\w+\)\s*/, "").trim();
    }

    const finalsMatch = line.match(/finals?\s+([\d:\.]+)/i);
    if (finalsMatch) finalTimeMs = timeToMs(finalsMatch[1]);

    const entryMatch = line.match(/entry\s+([\d:\.]+)/i);
    if (entryMatch) entryTimeMs = timeToMs(entryMatch[1]);

    // "2 5:57.88 6:06.06" — place finals entry on one line
    const placeFinalsMatch = line.match(/^(\d)\s+([\d:\.]+)\s+([\d:\.]+)/);
    if (placeFinalsMatch && !place) {
      place = Number(placeFinalsMatch[1]);
      if (!finalTimeMs) finalTimeMs = timeToMs(placeFinalsMatch[2]);
      if (!entryTimeMs) entryTimeMs = timeToMs(placeFinalsMatch[3]);
    }

    const totalMatch = line.match(/^total\s+([\d:\.]+)/i);
    if (totalMatch) finalTimeMs = timeToMs(totalMatch[1]);

    // "Completed -818" — dropped in hundredths
    const droppedMatch = line.match(/completed\s*[-–](\d+)/i);
    if (droppedMatch) droppedMs = -Number(droppedMatch[1]) * 10;
  }

  // --- Splits ---
  const splits: Split400IM[] = [];
  const strokeSplits: Parse400IMResult["strokeSplits"] = {
    fly: null, back: null, breast: null, free: null,
  };

  let pendingLegMs: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Stroke subtotal line e.g. "100 Fly Split 1:19.85"
    if (/split/i.test(line)) {
      const timeMatch = line.match(/(\d{1,2}:\d{2}\.\d{2}|\d{1,2}\.\d{2})$/);
      if (timeMatch) {
        const ms = timeToMs(timeMatch[1]);
        for (const sl of SPLIT_LABELS) {
          if (sl.regex.test(line)) {
            if (sl.stroke === "FLY") strokeSplits.fly = ms;
            else if (sl.stroke === "BACK") strokeSplits.back = ms;
            else if (sl.stroke === "BREAST") strokeSplits.breast = ms;
            else if (sl.stroke === "FREE") strokeSplits.free = ms;
            break;
          }
        }
      }
      pendingLegMs = null;
      continue;
    }

    // Standalone time line — this is the leg time for the next split
    const standaloneMs = extractStandaloneTime(line);
    if (standaloneMs !== null && standaloneMs > 0 && standaloneMs < 200000) {
      pendingLegMs = standaloneMs;
      continue;
    }

    // Split label line e.g. "50 Fly soon", "oo Back 2:50.78"
    for (const expected of EXPECTED) {
      if (expected.regex.test(line)) {
        if (splits.find((s) => s.distance === expected.distance)) break;

        const timeOnLine = line.match(/(\d{1,2}:\d{2}\.?\d{0,2}|\d{5}|\d{4})$/);
        const cumulativeMs = timeOnLine ? timeToMs(timeOnLine[1]) : null;

        splits.push({
          label: expected.label,
          stroke: expected.stroke,
          distance: expected.distance,
          legMs: pendingLegMs,
          cumulativeMs,
        });

        pendingLegMs = null;
        break;
      }
    }
  }

  splits.sort((a, b) => a.distance - b.distance);

  // Calculate stroke totals from leg times if not found from splits
  const flyLegs   = splits.filter((s) => s.stroke === "FLY");
  const backLegs  = splits.filter((s) => s.stroke === "BACK");
  const breastLegs = splits.filter((s) => s.stroke === "BREAST");
  const freeLegs  = splits.filter((s) => s.stroke === "FREE");

  if (!strokeSplits.fly && flyLegs.length === 2 && flyLegs[0].legMs && flyLegs[1].legMs)
    strokeSplits.fly = flyLegs[0].legMs + flyLegs[1].legMs;
  if (!strokeSplits.back && backLegs.length === 2 && backLegs[0].legMs && backLegs[1].legMs)
    strokeSplits.back = backLegs[0].legMs + backLegs[1].legMs;
  if (!strokeSplits.breast && breastLegs.length === 2 && breastLegs[0].legMs && breastLegs[1].legMs)
    strokeSplits.breast = breastLegs[0].legMs + breastLegs[1].legMs;
  if (!strokeSplits.free && freeLegs.length === 2 && freeLegs[0].legMs && freeLegs[1].legMs)
    strokeSplits.free = freeLegs[0].legMs + freeLegs[1].legMs;

  const missing = EXPECTED.filter((e) => !splits.find((s) => s.distance === e.distance));
  if (missing.length > 0) {
    warnings.push(`Missing splits: ${missing.map((m) => m.label).join(", ")}`);
  }

  let pts = splits.length;
  if (strokeSplits.fly) pts++;
  if (strokeSplits.back) pts++;
  if (strokeSplits.breast) pts++;
  if (strokeSplits.free) pts++;
  if (finalTimeMs) pts++;
  if (swimmerName) pts++;
  const confidence = Math.round((pts / 14) * 100);

  return {
    eventName,
    meetName,
    swimmerName,
    date,
    course,
    finalTimeMs,
    entryTimeMs,
    droppedMs,
    place,
    splits,
    strokeSplits,
    warnings,
    confidence,
  };
}