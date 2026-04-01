"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/swimmers", label: "Progress" },
  { href: "/scan", label: "Scan" },
  { href: "/standards", label: "Standards" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-around px-4 py-3">
        {items.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}