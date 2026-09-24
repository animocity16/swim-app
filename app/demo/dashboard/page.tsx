"use client";

import Link from "next/link";
import { useMemo } from "react";
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

function strokeMeta(event: string) {
  const e = event.toLowerCase();
  if (e.includes("breast")) return { label: "Breaststroke", icon: "/icons/strokes/breast.png" };
  if (e.includes("back")) return { label: "Backstroke", icon: "/icons/strokes/back.png" };
  if (e.includes("fly") || e.includes("butterfly")) return { label: "Butterfly", icon: "/icons/strokes/fly.png" };
  if (e.includes("im") || e.includes("medley")) return { label: "IM", icon: "/icons/strokes/im.png" };
  return { label: "Freestyle", icon: "/icons/strokes/free.png" };
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QualifiedArc({ qualified, total }: { qualified: number; total: number }) {
  const pct = total > 0 ? qualified / total : 0;
  const R = 27;
  const C = 2 * Math.PI * R;
  const dash = pct * C;

  return (
    <svg width="66" height="66" viewBox="0 0 66 66">
      <circle cx="33" cy="33" r={R} fill="none" stroke="rgba(12,46,89,0.10)" strokeWidth="6" />
      <circle
        cx="33"
        cy="33"
        r={R}
        fill="none"
        stroke="#168AE8"
        strokeWidth="6"
        strokeDasharray={`${dash} ${C}`}
        strokeLinecap="round"
        transform="rotate(-90 33 33)"
      />
      <text x="33" y="31" textAnchor="middle" fill="#0C2E59" fontSize="14" fontWeight="800">
        {qualified}
      </text>
      <text x="33" y="42" textAnchor="middle" fill="#6B84A2" fontSize="8" fontWeight="600">
        of {total}
      </text>
    </svg>
  );
}

export default function DemoDashboardPage() {
  const primary = DEMO_SWIMMERS.find((s) => s.id === DEMO_PRIMARY_SWIMMER_ID)!;

  const myTimes = useMemo(
    () =>
      DEMO_TIMES.filter((t) => t.swimmer_id === primary.id).sort(
        (a, b) => new Date(b.swam_at).getTime() - new Date(a.swam_at).getTime()
      ),
    [primary.id]
  );

  const recentResults = myTimes.slice(0, 4);
  const latest = recentResults[0];
  const upcomingMeets = [...DEMO_MEETS]
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 3);

  const pbMap = new Map<string, number>();
  for (const row of [...myTimes].sort((a, b) => a.time_ms - b.time_ms)) {
    const key = `${row.event}|${row.course}`;
    if (!pbMap.has(key)) pbMap.set(key, row.time_ms);
  }

  const qualified = DEMO_STANDARDS.filter((s) => {
    const pb = pbMap.get(`${s.event}|${s.course}`);
    return pb != null && pb <= s.cutoffMs;
  }).length;

  const latestStroke = latest ? strokeMeta(latest.event) : strokeMeta("Free");

  return (
    <div className="shell">
      <div className="container-app space-y-6">

        {/* Brand header */}
        <div className="flex items-start justify-between pt-1">
          <div>
            <h1 className="text-3xl font-black tracking-[0.12em] text-white">NATRIX</h1>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">
              Track · Improve · Belong
            </p>
          </div>
          <img
            src="/natrix-mascot-search.png"
            alt="Natrix mascot"
            className="h-20 w-20 object-contain"
          />
        </div>

        {/* Hero */}
        <div
          className="overflow-hidden rounded-[32px] p-5"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.99), rgba(229,243,255,0.97))",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 24px 54px rgba(0,0,0,0.13)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 180,
              height: 180,
              borderRadius: "50%",
              right: -45,
              top: -55,
              background: "rgba(22,138,232,0.07)",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 135,
              height: 75,
              borderRadius: 60,
              right: 45,
              bottom: 62,
              transform: "rotate(-8deg)",
              background: "rgba(22,138,232,0.055)",
            }}
          />

          <div className="relative">
            <div className="flex items-center gap-4">
              <div
                className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full text-2xl font-black"
                style={{
                  background: "#1C9FA5",
                  color: "#fff",
                  boxShadow: "0 0 0 6px rgba(22,138,232,0.08)",
                }}
              >
                {getInitials(primary.name)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#168AE8" }}>
                  Primary swimmer
                </p>
                <h2 className="mt-1 truncate text-3xl font-bold" style={{ color: "#0C2E59" }}>
                  {primary.name}
                </h2>
                <p className="mt-1 text-sm" style={{ color: "#5F7896" }}>
                  Age {primary.age} · {primary.swim_club}
                </p>
                <p className="mt-1 text-xs" style={{ color: "#6B84A2" }}>
                  {pbMap.size} events · {myTimes.length} races tracked
                </p>
              </div>
            </div>

            <Link
              href={`/demo/swimmers/${primary.id}`}
              className="mt-5 flex items-center justify-between rounded-2xl px-5 py-4 text-base font-bold text-white"
              style={{
                background: "#168AE8",
                boxShadow: "0 12px 24px rgba(22,138,232,0.18)",
              }}
            >
              View full profile
              <ChevronIcon />
            </Link>
          </div>
        </div>

        {/* Latest result */}
        {latest && (
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/30">
                Latest result
              </p>
              <span className="text-[10px] text-white/30">{formatDate(latest.swam_at)}</span>
            </div>

            <Link
              href={`/demo/swimmers/${primary.id}`}
              className="block rounded-[28px] p-4"
              style={{
                background: "rgba(255,255,255,0.085)",
                border: "1px solid rgba(255,255,255,0.13)",
                boxShadow: "0 16px 34px rgba(0,0,0,0.08)",
              }}
            >
              <div className="flex items-center gap-3">
                <img
                  src={latestStroke.icon}
                  alt=""
                  className="h-12 w-12 flex-shrink-0 rounded-xl object-cover"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-white">{latest.event}</p>
                  <p className="mt-0.5 truncate text-xs text-white/40">
                    {latest.meet_name} · {latest.course}
                  </p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <p className="text-xl font-black text-white">{formatMs(latest.time_ms)}</p>
                  {latest.is_pb && (
                    <span
                      className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold"
                      style={{ background: "rgba(110,231,183,0.13)", color: "#6EE7B7" }}
                    >
                      PERSONAL BEST
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* Recent events */}
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/30">
              Recent events
            </p>
            <Link
              href={`/demo/swimmers/${primary.id}`}
              className="text-xs font-semibold"
              style={{ color: "#7DD3FC" }}
            >
              View all
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {recentResults.slice(0, 4).map((row) => {
              const meta = strokeMeta(row.event);
              return (
                <Link
                  key={row.id}
                  href={`/demo/swimmers/${primary.id}`}
                  className="rounded-[24px] p-4"
                  style={{
                    background: "rgba(255,255,255,0.075)",
                    border: "1px solid rgba(255,255,255,0.11)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <img src={meta.icon} alt="" className="h-10 w-10 rounded-xl object-cover" />
                    {row.is_pb && (
                      <span className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                        style={{ background: "rgba(110,231,183,0.12)", color: "#6EE7B7" }}>
                        PB
                      </span>
                    )}
                  </div>
                  <p className="mt-4 truncate text-sm font-bold text-white">{row.event}</p>
                  <p className="mt-1 text-lg font-black text-white">{formatMs(row.time_ms)}</p>
                  <p className="mt-1 truncate text-[10px] text-white/35">{row.course}</p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Standards */}
        <div
          className="rounded-[30px] p-5"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(234,244,255,0.97))",
            border: "1px solid rgba(255,255,255,0.82)",
            boxShadow: "0 18px 42px rgba(0,0,0,0.10)",
          }}
        >
          <div className="flex items-center gap-4">
            <QualifiedArc qualified={qualified} total={DEMO_STANDARDS.length} />

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#168AE8" }}>
                Standards
              </p>
              <p className="mt-1 text-lg font-bold" style={{ color: "#0C2E59" }}>
                Squad upgrade progress
              </p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "#6B84A2" }}>
                {primary.name.split(" ")[0]} has qualified in {qualified} of {DEMO_STANDARDS.length} target events.
              </p>
            </div>
          </div>

          <Link
            href={`/demo/swimmers/${primary.id}?tab=standards`}
            className="mt-4 flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold"
            style={{
              background: "rgba(22,138,232,0.08)",
              color: "#168AE8",
              border: "1px solid rgba(22,138,232,0.12)",
            }}
          >
            View standards
            <ChevronIcon />
          </Link>
        </div>

        {/* Upcoming meets */}
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/30">
              Upcoming meets
            </p>
            <Link href="/demo/meets" className="text-xs font-semibold" style={{ color: "#7DD3FC" }}>
              View all
            </Link>
          </div>

          <div className="space-y-2.5">
            {upcomingMeets.map((meet) => (
              <Link
                key={meet.id}
                href="/demo/meets"
                className="flex items-center gap-3 rounded-[24px] px-4 py-3.5"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-lg"
                  style={{
                    background: "rgba(22,138,232,0.12)",
                    border: "1px solid rgba(125,211,252,0.12)",
                  }}
                >
                  🏊
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{meet.name}</p>
                  <p className="mt-0.5 truncate text-xs text-white/38">{meet.location}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-white/55">{formatDate(meet.startDate)}</p>
                  <p className="mt-0.5 text-[10px] text-white/28">{meet.meetType}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick tools */}
        <div>
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/30">
            Quick tools
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/demo/scan"
              className="rounded-[24px] p-4"
              style={{
                background: "rgba(255,255,255,0.075)",
                border: "1px solid rgba(255,255,255,0.11)",
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                style={{ background: "rgba(22,138,232,0.13)" }}
              >
                +
              </div>
              <p className="mt-4 text-sm font-bold text-white">Add results</p>
              <p className="mt-1 text-xs text-white/38">Scan a meet screenshot</p>
            </Link>

            <Link
              href="/demo/compare"
              className="rounded-[24px] p-4"
              style={{
                background: "rgba(255,255,255,0.075)",
                border: "1px solid rgba(255,255,255,0.11)",
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                style={{ background: "rgba(110,231,183,0.10)" }}
              >
                ⇄
              </div>
              <p className="mt-4 text-sm font-bold text-white">Compare swimmers</p>
              <p className="mt-1 text-xs text-white/38">See progress side by side</p>
            </Link>
          </div>
        </div>

        {/* Following */}
        <Link
          href="/demo/swimmers"
          className="flex items-center justify-between rounded-[26px] p-4"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div>
            <p className="text-sm font-bold text-white">Following {DEMO_SWIMMERS.length - 1} swimmers</p>
            <p className="mt-1 text-xs text-white/38">
              Explore the rest of {primary.name.split(" ")[0]}&apos;s swim group
            </p>
          </div>
          <span className="text-white/28"><ChevronIcon /></span>
        </Link>

        <div className="h-4" />
      </div>
    </div>
  );
}
