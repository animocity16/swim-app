"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { canonicalEventName } from "@/lib/events";

type StandardSet = {
  id: number;
  name: string;
  type: "UPGRADING" | "IMPORTANT_MEET";
};

type StandardItem = {
  id: number;
  standard_set_id: number;
  event: string;
  course: string;
  qualifying_time_ms: number;
  gender: string | null;
  min_age: number | null;
  max_age: number | null;
};

type SwimTime = {
  event: string;
  course: string;
  time_ms: number;
};

type Props = {
  swimmerId: number;
  swimmerAge: number;
  swimmerGender: string | null | undefined;
  swimmerSquad?: string | null;
};

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

// Always a plain "X.XXs" seconds value — used for the gap/away label so it
// reads as a quick, mobile-friendly delta rather than a race-clock time.
function formatGapSeconds(ms: number): string {
  return (ms / 1000).toFixed(2);
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

type StrokeKey = "free" | "back" | "breast" | "fly" | "im";

const STROKES: Record<StrokeKey, { label: string; icon: string; color: string }> = {
  free: { label: "Freestyle", icon: "/icons/strokes/free.png", color: "#38BDF8" },
  back: { label: "Backstroke", icon: "/icons/strokes/back.png", color: "#A78BFA" },
  breast: { label: "Breaststroke", icon: "/icons/strokes/breast.png", color: "#34D399" },
  fly: { label: "Butterfly", icon: "/icons/strokes/fly.png", color: "#FB923C" },
  im: { label: "IM", icon: "/icons/strokes/im.png", color: "#F472B6" },
};

function getStrokeKey(event: string): StrokeKey {
  const e = event.toLowerCase();
  if (e.includes("breast")) return "breast";
  if (e.includes("back")) return "back";
  if (e.includes("fly") || e.includes("butterfly")) return "fly";
  if (e.includes("im") || e.includes("medley")) return "im";
  return "free";
}

function eventDistance(event: string): number {
  return Number(event.match(/\d+/)?.[0] ?? 0);
}

function QualProgressRing({ qualified, total }: { qualified: number; total: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? qualified / total : 0;
  const dash = pct * circ;
  const isComplete = qualified === total && total > 0;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="22" cy="22" r={r} fill="none"
        stroke={isComplete ? "#6EE7B7" : "#D97706"}
        strokeWidth="4"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
      <text x="22" y="27" textAnchor="middle" fontSize="10" fontWeight="700"
        fill={isComplete ? "#6EE7B7" : "#FDE68A"}>
        {qualified}/{total}
      </text>
    </svg>
  );
}

export default function StandardsTab({ swimmerId, swimmerAge, swimmerGender, swimmerSquad }: Props) {
  const [sets, setSets] = useState<StandardSet[]>([]);
  const [items, setItems] = useState<StandardItem[]>([]);
  const [pbMap, setPbMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedSet, setExpandedSet] = useState<number | null>(null);
  const [expandedStroke, setExpandedStroke] = useState<Record<string, boolean>>({});

  useEffect(() => { void load(); }, [swimmerId]);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [setsResult, timesResult] = await Promise.all([
      supabase
        .from("standard_sets")
        .select("id, name, type")
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order("created_at", { ascending: true }),
      supabase
        .from("swim_times")
        .select("event, course, time_ms")
        .eq("swimmer_id", swimmerId),
    ]);

    const loadedSets = (setsResult.data ?? []) as StandardSet[];
    setSets(loadedSets);

    const times = (timesResult.data ?? []) as SwimTime[];
    const map = new Map<string, number>();
    for (const t of times) {
      const key = `${canonicalEventName(t.event)}|${t.course}`;
      const existing = map.get(key);
      if (!existing || t.time_ms < existing) map.set(key, t.time_ms);
    }
    setPbMap(map);

    if (loadedSets.length > 0) {
      const setIds = loadedSets.map((s) => s.id);
      const { data: itemsData } = await supabase
        .from("standard_items")
        .select("id, standard_set_id, event, course, qualifying_time_ms, gender, min_age, max_age")
        .in("standard_set_id", setIds);
      setItems((itemsData ?? []) as StandardItem[]);
    }

    setLoading(false);
  }

  function relevantItems(setId: number): StandardItem[] {
    return items.filter((item) => {
      if (item.standard_set_id !== setId) return false;
      if (item.gender && swimmerGender && item.gender.toLowerCase() !== swimmerGender.toLowerCase()) return false;
      if (item.min_age !== null && swimmerAge < item.min_age) return false;
      if (item.max_age !== null && swimmerAge > item.max_age) return false;
      return true;
    });
  }

  function computeStats(setId: number) {
    const relevant = relevantItems(setId);
    const allItems = items.filter((i) => i.standard_set_id === setId);
    const displayItems = relevant.length > 0 ? relevant : allItems;
    let qualified = 0, attempted = 0;
    for (const item of displayItems) {
      const pb = pbMap.get(`${canonicalEventName(item.event)}|${item.course}`);
      if (pb !== undefined) {
        attempted++;
        if (pb <= item.qualifying_time_ms) qualified++;
      }
    }
    return { displayItems, qualified, attempted, total: displayItems.length };
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 rounded-3xl animate-pulse"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
        ))}
      </div>
    );
  }

  if (sets.length === 0) {
    return (
      <div className="rounded-3xl p-6 text-center"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-3xl mb-3">⭐</p>
        <p className="text-sm font-semibold text-white mb-1">No standards yet</p>
        <p className="text-xs text-white/40 mb-4">Add upgrading times or meet qualifying standards to track progress.</p>
        <Link href="/standards"
          className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-semibold"
          style={{ background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.3)", color: "#FDE68A" }}>
          Go to Standards →
        </Link>
      </div>
    );
  }

  // Show only the next upgrading level above the swimmer's current squad
  const upgradingSets = sets.filter((s) => s.type === "UPGRADING");
  const meetSets = sets.filter((s) => s.type === "IMPORTANT_MEET");

  let nextUpgradingSet: StandardSet | undefined;
  if (swimmerSquad) {
    const squadLower = swimmerSquad.toLowerCase();
    const currentLevelIdx = upgradingSets.findIndex((s) => s.name.toLowerCase().includes(squadLower));
    if (currentLevelIdx !== -1 && currentLevelIdx + 1 < upgradingSets.length) {
      nextUpgradingSet = upgradingSets[currentLevelIdx + 1];
    } else if (currentLevelIdx === -1) {
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

  const visibleSets: StandardSet[] = [
    ...(nextUpgradingSet ? [nextUpgradingSet] : []),
    ...meetSets,
  ];

  return (
    <div className="space-y-3">

      {swimmerSquad && nextUpgradingSet && (
        <p className="px-1 text-[10px] font-medium uppercase tracking-widest text-white/30">
          Next target for <span className="text-white/50">{swimmerSquad} Squad</span>
        </p>
      )}

      {!nextUpgradingSet && upgradingSets.length > 0 && (
        <div
          className="rounded-3xl p-5 text-center"
          style={{
            background: "rgba(255,255,255,0.09)",
            border: "1px solid rgba(110,231,183,0.22)",
          }}
        >
          <p className="text-sm font-semibold" style={{ color: "#6EE7B7" }}>🏆 Top of the ladder!</p>
          <p className="mt-1 text-xs text-white/45">All upgrading standards completed.</p>
        </div>
      )}

      {visibleSets.map((set) => {
        const { displayItems, qualified, attempted, total } = computeStats(set.id);
        const isExpanded = expandedSet === set.id;
        const isComplete = qualified === total && total > 0;

        const grouped = (Object.keys(STROKES) as StrokeKey[])
          .map((key) => {
            const strokeItems = displayItems
              .filter((item) => getStrokeKey(item.event) === key)
              .slice()
              .sort((a, b) => {
                const aPb = pbMap.get(`${canonicalEventName(a.event)}|${a.course}`);
                const bPb = pbMap.get(`${canonicalEventName(b.event)}|${b.course}`);

                if (aPb !== undefined && bPb === undefined) return -1;
                if (aPb === undefined && bPb !== undefined) return 1;

                if (aPb !== undefined && bPb !== undefined) {
                  const aQualified = aPb <= a.qualifying_time_ms;
                  const bQualified = bPb <= b.qualifying_time_ms;
                  if (aQualified !== bQualified) return aQualified ? -1 : 1;
                  const gapA = aPb - a.qualifying_time_ms;
                  const gapB = bPb - b.qualifying_time_ms;
                  if (gapA !== gapB) return gapA - gapB;
                }

                const dist = eventDistance(a.event) - eventDistance(b.event);
                if (dist !== 0) return dist;
                return a.course.localeCompare(b.course);
              });

            const strokeQualified = strokeItems.filter((item) => {
              const pb = pbMap.get(`${canonicalEventName(item.event)}|${item.course}`);
              return pb !== undefined && pb <= item.qualifying_time_ms;
            }).length;

            const strokeAttempted = strokeItems.filter((item) =>
              pbMap.get(`${canonicalEventName(item.event)}|${item.course}`) !== undefined
            ).length;

            return {
              key,
              meta: STROKES[key],
              items: strokeItems,
              qualified: strokeQualified,
              attempted: strokeAttempted,
            };
          })
          .filter((group) => group.items.length > 0);

        return (
          <div key={set.id}>
            <button
              type="button"
              onClick={() => setExpandedSet(isExpanded ? null : set.id)}
              className="w-full rounded-3xl p-4 text-left transition"
              style={{
                background: isComplete
                  ? "rgba(255,255,255,0.11)"
                  : "rgba(255,255,255,0.085)",
                border: isComplete
                  ? "1px solid rgba(110,231,183,0.25)"
                  : "1px solid rgba(255,255,255,0.14)",
                boxShadow: isExpanded ? "0 18px 42px rgba(0,0,0,0.12)" : "none",
              }}
            >
              <div className="flex items-center gap-3">
                <QualProgressRing qualified={qualified} total={total} />

                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 truncate text-[10px] font-medium uppercase tracking-widest text-white/35">
                    {set.type === "UPGRADING" ? "Upgrading" : "Meet Standard"}
                  </p>
                  <p className="truncate text-base font-bold text-white">{set.name}</p>

                  {total === 0 ? (
                    <p className="mt-0.5 text-xs text-white/30">No matching events</p>
                  ) : isComplete ? (
                    <p className="mt-0.5 text-xs" style={{ color: "#6EE7B7" }}>
                      All {total} events qualified 🎉
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-white/45">
                      {qualified} qualified · {attempted - qualified} in progress · {total - attempted} not yet swum
                    </p>
                  )}
                </div>

                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="flex-shrink-0 transition-transform"
                  style={{
                    color: "rgba(255,255,255,0.28)",
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                >
                  <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {isExpanded && displayItems.length > 0 && (
              <div className="mt-3 space-y-3">
                {grouped.map((group) => {
                  const strokeKey = `${set.id}:${group.key}`;
                  const strokeOpen = !!expandedStroke[strokeKey];

                  return (
                    <div
                      key={group.key}
                      className="overflow-hidden rounded-3xl"
                      style={{
                        background: strokeOpen
                          ? "rgba(255,255,255,0.095)"
                          : "rgba(255,255,255,0.055)",
                        border: strokeOpen
                          ? "1px solid rgba(255,255,255,0.16)"
                          : "1px solid rgba(255,255,255,0.09)",
                        boxShadow: strokeOpen ? "0 16px 38px rgba(0,0,0,0.10)" : "none",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedStroke((prev) => ({
                            ...prev,
                            [strokeKey]: !prev[strokeKey],
                          }))
                        }
                        className="flex w-full items-center gap-3 px-4 py-4 text-left"
                      >
                        <img
                          src={group.meta.icon}
                          alt=""
                          className="h-11 w-11 flex-shrink-0 rounded-xl object-cover"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white">{group.meta.label}</p>
                          <p className="mt-0.5 text-xs text-white/35">
                            {group.items.length} event{group.items.length === 1 ? "" : "s"} · {group.attempted} swum
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wide text-white/25">Qualified</p>
                          <p
                            className="mt-0.5 text-sm font-bold"
                            style={{ color: group.qualified > 0 ? "#6EE7B7" : "rgba(255,255,255,0.48)" }}
                          >
                            {group.qualified}/{group.items.length}
                          </p>
                        </div>

                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 16 16"
                          fill="none"
                          className="flex-shrink-0 transition-transform"
                          style={{
                            color: "rgba(255,255,255,0.28)",
                            transform: strokeOpen ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                        >
                          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {strokeOpen && (
                        <div
                          style={{
                            borderTop: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.025)",
                          }}
                        >
                          {group.items.map((item, idx) => {
                            const pb = pbMap.get(`${canonicalEventName(item.event)}|${item.course}`);
                            const hasTime = pb !== undefined;
                            const hasQual = hasTime && pb <= item.qualifying_time_ms;
                            const gapMs = hasTime && !hasQual ? pb - item.qualifying_time_ms : null;
                            const strokeColor = getStrokeColor(item.event);

                            return (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 px-4 py-3.5"
                                style={{
                                  borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                                }}
                              >
                                <div
                                  className="h-2 w-2 flex-shrink-0 rounded-full"
                                  style={{
                                    background: hasQual
                                      ? "#6EE7B7"
                                      : hasTime
                                        ? "#D97706"
                                        : "rgba(255,255,255,0.16)",
                                  }}
                                />

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold" style={{ color: strokeColor }}>
                                    {item.event}
                                  </p>
                                  <p className="text-[10px] text-white/30">{item.course}</p>
                                </div>

                                <div className="flex-shrink-0 text-right">
                                  <p className="mb-0.5 text-[10px] text-white/28">Standard</p>
                                  <p className="text-sm font-semibold text-white/55">
                                    {formatMs(item.qualifying_time_ms)}
                                  </p>
                                </div>

                                <div className="w-20 flex-shrink-0 text-right">
                                  {hasQual && pb !== undefined ? (
                                    <>
                                      <p className="mb-0.5 text-[10px] font-semibold" style={{ color: "#6EE7B7" }}>
                                        ✓ Qualified
                                      </p>
                                      <p className="text-sm font-bold" style={{ color: "#6EE7B7" }}>
                                        {formatMs(pb)}
                                      </p>
                                    </>
                                  ) : hasTime && pb !== undefined ? (
                                    <>
                                      <p className="mb-0.5 text-[10px] text-white/28">PB</p>
                                      <p className="text-sm font-bold text-white">{formatMs(pb)}</p>
                                      {gapMs !== null && (
                                        <p className="mt-0.5 text-[10px]" style={{ color: "#D97706" }}>
                                          {formatGapSeconds(gapMs)}s away
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-[10px] text-white/25">Not swum</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="px-1 pt-1">
                  <Link
                    href={`/standards/${set.id}`}
                    className="text-[10px] font-semibold"
                    style={{ color: "rgba(253,230,138,0.58)" }}
                  >
                    Edit this standard set →
                  </Link>
                </div>
              </div>
            )}

            {isExpanded && displayItems.length === 0 && (
              <div
                className="mt-3 rounded-3xl p-4 text-center"
                style={{
                  border: "1px solid rgba(255,255,255,0.09)",
                  background: "rgba(255,255,255,0.055)",
                }}
              >
                <p className="text-xs text-white/35">
                  No events in this standard set match this swimmer&apos;s age / gender.
                </p>
                <Link
                  href={`/standards/${set.id}`}
                  className="mt-2 block text-[10px] font-semibold"
                  style={{ color: "rgba(253,230,138,0.58)" }}
                >
                  Edit standard set →
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
