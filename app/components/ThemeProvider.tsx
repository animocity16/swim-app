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
const THEME_KEY     = "natrix_theme";
const FONT_SIZE_KEY = "natrix_font_size";

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

  let styleEl = document.getElementById("natrix-theme");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "natrix-theme";
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    body {
      background-color: ${theme.bg} !important;
    }
    body::before {
      background:
        radial-gradient(ellipse 60% 50% at 15% 25%, ${theme.light}  0%, transparent 65%),
        radial-gradient(ellipse 50% 60% at 85% 55%, ${theme.dark}   0%, transparent 60%),
        radial-gradient(ellipse 70% 40% at 50% 85%, ${theme.light3} 0%, transparent 65%),
        radial-gradient(ellipse 40% 30% at 70% 15%, ${theme.light2} 0%, transparent 55%),
        linear-gradient(160deg, ${theme.bg} 0%, ${theme.mid} 40%, ${theme.bg} 100%) !important;
    }
    nav.fixed {
      background: ${theme.navBg} !important;
    }
    select.input option {
      background: ${theme.bg} !important;
    }
  `;
}

export function applyFontSize(sizeId: string) {
  const size = FONT_SIZES.find((s) => s.id === sizeId) ?? FONT_SIZES[1];
  try { localStorage.setItem(FONT_SIZE_KEY, sizeId); } catch {}
  document.documentElement.style.fontSize = `${size.pct}%`;
}

// ─── ThemeProvider component ───────────────────────────────────────────────────

export default function ThemeProvider() {
  useEffect(() => {
    // ✅ Step 1: Read from localStorage INSTANTLY — no flash.
    try {
      const cachedTheme = localStorage.getItem(THEME_KEY);
      if (cachedTheme && THEMES[cachedTheme]) applyTheme(cachedTheme);

      const cachedSize = localStorage.getItem(FONT_SIZE_KEY);
      if (cachedSize) applyFontSize(cachedSize);
    } catch {}

    // ✅ Step 2: Verify with Supabase in background.
    void loadFromSupabase();

    // ✅ Step 3: Keep in sync on login/logout/token refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const themeId = session?.user?.user_metadata?.app_theme;
        if (themeId && THEMES[themeId]) applyTheme(themeId);

        const sizeId = session?.user?.user_metadata?.app_font_size;
        if (sizeId) applyFontSize(sizeId);
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
    } catch {
      // Offline — localStorage fallback already applied
    }
  }

  return null;
}