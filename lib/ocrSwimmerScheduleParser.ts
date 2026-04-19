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

function timeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  const s = timeStr.trim();
  if (s.includes(":")) {
    const [mm, rest] = s.split(":");
    const [sec, hun] = rest.split(".");
    if (Number(sec) >= 60) return 0;
    return Number(mm) * 60_000 + Number(sec) * 1_000 + Number(hun ?? "0") * 10;
  }
  const [sec, hun] = s.split(".");
  return Number(sec) * 1_000 + Number(hun ?? "0") * 10;
}

// Repair times:
//   "36.76"  → "36.76"   (valid as-is)
//   "118.03" → "1:18.03" (3 digits before dot = m:ss.hh)
//   "215.72" → "2:15.72"
//   "11803"  → "1:18.03" (5 raw digits)
function repairTime(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(s)) {
    const sec = Number(s.split(":")[1].split(".")[0]);
    if (sec >= 60) return null;
    return s;
  }
  if (/^\d{2}\.\d{2}$/.test(s)) return s;
  if (/^\d{5}$/.test(s)) {
    const sec = Number(s.slice(1, 3));
    if (sec >= 60) return null;
    return `${s[0]}:${s.slice(1, 3)}.${s.slice(3)}`;
  }
  // "118.03" or "215.72" — 3 digits, dot, 2 digits
  if (/^\d{3}\.\d{2}$/.test(s)) {
    const mins = s[0];
    const sec = s.slice(1, 3);
    const hun = s.slice(4);
    if (Number(sec) >= 60) return null;
    return `${mins}:${sec}.${hun}`;
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
  const m = line.match(/\b(50|100|200|400|800|1500)\b/);
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

function extractSwimmerHeader(lines: string[]): {
  name: string | null; club: string | null; age: number | null;
} {
  const scheduleIdx = lines.findIndex((l) => /full.?schedule/i.test(l));
  if (scheduleIdx >= 1) {
    for (let i = scheduleIdx - 1; i >= Math.max(0, scheduleIdx - 3); i--) {
      const line = lines[i].trim();
      const cleaned = line.replace(/^[^A-Z]+/, "").trim();
      const words = cleaned.split(/\s+/);
      if (
        words.length >= 2 && words.length <= 7 &&
        !/\d/.test(cleaned) &&
        words.every((w) => /^[A-Z]/.test(w))
      ) {
        return { name: cleaned, club: null, age: null };
      }
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

function extractTimePlaceFromLine(line: string): {
  timeStr: string; timeMs: number; place: number | null;
} | null {
  const m = line.match(
    /(\d{1,2}:\d{2}\.\d{2}|\d{3}\.\d{2}|\d{2}\.\d{2}|\d{5})\s*\|\s*Place:\s*(\d+|EXH)?/i
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
    if (meetKeywords.test(line)) { meetName = line.trim(); break; }
  }

  const results: ScheduleResultRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isEventDescriptionLine(line)) continue;

    const isRelay = /relay/i.test(line);
    const distance = parseDistance(line);
    const stroke = parseStroke(line);
    if (!distance || !stroke) continue;

    // Look ahead up to 5 lines for time + place
    let found: { timeStr: string; timeMs: number; place: number | null } | null = null;
    let eventNumber: number | null = null;

    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const next = lines[j];
      if (isEventDescriptionLine(next)) break;
      if (/time improvement/i.test(next)) continue;
      if (/full.?schedule/i.test(next)) continue;

      const extracted = extractTimePlaceFromLine(next);
      if (extracted) {
        found = extracted;
        const numMatch = next.match(/^(\d{2,3})\s+/);
        if (numMatch) eventNumber = Number(numMatch[1]);
        break;
      }
    }

    if (!found) continue;

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
// NOT checking COMPLETED — OCR doesn't read it reliably on this screen type

export function isSwimmerSchedulePage(rawText: string): boolean {
  const flat = rawText.replace(/\s+/g, " ").toUpperCase();

  if (flat.includes("SWIM DETAIL")) return false;
  if (flat.includes("EVENT SUMMARY")) return false;
  if (flat.includes("EVENT DETAILS")) return false;

  // "FULL SCHEDULE" is the strongest unique signal
  if (!flat.includes("FULL SCHEDULE")) return false;

  // Multiple "PLACE:" with colon
  const placeColonCount = (flat.match(/PLACE:/g) ?? []).length;
  if (placeColonCount < 2) return false;

  return true;
}