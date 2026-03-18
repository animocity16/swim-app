"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/swimmers", label: "Swimmers", icon: "🏊" },
  { href: "/times", label: "Times", icon: "⏱" },
  { href: "/progress", label: "Progress", icon: "📈" },
  { href: "/import", label: "Import", icon: "📥" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-white">
      <div className="mx-auto flex max-w-md justify-around py-2">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center text-xs ${
                active ? "text-sky-600" : "text-gray-500"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}