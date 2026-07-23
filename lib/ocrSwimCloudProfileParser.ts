// ✅ ocrSwimCloudProfileParser.ts — v5, surfaces unidentified-but-clean rows for manual event tagging
export type SwimCloudProfileRow = {
  event: string;
  timeStr: string;
  timeMs: number;
  round: string | null;
  place: number | null;
  delta: number | null;
  isPB: boolean;
};

export type UnresolvedProfileRow = {
  timeStr: string;
  timeMs: number;
  round: string | null;
  place: number | null;
  delta: number | null;
  isPB: boolean;
};

export type ParsedSwimCloudProfile = {
  initials: string | null;
  name: string | null;
  club: string | null;
  results: SwimCloudProfileRow[];
  unresolved: UnresolvedProfileRow[];
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

const CLUB_KEYWORD_RE = /\b(Club|Swimming|Swim|Academy|Aquatic|Aquatics|Team|Institute|Squad|Lab)\b/i;
const PERSON_NAME_RE = /^[A-Z][a-z]+(\s+[A-Z][a-z]+){1,3}$/;

function extractInitialsNameClub(lines: string[]): { initials: string | null; name: string | null; club: string | null } {
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const m = lines[i].match(/^([A-Z]{2})\s+([A-Za-z][A-Za-z' ]{2,50})$/);
    if (!m) continue;
    const initials = m[1];
    const rest = m[2].trim();

    if (!CLUB_KEYWORD_RE.test(rest) && PERSON_NAME_RE.test(rest)) {
      const nextLine = lines[i + 1];
      const club = nextLine && !/^\d/.test(nextLine) && !STROKE_WORD_RE.test(nextLine.slice(0, 20))
        ? nextLine.trim()
        : null;
      return { initials, name: rest, club };
    }

    return { initials, name: null, club: rest };
  }
  return { initials: null, name: null, club: null };
}

type BoundaryInfo = { idx: number; event: string | null };
type RawBoundary = { idx: number; stroke: string | null; distance: string | null };

function normalizeStroke(raw: string): string {
  const s = raw.toLowerCase();
  if (s.startsWith("free")) return "Free";
  if (s.startsWith("back")) return "Back";
  if (s.startsWith("breast")) return "Breast";
  if (s.startsWith("fly") || s.startsWith("butterfly")) return "Fly";
  if (s === "im") return "IM";
  if (s.startsWith("fr-r")) return "FR-R";
  if (s.startsWith("med-r")) return "MED-R";
  return raw;
}

function findRawBoundaries(lines: string[]): RawBoundary[] {
  const raw: RawBoundary[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const gluedIM = line.match(GLUED_IM_RE);
    if (gluedIM) { raw.push({ idx: i, stroke: "IM", distance: gluedIM[1] }); continue; }

    const strokeMatch = line.slice(0, 20).match(STROKE_WORD_RE);
    if (strokeMatch) {
      const distMatch = line.match(DISTANCE_RE);
      raw.push({ idx: i, stroke: normalizeStroke(strokeMatch[1]), distance: distMatch ? distMatch[1] : null });
      continue;
    }

    const hasPlace = PLACE_RE.test(line);
    const hasNumberish = TIME_RE.test(line) || /\b\d{3,6}\b/.test(line);
    if (hasPlace && hasNumberish) {
      raw.push({ idx: i, stroke: null, distance: null });
    }
  }

  return raw;
}

const DISTANCE_LADDER = [50, 100, 200, 400, 800, 1500];

function inferDistances(raw: RawBoundary[]): BoundaryInfo[] {
  return raw.map((b, i) => {
    if (!b.stroke) return { idx: b.idx, event: null };
    if (b.distance) return { idx: b.idx, event: `${b.distance} ${b.stroke}` };

    let nextKnown: number | null = null;
    for (let j = i + 1; j < raw.length; j++) {
      if (raw[j].stroke === b.stroke && raw[j].distance) {
        nextKnown = Number(raw[j].distance);
        break;
      }
    }
    if (nextKnown) {
      const candidates = DISTANCE_LADDER.filter((d) => d < nextKnown!);
      const inferred = candidates.length > 0 ? candidates[candidates.length - 1] : nextKnown;
      return { idx: b.idx, event: `${inferred} ${b.stroke}` };
    }

    return { idx: b.idx, event: null };
  });
}

function findBoundaries(lines: string[]): BoundaryInfo[] {
  return inferDistances(findRawBoundaries(lines));
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

function findTimeInBlock(blockText: string, allowDigitRepair: boolean): { timeStr: string; consumedToken: string } | null {
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
    if (allowDigitRepair && /^\d{4,5}$/.test(token)) {
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
  const { initials, name, club } = extractInitialsNameClub(lines);

  const boundaries = findBoundaries(lines);
  const results: SwimCloudProfileRow[] = [];
  const unresolved: UnresolvedProfileRow[] = [];
  let skippedCount = 0;

  for (let b = 0; b < boundaries.length; b++) {
    const startIdx = boundaries[b].idx;
    const endIdx = b + 1 < boundaries.length ? boundaries[b + 1].idx : lines.length;
    const blockText = lines.slice(startIdx, endIdx).join(" ");

    const event = boundaries[b].event;
    const found = findTimeInBlock(blockText, event !== null);
    if (!found) { skippedCount++; continue; }

    const timeMs = timeToMs(found.timeStr);
    const roundMatch = blockText.match(ROUND_RE);
    const round = roundMatch ? roundMatch[1] : null;
    const placeMatch = blockText.match(PLACE_RE);
    const place = placeMatch ? parseInt(placeMatch[1], 10) : null;
    const isPB = /\bPB\b/i.test(blockText);
    const delta = findDeltaInBlock(blockText, found.consumedToken);

    if (!event) {
      unresolved.push({ timeStr: found.timeStr, timeMs, round, place, delta, isPB });
      continue;
    }

    results.push({ event, timeStr: found.timeStr, timeMs, round, place, delta, isPB });
  }

  return { initials, name, club, results, unresolved, skippedCount };
}