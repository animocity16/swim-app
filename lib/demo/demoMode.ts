// lib/demo/demoMode.ts
//
// The on/off switch for the interactive demo.
//
// Demo mode lives in this browser tab only (sessionStorage). While it is on,
// the app's data client (lib/supabaseClient.ts) is swapped for an in-browser
// stand-in, so the real Natrix screens run on fictional data and never contact
// Supabase. Nothing here is shared between visitors, tabs or devices.

export const DEMO_USER_ID = "demo-user";
export const DEMO_USER_EMAIL = "demo@natrix.invalid"; // .invalid can never be a real address

const MODE_KEY = "natrix_demo_mode_v1";
const DATA_KEY = "natrix_demo_data_v1";

export function isDemoActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function startDemo(): void {
  try {
    window.sessionStorage.setItem(MODE_KEY, "1");
  } catch {
    /* storage blocked: the demo then falls back to a memory-only session */
    memoryOnlyFlag = true;
  }
}

// Throw away this visitor's changes and start again from the original sample data.
export function resetDemoData(): void {
  try {
    window.sessionStorage.removeItem(DATA_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function exitDemo(): void {
  resetDemoData();
  try {
    window.sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* nothing to clear */
  }
  memoryOnlyFlag = false;
}

export const DEMO_DATA_STORAGE_KEY = DATA_KEY;

// Only used if sessionStorage is unavailable (some private modes).
let memoryOnlyFlag = false;
export function demoFlagFallback(): boolean {
  return memoryOnlyFlag;
}
