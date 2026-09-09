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

const TIME_TAIL_RE = /(\d{1,2}:\d{2}\.\d{2}|\d{2}\.\d{2})\s*$/;
const RANK_PREFIX_RE = /^(\d{1,3}|[>=~]{1,2})\s+/;
const NAME_LINE_RE = /^[\p{L}][\p{L}'.\- ]{2,40}$/u;

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

function cleanLine(l: string): string {
  return l.replace(/[=.,;:\-\s]+$/, "").trim();
}

function isBreadcrumbLine(l: string): boolean {
  return EVENT_RE.test(l) && (GENDER_RE.test(l) || AGE_GROUP_RE.test(l));
}

function isNoiseLine(l: string): boolean {
  const lower = l.toLowerCase();
  if (NOISE_LINES.has(lower)) return true;
  if (ROUND_RE.test(l)) return true;
  if (/^name\s+time$/i.test(l)) return true;
  if (isBreadcrumbLine(l)) return true;
  if (l.length < 3) return true;
  if (/swimcloud|search|^</.test(lower)) return true;
  return false;
}

function extractHeader(rawText: string, lines: string[]): {
  event: string | null;
  gender: string | null;
  ageGroup: string | null;
  round: string | null;
  meetName: string | null;
} {
  const headerBlob = lines.slice(0, 10).join(" ");

  const eventMatch = headerBlob.match(EVENT_RE);
  const event = eventMatch ? normalizeEventFromMatch(eventMatch) : null;

  const genderMatch = headerBlob.match(GENDER_RE);
  const gender = genderMatch ? genderMatch[1] : null;

  const ageMatch = headerBlob.match(AGE_GROUP_RE);
  const ageGroup = ageMatch ? ageMatch[1].replace(/\s+/g, " ").trim() : null;

  let round: string | null = null;
  for (const line of lines.slice(0, 12)) {
    if (ROUND_RE.test(line)) { round = line; break; }
  }

  let meetName: string | null = null;
  for (const line of lines.slice(0, 6)) {
    const stripped = line.replace(/^[^A-Za-z]+/, "").trim();
    if (stripped.length < 3) continue;
    const lower = stripped.toLowerCase();
    if (NOISE_LINES.has(lower)) continue;
    if (isBreadcrumbLine(stripped) || ROUND_RE.test(stripped)) continue;
    if (/swimcloud|search/i.test(stripped)) continue;
    if (/^[A-Z][A-Za-z' ]{2,40}$/.test(stripped)) { meetName = stripped; break; }
  }

  return { event, gender, ageGroup, round, meetName };
}

export function isSwimCloudRankingsPage(rawText: string): boolean {
  const flat = rawText.replace(/\s+/g, " ").toLowerCase();
  if (!flat.includes("name") || !flat.includes("time")) return false;

  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const dataLineCount = lines.filter((l) => TIME_TAIL_RE.test(l)).length;

  return dataLineCount >= 2;
}

export function parseSwimCloudRankingsOCR(rawText: string): ParsedSwimCloudRankings {
  const lines = rawText.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const header = extractHeader(rawText, lines);

  const results: SwimCloudRankingRow[] = [];
  const consumedNameIdx = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timeMatch = line.match(TIME_TAIL_RE);
    if (!timeMatch) continue;

    const timeStr = repairTime(timeMatch[1]);
    if (!timeStr) continue;

    let prefix = line.slice(0, timeMatch.index).trim();
    prefix = prefix.replace(RANK_PREFIX_RE, "").trim();
    const club = prefix.length > 0 ? prefix : null;

    let name: string | null = null;
    for (let k = 1; k <= 2; k++) {
      const idx = i - k;
      if (idx < 0) break;
      if (consumedNameIdx.has(idx)) break;
      const cleaned = cleanLine(lines[idx]);
      if (cleaned.length < 3) continue;
      if (isNoiseLine(cleaned)) break;
      if (!NAME_LINE_RE.test(cleaned)) continue;

      // Latin names starting lowercase are almost never real — far more likely the
      // back half of a name fractured across two lines by an overlapping UI element
      // (e.g. "Rach" / "elle Wong"). Try to glue it to the line right before it
      // rather than accepting the truncated fragment as the whole name.
      const startsLower = /^[a-z]/.test(cleaned);
      if (!startsLower) { name = cleaned; consumedNameIdx.add(idx); break; }

      const fragIdx = idx - 1;
      if (fragIdx >= 0 && !consumedNameIdx.has(fragIdx)) {
        const fragment = cleanLine(lines[fragIdx]);
        if (fragment.length >= 1 && fragment.length <= 12 && /^[A-Za-z]+$/.test(fragment) && !isNoiseLine(fragment)) {
          const glued = fragment + cleaned;
          if (/^[A-Z]/.test(glued) && NAME_LINE_RE.test(glued)) {
            name = glued;
            consumedNameIdx.add(idx);
            consumedNameIdx.add(fragIdx);
            break;
          }
        }
      }
      // Couldn't recover a full name — don't return the truncated fragment.
      break;
    }
    if (!name) continue;

    const timeMs = timeToMs(timeStr);
    if (timeMs <= 0 || timeMs > 1_800_000) continue;

    results.push({
      place: results.length + 1,
      name,
      club,
      timeStr,
      timeMs,
      event: header.event,
      round: header.round,
      gender: header.gender,
      ageGroup: header.ageGroup,
      course: "UNKNOWN",
    });
  }

  return { ...header, course: "UNKNOWN", results };
}
