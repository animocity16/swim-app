// app/demo/compare/page.tsx
"use client";

import { useMemo, useState } from "react";
import {
  DEMO_SWIMMERS,
  DEMO_TIMES,
  DEMO_PRIMARY_SWIMMER_ID,
  formatMs,
  getInitials,
  type DemoSwimmer,
} from "@/lib/demoData";

type EventKey = string;
type Scope = "all" | "club" | "school";

const MAX_COMPARE = 10;
const RANK_COUNTS = [3, 5, 10];

const AVATAR_COLORS = [
  { bg: "#92400E", text: "#FDE68A" },
  { bg: "#1E3A5F", text: "#93C5FD" },
  { bg: "#164E3A", text: "#6EE7B7" },
  { bg: "#3B0764", text: "#E9D5FF" },
  { bg: "#78350F", text: "#FCD34D" },
  { bg: "#1E1B4B", text: "#A5B4FC" },
];
function avatarColor(i: number) {
  return AVATAR_COLORS[i % AVATAR_COLORS.length];
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
  if (e.includes("breast")) return "Breaststroke";
  if (e.includes("back")) return "Backstroke";
  if (e.includes("fly")) return "Butterfly";
  if (e.includes("free")) return "Freestyle";
  if (e.includes("im")) return "IM";
  return "Other";
}

function getEventDistance(event: string): number {
  const match = event.match(/\d+/);
  return match ? Number(match[0]) : 9999;
}

function keyOf(event: string, course: string) {
  return `${event}|${course}`;
}

function getPBMap(swimmerId: number): Map<EventKey, number> {
  const map = new Map<EventKey, number>();
  for (const row of DEMO_TIMES) {
    if (row.swimmer_id !== swimmerId) continue;
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

const RANK_STYLES: Record<number, { bg: string; border: string; numColor: string }> = {
  1: { bg: "rgba(234,179,8,0.15)",   border: "rgba(234,179,8,0.4)",    numColor: "#FDE68A" },
  2: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)",  numColor: "#CBD5E1" },
  3: { bg: "rgba(180,100,50,0.15)",  border: "rgba(180,100,50,0.35)",  numColor: "#FDBA74" },
  4: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)",  numColor: "rgba(255,255,255,0.4)" },
  5: { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", numColor: "rgba(255,255,255,0.3)" },
};

export default function DemoComparePage() {
  const mySwimmerId = DEMO_PRIMARY_SWIMMER_ID;
  const mySwimmer = DEMO_SWIMMERS.find((s) => s.id === mySwimmerId)!;
  const followingSwimmers = DEMO_SWIMMERS.filter((s) => s.group_type === "following");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [scope, setScope] = useState<Scope | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [clubValue, setClubValue] = useState<string | null>(null);
  const [schoolValue, setSchoolValue] = useState<string | null>(null);

  const [rankOn, setRankOn] = useState(false);
  const [rankCount, setRankCount] = useState<number | null>(null);

  const [activeStroke, setActiveStroke] = useState<string | null>(null);

  function toggleScope(newScope: Scope) {
    if (scope === newScope && scopeOpen) setScopeOpen(false);
    else { setScope(newScope); setScopeOpen(true); }
  }

  function toggleRank() {
    setRankOn((prev) => {
      const next = !prev;
      if (!next) setRankCount(null);
      return next;
    });
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      if (next.size >= MAX_COMPARE) return prev;
      next.add(id);
      return next;
    });
  }

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

  const baseList = useMemo((): DemoSwimmer[] | null => {
    if (scope === "club" && scopeOpen) {
      return clubValue ? followingSwimmers.filter((s) => s.swim_club?.trim() === clubValue) : null;
    }
    if (scope === "school" && scopeOpen) {
      return schoolValue ? followingSwimmers.filter((s) => s.school?.trim() === schoolValue) : null;
    }
    return followingSwimmers;
  }, [scope, scopeOpen, clubValue, schoolValue, followingSwimmers]);

  const anythingActive = (scope !== null && scopeOpen) || rankOn;

  const rankedIds = useMemo((): number[] | null => {
    if (!rankOn || !rankCount || !baseList) return null;
    const ids = baseList.map((s) => s.id);
    const pbMaps = new Map<number, Map<EventKey, number>>();
    for (const id of ids) pbMaps.set(id, getPBMap(id));

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

    return ids
      .filter((id) => (rankCountMap.get(id) ?? 0) > 0)
      .sort((a, b) => {
        const avgA = (rankSum.get(a) ?? 0) / (rankCountMap.get(a) ?? 1);
        const avgB = (rankSum.get(b) ?? 0) / (rankCountMap.get(b) ?? 1);
        return avgA - avgB;
      })
      .slice(0, rankCount);
  }, [rankOn, rankCount, baseList]);

  const visibleList = useMemo((): DemoSwimmer[] | null => {
    if (!anythingActive) return null;
    if (baseList === null) return null;
    if (rankOn) {
      if (!rankCount || rankedIds === null) return null;
      return rankedIds.map((id) => baseList.find((s) => s.id === id)).filter((s): s is DemoSwimmer => !!s);
    }
    return baseList;
  }, [anythingActive, baseList, rankOn, rankCount, rankedIds]);

  const myPBMap = useMemo(() => getPBMap(mySwimmerId), [mySwimmerId]);
  const selectedSwimmers = DEMO_SWIMMERS.filter((s) => selectedIds.has(s.id));

  const sharedEvents = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const allKeys = new Set<EventKey>();
    for (const id of selectedIds) {
      const theirMap = getPBMap(id);
      for (const key of theirMap.keys()) if (myPBMap.has(key)) allKeys.add(key);
    }
    return Array.from(allKeys)
      .map((key) => { const [event, course] = key.split("|"); return { key, event, course }; })
      .sort((a, b) => getEventDistance(a.event) - getEventDistance(b.event));
  }, [myPBMap, selectedIds]);

  const strokeEvents = useMemo(() => {
    if (!activeStroke) return [];
    return sharedEvents.filter((ev) => getStrokeName(ev.event) === activeStroke);
  }, [sharedEvents, activeStroke]);

  const strokesWithData = useMemo(() => {
    const set = new Set(sharedEvents.map((ev) => getStrokeName(ev.event)));
    return STROKE_ORDER.filter((s) => set.has(s));
  }, [sharedEvents]);

  const allCompared = useMemo(() => [
    { swimmer: mySwimmer, pbMap: myPBMap, colorIndex: 0, isMine: true },
    ...selectedSwimmers.map((s, i) => ({
      swimmer: s,
      pbMap: getPBMap(s.id),
      colorIndex: i + 1,
      isMine: false,
    })),
  ], [mySwimmer, myPBMap, selectedSwimmers]);

  const chipBase = "rounded-2xl px-3 py-1.5 text-xs font-semibold transition";
  const chipActive = { background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.35)", color: "#FDE68A" };
  const chipInactive = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" };
  const scopeBtnStyle = (active: boolean) => active ? chipActive : chipInactive;

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        <div className="pt-2">
          <h1 className="text-2xl font-bold text-white">Compare</h1>
          <p className="mt-1 text-sm text-white/50">Tap a filter to open its list. Tap again to close it.</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">

          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
              style={{ background: "#92400E", color: "#FDE68A" }}>{getInitials(mySwimmer.name)}</span>
            <p className="text-sm font-medium text-white">{mySwimmer.name.split(" ")[0]} <span className="text-white/40 font-normal">(my swimmer)</span></p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs font-bold text-white/25 uppercase tracking-widest">vs</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

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
                {clubOptions.map((club) => (
                  <button key={club} type="button" onClick={() => setClubValue((p) => p === club ? null : club)}
                    className={chipBase} style={clubValue === club ? chipActive : chipInactive}>{club}</button>
                ))}
              </div>
            )}
            {scope === "school" && scopeOpen && (
              <div className="flex flex-wrap gap-2 mt-2">
                {schoolOptions.map((school) => (
                  <button key={school} type="button" onClick={() => setSchoolValue((p) => p === school ? null : school)}
                    className={chipBase} style={schoolValue === school ? chipActive : chipInactive}>{school}</button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[9px] font-medium uppercase tracking-widest text-white/25 mb-2">Sort</p>
            <button type="button" onClick={toggleRank}
              className="w-full rounded-2xl py-2 text-xs font-semibold transition" style={scopeBtnStyle(rankOn)}>
              Rank by overall skill
            </button>
            {rankOn && (
              <div className="flex flex-wrap gap-2 mt-2">
                {RANK_COUNTS.map((n) => (
                  <button key={n} type="button" onClick={() => setRankCount(n)}
                    className={chipBase} style={rankCount === n ? chipActive : chipInactive}>Top {n}</button>
                ))}
              </div>
            )}
          </div>

          {selectedSwimmers.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 mb-2">
                Selected ({selectedIds.size}/{MAX_COMPARE})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedSwimmers.map((s) => {
                  const idx = DEMO_SWIMMERS.findIndex((x) => x.id === s.id);
                  const colors = avatarColor(idx);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleSelected(s.id)}
                      className="flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-medium transition"
                      style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", color: "white" }}>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                        style={{ background: colors.bg, color: colors.text }}>{getInitials(s.name)}</span>
                      {shortName(s.name)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!anythingActive ? (
            <p className="text-sm text-white/35 text-center py-2">Tap Scope or Rank above to see swimmers.</p>
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
                const idx = DEMO_SWIMMERS.findIndex((x) => x.id === s.id);
                const colors = avatarColor(idx);
                const disabled = selectedIds.size >= MAX_COMPARE;
                const rankNum = rankOn ? i + 1 : null;
                return (
                  <button key={s.id} type="button" onClick={() => toggleSelected(s.id)} disabled={disabled}
                    className="w-full flex items-center gap-3 rounded-2xl p-2.5 text-left transition"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", opacity: disabled ? 0.4 : 1 }}>
                    {rankNum && <span className="w-4 text-xs text-white/35 flex-shrink-0">#{rankNum}</span>}
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: colors.bg, color: colors.text }}>{getInitials(s.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white truncate">{s.name}</p>
                      <p className="text-[10px] text-white/40 truncate">{[s.swim_club, s.school].filter(Boolean).join(" · ")}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedIds.size === 0 ? (
          <div className="rounded-3xl p-8 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-2xl mb-2">🏊</p>
            <p className="text-base font-semibold text-white">Select swimmers above</p>
            <p className="mt-1 text-sm text-white/40">Tap up to {MAX_COMPARE} swimmers to rank PBs.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-[9px] font-medium uppercase tracking-widest text-white/25 mb-2">Stroke</p>
              {strokesWithData.length === 0 ? (
                <p className="text-sm text-white/40">No shared events yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {strokesWithData.map((stroke) => (
                    <button key={stroke} type="button"
                      onClick={() => setActiveStroke((p) => p === stroke ? null : stroke)}
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
                    .map((entry) => ({ swimmer: entry.swimmer, ms: entry.pbMap.get(ev.key) ?? null, colorIndex: entry.colorIndex, isMine: entry.isMine }))
                    .filter((e) => e.ms != null)
                    .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
                  const rankedWithPos = ranked.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
                  const isLastEvent = evIdx === strokeEvents.length - 1;

                  return (
                    <div key={ev.key} style={{ borderBottom: isLastEvent ? "none" : "1px solid rgba(255,255,255,0.05)", padding: "12px 16px" }}>
                      <p className="text-xs font-medium text-white/45 mb-3">
                        {ev.event}<span className="ml-1 text-white/25">{ev.course}</span>
                      </p>
                      <div className="space-y-2">
                        {rankedWithPos.map((entry) => {
                          const style = RANK_STYLES[entry.rank] ?? RANK_STYLES[5];
                          const idx = DEMO_SWIMMERS.findIndex((x) => x.id === entry.swimmer.id);
                          const colors = avatarColor(idx);
                          return (
                            <div key={entry.swimmer.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                              style={{ background: style.bg, border: `1px solid ${style.border}` }}>
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                                style={{ background: "rgba(0,0,0,0.2)", color: style.numColor }}>{entry.rank}</div>
                              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                                style={{ background: entry.isMine ? "#D97706" : colors.bg, color: entry.isMine ? "white" : colors.text }}>
                                {getInitials(entry.swimmer.name)}
                              </div>
                              <p className="flex-1 min-w-0 truncate text-sm font-medium"
                                style={{ color: entry.rank === 1 ? "white" : "rgba(255,255,255,0.7)" }}>
                                {shortName(entry.swimmer.name)}
                                {entry.isMine && <span className="ml-1.5 text-[10px] font-normal" style={{ color: "#D97706" }}>you</span>}
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
