// ocrSwimmerScheduleParser.ts
//
// Parses the Meet Mobile "Swimmer" schedule page — all events for one swimmer
// across an entire meet, shown in a scrollable list.
//
// OCR FORMAT:
//
//   SWIMMER
//   Elizabeth Le Xuan Chiu
//   CSC | 10
//   Full schedule
//
//   EVENT 102 Girls 9-10 100 Meter Back
//   Finals | 0-10 | Completed
//   1:27.87 | Place: 9
//   Time improvement: - 1.32
//
//   EVENT 108 Girls 9-10 50 Meter Free
//   Finals | 0-10 | Completed
//   35.76 | Place: 18
//
//   EVENT 115 Mixed 7-8 200 Meter Medley Relay   ← skip relays
//   Finals | 0-10 | Completed
//   2:32.59 | Place: 3
//

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
    return Number(mm) * 60_000 + Number(sec) * 1_000 + Number(hun ?? "0") * 10;
  }
  const [sec, hun] = s.split(".");
  return Number(sec) * 1_000 + Number(hun ?? "0") * 10;
}

function repairTime(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(s)) return s;
  if (/^\d{2}\.\d{2}$/.test(s)) return s;
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}.${s.slice(2)}`;
  if (/^\d{5}$/.test(s)) return `${s[0]}:${s.slice(1, 3)}.${s.slice(3)}`;
  return null;
}

function detectCourse(rawText: string): "LCM" | "SCM" | "SCY" | "UNKNOWN" {
  const t = rawText.toLowerCase();
  if (t.includes("meter") || t.includes("lcm")) return "LCM";
  if (t.includes("25 meter") || t.includes("scm")) return "SCM";
  if (t.includes("yard") || t.includes("scy")) return "SCY";
  return "UNKNOWN";
}

function parseStroke(eventLine: string): string | null {
  const l = eventLine.toLowerCase();
  if (l.includes("freestyle") || / free\b/.test(l)) return "Freestyle";
  if (l.includes("butterfly") || / fly\b/.test(l)) return "Butterfly";
  if (l.includes("backstroke") || / back\b/.test(l)) return "Backstroke";
  if (l.includes("breaststroke") || / breast\b/.test(l)) return "Breaststroke";
  if (l.includes("individual medley") || / medley\b/.test(l) || / im\b/.test(l)) return "IM";
  return null;
}

function parseDistance(eventLine: string): number | null {
  const m = eventLine.match(/\b(50|100|200|400|800|1500)\b/);
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

function extractMeetName(lines: string[]): string | null {
  const meetRe = /championship|open|invitational|junior|classic|cup|trophy|gala|national|series|aquatic|swim/i;
  for (const line of lines.slice(0, 15)) {
    if (line.length < 5 || line.length > 100) continue;
    if (/^\d/.test(line)) continue;
    if (/\b(am|pm)\b/i.test(line)) continue;
    if (/place|lane|heat|time|dropped|club|swimmer|schedule|completed|finals/i.test(line)) continue;
    if (line.split(/\s+/).length < 2) continue;
    if (meetRe.test(line)) return line.trim();
  }
  return null;
}

// ─── Swimmer name extraction from top of schedule page ───────────────────────
// Format:
//   SWIMMER           ← header (may be mangled by OCR)
//   Elizabeth Le Xuan Chiu
//   CSC | 10          ← club | age

function extractSwimmerHeader(lines: string[]): {
  name: string | null;
  club: string | null;
  age: number | null;
} {
  // Look for the "SWIMMER" header line — OCR may garble it slightly
  const swimmerIdx = lines.findIndex((l) =>
    /^swim[nm]?e?r?$/i.test(l.trim()) || l.trim().toUpperCase() === "SWIMMER"
  );

  const startIdx = swimmerIdx >= 0 ? swimmerIdx + 1 : 0;

  // Next meaningful line should be the name
  for (let i = startIdx; i < Math.min(startIdx + 4, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^[\W\d]/.test(line)) continue; // skip lines starting with non-letters/digits
    if (/full.?schedule|completed|event|finals|place/i.test(line)) continue;

    // Strip OCR noise prefix (e.g. "(cc) ")
    const cleaned = line.replace(/^[^A-Z]+/, "").trim();
    const words = cleaned.split(/\s+/);
    if (words.length < 2 || words.length > 7) continue;
    if (!words.every((w) => /^[A-Z]/.test(w))) continue;
    if (/\d/.test(cleaned)) continue;

    // Found likely name — now look for club | age on next line
    const nextLine = lines[i + 1]?.trim() ?? "";
    const clubAgeMatch = nextLine.match(/^([A-Z]{2,10})\s*[|l\/\[]\s*(\d{1,2})$/i);

    if (clubAgeMatch) {
      return {
        name: cleaned,
        club: clubAgeMatch[1].toUpperCase(),
        age: Number(clubAgeMatch[2]),
      };
    }

    // Club line not found — still return the name
    return { name: cleaned, club: null, age: null };
  }

  return { name: null, club: null, age: null };
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
  const meetName = extractMeetName(lines);
  const { name: swimmerName, club, age } = extractSwimmerHeader(lines);

  const results: ScheduleResultRow[] = [];

  // Each event block starts with "EVENT [number] [event name]"
  // e.g. "EVENT 102 Girls 9-10 100 Meter Back"
  const EVENT_LINE_RE = /^EVENT\s+(\d+)\s+(.+)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const eventMatch = line.match(EVENT_LINE_RE);
    if (!eventMatch) continue;

    const eventNumber = Number(eventMatch[1]);
    const eventDescription = eventMatch[2].trim();

    const isRelay = /relay/i.test(eventDescription);
    const distance = parseDistance(eventDescription);
    const stroke = parseStroke(eventDescription);

    if (!distance || !stroke) continue; // skip if can't parse event

    // Look ahead up to 4 lines for time and place
    let timeStr: string | null = null;
    let place: number | null = null;

    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const next = lines[j];

      // Stop if we hit the next event block
      if (EVENT_LINE_RE.test(next)) break;

      // Look for "35.76 | Place: 18" or "1:27.87 | Place: 9"
      // Also handles "Place: EXH" (exhibition — no place number)
      const timePlaceMatch = next.match(
        /^(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2}|\d{4,5})\s*[|]\s*Place:\s*(\d+|EXH)/i
      );
      if (timePlaceMatch) {
        const repaired = repairTime(timePlaceMatch[1]);
        if (repaired) {
          timeStr = repaired;
          const placeStr = timePlaceMatch[2];
          place = /^EXH$/i.test(placeStr) ? null : Number(placeStr);
        }
        break;
      }

      // Sometimes time is on its own line, place on next
      const standaloneTime = next.match(/^(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2}|\d{4,5})$/);
      if (standaloneTime) {
        const repaired = repairTime(standaloneTime[1]);
        if (repaired) timeStr = repaired;
        continue;
      }

      // Place on its own line
      const placeOnly = next.match(/^Place:\s*(\d+|EXH)/i);
      if (placeOnly && timeStr) {
        const placeStr = placeOnly[1];
        place = /^EXH$/i.test(placeStr) ? null : Number(placeStr);
        break;
      }
    }

    if (!timeStr) continue;

    const ms = timeToMs(timeStr);
    if (ms <= 0 || ms > 1_800_000) continue;

    // Basic sanity: 50m should be > 20s, 100m > 40s, etc.
    if (distance === 50 && ms < 20_000) continue;
    if (distance === 100 && ms < 40_000) continue;
    if (distance === 200 && ms < 80_000) continue;

    results.push({
      eventNumber,
      event: `${distance} ${stroke}`,
      distance,
      stroke,
      timeStr,
      timeMs: ms,
      place,
      course,
      swamAt,
      meetName,
      isRelay,
    });
  }

  return { swimmerName, club, age, results, meetName, swamAt };
}

// ─── Detection ────────────────────────────────────────────────────────────────
// Swimmer schedule page signals:
// - "Full schedule" text
// - Multiple "Place:" (with colon) occurrences
// - Multiple "Completed" statuses
// - "SWIMMER" header
// - Does NOT have "SWIM DETAIL" or "EVENT SUMMARY" (those are single-result screens)

export function isSwimmerSchedulePage(rawText: string): boolean {
  const flat = rawText.replace(/\s+/g, " ").toUpperCase();

  // Hard excludes — these are other screen types
  if (flat.includes("SWIM DETAIL")) return false;
  if (flat.includes("EVENT SUMMARY")) return false;
  if (flat.includes("EVENT DETAILS")) return false;

  // Must have "FULL SCHEDULE" — the strongest signal
  if (!flat.includes("FULL SCHEDULE")) return false;

  // Must have multiple "COMPLETED" statuses
  const completedCount = (flat.match(/COMPLETED/g) ?? []).length;
  if (completedCount < 2) return false;

  // Must have multiple "PLACE:" (with colon — unique to this format)
  const placeColonCount = (flat.match(/PLACE:/g) ?? []).length;
  if (placeColonCount < 2) return false;

  return true;
}