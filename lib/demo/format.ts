// lib/demo/format.ts
// Display helpers for the demo's sample-scan page.

export function formatDemoMs(ms?: number | null): string {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const secText = seconds.toFixed(2).padStart(minutes > 0 ? 5 : 1, "0");
  return minutes > 0 ? `${minutes}:${secText}` : secText;
}

export function formatDemoDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
