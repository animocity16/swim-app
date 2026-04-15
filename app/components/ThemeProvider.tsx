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

// ─── Public helper — injects a <style> tag so changes are guaranteed ──────────

export function applyTheme(themeId: string) {
  const theme = THEMES[themeId] ?? THEMES.ocean;

  // Set CSS vars for any components that use them
  const root = document.documentElement;
  root.style.setProperty("--theme-bg",     theme.bg);
  root.style.setProperty("--theme-dark",   theme.dark);
  root.style.setProperty("--theme-mid",    theme.mid);
  root.style.setProperty("--theme-light",  theme.light);
  root.style.setProperty("--theme-light2", theme.light2);
  root.style.setProperty("--theme-light3", theme.light3);
  root.style.setProperty("--theme-nav-bg", theme.navBg);

  // Inject a <style> tag — this overrides everything in globals.css
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

// ─── ThemeProvider component ───────────────────────────────────────────────────

export default function ThemeProvider() {
  useEffect(() => {
    void loadTheme();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const themeId = session?.user?.user_metadata?.app_theme ?? "ocean";
        applyTheme(themeId);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function loadTheme() {
    const { data: { user } } = await supabase.auth.getUser();
    const themeId = user?.user_metadata?.app_theme ?? "ocean";
    applyTheme(themeId);
  }

  return null;
}