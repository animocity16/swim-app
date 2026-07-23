// ✅ ocrSwimCloudRankingsParser.ts
//
// Parses SwimCloud's "Event Rankings" page — a ranked list of swimmers
// for a single event (e.g. 100 Back / Women / 9-10 / Timed Finals).
//
// SwimCloud's layout is much cleaner than Meet Mobile's: no "PLACE" labels,
// no garbled club|age separators. The header breadcrumb reads
// "100 Back  Women  9 - 10" on one row (dropdown selectors), followed by
// a round label ("Timed Finals"), a "Name / Time" table header, then rows.
//
// KEY OCR REALITY: SwimCloud's table has two visual columns — rank+name+club
// on the left, time on the right. Tesseract tends to read left-column text
// as one block and right-column times as a separate block, NOT strictly
// row-by-row. So this parser derives row count from rank markers in the
// left block, then zips in times from a separately-collected list, rather
// than assuming line N+1 always follows line N in reading order.
//
// SwimCloud also never shows swimmer age on this page — only name + club.
// Age-based tiebreaking (used for Meet Mobile matching) isn't available;
// club is the only disambiguator here.

export type SwimCloudRankingRow = {
  place: number;
  name: string;
  club: string | null;
  timeStr: string;
  timeMs: number;
  event: string | null;
  round: string | null;
  gender: string | null;
  ageGroup: string | null;
  course: "LCM" | "SCM" | "SCY" | "UNKNOWN";
};

export type ParsedSwimCloudRankings = {
  event: string | null;
  round: string | null;
  gender: string | null;
  ageGroup: string | null;
  meetName: string | null;
  course: "LCM" | "SCM" | "SCY" | "UNKNOWN";
  results: SwimCloudRankingRow[];
};

const TIME_RE = /^\d{1,2}:\d{2}\.\d{2}$|^\d{2}\.\d{2}$/;
const RANK_RE = /^\d{1,3}$/;

const NOISE_LINES = new Set([
  "search", "events", "ask", "name", "time", "www.swimcloud.com",
  "home", "menu",
]);

const EVENT_RE = /\b(\d{2,4})\s*(Free|Back|Breast|Fly|IM|Freestyle|Backstroke|Breaststroke|Butterfly|Individual Medley)\b/i;
const GENDER_RE = /\b(Women|Men|Mixed|Girls|Boys)\b/i;
const AGE_GROUP_RE = /\b(\d{1,2}\s*-\s*\d{1,2}|Open|Senior)\b/i;
const ROUND_RE = /^(Timed Finals|Prelims|Finals|Semifinals|Extracted)$/i;

function repairTime(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(s)) return s;
  if (/^\d{2}\.\d{2}$/.test(s)) return s;
  return null;
}

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

function normalizeEventFromMatch(m: RegExpMatchArray): string {
  const dist = m[1];
  const strokeRaw = m[2].toLowerCase();
  let stroke = "Free";
  if (strokeRaw.startsWith("back")) stroke = "Back";
  else if (strokeRaw.startsWith("breast")) stroke = "Breast";
  else if (strokeRaw.startsWith("fly") || strokeRaw.startsWith("butterfly")) stroke = "Fly";
  else if (strokeRaw.includes("medley") || strokeRaw === "im") stroke = "IM";
  else if (strokeRaw.startsWith("free")) stroke = "Free";
  return `${dist} ${stroke}`;
}

function extractHeader(rawText: string, lines: string[]): {
  event: string | null;
  gender: string | null;
  ageGroup: string | null;
  round: string | null;
  meetName: string | null;
} {
  // Breadcrumb usually sits on one line: "100 Back  Women  9 - 10"
  // but OCR sometimes splits it across 2-3 lines, so search the first
  // handful of lines joined together.
  const headerBlob = lines.slice(0, 8).join(" ");

  const eventMatch = headerBlob.match(EVENT_RE);
  const event = eventMatch ? normalizeEventFromMatch(eventMatch) : null;

  const genderMatch = headerBlob.match(GENDER_RE);
  const gender = genderMatch ? genderMatch[1] : null;

  const ageMatch = headerBlob.match(AGE_GROUP_RE);
  const ageGroup = ageMatch ? ageMatch[1].replace(/\s+/g, " ").trim() : null;

  let round: string | null = null;
  for (const line of lines.slice(0, 10)) {
    if (ROUND_RE.test(line)) { round = line; break; }
  }

  // Meet name: the back-link line above the breadcrumb, e.g. "Pesta Sukan".
  // Heuristic: first short multi-word-or-single-word capitalized line
  // before the event breadcrumb that isn't a noise word.
  let meetName: string | null = null;
  for (const line of lines.slice(0, 5)) {
    const lower = line.toLowerCase();
    if (NOISE_LINES.has(lower)) continue;
    if (EVENT_RE.test(line) || GENDER_RE.test(line) || AGE_GROUP_RE.test(line)) continue;
    if (ROUND_RE.test(line)) continue;
    if (/^[A-Z][A-Za-z' ]{2,40}$/.test(line)) { meetName = line.trim(); break; }
  }

  return { event, gender, ageGroup, round, meetName };
}

export function isSwimCloudRankingsPage(rawText: string): boolean {
  const flat = rawText.replace(/\s+/g, " ").toLowerCase();
  if (!flat.includes("name") || !flat.includes("time")) return false;

  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const rankCount = lines.filter((l) => RANK_RE.test(l)).length;
  const timeCount = lines.filter((l) => TIME_RE.test(l)).length;

  return rankCount >= 2 && timeCount >= 2;
}

export function parseSwimCloudRankingsOCR(rawText: string): ParsedSwimCloudRankings {
  const lines = rawText.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const { event, gender, ageGroup, round, meetName } = extractHeader(rawText, lines);

  // Locate the "Name" / "Time" table header — everything before it is
  // breadcrumb/round noise, everything after is table data.
  let tableStart = lines.findIndex((l) => l.toLowerCase() === "name");
  if (tableStart === -1) tableStart = 0;
  const tableLines = lines.slice(tableStart + 1);

  // Collect times in order (right column).
  const times = tableLines.filter((l) => TIME_RE.test(l));

  // Collect rank markers with their position (left column).
  const rankIdxs: number[] = [];
  tableLines.forEach((l, i) => {
    if (RANK_RE.test(l) && !TIME_RE.test(l)) rankIdxs.push(i);
  });

  // Between each rank marker and the next, the first line is the name,
  // remaining lines (joined) are the club — skipping any time values
  // that ended up interleaved in this block.
  const nameClubPairs: { name: string; club: string | null }[] = [];
  for (let r = 0; r < rankIdxs.length; r++) {
    const start = rankIdxs[r] + 1;
    const end = r + 1 < rankIdxs.length ? rankIdxs[r + 1] : tableLines.length;
    const segment = tableLines.slice(start, end).filter((l) => !TIME_RE.test(l));
    if (segment.length === 0) continue;
    const name = segment[0].trim();
    const club = segment.length > 1 ? segment.slice(1).join(" ").trim() : null;
    nameClubPairs.push({ name, club: club || null });
  }

  const results: SwimCloudRankingRow[] = [];
  const rowCount = Math.min(rankIdxs.length, nameClubPairs.length, times.length) || nameClubPairs.length;

  for (let i = 0; i < rowCount; i++) {
    const pair = nameClubPairs[i];
    if (!pair || !pair.name) continue;

    const rawTime = times[i];
    const timeStr = rawTime ? repairTime(rawTime) : null;
    if (!timeStr) continue;

    const timeMs = timeToMs(timeStr);
    if (timeMs <= 0 || timeMs > 1_800_000) continue;

    results.push({
      place: i + 1,
      name: pair.name,
      club: pair.club,
      timeStr,
      timeMs,
      event,
      round,
      gender,
      ageGroup,
      course: "UNKNOWN",
    });
  }

  return { event, round, gender, ageGroup, meetName, course: "UNKNOWN", results };
}