"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { applyLanguage, initLanguageFromCache } from "@/lib/i18n";

// Mirrors ThemeProvider exactly: instant apply from localStorage on cold
// load (no flash), then background sync from Supabase user_metadata, then
// stay in sync on every auth state change (covers updateUser saves made
// from another tab/device too).
export default function LanguageProvider() {
  useEffect(() => {
    initLanguageFromCache();
    void loadFromSupabase();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const langId = session?.user?.user_metadata?.app_language;
        if (langId) applyLanguage(langId);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function loadFromSupabase() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const langId = session?.user?.user_metadata?.app_language;
      if (langId) applyLanguage(langId);
    } catch {}
  }

  return null;
}
