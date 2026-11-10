// Natrix: shared start-list reader (pure text -> rows, no browser or database code).
//
// Used by:
//  - /admin/meets  : reads EVERY swimmer in a start list PDF and saves them centrally
//  - the meet page : matches a parent's own swimmers against those saved rows
//
// The text it reads comes from lib/startListExtract.ts (PDF text layer, or OCR
// for image-only PDFs like the Canva exports). OCR is never perfect, so this
// reader is deliberately forgiving about the typical slips it makes
// ("Heat Sof6" for "Heat 5 of 6", "11." for "11", "SO" for "50", etc.).

export type StartListEntry = {
  eventNumber: number;
  eventName: string; // e.g. "100m Backstroke"
  distance: number;
  stroke: string;
  category: string; // e.g. "Boys 9-12" (as printed, for the review screen)
  heat: number;
  lane: number;
  seedTime: string | null; // null when "NT"
  startTime: string | null; // "09:30 AM"
  swimmerName: string; // as printed, e.g. "Chiang, Yong Zhao Kendric"
  age: number | null;
  team: string | null;
};

export type StartListParseResult = {
  entries: StartListEntry[];
  // Lane-looking lines the reader could not understand - shown to the admin
  // so nothing is silently lost.
  skippedLines: string[];
  // Things worth a human look before saving (missing event numbers, empty events).
  warnings: string[];
  // Per-event summary for the review screen.
  events: { eventNumber: number; eventName: string; category: string; heats: number; swimmers: number; isRelay: boolean }[];
};

const STROKES: [RegExp, string][] = [
  [/free/i, "Freestyle"],
  [/back/i, "Backstroke"],
  [/breast/i, "Breaststroke"],
  [/fl(y|v)|butter/i, "Butterfly"],
  [/medley|\bI\.?M\b/i, "IM"],
];

function cleanStroke(raw: string): string {
  const trimmed = raw.replace(/\s+[0O]+\s*$/i, "").replace(/relay/i, "").trim();
  for (const [re, name] of STROKES) if (re.test(trimmed)) return name;
  return trimmed;
}

// OCR often reads digits as letters; only used on spots we KNOW are numbers.
function digitsFromOcr(s: string): number | null {
  const mapped = s.replace(/[Ss]/g, "5").replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
  const n = parseInt(mapped, 10);
  return Number.isFinite(n) ? n : null;
}

function normaliseClock(h: string, m: string, ap: string): string {
  return `${h.padStart(2, "0")}:${m} ${ap.toUpperCase()}M`;
}

export function parseAllStartListEntries(text: string): StartListParseResult {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const entries: StartListEntry[] = [];
  const skippedLines: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const eventInfo = new Map<number, { name: string; distance: number; stroke: string; category: string; isRelay: boolean }>();

  let cur: { number: number; name: string; distance: number; stroke: string; category: string; isRelay: boolean } | null = null;
  let heat = 0;
  let startTime: string | null = null;

  // "Event 203 Boys 9-12 100 LC Meter Backstroke"
  // Tolerates glued words ("100LCMeterFreestyle") and a mis-read "50" ("SO").
  const eventHead = /^[EBF]ve[nr]t\s*(\d+)\b(.*)$/i; // "Bvent 205" is a real OCR slip
  const distRe = /(\d{2,4}|S[O0])\s*L\s*C\s*Meter\s*(.*)$/i;

  // "Heat 2 of 6 Finals Starts at 09:44 AM" with every OCR variant of "of".
  const heatRe = /^Heat\s*([0-9A-Za-z]{1,4}?)\s*f\s*([0-9A-Za-z]{1,3})\b(.*)$/i;
  const heatPlainRe = /^Heat\s*(\d+)/i;
  const startsAtRe = /Starts\s*at\s*(\d{1,2}):(\d{2})\s*([AP])M/i;

  // Lane row: "4 Taguchi, Maxwell Shouki 12 SSC 34.31"
  //  - lane can be followed by stray "." or "S" (OCR)
  //  - age may carry a stray "." or degree sign and may start with M/W
  //  - team is anything between the age and the time ("NEXUS-SI", "=AquaTech")
  //  - seed time is m:ss.xx, ss.xx or NT; trailing junk ("_", ",") is ignored
  const laneStart = /^(\d)[.,;:|]?[Ss]?\s+(.+)$/;
  const laneBody =
    /^(.+?)\s+[MW]?(\d{1,2})[^\w\s]{0,2}\s+(\S.*?)\s+(\d{1,2}:\d{2}[.,]\d{2}|\d{1,3}[.,]\d{2}|NT|\d{4})(?!\d)[^\dA-Za-z]*(?:\s+[GSB])?\s*$/i;

  for (const line of lines) {
    // ── Event header ──
    const ev = line.match(eventHead);
    if (ev) {
      const num = parseInt(ev[1], 10);
      const rest = ev[2];
      const isRelay = /relay/i.test(rest);
      const d = rest.match(distRe);
      if (d) {
        const distance = /^S[O0]$/i.test(d[1]) ? 50 : parseInt(d[1], 10);
        const stroke = cleanStroke(d[2]);
        const category = rest.slice(0, d.index).replace(/[_|]+/g, " ").replace(/\s+/g, " ").trim();
        cur = { number: num, name: `${distance}m ${stroke}`, distance, stroke, category, isRelay };
      } else {
        cur = { number: num, name: rest.trim(), distance: 0, stroke: "", category: "", isRelay };
      }
      eventInfo.set(num, { name: cur.name, distance: cur.distance, stroke: cur.stroke, category: cur.category, isRelay });
      heat = 0;
      startTime = null;
      continue;
    }

    // ── Heat header ──
    if (/^Heat/i.test(line)) {
      const hm = line.match(heatRe);
      if (hm) {
        // hm[1] is what sits between "Heat" and the "f" of "of", e.g.
        // "2o0" (2 of), "6 0" (6 of, glued), "10o" (10 of), "S o" (5 of).
        let raw = hm[1];
        if (/\s/.test(raw)) raw = raw.split(/\s+/)[0];
        else raw = raw.replace(/[oO0]+$/, "") || raw;
        const n = digitsFromOcr(raw);
        if (n && n > 0) heat = n;
      } else {
        // Continuation header, e.g. "Heat 2 Finals (#207 Boys 9-12 100 LC Meter Freestyle)"
        const hp = line.match(heatPlainRe);
        if (hp) heat = parseInt(hp[1], 10);
        const ref = line.match(/\(#\s*(\d+)/);
        if (ref) {
          const n = parseInt(ref[1], 10);
          const known = eventInfo.get(n);
          if (known && (!cur || cur.number !== n)) {
            cur = { number: n, ...known };
          }
        }
      }
      const st = line.match(startsAtRe);
      startTime = st ? normaliseClock(st[1], st[2], st[3]) : null;
      continue;
    }
    const st2 = line.match(startsAtRe);
    if (st2) {
      startTime = normaliseClock(st2[1], st2[2], st2[3]);
      continue;
    }

    // ── Lane row ──
    if (!cur || heat <= 0 || cur.isRelay || cur.distance <= 0) continue;
    const ls = line.match(laneStart);
    if (!ls) continue;
    const lane = parseInt(ls[1], 10);
    const lb = ls[2].match(laneBody);
    if (!lb) {
      // Only report lines that really look like a swimmer row (letters + a comma-name).
      if (/[A-Za-z]{2,}/.test(ls[2]) && /,/.test(ls[2])) skippedLines.push(`Event ${cur.number} Heat ${heat}: ${line}`);
      continue;
    }
    const name = lb[1].replace(/\s+/g, " ").replace(/^[^A-Za-z]+/, "").trim();
    if (!name) continue;
    const key = `${cur.number}|${heat}|${lane}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let seedRaw = lb[4].toUpperCase().replace(",", ".");
    if (/^\d{4}$/.test(seedRaw)) {
      // OCR dropped the dot: "5159" is almost certainly 51.59
      const fixed = `${seedRaw.slice(0, 2)}.${seedRaw.slice(2)}`;
      warnings.push(`Event ${cur.number} Heat ${heat} Lane ${lane}: time "${seedRaw}" was read as ${fixed} - please check.`);
      seedRaw = fixed;
    }
    entries.push({
      eventNumber: cur.number,
      eventName: cur.name,
      distance: cur.distance,
      stroke: cur.stroke,
      category: cur.category,
      heat,
      lane,
      seedTime: seedRaw === "NT" ? null : seedRaw,
      startTime,
      swimmerName: name,
      age: parseInt(lb[2], 10),
      team: lb[3].replace(/^[^A-Za-z0-9]+/, "").trim() || null,
    });
  }

  const events = [...eventInfo.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([eventNumber, info]) => {
      const rows = entries.filter((e) => e.eventNumber === eventNumber);
      return {
        eventNumber,
        eventName: info.name,
        category: info.category,
        heats: new Set(rows.map((r) => r.heat)).size,
        swimmers: rows.length,
        isRelay: info.isRelay,
      };
    });

  const nums = events.map((e) => e.eventNumber);
  for (let i = 1; i < nums.length; i++) {
    for (let n = nums[i - 1] + 1; n < nums[i]; n++) {
      warnings.push(`Event ${n} was not found (the list jumps from ${nums[i - 1]} to ${nums[i]}). Fine if that event does not exist.`);
    }
  }
  for (const e of events) {
    if (!e.isRelay && e.swimmers === 0) warnings.push(`Event ${e.eventNumber} has no swimmers.`);
  }

  return { entries, skippedLines, warnings, events };
}

// ─── Matching a parent's swimmer to a printed start-list name ────────────────
// Start lists print "Surname, Given Names" (often clipped, odd capitals, and
// sometimes the surname holds two words). So we ignore case, punctuation and
// word ORDER: a swimmer matches when every word of their saved name is found
// in the printed name. Two forgiving extras:
//   - a printed word that was clipped ("Vladimi") still matches the full word
//     ("Vladimir") when it is at least 6 letters long
//   - OCR sometimes glues words ("TuShao Han"), so as a last resort every
//     saved word (3+ letters) is looked for inside the squashed printed name.

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
}

export function printedNameMatchesSwimmer(printedName: string, swimmerName: string): boolean {
  const sw = words(swimmerName);
  const pr = words(printedName);
  if (sw.length === 0 || pr.length === 0) return false;

  const wordMatch = sw.every((s) => pr.some((p) => p === s || (p.length >= 6 && s.startsWith(p))));
  if (wordMatch) return true;

  const squashed = pr.join("");
  if (sw.length >= 2 && sw.every((s) => squashed.includes(s))) {
    // keep it honest: the printed name must be (almost) exactly the saved one
    return squashed.length <= sw.join("").length + 2;
  }
  return false;
}
