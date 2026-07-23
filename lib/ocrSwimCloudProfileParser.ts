// ✅ ocrSwimCloudProfileParser.ts — v2, hardened against heavily garbled OCR
//
// v1 assumed a "round" keyword (Timed Finals/Extracted) always appears and
// used it as the row anchor. Real OCR from a second, messier scan showed
// that assumption doesn't hold — round text can be dropped entirely, event
// names can lose their leading digits ("50 Breast" → "o0 Breast" / "> Breast"),
// and times routinely lose their decimal point or colon ("2:35.74" → "23574").
//
// v2 anchors on the STROKE WORD instead (Free/Back/Breast/Fly/IM), since
// that survives OCR far more reliably than digits do. When even the stroke
// word is lost, it still detects "a new row started here" from a place
// ordinal + number-like token, so a neighboring row's time can't get
// misattributed to it — the row itself just gets safely dropped instead of
// silently corrupting whichever row came before it.

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
  skippedCount: number;
};

const STROKE_WORD_RE = /\b(Freestyle|Backstroke|Breaststroke|Butterfly|Free|Back|Breast|Fly|IM|FR-R|MED-R)\b/i;
const DISTANCE_RE = /\b(50|100|200|400|800|1500)\b/;
const GLUED_IM_RE = /^(\d{2,4})M\b/i;
const TIME_RE = /(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})/;
const ROUND_RE = /(Timed Finals|Extracted|Prelims|Finals|Semifinals)/i;
const PLACE_RE = /\b(\d{1,3})(st|nd|rd|th)\b/i;

function repairTime(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(s)) return s;
  if (/^\d{2}\.\d{2}$/.test(s)) return s;
  if (/^\d{5}$/.test(s)) return `${s[0]}:${s.slice(1, 3)}.${s.slice(3)}`;
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}.${s.slice(2)}`;
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

function extractInitialsAndClub(lines: string[]): { initials: string | null; club: string | null } {
  for (const line of lines.slice(0, 8)) {
    const m = line.match(/^(?:IN\s+)?([A-Z]{2})\s+([A-Za-z][A-Za-z' ]{2,40})$/);
    if (m) return { initials: m[1], club: m[2].trim() };
  }
  return { initials: null, club: null };
}

type BoundaryInfo = { idx: number; event: string | null };

function findBoundaries(lines: string[]): BoundaryInfo[] {
  const boundaries: BoundaryInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Glued IM misread: "200M" → "200 IM"
    const gluedIM = line.match(GLUED_IM_RE);
    if (gluedIM) {
      boundaries.push({ idx: i, event: `${gluedIM[1]} IM` });
      continue;
    }

    // Clean or near-clean event line: distance + stroke word, in either order
    // of garbling — stroke word is the reliable anchor, distance is a bonus.
    const strokeMatch = line.slice(0, 20).match(STROKE_WORD_RE);
    if (strokeMatch) {
      const distMatch = line.match(DISTANCE_RE);
      let stroke = strokeMatch[1];
      const strokeLower = stroke.toLowerCase();
      if (strokeLower.startsWith("free")) stroke = "Free";
      else if (strokeLower.startsWith("back")) stroke = "Back";
      else if (strokeLower.startsWith("breast")) stroke = "Breast";
      else if (strokeLower.startsWith("fly") || strokeLower.startsWith("butterfly")) stroke = "Fly";
      const event = distMatch ? `${distMatch[1]} ${stroke}` : null; // null = boundary only, unrecoverable
      boundaries.push({ idx: i, event });
      continue;
    }

    // Implicit boundary: no stroke word survived OCR at all, but this line
    // still clearly looks like the START of a new row's data (place ordinal
    // + a number-like token). We can't name the event, but we MUST treat
    // this as a boundary anyway — otherwise its time gets misattributed to
    // whatever row came before it.
    const hasPlace = PLACE_RE.test(line);
    const hasNumberish = TIME_RE.test(line) || /\b\d{3,6}\b/.test(line);
    if (hasPlace && hasNumberish) {
      boundaries.push({ idx: i, event: null });
    }
  }

  return boundaries;
}

function findDeltaInBlock(blockText: string, consumedToken: string): number | null {
  const tokens = blockText.split(/\s+/);
  for (const rawToken of tokens) {
    if (rawToken === consumedToken) continue;
    const token = rawToken.replace(/^[^\d+-]+|[^\d]+$/g, "");
    const m = token.match(/^([+-]?\d{1,2}\.\d{2})$/);
    if (m) {
      const sign = m[1].startsWith("-") ? -1 : 1;
      const num = parseFloat(m[1].replace(/^[+-]/, ""));
      if (!isNaN(num)) return sign * num;
    }
  }
  return null;
}

function findTimeInBlock(blockText: string): { timeStr: string; consumedToken: string } | null {
  const tokens = blockText.split(/\s+/);
  for (const rawToken of tokens) {
    const token = rawToken.replace(/^[^\d]+|[^\d.:]+$/g, "");
    if (!token) continue;
    const direct = token.match(TIME_RE);
    if (direct) {
      const ms = timeToMs(direct[1]);
      if (ms >= 3000 && ms <= 1_800_000) return { timeStr: direct[1], consumedToken: rawToken };
      continue;
    }
    if (/^\d{4,5}$/.test(token)) {
      const repaired = repairTime(token);
      if (repaired) {
        const ms = timeToMs(repaired);
        if (ms >= 3000 && ms <= 1_800_000) return { timeStr: repaired, consumedToken: rawToken };
      }
    }
  }
  return null;
}

export function isSwimCloudProfilePage(rawText: string): boolean {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const boundaries = findBoundaries(lines);
  const namedCount = boundaries.filter((b) => b.event !== null).length;
  return namedCount >= 2;
}

export function parseSwimCloudProfileOCR(rawText: string): ParsedSwimCloudProfile {
  const lines = rawText.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const { initials, club } = extractInitialsAndClub(lines);

  const boundaries = findBoundaries(lines);
  const results: SwimCloudProfileRow[] = [];
  let skippedCount = 0;

  for (let b = 0; b < boundaries.length; b++) {
    const startIdx = boundaries[b].idx;
    const endIdx = b + 1 < boundaries.length ? boundaries[b + 1].idx : lines.length;
    const blockText = lines.slice(startIdx, endIdx).join(" ");

    const event = boundaries[b].event;
    if (!event) { skippedCount++; continue; } // couldn't identify the event — drop safely, don't guess

    const found = findTimeInBlock(blockText);
    if (!found) { skippedCount++; continue; }

    const timeMs = timeToMs(found.timeStr);
    const roundMatch = blockText.match(ROUND_RE);
    const round = roundMatch ? roundMatch[1] : null;
    const placeMatch = blockText.match(PLACE_RE);
    const place = placeMatch ? parseInt(placeMatch[1], 10) : null;
    const isPB = /\bPB\b/i.test(blockText);
    const delta = findDeltaInBlock(blockText, found.consumedToken);

    results.push({ event, timeStr: found.timeStr, timeMs, round, place, delta, isPB });
  }

  return { initials, club, results, skippedCount };
}