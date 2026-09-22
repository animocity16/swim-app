"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PendingMatchesBanner from "@/app/components/PendingMatchesBanner";
import { canonicalEventName } from "@/lib/events";

// ─── Types ────────────────────────────────────────────────────────────────────

type Swimmer = {
  id: number;
  name: string;
  age: number;
  swim_club?: string | null;
  group_type?: string | null;
  gender?: string | null;
  squad?: string | null;
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

type StandardsProgress = {
  qualified: number;
  total: number;
};

type StandardSetRow = {
  id: number;
  name: string;
  user_id: string | null;
  type: "UPGRADING" | "IMPORTANT_MEET" | null;
};

type StandardItemRow = {
  id: number;
  standard_set_id: number;
  event: string;
  course: string;
  qualifying_time_ms: number;
  gender?: string | null;
  min_age?: number | null;
  max_age?: number | null;
};

// A single event the swimmer hasn't qualified for yet, ranked by how close
// their current PB is to the qualifying time — shown on Home when there's
// nothing to summarise into a full "X qualified" card yet.
type ClosestStandard = {
  event: string;
  course: string;
  standardName: string;
  qualifyingMs: number;
  pbMs: number;
  gapMs: number;
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

function NatrixMark({ size = 56 }: { size?: number }) {
  return (
    <img
      src="/natrix-mascot-search.png"
      alt="Natrix mascot"
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
    />
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


function StrokeBadge({ event }: { event: string }) {
  const e = event.toLowerCase();

  const type =
    e.includes("breast") ? "BREAST" :
    e.includes("back") ? "BACK" :
    e.includes("butterfly") || e.includes("fly") ? "FLY" :
    e.includes("im") ? "IM" : "FREE";

  const iconSrc: Record<string, string> = {
    FREE: "/icons/strokes/free.png",
    BACK: "/icons/strokes/back.png",
    FLY: "/icons/strokes/fly.png",
    BREAST: "/icons/strokes/breast.png",
    IM: "/icons/strokes/im.png",
  };

  return (
    <div
      className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl"
      aria-label={`${type} stroke`}
      title={type}
    >
      <img
        src={iconSrc[type]}
        alt={`${type} stroke`}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function ResultTrendChart({
  points,
  strokeColor,
}: {
  points: { time_ms: number; swam_at?: string | null; is_pb?: boolean }[];
  strokeColor: string;
}) {
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  const clean = points
    .filter((p) => Number.isFinite(p.time_ms))
    .slice()
    .sort((a, b) => {
      const da = a.swam_at ? new Date(a.swam_at).getTime() : 0;
      const db = b.swam_at ? new Date(b.swam_at).getTime() : 0;
      return da - db;
    })
    .slice(-6);

  if (clean.length < 2) {
    return (
      <div className="flex h-28 items-center justify-center rounded-2xl"
        style={{ background: "#F7FBFE", border: "1px solid #E0ECF3" }}>
        <span className="text-xs" style={{ color: "#71859A" }}>More swims will build the trend</span>
      </div>
    );
  }

  const width = 360;
  const height = 150;
  const left = 38;
  const right = 12;
  const top = 16;
  const bottom = 34;

  const values = clean.map((p) => p.time_ms);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const extra = Math.max((max - min) * 0.18, 1500);
  const chartMin = Math.max(0, min - extra);
  const chartMax = max + extra;
  const span = Math.max(chartMax - chartMin, 1);

  const coords = clean.map((p, i) => {
    const x = left + (i * (width - left - right)) / Math.max(clean.length - 1, 1);
    // Faster time = higher on screen.
    const y = top + ((p.time_ms - chartMin) / span) * (height - top - bottom);
    return { x, y };
  });

  const pointsAttr = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const selected = selectedPoint != null ? clean[selectedPoint] : null;
  const selectedCoord = selectedPoint != null ? coords[selectedPoint] : null;

  const yTicks = [0, 1, 2, 3].map((i) => {
    const ms = chartMin + (span * i) / 3;
    const y = top + ((ms - chartMin) / span) * (height - top - bottom);
    return { ms, y };
  });

  return (
    <div className="relative rounded-2xl px-2 py-2"
      style={{ background: "#F8FCFF", border: "1px solid #DCEAF3" }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[150px] w-full">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={left} y1={t.y} x2={width - right} y2={t.y} stroke="#DDE8F0" strokeWidth="1" />
            <text x={left - 8} y={t.y + 3} textAnchor="end" fontSize="8" fill="#8EA1B2">
              {formatMs(Math.round(t.ms))}
            </text>
          </g>
        ))}

        <polyline
          points={pointsAttr}
          fill="none"
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coords.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="11"
              fill="transparent"
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedPoint(i)}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={selectedPoint === i ? 5.5 : 4}
              fill={selectedPoint === i ? strokeColor : "white"}
              stroke={strokeColor}
              strokeWidth="2.5"
              pointerEvents="none"
            />
            <text x={p.x} y={height - 14} textAnchor="middle" fontSize="8" fill="#8EA1B2">
              {clean[i].swam_at
                ? new Date(clean[i].swam_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                : ""}
            </text>
          </g>
        ))}

        {selected && selectedCoord && (
          <g pointerEvents="none">
            <rect
              x={Math.min(width - 104, Math.max(8, selectedCoord.x - 48))}
              y={Math.max(5, selectedCoord.y - 58)}
              width="96"
              height="46"
              rx="7"
              fill="#0B2A54"
            />
            <text
              x={Math.min(width - 56, Math.max(56, selectedCoord.x))}
              y={Math.max(20, selectedCoord.y - 42)}
              textAnchor="middle"
              fontSize="8"
              fill="#C9D8E7"
            >
              {selected.swam_at ? formatDate(selected.swam_at) : ""}
            </text>
            <text
              x={Math.min(width - 56, Math.max(56, selectedCoord.x))}
              y={Math.max(34, selectedCoord.y - 28)}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="white"
            >
              {formatMs(selected.time_ms)}
            </text>
          </g>
        )}
      </svg>
    </div>
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
  const [allResults, setAllResults]             = useState<RecentResult[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [touchStartX, setTouchStartX]           = useState<number | null>(null);
  const [standardsProgress, setStandardsProgress] = useState<StandardsProgress | null>(null);
  const [closestStandards, setClosestStandards] = useState<ClosestStandard[]>([]);

  // Which square tile (if any) is expanded
  const [expandedSection, setExpandedSection] = useState<"activity" | "meets" | null>(null);

  useEffect(() => { void loadDashboard(); }, []);

  async function loadDashboard() {
    // ── Phase 1: session + swimmers in parallel ────────────────────────────────
    const sessionPromise = supabase.auth.getSession();
    const swimmersPromise = supabase
      .from("swimmers")
      .select("id, name, age, swim_club, group_type, gender, squad")
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
        .select("id, name, user_id, type")
        .or(`user_id.eq.${userId},user_id.is.null`)
        .order("created_at", { ascending: true }),
    ]);

    const allTimes = (timesResult.data ?? []) as (RecentResult & { created_at: string })[];
    const setsData = (setsResult.data ?? []) as StandardSetRow[];

    // Update swimmer cards with real stats now we have times
    const stats: SwimmerStat[] = mySwimmers.map((swimmer) => {
      const swimmerTimes = allTimes.filter((t) => t.swimmer_id === swimmer.id);
      const pbMap = new Map<string, number>();
      for (const t of [...swimmerTimes].sort((a, b) => a.time_ms - b.time_ms)) {
        const key = `${canonicalEventName(t.event)}|${t.course}`;
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

    const allResultsWithNames = allTimes.map((row) => {
      const swimmer = mySwimmers.find((s) => s.id === row.swimmer_id);
      return { ...row, swimmer_name: swimmer?.name ?? "Unknown" };
    });
    setAllResults(allResultsWithNames);

    // Standards — 1 batched query
    if (setsData.length > 0 && allTimes.length > 0) {
      const setIds = setsData.map((s) => s.id);
      const { data: allItemsRaw } = await supabase
        .from("standard_items")
        .select("id, standard_set_id, event, course, qualifying_time_ms, gender, min_age, max_age")
        .in("standard_set_id", setIds);

      const allItems = (allItemsRaw ?? []) as StandardItemRow[];
      const setNameById = new Map(setsData.map((s) => [s.id, s.name]));

      const relevantSwimmer = mySwimmers[0];
      const swimmerTimes = allTimes.filter((t) => t.swimmer_id === relevantSwimmer.id);
      const pbMapForStd = new Map<string, number>();
      for (const t of swimmerTimes) {
        const key = `${canonicalEventName(t.event)}|${t.course}`;
        const ex = pbMapForStd.get(key);
        if (!ex || t.time_ms < ex) pbMapForStd.set(key, t.time_ms);
      }

      // Only items that actually apply to this swimmer (age/gender match) —
      // same filter the Standards tab uses.
      function relevantItems(setId: number): StandardItemRow[] {
        return allItems.filter((item) => {
          if (item.standard_set_id !== setId) return false;
          if (item.gender && relevantSwimmer.gender &&
              item.gender.toLowerCase() !== relevantSwimmer.gender.toLowerCase()) return false;
          if (item.min_age != null && relevantSwimmer.age < item.min_age) return false;
          if (item.max_age != null && relevantSwimmer.age > item.max_age) return false;
          return true;
        });
      }

      function computeStats(setId: number) {
        const relevant = relevantItems(setId);
        const allForSet = allItems.filter((i) => i.standard_set_id === setId);
        const displayItems = relevant.length > 0 ? relevant : allForSet;
        let qualified = 0, inProgress = 0;
        for (const item of displayItems) {
          const pb = pbMapForStd.get(`${canonicalEventName(item.event)}|${item.course}`);
          if (pb === undefined) continue;
          if (pb <= item.qualifying_time_ms) qualified++;
          else inProgress++;
        }
        return { displayItems, qualified, inProgress, total: displayItems.length };
      }

      // Only show the ONE upgrading level the swimmer is actually working
      // towards next — not every rung already passed, and not rungs further
      // up the ladder she hasn't reached yet. Meet-qualifying standards
      // (not part of the squad ladder) always show alongside it.
      const upgradingSets = setsData.filter((s) => s.type === "UPGRADING");
      const meetSets = setsData.filter((s) => s.type !== "UPGRADING");

      let nextUpgradingSet: StandardSetRow | undefined;
      if (relevantSwimmer.squad) {
        const squadLower = relevantSwimmer.squad.toLowerCase();

        // The swimmer's current upgrading standard is the set whose name
        // matches their squad. Do NOT advance to the following set here.
        // The Standards page shows this matched set as the swimmer's active
        // target, so Home must use the same set for its qualified count.
        nextUpgradingSet = upgradingSets.find((set) =>
          set.name.toLowerCase().includes(squadLower)
        );

        // If the squad name does not match a standard-set name, fall back
        // to the first upgrading set that is not fully qualified.
        if (!nextUpgradingSet) {
          nextUpgradingSet = upgradingSets.find((set) => {
            const { qualified, total } = computeStats(set.id);
            return total === 0 || qualified < total;
          });
        }
      } else {
        nextUpgradingSet = upgradingSets.find((set) => {
          const { qualified, total } = computeStats(set.id);
          return total === 0 || qualified < total;
        });
      }

      const visibleSets: StandardSetRow[] = [
        ...(nextUpgradingSet ? [nextUpgradingSet] : []),
        ...meetSets,
      ];

      // Aggregate qualified/total across visible sets — used only to show a
      // "fully qualified" celebration when there's nothing left to chase.
      let qualifiedTotal = 0, itemsTotal = 0;
      for (const set of visibleSets) {
        const { qualified, total } = computeStats(set.id);
        qualifiedTotal += qualified;
        itemsTotal += total;
      }
      setStandardsProgress(itemsTotal > 0 ? { qualified: qualifiedTotal, total: itemsTotal } : null);

      // Closest-to-qualifying individual events — this is what Home actually
      // shows: the 2 events nearest to a PB matching the standard. Only
      // drawn from the visible sets (next squad rung + meet standards).
      const candidates: ClosestStandard[] = [];
      for (const set of visibleSets) {
        for (const item of relevantItems(set.id)) {
          const pb = pbMapForStd.get(`${canonicalEventName(item.event)}|${item.course}`);
          if (pb === undefined) continue;              // hasn't swum this event yet
          if (pb <= item.qualifying_time_ms) continue;  // already qualified

          candidates.push({
            event: item.event,
            course: item.course,
            standardName: setNameById.get(item.standard_set_id) ?? "Standard",
            qualifyingMs: item.qualifying_time_ms,
            pbMs: pb,
            gapMs: pb - item.qualifying_time_ms,
          });
        }
      }
      candidates.sort((a, b) => a.gapMs - b.gapMs);
      setClosestStandards(candidates.slice(0, 2));
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

  const primaryStat = swimmerStats[0];
  const primary = primaryStat?.swimmer ?? null;
  const firstName = primary?.name?.split(" ")[0] ?? "your swimmer";
  const nextTarget = closestStandards[0] ?? null;
  const nextMeet = upcomingMeets[0] ?? null;

  return (
    <div className="shell">
      <div className="container-app space-y-5 md:max-w-2xl">

        {/* Branded top bar */}
        <div className="pt-2 flex items-center justify-between gap-4">
          <div>
            <div className="text-[28px] font-black tracking-[0.08em] text-white">
              NATRIX
            </div>
            <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.24em] text-sky-200/50">
              Track · Improve · Belong
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-semibold text-white">{primary?.name ?? userName ?? "Home"}</div>
              <div className="text-[10px] text-white/35">{greeting}</div>
            </div>
            <NatrixMark size={58} />
          </div>
        </div>

        <PendingMatchesBanner />

        {/* Swimmer identity banner */}
        {primaryStat && primary && (
          <section
            className="overflow-hidden rounded-[28px]"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.99) 0%, rgba(226,243,255,0.98) 100%)",
              border: "1px solid rgba(255,255,255,0.90)",
              boxShadow: "0 18px 42px rgba(0,25,55,0.16)",
            }}
          >
            <div className="relative p-5">
              <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full"
                style={{ background: "rgba(48,158,246,0.08)" }} />
              <div className="absolute right-16 top-10 h-20 w-40 rotate-[-8deg] rounded-full"
                style={{ background: "rgba(48,158,246,0.05)" }} />

              <div className="relative flex items-center gap-4">
                <div
                  className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold"
                  style={{
                    background: "linear-gradient(135deg,#185FA5,#2D8BD8)",
                    color: "#D8ECFF",
                    border: "4px solid rgba(255,255,255,0.85)",
                  }}
                >
                  {getInitials(primary.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-2xl font-bold tracking-tight" style={{ color: "#0B2A54" }}>
                    {primary.name}
                  </h1>
                  <p className="mt-1 text-sm" style={{ color: "#60758B" }}>
                    Age {primary.age}
                    {primary.swim_club ? ` · ${primary.swim_club}` : ""}
                  </p>
                  <p className="mt-3 text-sm italic" style={{ color: "#617A98" }}>
                    Small improvements make big swimmers.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Latest result carousel — the only results section on Home */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
              Latest result
            </div>
            {primary && (
              <Link
                href={`/swimmers/${primary.id}`}
                className="text-[10px] font-bold uppercase tracking-wide text-sky-200/80"
              >
                View all
              </Link>
            )}
          </div>

          {allResults.length > 0 ? (() => {
            const uniqueEvents = Array.from(
              allResults.reduce((map, result) => {
                const key = `${result.swimmer_id}|${result.event}|${result.course}`;
                if (!map.has(key)) map.set(key, result);
                return map;
              }, new Map<string, RecentResult>()).values()
            ).slice(0, 8);

            const maxIndex = uniqueEvents.length - 1;
            const safeIndex = Math.min(selectedResultIndex, Math.max(maxIndex, 0));
            const selected = uniqueEvents[safeIndex];
            const strokeColor = getStrokeColor(selected.event);

            const eventHistory = allResults.filter(
              (r) =>
                r.swimmer_id === selected.swimmer_id &&
                r.event === selected.event &&
                r.course === selected.course
            );

            const label = selected.event.toLowerCase().includes("breast")
              ? "BREAST"
              : selected.event.toLowerCase().includes("back")
                ? "BACK"
                : selected.event.toLowerCase().includes("butterfly") || selected.event.toLowerCase().includes("fly")
                  ? "FLY"
                  : selected.event.toLowerCase().includes("im")
                    ? "IM"
                    : "FREE";

            function goToResult(nextIndex: number) {
              const count = uniqueEvents.length;
              if (count === 0) return;
              setSelectedResultIndex((nextIndex + count) % count);
            }

            function handleTouchEnd(endX: number) {
              if (touchStartX == null) return;
              const delta = endX - touchStartX;
              if (Math.abs(delta) > 45) {
                goToResult(safeIndex + (delta < 0 ? 1 : -1));
              }
              setTouchStartX(null);
            }

            return (
              <div
                className="overflow-hidden rounded-[28px]"
                onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
                onTouchEnd={(e) => handleTouchEnd(e.changedTouches[0]?.clientX ?? 0)}
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.99) 0%, rgba(234,247,255,0.99) 100%)",
                  border: "1px solid rgba(255,255,255,0.92)",
                  boxShadow: "0 18px 42px rgba(0,25,55,0.16)",
                }}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <StrokeBadge event={selected.event} />
                        <span className="text-[8px] font-black tracking-wide" style={{ color: strokeColor }}>
                          {label}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: strokeColor }}>
                          Event {safeIndex + 1} of {uniqueEvents.length}
                        </div>
                        <div className="mt-1 text-xl font-bold" style={{ color: "#0B2A54" }}>
                          {shortEvent(selected.event)}
                        </div>
                        <div className="mt-1 truncate text-xs" style={{ color: "#71859A" }}>
                          {selected.swam_at ? formatDate(selected.swam_at) : "Recent result"}
                          {selected.meet_name ? ` · ${selected.meet_name}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-3xl font-bold tracking-tight" style={{ color: "#0B2A54" }}>
                        {formatMs(selected.time_ms)}
                      </div>
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#71859A" }}>
                        {selected.course}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <ResultTrendChart points={eventHistory} strokeColor={strokeColor} />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => goToResult(safeIndex - 1)}
                      aria-label="Previous event"
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold"
                      style={{ background: "rgba(255,255,255,0.86)", color: "#52708D", border: "1px solid #DCEAF3" }}
                    >
                      ‹
                    </button>

                    <div className="flex items-center justify-center gap-1.5">
                      {uniqueEvents.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          aria-label={`Show event ${i + 1}`}
                          onClick={() => setSelectedResultIndex(i)}
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: i === safeIndex ? 18 : 8,
                            background: i === safeIndex ? "#168AE8" : "#C9D7E3",
                          }}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => goToResult(safeIndex + 1)}
                      aria-label="Next event"
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold"
                      style={{ background: "#168AE8", color: "white" }}
                    >
                      ›
                    </button>
                  </div>

                  <Link
                    href={`/swimmers/${selected.swimmer_id}`}
                    className="mt-4 flex items-center justify-between border-t pt-4"
                    style={{ borderColor: "#DCEAF3" }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl text-sm"
                        style={{ background: "#E8F4FD", color: "#168AE8" }}>
                        ▣
                      </div>
                      <span className="text-sm font-semibold" style={{ color: "#0B2A54" }}>
                        View full results & progress
                      </span>
                    </div>
                    <span className="text-xl font-bold" style={{ color: "#168AE8" }}>›</span>
                  </Link>
                </div>
              </div>
            );
          })() : (
            <div
              className="rounded-[28px] p-5 text-center"
              style={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(255,255,255,0.88)" }}
            >
              <div className="text-sm font-semibold" style={{ color: "#0B2A54" }}>No results yet</div>
              <div className="mt-1 text-xs" style={{ color: "#71859A" }}>
                New swims will appear here automatically.
              </div>
            </div>
          )}
        </section>

        {/* Recent events */}
        {allResults.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                Recent events
              </div>
              {primary && (
                <Link
                  href={`/swimmers/${primary.id}`}
                  className="text-[10px] font-bold uppercase tracking-wide text-white/80"
                >
                  View all
                </Link>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {Array.from(
                allResults.reduce((map, result) => {
                  const key = `${result.swimmer_id}|${result.event}|${result.course}`;
                  if (!map.has(key)) map.set(key, result);
                  return map;
                }, new Map<string, RecentResult>()).values()
              )
                .slice(0, 4)
                .map((result) => (
                  <Link
                    key={`${result.swimmer_id}-${result.event}-${result.course}`}
                    href={`/swimmers/${result.swimmer_id}`}
                    className="min-w-0 rounded-[18px] p-2.5 transition active:scale-[0.98]"
                    style={{
                      background: "rgba(255,255,255,0.96)",
                      border: "1px solid rgba(255,255,255,0.90)",
                      boxShadow: "0 8px 18px rgba(0,20,55,0.08)",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <StrokeBadge event={result.event} />
                    </div>
                    <div className="mt-2 truncate text-[10px] font-bold" style={{ color: "#0B2A54" }}>
                      {shortEvent(result.event)}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-bold" style={{ color: "#0B2A54" }}>
                      {formatMs(result.time_ms)}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <span className="truncate text-[8px]" style={{ color: "#71859A" }}>
                        {result.swam_at ? formatDate(result.swam_at) : ""}
                      </span>
                      <span className="rounded-full px-1.5 py-0.5 text-[7px] font-bold"
                        style={{ background: "#E9F2FA", color: "#5A7690" }}>
                        {result.course}
                      </span>
                    </div>
                  </Link>
                ))}
            </div>
          </section>
        )}

        {/* Bottom dashboard row: standards + one secondary tool */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href={primary ? `/swimmers/${primary.id}?tab=standards` : "/standards"}
            className="relative overflow-hidden rounded-[26px] p-5 transition active:scale-[0.99]"
            style={{
              background: "linear-gradient(145deg,#0E3B6C 0%,#082A50 100%)",
              border: "1px solid rgba(125,194,255,0.18)",
              boxShadow: "0 16px 34px rgba(0,18,46,0.24)",
            }}
          >
            <div className="relative z-10">
              <div className="text-2xl">🎯</div>
              <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100/75">
                Standards progress
              </div>

              {standardsProgress && standardsProgress.total > 0 ? (
                <>
                  <div className="mt-2 text-sm text-white/65">
                    {standardsProgress.qualified} of {standardsProgress.total} standards qualified
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(6, Math.min(100, (standardsProgress.qualified / standardsProgress.total) * 100))}%`,
                        background: "linear-gradient(90deg,#31D2FF,#168AE8)",
                      }}
                    />
                  </div>
                </>
              ) : nextTarget ? (
                <>
                  <div className="mt-2 text-lg font-bold text-white">
                    {shortEvent(nextTarget.event)}
                  </div>
                  <div className="mt-1 text-xs text-white/55">
                    {(nextTarget.gapMs / 1000).toFixed(2)}s from {nextTarget.standardName}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-white/60">
                  Add standards to see the next target.
                </div>
              )}

              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white">
                View standards <span>→</span>
              </div>
            </div>

            <div className="absolute -bottom-2 right-5 flex items-end gap-1 opacity-20">
              {[28, 44, 62, 80].map((h) => (
                <div key={h} className="w-3 rounded-t" style={{ height: h, background: "#5EB5FF" }} />
              ))}
            </div>
          </Link>

          <div
            className="rounded-[26px] p-5"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(239,248,255,0.98) 100%)",
              border: "1px solid rgba(255,255,255,0.90)",
              boxShadow: "0 14px 30px rgba(0,20,55,0.10)",
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#59718A" }}>
              Quick tools
            </div>

            <Link
              href={nextMeet ? `/meets/upcoming/${nextMeet.id}` : "/meets"}
              className="mt-3 flex items-center gap-3 rounded-2xl px-3 py-3"
              style={{ background: "white", border: "1px solid #E0ECF3" }}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                style={{ background: "#E8F4FD" }}>
                {nextMeet ? meetEmoji(nextMeet.meetType) : "🏊"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold" style={{ color: "#0B2A54" }}>
                  Upcoming meet
                </div>
                <div className="mt-0.5 truncate text-[10px]" style={{ color: "#71859A" }}>
                  {nextMeet?.name ?? "View meets"}
                </div>
              </div>
              <span style={{ color: "#7A8EA2" }}>›</span>
            </Link>

            <Link
              href="/calculator"
              className="mt-2 flex items-center gap-3 rounded-2xl px-3 py-3"
              style={{ background: "white", border: "1px solid #E0ECF3" }}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                style={{ background: "#EEF4FF" }}>
                🧮
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold" style={{ color: "#0B2A54" }}>
                  Lap calculator
                </div>
                <div className="mt-0.5 text-[10px]" style={{ color: "#71859A" }}>
                  Splits & target times
                </div>
              </div>
              <span style={{ color: "#7A8EA2" }}>›</span>
            </Link>
          </div>
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
  const strokeColor = latestEvent ? getStrokeColor(latestEvent) : "#38BDF8";

  const avatarBg = index === 0
    ? "var(--natrix-avatar-colour, " + colors.bg + ")"
    : colors.bg;
  const avatarText = index === 0
    ? "var(--natrix-avatar-text, " + colors.text + ")"
    : colors.text;

  return (
    <Link
      href={`/swimmers/${swimmer.id}`}
      className="flex items-center gap-3 rounded-[24px] p-4 transition active:scale-[0.99]"
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(255,255,255,0.86)",
        boxShadow: "0 10px 26px rgba(0,25,55,0.10)",
      }}
    >
      <div
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold"
        style={{ background: avatarBg, color: avatarText }}
      >
        {getInitials(swimmer.name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold" style={{ color: "#0B2A54" }}>
          {swimmer.name}
        </div>
        <div className="mt-0.5 truncate text-[10px]" style={{ color: "#71859A" }}>
          Age {swimmer.age}
          {swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
        </div>

        <div className="mt-2 flex items-center gap-3 text-[10px]" style={{ color: "#71859A" }}>
          <span><strong style={{ color: "#0B2A54" }}>{totalEvents}</strong> events</span>
          <span><strong style={{ color: "#0B2A54" }}>{totalTimes}</strong> results</span>
        </div>

        {latestEvent && latestTimeMs != null && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-3 w-1 rounded-full" style={{ background: strokeColor }} />
            <div className="truncate text-[10px]" style={{ color: "#71859A" }}>
              {shortEvent(latestEvent)} · {formatMs(latestTimeMs)}
              {latestIsPB ? " · PB" : ""}
              {latestSwamAt ? ` · ${formatDate(latestSwamAt)}` : ""}
            </div>
          </div>
        )}
      </div>

      <ChevronIcon />
    </Link>
  );
}
