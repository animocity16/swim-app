// app/demo/meets/page.tsx
"use client";

import { useState } from "react";
import { DEMO_MEETS, DEMO_SWIMMERS, DEMO_PRIMARY_SWIMMER_ID, formatDate } from "@/lib/demoData";

function meetEmoji(meetType: string): string {
  switch (meetType) {
    case "SNAG": return "🌟";
    case "ETC": return "🎉";
    case "NSG": return "🏫";
    case "NSC": return "🏆";
    default: return "🏊";
  }
}

export default function DemoMeetsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const primary = DEMO_SWIMMERS.find((s) => s.id === DEMO_PRIMARY_SWIMMER_ID)!;
  const meets = [...DEMO_MEETS].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return (
    <div className="shell">
      <div className="container-app space-y-5">
        <div className="pt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Meets</h1>
            <p className="text-sm text-white/40 mt-0.5">Upcoming swim meets</p>
          </div>
          <div className="rounded-2xl px-3 py-1.5 text-xs font-semibold"
            style={{ background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.25)", color: "#FDE68A" }}>
            + Add meet
          </div>
        </div>

        <div className="space-y-3">
          {meets.map((meet) => {
            const expanded = expandedId === meet.id;
            return (
              <div key={meet.id} className="rounded-3xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <button type="button" onClick={() => setExpandedId(expanded ? null : meet.id)}
                  className="w-full flex items-center gap-3 p-4 text-left">
                  <span style={{ fontSize: 22 }}>{meetEmoji(meet.meetType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{meet.name}</p>
                    <p className="text-xs text-white/40 mt-0.5 truncate">{meet.location}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-white/70">{formatDate(meet.startDate)}</p>
                    {meet.swimmerEvents && (
                      <p className="text-[10px] mt-0.5" style={{ color: "#FDE68A" }}>{meet.swimmerEvents.length} events</p>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-4">
                    {meet.swimmerEvents && meet.swimmerEvents.length > 0 ? (
                      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/35"
                          style={{ background: "rgba(255,255,255,0.03)" }}>
                          {primary.name}&apos;s events — pulled from scanned start list
                        </div>
                        {meet.swimmerEvents.map((ev, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2.5 text-xs"
                            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <div>
                              <p className="font-medium text-white">{ev.event}</p>
                              <p className="text-white/40 mt-0.5">Heat {ev.heat} · Lane {ev.lane}</p>
                            </div>
                            <p className="font-semibold" style={{ color: "#FDE68A" }}>{ev.startTime}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <p className="text-xs text-white/40">Scan the PDF start list to pull in events automatically</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
