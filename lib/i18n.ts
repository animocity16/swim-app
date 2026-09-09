// lib/i18n.ts
// Natrix language system — same pattern as ThemeProvider: instant
// localStorage cache on load, background sync from Supabase user_metadata,
// live update on auth state change. No external i18n library, no new deps.

export type LanguageId = "en" | "ms" | "id" | "th" | "vi" | "tl";

export const LANGUAGES: { id: LanguageId; label: string; flag: string }[] = [
  { id: "en", label: "English",          flag: "🇬🇧" },
  { id: "ms", label: "Bahasa Melayu",    flag: "🇲🇾" },
  { id: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { id: "th", label: "ไทย",              flag: "🇹🇭" },
  { id: "vi", label: "Tiếng Việt",       flag: "🇻🇳" },
  { id: "tl", label: "Filipino",         flag: "🇵🇭" },
];

const LANGUAGE_KEY = "natrix_language";

// ─── Dictionary ──────────────────────────────────────────────────────────────
// Flat key → per-language string. Add new keys here as more screens are
// translated; anything missing falls back to English automatically.

type Dict = Record<string, string>;

export const TRANSLATIONS: Record<LanguageId, Dict> = {
  en: {
    "nav.home": "Home",
    "nav.brood": "Brood",
    "nav.meets": "Meets",
    "nav.compare": "Compare",
    "nav.settings": "Settings",
    "nav.scan": "Scan",
    "scan.meetMobile": "Meet Mobile",
    "scan.swimCloud": "SwimCloud",
    "settings.language.title": "Language",
    "settings.language.subtitle": "Changes the app's menus and labels.",
    "settings.language.saved": "✓ Language saved",
    "common.saving": "Saving...",
  },
  ms: {
    "nav.home": "Utama",
    "nav.brood": "Kumpulan",
    "nav.meets": "Perlawanan",
    "nav.compare": "Banding",
    "nav.settings": "Tetapan",
    "nav.scan": "Imbas",
    "scan.meetMobile": "Meet Mobile",
    "scan.swimCloud": "SwimCloud",
    "settings.language.title": "Bahasa",
    "settings.language.subtitle": "Menukar menu dan label aplikasi.",
    "settings.language.saved": "✓ Bahasa disimpan",
    "common.saving": "Menyimpan...",
  },
  id: {
    "nav.home": "Beranda",
    "nav.brood": "Grup",
    "nav.meets": "Kejuaraan",
    "nav.compare": "Bandingkan",
    "nav.settings": "Pengaturan",
    "nav.scan": "Pindai",
    "scan.meetMobile": "Meet Mobile",
    "scan.swimCloud": "SwimCloud",
    "settings.language.title": "Bahasa",
    "settings.language.subtitle": "Mengubah menu dan label aplikasi.",
    "settings.language.saved": "✓ Bahasa disimpan",
    "common.saving": "Menyimpan...",
  },
  th: {
    "nav.home": "หน้าแรก",
    "nav.brood": "กลุ่ม",
    "nav.meets": "การแข่งขัน",
    "nav.compare": "เปรียบเทียบ",
    "nav.settings": "ตั้งค่า",
    "nav.scan": "สแกน",
    "scan.meetMobile": "Meet Mobile",
    "scan.swimCloud": "SwimCloud",
    "settings.language.title": "ภาษา",
    "settings.language.subtitle": "เปลี่ยนเมนูและป้ายกำกับของแอป",
    "settings.language.saved": "✓ บันทึกภาษาแล้ว",
    "common.saving": "กำลังบันทึก...",
  },
  vi: {
    "nav.home": "Trang chủ",
    "nav.brood": "Nhóm",
    "nav.meets": "Giải đấu",
    "nav.compare": "So sánh",
    "nav.settings": "Cài đặt",
    "nav.scan": "Quét",
    "scan.meetMobile": "Meet Mobile",
    "scan.swimCloud": "SwimCloud",
    "settings.language.title": "Ngôn ngữ",
    "settings.language.subtitle": "Thay đổi menu và nhãn của ứng dụng.",
    "settings.language.saved": "✓ Đã lưu ngôn ngữ",
    "common.saving": "Đang lưu...",
  },
  tl: {
    "nav.home": "Home",
    "nav.brood": "Grupo",
    "nav.meets": "Paligsahan",
    "nav.compare": "Ihambing",
    "nav.settings": "Setting",
    "nav.scan": "I-scan",
    "scan.meetMobile": "Meet Mobile",
    "scan.swimCloud": "SwimCloud",
    "settings.language.title": "Wika",
    "settings.language.subtitle": "Binabago ang mga menu at label ng app.",
    "settings.language.saved": "✓ Na-save ang wika",
    "common.saving": "Sine-save...",
  },
};

// ─── Store (imperative, subscriber-based — same shape as ThemeProvider's
//     localStorage-driven pattern, but with a pub/sub so React text re-renders
//     the moment the language changes, same tab included) ────────────────────

let currentLang: LanguageId = "en";
const listeners = new Set<() => void>();

function isValidLang(id: unknown): id is LanguageId {
  return typeof id === "string" && LANGUAGES.some((l) => l.id === id);
}

export function getLanguage(): LanguageId {
  return currentLang;
}

export function applyLanguage(langId: string) {
  if (!isValidLang(langId)) return;
  currentLang = langId;
  try { localStorage.setItem(LANGUAGE_KEY, langId); } catch {}
  try { document.documentElement.lang = langId; } catch {}
  listeners.forEach((fn) => fn());
}

export function initLanguageFromCache() {
  try {
    const cached = localStorage.getItem(LANGUAGE_KEY);
    if (isValidLang(cached)) applyLanguage(cached);
  } catch {}
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function translate(key: string, lang: LanguageId = currentLang): string {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

// ─── React hook ──────────────────────────────────────────────────────────────

import { useSyncExternalStore } from "react";

export function useTranslation() {
  const lang = useSyncExternalStore(subscribe, getLanguage, () => "en" as LanguageId);
  return {
    lang,
    t: (key: string) => translate(key, lang),
    setLanguage: applyLanguage,
  };
}
