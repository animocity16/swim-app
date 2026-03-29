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

function normalizeEvent(event: string) {
  return canonicalEventName(event).toLowerCase().replace(/\s+/g, "");
}

function normalizeCourse(course: string) {
  return canonicalCourse(course);
}

function keyOf(event: string, course: string) {
  return eventKey(event, course);
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

  if (diff <= 0) return `${seconds}s under`;
  return `${seconds}s to go`;
}

function gapTone(pbMs: number, targetMs: number): Tone {
  const diff = pbMs - targetMs;

  if (diff <= 0) return "good";
  if (diff <= 1000) return "warn";
  return "neutral";
}

function toneStyles(tone: Tone) {
  switch (tone) {
    case "good":
      return {
        chip: "bg-emerald-50 text-emerald-800 ring-emerald-200",
        tileRing: "ring-emerald-200",
        value: "text-emerald-900",
      };
    case "warn":
      return {
        chip: "bg-amber-50 text-amber-800 ring-amber-200",
        tileRing: "ring-amber-200",
        value: "text-amber-900",
      };
    default:
      return {
        chip: "bg-zinc-50 text-zinc-800 ring-zinc-200",
        tileRing: "ring-zinc-200",
        value: "text-zinc-900",
      };
  }
}

function Chip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const t = toneStyles(tone);

  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
        "ring-1",
        t.chip,
      ].join(" ")}
    >
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[11px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  const t = toneStyles(tone);

  return (
    <div className={["rounded-2xl bg-white p-3 ring-1", t.tileRing].join(" ")}>
      <div className="text-[11px] font-medium text-zinc-600">{label}</div>
      <div
        className={[
          "mt-1 text-lg font-semibold tabular-nums break-words",
          t.value,
        ].join(" ")}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-zinc-500">{hint}</div> : null}
    </div>
  );
}

function EventCard({
  title,
  subtitle,
  chips,
  tiles,
}: {
  title: string;
  subtitle?: string;
  chips?: Array<{ label: string; value: string; tone?: Tone }>;
  tiles: Array<{ label: string; value: string; hint?: string; tone?: Tone }>;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          {subtitle ? <div className="mt-0.5 text-xs text-zinc-500">{subtitle}</div> : null}
        </div>

        {chips?.length ? (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {chips.map((c, i) => (
              <Chip key={i} label={c.label} value={c.value} tone={c.tone ?? "neutral"} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t, i) => (
          <Tile
            key={i}
            label={t.label}
            value={t.value}
            hint={t.hint}
            tone={t.tone ?? "neutral"}
          />
        ))}
      </div>
    </section>
  );
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
  const [pbLabelMap, setPbLabelMap] = useState<Map<string, { event: string; course: string }>>(
    new Map()
  );

  const [sets, setSets] = useState<StandardSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<number | "">("");
  const [items, setItems] = useState<StandardItem[]>([]);

  useEffect(() => {
    if (!swimmerId) return;
    loadInitialData();
  }, [swimmerId]);

  useEffect(() => {
    if (!selectedSetId) {
      setItems([]);
      return;
    }
    loadItemsForSet(Number(selectedSetId));
  }, [selectedSetId, swimmerAge, swimmerGender]);

  async function loadInitialData() {
    setLoading(true);

    const [timesResult, setsResult] = await Promise.all([
      supabase
        .from("swim_times")
        .select("event, course, time_ms")
        .eq("swimmer_id", swimmerId),
      supabase
        .from("standard_sets")
        .select("id, name, type")
        .order("created_at", { ascending: false }),
    ]);

    const { data: times, error: tErr } = timesResult;
    const { data: setData, error: setErr } = setsResult;

    if (tErr) {
      alert("Failed to load swim times ❌ " + tErr.message);
      setLoading(false);
      return;
    }

    if (setErr) {
      alert("Failed to load standard sets ❌ " + setErr.message);
      setLoading(false);
      return;
    }

    const map = new Map<string, number>();
    const labelMap = new Map<string, { event: string; course: string }>();

    (times as SwimTimeRow[] | null)?.forEach((t) => {
      const k = keyOf(t.event, t.course);
      const currentPb = map.get(k);

      if (currentPb == null || t.time_ms < currentPb) {
        map.set(k, t.time_ms);
        labelMap.set(k, {
          event: t.event.trim(),
          course: normalizeCourse(t.course),
        });
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
      .select(
        "id, standard_set_id, event, course, min_age, max_age, gender, qualifying_time_ms"
      )
      .eq("standard_set_id", setId)
      .order("event", { ascending: true });

    if (error) {
      alert("Failed to load standard items ❌ " + error.message);
      setLoadingItems(false);
      return;
    }

    const normalizedSwimmerGender = swimmerGender?.trim().toLowerCase() ?? null;

    const filtered =
      (data as StandardItem[] | null)?.filter((s) => {
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
    console.log("PB KEYS", Array.from(pbMap.keys()));
console.log(
  "STANDARD KEYS",
  items.map((item) => ({
    event: item.event,
    course: item.course,
    key: keyOf(item.event, item.course),
  }))
);

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
        if (a.gapMs == null && b.gapMs == null) {
          return a.event.localeCompare(b.event);
        }
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

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Standards Compare</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              See how close this swimmer is to qualifying standards.
            </p>
          </div>

          <div className="min-w-[220px]">
            <select
              value={selectedSetId}
              onChange={(e) =>
                setSelectedSetId(e.target.value ? Number(e.target.value) : "")
              }
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a standard set</option>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name} ({set.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedSet ? (
          <div className="mt-3">
            <Chip
              label="Using"
              value={`${selectedSet.name} • ${selectedSet.type}`}
              tone="neutral"
            />
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <h3 className="text-base font-semibold text-zinc-900">Next Target</h3>

        {loading || loadingItems ? (
          <p className="mt-3 text-sm text-zinc-600">Loading next target…</p>
        ) : !selectedSet ? (
          <p className="mt-3 text-sm text-zinc-600">Select a standard set first.</p>
        ) : nextTarget ? (
          <div className="mt-3">
            <EventCard
              title={nextTarget.event}
              subtitle={`Course: ${nextTarget.course}`}
              chips={[
                {
                  label: "Closest Gap",
                  value: gapText(nextTarget.pbMs!, nextTarget.targetMs),
                  tone: gapTone(nextTarget.pbMs!, nextTarget.targetMs),
                },
              ]}
              tiles={[
                {
                  label: "PB",
                  value: formatMs(nextTarget.pbMs),
                  hint: "Best recorded time",
                },
                {
                  label: "Target",
                  value: formatMs(nextTarget.targetMs),
                  hint: "Standard time",
                  tone: gapTone(nextTarget.pbMs!, nextTarget.targetMs),
                },
                {
                  label: "Gap",
                  value: gapText(nextTarget.pbMs!, nextTarget.targetMs),
                  hint: "How much to drop",
                  tone: gapTone(nextTarget.pbMs!, nextTarget.targetMs),
                },
                {
                  label: "Status",
                  value: "Closest target",
                  hint: "Best next event to chase",
                  tone: gapTone(nextTarget.pbMs!, nextTarget.targetMs),
                },
              ]}
            />
          </div>
        ) : (
          <div className="mt-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <p className="text-sm text-zinc-600">
              No active next target found. That usually means:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600">
              <li>no matching PB exists yet</li>
              <li>all matching events are already qualified</li>
              <li>age range or gender does not match this swimmer</li>
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">
              {selectedSet?.name ?? "Selected Standards"}
            </h3>
            <p className="mt-0.5 text-sm text-zinc-500">Age: {swimmerAge}</p>
          </div>
        </div>

        {loading || loadingItems ? (
          <div className="mt-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <p className="text-sm text-zinc-600">Loading comparison…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <p className="text-sm text-zinc-600">No matching standards yet.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {rows.map((r) => {
              const statusValue = r.hasPb
                ? r.qualified
                  ? "Qualified ✅"
                  : "In progress"
                : "No PB yet";

              const statusTone: Tone = r.hasPb
                ? r.qualified
                  ? "good"
                  : gapTone(r.pbMs!, r.targetMs)
                : "neutral";

              const chips: Array<{ label: string; value: string; tone?: Tone }> = [];

              if (r.hasPb) {
                chips.push({
                  label: "Gap",
                  value: gapText(r.pbMs!, r.targetMs),
                  tone: gapTone(r.pbMs!, r.targetMs),
                });
              }

              return (
                <EventCard
                  key={r.key}
                  title={r.event}
                  subtitle={`Course: ${r.course}`}
                  chips={chips.length ? chips : undefined}
                  tiles={[
                    {
                      label: "PB",
                      value: formatMs(r.pbMs),
                      hint: r.hasPb ? "Best recorded time" : "No PB yet",
                    },
                    {
                      label: "Target",
                      value: formatMs(r.targetMs),
                      hint: "Standard time",
                      tone: r.hasPb ? gapTone(r.pbMs!, r.targetMs) : "neutral",
                    },
                    {
                      label: "Gap",
                      value: r.hasPb ? gapText(r.pbMs!, r.targetMs) : "—",
                      hint: r.hasPb ? "How far from target" : "Waiting for PB",
                      tone: r.hasPb ? gapTone(r.pbMs!, r.targetMs) : "neutral",
                    },
                    {
                      label: "Status",
                      value: statusValue,
                      hint: "Quick read",
                      tone: statusTone,
                    },
                  ]}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}