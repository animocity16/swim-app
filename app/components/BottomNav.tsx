"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    href: "/scan",
    label: "Scan",
    tutorial: "scan",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="3" y="3" width="16" height="16" rx="3" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" />
        <path d="M7 11h8M11 7v8" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/compare",
    label: "Compare",
    tutorial: "compare",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M7 5H3v12h4V5zM19 5h-4v12h4V5z" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 8v6M9 11l2-2 2 2" stroke={active ? "#FDE68A" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

const HIDDEN_ON = ["/login", "/signup", "/forgot-password", "/reset-password", "/invite", "/auth", "/onboarding"];

export default function BottomNav() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

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
          padding: "8px 8px 10px",
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          boxShadow: "0 8px 32px rgba(0,20,50,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              data-tutorial={item.tutorial}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                padding: "6px 12px",
                borderRadius: "20px",
                transition: "background 0.15s ease",
                background: active ? "rgba(217,119,6,0.2)" : "transparent",
                border: active ? "1px solid rgba(253,230,138,0.25)" : "1px solid transparent",
                minWidth: "52px",
              }}
            >
              {item.icon(active)}
              <span style={{
                fontSize: "10px",
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