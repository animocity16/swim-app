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
};

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB");
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

// ✅ Sparkline SVG — shows time progression for an event
// Lower time = better = drawn higher on the chart
function Sparkline({ times }: { times: number[] }) {
  if (times.length < 2) return null;

  const W = 300;
  const H = 56;
  const pad = 6;

  const min = Math.min(...times);
  const max = Math.max(...times);
  const range = max - min || 1000;

  // Map each time to x/y — invert Y so faster = higher
  const pts = times.map((t, i) => ({
    x: pad + (i / (times.length - 1)) * (W - pad * 2),
    y: H - pad - ((max - t) / range) * (H - pad * 2),
  }));

  // Smooth path using bezier curves
  const pathD = pts.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const cpx = (prev.x + p.x) / 2;
    return `${d} C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`;
  }, "");

  // Fill path down to bottom
  const fillD = `${pathD} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;

  

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FDE68A" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fill area under line */}
      <path d={fillD} fill="url(#sparkFill)" />

      {/* Line */}
      <path
        d={pathD}
        stroke="#FDE68A"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />

      {/* All data points */}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === pts.length - 1 ? 4 : 2}
          fill={i === pts.length - 1 ? "#FDE68A" : "rgba(253,230,138,0.4)"}
        />
      ))}

      {/* Latest point highlight ring */}
      <circle
        cx={pts[pts.length - 1].x}
        cy={pts[pts.length - 1].y}
        r={7}
        fill="none"
        stroke="#FDE68A"
        strokeWidth="1"
        opacity="0.35"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [latestResult, setLatestResult] = useState<RecentResult | null>(null);
  const [recentPBs, setRecentPBs] = useState<RecentResult[]>([]);
  const [sparklineTimes, setSparklineTimes] = useState<number[]>([]);

  useEffect(() => { void loadDashboard(); }, []);

  async function loadDashboard() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { router.replace("/login"); return; }

    const email = sessionData.session.user.email ?? "";
    const firstName = email.split("@")[0].split(".")[0];
    setUserName(firstName.charAt(0).toUpperCase() + firstName.slice(1));

    const { data: swimmerData } = await supabase
      .from("swimmers")
      .select("id, name, age, swim_club, group_type")
      .eq("group_type", "primary")
      .order("name", { ascending: true });

    const mySwimmers = (swimmerData as Swimmer[]) || [];
    setSwimmers(mySwimmers);

    if (mySwimmers.length === 0) { setLoading(false); return; }

    const swimmerIds = mySwimmers.map((s) => s.id);

    // Latest result
    const { data: recentData } = await supabase
      .from("swim_times")
      .select("id, swimmer_id, event, course, time_ms, swam_at, meet_name, place")
      .in("swimmer_id", swimmerIds)
      .order("created_at", { ascending: false })
      .limit(1);

    let latestRow: RecentResult | null = null;
    if (recentData && recentData.length > 0) {
      const row = recentData[0];
      const swimmer = mySwimmers.find((s) => s.id === row.swimmer_id);
      latestRow = { ...row, swimmer_name: swimmer?.name ?? "Unknown" };
      setLatestResult(latestRow);

      // ✅ Load sparkline — last 8 times for same event + course + swimmer
      const { data: sparkData } = await supabase
        .from("swim_times")
        .select("time_ms, swam_at, created_at")
        .eq("swimmer_id", row.swimmer_id)
        .eq("event", row.event)
        .eq("course", row.course)
        .order("swam_at", { ascending: true })
        .limit(8);

      if (sparkData && sparkData.length >= 2) {
        setSparklineTimes((sparkData as { time_ms: number }[]).map((r) => r.time_ms));
      }
    }

    // Recent PBs
    const { data: allTimes } = await supabase
      .from("swim_times")
      .select("id, swimmer_id, event, course, time_ms, swam_at, meet_name")
      .in("swimmer_id", swimmerIds)
      .order("time_ms", { ascending: true });

    if (allTimes && allTimes.length > 0) {
      const pbMap = new Map<string, RecentResult>();
      for (const row of allTimes as RecentResult[]) {
        const swimmer = mySwimmers.find((s) => s.id === row.swimmer_id);
        const key = `${row.swimmer_id}|${row.event}|${row.course}`;
        if (!pbMap.has(key)) pbMap.set(key, { ...row, swimmer_name: swimmer?.name ?? "Unknown" });
      }

      const pbs = Array.from(pbMap.values())
        .filter((r) => r.swam_at)
        .sort((a, b) => new Date(b.swam_at!).getTime() - new Date(a.swam_at!).getTime())
        .slice(0, 4);

      setRecentPBs(pbs);
    }

    setLoading(false);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Calculate improvement delta for sparkline
  const sparklineFirst = sparklineTimes[0];
  const sparklineLast = sparklineTimes[sparklineTimes.length - 1];
  const deltaMs = sparklineFirst && sparklineLast ? sparklineFirst - sparklineLast : null;
  const isImproving = deltaMs !== null && deltaMs > 0;

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <p className="text-xs font-medium uppercase tracking-widest text-white/30">
            {greeting}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            {userName ?? "Welcome"}
          </h1>
        </div>

        {/* No swimmers state */}
        {swimmers.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-2xl font-bold text-white">Add your first swimmer</p>
            <p className="mt-2 text-sm text-white/50">Head to Brood to add your child.</p>
            <Link
              href="/swimmers"
              className="mt-6 inline-flex rounded-2xl px-6 py-3 text-sm font-semibold text-white transition"
              style={{ background: "#D97706" }}
            >
              Go to Brood
            </Link>
          </div>
        )}

        {/* Child quick-access pills */}
        {swimmers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {swimmers.map((swimmer, index) => {
              const colors = avatarColor(index);
              return (
                <Link
                  key={swimmer.id}
                  href={`/swimmers/${swimmer.id}`}
                  className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 transition hover:bg-white/10"
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    {getInitials(swimmer.name)}
                  </div>
                  <span className="text-sm font-medium text-white">
                    {swimmer.name.split(" ")[0]}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {/* ✅ Latest result hero with sparkline */}
        {latestResult && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 overflow-hidden">
            <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
              Latest result
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {latestResult.event}
              <span className="ml-2 text-sm font-normal text-white/40">· {latestResult.course}</span>
            </p>
            {latestResult.meet_name && (
              <p className="mt-0.5 text-sm text-white/50">{latestResult.meet_name}</p>
            )}
            {latestResult.swam_at && (
              <p className="mt-0.5 text-xs text-white/30">
                {formatDate(latestResult.swam_at)}
                {latestResult.place ? ` · Place ${latestResult.place}` : ""}
              </p>
            )}

            {/* ✅ Sparkline chart */}
            {sparklineTimes.length >= 2 && (
              <div className="mt-4 -mx-1">
                <Sparkline times={sparklineTimes} />
              </div>
            )}

            {/* Time + delta */}
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-5xl font-bold tracking-tight text-white">
                {formatMs(latestResult.time_ms)}
              </span>
              {deltaMs !== null && Math.abs(deltaMs) > 0 && (
                <span
                  className="text-sm font-semibold"
                  style={{ color: isImproving ? "#6EE7B7" : "#FCA5A5" }}
                >
                  {isImproving ? "▼" : "▲"} {formatMs(Math.abs(deltaMs))}
                  <span className="ml-1 text-xs font-normal opacity-60">
                    {isImproving ? "improvement" : "slower"} over {sparklineTimes.length} swims
                  </span>
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-white/40">{latestResult.swimmer_name}</p>
              <Link
                href={`/swimmers/${latestResult.swimmer_id}`}
                className="text-sm font-medium transition"
                style={{ color: "#FDE68A" }}
              >
                View profile →
              </Link>
            </div>
          </div>
        )}

        {/* Recent PBs */}
        {recentPBs.length > 0 && (
          <div>
            <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/30">
              Recent PBs
            </p>
            <div className="grid grid-cols-2 gap-3">
              {recentPBs.map((pb) => (
                <Link
                  key={`${pb.swimmer_id}-${pb.event}-${pb.course}`}
                  href={`/swimmers/${pb.swimmer_id}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                  <p className="text-[10px] text-white/40">{pb.event} · {pb.course}</p>
                  <p className="mt-1 text-xl font-bold text-white">{formatMs(pb.time_ms)}</p>
                  <p className="mt-1 text-[10px] text-white/30">
                    {pb.swimmer_name.split(" ")[0]}
                    {pb.swam_at ? ` · ${formatDate(pb.swam_at)}` : ""}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty results state */}
        {swimmers.length > 0 && !latestResult && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-base font-semibold text-white">No results yet</p>
            <p className="mt-1 text-sm text-white/40">
              Scan a Meet Mobile screenshot to save your first result.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}