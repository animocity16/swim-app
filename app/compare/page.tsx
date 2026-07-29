"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { canonicalEventName, canonicalCourse, eventKey } from "@/lib/events";
import { calcFinaPoints, type Gender } from "@/lib/finaPoints";

// ─── Types ────────────────────────────────────────────────────────────────────

type Swimmer = {
  id: number;
  name: string;
  age: number;
  swim_club?: string | null;
  school?: string | null;
  group_type?: string | null;
  gender?: string | null;
};

type SwimTimeRow = {
  swimmer_id: number;
  event: string;
  course: string;
  time_ms: number;
  meet_name: string | null;
  swam_at: string | null;
};

type EventKey = string;
type Scope = "all" | "club" | "school";
type RankScope = "overall" | "event";
type RankPointMode = "avg" | "total";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_COMPARE = 10;
const RANK_COUNTS = [3, 5, 10, 20];
const ALL_TIME_LABEL = "All time (best)";

function formatMs(ms: number | null | undefined) {
  if (ms == null || isNaN(ms)) return "—";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function keyOf(event: string, course: string) {
  return eventKey(canonicalEventName(event), canonicalCourse(course));
}

function getPBMap(times: SwimTimeRow[]) {
  const map = new Map<EventKey, number>();
  for (const row of times) {
    const key = keyOf(row.event, row.course);
    const existing = map.get(key);
    if (!existing || row.time_ms < existing) map.set(key, row.time_ms);
  }
  return map;
}

function shortName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function getYearFromDate(dateStr: string | null): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Unknown";
  return String(d.getFullYear());
}

const AVATAR_COLORS = [
  { bg: "#92400E", text: "#FDE68A" },
  { bg: "#1E3A5F", text: "#93C5FD" },
  { bg: "#164E3A", text: "#6EE7B7" },
  { bg: "#3B0764", text: "#E9D5FF" },
  { bg: "#78350F", text: "#FCD34D" },
  { bg: "#1E1B4B", text: "#A5B4FC" },
];

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

const STROKE_ORDER = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];
const STROKE_LABELS: Record<string, string> = {
  Freestyle: "Free",
  Backstroke: "Back",
  Breaststroke: "Breast",
  Butterfly: "Fly",
  IM: "IM",
};

function getStrokeName(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breaststroke") || e.includes("breast")) return "Breaststroke";
  if (e.includes("backstroke") || e.includes("back")) return "Backstroke";
  if (e.includes("butterfly") || e.includes("fly")) return "Butterfly";
  if (e.includes("freestyle") || e.includes("free")) return "Freestyle";
  if (e.includes("medley") || e.endsWith(" im") || e === "im") return "IM";
  return "Other";
}

function getEventDistance(event: string): number {
  const match = event.match(/\d+/);
  return match ? Number(match[0]) : 9999;
}

const RANK_STYLES: Record<number, { bg: string; border: string; numColor: string }> = {
  1: { bg: "rgba(234,179,8,0.15)",   border: "rgba(234,179,8,0.4)",    numColor: "#FDE68A" },
  2: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)",  numColor: "#CBD5E1" },
  3: { bg: "rgba(180,100,50,0.15)",  border: "rgba(180,100,50,0.35)",  numColor: "#FDBA74" },
  4: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)",  numColor: "rgba(255,255,255,0.4)" },
  5: { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", numColor: "rgba(255,255,255,0.3)" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const router = useRouter();

  const [allSwimmers, setAllSwimmers] = useState<Swimmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [rankLoading, setRankLoading] = useState(false);

  const [mySwimmerId, setMySwimmerId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [timesMap, setTimesMap] = useState<Map<number, SwimTimeRow[]>>(new Map());

  // Scope: All / Club / School — toggle-open, remembers last sub-choice when reopened
  const [scope, setScope] = useState<Scope | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [clubValue, setClubValue] = useState<string | null>(null);
  const [schoolValue, setSchoolValue] = useState<string | null>(null);

  // Rank: independent toggle, combinable with Scope. Scored by real FINA points.
  const [rankOn, setRankOn] = useState(false);
  const [rankScope, setRankScope] = useState<RankScope>("overall");
  const [rankPointMode, setRankPointMode] = useState<RankPointMode>("avg");
  const [rankEventChoice, setRankEventChoice] = useState<string | null>(null);
  const [rankMeetChoice, setRankMeetChoice] = useState<string | null>(null); // null = All time (best)
  const [rankMeetPanelOpen, setRankMeetPanelOpen] = useState(false);
  const [rankMeetOpenYears, setRankMeetOpenYears] = useState<Set<string>>(new Set());
  const [rankCount, setRankCount] = useState<number | null>(null);

  // Results: gated behind a stroke choice
  const [activeStroke, setActiveStroke] = useState<string | null>(null);

  useEffect(() => { void init(); }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    const { data } = await supabase
      .from("swimmers")
      .select("id, name, age, swim_club, school, group_type, gender")
      .order("group_type", { ascending: false })
      .order("name", { ascending: true });

    const swimmers = (data as Swimmer[]) || [];
    setAllSwimmers(swimmers);

    const primary = swimmers.find((s) => s.group_type === "primary");
    if (primary) {
      setMySwimmerId(primary.id);
      const updated = await loadTimesForIds([primary.id], new Map());
      setTimesMap(updated);
    }
    setLoading(false);
  }

  async function loadTimesForIds(ids: number[], currentMap: Map<number, SwimTimeRow[]>) {
    const missing = ids.filter((id) => !currentMap.has(id));
    if (missing.length === 0) return currentMap;

    const { data } = await supabase
      .from("swim_times")
      .select("swimmer_id, event, course, time_ms, meet_name, swam_at")
      .in("swimmer_id", missing);

    const grouped = new Map<number, SwimTimeRow[]>();
    for (const id of missing) grouped.set(id, []);
    for (const row of (data as SwimTimeRow[]) || []) {
      grouped.get(row.swimmer_id)?.push(row);
    }

    const updated = new Map(currentMap);
    for (const id of missing) updated.set(id, grouped.get(id) || []);
    return updated;
  }

  async function toggleSelected(id: number) {
    if (id === mySwimmerId) return;
    const isSelected = selectedIds.has(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isSelected) { next.delete(id); return next; }
      if (next.size >= MAX_COMPARE) return prev;
      next.add(id);
      return next;
    });
    if (!isSelected && !timesMap.has(id)) {
      setLoadingTimes(true);
      const updated = await loadTimesForIds([id], timesMap);
      setTimesMap(updated);
      setLoadingTimes(false);
    }
  }

  async function handleMySwimmerChange(id: number) {
    setMySwimmerId(id);
    setSelectedIds(new Set());
    setActiveStroke(null);
    if (!timesMap.has(id)) {
      setLoadingTimes(true);
      const updated = await loadTimesForIds([id], timesMap);
      setTimesMap(updated);
      setLoadingTimes(false);
    }
  }

  function toggleScope(newScope: Scope) {
    if (scope === newScope && scopeOpen) {
      setScopeOpen(false);
    } else {
      setScope(newScope);
      setScopeOpen(true);
    }
  }

  function toggleRank() {
    setRankOn((prev) => {
      const next = !prev;
      if (!next) {
        setRankCount(null);
        setRankEventChoice(null);
        setRankMeetChoice(null);
        setRankMeetPanelOpen(false);
      }
      return next;
    });
  }

  function handleRankScopeChange(next: RankScope) {
    setRankScope(next);
    setRankEventChoice(null);
    setRankMeetChoice(null);
    setRankMeetPanelOpen(false);
  }

  function handleRankEventChoice(event: string) {
    setRankEventChoice(event);
    setRankMeetChoice(null); // meet list depends on the chosen event, so reset
  }

  function toggleMeetYear(year: string) {
    setRankMeetOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const primarySwimmers = useMemo(
    () => allSwimmers.filter((s) => s.group_type === "primary"),
    [allSwimmers]
  );
  const followingSwimmers = useMemo(
    () => allSwimmers.filter((s) => s.group_type === "following"),
    [allSwimmers]
  );
  const mySwimmer = useMemo(
    () => allSwimmers.find((s) => s.id === mySwimmerId) ?? null,
    [allSwimmers, mySwimmerId]
  );
  const selectedSwimmers = useMemo(
    () => allSwimmers.filter((s) => selectedIds.has(s.id)),
    [allSwimmers, selectedIds]
  );

  const clubOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of followingSwimmers) if (s.swim_club?.trim()) set.add(s.swim_club.trim());
    return Array.from(set).sort();
  }, [followingSwimmers]);

  const schoolOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of followingSwimmers) if (s.school?.trim()) set.add(s.school.trim());
    return Array.from(set).sort();
  }, [followingSwimmers]);

  const baseList = useMemo((): Swimmer[] | null => {
    if (scope === "club" && scopeOpen) {
      return clubValue ? followingSwimmers.filter((s) => s.swim_club?.trim() === clubValue) : null;
    }
    if (scope === "school" && scopeOpen) {
      return schoolValue ? followingSwimmers.filter((s) => s.school?.trim() === schoolValue) : null;
    }
    return followingSwimmers;
  }, [scope, scopeOpen, clubValue, schoolValue, followingSwimmers]);

  const anythingActive = (scope !== null && scopeOpen) || rankOn;

  // Bulk-load full times (now including meet_name/swam_at) for the whole base
  // list whenever Rank is on and a candidate group is resolved — needed both
  // for computing FINA scores and for populating the event/meet pickers.
  useEffect(() => {
    if (!rankOn || !baseList) return;
    const ids = baseList.map((s) => s.id);
    const missing = ids.filter((id) => !timesMap.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    async function fetchMissing() {
      setRankLoading(true);
      const updated = await loadTimesForIds(missing, timesMap);
      if (!cancelled) { setTimesMap(updated); setRankLoading(false); }
    }
    void fetchMissing();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankOn, baseList]);

  const baseListTimesReady = useMemo(() => {
    if (!baseList) return false;
    return baseList.every((s) => timesMap.has(s.id));
  }, [baseList, timesMap]);

  // Every event any candidate in the base list has actually logged — sorted
  // stroke-then-distance, same ordering used everywhere else in the app.
  const candidateEvents = useMemo(() => {
    if (!baseList || !baseListTimesReady) return [];
    const set = new Set<string>();
    for (const s of baseList) {
      for (const row of timesMap.get(s.id) ?? []) set.add(canonicalEventName(row.event));
    }
    return Array.from(set).sort((a, b) => {
      const sA = STROKE_ORDER.indexOf(getStrokeName(a));
      const sB = STROKE_ORDER.indexOf(getStrokeName(b));
      if (sA !== sB) return sA - sB;
      return getEventDistance(a) - getEventDistance(b);
    });
  }, [baseList, baseListTimesReady, timesMap]);

  // Meets where at least one candidate actually swam the chosen event —
  // grouped by year so the list stays short as meets accumulate over time.
  const candidateMeetsByYear = useMemo(() => {
    if (!baseList || !baseListTimesReady || rankScope !== "event" || !rankEventChoice) {
      return new Map<string, string[]>();
    }
    const byYear = new Map<string, Set<string>>();
    for (const s of baseList) {
      for (const row of timesMap.get(s.id) ?? []) {
        if (canonicalEventName(row.event) !== rankEventChoice) continue;
        if (!row.meet_name) continue;
        const year = getYearFromDate(row.swam_at);
        if (!byYear.has(year)) byYear.set(year, new Set());
        byYear.get(year)!.add(row.meet_name);
      }
    }
    const result = new Map<string, string[]>();
    for (const [year, names] of byYear) result.set(year, Array.from(names).sort());
    return result;
  }, [baseList, baseListTimesReady, rankScope, rankEventChoice, timesMap]);

  const candidateMeetYears = useMemo(
    () => Array.from(candidateMeetsByYear.keys()).sort((a, b) => b.localeCompare(a)),
    [candidateMeetsByYear]
  );

  // ─── FINA-points ranking ────────────────────────────────────────────────────

  const rankedResults = useMemo((): { id: number; points: number }[] | null => {
    if (!rankOn || !rankCount || !baseList || !baseListTimesReady) return null;
    if (rankScope === "event" && !rankEventChoice) return null;

    const genderById = new Map(allSwimmers.map((s) => [s.id, (s.gender as Gender | null) ?? null]));

    const scored: { id: number; points: number }[] = [];

    for (const s of baseList) {
      const rows = timesMap.get(s.id) ?? [];
      const gender = genderById.get(s.id) ?? null;

      if (rankScope === "overall") {
        const pbMap = getPBMap(rows);
        const points: number[] = [];
        for (const [key, ms] of pbMap) {
          const [event, course] = key.split("|");
          const pts = calcFinaPoints(ms, event, course, gender);
          if (pts != null) points.push(pts);
        }
        if (points.length === 0) continue;
        const score = rankPointMode === "avg"
          ? Math.round(points.reduce((a, b) => a + b, 0) / points.length)
          : points.reduce((a, b) => a + b, 0);
        scored.push({ id: s.id, points: score });
      } else {
        const matching = rows.filter((r) => {
          if (canonicalEventName(r.event) !== rankEventChoice) return false;
          if (rankMeetChoice && r.meet_name !== rankMeetChoice) return false;
          return true;
        });
        const points = matching
          .map((r) => calcFinaPoints(r.time_ms, rankEventChoice!, canonicalCourse(r.course), gender))
          .filter((p): p is number => p != null);
        if (points.length === 0) continue;
        scored.push({ id: s.id, points: Math.max(...points) });
      }
    }

    scored.sort((a, b) => b.points - a.points);
    return scored.slice(0, rankCount);
  }, [rankOn, rankCount, baseList, baseListTimesReady, rankScope, rankPointMode, rankEventChoice, rankMeetChoice, timesMap, allSwimmers]);

  // The list of swimmers actually shown for tapping/selecting right now
  const visibleList = useMemo((): { swimmer: Swimmer; points: number | null }[] | null => {
    if (!anythingActive) return null;
    if (baseList === null) return null;
    if (rankOn) {
      if (rankScope === "event" && !rankEventChoice) return null;
      if (!rankCount) return null;
      if (rankLoading || !baseListTimesReady) return null;
      if (rankedResults === null) return null;
      return rankedResults
        .map((r) => {
          const swimmer = baseList.find((s) => s.id === r.id);
          return swimmer ? { swimmer, points: r.points } : null;
        })
        .filter((e): e is { swimmer: Swimmer; points: number } => !!e);
    }
    return baseList.map((s) => ({ swimmer: s, points: null }));
  }, [anythingActive, baseList, rankOn, rankScope, rankEventChoice, rankCount, rankLoading, baseListTimesReady, rankedResults]);

  // ─── PB maps for the results section ──────────────────────────────────────

  const myPBMap = useMemo(() => {
    if (!mySwimmerId) return new Map<EventKey, number>();
    return getPBMap(timesMap.get(mySwimmerId) ?? []);
  }, [timesMap, mySwimmerId]);

  const selectedPBMaps = useMemo(() => {
    const maps = new Map<number, Map<EventKey, number>>();
    for (const id of selectedIds) maps.set(id, getPBMap(timesMap.get(id) ?? []));
    return maps;
  }, [timesMap, selectedIds]);

  const sharedEvents = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const allKeys = new Set<EventKey>();
    for (const id of selectedIds) {
      const theirMap = selectedPBMaps.get(id) ?? new Map();
      for (const key of theirMap.keys()) if (myPBMap.has(key)) allKeys.add(key);
    }
    return Array.from(allKeys)
      .map((key) => {
        const [event, course] = key.split("|");
        return { key, event, course };
      })
      .sort((a, b) => getEventDistance(a.event) - getEventDistance(b.event));
  }, [myPBMap, selectedPBMaps, selectedIds]);

  const strokeEvents = useMemo(() => {
    if (!activeStroke) return [];
    return sharedEvents.filter((ev) => getStrokeName(ev.event) === activeStroke);
  }, [sharedEvents, activeStroke]);

  const strokesWithData = useMemo(() => {
    const set = new Set(sharedEvents.map((ev) => getStrokeName(ev.event)));
    return STROKE_ORDER.filter((s) => set.has(s));
  }, [sharedEvents]);

  const allCompared = useMemo(() => {
    if (!mySwimmerId || !mySwimmer) return [];
    return [
      { swimmer: mySwimmer, pbMap: myPBMap, colorIndex: 0, isMine: true },
      ...selectedSwimmers.map((s, i) => ({
        swimmer: s,
        pbMap: selectedPBMaps.get(s.id) ?? new Map<EventKey, number>(),
        colorIndex: primarySwimmers.length + i,
        isMine: false,
      })),
    ];
  }, [mySwimmerId, mySwimmer, myPBMap, selectedSwimmers, selectedPBMaps, primarySwimmers.length]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="shell"><div className="container-app"><p className="muted">Loading...</p></div></div>;
  }

  const chipBase = "rounded-2xl px-3 py-1.5 text-xs font-semibold transition";
  const chipActive = { background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.35)", color: "#FDE68A" };
  const chipInactive = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" };

  const scopeBtnStyle = (active: boolean) => active
    ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" };

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>Natrix</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Compare</h1>
          <p className="mt-1 text-sm text-white/50">Tap a filter to open its list. Tap again to close it.</p>
        </div>

        {/* ── Picker ────────────────────────────────────────────────────── */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">

          {/* My swimmer */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 mb-2">My swimmer</p>
            <div className="flex flex-wrap gap-2">
              {primarySwimmers.map((s, i) => {
                const colors = avatarColor(i);
                const active = s.id === mySwimmerId;
                return (
                  <button key={s.id} type="button" onClick={() => void handleMySwimmerChange(s.id)}
                    className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition"
                    style={active
                      ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
                    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
                      style={{ background: colors.bg, color: colors.text }}>{getInitials(s.name)}</div>
                    {s.name.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* VS divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs font-bold text-white/25 uppercase tracking-widest">vs</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Scope */}
          <div>
            <p className="text-[9px] font-medium uppercase tracking-widest text-white/25 mb-2">Scope (optional)</p>
            <div className="flex gap-2">
              {(["all", "club", "school"] as Scope[]).map((s) => (
                <button key={s} type="button" onClick={() => toggleScope(s)}
                  className="flex-1 rounded-2xl py-2 text-xs font-semibold transition capitalize"
                  style={scopeBtnStyle(scope === s && scopeOpen)}>
                  {s}
                </button>
              ))}
            </div>

            {scope === "club" && scopeOpen && (
              <div className="flex flex-wrap gap-2 mt-2">
                {clubOptions.length === 0 ? (
                  <p className="text-xs text-white/35">No clubs found on your following swimmers.</p>
                ) : clubOptions.map((club) => (
                  <button key={club} type="button" onClick={() => setClubValue((prev) => prev === club ? null : club)}
                    className={chipBase} style={clubValue === club ? chipActive : chipInactive}>
                    {club}
                  </button>
                ))}
              </div>
            )}

            {scope === "school" && scopeOpen && (
              <div className="flex flex-wrap gap-2 mt-2">
                {schoolOptions.length === 0 ? (
                  <p className="text-xs text-white/35">No schools found on your following swimmers.</p>
                ) : schoolOptions.map((school) => (
                  <button key={school} type="button" onClick={() => setSchoolValue((prev) => prev === school ? null : school)}
                    className={chipBase} style={schoolValue === school ? chipActive : chipInactive}>
                    {school}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Rank — real FINA points, Overall or Per-event */}
          <div>
            <p className="text-[9px] font-medium uppercase tracking-widest text-white/25 mb-2">Sort</p>
            <button type="button" onClick={toggleRank}
              className="w-full rounded-2xl py-2 text-xs font-semibold transition"
              style={scopeBtnStyle(rankOn)}>
              Rank by FINA points
            </button>

            {rankOn && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleRankScopeChange("overall")}
                    className="flex-1 rounded-2xl py-1.5 text-xs font-semibold transition"
                    style={scopeBtnStyle(rankScope === "overall")}>
                    Overall
                  </button>
                  <button type="button" onClick={() => handleRankScopeChange("event")}
                    className="flex-1 rounded-2xl py-1.5 text-xs font-semibold transition"
                    style={scopeBtnStyle(rankScope === "event")}>
                    One event
                  </button>
                </div>

                {rankScope === "overall" && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setRankPointMode("avg")}
                      className={chipBase} style={{ flex: 1, ...(rankPointMode === "avg" ? chipActive : chipInactive) }}>
                      Average pts
                    </button>
                    <button type="button" onClick={() => setRankPointMode("total")}
                      className={chipBase} style={{ flex: 1, ...(rankPointMode === "total" ? chipActive : chipInactive) }}>
                      Total pts
                    </button>
                  </div>
                )}

                {rankScope === "event" && (
                  <>
                    {!baseListTimesReady ? (
                      <p className="text-xs text-white/35">Loading events…</p>
                    ) : candidateEvents.length === 0 ? (
                      <p className="text-xs text-white/35">No logged events found for this group yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {candidateEvents.map((event) => (
                          <button key={event} type="button" onClick={() => handleRankEventChoice(event)}
                            className={chipBase} style={rankEventChoice === event ? chipActive : chipInactive}>
                            {event}
                          </button>
                        ))}
                      </div>
                    )}

                    {rankEventChoice && (
                      <div>
                        <button type="button" onClick={() => setRankMeetPanelOpen((v) => !v)}
                          className="w-full flex items-center justify-between rounded-2xl px-3 py-2"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <span className="text-xs font-semibold" style={{ color: "#FDE68A" }}>
                            {rankMeetChoice ?? ALL_TIME_LABEL}
                          </span>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
                            style={{ transform: rankMeetPanelOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                            <path d="M4 6L8 10L12 6" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>

                        {rankMeetPanelOpen && (
                          <div className="mt-2 space-y-2">
                            <button type="button" onClick={() => setRankMeetChoice(null)}
                              className="w-full rounded-2xl px-3 py-1.5 text-xs font-semibold text-left transition"
                              style={rankMeetChoice === null ? chipActive : chipInactive}>
                              {ALL_TIME_LABEL}
                            </button>
                            {candidateMeetYears.length === 0 ? (
                              <p className="text-xs text-white/35 px-1">No meets logged for this event yet.</p>
                            ) : candidateMeetYears.map((year) => (
                              <div key={year}>
                                <button type="button" onClick={() => toggleMeetYear(year)}
                                  className="w-full flex items-center justify-between py-1 px-1">
                                  <span className="text-[11px] font-semibold tracking-wide text-white/35">{year}</span>
                                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
                                    style={{ transform: rankMeetOpenYears.has(year) ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                                    <path d="M4 6L8 10L12 6" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                                {rankMeetOpenYears.has(year) && (
                                  <div className="flex flex-col gap-1.5 pb-1">
                                    {(candidateMeetsByYear.get(year) ?? []).map((meet) => (
                                      <button key={meet} type="button" onClick={() => setRankMeetChoice(meet)}
                                        className="w-full rounded-2xl px-3 py-1.5 text-xs font-medium text-left transition"
                                        style={rankMeetChoice === meet ? chipActive : chipInactive}>
                                        {meet}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="flex flex-wrap gap-2">
                  {RANK_COUNTS.map((n) => (
                    <button key={n} type="button" onClick={() => setRankCount(n)}
                      className={chipBase} style={rankCount === n ? chipActive : chipInactive}>
                      Top {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Selected */}
          {selectedSwimmers.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 mb-2">
                Selected ({selectedIds.size}/{MAX_COMPARE})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedSwimmers.map((s) => {
                  const idx = allSwimmers.findIndex((x) => x.id === s.id);
                  const colors = avatarColor(idx);
                  return (
                    <button key={s.id} type="button" onClick={() => void toggleSelected(s.id)}
                      className="flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-medium transition"
                      style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", color: "white" }}>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                        style={{ background: colors.bg, color: colors.text }}>
                        {getInitials(s.name)}
                      </span>
                      {shortName(s.name)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prompt / list */}
          {!anythingActive ? (
            <p className="text-sm text-white/35 text-center py-2">
              Tap All, Club, School, or Rank above to see swimmers.
            </p>
          ) : rankOn && (rankLoading || (baseList && !baseListTimesReady)) ? (
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
              <p className="text-sm text-white/50">Loading times…</p>
            </div>
          ) : visibleList === null ? (
            <p className="text-sm text-white/35 text-center py-2">
              {scope === "club" && scopeOpen && !rankOn && "Choose a club above to see its swimmers."}
              {scope === "school" && scopeOpen && !rankOn && "Choose a school above to see its swimmers."}
              {rankOn && rankScope === "event" && !rankEventChoice && "Choose an event above."}
              {rankOn && !rankCount && "Choose how many to show above."}
            </p>
          ) : visibleList.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-2">
              {rankOn ? "No swimmers have FINA points here yet." : "No swimmers found here."}
            </p>
          ) : (
            <div className="max-h-[260px] overflow-y-auto rounded-2xl space-y-1.5 pr-1">
              {visibleList.map((entry, i) => {
                const s = entry.swimmer;
                if (selectedIds.has(s.id)) return null;
                const globalIdx = allSwimmers.findIndex((x) => x.id === s.id);
                const colors = avatarColor(globalIdx);
                const disabled = selectedIds.size >= MAX_COMPARE;
                const rankNum = rankOn ? i + 1 : null;
                return (
                  <button key={s.id} type="button" onClick={() => void toggleSelected(s.id)} disabled={disabled}
                    className="w-full flex items-center gap-3 rounded-2xl p-2.5 text-left transition"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", opacity: disabled ? 0.4 : 1 }}>
                    {rankNum && <span className="w-4 text-xs text-white/35 flex-shrink-0">#{rankNum}</span>}
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: colors.bg, color: colors.text }}>
                      {getInitials(s.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white truncate">{s.name}</p>
                      <p className="text-[10px] text-white/40 truncate">
                        {[s.swim_club, s.school].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {entry.points != null && (
                      <span className="text-xs font-semibold flex-shrink-0" style={{ color: "#FDE68A" }}>
                        {entry.points} pts
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        {selectedIds.size === 0 ? (
          <div className="rounded-3xl p-8 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-2xl mb-2">🏊</p>
            <p className="text-base font-semibold text-white">Select swimmers above</p>
            <p className="mt-1 text-sm text-white/40">Tap up to {MAX_COMPARE} swimmers to rank PBs.</p>
          </div>
        ) : loadingTimes ? (
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
            <p className="text-sm text-white/50">Loading times…</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-[9px] font-medium uppercase tracking-widest text-white/25 mb-2">Stroke</p>
              {strokesWithData.length === 0 ? (
                <p className="text-sm text-white/40">No shared events yet — everyone needs a PB in the same event and course as your swimmer.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {strokesWithData.map((stroke) => (
                    <button key={stroke} type="button"
                      onClick={() => setActiveStroke((prev) => prev === stroke ? null : stroke)}
                      className="flex-1 min-w-[70px] rounded-2xl py-2 text-xs font-semibold transition"
                      style={scopeBtnStyle(activeStroke === stroke)}>
                      {STROKE_LABELS[stroke]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!activeStroke ? (
              strokesWithData.length > 0 && (
                <p className="text-sm text-white/35 text-center py-6">Choose a stroke above to see the ranking.</p>
              )
            ) : (
              <div className="rounded-3xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                {strokeEvents.map((ev, evIdx) => {
                  const ranked = allCompared
                    .map((entry) => ({
                      swimmer: entry.swimmer,
                      ms: entry.pbMap.get(ev.key) ?? null,
                      colorIndex: entry.colorIndex,
                      isMine: entry.isMine,
                    }))
                    .filter((e) => e.ms != null)
                    .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));

                  const rankedWithPos = ranked.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
                  const isLastEvent = evIdx === strokeEvents.length - 1;

                  return (
                    <div key={ev.key}
                      style={{ borderBottom: isLastEvent ? "none" : "1px solid rgba(255,255,255,0.05)", padding: "12px 16px" }}>

                      <p className="text-xs font-medium text-white/45 mb-3">
                        {canonicalEventName(ev.event)
                          .replace("Freestyle", "Free").replace("Backstroke", "Back")
                          .replace("Breaststroke", "Breast").replace("Butterfly", "Fly")}
                        <span className="ml-1 text-white/25">{canonicalCourse(ev.course)}</span>
                      </p>

                      <div className="space-y-2">
                        {rankedWithPos.map((entry) => {
                          const style = RANK_STYLES[entry.rank] ?? RANK_STYLES[5];
                          const colors = avatarColor(entry.colorIndex);
                          return (
                            <div key={entry.swimmer.id}
                              className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                              style={{ background: style.bg, border: `1px solid ${style.border}` }}>
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                                style={{ background: "rgba(0,0,0,0.2)", color: style.numColor }}>
                                {entry.rank}
                              </div>
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                                style={{ background: entry.isMine ? "#D97706" : colors.bg, color: entry.isMine ? "white" : colors.text }}>
                                {getInitials(entry.swimmer.name)}
                              </div>
                              <p className="flex-1 min-w-0 truncate text-sm font-medium"
                                style={{ color: entry.rank === 1 ? "white" : "rgba(255,255,255,0.7)" }}>
                                {shortName(entry.swimmer.name)}
                                {entry.isMine && (
                                  <span className="ml-1.5 text-[10px] font-normal" style={{ color: "#D97706" }}>you</span>
                                )}
                              </p>
                              <p className="text-sm font-bold flex-shrink-0"
                                style={{ color: entry.rank === 1 ? style.numColor : "rgba(255,255,255,0.75)" }}>
                                {formatMs(entry.ms)}
                              </p>
                              {entry.rank > 1 && rankedWithPos[0]?.ms != null && entry.ms != null && (
                                <p className="text-[10px] flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
                                  +{formatMs(entry.ms - rankedWithPos[0].ms)}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
