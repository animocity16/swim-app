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
  const plainMatch = s.match(/^(\d{1,3})[A-Za-z]?\s/);
  if (plainMatch) {
    const n = parseInt(plainMatch[1], 10);
    return isNaN(n) || n < 1 || n > 999 ? null : n;
  }

  return null;
}

// ✅ Extract club and age from the place line
// Handles: "4 CSC | 10 TIME", "(9) TLSC | 10 TIME", "4A aAas|10 TIME", "/ ssclio TIVE"
//
// KEY FIX: The previous regex T?I?V?E? only stripped the trailing 'E' from "TIME",
// leaving "TIM" in the club name. Now uses explicit word-boundary match for all TIME variants.
// Also strips OCR artifacts where "CSC | 10" is read as "csclio" (merging "|10").
function extractClubAge(line: string): { club: string | null; age: number | null } {
  let rest = line
    .replace(/^\(\d{1,3}\)\s*/, "")          // remove "(9) "
    .replace(/^\d{1,3}[A-Za-z]?\s+/, "")     // remove "4 " or "4A "
    .replace(/^\/\s*/, "")                    // remove leading "/" (OCR misread of 7)
    .replace(/\s*\b(?:TIME|TIVE|TIIME|TIM)\b\s*$/i, "") // ✅ strip all TIME/TIVE/TIM variants
    .trim();

  // Strategy 1: Separator-based age extraction — "CSC | 10" or "TLSC | 10"
  const ageMatch = rest.match(/[\[|,\s]+(\d{1,2})\s*$/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    const rawClub = rest.slice(0, ageMatch.index).replace(/[\[|,\s]+$/, "").trim();
    const club = rawClub.replace(/[^A-Za-z\s\-]/g, "").trim() || null;
    return { club, age: isNaN(age) ? null : age };
  }

  // Strategy 2: All-alpha rest with no separator — likely OCR garble of "CLUB | 10"
  // OCR commonly reads "CSC | 10" as "csclio", "csclo", "csc|o", "APSCio" etc.
  // The trailing "lio", "lo", "io", "clo" are artifacts of "|10" being merged.
  let club = rest.replace(/[^A-Za-z\s\-]/g, "").trim() || null;
  if (club && club.length > 5 && !/\s/.test(club)) {
    // Strip known trailing OCR artifacts of "| 10"
    const degarbled = club.replace(/(?:c?lio|clo|slo|lo|io)$/i, "").trim();
    if (degarbled.length >= 2) {
      club = degarbled.toUpperCase();
    }
  }

  return { club, age: null };
}

// ✅ Check if a line is a PLACE line — also handles "PACE" (OCR dropped the L)
function isPlaceLine(line: string): boolean {
  return /^P[LA]?A?C?E?\s+[A-Za-z]/i.test(line) && /^PA?C?E?\s+[A-Za-z]/i.test(line);
}

// More reliable check
function startsWithPlace(line: string): boolean {
  // Matches "PLACE", "PACE" (missing L), at start of line followed by a name character
  return /^(?:PLACE|PACE)\s+[A-Za-z]/i.test(line);
}

export function parseEventResultsOCR(rawText: string): ParsedEventResults {
  const lines = rawText.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);

  // Try NSG card format (standalone PLACE lines)
  const standalonePlaceLines = lines.filter((l) => /^(?:PLACE|PACE)$/i.test(l));
  const numberedPlaceLines = lines.filter((l) => /^(?:PLACE|PACE)\s+\d{1,3}$/i.test(l));
  if (standalonePlaceLines.length >= 2 || numberedPlaceLines.length >= 2) {
    const nsgResult = parseNSGCardFormat(rawText);
    if (nsgResult.results.length > 0) return nsgResult;
  }

  // Try Name+Time format (OCR drops PLACE labels entirely — most common NSG/event page)
  // ✅ Updated clubLineRe to handle OCR garble where "|10" is merged into the club code
  const timeAtEndRe = /\s(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})$/;
  const clubLineRe = /[A-Z]{2,8}\s*(?:lio|lo|io|clo)?\s*(?:\|?\s*\d{1,2})?\s*(?:TIME|TIVE|TIM)?\s*$/i;
  let nameTimePairs = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (timeAtEndRe.test(lines[i]) && clubLineRe.test(lines[i + 1])) nameTimePairs++;
  }
  if (nameTimePairs >= 2) {
    const ntResult = parseNameTimeFormat(rawText);
    if (ntResult.results.length > 0) return ntResult;
  }

  // Fall through to classic inline PLACE format
  return parseInlineEventResultsOCR(rawText);
}

function parseInlineEventResultsOCR(rawText: string): ParsedEventResults {
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
      if (/^\/\s+/.test(next)) {
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

  // Format 1: "PLACE Swimmer Name 36.39" — classic Meet Mobile event rankings
  const inlinePlaceLines = lines.filter((l) => /^(?:PLACE|PACE)\s+[A-Za-z]/i.test(l));
  if (inlinePlaceLines.length >= 2) return true;

  // Format 2: NSG card layout — "PLACE" on its own line
  const standalonePlaceLines = lines.filter((l) => /^(?:PLACE|PACE)$/i.test(l));
  if (standalonePlaceLines.length >= 2) return true;

  // Format 3: "PLACE 1", "PLACE 2" etc
  const numberedPlaceLines = lines.filter((l) => /^(?:PLACE|PACE)\s+\d{1,3}$/i.test(l));
  if (numberedPlaceLines.length >= 2) return true;

  // Format 4: NSG card where OCR drops PLACE labels entirely
  // Produces: "Swimmer Name 36.39" then "CLUB | age TIME" on next line
  // ✅ Updated to handle OCR garble ("csclio TIME", "APSC TIM" etc)
  const timeAtEndRe = /\s(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})$/;
  const clubLineRe = /[A-Z]{2,8}\s*(?:lio|lo|io|clo)?\s*(?:\|?\s*\d{1,2})?\s*(?:TIME|TIVE|TIM)?\s*$/i;
  let nameTimePairs = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (timeAtEndRe.test(lines[i]) && clubLineRe.test(lines[i + 1])) {
      nameTimePairs++;
    }
  }
  if (nameTimePairs >= 2) return true;

  return false;
}

// Parse NSG format where OCR drops PLACE labels:
// "Swimmer Name 36.39"
// "MGS | 10 TIME"
// "Dropped: – 0.11"  (optional)
function parseNameTimeFormat(rawText: string): ParsedEventResults {
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
  const timeAtEndRe = /\s(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})$/;
  // ✅ Updated to handle OCR garble: "csclio TIME", "APSC TIM", "CSC | 10 TIME"
  const clubLineRe = /^([A-Za-z]{2,8})\s*(?:\|?\s*(\d{1,2}))?\s*(?:TIME|TIVE|TIM)?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timeMatch = line.match(timeAtEndRe);
    if (!timeMatch) continue;

    const nextLine = lines[i + 1] ?? "";
    const clubMatch = nextLine.match(clubLineRe);
    // Must have a club/TIME line right after to confirm this is a swimmer row
    if (!clubMatch) continue;

    const timeStr = timeMatch[1];
    const timeMs = timeToMs(timeStr);
    if (timeMs <= 0 || timeMs > 1_800_000) continue;

    // Name is everything before the time
    const name = line.slice(0, line.lastIndexOf(timeMatch[0])).trim();
    if (!name || name.length < 3) continue;
    // Skip non-name lines (event headers, meet info etc)
    if (/^\d|finals|results|completed|heats|swimmers|unofficial|am|pm/i.test(name)) continue;

    // ✅ Extract club — handle garbled "|10" merges
    let club = clubMatch[1]?.trim() ?? null;
    if (club && club.length > 5 && !/\s/.test(club)) {
      const degarbled = club.replace(/(?:c?lio|clo|slo|lo|io)$/i, "").trim();
      if (degarbled.length >= 2) club = degarbled.toUpperCase();
    }
    const age = clubMatch[2] ? parseInt(clubMatch[2], 10) : null;

    results.push({
      place: results.length + 1,
      name,
      club,
      age,
      timeStr,
      timeMs,
      event,
      course,
      swamAt,
      meetName,
    });

    i++; // skip the club line
  }

  return { event, course, swamAt, meetName, results };
}

// Parse the NSG card-style EVENT DETAILS page
// OCR format per swimmer card:
//   PLACE
//   1
//   Mikaela Yuet Xun Loh         (name — may be on same line as club info)
//   MGS | 10
//   36.39
//   TIME
//   Dropped: - 0.11              (optional)
function parseNSGCardFormat(rawText: string): ParsedEventResults {
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

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect start of a swimmer card: standalone "PLACE" or "PLACE 1" etc.
    const isPlaceStandalone = /^(?:PLACE|PACE)$/i.test(line);
    const isPlaceNumbered = /^(?:PLACE|PACE)\s+\d{1,3}$/i.test(line);

    if (!isPlaceStandalone && !isPlaceNumbered) { i++; continue; }

    // Extract place number
    let place: number | null = null;
    let nameIdx = i + 1;

    if (isPlaceNumbered) {
      const m = line.match(/\d{1,3}/);
      if (m) place = parseInt(m[0], 10);
      nameIdx = i + 1;
    } else {
      // Standalone PLACE — next line should be the number
      const nextLine = lines[i + 1] ?? "";
      if (/^\d{1,3}$/.test(nextLine.trim())) {
        place = parseInt(nextLine.trim(), 10);
        nameIdx = i + 2;
      } else {
        nameIdx = i + 1;
      }
    }

    // Next lines: name, club/age, time
    let name = "";
    let club: string | null = null;
    let age: number | null = null;
    let timeStr: string | null = null;
    let timeMs = 0;

    for (let j = nameIdx; j < Math.min(nameIdx + 6, lines.length); j++) {
      const l = lines[j];

      // Stop at next PLACE card
      if (/^(?:PLACE|PACE)/i.test(l)) break;
      // Skip star/arrow/dropped lines
      if (/dropped|improvement|★|▷/i.test(l)) continue;
      // Skip TIME label
      if (/^(?:TIME|TIVE|TIM)$/i.test(l)) continue;
      // Skip status
      if (/completed|finals|unofficial|heats|swimmers/i.test(l)) continue;

      // Time detection
      const timeMatch = l.match(/^(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2}|\d{4,5})$/);
      if (timeMatch && !timeStr) {
        const repaired = repairTime(timeMatch[1]);
        if (repaired) { timeStr = repaired; timeMs = timeToMs(repaired); }
        continue;
      }

      // Club/age line: "MGS | 10" or "SSC | 9"
      const clubAgeMatch = l.match(/^([A-Z]{2,6})\s*[|]\s*(\d{1,2})$/i);
      if (clubAgeMatch) {
        club = clubAgeMatch[1].trim().toUpperCase();
        age = parseInt(clubAgeMatch[2], 10);
        continue;
      }

      // Name — first non-control line after place that's not a time/club
      if (!name && l.length >= 3 && /[A-Za-z]/.test(l) && !/^\d+$/.test(l)) {
        name = l.trim();
      }
    }

    if (name && timeStr && timeMs > 0 && timeMs < 1_800_000) {
      results.push({
        place: place ?? results.length + 1,
        name,
        club,
        age,
        timeStr,
        timeMs,
        event,
        course,
        swamAt,
        meetName,
      });
    }

    i++;
  }

  results.sort((a, b) => a.place - b.place);

  // Deduplicate
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { event, course, swamAt, meetName, results: deduped };
}