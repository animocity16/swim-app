"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

// ─── Theme definitions ─────────────────────────────────────────────────────────

interface ThemeVars {
  bg: string; dark: string; mid: string;
  light: string; light2: string; light3: string; navBg: string;
}

const THEMES: Record<string, ThemeVars> = {
  ocean:    { bg:"#063554", dark:"#073E6A", mid:"#084A73", light:"#0D6E9A", light2:"#0E7A9E", light3:"#0A5580", navBg:"rgba(6,53,84,0.80)" },
  midnight: { bg:"#0D0D1A", dark:"#0D0D2A", mid:"#1A1A3E", light:"#1F1F5E", light2:"#252575", light3:"#151540", navBg:"rgba(13,13,26,0.88)" },
  forest:   { bg:"#051A10", dark:"#0A2A18", mid:"#0A3020", light:"#0D4026", light2:"#105030", light3:"#0D3820", navBg:"rgba(5,26,16,0.88)" },
  sunset:   { bg:"#180A00", dark:"#221000", mid:"#2C1500", light:"#3D1E00", light2:"#4A2400", light3:"#251000", navBg:"rgba(24,10,0,0.90)" },
  cosmos:   { bg:"#0D0820", dark:"#150D30", mid:"#1E1040", light:"#251350", light2:"#2A1560", light3:"#1A0E38", navBg:"rgba(13,8,32,0.88)" },
  slate:    { bg:"#0D1117", dark:"#141B24", mid:"#1C2333", light:"#1E2638", light2:"#222C40", light3:"#1A2030", navBg:"rgba(13,17,23,0.88)" },
};

// ─── Font colour presets (must match settings page) ───────────────────────────

const FONT_COLOUR_MAP: Record<string, string> = {
  pink:     "#FF6EB4",
  white:    "#FFFFFF",
  babyblue: "#89CFF0",
  red:      "#FF4444",
  black:    "#1A1A1A",
  blue:     "#3B82F6",
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

const THEME_KEY      = "natrix_theme";
const FONT_SIZE_KEY  = "natrix_font_size";
const CUSTOM_BG_KEY  = "natrix_custom_bg_hue";
const FONT_COL_KEY   = "natrix_font_colour";
const AVATAR_HUE_KEY = "natrix_avatar_hue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateStyle(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = id; document.head.appendChild(el); }
  return el;
}

function buildBgStyle(t: ThemeVars): string {
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
  getOrCreateStyle("natrix-theme").textContent = buildBgStyle(theme);

  // After applying preset, re-apply custom bg if one is saved
  try {
    const savedBg = localStorage.getItem(CUSTOM_BG_KEY);
    if (savedBg !== null) applyCustomBg(Number(savedBg));
  } catch {}
}

export function applyFontSize(sizeId: string) {
  const size = FONT_SIZES.find((s) => s.id === sizeId) ?? FONT_SIZES[1];
  try { localStorage.setItem(FONT_SIZE_KEY, sizeId); } catch {}
  document.documentElement.style.fontSize = `${size.pct}%`;
}

export function applyCustomBg(hue: number) {
  try { localStorage.setItem(CUSTOM_BG_KEY, String(hue)); } catch {}

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

  getOrCreateStyle("natrix-theme").textContent = buildBgStyle({ bg, dark, mid, light, light2, light3, navBg });
}

export function applyFontColour(hex: string) {
  try { localStorage.setItem(FONT_COL_KEY, hex); } catch {}
  document.documentElement.style.setProperty("--natrix-font-colour", hex);
  getOrCreateStyle("natrix-font-colour").textContent = `
    .accent-text { color: ${hex} !important; }
    [style*="#FDE68A"] { color: ${hex} !important; }
    [style*="#BA7517"] { color: ${hex} !important; }
  `;
}

export function applyAvatarHue(hue: number) {
  try { localStorage.setItem(AVATAR_HUE_KEY, String(hue)); } catch {}
  const hex = `hsl(${hue},65%,38%)`;
  document.documentElement.style.setProperty("--natrix-avatar-colour", hex);
  // Contrast text
  const r=parseInt(hex.slice(1,3),16)||0, g=parseInt(hex.slice(3,5),16)||0, b=parseInt(hex.slice(5,7),16)||0;
  const text = (0.299*r + 0.587*g + 0.114*b)/255 > 0.5 ? "#1a1a1a" : "#ffffff";
  document.documentElement.style.setProperty("--natrix-avatar-text", text);
}



export default function ThemeProvider() {
  useEffect(() => {
    // Step 1: Apply from localStorage instantly — no flash
    try {
      const cachedTheme = localStorage.getItem(THEME_KEY);
      if (cachedTheme && THEMES[cachedTheme]) applyTheme(cachedTheme);
      // applyTheme already re-applies custom bg if present

      const cachedSize = localStorage.getItem(FONT_SIZE_KEY);
      if (cachedSize) applyFontSize(cachedSize);

      const cachedFontCol = localStorage.getItem(FONT_COL_KEY);
      if (cachedFontCol) applyFontColour(cachedFontCol);

      const cachedAvatarHue = localStorage.getItem(AVATAR_HUE_KEY);
      if (cachedAvatarHue !== null) applyAvatarHue(Number(cachedAvatarHue));
    } catch {}

    // Step 2: Sync from Supabase in background
    void loadFromSupabase();

    // Step 3: Keep in sync on ANY auth state change (including updateUser saves)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const meta = session?.user?.user_metadata;
        if (!meta) return;

        // Preset theme
        const themeId = meta.app_theme;
        if (themeId && THEMES[themeId]) applyTheme(themeId);
        // applyTheme above already re-applies custom bg from localStorage

        // Font size
        const sizeId = meta.app_font_size;
        if (sizeId) applyFontSize(sizeId);

        // Custom bg from server (in case localStorage is stale)
        const customBgHue = meta.custom_bg_hue;
        if (customBgHue != null && customBgHue >= 0) applyCustomBg(Number(customBgHue));

        // Font colour from server
        const fontColourId = meta.font_colour as string | undefined;
        if (fontColourId && FONT_COLOUR_MAP[fontColourId]) {
          applyFontColour(FONT_COLOUR_MAP[fontColourId]);
        }

        // Avatar hue from server
        const avatarHue = meta.avatar_hue;
        if (avatarHue != null && avatarHue >= 0) applyAvatarHue(Number(avatarHue));
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function loadFromSupabase() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const meta = session?.user?.user_metadata;
      if (!meta) return;

      const themeId = meta.app_theme;
      if (themeId && THEMES[themeId]) applyTheme(themeId);

      const sizeId = meta.app_font_size;
      if (sizeId) applyFontSize(sizeId);

      const customBgHue = meta.custom_bg_hue;
      if (customBgHue != null && customBgHue >= 0) applyCustomBg(Number(customBgHue));

      const fontColourId = meta.font_colour as string | undefined;
      if (fontColourId && FONT_COLOUR_MAP[fontColourId]) {
        applyFontColour(FONT_COLOUR_MAP[fontColourId]);
      }

      const avatarHue = meta.avatar_hue;
      if (avatarHue != null && avatarHue >= 0) applyAvatarHue(Number(avatarHue));
    } catch {}
  }

  return null;
}