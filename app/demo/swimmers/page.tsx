// app/demo/swimmers/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DEMO_SWIMMERS, DEMO_TIMES, getInitials } from "@/lib/demoData";

const AVATAR_COLORS = [
  { bg: "#0F6E56", text: "#9FE1CB" },
  { bg: "#185FA5", text: "#B5D4F4" },
  { bg: "#854F0B", text: "#FAC775" },
  { bg: "#72243E", text: "#F4C0D1" },
  { bg: "#3C3489", text: "#CECBF6" },
];
function avatarColor(i: number) {
  return AVATAR_COLORS[i % AVATAR_COLORS.length];
}

type FilterMode = "all" | "club" | "school";

export default function DemoSwimmersPage() {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterValue, setFilterValue] = useState<string | null>(null);

  function selectFilter(mode: FilterMode, value: string | null) {
    setFilterMode(mode);
    setFilterValue(value);
  }

  const clubs = useMemo(
    () => [...new Set(DEMO_SWIMMERS.map((s) => s.swim_club))].sort(),
    []
  );
  const schools = useMemo(
    () => [...new Set(DEMO_SWIMMERS.map((s) => s.school))].sort(),
    []
  );

  const filtered = DEMO_SWIMMERS.filter((s) => {
    if (filterMode === "club" && filterValue) return s.swim_club === filterValue;
    if (filterMode === "school" && filterValue) return s.school === filterValue;
    return true;
  });

  const primary = filtered.filter((s) => s.group_type === "primary");
  const following = filtered.filter((s) => s.group_type === "following");

  function timeCountFor(id: number) {
    return DEMO_TIMES.filter((t) => t.swimmer_id === id).length;
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-white">Brood</h1>
          <p className="text-sm text-white/40 mt-0.5">Everyone you&apos;re tracking</p>
        </div>

        {/* Filter chips — grouped by Club / School, wraps instead of scrolling */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => selectFilter("all", null)}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
              style={filterMode === "all"
                ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
              All
            </button>
          </div>

          {clubs.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 mb-1.5 px-1">Club</p>
              <div className="flex flex-wrap gap-2">
                {clubs.map((club) => (
                  <button key={club} type="button" onClick={() => selectFilter("club", club)}
                    className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                    style={filterMode === "club" && filterValue === club
                      ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
                    {club}
                  </button>
                ))}
              </div>
            </div>
          )}

          {schools.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 mb-1.5 px-1">School</p>
              <div className="flex flex-wrap gap-2">
                {schools.map((school) => (
                  <button key={school} type="button" onClick={() => selectFilter("school", school)}
                    className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                    style={filterMode === "school" && filterValue === school
                      ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
                    {school}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Primary swimmer */}
        {primary.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/35 px-1">My swimmer</p>
            {primary.map((s, i) => (
              <SwimmerRow key={s.id} swimmer={s} index={i} timeCount={timeCountFor(s.id)} />
            ))}
          </div>
        )}

        {/* Following */}
        {following.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/35 px-1">
              Following ({following.length})
            </p>
            {following.map((s, i) => (
              <SwimmerRow key={s.id} swimmer={s} index={i + 1} timeCount={timeCountFor(s.id)} />
            ))}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}

function SwimmerRow({
  swimmer,
  index,
  timeCount,
}: {
  swimmer: (typeof DEMO_SWIMMERS)[number];
  index: number;
  timeCount: number;
}) {
  const colors = avatarColor(index);
  return (
    <Link
      href={`/demo/swimmers/${swimmer.id}`}
      className="flex items-center gap-4 rounded-3xl p-4"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-base font-bold"
        style={{ background: colors.bg, color: colors.text }}>
        {getInitials(swimmer.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white truncate">{swimmer.name}</p>
        <p className="text-xs text-white/45 mt-0.5">
          Age {swimmer.age} · {swimmer.swim_club}
        </p>
        <p className="text-[11px] text-white/35 mt-0.5 truncate">{swimmer.school}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-white/40">{timeCount} times</p>
        {swimmer.group_type === "primary" && (
          <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{ background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.25)", color: "#FDE68A" }}>
            My Swimmer
          </span>
        )}
      </div>
    </Link>
  );
}
