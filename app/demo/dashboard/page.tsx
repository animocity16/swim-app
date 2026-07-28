// app/demo/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DEMO_SWIMMERS,
  DEMO_TIMES,
  DEMO_MEETS,
  DEMO_STANDARDS,
  DEMO_PRIMARY_SWIMMER_ID,
  formatMs,
  formatDate,
  getInitials,
} from "@/lib/demoData";

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

function meetEmoji(meetType: string): string {
  switch (meetType) {
    case "SNAG": return "🌟";
    case "ETC": return "🎉";
    case "NSG": return "🏫";
    case "NSC": return "🏆";
    default: return "🏊";
  }
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QualifiedArc({ qualified, total }: { qualified: number; total: number }) {
  const pct = total > 0 ? qualified / total : 0;
  const R = 30, cx = 36, cy = 36;
  const circumference = 2 * Math.PI * R;
  const dash = pct * circumference;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#6EE7B7" strokeWidth="6"
        strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 3} textAnchor="middle" fill="#6EE7B7" fontSize="15" fontWeight="700">{qualified}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="8" fontWeight="500">of {total}</text>
    </svg>
  );
}

export default function DemoDashboardPage() {
  const [activitySectionOpen, setActivitySectionOpen] = useState(false);
  const [meetsSectionOpen, setMeetsSectionOpen] = useState(false);

  const primary = DEMO_SWIMMERS.find((s) => s.id === DEMO_PRIMARY_SWIMMER_ID)!;

  const myTimes = useMemo(
    () => DEMO_TIMES.filter((t) => t.swimmer_id === primary.id)
      .sort((a, b) => new Date(b.swam_at).getTime() - new Date(a.swam_at).getTime()),
    [primary.id]
  );

  const recentResults = myTimes.slice(0, 5);
  const upcomingMeets = [...DEMO_MEETS].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const pbMap = new Map<string, number>();
  for (const row of [...myTimes].sort((a, b) => a.time_ms - b.time_ms)) {
    const key = `${row.event}|${row.course}`;
    if (!pbMap.has(key)) pbMap.set(key, row.time_ms);
  }
  const qualified = DEMO_STANDARDS.filter((s) => {
    const pb = pbMap.get(`${s.event}|${s.course}`);
    return pb != null && pb <= s.cutoffMs;
  }).length;

  const totalEvents = pbMap.size;
  const totalTimes = myTimes.length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="shell">
      <div className="container-app space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <p className="text-sm text-white/40">{greeting},</p>
            <h1 className="text-2xl font-bold text-white">Demo Parent 👋</h1>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg"
            style={{ background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.3)" }}>
            🏊
          </div>
        </div>

        {/* Primary swimmer card */}
        <Link
          href={`/demo/swimmers/${primary.id}`}
          className="block rounded-3xl p-4"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-base font-bold"
              style={{ background: avatarColor(0).bg, color: avatarColor(0).text }}>
              {getInitials(primary.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{primary.name}</p>
              <p className="text-xs text-white/45 mt-0.5">
                Age {primary.age} · {primary.swim_club}
              </p>
              <div className="flex gap-3 mt-1.5 text-xs text-white/40">
                <span>{totalEvents} events</span>
                <span>{totalTimes} times logged</span>
              </div>
            </div>
            {recentResults[0] && (
              <div className="text-right flex-shrink-0">
                <p className="text-base font-bold text-white">{formatMs(recentResults[0].time_ms)}</p>
                <p className="text-[10px] text-white/40">{recentResults[0].event}</p>
                {recentResults[0].is_pb && (
                  <span className="inline-block mt-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ background: "rgba(110,231,183,0.15)", color: "#6EE7B7" }}>
                    PB
                  </span>
                )}
              </div>
            )}
          </div>
        </Link>

        {/* Standards summary */}
        <div className="rounded-3xl p-4 flex items-center gap-4"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <QualifiedArc qualified={qualified} total={DEMO_STANDARDS.length} />
          <div>
            <p className="text-sm font-semibold text-white">Squad upgrade standards</p>
            <p className="text-xs text-white/40 mt-0.5">
              {primary.name.split(" ")[0]} has hit {qualified} of {DEMO_STANDARDS.length} cutoff times
            </p>
            <Link href={`/demo/swimmers/${primary.id}?tab=standards`}
              className="text-xs font-semibold mt-1 inline-block" style={{ color: "#FDE68A" }}>
              View standards →
            </Link>
          </div>
        </div>

        {/* Square tiles */}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setActivitySectionOpen((v) => !v)}
            className="group flex aspect-square flex-col justify-between rounded-3xl p-4 text-left transition active:scale-[0.97]"
            style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 22 }}>⏱️</span>
              <span className="text-white/25"><ChevronIcon /></span>
            </div>
            <div>
              <p className="text-2xl font-bold leading-none text-white">{recentResults.length}</p>
              <p className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-white/35">Recent results</p>
            </div>
          </button>

          <button type="button" onClick={() => setMeetsSectionOpen((v) => !v)}
            className="group flex aspect-square flex-col justify-between rounded-3xl p-4 text-left transition active:scale-[0.97]"
            style={{ background: "rgba(217,119,6,0.12)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 22 }}>📅</span>
              <span className="text-white/25"><ChevronIcon /></span>
            </div>
            <div>
              <p className="text-2xl font-bold leading-none text-white">{upcomingMeets.length}</p>
              <p className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-white/35">Upcoming meets</p>
            </div>
          </button>
        </div>

        {/* Recent activity list */}
        {activitySectionOpen && (
          <div className="rounded-3xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            {recentResults.map((row, i) => (
              <div key={row.id} className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: i < recentResults.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: row.is_pb ? "#6EE7B7" : "rgba(255,255,255,0.15)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{row.event}</p>
                  <p className="text-xs text-white/40 truncate">{row.meet_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-white">{formatMs(row.time_ms)}</p>
                  <p className="text-[10px] text-white/35">{formatDate(row.swam_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming meets list */}
        {meetsSectionOpen && (
          <div className="rounded-3xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            {upcomingMeets.map((meet, i) => (
              <Link key={meet.id} href="/demo/meets" className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: i < upcomingMeets.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <span style={{ fontSize: 18 }}>{meetEmoji(meet.meetType)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{meet.name}</p>
                  <p className="text-xs text-white/40 truncate">{meet.location}</p>
                </div>
                <p className="text-xs text-white/35 flex-shrink-0">{formatDate(meet.startDate)}</p>
              </Link>
            ))}
          </div>
        )}

        {/* Quick link to brood */}
        <Link href="/demo/swimmers"
          className="flex items-center justify-between rounded-3xl p-4"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div>
            <p className="text-sm font-semibold text-white">Following {DEMO_SWIMMERS.length - 1} swimmers</p>
            <p className="text-xs text-white/40 mt-0.5">See everyone in {primary.name.split(" ")[0]}&apos;s year</p>
          </div>
          <span className="text-white/30"><ChevronIcon /></span>
        </Link>

        <div className="h-4" />
      </div>
    </div>
  );
}
