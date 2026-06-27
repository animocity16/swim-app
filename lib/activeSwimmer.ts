// lib/activeSwimmer.ts
// Remembers which primary swimmer the parent last selected (Home carousel,
// Scan, etc.) so they don't have to re-pick every single time.
// Stored in localStorage only — no DB change needed.

const KEY = "natrix_active_swimmer_id";

export function getActiveSwimmerId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isNaN(id) ? null : id;
}

export function setActiveSwimmerId(id: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(id));
}

export function clearActiveSwimmerId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

// Given the list of primary swimmers loaded from Supabase, figure out who
// should be "active" right now: the remembered one if they still exist,
// otherwise just fall back to the first swimmer in the list.
export function resolveActiveSwimmer<T extends { id: number | string }>(
  swimmers: T[]
): T | null {
  if (swimmers.length === 0) return null;
  const rememberedId = getActiveSwimmerId();
  if (rememberedId != null) {
    const match = swimmers.find((s) => Number(s.id) === rememberedId);
    if (match) return match;
  }
  return swimmers[0];
}