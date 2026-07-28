// app/demo/compare/page.tsx
"use client";

import { useMemo, useState } from "react";
import { DEMO_SWIMMERS, DEMO_TIMES, formatMs, getInitials } from "@/lib/demoData";

const AVATAR_COLORS = [
  { bg: "#92400E", text: "#FDE68A" },
  { bg: "#1E3A5F", text: "#93C5FD" },
  { bg: "#164E3A", text: "#6EE7B7" },
  { bg: "#3B0764", text: "#E9D5FF" },
  { bg: "#78350F", text: "#FCD34D" },
  { bg: "#1E1B4B", text: "#A5B4FC" },
];
function avatarColor(i: number) {
  return AVATAR_COLORS[i % AVATAR_COLORS.length];
}

const RANK_STYLES: Record<number, { bg: string; border: string; numColor: string }> = {
  1: { bg: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.4)", numColor: "#FDE68A" },
  2: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)", numColor: "#CBD5E1" },
  3: { bg: "rgba(180,100,50,0.15)", border: "rgba(180,100,50,0.35)", numColor: "#FDBA74" },
};

function shortName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default function DemoComparePage() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(DEMO_SWIMMERS.map((s) => s.id)));
  const [selectedEvent, setSelectedEvent] = useState<string>("50 Free");

  const events = useMemo(
    () => [...new Set(DEMO_TIMES.map((t) => t.event))].sort(),
    []
  );

  function toggleSwimmer(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rankedRows = useMemo(() => {
    const rows: { swimmerId: number; name: string; timeMs: number }[] = [];
    for (const swimmer of DEMO_SWIMMERS) {
      if (!selectedIds.has(swimmer.id)) continue;
      const times = DEMO_TIMES.filter((t) => t.swimmer_id === swimmer.id && t.event === selectedEvent);
      if (times.length === 0) continue;
      const pb = Math.min(...times.map((t) => t.time_ms));
      rows.push({ swimmerId: swimmer.id, name: swimmer.name, timeMs: pb });
    }
    return rows.sort((a, b) => a.timeMs - b.timeMs);
  }, [selectedIds, selectedEvent]);

  return (
    <div className="shell">
      <div className="container-app space-y-5">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-white">Compare</h1>
          <p className="text-sm text-white/40 mt-0.5">Stack PBs side by side, by event</p>
        </div>

        {/* Event selector */}
        <div className="flex flex-wrap gap-2">
          {events.map((event) => (
            <button key={event} type="button" onClick={() => setSelectedEvent(event)}
              className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
              style={selectedEvent === event
                ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
              {event}
            </button>
          ))}
        </div>

        {/* Swimmer picker */}
        <div className="rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-3">Swimmers in comparison</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_SWIMMERS.map((s, i) => {
              const active = selectedIds.has(s.id);
              const colors = avatarColor(i);
              return (
                <button key={s.id} type="button" onClick={() => toggleSwimmer(s.id)}
                  className="flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-medium transition"
                  style={active
                    ? { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", color: "white" }
                    : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                    style={{ background: colors.bg, color: colors.text, opacity: active ? 1 : 0.4 }}>
                    {getInitials(s.name)}
                  </span>
                  {shortName(s.name)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ranked table */}
        <div className="rounded-3xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
          {rankedRows.length === 0 ? (
            <div className="py-8 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-sm text-white/40">No times logged for {selectedEvent} yet</p>
            </div>
          ) : (
            rankedRows.map((row, i) => {
              const rank = i + 1;
              const style = RANK_STYLES[rank] ?? { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", numColor: "rgba(255,255,255,0.4)" };
              const swimmerIndex = DEMO_SWIMMERS.findIndex((s) => s.id === row.swimmerId);
              const colors = avatarColor(swimmerIndex);
              return (
                <div key={row.swimmerId} className="flex items-center gap-3 px-4 py-3"
                  style={{ background: style.bg, borderTop: i > 0 ? `1px solid ${style.border}` : "none" }}>
                  <span className="w-5 text-center text-sm font-bold" style={{ color: style.numColor }}>{rank}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold flex-shrink-0"
                    style={{ background: colors.bg, color: colors.text }}>
                    {getInitials(row.name)}
                  </span>
                  <span className="flex-1 text-sm font-medium text-white truncate">{row.name}</span>
                  <span className="text-sm font-bold text-white">{formatMs(row.timeMs)}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
