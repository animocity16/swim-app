"use client";

// Shown on every screen while the interactive demo is on. Tells the visitor the
// data is fictional and stays on this device, and offers Reset and Exit.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { exitDemo, isDemoActive } from "@/lib/demo/demoMode";
import { resetDb } from "@/lib/demo/store";

export default function DemoModeBanner() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  // Read after mount so server and first client render match.
  useEffect(() => {
    setActive(isDemoActive());
  }, [pathname]);

  if (!active) return null;

  function leave(to: string) {
    exitDemo();
    resetDb();
    window.location.assign(to);
  }

  function reset() {
    resetDb();
    window.location.assign("/dashboard");
  }

  const tip =
    pathname === "/swimmers"
      ? "Tap “+ Add swimmer”, then search “Olivia”, “Ethan” or “Zoe” to follow them."
      : null;

  return (
    <div
      className="sticky top-0 z-40 px-3 py-1.5"
      style={{
        background: "rgba(217,119,6,0.24)",
        borderBottom: "1px solid rgba(253,230,138,0.3)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold leading-tight text-white">🏊 Interactive demo</p>
          <p className="text-[10px] leading-tight text-white/70">Fictional swimmers. Changes stay in this browser.</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={reset}
            className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white/85"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => leave("/signup")}
            className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white whitespace-nowrap"
            style={{ background: "#D97706" }}
          >
            Sign up
          </button>
          <button
            type="button"
            onClick={() => leave("/")}
            className="rounded-full px-2 py-1 text-[11px] font-bold text-white/70"
            aria-label="Exit demo"
          >
            Exit
          </button>
        </div>
      </div>
      {tip && <p className="mt-1 text-[11px] leading-snug text-white/80">{tip}</p>}
    </div>
  );
}
