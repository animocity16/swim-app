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
  let result: string | null = null;
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(s)) result = s;
  else if (/^\d{2}\.\d{2}$/.test(s)) result = s;
  else if (/^\d{1}\.\d{4}$/.test(s)) {
    // OCR misread the colon as a period: "2.4767" really means "2:47.67"
    const digits = s.replace(".", "");
    result = `${digits[0]}:${digits.slice(1, 3)}.${digits.slice(3)}`;
  }
  else if (/^\d{1}:\d{4}$/.test(s)) result = `${s[0]}:${s.slice(2, 4)}.${s.slice(4)}`;
  else if (/^\d{5}$/.test(s)) result = `${s[0]}:${s.slice(1, 3)}.${s.slice(3)}`;
  else if (/^\d{4}$/.test(s)) result = `${s.slice(0, 2)}.${s.slice(2)}`;
  else if (/^\d{3}$/.test(s)) {
    // 3-digit OCR misread: "341" from "34.10" or "34.11"
    // If first two digits look like valid seconds (10-99), treat as SS.T0
    const firstTwo = Number(s.slice(0, 2));
    if (firstTwo >= 10 && firstTwo <= 99) result = `${s.slice(0, 2)}.${s.slice(2)}0`;
    else result = `${s[0]}.${s.slice(1)}`;
  }
  // Fix OCR misread seconds >= 60 (e.g. 1:65.02 → 1:55.02)
  if (result) {
    const m = result.match(/^(\d+):(\d{2})\.(\d{2})$/);
    if (m) {
      const sec = Number(m[2]);
      if (sec >= 60) {
        const fixed = sec >= 60 && sec < 70 ? sec - 10 : sec % 60;
        result = `${m[1]}:${String(fixed).padStart(2, "0")}.${m[3]}`;
      }
    }
  }
  return result;
}

function repairOCRSeconds(sec: number): number {
  // OCR commonly misreads 5→6 in the tens digit of seconds (e.g. 55→65, 58→68).
  // If seconds >= 60, attempt to fix by subtracting 10 (reverses the 5→6 swap).
  if (sec >= 60 && sec < 70) return sec - 10;
  // If still invalid, clamp to 59 as a last resort
  if (sec >= 60) return sec % 60;
  return sec;
}

function timeToMs(timeStr: string): number {
  if (!timeStr) return 0;
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
  for (const rawLine of lines.slice(0, 15)) {
    // Fix OCR merging age range with distance e.g. "Girls 7-12100 Meter IM" → "Girls 7-12 100 Meter IM"
    const line = rawLine.replace(/(\d{1,2})(50|100|200|400|800|1500)(?=\D|$)/g, "$1 $2");
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

function extractAgeGroupFromText(rawText: string): number | null {
  const yearOldsMatch = rawText.match(/\b(\d{1,2})\s+[Yy]ear\s+[Oo]lds?\b/);
  if (yearOldsMatch) {
    const age = parseInt(yearOldsMatch[1], 10);
    if (age >= 6 && age <= 18) return age;
  }
  const ageRangeMatch = rawText.match(/(?:Girls|Boys|Women|Men)\s+(\d{1,2})-(\d{1,2})/i);
  if (ageRangeMatch) {
    const upper = parseInt(ageRangeMatch[2], 10);
    if (upper >= 6 && upper <= 18) return upper;
  }
  const singleAgeMatch = rawText.match(
    /(?:Girls|Boys|Women|Men)\s+(\d{1,2})\s+(?:\d+\s+)?(?:Meter|Yard|Free|Back|Breast|Fly|IM)/i
  );
  if (singleAgeMatch) {
    const age = parseInt(singleAgeMatch[1], 10);
    if (age >= 6 && age <= 18) return age;
  }
  return null;
}

function applyAgeGroupFallback(results: EventResultRow[], rawText: string): EventResultRow[] {
  if (!results.some((r) => r.age === null)) return results;
  const fallbackAge = extractAgeGroupFromText(rawText);
  if (fallbackAge === null) return results;
  return results.map((r) => (r.age === null ? { ...r, age: fallbackAge } : r));
}

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

function extractClubAge(line: string): { club: string | null; age: number | null } {
  // Normalise OCR garbling in club|age separator before parsing
  // "X|[10" → "X | 10",  "APSC [10" → "APSC | 10"
  const preCleaned = line
    .replace(/\|\s*\[/g, " | ")
    .replace(/\[(\d)/g, "| $1")
    .replace(/\|(\d)/g, "| $1");
  let rest = preCleaned
    .replace(/^\(\d{1,3}\)\s*/, "")
    .replace(/^\d{1,3}[A-Za-z]?\s+/, "")
    .replace(/^\/\s*/, "")
    .replace(/\s*\b(?:TIME|TIVE|TIIME|TIM)\b\s*$/i, "")
    .trim();

  const ageMatch = rest.match(/[\[|,\s]+(\d{1,2})\s*$/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    const rawClub = rest.slice(0, ageMatch.index).replace(/[\[|,\s]+$/, "").trim();
    const clubClean = rawClub.replace(/[^A-Za-z\s\-]/g, "").trim();
    // Single uppercase letter is a valid club code (e.g. "X" used in SAQ meets)
    const club = clubClean.length >= 1 ? clubClean : null;
    return { club, age: isNaN(age) ? null : age };
  }

  const onlyAlpha = /^[A-Za-z]+$/.test(rest);
  if (onlyAlpha && rest.length >= 4) {
    const lioMatch = rest.match(/^([A-Za-z]{2,6}?)(lio)$/i);
    if (lioMatch && lioMatch[1].length >= 2) return { club: lioMatch[1].toUpperCase(), age: 10 };
    const loMatch = rest.match(/^([A-Za-z]{2,6}?)(lo)$/i);
    if (loMatch && loMatch[1].length >= 2) return { club: loMatch[1].toUpperCase(), age: 10 };
    const ioMatch = rest.match(/^([A-Za-z]{3,6}?)(io)$/i);
    if (ioMatch && ioMatch[1].length >= 2) return { club: ioMatch[1].toUpperCase(), age: 10 };
    const elMatch = rest.match(/^([A-Za-z]{2,5})([Ee][Ll]|[Ll][Ee])$/);
    if (elMatch && elMatch[1].length >= 2) return { club: elMatch[1].toUpperCase(), age: null };
  }

  const club = rest.replace(/[^A-Za-z\s\-]/g, "").trim() || null;
  return { club, age: null };
}

function startsWithPlace(line: string): boolean {
  return /^(?:PLACE|PACE)\s+[A-Za-z]/i.test(line);
}

export function parseEventResultsOCR(rawText: string): ParsedEventResults {
  const lines = rawText.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);

  const standalonePlaceLines = lines.filter((l) => /^(?:PLACE|PACE)$/i.test(l));
  const numberedPlaceLines = lines.filter((l) => /^(?:PLACE|PACE)\s+\d{1,3}$/i.test(l));
  if (standalonePlaceLines.length >= 2 || numberedPlaceLines.length >= 2) {
    const nsgResult = parseNSGCardFormat(rawText);
    if (nsgResult.results.length > 0) {
      nsgResult.results = applyAgeGroupFallback(nsgResult.results, rawText);
      return nsgResult;
    }
  }

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

// ✅ Detect whether OCR text is a multi-swimmer event results page.
//
// CRITICAL: The Meet Mobile single-swimmer "Swim Detail" screen contains
// column labels (FINALS, ENTRY, STATUS, DROPPED, SPLITS, EVENT SUMMARY)
// that can fool the PLACE-counting heuristics into thinking it's a results list.
//
// We collapse ALL whitespace before matching because Tesseract often splits
// a single UI label across multiple lines — e.g. "SWIM DETAIL" → "SWIM\nDETAIL"
// which makes a plain .includes("SWIM DETAIL") check silently fail.
export function isEventResultsPage(rawText: string): boolean {
  // Collapse all whitespace into single spaces for reliable multi-word matching
  const flat = rawText.replace(/\s+/g, " ").toUpperCase();

  // ── Guard 1: "SWIM DETAIL" — the screen title, strongest single signal ──
  if (flat.includes("SWIM DETAIL")) return false;

  // ── Guard 2: "EVENT SUMMARY" — button at bottom of every detail screen ──
  if (flat.includes("EVENT SUMMARY")) return false;

  // ── Guard 3: "Completed" status + SPLITS — only on detail screens ──
  if (flat.includes("COMPLETED") && flat.includes("SPLITS")) return false;

  // ── Guard 4: Detail-screen column header combo ──
  // "PLACE FINALS ENTRY" and "STATUS DROPPED" never appear on results lists
  const hasFinalsEntry = flat.includes("FINALS") && flat.includes("ENTRY");
  const hasStatusDropped = flat.includes("STATUS") && flat.includes("DROPPED");
  if (hasFinalsEntry && hasStatusDropped) return false;

  // ── Guard 5: FINALS + ENTRY + SPLITS ──
  if (hasFinalsEntry && flat.includes("SPLITS")) return false;

  // ── Guard 6: HEAT PLACE + LANE + SPLITS — detail screen grid labels ──
  if (flat.includes("HEAT PLACE") && flat.includes("LANE") && flat.includes("SPLITS")) return false;

  // ── Guard 7: Looser fallback — HEAT + LANE + SPLITS + TOTAL ──
  if (
    flat.includes("HEAT") &&
    flat.includes("LANE") &&
    flat.includes("SPLITS") &&
    flat.includes("TOTAL")
  ) return false;

  // ── Multi-swimmer detection (unchanged) ──
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
  if (pairs >= 2) return true;

  // ── Multi-swimmer detection, layout variant: name, time, and club each on
  // their own separate line (rather than "Name ... Time" combined on one
  // line). Some Meet Mobile screens — observed on a 200 IM results table —
  // render this way, and the pairing heuristic above never fires for it.
  const nameOnlyLineRe = /^[A-Za-z][A-Za-z'.\- ]{4,40}$/;
  const standaloneTimeLineRe = /^(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})$/;
  let namePlusTimePairs = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (nameOnlyLineRe.test(lines[i]) && lines[i].includes(" ") && standaloneTimeLineRe.test(lines[i + 1])) {
      namePlusTimePairs++;
    }
  }
  return namePlusTimePairs >= 2;
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

    const ca = extractClubAge(nextLine);
    let club = ca.club;
    let age = ca.age;

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

      const timeMatch = l.match(/^(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2}|\d{1}\.\d{4}|\d{3,5})$/);
      if (timeMatch && !timeStr) {
        const repaired = repairTime(timeMatch[1]);
        if (repaired) { timeStr = repaired; timeMs = timeToMs(repaired); }
        continue;
      }

      // Pre-clean garbled separators before club/age matching
      // "X|[10" → "X | 10", "APSC [10" → "APSC | 10"
      const lClean = l
        .replace(/\|\s*\[/g, " | ")
        .replace(/\[(\d)/g, "| $1")
        .replace(/\|(\d)/g, "| $1");
      const clubAgeMatch = lClean.match(/^([A-Z]{1,6})\s*[|]\s*(\d{1,2})$/i);
      if (clubAgeMatch) {
        club = clubAgeMatch[1].trim().toUpperCase();
        age = parseInt(clubAgeMatch[2], 10);
        continue;
      }
      // Fallback: no separator at all, just "CSC 10" — only trust this when
      // the trailing number is a sane swimmer age, to avoid misreading
      // unrelated short numeric lines as club+age.
      const clubAgePlainMatch = lClean.match(/^([A-Za-z]{2,6})\s+(\d{1,2})$/);
      if (clubAgePlainMatch) {
        const plainAge = parseInt(clubAgePlainMatch[2], 10);
        if (plainAge >= 5 && plainAge <= 18) {
          club = clubAgePlainMatch[1].trim().toUpperCase();
          age = plainAge;
          continue;
        }
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