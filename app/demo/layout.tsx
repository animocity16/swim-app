// app/demo/layout.tsx
"use client";

import Link from "next/link";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* Demo banner — always visible, makes it obvious this isn't real data */}
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
          🏊 You&apos;re viewing a demo — sample swimmers, not real data
        </p>
        <Link
          href="/signup"
          className="flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold text-white whitespace-nowrap"
          style={{ background: "#D97706" }}
        >
          Sign up
        </Link>
      </div>

      {children}
    </div>
  );
}
