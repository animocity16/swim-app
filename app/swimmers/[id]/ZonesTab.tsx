"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { canonicalCourse, canonicalEventName } from "@/lib/events";

type Props = {
  swimmerId: number;
  swimmerName?: string;
};

type SwimTimeRow = {
  id: number;
  swimmer_id: number;
  event: string;
  course: string;
  time_ms: number;
  swam_at?: string | null;
  meet_name?: string | null;
};

type Pb = {
  seconds: number;
  swamAt: string | null;
  meetName: string | null;
};

type PbByDistance = Partial<Record<number, Pb>>;

type Method = "exact" | "estimate" | "rough";

type StrokeKey = "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "im";

type StrokeInfo = {
  key: StrokeKey;
  label: string;
  color: string;
  distances: number[];
  testHint: string; // the pair of swims that gives the best result
};

type Zone = {
  key: string;
  name: string;
  purpose: string;
  color: string;
  slowMult: number | null; // null = no slow limit
  fastMult: number | null; // null = no fast limit
};

// ─── Settings ─────────────────────────────────────────────────────────────────

const STROKES: StrokeInfo[] = [
  { key: "freestyle", label: "Free", color: "#38BDF8", distances: [50, 100, 200, 400], testHint: "200m and 400m" },
  { key: "backstroke", label: "Back", color: "#A78BFA", distances: [50, 100, 200], testHint: "100m and 200m" },
  { key: "breaststroke", label: "Breast", color: "#34D399", distances: [50, 100, 200], testHint: "100m and 200m" },
  { key: "butterfly", label: "Fly", color: "#FB923C", distances: [50, 100, 200], testHint: "100m and 200m" },
  { key: "im", label: "IM", color: "#F472B6", distances: [100, 200, 400], testHint: "200m and 400m" },
];

const COURSE_ORDER = ["LCM", "SCM", "SCY"];
const PACE_UNITS = [100, 50, 25] as const;

// Each zone is a band around threshold pace. Multipliers scale with the swimmer's
// own speed, so a young swimmer and an elite swimmer both get sensible gaps.
const ZONES: Zone[] = [
  { key: "Z1", name: "Recovery", purpose: "Easy swimming, warm-up, cool-down", color: "#38BDF8", slowMult: null, fastMult: 1.125 },
  { key: "Z2", name: "Aerobic base", purpose: "Long steady sets that build endurance", color: "#34D399", slowMult: 1.125, fastMult: 1.075 },
  { key: "Z3", name: "Tempo", purpose: "Strong but controlled, short sentences only", color: "#A78BFA", slowMult: 1.075, fastMult: 1.025 },
  { key: "Z4", name: "Threshold", purpose: "Hard but sustainable, e.g. 8 x 100", color: "#FB923C", slowMult: 1.025, fastMult: 0.9875 },
  { key: "Z5", name: "Race pace", purpose: "Fast reps with rest between", color: "#F472B6", slowMult: 0.9875, fastMult: 0.95 },
  { key: "Z6", name: "Sprint", purpose: "Max effort, short reps, long rest", color: "#F87171", slowMult: 0.95, fastMult: null },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function strokeOf(event: string): StrokeKey | null {
  const name = canonicalEventName(event).toLowerCase();
  if (name.includes("relay")) return null;
  if (name.includes("breast")) return "breaststroke";
  if (name.includes("back")) return "backstroke";
  if (name.includes("fly") || name.includes("butterfly")) return "butterfly";
  if (name.includes("medley") || /\bim\b/.test(name)) return "im";
  if (name.includes("free")) return "freestyle";
  return null;
}

function distanceOf(event: string): number | null {
  const match = canonicalEventName(event).match(/\d+/);
  return match ? Number(match[0]) : null;
}

// 87.34 -> "1:27.3"   |   58.2 -> "58.2"
function formatSeconds(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded - minutes * 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(1).padStart(4, "0")}` : seconds.toFixed(1);
}

// PB display keeps hundredths like the Results tab: 1:27.34
function formatPb(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2);
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type Threshold = { cssPer100: number; method: Method; note: string };

// A threshold pace should sit a little slower than the average pace of the longer swim.
// If the maths lands outside that window, one of the times is probably a one-off, so skip it.
function isSane(cssPer100: number, longerSwimPacePer100: number) {
  return cssPer100 >= longerSwimPacePer100 * 0.98 && cssPer100 <= longerSwimPacePer100 * 1.2;
}

function calculateThreshold(pbs: PbByDistance, stroke: StrokeInfo): Threshold | null {
  const t50 = pbs[50]?.seconds;
  const t100 = pbs[100]?.seconds;
  const t200 = pbs[200]?.seconds;
  const t400 = pbs[400]?.seconds;
  const name = stroke.label;

  // Critical Swim Speed from the classic 200 + 400 test: pace per 100m = (T400 - T200) / 2.
  if (t200 && t400 && t400 > t200) {
    const css = (t400 - t200) / 2;
    if (isSane(css, t400 / 4)) {
      return {
        cssPer100: css,
        method: "exact",
        note: `Worked out from the 200m and 400m ${name} PBs. This is the most accurate method.`,
      };
    }
  }

  // Shorter version of the same test, for strokes that don't have a 400.
  if (t100 && t200 && t200 > t100) {
    const css = t200 - t100;
    if (isSane(css, t200 / 2)) {
      return {
        cssPer100: css,
        method: "estimate",
        note: `Worked out from the 100m and 200m ${name} PBs. A shorter test, so treat it as a good guide.`,
      };
    }
  }

  if (t400) {
    return {
      cssPer100: (t400 / 4) * 1.05,
      method: "estimate",
      note: `Estimated from the 400m ${name} PB. Add a ${stroke.testHint} ${name} pair of PBs for a better result.`,
    };
  }
  if (t200) {
    return {
      cssPer100: (t200 / 2) * 1.1,
      method: "estimate",
      note: `Estimated from the 200m ${name} PB. Add ${stroke.testHint} ${name} PBs for a better result.`,
    };
  }
  if (t100) {
    return {
      cssPer100: t100 * 1.18,
      method: "rough",
      note: `Rough guess from the 100m ${name} PB. Add ${stroke.testHint} ${name} PBs for real accuracy.`,
    };
  }
  if (t50) {
    return {
      cssPer100: t50 * 2 * 1.25,
      method: "rough",
      note: `Rough guess from the 50m ${name} PB. Add ${stroke.testHint} ${name} PBs for real accuracy.`,
    };
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ZonesTab({ swimmerId, swimmerName = "Swimmer" }: Props) {
  const [rows, setRows] = useState<SwimTimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedStroke, setSelectedStroke] = useState<StrokeKey | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [paceUnit, setPaceUnit] = useState<number>(100);

  useEffect(() => {
    void loadTimes();
  }, [swimmerId]);

  async function loadTimes() {
    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await supabase
        .from("swim_times")
        .select("id, swimmer_id, event, course, time_ms, swam_at, meet_name")
        .eq("swimmer_id", swimmerId);

      if (error) {
        console.error("ZonesTab loadTimes error:", error);
        setLoadError(error.message || "Couldn't load results.");
        setRows([]);
        return;
      }

      setRows(
        ((data as SwimTimeRow[]) || []).filter(
          (r) => typeof r.id === "number" && typeof r.time_ms === "number" && r.time_ms > 0 && !!r.event && !!r.course
        )
      );
    } catch (err: any) {
      console.error("ZonesTab loadTimes exception:", err);
      setLoadError(err?.message || "Couldn't load results.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Fastest time per stroke, per pool length, per distance.
  const pbsByStroke = useMemo(() => {
    const result: Partial<Record<StrokeKey, Record<string, PbByDistance>>> = {};
    for (const row of rows) {
      const strokeKey = strokeOf(row.event);
      const distance = distanceOf(row.event);
      if (!strokeKey || !distance) continue;

      const info = STROKES.find((s) => s.key === strokeKey);
      if (!info || !info.distances.includes(distance)) continue;

      const course = canonicalCourse(row.course);
      const seconds = row.time_ms / 1000;

      const byCourse = result[strokeKey] ?? (result[strokeKey] = {});
      const byDistance = byCourse[course] ?? (byCourse[course] = {});
      const current = byDistance[distance];
      if (!current || seconds < current.seconds) {
        byDistance[distance] = {
          seconds,
          swamAt: row.swam_at ?? null,
          meetName: row.meet_name ?? null,
        };
      }
    }
    return result;
  }, [rows]);

  const strokesWithData = useMemo(
    () => STROKES.filter((s) => Object.keys(pbsByStroke[s.key] ?? {}).length > 0).map((s) => s.key),
    [pbsByStroke]
  );

  // Freestyle first, otherwise the first stroke that has any PBs.
  const defaultStroke: StrokeKey = strokesWithData.includes("freestyle")
    ? "freestyle"
    : strokesWithData[0] ?? "freestyle";

  const activeStrokeKey: StrokeKey = selectedStroke ?? defaultStroke;
  const stroke = STROKES.find((s) => s.key === activeStrokeKey) ?? STROKES[0];
  const pbsByCourse: Record<string, PbByDistance> = pbsByStroke[activeStrokeKey] ?? {};

  const availableCourses = useMemo(
    () =>
      Object.keys(pbsByCourse).sort((a, b) => {
        const ai = COURSE_ORDER.indexOf(a);
        const bi = COURSE_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }),
    [pbsByCourse]
  );

  // Prefer the pool length with the most PBs, and best of all one with a full test pair.
  const defaultCourse = useMemo(() => {
    if (availableCourses.length === 0) return null;
    const scored = availableCourses.map((course) => {
      const pbs = pbsByCourse[course];
      const hasPair = (pbs[200] && pbs[400]) || (pbs[100] && pbs[200]) ? 100 : 0;
      const count = stroke.distances.filter((d) => pbs[d]).length;
      return { course, score: hasPair + count };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].course;
  }, [availableCourses, pbsByCourse, stroke]);

  const activeCourse =
    selectedCourse && availableCourses.includes(selectedCourse) ? selectedCourse : defaultCourse;

  const pbs: PbByDistance = activeCourse ? pbsByCourse[activeCourse] ?? {} : {};
  const threshold = useMemo(() => calculateThreshold(pbs, stroke), [pbs, stroke]);

  const unitFactor = paceUnit / 100;
  const methodLabel: Record<Method, string> = {
    exact: "Exact",
    estimate: "Estimate",
    rough: "Rough guide",
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="rounded-3xl py-8 text-center text-sm text-white/45"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)" }}
      >
        Loading zones…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="px-1">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/30">
          Training zones
        </p>
        <p className="mt-1 text-sm text-white/45">Paces worked out from meet-result PBs</p>
      </div>

      <div
        className="rounded-3xl px-5 py-4"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)" }}
      >
        <p className="text-xs leading-relaxed text-white/45">
          Zones use {swimmerName}&apos;s best times from meets, stroke by stroke. Practice times in the Diary
          are not used.
        </p>
      </div>

      {/* Stroke picker */}
      <div className="grid grid-cols-5 gap-1.5">
        {STROKES.map((s) => {
          const active = s.key === activeStrokeKey;
          const hasData = strokesWithData.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSelectedStroke(s.key)}
              className="rounded-2xl px-1 py-2.5 text-center text-[0.6875rem] font-bold transition"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg,#FFFFFF,#E8F5FD)",
                      color: "#0B2A54",
                      boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                    }
                  : {
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      color: hasData ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.28)",
                    }
              }
            >
              <span
                className="mx-auto mb-1 block h-1 w-5 rounded-full"
                style={{ background: s.color, opacity: hasData || active ? 1 : 0.35 }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      {loadError && (
        <div
          className="rounded-3xl px-4 py-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}
        >
          <p className="text-xs text-red-300">Couldn&apos;t load results: {loadError}</p>
        </div>
      )}

      {!loadError && (!threshold || !activeCourse) && (
        <div
          className="rounded-[30px] px-6 py-9 text-center"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.13)" }}
        >
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
            style={{ background: "rgba(22,138,232,0.14)", border: "1px solid rgba(125,211,252,0.20)" }}
          >
            🏊
          </div>
          <p className="text-base font-bold text-white">No {stroke.label} PBs yet</p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/40">
            Add a {stroke.testHint} {stroke.label} result in the Results tab and {swimmerName}&apos;s{" "}
            {stroke.label} zones will appear here automatically.
          </p>
        </div>
      )}

      {threshold && activeCourse && (
        <>
          {/* Pool length */}
          {availableCourses.length > 1 && (
            <div>
              <p className="mb-2 px-1 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/30">
                Pool length
              </p>
              <div className="flex gap-2">
                {availableCourses.map((course) => {
                  const active = course === activeCourse;
                  return (
                    <button
                      key={course}
                      type="button"
                      onClick={() => setSelectedCourse(course)}
                      className="rounded-2xl px-4 py-2 text-xs font-bold transition"
                      style={
                        active
                          ? {
                              background: "var(--natrix-font-colour, #168AE8)",
                              border: "1px solid rgba(255,255,255,0.20)",
                              color: "#fff",
                            }
                          : {
                              background: "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              color: "rgba(255,255,255,0.50)",
                            }
                      }
                    >
                      {course}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PBs used */}
          <div>
            <p className="mb-2 px-1 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/30">
              PBs used ({activeCourse} {stroke.label})
            </p>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${stroke.distances.length}, minmax(0, 1fr))` }}
            >
              {stroke.distances.map((distance) => {
                const pb = pbs[distance];
                return (
                  <div
                    key={distance}
                    className="rounded-2xl px-2 py-3 text-center"
                    style={{
                      background: pb ? "rgba(255,255,255,0.085)" : "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                    title={pb ? [pb.meetName, formatDate(pb.swamAt)].filter(Boolean).join(" · ") : undefined}
                  >
                    <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-white/35">
                      {distance}m
                    </p>
                    <p
                      className="mt-1 text-sm font-bold"
                      style={{ color: pb ? "var(--natrix-font-colour, #FDE68A)" : "rgba(255,255,255,0.20)" }}
                    >
                      {pb ? formatPb(pb.seconds) : "—"}
                    </p>
                    {pb?.swamAt && (
                      <p className="mt-0.5 text-[0.5625rem] text-white/30">{formatDate(pb.swamAt)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Threshold pace */}
          <div
            className="rounded-[30px] p-5"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05))",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 14px 32px rgba(0,0,0,0.10)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-white/35">
                  {stroke.label} threshold pace
                </p>
                <p
                  className="mt-1 text-4xl font-black tabular-nums"
                  style={{ color: "var(--natrix-font-colour, #FDE68A)" }}
                >
                  {formatSeconds(threshold.cssPer100 * unitFactor)}
                  <span className="ml-1.5 text-sm font-medium text-white/40">per {paceUnit}m</span>
                </p>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-[0.625rem] font-bold"
                style={
                  threshold.method === "exact"
                    ? { background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.30)", color: "#6EE7B7" }
                    : { background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.28)", color: "#FCD34D" }
                }
              >
                {methodLabel[threshold.method]}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/45">{threshold.note}</p>
          </div>

          {/* Pace unit */}
          <div>
            <p className="mb-2 px-1 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/30">
              Show paces per
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PACE_UNITS.map((unit) => {
                const active = unit === paceUnit;
                return (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setPaceUnit(unit)}
                    className="rounded-2xl py-2.5 text-xs font-bold transition"
                    style={
                      active
                        ? {
                            background: "linear-gradient(135deg,#FFFFFF,#E8F5FD)",
                            color: "#0B2A54",
                            boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                          }
                        : {
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.10)",
                            color: "rgba(255,255,255,0.50)",
                          }
                    }
                  >
                    {unit}m
                  </button>
                );
              })}
            </div>
          </div>

          {/* Zones */}
          <div className="space-y-2.5">
            {ZONES.map((zone) => {
              const slow = zone.slowMult != null ? threshold.cssPer100 * zone.slowMult * unitFactor : null;
              const fast = zone.fastMult != null ? threshold.cssPer100 * zone.fastMult * unitFactor : null;

              let range: string;
              if (slow != null && fast != null) range = `${formatSeconds(fast)} – ${formatSeconds(slow)}`;
              else if (fast != null) range = `${formatSeconds(fast)} or slower`;
              else if (slow != null) range = `${formatSeconds(slow)} or faster`;
              else range = "—";

              return (
                <div
                  key={zone.key}
                  className="flex items-stretch overflow-hidden rounded-[22px]"
                  style={{
                    background: "rgba(255,255,255,0.085)",
                    border: "1px solid rgba(255,255,255,0.13)",
                    boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
                  }}
                >
                  <div
                    className="flex w-14 flex-shrink-0 items-center justify-center text-sm font-black text-white"
                    style={{ background: zone.color }}
                  >
                    {zone.key}
                  </div>
                  <div className="min-w-0 flex-1 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-bold text-white">{zone.name}</p>
                      <p className="flex-shrink-0 text-sm font-bold tabular-nums text-white">{range}</p>
                    </div>
                    <p className="mt-1 text-[0.6875rem] leading-snug text-white/40">{zone.purpose}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="px-1 text-[0.6875rem] leading-relaxed text-white/30">
            Zones are a guide based on common coaching practice. Re-check them every 6 to 8 weeks as times
            improve, and let the coach have the final say on how hard each set should feel.
          </p>
        </>
      )}
    </div>
  );
}
