// ─── lib/ageBandParser.ts ─────────────────────────────────────────────────────
//
// Universal age-band detection from swim meet OCR text.
// Works for any country / meet format — screenshot is the source of truth.
//
// Five patterns (most → least specific):
//   1. Range       — "9-10", "11-12", "13-14"
//   2. Upper bound — "10 & under", "12 & under"
//   3. Lower bound — "13 & over", "15 & over"
//   4. Single year — "Girls 9", "Boys 11", "Age 9"
//   5. Open/Senior — "Open", "Senior"
//
// Returns a human-readable string e.g. "9-10", "10 & under", "13 & over",
// "9", "Open" — or null if no age band is detectable.

export function parseAgeBand(rawText: string): string | null {
  // Normalise: collapse whitespace, keep digits, letters, hyphens, ampersands
  const text = rawText
    .replace(/\r/g, "\n")
    .replace(/[–—]/g, "-")         // smart dashes → regular dash
    .replace(/&amp;/g, "&")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ");

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // ── Pattern 1: Range ──────────────────────────────────────────────────────
  // "Girls 9-10 100 Meter Free", "Boys 11-12", "9-10 Freestyle", "Age 9-10"
  // Captures the UPPER age of the range (e.g. "9-10" → returns "9-10")
  for (const line of lines) {
    const m = line.match(
      /(?:girls|boys|women|men|mixed|age|ages|u\/)?[\s-]*\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/i
    );
    if (m) {
      const lo = parseInt(m[1], 10);
      const hi = parseInt(m[2], 10);
      if (lo >= 6 && hi <= 25 && lo < hi) {
        return `${lo}-${hi}`;
      }
    }
  }

  // ── Pattern 2: Upper bound ────────────────────────────────────────────────
  // "10 & under", "12 and under", "12 years & under", "U12", "Under 12"
  for (const line of lines) {
    // "10 & under" / "10 and under" / "10 years and under"
    const m1 = line.match(/\b(\d{1,2})\s*(?:years?\s*)?(?:&|and)\s*under\b/i);
    if (m1) {
      const age = parseInt(m1[1], 10);
      if (age >= 6 && age <= 25) return `${age} & under`;
    }
    // "Under 12" / "U12" / "U-12"
    const m2 = line.match(/\b[Uu]-?\s*(\d{1,2})\b/);
    if (m2) {
      const age = parseInt(m2[1], 10);
      if (age >= 6 && age <= 25) return `${age} & under`;
    }
    const m3 = line.match(/\bunder\s+(\d{1,2})\b/i);
    if (m3) {
      const age = parseInt(m3[1], 10);
      if (age >= 6 && age <= 25) return `${age} & under`;
    }
  }

  // ── Pattern 3: Lower bound ────────────────────────────────────────────────
  // "13 & over", "15 and over", "13+ years", "13 years & over"
  for (const line of lines) {
    const m1 = line.match(/\b(\d{1,2})\s*(?:years?\s*)?(?:&|and)\s*over\b/i);
    if (m1) {
      const age = parseInt(m1[1], 10);
      if (age >= 6 && age <= 25) return `${age} & over`;
    }
    const m2 = line.match(/\b(\d{1,2})\s*\+\s*(?:years?)?\b/i);
    if (m2) {
      const age = parseInt(m2[1], 10);
      if (age >= 6 && age <= 25) return `${age} & over`;
    }
    const m3 = line.match(/\bover\s+(\d{1,2})\b/i);
    if (m3) {
      const age = parseInt(m3[1], 10);
      if (age >= 6 && age <= 25) return `${age} & over`;
    }
  }

  // ── Pattern 4: Single year ────────────────────────────────────────────────
  // "Girls 9 50 Meter Free", "Boys 11 100 Freestyle", "Age 9", "9 Year Olds"
  for (const line of lines) {
    // "Girls 9 100 Meter Free" — gender + single age + event keyword
    const m1 = line.match(
      /(?:girls|boys|women|men|mixed)\s+(\d{1,2})\s+(?:\d+|meter|yard|free|back|breast|fly|medley|\bim\b)/i
    );
    if (m1) {
      const age = parseInt(m1[1], 10);
      if (age >= 6 && age <= 25) return `${age}`;
    }
    // "9 Year Olds" / "9 Year Old"
    const m2 = line.match(/\b(\d{1,2})\s+[Yy]ear\s+[Oo]lds?\b/);
    if (m2) {
      const age = parseInt(m2[1], 10);
      if (age >= 6 && age <= 25) return `${age}`;
    }
    // "Age 9" / "Ages 9"
    const m3 = line.match(/\bages?\s+(\d{1,2})\b/i);
    if (m3) {
      const age = parseInt(m3[1], 10);
      if (age >= 6 && age <= 25) return `${age}`;
    }
  }

  // ── Pattern 5: Open / Senior ──────────────────────────────────────────────
  // "Open" or "Senior" as a standalone or near an event description
  const flat = text.toUpperCase();
  if (/\bSENIOR\b/.test(flat)) return "Senior";
  if (/\bOPEN\b/.test(flat) && !/^OPEN$/m.test(flat.trim())) {
    // Make sure "Open" appears in an event context, not as a standalone UI word
    for (const line of lines) {
      if (/\bopen\b/i.test(line) && /(?:free|back|breast|fly|medley|relay|event|\bim\b|\d+\s*m)/i.test(line)) {
        return "Open";
      }
    }
  }

  return null;
}

// ─── Convenience: check if two age bands could be the same swimmer ───────────
// Useful for fuzzy dedup across screenshots.
export function ageBandContainsAge(band: string, age: number): boolean {
  // Range: "9-10"
  const rangeM = band.match(/^(\d+)-(\d+)$/);
  if (rangeM) return age >= parseInt(rangeM[1]) && age <= parseInt(rangeM[2]);

  // Upper bound: "10 & under"
  const underM = band.match(/^(\d+)\s*&\s*under$/i);
  if (underM) return age <= parseInt(underM[1]);

  // Lower bound: "13 & over"
  const overM = band.match(/^(\d+)\s*&\s*over$/i);
  if (overM) return age >= parseInt(overM[1]);

  // Single year: "9"
  const singleM = band.match(/^(\d+)$/);
  if (singleM) return age === parseInt(singleM[1]);

  // Open / Senior — everyone qualifies
  if (/^(open|senior)$/i.test(band)) return true;

  return false;
}