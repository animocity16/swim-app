"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type Swimmer = {
  id: number;
  name: string;
  age: number;
  swim_club?: string | null;
  group_type?: string | null;
  gender?: string | null;
};

type SwimmerStat = {
  swimmer: Swimmer;
  totalEvents: number;
  totalTimes: number;
  latestEvent: string | null;
  latestTimeMs: number | null;
  latestSwamAt: string | null;
  latestIsPB: boolean;
};

type RecentResult = {
  id: number;
  swimmer_id: number;
  event: string;
  course: string;
  time_ms: number;
  swam_at?: string | null;
  meet_name?: string | null;
  place?: number | null;
  swimmer_name: string;
  is_pb?: boolean;
};

type StandardsSummary = {
  swimmerId: number;
  swimmerName: string;
  qualified: number;
  inProgress: number;
  total: number;
  meetName: string;
};

type Meet = {
  name: string;
  startDate: Date;
  endDate: Date;
  minAge?: number;
  maxAge?: number;
  emoji: string;
};

// ─── Meet calendar ────────────────────────────────────────────────────────────

const SG_MEETS_2026: Meet[] = [
  { name: "NSG 2026", startDate: new Date("2026-04-15"), endDate: new Date("2026-04-25"), emoji: "🏫" },
  { name: "12th Singapore National Championships", startDate: new Date("2026-05-01"), endDate: new Date("2026-05-31"), emoji: "🥇" },
  { name: "ETC 2026", startDate: new Date("2026-05-31"), endDate: new Date("2026-05-31"), minAge: 10, maxAge: 12, emoji: "🌟" },
  { name: "21st SNSC 2026", startDate: new Date("2026-06-12"), endDate: new Date("2026-06-14"), minAge: 13, emoji: "🏆" },
  { name: "Pesta Sukan 2026", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-31"), emoji: "🎉" },
  { name: "39th JIC 2026", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30"), maxAge: 12, emoji: "🏊" },
];

function getUpcomingMeets(ages: number[]): Meet[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const seen = new Set<string>();
  const result: Meet[] = [];

  for (const meet of SG_MEETS_2026) {
    if (meet.endDate < today) continue;
    // Include meet if ANY swimmer's age qualifies
    const eligible =
      ages.length === 0 ||
      ages.some((age) => {
        if (meet.minAge != null && age < meet.minAge) return false;
        if (meet.maxAge != null && age > meet.maxAge) return false;
        return true;
      });
    if (!eligible) continue;
    if (!seen.has(meet.name)) {
      seen.add(meet.name);
      result.push(meet);
    }
  }
  return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()).slice(0, 5);
}

function isHappeningNow(meet: Meet): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(meet.startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(meet.endDate); end.setHours(0, 0, 0, 0);
  return today >= start && today <= end;
}

function formatMeetMonth(meet: Meet): string {
  return meet.startDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2);
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function shortEvent(event: string) {
  return event
    .replace("Freestyle", "Free").replace("Backstroke", "Back")
    .replace("Breaststroke", "Breast").replace("Butterfly", "Fly");
}

function getStrokeColor(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breast")) return "#34D399";
  if (e.includes("back")) return "#A78BFA";
  if (e.includes("fly") || e.includes("butterfly")) return "#FB923C";
  if (e.includes("free")) return "#38BDF8";
  if (e.includes("im")) return "#F472B6";
  return "#FDE68A";
}

const AVATAR_COLORS = [
  { bg: "#0F6E56", text: "#9FE1CB" },
  { bg: "#185FA5", text: "#B5D4F4" },
  { bg: "#854F0B", text: "#FAC775" },
  { bg: "#72243E", text: "#F4C0D1" },
  { bg: "#3C3489", text: "#CECBF6" },
];
function avatarColor(i: number) { return AVATAR_COLORS[i % AVATAR_COLORS.length]; }

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [swimmerStats, setSwimmerStats] = useState<SwimmerStat[]>([]);
  const [recentResults, setRecentResults] = useState<RecentResult[]>([]);
  const [standardsSummaries, setStandardsSummaries] = useState<StandardsSummary[]>([]);
  const [upcomingMeets, setUpcomingMeets] = useState<Meet[]>([]);

  useEffect(() => { void loadDashboard(); }, []);

  async function loadDashboard() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { router.replace("/login"); return; }

    // Greeting name
    const email = sessionData.session.user.email ?? "";
    const meta = sessionData.session.user.user_metadata;
    const displayName = meta?.full_name ?? meta?.name ?? email.split("@")[0].split(".")[0];
    setUserName(
      displayName.split(" ")[0].charAt(0).toUpperCase() +
      displayName.split(" ")[0].slice(1)
    );

    // Load ALL primary swimmers
    const { data: swimmerData } = await supabase
      .from("swimmers")
      .select("id, name, age, swim_club, group_type, gender")
      .eq("group_type", "primary")
      .order("name", { ascending: true });

    const mySwimmers = (swimmerData as Swimmer[]) ?? [];
    if (mySwimmers.length === 0) { setLoading(false); return; }

    const swimmerIds = mySwimmers.map((s) => s.id);

    // Set upcoming meets for all swimmer ages combined
    setUpcomingMeets(getUpcomingMeets(mySwimmers.map((s) => s.age)));

    // Load ALL times across all primary swimmers in one query
    const { data: allTimesRaw } = await supabase
      .from("swim_times")
      .select("id, swimmer_id, event, course, time_ms, swam_at, meet_name, place, created_at")
      .in("swimmer_id", swimmerIds)
      .order("created_at", { ascending: false });

    const allTimes = (allTimesRaw ?? []) as (RecentResult & { created_at: string })[];

    // ── Build per-swimmer stats ────────────────────────────────────────────────
    const stats: SwimmerStat[] = mySwimmers.map((swimmer) => {
      const swimmerTimes = allTimes.filter((t) => t.swimmer_id === swimmer.id);

      // PB map: best time per event+course
      const pbMap = new Map<string, number>();
      for (const t of [...swimmerTimes].sort((a, b) => a.time_ms - b.time_ms)) {
        const key = `${t.event}|${t.course}`;
        if (!pbMap.has(key)) pbMap.set(key, t.time_ms);
      }

      // Latest result (already sorted by created_at desc)
      const latest = swimmerTimes[0] ?? null;

      // Is latest a PB?
      let latestIsPB = false;
      if (latest) {
        const key = `${latest.event}|${latest.course}`;
        latestIsPB = pbMap.get(key) === latest.time_ms && swimmerTimes.filter(
          (t) => t.event === latest.event && t.course === latest.course
        ).length >= 1;
      }

      return {
        swimmer,
        totalEvents: pbMap.size,
        totalTimes: swimmerTimes.length,
        latestEvent: latest?.event ?? null,
        latestTimeMs: latest?.time_ms ?? null,
        latestSwamAt: latest?.swam_at ?? null,
        latestIsPB,
      };
    });

    setSwimmerStats(stats);

    // ── Recent results across all swimmers (last 5) ───────────────────────────
    const recent = allTimes.slice(0, 5).map((row) => {
      const swimmer = mySwimmers.find((s) => s.id === row.swimmer_id);
      return { ...row, swimmer_name: swimmer?.name ?? "Unknown" };
    });
    setRecentResults(recent);

    // ── Standards summaries (one per swimmer that has a standard set) ─────────
    const { data: setsData } = await supabase
      .from("standard_sets")
      .select("id, name, user_id")
      .eq("user_id", sessionData.session.user.id)
      .order("created_at", { ascending: false })
      .limit(3);

    if (setsData && setsData.length > 0 && allTimes.length > 0) {
      const summaries: StandardsSummary[] = [];

      for (const set of setsData) {
        const { data: items } = await supabase
          .from("standard_items")
          .select("event, course, qualifying_time_ms, gender, min_age, max_age")
          .eq("standard_set_id", set.id);

        if (!items || items.length === 0) continue;

        // Match the set to the most relevant swimmer
        const relevantSwimmer = mySwimmers[0]; // default to first
        const swimmerTimes = allTimes.filter((t) => t.swimmer_id === relevantSwimmer.id);

        const pbMapForStd = new Map<string, number>();
        for (const t of swimmerTimes) {
          const key = `${t.event}|${t.course}`;
          const ex = pbMapForStd.get(key);
          if (!ex || t.time_ms < ex) pbMapForStd.set(key, t.time_ms);
        }

        let qualified = 0, inProgress = 0;
        for (const item of items as { event: string; course: string; qualifying_time_ms: number }[]) {
          const pb = pbMapForStd.get(`${item.event}|${item.course}`);
          if (!pb) continue;
          if (pb <= item.qualifying_time_ms) qualified++;
          else inProgress++;
        }

        summaries.push({
          swimmerId: relevantSwimmer.id,
          swimmerName: relevantSwimmer.name,
          qualified,
          inProgress,
          total: items.length,
          meetName: set.name,
        });
      }

      setStandardsSummaries(summaries);
    }

    setLoading(false);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app flex items-center justify-center" style={{ minHeight: "60vh" }}>
          <div className="text-center space-y-3">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
            <p className="text-sm text-white/40">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── No swimmers ────────────────────────────────────────────────────────────

  if (swimmerStats.length === 0) {
    return (
      <div className="shell">
        <div className="container-app space-y-6">
          <div className="pt-2">
            <p className="text-xs font-medium uppercase tracking-widest text-white/30">{greeting}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">{userName ?? "Welcome"}</h1>
          </div>
          <div className="rounded-3xl p-6 space-y-5"
            style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(253,230,138,0.25)" }}>
            <div className="text-center">
              <div className="text-5xl mb-3">🏊</div>
              <p className="text-xl font-bold text-white">Welcome to Natrix</p>
              <p className="mt-1 text-sm text-white/50">Your swimmer's personal performance tracker.</p>
            </div>
            {[
              { n: "1", t: "Add your swimmer", d: "Name, age, gender and club", href: "/swimmers" },
              { n: "2", t: "Import existing times", d: "Download template, fill in, upload", href: "/scan" },
              { n: "3", t: "Scan a result", d: "Screenshot Meet Mobile after a race", href: "/scan" },
            ].map((item) => (
              <Link key={item.n} href={item.href}
                className="flex items-center gap-4 rounded-2xl p-4 transition"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: "#D97706" }}>{item.n}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{item.t}</p>
                  <p className="text-xs text-white/40 mt-0.5">{item.d}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/25 flex-shrink-0">
                  <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}
          </div>
          <div className="h-6" />
        </div>
      </div>
    );
  }

  // ─── Main dashboard ─────────────────────────────────────────────────────────

  return (
    <div className="shell">
      <div className="container-app space-y-6">

        {/* Header */}
        <div className="pt-2">
          <p className="text-xs font-medium uppercase tracking-widest text-white/30">{greeting}</p>
          <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-white">{userName ?? "Home"}</h1>
        </div>

        {/* ── Swimmer cards ──────────────────────────────────────────────────── */}
        <div>
          <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/30">
            My Swimmers · {swimmerStats.length}
          </p>

          {/* Single swimmer — full width card */}
          {swimmerStats.length === 1 && (
            <SwimmerCard stat={swimmerStats[0]} index={0} />
          )}

          {/* Multiple swimmers — stacked cards */}
          {swimmerStats.length > 1 && (
            <div className="space-y-3">
              {swimmerStats.map((stat, i) => (
                <SwimmerCard key={stat.swimmer.id} stat={stat} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* ── Standards summaries ────────────────────────────────────────────── */}
        {standardsSummaries.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Standards</p>
            {standardsSummaries.map((summary) => (
              <Link key={summary.meetName}
                href={`/swimmers/${summary.swimmerId}?tab=standards`}
                className="flex items-center gap-4 rounded-3xl p-4 transition"
                style={{
                  background: summary.qualified === summary.total && summary.total > 0
                    ? "linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(6,40,65,0.4) 100%)"
                    : "linear-gradient(135deg, rgba(6,40,65,0.5) 0%, rgba(6,40,65,0.3) 100%)",
                  border: summary.qualified === summary.total && summary.total > 0
                    ? "1px solid rgba(110,231,183,0.3)"
                    : "1px solid rgba(255,255,255,0.08)",
                }}>
                <div className="flex-shrink-0">
                  <QualifiedArc qualified={summary.qualified} total={summary.total} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-white/35 mb-1 truncate">
                    {summary.meetName}
                  </p>
                  {summary.qualified === summary.total && summary.total > 0 ? (
                    <p className="text-base font-bold" style={{ color: "#6EE7B7" }}>All standards met! 🎉</p>
                  ) : summary.qualified > 0 ? (
                    <p className="text-base font-bold text-white">{summary.qualified} qualified</p>
                  ) : (
                    <p className="text-base font-bold text-white">{summary.inProgress} in progress</p>
                  )}
                  <p className="text-xs text-white/40 mt-0.5">{summary.swimmerName}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/20 flex-shrink-0">
                  <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}
          </div>
        )}

        {/* ── Recent activity ────────────────────────────────────────────────── */}
        {recentResults.length > 0 && (
          <div>
            <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/30">Recent activity</p>
            <div className="rounded-3xl overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
              {recentResults.map((result, i) => {
                const strokeColor = getStrokeColor(result.event);
                return (
                  <Link key={result.id} href={`/swimmers/${result.swimmer_id}`}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/5"
                    style={{ borderBottom: i < recentResults.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: strokeColor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{shortEvent(result.event)}</p>
                      <p className="text-xs text-white/35 mt-0.5">
                        {result.swimmer_name.split(" ")[0]}
                        {result.swam_at ? ` · ${formatDate(result.swam_at)}` : ""}
                        {result.meet_name ? ` · ${result.meet_name}` : ""}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold text-white">{formatMs(result.time_ms)}</p>
                      <p className="text-[10px] text-white/30">{result.course}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── No results yet ─────────────────────────────────────────────────── */}
        {recentResults.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div className="text-center">
              <p className="text-base font-semibold text-white">No results yet</p>
              <p className="mt-1 text-sm text-white/40">Import existing times or scan a Meet Mobile result.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/scan"
                className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white/70 transition"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                Import
              </Link>
              <Link href="/scan"
                className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition"
                style={{ background: "#D97706" }}>
                Scan result
              </Link>
            </div>
          </div>
        )}

        {/* ── Upcoming meets ─────────────────────────────────────────────────── */}
        {upcomingMeets.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/30">Upcoming meets</p>
            <div className="space-y-2">
              {upcomingMeets.map((meet) => {
                const now = isHappeningNow(meet);
                return (
                  <div key={meet.name}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={{
                      background: now ? "rgba(110,231,183,0.08)" : "rgba(255,255,255,0.04)",
                      border: now ? "1px solid rgba(110,231,183,0.25)" : "1px solid rgba(255,255,255,0.08)",
                    }}>
                    <span style={{ fontSize: 20 }}>{meet.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{meet.name}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">{formatMeetMonth(meet)}</p>
                    </div>
                    {now && (
                      <span className="text-xs font-bold flex-shrink-0" style={{ color: "#6EE7B7" }}>
                        Now!
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-white/25 text-center mt-2">
              Dates indicative · Source: Singapore Aquatics
            </p>
          </div>
        )}

        <div className="h-6" />
      </div>
    </div>
  );
}

// ─── Swimmer card component ───────────────────────────────────────────────────

function SwimmerCard({ stat, index }: { stat: SwimmerStat; index: number }) {
  const { swimmer, totalEvents, totalTimes, latestEvent, latestTimeMs, latestSwamAt, latestIsPB } = stat;
  const colors = avatarColor(index);
  const strokeColor = latestEvent ? getStrokeColor(latestEvent) : "#FDE68A";

  return (
    <Link href={`/swimmers/${swimmer.id}`}
      className="flex items-center gap-4 rounded-3xl p-4 transition"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>

      {/* Avatar */}
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-base font-bold"
        style={{ background: colors.bg, color: colors.text }}>
        {getInitials(swimmer.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-white truncate">{swimmer.name}</p>
        <p className="text-xs text-white/40 mt-0.5">
          Age {swimmer.age}
          {swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold" style={{ color: "#FDE68A" }}>{totalEvents}</span>
            <span className="text-[10px] text-white/30 uppercase tracking-wider">events</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-white/60">{totalTimes}</span>
            <span className="text-[10px] text-white/30 uppercase tracking-wider">results</span>
          </div>
        </div>

        {/* Latest result */}
        {latestEvent && latestTimeMs != null && (
          <div className="flex items-center gap-2 mt-2">
            <div className="w-1 h-3.5 rounded-full flex-shrink-0" style={{ background: strokeColor }} />
            <p className="text-xs text-white/50 truncate">
              <span className="font-semibold text-white/80">{shortEvent(latestEvent)}</span>
              {" · "}
              <span style={{ color: strokeColor }}>{formatMs(latestTimeMs)}</span>
              {latestIsPB && <span className="ml-1 text-[9px] font-bold" style={{ color: "#FDE68A" }}>PB</span>}
              {latestSwamAt ? ` · ${formatDate(latestSwamAt)}` : ""}
            </p>
          </div>
        )}
      </div>

      {/* Chevron */}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-white/20">
        <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}