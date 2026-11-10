// Time helpers for swim reminders. Server-safe (no browser APIs).

// "9:45 AM" / "9:45am" / "~9:45 AM" / "14:05" -> minutes after midnight.
// Returns null when the text isn't a clock time we can trust.
export function parseClockToMinutes(str: string | null | undefined): number | null {
  if (!str) return null;
  const s = str.replace("~", "").trim();

  let m = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]?\.?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 1 || h > 12 || min > 59) return null;
    const isPM = m[3].toUpperCase() === "P";
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + min;
  }

  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  return null;
}

// How far ahead of UTC a time zone is at a given moment, in milliseconds.
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// "2026-11-08" + 585 minutes (9:45 AM) in Asia/Singapore -> the real UTC moment.
export function zonedToUtcMs(dateStr: string, minutes: number, tz: string): number | null {
  const [y, mo, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !mo || !d) return null;
  const guess = Date.UTC(y, mo - 1, d) + minutes * 60000;
  let zone = tz;
  try {
    const off1 = tzOffsetMs(guess, zone);
    return guess - tzOffsetMs(guess - off1, zone);
  } catch {
    zone = "Asia/Singapore";
    const off1 = tzOffsetMs(guess, zone);
    return guess - tzOffsetMs(guess - off1, zone);
  }
}

// Loose name match so "Emma Tan" still matches "TAN, Emma" or "Emma Mei Tan".
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (small.length < 2 && small.length !== big.length) return false;
  return small.every((t) => big.includes(t));
}
