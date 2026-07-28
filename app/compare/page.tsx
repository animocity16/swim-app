"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { canonicalEventName, canonicalCourse, eventKey } from "@/lib/events";

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
};

type EventKey = string;
type Scope = "all" | "club" | "school";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_COMPARE = 10;
const RANK_COUNTS = [3, 5, 10, 20];

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

  // Rank: independent toggle, combinable with Scope
  const [rankOn, setRankOn] = useState(false);
  const [rankCount, setRankCount] = useState<number | null>(null);
  const [rankedIds, setRankedIds] = useState<number[] | null>(null);

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
      .select("swimmer_id, event, course, time_ms")
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
      if (!next) { setRankCount(null); setRankedIds(null); }
      return next;
    });
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const primarySwimmers = allSwimmers.filter((s) => s.group_type === "primary");
  const followingSwimmers = allSwimmers.filter((s) => s.group_type === "following");
  const mySwimmer = allSwimmers.find((s) => s.id === mySwimmerId) ?? null;
  const selectedSwimmers = allSwimmers.filter((s) => selectedIds.has(s.id));

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

  // The base candidate list: null means "not resolvable yet" (e.g. Club chosen
  // but no specific club picked). Scope defaults to "all" whenever it isn't
  // specifically an open Club/School filter — this is what lets Rank work on
  // its own without Scope being touched at all.
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

  // Bulk-load times for the whole base list once Rank needs to compute an
  // overall-skill ordering across it — this is a different loading path from
  // the lazy per-swimmer fetch used when just browsing/selecting manually.
  useEffect(() => {
    if (!rankOn || !rankCount || !baseList) { setRankedIds(null); return; }

    let cancelled = false;
    async function computeRanking() {
      setRankLoading(true);
      const ids = baseList!.map((s) => s.id);
      const updated = await loadTimesForIds(ids, timesMap);
      if (cancelled) return;
      setTimesMap(updated);

      // Average rank across every event each swimmer has a PB in, among this candidate group
      const pbMaps = new Map<number, Map<EventKey, number>>();
      for (const id of ids) pbMaps.set(id, getPBMap(updated.get(id) ?? []));

      const eventKeys = new Set<EventKey>();
      for (const map of pbMaps.values()) for (const key of map.keys()) eventKeys.add(key);

      const rankSum = new Map<number, number>();
      const rankCountMap = new Map<number, number>();
      for (const id of ids) { rankSum.set(id, 0); rankCountMap.set(id, 0); }

      for (const key of eventKeys) {
        const entries = ids
          .map((id) => ({ id, ms: pbMaps.get(id)?.get(key) }))
          .filter((e) => e.ms != null) as { id: number; ms: number }[];
        entries.sort((a, b) => a.ms - b.ms);
        entries.forEach((e, i) => {
          rankSum.set(e.id, (rankSum.get(e.id) ?? 0) + (i + 1));
          rankCountMap.set(e.id, (rankCountMap.get(e.id) ?? 0) + 1);
        });
      }

      const ranked = ids
        .filter((id) => (rankCountMap.get(id) ?? 0) > 0)
        .sort((a, b) => {
          const avgA = (rankSum.get(a) ?? 0) / (rankCountMap.get(a) ?? 1);
          const avgB = (rankSum.get(b) ?? 0) / (rankCountMap.get(b) ?? 1);
          return avgA - avgB;
        })
        .slice(0, rankCount ?? 0);

      if (!cancelled) { setRankedIds(ranked); setRankLoading(false); }
    }

    void computeRanking();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankOn, rankCount, baseList]);

  // The list of swimmers actually shown for tapping/selecting right now
  const visibleList = useMemo((): Swimmer[] | null => {
    if (!anythingActive) return null;
    if (baseList === null) return null;
    if (rankOn) {
      if (!rankCount) return null;
      if (rankedIds === null) return null;
      return rankedIds
        .map((id) => baseList.find((s) => s.id === id))
        .filter((s): s is Swimmer => !!s);
    }
    return baseList;
  }, [anythingActive, baseList, rankOn, rankCount, rankedIds]);

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

  // Only the events for the currently chosen stroke — results stay hidden
  // until a stroke is picked, instead of dumping every shared event at once.
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

          {/* Rank */}
          <div>
            <p className="text-[9px] font-medium uppercase tracking-widest text-white/25 mb-2">Sort</p>
            <button type="button" onClick={toggleRank}
              className="w-full rounded-2xl py-2 text-xs font-semibold transition"
              style={scopeBtnStyle(rankOn)}>
              Rank by overall skill
            </button>

            {rankOn && (
              <div className="flex flex-wrap gap-2 mt-2">
                {RANK_COUNTS.map((n) => (
                  <button key={n} type="button" onClick={() => setRankCount(n)}
                    className={chipBase} style={rankCount === n ? chipActive : chipInactive}>
                    Top {n}
                  </button>
                ))}
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
                {selectedSwimmers.map((s, i) => {
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
          ) : rankLoading ? (
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
              <p className="text-sm text-white/50">Ranking swimmers…</p>
            </div>
          ) : visibleList === null ? (
            <p className="text-sm text-white/35 text-center py-2">
              {scope === "club" && scopeOpen && "Choose a club above to see its swimmers."}
              {scope === "school" && scopeOpen && "Choose a school above to see its swimmers."}
              {rankOn && !rankCount && "Choose how many to show above."}
            </p>
          ) : visibleList.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-2">No swimmers found here.</p>
          ) : (
            <div className="max-h-[260px] overflow-y-auto rounded-2xl space-y-1.5 pr-1">
              {visibleList.map((s, i) => {
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
