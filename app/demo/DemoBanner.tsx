// app/demo/DemoBanner.tsx
"use client";

import Link from "next/link";

export default function DemoBanner() {
  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-2.5"
      style={{
        background: "rgba(217,119,6,0.22)",
        borderBottom: "1px solid rgba(253,230,138,0.3)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <p className="text-xs font-semibold text-white truncate">
        🏊 Interactive demo — sample swimmers, no real data
      </p>
      <Link
        href="/demo/scan"
        className="flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold text-white whitespace-nowrap"
        style={{ background: "#D97706" }}
      >
        Try scan
      </Link>
    </div>
  );
}
