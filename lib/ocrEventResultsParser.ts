// ✅ ocrEventResultsParser.ts
//
// Parses the Meet Mobile "Event Details" page — the full event rankings list.
//
// REAL OCR FORMAT (from actual screenshots):
//
//   PLACE En Ning Olivia Lim 38.70    ← "PLACE" + name + time all on one line
//   1 csclio TIME                      ← place number + club on next line
//
//   PLACE Ena Ang 42.70
//   4A aAas|10 TIME                    ← place "4A" — OCR adds letter after number!
//
//   PLACE Mikaela Loh 4350             ← time "4350" = "43.50" (missing dot)
//   / ssclio TIVE                      ← "/" = "7" OCR misread
//
//   PACE Tessa Ng | 43.85             ← "PACE" = "PLACE" (OCR dropped the L)
//
//   PLACE Mengqi Fang 1:26.26
//   (9) TLSC | 10 TIME                 ← bracketed place number

export type EventResultRow = {
  place: number;
  name: string;
  club: string | null;
  age: number | null;
  timeStr: string;
  timeMs: number;
  event: string | null;
  course: "LCM" | "SCM" | "SCY" | "UNKNOWN";
  swamAt: string | null;
  meetName: string | null;
};

export type ParsedEventResults = {
  event: string | null;
  course: "LCM" | "SCM" | "SCY" | "UNKNOWN";
  swamAt: string | null;
  meetName: string | null;
  results: EventResultRow[];
};

// ✅ Repair common OCR time manglings
function repairTime(raw: string): string | null {
  const s = raw.trim();
  // Already correct
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(s)) return s;
  if (/^\d{2}\.\d{2}$/.test(s)) return s;
  // "1:2512" → "1:25.12"
  if (/^\d{1}:\d{4}$/.test(s)) return `${s[0]}:${s.slice(2, 4)}.${s.slice(4)}`;
  // "12466" → "1:24.66"
  if (/^\d{5}$/.test(s)) return `${s[0]}:${s.slice(1, 3)}.${s.slice(3)}`;
  // "4278" or "3953" or "4315" → "42.78" / "39.53" / "43.15"
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}.${s.slice(2)}`;
  return null;
}

function timeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim();
  if (clean.includes(":")) {
    const [mm, rest] = clean.split(":");
    const [sec, hundredths] = rest.split(".");
    return Number(mm) * 60_000 + Number(sec) * 1_000 + Number(hundredths ?? "0") * 10;
  }
  const [sec, hundredths] = clean.split(".");
  return Number(sec) * 1_000 + Number(hundredths ?? "0") * 10;
}

function detectCourse(text: string): "LCM" | "SCM" | "SCY" | "UNKNOWN" {
  const t = text.toLowerCase();
  if (t.includes("meter") || t.includes("long course") || t.includes("lcm")) return "LCM";
  if (t.includes("25 meter") || t.includes("short course meters") || t.includes("scm")) return "SCM";
  if (t.includes("yard") || t.includes("scy")) return "SCY";
  return "UNKNOWN";
}

function extractEventName(lines: string[]): string | null {
  const strokeRe = /freestyle|backstroke|breaststroke|butterfly|medley|free|back|breast|fly|\bim\b/i;
  const distRe = /\b(50|100|200|400|800|1500)\b/;
  for (const line of lines.slice(0, 15)) {
    if (!strokeRe.test(line) || !distRe.test(line)) continue;
    const distMatch = line.match(distRe);
    const dist = distMatch?.[1];
    const l = line.toLowerCase();
    let stroke = null;
    if (l.includes("freestyle") || / free\b/.test(l)) stroke = "Freestyle";
    else if (l.includes("butterfly") || / fly\b/.test(l)) stroke = "Butterfly";
    else if (l.includes("backstroke") || / back\b/.test(l)) stroke = "Backstroke";
    else if (l.includes("breaststroke") || / breast\b/.test(l)) stroke = "Breaststroke";
    else if (l.includes("individual medley") || / medley\b/.test(l) || / im\b/.test(l)) stroke = "IM";
    if (dist && stroke) return `${dist} ${stroke}`;
  }
  return null;
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

function extractMeetName(lines: string[]): string | null {
  const meetRe = /championship|championships|open|invitational|junior|juniors|classic|cup|trophy|gala|national|regional|age.?group|series|aquatic|swim.?meet/i;
  for (const line of lines) {
    const m = line.match(/^EVENT\s+(.+)$/i);
    if (m && m[1].length >= 4 && !/^\d+$/.test(m[1])) return m[1].trim();
  }
  for (const line of lines.slice(0, 20)) {
    if (line.length < 5 || line.length > 100) continue;
    if (/\b(am|pm)\b/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/place|lane|heat|time|dropped|club/i.test(line)) continue;
    if (line.split(/\s+/).length < 2) continue;
    if (meetRe.test(line)) return line.trim();
  }
  return null;
}

// ✅ Extract place number — handles all real OCR variants:
//   "4 CSC..."     → 4   (plain number)
//   "(9) TLSC..."  → 9   (bracketed)
//   "4A aAas..."   → 4   (number + letter suffix e.g. "4A")
//   "6G spasio..." → 6   (number + letter suffix e.g. "6G")
//   "/ ssclio..."  → 7   ("/" misread as 7 — treat as no match, handled separately)
//   "10 SSC..."    → 10  (two digit)
function extractPlaceFromLine(line: string): number | null {
  const s = line.trim();

  // Bracketed: "(9)" or "(10)"
  const bracketMatch = s.match(/^\((\d{1,3})\)/);
  if (bracketMatch) {
    const n = parseInt(bracketMatch[1], 10);
    return isNaN(n) ? null : n;
  }

  // Number optionally followed by a letter: "4A", "6G", "10", "4"
  // ✅ KEY FIX: \d{1,3}[A-Za-z]? — allows optional letter suffix after place number
  const plainMatch = s.match(/^(\d{1,3})[A-Za-z]?\s/);
  if (plainMatch) {
    const n = parseInt(plainMatch[1], 10);
    return isNaN(n) || n < 1 || n > 999 ? null : n;
  }

  return null;
}

// ✅ Extract club and age from the place line
// Handles: "4 CSC [10 TIME", "(9) TLSC | 10 TIME", "4A aAas|10 TIME", "/ ssclio TIVE"
function extractClubAge(line: string): { club: string | null; age: number | null } {
  let rest = line
    .replace(/^\(\d{1,3}\)\s*/, "")      // remove "(9) "
    .replace(/^\d{1,3}[A-Za-z]?\s+/, "") // remove "4 " or "4A "
    .replace(/^\/\s*/, "")               // remove leading "/" (OCR misread of 7)
    .replace(/\s*T?I?V?E?\s*$/i, "")    // remove trailing "TIME" or "TIVE" (OCR mangling)
    .replace(/\s*TIME\s*$/i, "")
    .trim();

  // Extract age — usually at end as "[10", "| 10", or just "10"
  const ageMatch = rest.match(/[\[|,\s]+(\d{1,2})\s*$/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    const rawClub = rest.slice(0, ageMatch.index).replace(/[\[|,\s]+$/, "").trim();
    // Clean up club name — remove non-alpha chars except spaces and hyphens
    const club = rawClub.replace(/[^A-Za-z\s\-]/g, "").trim() || null;
    return { club, age: isNaN(age) ? null : age };
  }

  const club = rest.replace(/[^A-Za-z\s\-]/g, "").trim() || null;
  return { club, age: null };
}

// ✅ Check if a line is a PLACE line — also handles "PACE" (OCR dropped the L)
function isPlaceLine(line: string): boolean {
  // "PLACE Foo Bar 1:24.66" or "PACE Foo Bar 43.85"
  return /^P[LA]?A?C?E?\s+[A-Za-z]/i.test(line) && /^PA?C?E?\s+[A-Za-z]/i.test(line);
}

// More reliable check
function startsWithPlace(line: string): boolean {
  // Matches "PLACE", "PACE" (missing L), at start of line followed by a name character
  return /^(?:PLACE|PACE)\s+[A-Za-z]/i.test(line);
}

export function parseEventResultsOCR(rawText: string): ParsedEventResults {
  const lines = rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const course = detectCourse(rawText);
  const swamAt = extractMeetDate(rawText);
  const meetName = extractMeetName(lines);
  const event = extractEventName(lines);

  const results: EventResultRow[] = [];

  // Time pattern at end of line — handles normal and mangled formats
  // ✅ Also handles pipe-separated: "Tessa Ng | 43.85"
  const timeAtEndRe = /[\s|]*(\d{1}:\d{4}|\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2}|\d{4,5})$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ✅ Match "PLACE" or "PACE" (OCR sometimes drops the L)
    if (!startsWithPlace(line)) continue;

    // Everything after "PLACE " or "PACE "
    const afterPlace = line.replace(/^(?:PLACE|PACE)\s+/i, "").trim();

    // Find time at end of line
    const timeMatch = afterPlace.match(timeAtEndRe);
    if (!timeMatch) continue;

    const rawTimeStr = timeMatch[1];
    const timeStr = repairTime(rawTimeStr);
    if (!timeStr) continue;

    const timeMs = timeToMs(timeStr);
    if (timeMs <= 0 || timeMs > 1_800_000) continue;

    // Name is everything before the time (and optional pipe separator)
    const nameRaw = afterPlace.slice(0, afterPlace.search(timeAtEndRe)).trim();
    // Clean trailing pipe or spaces from name
    const name = nameRaw.replace(/[\s|]+$/, "").trim();
    if (!name || name.length < 2) continue;

    // Look at next 1-2 lines for place number and club
    let place: number | null = null;
    let club: string | null = null;
    let age: number | null = null;

    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const next = lines[j];

      // Skip dropped/improvement/star lines
      if (/dropped|improvement|\*|\[>/i.test(next)) continue;
      // Skip if it's another PLACE/PACE line
      if (startsWithPlace(next)) break;

      // ✅ Handle "/" as a mangled place number line (OCR read "7" as "/")
      // If line starts with "/" treat it as a place line we can't extract number from
      if (/^\/\s+/.test(next)) {
        // Try to infer place from results length + 1
        place = results.length + 1;
        const clubAge = extractClubAge(next);
        club = clubAge.club;
        age = clubAge.age;
        break;
      }

      const p = extractPlaceFromLine(next);
      if (p !== null) {
        place = p;
        const clubAge = extractClubAge(next);
        club = clubAge.club;
        age = clubAge.age;
        break;
      }
    }

    if (place === null) place = results.length + 1; // infer from position

    results.push({ place, name, club, age, timeStr, timeMs, event, course, swamAt, meetName });
  }

  // Sort by place
  results.sort((a, b) => a.place - b.place);

  // Deduplicate by name
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { event, course, swamAt, meetName, results: deduped };
}

// ✅ Detect event results page — also handles "PACE" (OCR dropped L from PLACE)
export function isEventResultsPage(rawText: string): boolean {
  const lines = rawText.split("\n").map((l) => l.trim());
  const placeLines = lines.filter((l) => /^(?:PLACE|PACE)\s+[A-Za-z]/i.test(l));
  return placeLines.length >= 2;
}