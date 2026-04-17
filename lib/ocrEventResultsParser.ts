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
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(s)) return s;
  if (/^\d{2}\.\d{2}$/.test(s)) return s;
  if (/^\d{1}:\d{4}$/.test(s)) return `${s[0]}:${s.slice(2, 4)}.${s.slice(4)}`;
  if (/^\d{5}$/.test(s)) return `${s[0]}:${s.slice(1, 3)}.${s.slice(3)}`;
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

// ✅ Extract age group from the event header or section header.
// Used as a fallback when individual club/age lines can't be parsed cleanly.
//
// Handles:
//   "10 Year Olds"              → 10
//   "Girls 9-10 50 Meter Free"  → 10 (upper bound of range)
//   "Boys 11-12 100 Backstroke" → 12
function extractAgeGroupFromText(rawText: string): number | null {
  // "10 Year Olds" — Meet Mobile section header (most reliable)
  const yearOldsMatch = rawText.match(/\b(\d{1,2})\s+[Yy]ear\s+[Oo]lds?\b/);
  if (yearOldsMatch) {
    const age = parseInt(yearOldsMatch[1], 10);
    if (age >= 6 && age <= 18) return age;
  }

  // "Girls 9-10" or "Boys 11-12" in event title
  const ageRangeMatch = rawText.match(/(?:Girls|Boys|Women|Men)\s+(\d{1,2})-(\d{1,2})/i);
  if (ageRangeMatch) {
    const upper = parseInt(ageRangeMatch[2], 10);
    if (upper >= 6 && upper <= 18) return upper;
  }

  // Single age: "Girls 10 50 Meter Free"
  const singleAgeMatch = rawText.match(
    /(?:Girls|Boys|Women|Men)\s+(\d{1,2})\s+(?:\d+\s+)?(?:Meter|Yard|Free|Back|Breast|Fly|IM)/i
  );
  if (singleAgeMatch) {
    const age = parseInt(singleAgeMatch[1], 10);
    if (age >= 6 && age <= 18) return age;
  }

  return null;
}

// ✅ Apply age-group fallback to swimmers where age is null.
function applyAgeGroupFallback(results: EventResultRow[], rawText: string): EventResultRow[] {
  if (!results.some((r) => r.age === null)) return results;
  const fallbackAge = extractAgeGroupFromText(rawText);
  if (fallbackAge === null) return results;
  return results.map((r) => (r.age === null ? { ...r, age: fallbackAge } : r));
}

// ✅ Extract place number — handles all real OCR variants
function extractPlaceFromLine(line: string): number | null {
  const s = line.trim();
  const bracketMatch = s.match(/^\((\d{1,3})\)/);
  if (bracketMatch) {
    const n = parseInt(bracketMatch[1], 10);
    return isNaN(n) ? null : n;
  }
  const plainMatch = s.match(/^(\d{1,3})[A-Za-z]?\s/);
  if (plainMatch) {
    const n = parseInt(plainMatch[1], 10);
    return isNaN(n) || n < 1 || n > 999 ? null : n;
  }
  return null;
}

// ✅ Extract club and age from the place/club line.
//
// KEY FIXES applied here:
//   1. Proper TIME stripping — old regex only stripped trailing 'E', leaving 'TIM'
//   2. OCR garble detection: "CSC | 10" often reads as "csclio":
//        l = "|" (pipe), i = "1", o = "0"  → suffix "lio" = age 10
//        suffix "lo" = likely age 10
//        suffix "io" = likely age 10
//   3. "AcEl" pattern: "ACE | 1[0]" where final 0 dropped by OCR → age ambiguous
function extractClubAge(line: string): { club: string | null; age: number | null } {
  let rest = line
    .replace(/^\(\d{1,3}\)\s*/, "")          // remove "(9) "
    .replace(/^\d{1,3}[A-Za-z]?\s+/, "")     // remove "4 " or "4A "
    .replace(/^\/\s*/, "")                    // remove leading "/"
    .replace(/\s*\b(?:TIME|TIVE|TIIME|TIM)\b\s*$/i, "") // ✅ strip all TIME variants
    .trim();

  // Strategy 1: Clean separator — "CSC | 10" or "TLSC | 10"
  const ageMatch = rest.match(/[\[|,\s]+(\d{1,2})\s*$/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    const rawClub = rest.slice(0, ageMatch.index).replace(/[\[|,\s]+$/, "").trim();
    const club = rawClub.replace(/[^A-Za-z\s\-]/g, "").trim() || null;
    return { club, age: isNaN(age) ? null : age };
  }

  // Strategy 2: All-alpha string — check for OCR garble of "| 10"
  // "csclio" → l=|, i=1, o=0 → age=10, club="CSC"
  // "aqlio"  → age=10, club="AQ" (J dropped by OCR)
  // "APSCio" → age=10, club="APSC"
  const onlyAlpha = /^[A-Za-z]+$/.test(rest);
  if (onlyAlpha && rest.length >= 4) {
    // "lio" suffix — most reliable (pipe + 1 + 0)
    const lioMatch = rest.match(/^([A-Za-z]{2,6}?)(lio)$/i);
    if (lioMatch && lioMatch[1].length >= 2) {
      return { club: lioMatch[1].toUpperCase(), age: 10 };
    }
    // "lo" suffix
    const loMatch = rest.match(/^([A-Za-z]{2,6}?)(lo)$/i);
    if (loMatch && loMatch[1].length >= 2) {
      return { club: loMatch[1].toUpperCase(), age: 10 };
    }
    // "io" suffix
    const ioMatch = rest.match(/^([A-Za-z]{3,6}?)(io)$/i);
    if (ioMatch && ioMatch[1].length >= 2) {
      return { club: ioMatch[1].toUpperCase(), age: 10 };
    }
    // "El" or "el" suffix — e.g. "AcEl" from "ACE | 1[0]" where 0 was cut off
    const elMatch = rest.match(/^([A-Za-z]{2,5})([Ee][Ll]|[Ll][Ee])$/);
    if (elMatch && elMatch[1].length >= 2) {
      return { club: elMatch[1].toUpperCase(), age: null }; // age ambiguous — fallback will apply
    }
  }

  // Strategy 3: Return whatever's left as the club name
  const club = rest.replace(/[^A-Za-z\s\-]/g, "").trim() || null;
  return { club, age: null };
}

function startsWithPlace(line: string): boolean {
  return /^(?:PLACE|PACE)\s+[A-Za-z]/i.test(line);
}

export function parseEventResultsOCR(rawText: string): ParsedEventResults {
  const lines = rawText.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);

  // Try NSG card format (standalone PLACE lines)
  const standalonePlaceLines = lines.filter((l) => /^(?:PLACE|PACE)$/i.test(l));
  const numberedPlaceLines = lines.filter((l) => /^(?:PLACE|PACE)\s+\d{1,3}$/i.test(l));
  if (standalonePlaceLines.length >= 2 || numberedPlaceLines.length >= 2) {
    const nsgResult = parseNSGCardFormat(rawText);
    if (nsgResult.results.length > 0) {
      nsgResult.results = applyAgeGroupFallback(nsgResult.results, rawText);
      return nsgResult;
    }
  }

  // Try Name+Time format
  const timeAtEndRe = /\s(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})$/;
  const clubLineRe = /[A-Z]{2,8}\s*(?:lio|lo|io|clo)?\s*(?:\|?\s*\d{1,2})?\s*(?:TIME|TIVE|TIM)?\s*$/i;
  let nameTimePairs = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (timeAtEndRe.test(lines[i]) && clubLineRe.test(lines[i + 1])) nameTimePairs++;
  }
  if (nameTimePairs >= 2) {
    const ntResult = parseNameTimeFormat(rawText);
    if (ntResult.results.length > 0) {
      ntResult.results = applyAgeGroupFallback(ntResult.results, rawText);
      return ntResult;
    }
  }

  // Inline PLACE format
  const inlineResult = parseInlineEventResultsOCR(rawText);
  inlineResult.results = applyAgeGroupFallback(inlineResult.results, rawText);
  return inlineResult;
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
  const timeAtEndRe = /[\s|]*(\d{1}:\d{4}|\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2}|\d{4,5})$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!startsWithPlace(line)) continue;

    const afterPlace = line.replace(/^(?:PLACE|PACE)\s+/i, "").trim();
    const timeMatch = afterPlace.match(timeAtEndRe);
    if (!timeMatch) continue;

    const timeStr = repairTime(timeMatch[1]);
    if (!timeStr) continue;
    const timeMs = timeToMs(timeStr);
    if (timeMs <= 0 || timeMs > 1_800_000) continue;

    const nameRaw = afterPlace.slice(0, afterPlace.search(timeAtEndRe)).trim();
    const name = nameRaw.replace(/[\s|]+$/, "").trim();
    if (!name || name.length < 2) continue;

    let place: number | null = null;
    let club: string | null = null;
    let age: number | null = null;

    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const next = lines[j];
      if (/dropped|improvement|\*|\[>/i.test(next)) continue;
      if (startsWithPlace(next)) break;
      if (/^\/\s+/.test(next)) {
        place = results.length + 1;
        const ca = extractClubAge(next);
        club = ca.club; age = ca.age;
        break;
      }
      const p = extractPlaceFromLine(next);
      if (p !== null) {
        place = p;
        const ca = extractClubAge(next);
        club = ca.club; age = ca.age;
        break;
      }
    }

    if (place === null) place = results.length + 1;
    results.push({ place, name, club, age, timeStr, timeMs, event, course, swamAt, meetName });
  }

  results.sort((a, b) => a.place - b.place);
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { event, course, swamAt, meetName, results: deduped };
}

export function isEventResultsPage(rawText: string): boolean {
  const lines = rawText.split("\n").map((l) => l.trim());
  if (lines.filter((l) => /^(?:PLACE|PACE)\s+[A-Za-z]/i.test(l)).length >= 2) return true;
  if (lines.filter((l) => /^(?:PLACE|PACE)$/i.test(l)).length >= 2) return true;
  if (lines.filter((l) => /^(?:PLACE|PACE)\s+\d{1,3}$/i.test(l)).length >= 2) return true;

  const timeAtEndRe = /\s(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})$/;
  const clubLineRe = /[A-Z]{2,8}\s*(?:lio|lo|io|clo)?\s*(?:\|?\s*\d{1,2})?\s*(?:TIME|TIVE|TIM)?\s*$/i;
  let pairs = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (timeAtEndRe.test(lines[i]) && clubLineRe.test(lines[i + 1])) pairs++;
  }
  return pairs >= 2;
}

function parseNameTimeFormat(rawText: string): ParsedEventResults {
  const lines = rawText.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const course = detectCourse(rawText);
  const swamAt = extractMeetDate(rawText);
  const meetName = extractMeetName(lines);
  const event = extractEventName(lines);
  const results: EventResultRow[] = [];
  const timeAtEndRe = /\s(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})$/;
  const clubLineRe = /^([A-Za-z]{2,8})\s*(?:\|?\s*(\d{1,2}))?\s*(?:TIME|TIVE|TIM)?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timeMatch = line.match(timeAtEndRe);
    if (!timeMatch) continue;
    const nextLine = lines[i + 1] ?? "";
    const clubMatch = nextLine.match(clubLineRe);
    if (!clubMatch) continue;

    const timeStr = timeMatch[1];
    const timeMs = timeToMs(timeStr);
    if (timeMs <= 0 || timeMs > 1_800_000) continue;

    const name = line.slice(0, line.lastIndexOf(timeMatch[0])).trim();
    if (!name || name.length < 3) continue;
    if (/^\d|finals|results|completed|heats|swimmers|unofficial|am|pm/i.test(name)) continue;

    // Use extractClubAge for consistency — handles garble patterns
    const ca = extractClubAge(nextLine);
    let club = ca.club;
    let age = ca.age;

    // Fallback to clean regex match if extractClubAge got confused
    if (!age && clubMatch[2]) {
      club = clubMatch[1].trim().toUpperCase();
      age = parseInt(clubMatch[2], 10);
    }

    results.push({ place: results.length + 1, name, club, age, timeStr, timeMs, event, course, swamAt, meetName });
    i++;
  }

  return { event, course, swamAt, meetName, results };
}

function parseNSGCardFormat(rawText: string): ParsedEventResults {
  const lines = rawText.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const course = detectCourse(rawText);
  const swamAt = extractMeetDate(rawText);
  const meetName = extractMeetName(lines);
  const event = extractEventName(lines);
  const results: EventResultRow[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isPlaceStandalone = /^(?:PLACE|PACE)$/i.test(line);
    const isPlaceNumbered = /^(?:PLACE|PACE)\s+\d{1,3}$/i.test(line);
    if (!isPlaceStandalone && !isPlaceNumbered) { i++; continue; }

    let place: number | null = null;
    let nameIdx = i + 1;

    if (isPlaceNumbered) {
      const m = line.match(/\d{1,3}/);
      if (m) place = parseInt(m[0], 10);
    } else {
      const nextLine = lines[i + 1] ?? "";
      if (/^\d{1,3}$/.test(nextLine.trim())) {
        place = parseInt(nextLine.trim(), 10);
        nameIdx = i + 2;
      }
    }

    let name = "";
    let club: string | null = null;
    let age: number | null = null;
    let timeStr: string | null = null;
    let timeMs = 0;

    for (let j = nameIdx; j < Math.min(nameIdx + 6, lines.length); j++) {
      const l = lines[j];
      if (/^(?:PLACE|PACE)/i.test(l)) break;
      if (/dropped|improvement|★|▷/i.test(l)) continue;
      if (/^(?:TIME|TIVE|TIM)$/i.test(l)) continue;
      if (/completed|finals|unofficial|heats|swimmers/i.test(l)) continue;

      const timeMatch = l.match(/^(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2}|\d{4,5})$/);
      if (timeMatch && !timeStr) {
        const repaired = repairTime(timeMatch[1]);
        if (repaired) { timeStr = repaired; timeMs = timeToMs(repaired); }
        continue;
      }

      const clubAgeMatch = l.match(/^([A-Z]{2,6})\s*[|]\s*(\d{1,2})$/i);
      if (clubAgeMatch) {
        club = clubAgeMatch[1].trim().toUpperCase();
        age = parseInt(clubAgeMatch[2], 10);
        continue;
      }

      if (!name && l.length >= 3 && /[A-Za-z]/.test(l) && !/^\d+$/.test(l)) {
        name = l.trim();
      }
    }

    if (name && timeStr && timeMs > 0 && timeMs < 1_800_000) {
      results.push({ place: place ?? results.length + 1, name, club, age, timeStr, timeMs, event, course, swamAt, meetName });
    }

    i++;
  }

  results.sort((a, b) => a.place - b.place);
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { event, course, swamAt, meetName, results: deduped };
}