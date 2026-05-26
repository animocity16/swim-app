"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

// ─── Theme definitions ─────────────────────────────────────────────────────────

interface ThemeVars {
  bg: string;
  dark: string;
  mid: string;
  light: string;
  light2: string;
  light3: string;
  navBg: string;
}

const THEMES: Record<string, ThemeVars> = {
  ocean: {
    bg:     "#063554",
    dark:   "#073E6A",
    mid:    "#084A73",
    light:  "#0D6E9A",
    light2: "#0E7A9E",
    light3: "#0A5580",
    navBg:  "rgba(6,53,84,0.80)",
  },
  midnight: {
    bg:     "#0D0D1A",
    dark:   "#0D0D2A",
    mid:    "#1A1A3E",
    light:  "#1F1F5E",
    light2: "#252575",
    light3: "#151540",
    navBg:  "rgba(13,13,26,0.88)",
  },
  forest: {
    bg:     "#051A10",
    dark:   "#0A2A18",
    mid:    "#0A3020",
    light:  "#0D4026",
    light2: "#105030",
    light3: "#0D3820",
    navBg:  "rgba(5,26,16,0.88)",
  },
  sunset: {
    bg:     "#180A00",
    dark:   "#221000",
    mid:    "#2C1500",
    light:  "#3D1E00",
    light2: "#4A2400",
    light3: "#251000",
    navBg:  "rgba(24,10,0,0.90)",
  },
  cosmos: {
    bg:     "#0D0820",
    dark:   "#150D30",
    mid:    "#1E1040",
    light:  "#251350",
    light2: "#2A1560",
    light3: "#1A0E38",
    navBg:  "rgba(13,8,32,0.88)",
  },
  slate: {
    bg:     "#0D1117",
    dark:   "#141B24",
    mid:    "#1C2333",
    light:  "#1E2638",
    light2: "#222C40",
    light3: "#1A2030",
    navBg:  "rgba(13,17,23,0.88)",
  },
};

// ─── Font size options ─────────────────────────────────────────────────────────

export const FONT_SIZES = [
  { id: "small",   label: "Small",   pct: 90  },
  { id: "default", label: "Default", pct: 100 },
  { id: "large",   label: "Large",   pct: 115 },
  { id: "xl",      label: "XL",      pct: 130 },
] as const;

export type FontSizeId = (typeof FONT_SIZES)[number]["id"];

// ─── localStorage keys ────────────────────────────────────────────────────────

const THEME_KEY          = "natrix_theme";
const FONT_SIZE_KEY      = "natrix_font_size";
const CUSTOM_BG_KEY      = "natrix_custom_bg_hue";
const CUSTOM_ACCENT_KEY  = "natrix_custom_accent_hue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildThemeStyle(t: ThemeVars): string {
  return `
    body { background-color: ${t.bg} !important; }
    body::before {
      background:
        radial-gradient(ellipse 60% 50% at 15% 25%, ${t.light}  0%, transparent 65%),
        radial-gradient(ellipse 50% 60% at 85% 55%, ${t.dark}   0%, transparent 60%),
        radial-gradient(ellipse 70% 40% at 50% 85%, ${t.light3} 0%, transparent 65%),
        radial-gradient(ellipse 40% 30% at 70% 15%, ${t.light2} 0%, transparent 55%),
        linear-gradient(160deg, ${t.bg} 0%, ${t.mid} 40%, ${t.bg} 100%) !important;
    }
    nav.fixed { background: ${t.navBg} !important; }
    select.input option { background: ${t.bg} !important; }
  `;
}

function getOrCreateStyleEl(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

// ─── Public helpers ────────────────────────────────────────────────────────────

export function applyTheme(themeId: string) {
  const theme = THEMES[themeId] ?? THEMES.ocean;
  try { localStorage.setItem(THEME_KEY, themeId); } catch {}

  const root = document.documentElement;
  root.style.setProperty("--theme-bg",     theme.bg);
  root.style.setProperty("--theme-dark",   theme.dark);
  root.style.setProperty("--theme-mid",    theme.mid);
  root.style.setProperty("--theme-light",  theme.light);
  root.style.setProperty("--theme-light2", theme.light2);
  root.style.setProperty("--theme-light3", theme.light3);
  root.style.setProperty("--theme-nav-bg", theme.navBg);

  getOrCreateStyleEl("natrix-theme").textContent = buildThemeStyle(theme);

  // Re-apply custom bg on top if one is saved
  try {
    const saved = localStorage.getItem(CUSTOM_BG_KEY);
    if (saved !== null) applyCustomBg(Number(saved), false);
  } catch {}
}

export function applyFontSize(sizeId: string) {
  const size = FONT_SIZES.find((s) => s.id === sizeId) ?? FONT_SIZES[1];
  try { localStorage.setItem(FONT_SIZE_KEY, sizeId); } catch {}
  document.documentElement.style.fontSize = `${size.pct}%`;
}

/**
 * Apply a custom background hue (0-360).
 * save=true → persist to localStorage (default true).
 */
export function applyCustomBg(hue: number, save = true) {
  if (save) {
    try { localStorage.setItem(CUSTOM_BG_KEY, String(hue)); } catch {}
  }

  const bg     = `hsl(${hue},60%,12%)`;
  const dark   = `hsl(${hue},63%,14%)`;
  const mid    = `hsl(${hue},58%,17%)`;
  const light  = `hsl(${hue},55%,22%)`;
  const light2 = `hsl(${hue},52%,25%)`;
  const light3 = `hsl(${hue},57%,19%)`;
  const navBg  = `hsla(${hue},60%,12%,0.84)`;

  const root = document.documentElement;
  root.style.setProperty("--theme-bg",     bg);
  root.style.setProperty("--theme-dark",   dark);
  root.style.setProperty("--theme-mid",    mid);
  root.style.setProperty("--theme-light",  light);
  root.style.setProperty("--theme-light2", light2);
  root.style.setProperty("--theme-light3", light3);
  root.style.setProperty("--theme-nav-bg", navBg);

  // Override the theme style tag with the custom bg — keep same structure
  const vars = { bg, dark, mid, light, light2, light3, navBg };
  getOrCreateStyleEl("natrix-theme").textContent = buildThemeStyle(vars);
}

/**
 * Apply a custom accent/highlight hue (0-360).
 * save=true → persist to localStorage (default true).
 */
export function applyCustomAccent(hue: number, save = true) {
  if (save) {
    try { localStorage.setItem(CUSTOM_ACCENT_KEY, String(hue)); } catch {}
  }

  const accent      = `hsl(${hue},78%,52%)`;
  const accentLight = `hsl(${hue},88%,78%)`;
  const accentDark  = `hsl(${hue},70%,38%)`;
  const accentGlow  = `hsla(${hue},78%,52%,0.35)`;
  const accentSoft  = `hsla(${hue},78%,52%,0.15)`;

  const root = document.documentElement;
  root.style.setProperty("--natrix-accent",       accent);
  root.style.setProperty("--natrix-accent-light",  accentLight);
  root.style.setProperty("--natrix-accent-dark",   accentDark);
  root.style.setProperty("--natrix-accent-glow",   accentGlow);
  root.style.setProperty("--natrix-accent-soft",   accentSoft);

  getOrCreateStyleEl("natrix-accent").textContent = `
    .btn, .btn-block {
      background: ${accentSoft} !important;
      border-color: ${accentLight}55 !important;
      color: ${accentLight} !important;
    }
    .btn:hover:not(:disabled), .btn-block:hover:not(:disabled) {
      background: hsla(${hue},78%,52%,0.25) !important;
      border-color: ${accentLight}77 !important;
    }
    .segmented-btn-active {
      background: hsla(${hue},78%,52%,0.22) !important;
      border-color: ${accentLight}44 !important;
      color: ${accentLight} !important;
    }
    .accent-text { color: ${accentLight} !important; }
    .onb-btn-primary { background: ${accent} !important; }
    .border-t-amber-400 { border-top-color: ${accent} !important; }
  `;
}

/**
 * Clear custom colors and revert to the saved preset theme.
 */
export function resetCustomColors() {
  try {
    localStorage.removeItem(CUSTOM_BG_KEY);
    localStorage.removeItem(CUSTOM_ACCENT_KEY);
  } catch {}

  // Remove accent overrides
  const accentEl = document.getElementById("natrix-accent");
  if (accentEl) accentEl.remove();

  // Remove custom CSS variables
  const root = document.documentElement;
  root.style.removeProperty("--natrix-accent");
  root.style.removeProperty("--natrix-accent-light");
  root.style.removeProperty("--natrix-accent-dark");
  root.style.removeProperty("--natrix-accent-glow");
  root.style.removeProperty("--natrix-accent-soft");

  // Re-apply the saved preset theme (restores bg too)
  try {
    const themeId = localStorage.getItem(THEME_KEY) ?? "ocean";
    applyTheme(themeId);
  } catch {
    applyTheme("ocean");
  }
}

// ─── ThemeProvider component ───────────────────────────────────────────────────

export default function ThemeProvider() {
  useEffect(() => {
    // Step 1: Apply from localStorage instantly — no flash
    try {
      const cachedTheme = localStorage.getItem(THEME_KEY);
      if (cachedTheme && THEMES[cachedTheme]) applyTheme(cachedTheme);

      const cachedSize = localStorage.getItem(FONT_SIZE_KEY);
      if (cachedSize) applyFontSize(cachedSize);

      // Apply custom colors on top of preset theme
      const customBg = localStorage.getItem(CUSTOM_BG_KEY);
      if (customBg !== null) applyCustomBg(Number(customBg), false);

      const customAccent = localStorage.getItem(CUSTOM_ACCENT_KEY);
      if (customAccent !== null) applyCustomAccent(Number(customAccent), false);
    } catch {}

    // Step 2: Verify with Supabase in background
    void loadFromSupabase();

    // Step 3: Keep in sync on auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const meta = session?.user?.user_metadata;

        const themeId = meta?.app_theme;
        if (themeId && THEMES[themeId]) applyTheme(themeId);

        const sizeId = meta?.app_font_size;
        if (sizeId) applyFontSize(sizeId);

        // Custom colors
        const customBgHue = meta?.custom_bg_hue;
        if (customBgHue != null && customBgHue >= 0) applyCustomBg(Number(customBgHue));

        const customAccentHue = meta?.custom_accent_hue;
        if (customAccentHue != null && customAccentHue >= 0) applyCustomAccent(Number(customAccentHue));
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function loadFromSupabase() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const meta = session?.user?.user_metadata;

      const themeId = meta?.app_theme;
      if (themeId && THEMES[themeId]) applyTheme(themeId);

      const sizeId = meta?.app_font_size;
      if (sizeId) applyFontSize(sizeId);

      // Custom colors from cloud
      const customBgHue = meta?.custom_bg_hue;
      if (customBgHue != null && customBgHue >= 0) applyCustomBg(Number(customBgHue));

      const customAccentHue = meta?.custom_accent_hue;
      if (customAccentHue != null && customAccentHue >= 0) applyCustomAccent(Number(customAccentHue));
    } catch {
      // Offline — localStorage fallback already applied
    }
  }

  return null;
}