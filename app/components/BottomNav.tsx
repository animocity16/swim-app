"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Home",
    tutorial: "home",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M4 10.5L11 4L18 10.5V18H14V13H8V18H4V10.5Z" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    href: "/swimmers",
    label: "Brood",
    tutorial: "brood",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="8" r="3.5" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" />
        <path d="M3 19c0-4 3.6-7 8-7s8 3 8 7" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/meets",
    label: "Meets",
    tutorial: "meets",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M7 3h8l2 5-6 3-6-3 2-5z" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M11 11v7M8 18h6" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/compare",
    label: "Compare",
    tutorial: "compare",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="6" width="8" height="10" rx="2" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" fill="none" />
        <rect x="12" y="4" width="8" height="12" rx="2" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" fill="none" />
        <path d="M10 11h2" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    tutorial: "settings",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="2.5" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" />
        <path d="M11 4v2M11 16v2M4 11H2M20 11h-2M5.93 5.93 7.34 7.34M14.66 14.66l1.41 1.41M5.93 16.07l1.41-1.41M14.66 7.34l1.41-1.41" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const SCAN_ICON = (active: boolean) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <rect x="3" y="3" width="16" height="16" rx="3" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" />
    <path d="M7 11h8M11 7v8" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const HIDDEN_ON = ["/login", "/signup", "/forgot-password", "/reset-password", "/invite", "/auth", "/onboarding"];

// Nav items that don't make sense in the read-only demo (nothing to scan,
// nothing to configure) get swapped out or hidden when browsing /demo/*.
const DEMO_HIDDEN_HREFS = ["/settings"];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [scanMenuOpen, setScanMenuOpen] = useState(false);
  const scanWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (scanWrapRef.current && !scanWrapRef.current.contains(e.target as Node)) {
        setScanMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setScanMenuOpen(false);
  }, [pathname]);

  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const isDemo = pathname.startsWith("/demo");
  const prefix = isDemo ? "/demo" : "";
  const items = isDemo ? NAV_ITEMS.filter((item) => !DEMO_HIDDEN_HREFS.includes(item.href)) : NAV_ITEMS;

  const scanActive = !isDemo && pathname.startsWith("/scan");

  function handleMeetMobile() {
    setScanMenuOpen(false);
    router.push("/scan/meetmobile");
  }

  function handleSwimCloud() {
    setScanMenuOpen(false);
    router.push("/scan/swimcloud");
  }

  return (
    <nav
      className="fixed bottom-3 left-1/2 z-50"
      style={{ transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: "420px" }}
    >
      <div
        style={{
          background: "rgba(6,40,65,0.72)",
          backdropFilter: "blur(32px) saturate(1.8)",
          WebkitBackdropFilter: "blur(32px) saturate(1.8)",
          border: "1px solid rgba(255,255,255,0.22)",
          borderRadius: "28px",
          padding: "8px 4px 10px",
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          boxShadow: "0 8px 32px rgba(0,20,50,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
      >
        {items.slice(0, 2).map((item) => {
          const href = `${prefix}${item.href}`;
          const active = item.href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              data-tutorial={item.tutorial}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                padding: "6px 8px",
                borderRadius: "20px",
                transition: "background 0.15s ease",
                background: active ? "rgba(217,119,6,0.2)" : "transparent",
                border: active ? "1px solid rgba(253,230,138,0.25)" : "1px solid transparent",
                minWidth: "44px",
              }}
            >
              {item.icon(active)}
              <span style={{
                fontSize: "9px",
                fontWeight: active ? 600 : 400,
                letterSpacing: "0.02em",
                color: active ? "#FDE68A" : "rgba(255,255,255,0.45)",
                transition: "color 0.15s ease",
              }}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Scan — dropdown trigger. In demo mode this is disabled since the
            demo is read-only (nothing to save a scan into). */}
        <div ref={scanWrapRef} style={{ position: "relative" }}>
          {scanMenuOpen && !isDemo && (
            <div
              className="absolute left-1/2"
              style={{
                bottom: "calc(100% + 12px)",
                transform: "translateX(-50%)",
                width: "180px",
                background: "rgba(6,40,65,0.96)",
                backdropFilter: "blur(24px) saturate(1.8)",
                WebkitBackdropFilter: "blur(24px) saturate(1.8)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: "16px",
                padding: "6px",
                boxShadow: "0 12px 32px rgba(0,20,50,0.55)",
              }}
            >
              <button
                type="button"
                onClick={handleMeetMobile}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition hover:bg-white/5"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                Meet Mobile
                <span style={{ fontSize: "14px" }}>📷</span>
              </button>
              <button
                type="button"
                onClick={handleSwimCloud}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition hover:bg-white/5"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                SwimCloud
                <span style={{ fontSize: "14px" }}>☁️</span>
              </button>
            </div>
          )}

          <button
            type="button"
            data-tutorial="scan"
            onClick={() => {
              if (isDemo) { router.push("/signup"); return; }
              setScanMenuOpen((v) => !v);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "3px",
              padding: "6px 8px",
              borderRadius: "20px",
              transition: "background 0.15s ease",
              background: scanActive || scanMenuOpen ? "rgba(217,119,6,0.2)" : "transparent",
              border: scanActive || scanMenuOpen ? "1px solid rgba(253,230,138,0.25)" : "1px solid transparent",
              minWidth: "44px",
              opacity: isDemo ? 0.5 : 1,
            }}
          >
            {SCAN_ICON(scanActive || scanMenuOpen)}
            <span style={{
              fontSize: "9px",
              fontWeight: scanActive ? 600 : 400,
              letterSpacing: "0.02em",
              color: scanActive || scanMenuOpen ? "#FDE68A" : "rgba(255,255,255,0.45)",
              transition: "color 0.15s ease",
            }}>
              Scan
            </span>
          </button>
        </div>

        {items.slice(2).map((item) => {
          const href = `${prefix}${item.href}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              data-tutorial={item.tutorial}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                padding: "6px 8px",
                borderRadius: "20px",
                transition: "background 0.15s ease",
                background: active ? "rgba(217,119,6,0.2)" : "transparent",
                border: active ? "1px solid rgba(253,230,138,0.25)" : "1px solid transparent",
                minWidth: "44px",
              }}
            >
              {item.icon(active)}
              <span style={{
                fontSize: "9px",
                fontWeight: active ? 600 : 400,
                letterSpacing: "0.02em",
                color: active ? "#FDE68A" : "rgba(255,255,255,0.45)",
                transition: "color 0.15s ease",
              }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
