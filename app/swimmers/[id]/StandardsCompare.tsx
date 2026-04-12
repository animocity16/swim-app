"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { canonicalEventName, canonicalCourse, eventKey } from "@/lib/events";

type SwimTimeRow = {
  event: string;
  course: string;
  time_ms: number;
};

type StandardSet = {
  id: number;
  name: string;
  type: string;
};

type StandardItem = {
  id: number;
  standard_set_id: number;
  event: string;
  course: string;
  min_age: number | null;
  max_age: number | null;
  gender: string | null;
  qualifying_time_ms: number;
};

type Tone = "neutral" | "good" | "warn";

type CompareRow = {
  key: string;
  event: string;
  course: string;
  pbMs: number | null;
  targetMs: number;
  gapMs: number | null;
  qualified: boolean;
  hasPb: boolean;
};

function keyOf(event: string, course: string) {
  return eventKey(event, course);
}

function normalizeEvent(event: string) {
  return canonicalEventName(event).toLowerCase().replace(/\s+/g, "");
}

function normalizeCourse(course: string) {
  return canonicalCourse(course);
}

function formatMs(ms: number | null | undefined) {
  if (ms == null) return "—";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function gapText(pbMs: number, targetMs: number) {
  const diff = pbMs - targetMs;
  const seconds = Math.abs(diff / 1000).toFixed(2);
  if (diff <= 0) return `${seconds}s under ✅`;
  return `${seconds}s to go`;
}

function gapTone(pbMs: number, targetMs: number): Tone {
  const diff = pbMs - targetMs;
  if (diff <= 0) return "good";
  if (diff <= 1000) return "warn";
  return "neutral";
}

function toneColor(tone: Tone): string {
  switch (tone) {
    case "good": return "#6EE7B7";
    case "warn": return "#FCD34D";
    default: return "rgba(255,255,255,0.5)";
  }
}

function toneBg(tone: Tone): string {
  switch (tone) {
    case "good": return "rgba(110,231,183,0.12)";
    case "warn": return "rgba(252,211,77,0.12)";
    default: return "rgba(255,255,255,0.06)";
  }
}

function toneBorder(tone: Tone): string {
  switch (tone) {
    case "good": return "rgba(110,231,183,0.25)";
    case "warn": return "rgba(252,211,77,0.25)";
    default: return "rgba(255,255,255,0.12)";
  }
}

export default function StandardsCompare({
  swimmerId,
  swimmerAge,
  swimmerGender,
}: {
  swimmerId: number;
  swimmerAge: number;
  swimmerGender?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);

  const [pbMap, setPbMap] = useState<Map<string, number>>(new Map());
  const [pbLabelMap, setPbLabelMap] = useState<Map<string, { event: string; course: string }>>(new Map());

  const [sets, setSets] = useState<StandardSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<number | "">("");
  const [items, setItems] = useState<StandardItem[]>([]);

  useEffect(() => {
    if (!swimmerId) return;
    loadInitialData();
  }, [swimmerId]);

  useEffect(() => {
    if (!selectedSetId) { setItems([]); return; }
    loadItemsForSet(Number(selectedSetId));
  }, [selectedSetId, swimmerAge, swimmerGender]);

  async function loadInitialData() {
    setLoading(true);

    const [timesResult, setsResult] = await Promise.all([
      supabase.from("swim_times").select("event, course, time_ms").eq("swimmer_id", swimmerId),
      supabase.from("standard_sets").select("id, name, type").order("created_at", { ascending: false }),
    ]);

    const { data: times, error: tErr } = timesResult;
    const { data: setData, error: setErr } = setsResult;

    if (tErr || setErr) { setLoading(false); return; }

    const map = new Map<string, number>();
    const labelMap = new Map<string, { event: string; course: string }>();

    (times as SwimTimeRow[] | null)?.forEach((t) => {
      const k = keyOf(t.event, t.course);
      const currentPb = map.get(k);
      if (currentPb == null || t.time_ms < currentPb) {
        map.set(k, t.time_ms);
        labelMap.set(k, { event: t.event.trim(), course: normalizeCourse(t.course) });
      }
    });

    const loadedSets = (setData as StandardSet[] | null) ?? [];

    setPbMap(map);
    setPbLabelMap(labelMap);
    setSets(loadedSets);

    setSelectedSetId((current) => {
      if (current && loadedSets.some((s) => s.id === current)) return current;
      return loadedSets.length > 0 ? loadedSets[0].id : "";
    });

    setLoading(false);
  }

  async function loadItemsForSet(setId: number) {
    setLoadingItems(true);

    const { data, error } = await supabase
      .from("standard_items")
      .select("id, standard_set_id, event, course, min_age, max_age, gender, qualifying_time_ms")
      .eq("standard_set_id", setId)
      .order("event", { ascending: true });

    if (error) { setLoadingItems(false); return; }

    const normalizedSwimmerGender = swimmerGender?.trim().toLowerCase() ?? null;

    const filtered = (data as StandardItem[] | null)?.filter((s) => {
      const minOk = s.min_age == null || swimmerAge >= s.min_age;
      const maxOk = s.max_age == null || swimmerAge <= s.max_age;
      const genderOk =
        !s.gender ||
        !normalizedSwimmerGender ||
        s.gender.trim().toLowerCase() === normalizedSwimmerGender;
      return minOk && maxOk && genderOk;
    }) ?? [];

    setItems(filtered);
    setLoadingItems(false);
  }

  const rows = useMemo<CompareRow[]>(() => {
    const bestTargetByKey = new Map<string, StandardItem>();

    for (const item of items) {
      const key = keyOf(item.event, item.course);
      const existing = bestTargetByKey.get(key);
      if (!existing || item.qualifying_time_ms < existing.qualifying_time_ms) {
        bestTargetByKey.set(key, item);
      }
    }

    return Array.from(bestTargetByKey.entries())
      .map(([key, item]) => {
        const pbMs = pbMap.get(key) ?? null;
        const label = pbLabelMap.get(key);
        return {
          key,
          event: label?.event ?? item.event.trim(),
          course: label?.course ?? normalizeCourse(item.course),
          pbMs,
          targetMs: item.qualifying_time_ms,
          gapMs: pbMs != null ? pbMs - item.qualifying_time_ms : null,
          qualified: pbMs != null ? pbMs <= item.qualifying_time_ms : false,
          hasPb: pbMs != null,
        };
      })
      .sort((a, b) => {
        if (a.gapMs == null && b.gapMs == null) return a.event.localeCompare(b.event);
        if (a.gapMs == null) return 1;
        if (b.gapMs == null) return -1;
        return a.gapMs - b.gapMs;
      });
  }, [items, pbMap, pbLabelMap]);

  const selectedSet = sets.find((s) => s.id === selectedSetId) ?? null;

  const nextTarget = useMemo(() => {
    return rows
      .filter((r) => r.hasPb && !r.qualified && r.gapMs != null)
      .sort((a, b) => (a.gapMs ?? Infinity) - (b.gapMs ?? Infinity))[0] ?? null;
  }, [rows]);

  const qualifiedCount = rows.filter((r) => r.qualified).length;
  const inProgressCount = rows.filter((r) => r.hasPb && !r.qualified).length;

  if (loading) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-white/40">Loading standards...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Set selector */}
      <div
        className="rounded-3xl p-4 space-y-3"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <p className="text-[10px] font-medium uppercase tracking-widest text-white/40">Standard set</p>
        <select
          value={selectedSetId}
          onChange={(e) => setSelectedSetId(e.target.value ? Number(e.target.value) : "")}
          className="input"
        >
          <option value="">Select a standard set...</option>
          {sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name} · {set.type === "UPGRADING" ? "Upgrading" : "Important Meet"}
            </option>
          ))}
        </select>

        {selectedSet && rows.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: "rgba(110,231,183,0.12)", color: "#6EE7B7", border: "1px solid rgba(110,231,183,0.25)" }}
            >
              ✅ {qualifiedCount} qualified
            </span>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: "rgba(252,211,77,0.12)", color: "#FCD34D", border: "1px solid rgba(252,211,77,0.25)" }}
            >
              🎯 {inProgressCount} in progress
            </span>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              {rows.length} events total
            </span>
          </div>
        )}
      </div>

      {/* Next target card */}
      {selectedSet && (
        <div
          className="rounded-3xl p-4 space-y-3"
          style={{
            background: "rgba(217,119,6,0.1)",
            border: "1px solid rgba(253,230,138,0.2)",
          }}
        >
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#FDE68A" }}>
            🎯 Next target
          </p>

          {loadingItems ? (
            <p className="text-sm text-white/40">Loading...</p>
          ) : !nextTarget ? (
            <p className="text-sm text-white/50">
              {rows.length === 0
                ? "No matching standards for this swimmer's age."
                : qualifiedCount === rows.length
                ? "All standards qualified! 🏆"
                : "No active target found — add some results first."}
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-white">{canonicalEventName(nextTarget.event)}</p>
                  <p className="text-xs text-white/40">{nextTarget.course}</p>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold flex-shrink-0"
                  style={{ background: "rgba(252,211,77,0.15)", color: "#FCD34D", border: "1px solid rgba(252,211,77,0.3)" }}
                >
                  {gapText(nextTarget.pbMs!, nextTarget.targetMs)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Your PB", value: formatMs(nextTarget.pbMs) },
                  { label: "Target", value: formatMs(nextTarget.targetMs) },
                  { label: "Gap", value: `${Math.abs((nextTarget.gapMs ?? 0) / 1000).toFixed(2)}s` },
                ].map((tile) => (
                  <div
                    key={tile.label}
                    className="rounded-2xl p-3 text-center"
                    style={{ background: "rgba(0,20,50,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">{tile.label}</p>
                    <p className="mt-1 text-base font-bold text-white tabular-nums">{tile.value}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* All events list */}
      {selectedSet && !loadingItems && rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/40 px-1">All events</p>
          {rows.map((r) => {
            const tone = r.hasPb ? gapTone(r.pbMs!, r.targetMs) : "neutral";
            const isQualified = r.qualified;

            return (
              <div
                key={r.key}
                className="rounded-2xl p-4"
                style={{
                  background: isQualified ? "rgba(110,231,183,0.07)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${isQualified ? "rgba(110,231,183,0.2)" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{canonicalEventName(r.event)}</p>
                    <p className="text-xs text-white/35 mt-0.5">{r.course}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {isQualified ? (
                      <span className="text-sm font-semibold" style={{ color: "#6EE7B7" }}>Qualified ✅</span>
                    ) : r.hasPb ? (
                      <span className="text-sm font-semibold" style={{ color: toneColor(tone) }}>
                        {gapText(r.pbMs!, r.targetMs)}
                      </span>
                    ) : (
                      <span className="text-xs text-white/30">No PB yet</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div
                    className="rounded-xl p-2.5"
                    style={{ background: "rgba(0,20,50,0.3)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <p className="text-[10px] text-white/35 uppercase tracking-wider">Your PB</p>
                    <p className="mt-0.5 text-sm font-bold text-white tabular-nums">{formatMs(r.pbMs)}</p>
                  </div>
                  <div
                    className="rounded-xl p-2.5"
                    style={{
                      background: toneBg(r.hasPb ? tone : "neutral"),
                      border: `1px solid ${toneBorder(r.hasPb ? tone : "neutral")}`,
                    }}
                  >
                    <p className="text-[10px] text-white/35 uppercase tracking-wider">Target</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: r.hasPb ? toneColor(tone) : "rgba(255,255,255,0.5)" }}>
                      {formatMs(r.targetMs)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {selectedSet && !loadingItems && rows.length === 0 && (
        <div
          className="rounded-3xl p-8 text-center"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <p className="text-base font-semibold text-white">No matching standards</p>
          <p className="mt-1 text-sm text-white/40">
            This may be due to age range, gender, or no items added to this set yet.
          </p>
        </div>
      )}

      {!selectedSet && !loading && (
        <div
          className="rounded-3xl p-8 text-center"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <p className="text-base font-semibold text-white">No standard sets yet</p>
          <p className="mt-1 text-sm text-white/40">
            Go to Standards in the bottom nav to create your first set.
          </p>
        </div>
      )}

    </div>
  );
}