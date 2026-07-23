// ✅ ocrSwimCloudProfileParser.ts — built directly against real device OCR text
//
// Unlike rankings, a profile page's row data (time, delta, place) shifts
// across 1-2 lines unpredictably — sometimes squashed onto the event line,
// sometimes split out. The one constant is the ROUND keyword ("Timed
// Finals" / "Extracted" / "Prelims" / "Finals"), so this parser finds each
// event line, then treats everything up to (and including) the next round
// keyword as that row's data blob, and regexes the blob for time/delta/place.
//
// KNOWN LIMITATION: the swimmer's actual name never appears in this OCR
// text — only 2-letter avatar initials (e.g. "ML"). This mode can't
// auto-match a swimmer; the UI needs to ask the user to pick one.
//
// KNOWN LIMITATION: "PB" badge text was not present anywhere in the real
// sample tested, even on rows that visibly had a PB badge. Treat PB
// detection as best-effort, not reliable.
//
// KNOWN LIMITATION: delta occasionally loses its decimal point in OCR
// (e.g. "+0.33" → "+033"). When that happens delta comes back null rather
// than a guessed value — it's a secondary field, not what gets saved as
// the actual time.

export type SwimCloudProfileRow = {
  event: string;
  timeStr: string;
  timeMs: number;
  round: string | null;
  place: number | null;
  delta: number | null;
  isPB: boolean;
};

export type ParsedSwimCloudProfile = {
  initials: string | null;
  club: string | null;
  results: SwimCloudProfileRow[];
};

const EVENT_LINE_RE = /^(\d{2,4}\s+(?:Free|Back|Breast|Fly|IM|FR-R|MED-R)(?:\s*\([A-Za-z]+\))?)/i;
const TIME_RE = /(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})/;
const ROUND_RE = /(Timed Finals|Extracted|Prelims|Finals|Semifinals)/i;
const PLACE_RE = /\b(\d{1,2})(st|nd|rd|th)\b/i;
const DELTA_RE = /([+-]\d{1,2}\.\d{2}|\b\d{1,2}\.\d{2}\b)/g;

function repairOCRSeconds(sec: number): number {
  if (sec >= 60 && sec < 70) return sec - 10;
  if (sec >= 60) return sec % 60;
  return sec;
}

function timeToMs(timeStr: string): number {
  const clean = timeStr.trim();
  if (clean.includes(":")) {
    const [mm, rest] = clean.split(":");
    const [sec, hundredths] = rest.split(".");
    const rawSec = Number(sec);
    const fixedSec = rawSec >= 60 ? repairOCRSeconds(rawSec) : rawSec;
    return Number(mm) * 60_000 + fixedSec * 1_000 + Number(hundredths ?? "0") * 10;
  }
  const [sec, hundredths] = clean.split(".");
  return Number(sec) * 1_000 + Number(hundredths ?? "0") * 10;
}

function extractInitialsAndClub(lines: string[]): { initials: string | null; club: string | null } {
  for (const line of lines.slice(0, 8)) {
    const m = line.match(/^([A-Z]{2})\s+([A-Za-z][A-Za-z' ]{2,40})$/);
    if (m) return { initials: m[1], club: m[2].trim() };
  }
  return { initials: null, club: null };
}

export function isSwimCloudProfilePage(rawText: string): boolean {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const eventLineCount = lines.filter((l) => EVENT_LINE_RE.test(l)).length;
  const roundCount = lines.filter((l) => ROUND_RE.test(l)).length;
  return eventLineCount >= 2 && roundCount >= 2;
}

export function parseSwimCloudProfileOCR(rawText: string): ParsedSwimCloudProfile {
  const lines = rawText.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const { initials, club } = extractInitialsAndClub(lines);

  const eventLineIdxs: number[] = [];
  lines.forEach((l, i) => { if (EVENT_LINE_RE.test(l)) eventLineIdxs.push(i); });

  const results: SwimCloudProfileRow[] = [];

  for (let r = 0; r < eventLineIdxs.length; r++) {
    const startIdx = eventLineIdxs[r];
    const endIdx = r + 1 < eventLineIdxs.length ? eventLineIdxs[r + 1] : lines.length;
    const blockLines = lines.slice(startIdx, endIdx);
    const blockText = blockLines.join(" ");

    const eventMatch = lines[startIdx].match(EVENT_LINE_RE);
    if (!eventMatch) continue;
    const event = eventMatch[1].trim();

    const timeMatch = blockText.match(TIME_RE);
    if (!timeMatch) continue;
    const timeStr = timeMatch[1];
    const timeMs = timeToMs(timeStr);
    if (timeMs <= 0 || timeMs > 1_800_000) continue;

    const roundMatch = blockText.match(ROUND_RE);
    const round = roundMatch ? roundMatch[1] : null;

    const placeMatch = blockText.match(PLACE_RE);
    const place = placeMatch ? parseInt(placeMatch[1], 10) : null;

    let delta: number | null = null;
    const withoutTime = blockText.replace(timeMatch[0], " ");
    const deltaMatches = [...withoutTime.matchAll(DELTA_RE)];
    if (deltaMatches.length > 0) {
      const raw = deltaMatches[0][1];
      const sign = raw.startsWith("-") ? -1 : 1;
      const num = parseFloat(raw.replace(/^[+-]/, ""));
      if (!isNaN(num)) delta = sign * num;
    }

    const isPB = /\bPB\b/i.test(blockText);

    results.push({ event, timeStr, timeMs, round, place, delta, isPB });
  }

  return { initials, club, results };
}