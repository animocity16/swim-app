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
  id: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  meetType: string | null;
  location: string | null;
};

// ─── Meet calendar ────────────────────────────────────────────────────────────

async function fetchUpcomingMeets(): Promise<Meet[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("upcoming_meets")
    .select("id, name, start_date, end_date, meet_type, location")
    .gte("start_date", todayStr)
    .order("start_date", { ascending: true })
    .limit(5);

  if (error || !data) return [];

  return (data as {
    id: string; name: string; start_date: string; end_date: string | null;
    meet_type: string | null; location: string | null;
  }[]).map((m) => ({
    id: m.id,
    name: m.name,
    startDate: new Date(m.start_date),
    endDate: m.end_date ? new Date(m.end_date) : null,
    meetType: m.meet_type,
    location: m.location,
  }));
}

function meetEmoji(meetType: string | null): string {
  switch (meetType) {
    case "SNAG": return "🌟";
    case "ETC": return "🎉";
    case "NSG": return "🏫";
    case "NSC": return "🏆";
    default: return "🏊";
  }
}

function isHappeningNow(meet: Meet): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(meet.startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(meet.endDate ?? meet.startDate); end.setHours(0, 0, 0, 0);
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

// ─── Skeleton components ───────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex items-center gap-4 rounded-3xl p-4 animate-pulse"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="h-14 w-14 flex-shrink-0 rounded-2xl bg-white/10" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 rounded-full bg-white/10" />
        <div className="h-3 w-1/3 rounded-full bg-white/5" />
        <div className="flex gap-3 mt-1">
          <div className="h-3 w-12 rounded-full bg-white/8" />
          <div className="h-3 w-12 rounded-full bg-white/8" />
        </div>
      </div>
    </div>
  );
}

function SkeletonActivity() {
  return (
    <div className="rounded-3xl overflow-hidden animate-pulse"
      style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
          <div className="w-1 h-8 rounded-full bg-white/10 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-1/2 rounded-full bg-white/10" />
            <div className="h-3 w-1/3 rounded-full bg-white/5" />
          </div>
          <div className="space-y-1 text-right">
            <div className="h-4 w-14 rounded-full bg-white/10" />
            <div className="h-2.5 w-8 rounded-full bg-white/5 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NatrixMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ opacity: 0.9, flexShrink: 0 }}>
      <circle cx="20" cy="20" r="19" fill="none" stroke="#D97706" strokeWidth="2" />
      <path
        d="M20 12 a8 8 0 1 1 -8 8 a5 5 0 1 1 5 5"
        fill="none"
        stroke="#D97706"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
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

// ─── Collapsed square tile (Recent activity / Upcoming meets) ─────────────────

function ChevronIcon({ dir = "right" }: { dir?: "right" | "left" }) {
  const d = dir === "right" ? "M6 3L11 8L6 13" : "M10 3L5 8L10 13";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SquareTile({
  emoji,
  label,
  bigValue,
  subline,
  tint,
  loading,
  disabled,
  onClick,
}: {
  emoji: string;
  label: string;
  bigValue: number;
  subline?: string | null;
  tint: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex aspect-square flex-col justify-between rounded-3xl p-4 text-left transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
      style={{ background: tint, border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 22 }}>{emoji}</span>
        {!disabled && (
          <span className="text-white/25 transition group-active:translate-x-0.5">
            <ChevronIcon />
          </span>
        )}
      </div>
      <div>
        {loading ? (
          <div className="h-7 w-10 rounded-full bg-white/10 animate-pulse mb-1" />
        ) : (
          <p className="text-2xl font-bold leading-none text-white">{bigValue}</p>
        )}
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-white/35">{label}</p>
        {subline && (
          <p className="mt-1 text-xs text-white/45 truncate">{subline}</p>
        )}
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  // Phase 1 — auth + swimmers (fast)
  const [phase1Done, setPhase1Done]       = useState(false);
  const [userName, setUserName]           = useState<string | null>(null);
  const [swimmerStats, setSwimmerStats]   = useState<SwimmerStat[]>([]);
  const [upcomingMeets, setUpcomingMeets] = useState<Meet[]>([]);

  // Phase 2 — times + standards (background)
  const [phase2Done, setPhase2Done]             = useState(false);
  const [recentResults, setRecentResults]       = useState<RecentResult[]>([]);
  const [standardsSummaries, setStandardsSummaries] = useState<StandardsSummary[]>([]);

  // Which square tile (if any) is expanded
  const [expandedSection, setExpandedSection] = useState<"activity" | "meets" | null>(null);

  useEffect(() => { void loadDashboard(); }, []);

  async function loadDashboard() {
    // ── Phase 1: session + swimmers in parallel ────────────────────────────────
    const sessionPromise = supabase.auth.getSession();
    const swimmersPromise = supabase
      .from("swimmers")
      .select("id, name, age, swim_club, group_type, gender")
      .eq("group_type", "primary")
      .order("name", { ascending: true });

    const { data: sessionData } = await sessionPromise;
    if (!sessionData.session) { router.replace("/login"); return; }

    const email = sessionData.session.user.email ?? "";
    const meta = sessionData.session.user.user_metadata;
    const displayName = meta?.full_name ?? meta?.name ?? email.split("@")[0].split(".")[0];
    setUserName(
      displayName.split(" ")[0].charAt(0).toUpperCase() +
      displayName.split(" ")[0].slice(1)
    );

    const userId = sessionData.session.user.id;
    const { data: swimmerData } = await swimmersPromise;
    const mySwimmers = (swimmerData as Swimmer[]) ?? [];

    if (mySwimmers.length === 0) { setPhase1Done(true); setPhase2Done(true); return; }

    void fetchUpcomingMeets().then(setUpcomingMeets);

    // Show skeleton swimmer cards immediately — phase 2 loads behind the scenes
    // We set placeholder stats so cards render right away
    const placeholderStats: SwimmerStat[] = mySwimmers.map((swimmer) => ({
      swimmer,
      totalEvents: 0,
      totalTimes: 0,
      latestEvent: null,
      latestTimeMs: null,
      latestSwamAt: null,
      latestIsPB: false,
    }));
    setSwimmerStats(placeholderStats);
    setPhase1Done(true);

    // ── Phase 2: times + standards in parallel (runs in background) ───────────
    const swimmerIds = mySwimmers.map((s) => s.id);

    const [timesResult, setsResult] = await Promise.all([
      supabase
        .from("swim_times")
        .select("id, swimmer_id, event, course, time_ms, swam_at, meet_name, place, created_at")
        .in("swimmer_id", swimmerIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("standard_sets")
        .select("id, name, user_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const allTimes = (timesResult.data ?? []) as (RecentResult & { created_at: string })[];
    const setsData = (setsResult.data ?? []) as { id: number; name: string; user_id: string }[];

    // Update swimmer cards with real stats now we have times
    const stats: SwimmerStat[] = mySwimmers.map((swimmer) => {
      const swimmerTimes = allTimes.filter((t) => t.swimmer_id === swimmer.id);
      const pbMap = new Map<string, number>();
      for (const t of [...swimmerTimes].sort((a, b) => a.time_ms - b.time_ms)) {
        const key = `${t.event}|${t.course}`;
        if (!pbMap.has(key)) pbMap.set(key, t.time_ms);
      }
      const latest = swimmerTimes[0] ?? null;
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

    // Recent activity
    const recent = allTimes.slice(0, 5).map((row) => {
      const swimmer = mySwimmers.find((s) => s.id === row.swimmer_id);
      return { ...row, swimmer_name: swimmer?.name ?? "Unknown" };
    });
    setRecentResults(recent);

    // Standards — 1 batched query
    if (setsData.length > 0 && allTimes.length > 0) {
      const setIds = setsData.map((s) => s.id);
      const { data: allItemsRaw } = await supabase
        .from("standard_items")
        .select("id, standard_set_id, event, course, qualifying_time_ms, gender, min_age, max_age")
        .in("standard_set_id", setIds);

      const allItems = (allItemsRaw ?? []) as {
        id: number; standard_set_id: number; event: string; course: string;
        qualifying_time_ms: number; gender?: string | null; min_age?: number | null; max_age?: number | null;
      }[];

      const summaries: StandardsSummary[] = [];
      for (const set of setsData) {
        const items = allItems.filter((item) => item.standard_set_id === set.id);
        if (!items.length) continue;
        const relevantSwimmer = mySwimmers[0];
        const swimmerTimes = allTimes.filter((t) => t.swimmer_id === relevantSwimmer.id);
        const pbMapForStd = new Map<string, number>();
        for (const t of swimmerTimes) {
          const key = `${t.event}|${t.course}`;
          const ex = pbMapForStd.get(key);
          if (!ex || t.time_ms < ex) pbMapForStd.set(key, t.time_ms);
        }
        let qualified = 0, inProgress = 0;
        for (const item of items) {
          const pb = pbMapForStd.get(`${item.event}|${item.course}`);
          if (!pb) continue;
          if (pb <= item.qualifying_time_ms) qualified++;
          else inProgress++;
        }
        summaries.push({
          swimmerId: relevantSwimmer.id,
          swimmerName: relevantSwimmer.name,
          qualified, inProgress,
          total: items.length,
          meetName: set.name,
        });
      }
      setStandardsSummaries(summaries);
    }

    setPhase2Done(true);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ─── Full page skeleton (only shown before session resolves) ─────────────────

  if (!phase1Done) {
    return (
      <div className="shell">
        <div className="container-app space-y-6">
          <div className="pt-2 animate-pulse">
            <div className="h-3 w-24 rounded-full bg-white/10 mb-2" />
            <div className="h-8 w-32 rounded-full bg-white/10" />
          </div>
          <div className="h-3 w-20 rounded-full bg-white/10" />
          <SkeletonCard />
          <div className="h-3 w-24 rounded-full bg-white/10 mt-2" />
          <SkeletonActivity />
        </div>
      </div>
    );
  }

  // ─── No swimmers ─────────────────────────────────────────────────────────────

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
              <p className="mt-1 text-sm text-white/50">Your swimmer&apos;s personal performance tracker.</p>
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

  // ─── Main dashboard ───────────────────────────────────────────────────────────

  return (
    <div className="shell">
      <div className="container-app space-y-6">

        {/* Header */}
        <div className="pt-2 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-white/30">{greeting}</p>
            <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-white">{userName ?? "Home"}</h1>
          </div>
          <NatrixMark />
        </div>

        {/* ── Lap calculator — quick access from Home ────────────────────────── */}
        <Link
          href="/calculator"
          className="flex items-center gap-4 rounded-3xl p-4 transition active:scale-[0.98]"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ background: "rgba(56,189,248,0.12)" }}>🧮</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Lap Calculator</p>
            <p className="text-xs text-white/40 mt-0.5">Work out splits and target times</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/20 flex-shrink-0">
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        {/* ── Swimmer cards — visible as soon as phase 1 done ───────────────── */}
        <div>
          <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/30">
            My Swimmers · {swimmerStats.length}
          </p>
          {swimmerStats.length === 1 && <SwimmerCard stat={swimmerStats[0]} index={0} />}
          {swimmerStats.length > 1 && (
            <div className="space-y-3">
              {swimmerStats.map((stat, i) => (
                <SwimmerCard key={stat.swimmer.id} stat={stat} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* ── Standards — skeleton until phase 2 done ───────────────────────── */}
        {!phase2Done ? (
          <div className="space-y-3">
            <div className="h-3 w-20 rounded-full bg-white/10 animate-pulse" />
            <div className="h-20 rounded-3xl bg-white/5 border border-white/8 animate-pulse" />
          </div>
        ) : standardsSummaries.length > 0 ? (
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
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Standards</p>
            <Link
              href={swimmerStats[0] ? `/swimmers/${swimmerStats[0].swimmer.id}?tab=standards` : "/standards"}
              className="flex items-center gap-4 rounded-3xl p-4 transition"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-2xl"
                style={{ background: "rgba(217,119,6,0.12)" }}>🎯</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">No standards set yet</p>
                <p className="text-xs text-white/40 mt-0.5">Add a standard set to track qualifying times</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/20 flex-shrink-0">
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        )}

        {/* ── Activity & Meets — collapsed squares, tap to expand ────────────── */}
        <div>
          {expandedSection === null ? (
            <div className="grid grid-cols-2 gap-3">
              <SquareTile
                emoji="⏱️"
                label="Recent activity"
                bigValue={recentResults.length}
                subline={
                  phase2Done && recentResults[0]
                    ? `${shortEvent(recentResults[0].event)} · ${formatMs(recentResults[0].time_ms)}`
                    : phase2Done
                      ? "No results yet"
                      : null
                }
                tint="linear-gradient(135deg, rgba(6,40,65,0.55) 0%, rgba(6,40,65,0.3) 100%)"
                loading={!phase2Done}
                onClick={() => setExpandedSection("activity")}
              />
              <SquareTile
                emoji={upcomingMeets[0] ? meetEmoji(upcomingMeets[0].meetType) : "🏊"}
                label="Upcoming meets"
                bigValue={upcomingMeets.length}
                subline={upcomingMeets[0]?.name ?? "None scheduled"}
                tint="linear-gradient(135deg, rgba(217,119,6,0.16) 0%, rgba(6,40,65,0.3) 100%)"
                disabled={upcomingMeets.length === 0}
                onClick={() => setExpandedSection("meets")}
              />
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setExpandedSection(null)}
                className="mb-3 flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-white/40 transition hover:text-white/60"
              >
                <ChevronIcon dir="left" />
                {expandedSection === "activity" ? "Recent activity" : "Upcoming meets"}
              </button>

              {/* ── Recent activity (expanded) ──────────────────────────────── */}
              {expandedSection === "activity" && (
                recentResults.length > 0 ? (
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
                ) : (
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
                )
              )}

              {/* ── Upcoming meets (expanded) ───────────────────────────────── */}
              {expandedSection === "meets" && (
                <div className="space-y-2">
                  {upcomingMeets.map((meet) => {
                    const now = isHappeningNow(meet);
                    return (
                      <Link key={meet.id} href={`/meets/upcoming/${meet.id}`}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3 transition active:scale-[0.98]"
                        style={{
                          background: now ? "rgba(110,231,183,0.08)" : "rgba(255,255,255,0.04)",
                          border: now ? "1px solid rgba(110,231,183,0.25)" : "1px solid rgba(255,255,255,0.08)",
                        }}>
                        <span style={{ fontSize: 20 }}>{meetEmoji(meet.meetType)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{meet.name}</p>
                          <p className="text-[10px] text-white/35 mt-0.5">
                            {formatMeetMonth(meet)}{meet.location ? ` · ${meet.location}` : ""}
                          </p>
                        </div>
                        {now && (
                          <span className="text-xs font-bold flex-shrink-0" style={{ color: "#6EE7B7" }}>Now!</span>
                        )}
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-white/20">
                          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

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

  // Use custom avatar colour CSS variable for primary swimmer (index 0)
  const avatarBg   = index === 0 ? "var(--natrix-avatar-colour, " + colors.bg + ")" : colors.bg;
  const avatarText = index === 0 ? "var(--natrix-avatar-text, " + colors.text + ")" : colors.text;

  return (
    <Link href={`/swimmers/${swimmer.id}`}
      className="flex items-center gap-4 rounded-3xl p-4 transition"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-base font-bold"
        style={{ background: avatarBg, color: avatarText }}>
        {getInitials(swimmer.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-white truncate">{swimmer.name}</p>
        <p className="text-xs text-white/40 mt-0.5">
          Age {swimmer.age}
          {swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
        </p>
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
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-white/20">
        <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}