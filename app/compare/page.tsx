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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_COMPARE = 5;

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

function getInitialFirst(name: string): string {
  return name.trim().split(" ")[0];
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

const RANK_STYLES: Record<number, { bg: string; border: string; numColor: string; label: string }> = {
  1: { bg: "rgba(234,179,8,0.15)",  border: "rgba(234,179,8,0.4)",   numColor: "#FDE68A", label: "1st" },
  2: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)", numColor: "#CBD5E1", label: "2nd" },
  3: { bg: "rgba(180,100,50,0.15)", border: "rgba(180,100,50,0.35)",  numColor: "#FDBA74", label: "3rd" },
  4: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", numColor: "rgba(255,255,255,0.4)", label: "4th" },
  5: { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", numColor: "rgba(255,255,255,0.3)", label: "5th" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const router = useRouter();

  const [allSwimmers, setAllSwimmers] = useState<Swimmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTimes, setLoadingTimes] = useState(false);

  const [mySwimmerId, setMySwimmerId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [timesMap, setTimesMap] = useState<Map<number, SwimTimeRow[]>>(new Map());

  useEffect(() => { void init(); }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    const { data } = await supabase
      .from("swimmers")
      .select("id, name, age, swim_club, group_type, gender")
      .order("group_type", { ascending: false })
      .order("name", { ascending: true });

    const swimmers = (data as Swimmer[]) || [];
    setAllSwimmers(swimmers);

    const primary = swimmers.find((s) => s.group_type === "primary");
    if (primary) {
      setMySwimmerId(primary.id);
      const updated = await loadTimesForSwimmer(primary.id, new Map());
      setTimesMap(updated);
    }
    setLoading(false);
  }

  async function loadTimesForSwimmer(id: number, currentMap: Map<number, SwimTimeRow[]>) {
    if (currentMap.has(id)) return currentMap;
    const { data } = await supabase
      .from("swim_times")
      .select("swimmer_id, event, course, time_ms")
      .eq("swimmer_id", id);
    const updated = new Map(currentMap);
    updated.set(id, (data as SwimTimeRow[]) || []);
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
      const updated = await loadTimesForSwimmer(id, timesMap);
      setTimesMap(updated);
      setLoadingTimes(false);
    }
  }

  async function handleMySwimmerChange(id: number) {
    setMySwimmerId(id);
    setSelectedIds(new Set());
    if (!timesMap.has(id)) {
      setLoadingTimes(true);
      const updated = await loadTimesForSwimmer(id, timesMap);
      setTimesMap(updated);
      setLoadingTimes(false);
    }
  }

  const myPBMap = useMemo(() => {
    if (!mySwimmerId) return new Map<EventKey, number>();
    return getPBMap(timesMap.get(mySwimmerId) ?? []);
  }, [timesMap, mySwimmerId]);

  const selectedPBMaps = useMemo(() => {
    const maps = new Map<number, Map<EventKey, number>>();
    for (const id of selectedIds) {
      maps.set(id, getPBMap(timesMap.get(id) ?? []));
    }
    return maps;
  }, [timesMap, selectedIds]);

  const sharedEvents = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const allKeys = new Set<EventKey>();
    for (const id of selectedIds) {
      const theirMap = selectedPBMaps.get(id) ?? new Map();
      for (const key of theirMap.keys()) {
        if (myPBMap.has(key)) allKeys.add(key);
      }
    }
    return Array.from(allKeys)
      .map((key) => {
        const [event, course] = key.split("|");
        return { key, event, course };
      })
      .sort((a, b) => {
        const sA = STROKE_ORDER.indexOf(getStrokeName(a.event));
        const sB = STROKE_ORDER.indexOf(getStrokeName(b.event));
        if (sA !== sB) return sA - sB;
        return getEventDistance(a.event) - getEventDistance(b.event);
      });
  }, [myPBMap, selectedPBMaps, selectedIds]);

  const groupedEvents = useMemo(() => {
    const grouped = new Map<string, typeof sharedEvents>();
    for (const ev of sharedEvents) {
      const stroke = getStrokeName(ev.event);
      if (!grouped.has(stroke)) grouped.set(stroke, []);
      grouped.get(stroke)!.push(ev);
    }
    return STROKE_ORDER.filter((s) => grouped.has(s)).map((s) => ({ stroke: s, events: grouped.get(s)! }));
  }, [sharedEvents]);

  const primarySwimmers = allSwimmers.filter((s) => s.group_type === "primary");
  const followingSwimmers = allSwimmers.filter((s) => s.group_type === "following");
  const mySwimmer = allSwimmers.find((s) => s.id === mySwimmerId) ?? null;
  const selectedSwimmers = allSwimmers.filter((s) => selectedIds.has(s.id));

  // All swimmers in comparison (my swimmer + selected)
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

  if (loading) {
    return <div className="shell"><div className="container-app"><p className="muted">Loading...</p></div></div>;
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>Natrix</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Compare</h1>
          <p className="mt-1 text-sm text-white/50">Select up to {MAX_COMPARE} swimmers to rank PBs side by side.</p>
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

          {/* Following swimmer list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Compare against</p>
              <p className="text-[10px] text-white/30">{selectedIds.size}/{MAX_COMPARE} selected</p>
            </div>

            {followingSwimmers.length === 0 ? (
              <p className="text-sm text-white/40">No following swimmers yet — add some in Brood.</p>
            ) : (
              <div className="space-y-2">
                {followingSwimmers.map((s, i) => {
                  const selected = selectedIds.has(s.id);
                  const disabled = !selected && selectedIds.size >= MAX_COMPARE;
                  const colors = avatarColor(primarySwimmers.length + i);
                  return (
                    <button key={s.id} type="button" onClick={() => void toggleSelected(s.id)} disabled={disabled}
                      className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition"
                      style={selected
                        ? { background: "rgba(217,119,6,0.12)", border: "1px solid rgba(253,230,138,0.35)" }
                        : disabled
                        ? { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", opacity: 0.4 }
                        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="h-5 w-5 flex-shrink-0 rounded-md flex items-center justify-center"
                        style={selected
                          ? { background: "#D97706", border: "1px solid #D97706" }
                          : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)" }}>
                        {selected && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                        style={{ background: colors.bg, color: colors.text }}>{getInitials(s.name)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white/85">{s.name}</p>
                        <p className="text-xs text-white/35">Age {s.age}{s.swim_club ? ` · ${s.swim_club}` : ""}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── No selection ──────────────────────────────────────────────── */}
        {selectedIds.size === 0 && (
          <div className="rounded-3xl p-8 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-2xl mb-2">🏊</p>
            <p className="text-base font-semibold text-white">Select swimmers above</p>
            <p className="mt-1 text-sm text-white/40">Tap up to {MAX_COMPARE} swimmers to rank PBs.</p>
          </div>
        )}

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loadingTimes && (
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
            <p className="text-sm text-white/50">Loading times…</p>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────────── */}
        {selectedIds.size > 0 && !loadingTimes && (
          <>
            {sharedEvents.length === 0 ? (
              <div className="rounded-3xl p-6 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-base font-semibold text-white">No shared events yet</p>
                <p className="mt-1 text-sm text-white/40">All swimmers need a PB in the same event and course.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupedEvents.map(({ stroke, events }) => (
                  <div key={stroke} className="rounded-3xl overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>

                    <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-white/30">{stroke}</p>

                    {events.map((ev, evIdx) => {
                      // Build ranked list for this event
                      const ranked = allCompared
                        .map((entry) => ({
                          swimmer: entry.swimmer,
                          ms: entry.pbMap.get(ev.key) ?? null,
                          colorIndex: entry.colorIndex,
                          isMine: entry.isMine,
                        }))
                        .filter((e) => e.ms != null)
                        .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));

                      // Add rank position
                      const rankedWithPos = ranked.map((entry, idx) => ({ ...entry, rank: idx + 1 }));

                      const isLastEvent = evIdx === events.length - 1;

                      return (
                        <div key={ev.key}
                          style={{ borderBottom: isLastEvent ? "none" : "1px solid rgba(255,255,255,0.05)", padding: "12px 16px" }}>

                          {/* Event label */}
                          <p className="text-xs font-medium text-white/45 mb-3">
                            {canonicalEventName(ev.event)
                              .replace("Freestyle", "Free").replace("Backstroke", "Back")
                              .replace("Breaststroke", "Breast").replace("Butterfly", "Fly")}
                            <span className="ml-1 text-white/25">{canonicalCourse(ev.course)}</span>
                          </p>

                          {/* Ranked rows */}
                          <div className="space-y-2">
                            {rankedWithPos.map((entry) => {
                              const style = RANK_STYLES[entry.rank] ?? RANK_STYLES[5];
                              const colors = avatarColor(entry.colorIndex);
                              return (
                                <div key={entry.swimmer.id}
                                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                                  style={{ background: style.bg, border: `1px solid ${style.border}` }}>

                                  {/* Rank number */}
                                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                                    style={{ background: "rgba(0,0,0,0.2)", color: style.numColor }}>
                                    {entry.rank}
                                  </div>

                                  {/* Avatar */}
                                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                                    style={{ background: entry.isMine ? "#D97706" : colors.bg, color: entry.isMine ? "white" : colors.text }}>
                                    {getInitials(entry.swimmer.name)}
                                  </div>

                                  {/* Name */}
                                  <p className="flex-1 min-w-0 truncate text-sm font-medium"
                                    style={{ color: entry.rank === 1 ? "white" : "rgba(255,255,255,0.7)" }}>
                                    {shortName(entry.swimmer.name)}
                                    {entry.isMine && (
                                      <span className="ml-1.5 text-[10px] font-normal" style={{ color: "#D97706" }}>you</span>
                                    )}
                                  </p>

                                  {/* Time */}
                                  <p className="text-sm font-bold flex-shrink-0"
                                    style={{ color: entry.rank === 1 ? style.numColor : "rgba(255,255,255,0.75)" }}>
                                    {formatMs(entry.ms)}
                                  </p>

                                  {/* Gap from 1st */}
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
                ))}
              </div>
            )}
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}