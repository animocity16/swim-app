"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Swimmer = {
  id: number;
  name: string;
  age: number;
  swim_club?: string | null;
  group_type?: string | null;
  gender?: string | null;
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

// ─── Singapore 2026 Meet Calendar ─────────────────────────────────────────────

const SG_MEETS_2026: Meet[] = [
  { name: "NSG 2026", startDate: new Date("2026-04-15"), endDate: new Date("2026-04-25"), emoji: "🏫" },
  { name: "12th Singapore National Championships", startDate: new Date("2026-05-01"), endDate: new Date("2026-05-31"), emoji: "🥇" },
  { name: "ETC 2026", startDate: new Date("2026-05-31"), endDate: new Date("2026-05-31"), minAge: 10, maxAge: 12, emoji: "🌟" },
  { name: "21st SNSC 2026", startDate: new Date("2026-06-12"), endDate: new Date("2026-06-14"), minAge: 13, emoji: "🏆" },
  { name: "Pesta Sukan 2026", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-31"), emoji: "🎉" },
  { name: "39th JIC 2026", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30"), maxAge: 12, emoji: "🏊" },
];

function getUpcomingMeets(swimmerAge?: number | null): Meet[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return SG_MEETS_2026
    .filter((meet) => {
      if (meet.endDate < today) return false;
      if (swimmerAge != null) {
        if (meet.minAge != null && swimmerAge < meet.minAge) return false;
        if (meet.maxAge != null && swimmerAge > meet.maxAge) return false;
      }
      return true;
    })
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .slice(0, 5);
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

const AVATAR_COLORS = [
  { bg: "#0F6E56", text: "#9FE1CB" },
  { bg: "#185FA5", text: "#B5D4F4" },
  { bg: "#854F0B", text: "#FAC775" },
  { bg: "#72243E", text: "#F4C0D1" },
  { bg: "#3C3489", text: "#CECBF6" },
];

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
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

function shortEvent(event: string) {
  return event
    .replace("Freestyle", "Free").replace("Backstroke", "Back")
    .replace("Breaststroke", "Breast").replace("Butterfly", "Fly");
}

function Sparkline({ times, color = "#FDE68A" }: { times: number[]; color?: string }) {
  if (times.length < 2) return null;
  const W = 300, H = 48, pad = 4;
  const min = Math.min(...times), max = Math.max(...times);
  const range = max - min || 1000;
  const pts = times.map((t, i) => ({
    x: pad + (i / (times.length - 1)) * (W - pad * 2),
    y: H - pad - ((max - t) / range) * (H - pad * 2),
  }));
  const pathD = pts.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const cpx = (prev.x + p.x) / 2;
    return `${d} C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`;
  }, "");
  const fillD = `${pathD} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="sf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#sf)" />
      <path d={pathD} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y}
          r={i === pts.length - 1 ? 4.5 : 2.5}
          fill={i === pts.length - 1 ? color : `${color}60`} />
      ))}
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y}
        r={9} fill="none" stroke={color} strokeWidth="1.2" opacity="0.25" />
    </svg>
  );
}

function QualifiedArc({ qualified, total }: { qualified: number; total: number }) {
  const pct = total > 0 ? qualified / total : 0;
  const R = 36, cx = 44, cy = 44;
  const circumference = 2 * Math.PI * R;
  const dash = pct * circumference;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#6EE7B7" strokeWidth="7"
        strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#6EE7B7" fontSize="18" fontWeight="700">{qualified}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontWeight="500" letterSpacing="1">of {total}</text>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [latestResult, setLatestResult] = useState<RecentResult | null>(null);
  const [recentPBs, setRecentPBs] = useState<RecentResult[]>([]);
  const [sparklineTimes, setSparklineTimes] = useState<number[]>([]);
  const [standardsSummary, setStandardsSummary] = useState<StandardsSummary | null>(null);
  const [totalTimes, setTotalTimes] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);

  useEffect(() => { void loadDashboard(); }, []);

  async function loadDashboard() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { router.replace("/login"); return; }

    const email = sessionData.session.user.email ?? "";
    const meta = sessionData.session.user.user_metadata;
    const displayName = meta?.full_name ?? meta?.name ?? email.split("@")[0].split(".")[0];
    setUserName(displayName.split(" ")[0].charAt(0).toUpperCase() + displayName.split(" ")[0].slice(1));

    const { data: swimmerData } = await supabase
      .from("swimmers")
      .select("id, name, age, swim_club, group_type, gender")
      .eq("group_type", "primary")
      .order("name", { ascending: true });

    const mySwimmers = (swimmerData as Swimmer[]) || [];
    setSwimmers(mySwimmers);
    if (mySwimmers.length === 0) { setLoading(false); return; }

    const swimmerIds = mySwimmers.map((s) => s.id);

    const { data: recentData } = await supabase
      .from("swim_times")
      .select("id, swimmer_id, event, course, time_ms, swam_at, meet_name, place")
      .in("swimmer_id", swimmerIds)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentData && recentData.length > 0) {
      const row = recentData[0];
      const swimmer = mySwimmers.find((s) => s.id === row.swimmer_id);
      const { data: betterTimes } = await supabase
        .from("swim_times").select("id")
        .eq("swimmer_id", row.swimmer_id).eq("event", row.event)
        .eq("course", row.course).lt("time_ms", row.time_ms).limit(1);
      setLatestResult({ ...row, swimmer_name: swimmer?.name ?? "Unknown", is_pb: !betterTimes || betterTimes.length === 0 });

      const { data: sparkData } = await supabase
        .from("swim_times").select("time_ms")
        .eq("swimmer_id", row.swimmer_id).eq("event", row.event)
        .eq("course", row.course).order("swam_at", { ascending: true }).limit(8);
      if (sparkData && sparkData.length >= 2) {
        setSparklineTimes((sparkData as { time_ms: number }[]).map((r) => r.time_ms));
      }
    }

    const { data: allTimes } = await supabase
      .from("swim_times")
      .select("id, swimmer_id, event, course, time_ms, swam_at, meet_name")
      .in("swimmer_id", swimmerIds)
      .order("time_ms", { ascending: true });

    if (allTimes && allTimes.length > 0) {
      setTotalTimes(allTimes.length);
      const pbMap = new Map<string, RecentResult>();
      for (const row of allTimes as RecentResult[]) {
        const swimmer = mySwimmers.find((s) => s.id === row.swimmer_id);
        const key = `${row.swimmer_id}|${row.event}|${row.course}`;
        if (!pbMap.has(key)) pbMap.set(key, { ...row, swimmer_name: swimmer?.name ?? "Unknown" });
      }
      setTotalEvents(pbMap.size);
      const pbs = Array.from(pbMap.values())
        .filter((r) => r.swam_at)
        .sort((a, b) => new Date(b.swam_at!).getTime() - new Date(a.swam_at!).getTime())
        .slice(0, 4);
      setRecentPBs(pbs);

      const { data: setsData } = await supabase
        .from("standard_sets").select("id, name")
        .eq("user_id", sessionData.session.user.id)
        .order("created_at", { ascending: false }).limit(1);

      if (setsData && setsData.length > 0) {
        const { data: items } = await supabase
          .from("standard_items").select("id, event, course, qualifying_time_ms")
          .eq("standard_set_id", setsData[0].id);
        if (items && items.length > 0) {
          const pbMapForStd = new Map<string, number>();
          for (const row of allTimes as { event: string; course: string; time_ms: number }[]) {
            const key = `${row.event}|${row.course}`;
            const ex = pbMapForStd.get(key);
            if (!ex || row.time_ms < ex) pbMapForStd.set(key, row.time_ms);
          }
          let qualified = 0, inProgress = 0;
          for (const item of items as { event: string; course: string; qualifying_time_ms: number }[]) {
            const pb = pbMapForStd.get(`${item.event}|${item.course}`);
            if (!pb) continue;
            if (pb <= item.qualifying_time_ms) qualified++;
            else inProgress++;
          }
          setStandardsSummary({ qualified, inProgress, total: items.length, meetName: setsData[0].name });
        }
      }
    }

    setLoading(false);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const sparkFirst = sparklineTimes[0];
  const sparkLast = sparklineTimes[sparklineTimes.length - 1];
  const deltaMs = sparkFirst && sparkLast ? sparkFirst - sparkLast : null;
  const isImproving = deltaMs !== null && deltaMs > 0;
  const primarySwimmer = swimmers[0] ?? null;
  const upcomingMeets = getUpcomingMeets(primarySwimmer?.age);
  const swimmerColors = avatarColor(0);

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

  if (swimmers.length === 0) {
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
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-white/30">{greeting}</p>
            <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-white">{userName ?? "Welcome"}</h1>
          </div>
          <p className="text-xs text-white/25 pt-1.5">
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </p>
        </div>

        {/* Swimmer hero card */}
        <Link href={`/swimmers/${primarySwimmer.id}`}
          className="block rounded-3xl p-5 overflow-hidden transition"
          style={{ background: "linear-gradient(135deg, rgba(15,110,86,0.35) 0%, rgba(6,40,65,0.6) 100%)", border: "1px solid rgba(159,225,203,0.2)" }}>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-xl font-bold"
              style={{ background: swimmerColors.bg, color: swimmerColors.text }}>
              {getInitials(primarySwimmer.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-white truncate">{primarySwimmer.name}</p>
              <p className="text-sm text-white/50 mt-0.5">
                Age {primarySwimmer.age}
                {primarySwimmer.gender ? ` · ${primarySwimmer.gender}` : ""}
                {primarySwimmer.swim_club ? ` · ${primarySwimmer.swim_club}` : ""}
              </p>
              <div className="flex gap-3 mt-2">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold" style={{ color: "#FDE68A" }}>{totalEvents}</span>
                  <span className="text-[10px] text-white/35 uppercase tracking-wider">events</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-white/70">{totalTimes}</span>
                  <span className="text-[10px] text-white/35 uppercase tracking-wider">results</span>
                </div>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-white/20">
              <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {swimmers.length > 1 && (
            <div className="mt-4 pt-4 border-t border-white/10 flex gap-2 flex-wrap">
              {swimmers.slice(1).map((s, i) => {
                const c = avatarColor(i + 1);
                return (
                  <Link key={s.id} href={`/swimmers/${s.id}`} onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 transition"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                      style={{ background: c.bg, color: c.text }}>{getInitials(s.name)}</div>
                    <span className="text-xs font-medium text-white/70">{s.name.split(" ")[0]}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Link>

        {/* ── Upcoming Meets ─────────────────────────────────────────────── */}
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
                        Happening now!
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-white/25 text-center mt-2">
              Dates indicative only · Source: Singapore Aquatics
            </p>
          </div>
        )}

        {/* Standards arc */}
        {standardsSummary && standardsSummary.total > 0 && (
          <Link href={`/swimmers/${primarySwimmer.id}?tab=standards`}
            className="block rounded-3xl p-5 transition"
            style={{
              background: standardsSummary.qualified === standardsSummary.total
                ? "linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(6,40,65,0.5) 100%)"
                : "linear-gradient(135deg, rgba(6,40,65,0.6) 0%, rgba(6,40,65,0.4) 100%)",
              border: standardsSummary.qualified === standardsSummary.total
                ? "1px solid rgba(110,231,183,0.35)"
                : "1px solid rgba(255,255,255,0.1)"
            }}>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <QualifiedArc qualified={standardsSummary.qualified} total={standardsSummary.total} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-widest text-white/35 mb-1">
                  {standardsSummary.meetName}
                </p>
                {standardsSummary.qualified === standardsSummary.total ? (
                  <>
                    <p className="text-lg font-bold" style={{ color: "#6EE7B7" }}>All standards met! 🎉</p>
                    <p className="text-xs text-white/45 mt-0.5">Every qualifying time achieved</p>
                  </>
                ) : standardsSummary.qualified > 0 ? (
                  <>
                    <p className="text-lg font-bold text-white">{standardsSummary.qualified} qualified</p>
                    <p className="text-xs text-white/45 mt-0.5">
                      {standardsSummary.inProgress} in progress · {standardsSummary.total - standardsSummary.qualified - standardsSummary.inProgress} no PB yet
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-white">Standards tracking</p>
                    <p className="text-xs text-white/45 mt-0.5">{standardsSummary.inProgress} events in progress</p>
                  </>
                )}
              </div>
            </div>
          </Link>
        )}

        {/* Latest result hero */}
        {latestResult && (() => {
          const strokeColor = getStrokeColor(latestResult.event);
          return (
            <Link href={`/swimmers/${latestResult.swimmer_id}`}
              className="block rounded-3xl overflow-hidden transition"
              style={{ border: `1px solid ${strokeColor}30`, background: `linear-gradient(135deg, ${strokeColor}12 0%, rgba(6,40,65,0.5) 100%)` }}>
              <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${strokeColor}, transparent)` }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                        style={{ background: `${strokeColor}20`, color: strokeColor, border: `1px solid ${strokeColor}40` }}>
                        {latestResult.course}
                      </span>
                      {latestResult.is_pb && (
                        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(253,230,138,0.15)", color: "#FDE68A", border: "1px solid rgba(253,230,138,0.3)" }}>
                          🏅 PB
                        </span>
                      )}
                    </div>
                    <p className="text-lg font-bold text-white">{shortEvent(latestResult.event)}</p>
                    <p className="text-xs text-white/35 mt-0.5">
                      {latestResult.meet_name ?? ""}
                      {latestResult.swam_at ? ` · ${formatDate(latestResult.swam_at)}` : ""}
                    </p>
                  </div>
                  {latestResult.place && (
                    <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
                      style={{
                        background: latestResult.place === 1 ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.06)",
                        color: latestResult.place === 1 ? "#FDE68A" : "rgba(255,255,255,0.4)",
                        border: latestResult.place === 1 ? "1px solid rgba(234,179,8,0.3)" : "1px solid rgba(255,255,255,0.1)"
                      }}>
                      {latestResult.place === 1 ? "🥇" : `${latestResult.place}th`}
                    </div>
                  )}
                </div>
                {sparklineTimes.length >= 2 && (
                  <div className="mb-3 -mx-1">
                    <Sparkline times={sparklineTimes} color={strokeColor} />
                  </div>
                )}
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-bold tracking-tight text-white">{formatMs(latestResult.time_ms)}</span>
                  {deltaMs !== null && Math.abs(deltaMs) > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold" style={{ color: isImproving ? "#6EE7B7" : "#FCA5A5" }}>
                        {isImproving ? "▼" : "▲"} {formatMs(Math.abs(deltaMs))}
                      </span>
                      <span className="text-xs text-white/35">over {sparklineTimes.length} swims</span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-white/35">{latestResult.swimmer_name}</p>
              </div>
            </Link>
          );
        })()}

        {/* Recent PBs */}
        {recentPBs.length > 0 && (
          <div>
            <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/30">Personal Bests</p>
            <div className="grid grid-cols-2 gap-3">
              {recentPBs.map((pb) => {
                const strokeColor = getStrokeColor(pb.event);
                return (
                  <Link key={`${pb.swimmer_id}-${pb.event}-${pb.course}`}
                    href={`/swimmers/${pb.swimmer_id}`}
                    className="rounded-2xl p-4 transition overflow-hidden relative"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl" style={{ background: strokeColor }} />
                    <p className="text-[10px] text-white/40 mb-1">{shortEvent(pb.event)} · {pb.course}</p>
                    <p className="text-2xl font-bold text-white">{formatMs(pb.time_ms)}</p>
                    <p className="mt-1 text-[10px] text-white/30">
                      {pb.swimmer_name.split(" ")[0]}
                      {pb.swam_at ? ` · ${formatDate(pb.swam_at)}` : ""}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty results state */}
        {swimmers.length > 0 && !latestResult && (
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

        <div className="h-6" />
      </div>
    </div>
  );
}