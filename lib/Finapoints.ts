// ─── World Aquatics (FINA) Points Calculator ──────────────────────────────────
// Base times: LCM 2025/2026 (validity 01.01.2026–31.12.2026)
//             SCM 2025      (validity 01.09.2025–31.08.2026)
// Source: resources.fina.org — Points Base Times tables.
// Points = 1000 × (BaseTime / SwimTime)^3, truncated to integer.
// Note: World Aquatics does not publish official SCY base times — SCY swims
// return null and are simply not scored.

export type Gender = "Male" | "Female";

type BaseTimeTable = Record<string, { Male: number; Female: number }>;

// Keys match canonical event names used elsewhere in the app, e.g. "50 Free".
const LCM_BASE_TIMES: BaseTimeTable = {
  "50 Free":   { Male: 20.91,  Female: 23.61 },
  "100 Free":  { Male: 46.40,  Female: 51.71 },
  "200 Free":  { Male: 102.00, Female: 112.23 },
  "400 Free":  { Male: 220.07, Female: 235.38 },
  "800 Free":  { Male: 452.12, Female: 484.79 },
  "1500 Free": { Male: 870.67, Female: 920.48 },
  "50 Back":   { Male: 23.55,  Female: 26.86 },
  "100 Back":  { Male: 51.60,  Female: 57.13 },
  "200 Back":  { Male: 111.92, Female: 123.14 },
  "50 Breast": { Male: 25.95,  Female: 29.16 },
  "100 Breast":{ Male: 56.88,  Female: 64.13 },
  "200 Breast":{ Male: 125.48, Female: 137.55 },
  "50 Fly":    { Male: 22.27,  Female: 24.43 },
  "100 Fly":   { Male: 49.45,  Female: 55.18 },
  "200 Fly":   { Male: 110.34, Female: 121.81 },
  "200 IM":    { Male: 114.00, Female: 126.12 },
  "400 IM":    { Male: 242.50, Female: 264.38 },
};

const SCM_BASE_TIMES: BaseTimeTable = {
  "50 Free":   { Male: 19.90,  Female: 22.83 },
  "100 Free":  { Male: 44.84,  Female: 50.25 },
  "200 Free":  { Male: 98.61,  Female: 110.31 },
  "400 Free":  { Male: 212.25, Female: 230.25 },
  "800 Free":  { Male: 440.46, Female: 477.42 },
  "1500 Free": { Male: 846.88, Female: 908.24 },
  "50 Back":   { Male: 22.11,  Female: 25.23 },
  "100 Back":  { Male: 48.33,  Female: 54.02 },
  "200 Back":  { Male: 105.63, Female: 118.04 },
  "50 Breast": { Male: 24.95,  Female: 28.37 },
  "100 Breast":{ Male: 55.28,  Female: 62.36 },
  "200 Breast":{ Male: 120.16, Female: 132.50 },
  "50 Fly":    { Male: 21.32,  Female: 23.94 },
  "100 Fly":   { Male: 47.71,  Female: 52.71 },
  "200 Fly":   { Male: 106.85, Female: 119.32 },
  "100 IM":    { Male: 49.28,  Female: 55.11 },
  "200 IM":    { Male: 108.88, Female: 121.63 },
  "400 IM":    { Male: 234.81, Female: 255.48 },
};

/**
 * Calculates World Aquatics (FINA) points for a swim.
 * Returns null if the event/course/gender combo has no published base time
 * (e.g. SCY, or an event not in the standard program).
 */
export function calcFinaPoints(
  timeMs: number,
  canonicalEvent: string, // e.g. "50 Free", "200 IM"
  course: string,         // "LCM" | "SCM" | "SCY"
  gender: Gender | null | undefined,
): number | null {
  if (!gender) return null;
  if (course !== "LCM" && course !== "SCM") return null;

  const table = course === "LCM" ? LCM_BASE_TIMES : SCM_BASE_TIMES;
  const entry = table[canonicalEvent];
  if (!entry) return null;

  const baseTime = entry[gender];
  if (!baseTime) return null;

  const swimSeconds = timeMs / 1000;
  if (swimSeconds <= 0) return null;

  const points = 1000 * Math.pow(baseTime / swimSeconds, 3);
  return Math.trunc(points);
}