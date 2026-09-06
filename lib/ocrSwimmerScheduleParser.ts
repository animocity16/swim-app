// ocrSwimmerScheduleParser.ts
//
// Parses the Meet Mobile "Swimmer" schedule page — all events for one swimmer.
//
// ACTUAL OCR FORMAT (from real screenshots):
//
//   < SWIMMER %*
//   NEI Elizabeth Le Xuan Chiu       ← name with OCR noise prefix
//   9) CsC 10                         ← club/age garbled
//   Full schedule
//
//   cent Girls 9-10100 Meter Back     ← "EVENT" read as "cent", distance stuck to age
//   Finals | 0-10 |
//   102 1:27.87 | Place: 9            ← event number + time + place on one line
//   Time improvement: - 1.32
//
//   cent Girls 9-10 50 Meter Free
//   108 Finals | 0-10 |               ← sometimes event number on same line as Finals
//   36.76 | Place: 18
//
//   cent Mixed 7-8 200 Meter Medley Relay  ← relay — skip
//   Finals | 0-10 |
//   115 2:32.59 | Place: 3

export type ScheduleResultRow = {
  eventNumber: number | null;
  event: string;
  distance: number;
  stroke: string;
  timeStr: string;
  timeMs: number;
  place: number | null;
  course: "LCM" | "SCM" | "SCY" | "UNKNOWN";
  swamAt: string | null;
  meetName: string | null;
  isRelay: boolean;
};

export type ParsedSwimmerSchedule = {
  swimmerName: string | null;
  club: string | null;
  age: number | null;
  results: ScheduleResultRow[];
  meetName: string | null;
  swamAt: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// FIX: OCR frequently misreads a "5" as a "6" in the tens digit of a seconds
// field (e.g. actual "52" gets read as "62"). Rather than discarding the whole
// result when seconds >= 60, reverse that swap the same way ocrMultiEventParser.ts
// already does. Only values in [60,70) are treated as a probable 5→6 misread;
// anything else is still invalid and rejected.
function repairOCRSeconds(sec: number): number | null {
  if (sec < 60) return sec;
  if (sec < 70) return sec - 10;
  return null;
}

function timeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  const s = timeStr.trim();
  if (s.includes(":")) {
    const [mm, rest] = s.split(":");
    const [sec, hun] = rest.split(".");
    const fixedSec = repairOCRSeconds(Number(sec));
    if (fixedSec == null) return 0;
    return Number(mm) * 60_000 + fixedSec * 1_000 + Number(hun ?? "0") * 10;
  }
  const [sec, hun] = s.split(".");
  return Number(sec) * 1_000 + Number(hun ?? "0") * 10;
}

// Repair times:
//   "36.76"  → "36.76"   (valid as-is)
//   "36,76"  → "36.76"   (OCR reads decimal point as comma)
//   "3676"   → "36.76"   (OCR drops the decimal point — common for sub-minute times)
//   "118.03" → "1:18.03" (3 digits before dot = m:ss.hh)
//   "215.72" → "2:15.72"
//   "11803"  → "1:18.03" (5 raw digits)
//   "1:3817" → "1:38.17" (OCR drops decimal in mm:sscc format)
//   "2:62.93" → "2:52.93" (OCR misreads "5" as "6" in seconds tens digit)
function repairTime(raw: string): string | null {
  // Normalize comma-as-decimal first (OCR reads "47,53" instead of "47.53")
  const s = raw.trim().replace(/,/g, ".");

  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(s)) {
    const [mm, rest] = s.split(":");
    const [rawSec, hun] = rest.split(".");
    const fixedSec = repairOCRSeconds(Number(rawSec));
    if (fixedSec == null) return null;
    return `${mm}:${String(fixedSec).padStart(2, "0")}.${hun}`;
  }
  // FIX: "1:3817" → "1:38.17" — OCR drops the decimal point in mm:sscc format
  if (/^\d{1,2}:\d{4}$/.test(s)) {
    const [mm, rest] = s.split(":");
    const rawSec = rest.slice(0, 2);
    const hun = rest.slice(2);
    const fixedSec = repairOCRSeconds(Number(rawSec));
    if (fixedSec == null) return null;
    return `${mm}:${String(fixedSec).padStart(2, "0")}.${hun}`;
  }
  if (/^\d{2}\.\d{2}$/.test(s)) return s;
  // "4753" → "47.53" (4-digit: OCR dropped the decimal point for sub-minute times)
  if (/^\d{4}$/.test(s)) {
    const sec = Number(s.slice(0, 2));
    const hun = Number(s.slice(2));
    if (sec >= 60 || hun > 99) return null;
    return `${s.slice(0, 2)}.${s.slice(2)}`;
  }
  if (/^\d{5}$/.test(s)) {
    const rawSec = Number(s.slice(1, 3));
    const fixedSec = repairOCRSeconds(rawSec);
    if (fixedSec == null) return null;
    return `${s[0]}:${String(fixedSec).padStart(2, "0")}.${s.slice(3)}`;
  }
  // "118.03" or "215.72" — 3 digits, dot, 2 digits
  if (/^\d{3}\.\d{2}$/.test(s)) {
    const mins = s[0];
    const rawSec = s.slice(1, 3);
    const hun = s.slice(4);
    const fixedSec = repairOCRSeconds(Number(rawSec));
    if (fixedSec == null) return null;
    return `${mins}:${String(fixedSec).padStart(2, "0")}.${hun}`;
  }
  return null;
}

function detectCourse(rawText: string): "LCM" | "SCM" | "SCY" | "UNKNOWN" {
  const t = rawText.toLowerCase();
  if (t.includes("meter") || t.includes("lcm")) return "LCM";
  if (t.includes("25 meter") || t.includes("scm")) return "SCM";
  if (t.includes("yard") || t.includes("scy")) return "SCY";
  return "UNKNOWN";
}

function parseStroke(line: string): string | null {
  const l = line.toLowerCase();
  if (l.includes("freestyle") || / free\b/.test(l)) return "Freestyle";
  if (l.includes("butterfly") || / fly\b/.test(l)) return "Butterfly";
  if (l.includes("backstroke") || / back\b/.test(l)) return "Backstroke";
  if (l.includes("breaststroke") || / breast\b/.test(l)) return "Breaststroke";
  if (l.includes("individual medley") || / medley\b/.test(l) || / im\b/.test(l)) return "IM";
  return null;
}

function parseDistance(line: string): number | null {
  // FIX: OCR often merges the age range with the distance number,
  // e.g. "Girls 8-12100 Meter Back" instead of "Girls 8-12 100 Meter Back".
  // Insert a space between the age-range digit and the event distance so that
  // the word-boundary regex below can match correctly.
  const fixed = line.replace(/(\d{1,2})(50|100|200|400|800|1500)(?=\D|$)/g, "$1 $2");
  const m = fixed.match(/\b(50|100|200|400|800|1500)\b/);
  return m ? Number(m[1]) : null;
}

function extractMeetDate(rawText: string): string | null {
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m = rawText.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.,|/-]*(\d{1,2})[\s,|/-]*(\d{4})\b/i
  );
  if (m) {
    const month = monthMap[m[1].slice(0, 3).toLowerCase()];
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month != null && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month, day)).toISOString().split("T")[0];
    }
  }
  return null;
}

// ─── Swimmer name extraction ──────────────────────────────────────────────────
// Name appears just above "Full schedule" line
// OCR adds noise prefix like "NEI ", "< ", etc.
//
// Long names wrap onto two lines on the swimmer header (e.g. "Jiahui Shanyce"
// on one line, "Too" on the next), so we can't just check a single line —
// we walk upward from the anchor collecting contiguous name-shaped lines and
// join them, stopping as soon as we hit a line that isn't part of a name
// (has a digit, or doesn't start with a capital letter).
//
// Two passes:
//   1. Anchor off "Full schedule" (most reliable — original approach).
//   2. Fallback: look for the "CLUB | age" line (e.g. "SDAS | 10") that sits
//      directly under the name on the swimmer header, and take the name-shaped
//      line(s) just above it. This recovers screenshots that are cropped to
//      skip "Full schedule" but still include the header itself.
//
// Neither pass can recover a name that was never captured in the screenshot
// at all (e.g. a screenshot scrolled straight to the events list) — that's a
// data problem, not a parsing problem, and the scan UI should be warning the
// user in that case rather than guessing.

// A real name fragment is Title Case ("Jiahui", "Too") — it has at least one
// lowercase letter. Interface chrome near the name header (POINTS, SWIMMER,
// stat labels) reads as ALL CAPS and must not be swept up into the name.
function isNameFragment(cleaned: string): boolean {
  if (cleaned.length === 0 || /\d/.test(cleaned)) return false;
  if (!/^[A-Z]/.test(cleaned)) return false;
  if (!/[a-z]/.test(cleaned)) return false; // reject ALL-CAPS UI labels
  return true;
}

function looksLikeFullName(combined: string): boolean {
  const words = combined.split(/\s+/);
  return words.length >= 2 && words.length <= 7 && words.every((w) => /^[A-Z]/.test(w));
}

// The swimmer page's tab bar ("Next event" / "Swim details" / "Full
// schedule") always sits directly between the swimmer's name and the events
// list, no matter which tab is open — and "Swim details"/"Next event" both
// happen to satisfy isNameFragment (Title-Case-looking, has a lowercase
// letter), so the old walk-upward loop treated them as part of the name,
// broke on the word-count/capitalization check, and gave up right before it
// would have reached the real name one line further up.
const UI_LABEL_LINE = /^(next event|swim details?|full schedule|swimmer)$/i;

// Walks upward from just above `anchorIdx`, collecting consecutive
// name-shaped lines (up to maxLinesUp of them, not counting skipped tab/nav
// labels) and joining them in reading order. Stops the moment a line isn't
// a UI label and doesn't look like part of a name either.
function collectNameAbove(lines: string[], anchorIdx: number, maxLinesUp = 6): string | null {
  const fragments: string[] = [];
  let checked = 0;
  for (let i = anchorIdx - 1; i >= 0 && checked < maxLinesUp; i--) {
    const line = lines[i].trim();
    if (UI_LABEL_LINE.test(line)) continue; // skip tab-bar chrome, keep climbing
    checked++;
    const cleaned = line.replace(/^[^A-Z]+/, "").trim();
    if (!isNameFragment(cleaned)) break;
    fragments.unshift(cleaned);
    const combined = fragments.join(" ");
    if (looksLikeFullName(combined)) return combined;
  }
  return null;
}

// A line that's pure OCR noise — brackets, dashes, ampersands picked up from
// the phone's status-bar icons ("[1]", "&", "—", "=") — has no letters at
// all. Skip these without counting them against the search window.
function isPunctuationNoise(line: string): boolean {
  return line.length > 0 && !/[A-Za-z]/.test(line);
}

// Walks downward from just below `anchorIdx`, collecting consecutive
// name-shaped lines. Mirrors collectNameAbove but reads forward, for anchors
// where the name comes AFTER the anchor line in reading order.
function collectNameBelow(lines: string[], anchorIdx: number, maxLinesDown = 6): string | null {
  const fragments: string[] = [];
  let checked = 0;
  for (let i = anchorIdx + 1; i < lines.length && checked < maxLinesDown; i++) {
    const line = lines[i].trim();
    if (UI_LABEL_LINE.test(line) || isPunctuationNoise(line)) continue; // skip chrome/noise, keep going
    checked++;
    const cleaned = line.replace(/^[^A-Z]+/, "").trim();
    if (!isNameFragment(cleaned)) break;
    fragments.push(cleaned);
    const combined = fragments.join(" ");
    if (looksLikeFullName(combined)) return combined;
  }
  return null;
}

function extractSwimmerHeader(lines: string[]): {
  name: string | null; club: string | null; age: number | null;
} {
  // PRIMARY: anchor on the "SWIMMER" screen title and read the name from the
  // line(s) right below it. This is a short, plain, all-caps word with no
  // punctuation, so it survives noisy scans far more reliably than "Full
  // schedule" — which real scans have come back as mangled fragments like
  // "Ful sched", never matching the old schedule-line anchor at all and
  // leaving the name unread even though it's sitting right there in the text.
  const swimmerTitleIdx = lines.findIndex((l) => /^swimmer$/i.test(l.trim()));
  if (swimmerTitleIdx >= 0) {
    const name = collectNameBelow(lines, swimmerTitleIdx);
    if (name) return { name, club: null, age: null };
  }

  const scheduleIdx = lines.findIndex((l) => /full.?schedule/i.test(l));
  if (scheduleIdx >= 1) {
    const name = collectNameAbove(lines, scheduleIdx);
    if (name) return { name, club: null, age: null };
  }

  // Fallback: find a "CLUB | age" style line (club code, pipe, 1-2 digit age)
  // and take the name-shaped line(s) directly above it.
  const clubAgeIdx = lines.findIndex((l) => /^[A-Z]{2,6}\s*\|\s*\d{1,2}$/.test(l.trim()));
  if (clubAgeIdx >= 1) {
    const clubAgeMatch = lines[clubAgeIdx].trim().match(/^([A-Z]{2,6})\s*\|\s*(\d{1,2})$/);
    const name = collectNameAbove(lines, clubAgeIdx);
    if (name) {
      return {
        name,
        club: clubAgeMatch?.[1] ?? null,
        age: clubAgeMatch?.[2] ? Number(clubAgeMatch[2]) : null,
      };
    }
  }

  return { name: null, club: null, age: null };
}

// ─── Event description line detection ────────────────────────────────────────
// OCR reads "EVENT" as "cent", "ent", "EVENT", etc.
// Lines contain a stroke word + distance number.

function isEventDescriptionLine(line: string): boolean {
  if (/place:/i.test(line)) return false;
  if (/time improvement/i.test(line)) return false;
  if (/full.?schedule/i.test(line)) return false;
  if (/^\d{2,3}\s+\d/.test(line)) return false; // "102 1:27.87" — this is a data line
  const hasStroke = parseStroke(line) !== null;
  const hasDistance = parseDistance(line) !== null;
  return hasStroke && hasDistance;
}

// ─── Extract time + place from a line ────────────────────────────────────────
// Handles patterns like:
//   "102 1:27.87 | Place: 9"
//   "36.76 | Place: 18"
//   "118.03 | Place: 11"
//   "3:02.40 | Place:"   (place missing)
//   "3676 | Place: 18"   (OCR drops decimal → 4-digit raw time)
//   "47,53 | Place: 29"  (OCR reads decimal as comma)
//   "1:3817 | Place: 6"  (OCR drops decimal in mm:sscc format → repairTime handles)
//   "45.31] Place: 9"    (OCR reads pipe as ] bracket)
//   "2:62.93 | Place: 4" (OCR misreads "5" as "6" in seconds tens digit → repairTime handles)
//
// FIX 1: pipe character is now optional and accepts OCR alternatives (l, 1, I, ]).
// FIX 2: 4-digit raw times (e.g. "4753") now accepted for sub-minute events.
// FIX 3: comma-decimal (e.g. "47,53") now accepted.
// FIX 4: mm:sscc format without decimal (e.g. "1:3817") now accepted.
// FIX 5: seconds >= 60 no longer silently drops the whole event — repairTime
//        first tries reversing a likely 5→6 OCR misread before giving up.

function extractTimePlaceFromLine(line: string): {
  timeStr: string; timeMs: number; place: number | null;
} | null {
  // Allow pipe alternatives: |  l  1  I  ]  (or no separator at all before "Place")
  // Accept: mm:ss.hh, mm:sscc (no decimal), 3-digit decimal (118.03),
  //         2-digit decimal (47.53), 5-digit raw (11803), 4-digit raw (4753),
  //         comma-decimal variants
  const m = line.match(
    /(\d{1,2}:\d{2}[.,]\d{2}|\d{1,2}:\d{4}|\d{3}[.,]\d{2}|\d{2}[.,]\d{2}|\d{5}|\d{4})\s*[|lI1\]]?\s*Place\s*:\s*(\d+|EXH)?/i
  );
  if (!m) return null;

  const timeStr = repairTime(m[1]);
  if (!timeStr) return null;

  const timeMs = timeToMs(timeStr);
  if (timeMs <= 0 || timeMs > 1_800_000) return null;

  const placeStr = m[2] ?? "";
  const place = /^\d+$/.test(placeStr) ? Number(placeStr) : null;

  return { timeStr, timeMs, place };
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseSwimmerScheduleOCR(rawText: string): ParsedSwimmerSchedule {
  const lines = rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const course = detectCourse(rawText);
  const swamAt = extractMeetDate(rawText);
  const { name: swimmerName, club, age } = extractSwimmerHeader(lines);

  const meetKeywords = /championship|open|invitational|junior|classic|cup|series|aquatic|swim/i;
  let meetName: string | null = null;
  for (const line of lines.slice(0, 20)) {
    if (line.length < 5 || line.length > 100) continue;
    if (/^\d/.test(line)) continue;
    if (/place|heat|finals|schedule|swimmer/i.test(line)) continue;
    // FIX: the swimmer page's own tab bar ("Next event" / "Swim details" /
    // "Full schedule") is always present in the OCR text regardless of which
    // tab is open, and "Swim details" alone matches the generic /swim/
    // keyword above — wrongly picked as the meet name on every schedule
    // screenshot. Exclude the tab labels explicitly.
    if (/^(next event|swim details?)$/i.test(line.trim())) continue;
    if (meetKeywords.test(line)) { meetName = line.trim(); break; }
  }

  const results: ScheduleResultRow[] = [];
  const seen = new Set<string>();
  const claimedTimeLines = new Set<number>();

  // FIX: Meet Mobile's OCR reading order for each event block is NOT
  // consistent between scans — sometimes the description line ("Mixed 10-12
  // 50 Meter Back") comes BEFORE its own "<time> | Place: <n>" line, other
  // times it comes AFTER it (Tesseract's sparse-text mode doesn't guarantee
  // visual top-to-bottom order). The old code only ever looked FORWARD from
  // the description line for a time+place, stopping at the next description
  // line. Whenever a scan came back in "time-before-description" order, that
  // forward search walked straight past this event's own (already-passed)
  // time and grabbed the NEXT event's time+place instead — silently
  // assigning every event the following event's result (e.g. "50 Backstroke"
  // showing the 400 Free's time). A literal "EVENT" label line, when present,
  // marks each block's start, so searching in BOTH directions but never
  // crossing another description line OR an "EVENT" marker keeps each event
  // matched to its own time, whichever order the OCR happened to read it in.
  function findTimePlaceNear(descIdx: number): { timeStr: string; timeMs: number; place: number | null; lineIdx: number; eventNumber: number | null } | null {
    const maxWindow = 6;

    // Look backward first — most real-world scans have the time above the
    // description in this app's current layout.
    for (let j = descIdx - 1; j >= Math.max(0, descIdx - maxWindow); j--) {
      const prev = lines[j];
      if (isEventDescriptionLine(prev)) break; // ran into the previous event's own description
      if (/^event$/i.test(prev.trim())) break; // ran past this block's own start
      if (claimedTimeLines.has(j)) continue;
      const extracted = extractTimePlaceFromLine(prev);
      if (extracted) {
        const numMatch = prev.match(/^(\d{2,3})\s+/) ?? lines[j - 1]?.match(/^(\d{2,3})\s+/);
        return { ...extracted, lineIdx: j, eventNumber: numMatch ? Number(numMatch[1]) : null };
      }
    }

    // Then look forward, for scans that read in the older description-first order.
    for (let j = descIdx + 1; j < Math.min(descIdx + maxWindow, lines.length); j++) {
      const next = lines[j];
      if (isEventDescriptionLine(next)) break; // ran into the next event's description
      if (/^event$/i.test(next.trim())) break; // ran past this block into the next one
      if (/time improvement/i.test(next)) continue;
      if (/full.?schedule/i.test(next)) continue;
      if (claimedTimeLines.has(j)) continue;
      const extracted = extractTimePlaceFromLine(next);
      if (extracted) {
        const numMatch = next.match(/^(\d{2,3})\s+/);
        return { ...extracted, lineIdx: j, eventNumber: numMatch ? Number(numMatch[1]) : null };
      }
    }

    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isEventDescriptionLine(line)) continue;

    const isRelay = /relay/i.test(line);
    const distance = parseDistance(line);
    const stroke = parseStroke(line);
    if (!distance || !stroke) continue;

    const found = findTimePlaceNear(i);
    if (!found) continue;
    claimedTimeLines.add(found.lineIdx); // don't let another event reuse this same time+place
    const eventNumber = found.eventNumber;

    // Sanity checks
    if (distance === 50 && found.timeMs < 20_000) continue;
    if (distance === 100 && found.timeMs < 40_000) continue;
    if (distance === 200 && found.timeMs < 80_000) continue;
    if (distance === 400 && found.timeMs < 200_000) continue;

    // Deduplicate by event + time
    const key = `${distance}|${stroke}|${found.timeStr}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      eventNumber,
      event: `${distance} ${stroke}`,
      distance,
      stroke,
      timeStr: found.timeStr,
      timeMs: found.timeMs,
      place: found.place,
      course,
      swamAt,
      meetName,
      isRelay,
    });
  }

  return { swimmerName, club, age, results, meetName, swamAt };
}

// ─── Detection ────────────────────────────────────────────────────────────────
// Key signals:
// - "Full schedule" — unique to this screen
// - Multiple "Place:" with colon — unique to swimmer schedule format
//
// FIX (round 2): the swimmer page's own tab bar always renders THREE tab
// labels together — "Next event" / "Swim details" / "Full schedule" — no
// matter which tab is actually open. So a photo of the "Full schedule" tab
// (showing several race results) still contains the literal text "Swim
// details" from that tab bar, and the old hard-exclusion
// `flat.includes("SWIM DETAIL")` (a substring match, so it also matches the
// plural "SWIM DETAILS") was rejecting it outright before the schedule
// checks below ever ran. That silently dumped multi-event schedule
// screenshots into single-result mode, which only surfaces ONE event
// (whichever sorts first) and drops the rest — e.g. a 5-event schedule
// screenshot showing up as just "50 Backstroke".
//
// Fix: check for schedule-page evidence FIRST. Only fall back to the
// single-detail-screen exclusions — using markers that are actually unique
// to that screen (its PLACE/FINALS/ENTRY grid, SPLITS table, EVENT SUMMARY
// button) rather than the ambiguous tab-bar label — when that evidence
// isn't there.
export function isSwimmerSchedulePage(rawText: string): boolean {
  const flat = rawText.replace(/\s+/g, " ").toUpperCase();

  // "FULL SCHEDULE" is the strongest unique signal.
  // Accept common OCR garbles: "FULL SCHEDUL", "FULL SCHED", "FULL SCH"
  const hasFullSchedule =
    flat.includes("FULL SCHEDULE") ||
    flat.includes("FULL SCHEDUL") ||
    /FULL\s+SCH[A-Z]{0,5}/.test(flat);

  // Multiple "PLACE:" entries (accept optional space before colon, OCR noise)
  const placeColonCount = (flat.match(/PLACE\s*:/g) ?? []).length;

  // A photo can also crop out the "Full schedule" header itself (or OCR can
  // simply miss it — it's small text at the top of a long, scrollable page)
  // while still clearly showing several separate race results underneath.
  // Recognize that shape directly: multiple distinct "<distance> Meter
  // <stroke>" event headers, each with its own "Place:" line.
  const eventHeaderCount = (
    flat.match(
      /\b(50|100|200|400|800|1500)\s*METER\s*(FREE|FREESTYLE|BACK|BACKSTROKE|BREAST|BREASTSTROKE|FLY|BUTTERFLY|MEDLEY|IM)\b/g
    ) ?? []
  ).length;

  const looksLikeSchedule =
    (hasFullSchedule && placeColonCount >= 2) ||
    (placeColonCount >= 2 && eventHeaderCount >= 2);

  if (!looksLikeSchedule) return false;

  // Hard exclusions for the genuinely single-event detail screen — checked
  // AFTER the schedule evidence above, and using markers specific to that
  // screen's own layout (its results grid, splits table, summary button)
  // rather than the tab-bar label every swimmer-page screenshot carries.
  if (flat.includes("EVENT SUMMARY")) return false;
  if (flat.includes("EVENT DETAILS")) return false;
  if (flat.includes("PLACE FINALS ENTRY")) return false;
  if (flat.includes("STATUS") && flat.includes("DROPPED")) return false;
  if (flat.includes("SPLITS") && eventHeaderCount < 2) return false;

  return true;
}