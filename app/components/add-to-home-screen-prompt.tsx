"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "natrix_a2hs_dismissed_at";
const DISMISS_COOLDOWN_DAYS = 14;

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function alreadyInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function recentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const daysSince = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
  return daysSince < DISMISS_COOLDOWN_DAYS;
}

/**
 * Soft "Add Natrix to your Home Screen" nudge, styled to match the app's
 * existing glass theme. Natrix already ships manifest.webmanifest + the
 * apple-mobile-web-app meta tags in app/layout.tsx — this component only
 * adds the missing piece: a dismissible nudge shown after real value
 * (a search result), not a popup on arrival.
 *
 *   <AddToHomeScreenPrompt show={result?.found === true} />
 */
export default function AddToHomeScreenPrompt({ show }: { show: boolean }) {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [dismissed, setDismissed] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(alreadyInstalled());
    setDismissed(recentlyDismissed());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show || dismissed || installed || platform === "unknown") return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  async function handleInstallClick() {
    if (deferredPrompt) {
      (deferredPrompt as unknown as { prompt: () => void }).prompt();
      setDeferredPrompt(null);
    }
  }

  return (
    <div className="card-soft mt-4 text-sm text-white/70">
      {platform === "ios" ? (
        <p>
          <strong className="text-white">Use Natrix often?</strong> Tap the Share icon in Safari, then{" "}
          <strong className="text-white">&ldquo;Add to Home Screen&rdquo;</strong> — opens full-screen, no App Store
          needed.
        </p>
      ) : (
        <p>
          <strong className="text-white">Use Natrix often?</strong> Add it to your Home Screen and open it like an app.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {platform !== "ios" && deferredPrompt && (
          <button type="button" onClick={handleInstallClick} className="btn" style={{ fontSize: "12px", padding: "8px 16px" }}>
            Add to Home Screen
          </button>
        )}
        <button type="button" onClick={handleDismiss} className="text-xs text-white/40 underline">
          Not now
        </button>
      </div>
    </div>
  );
}
