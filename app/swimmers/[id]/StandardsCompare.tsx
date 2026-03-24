"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SwimTimeRow = {
  event: string;
  course: string;
  time_ms: number;
};

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
  min_age: number | null;
  max_age: number | null;
  gender: string | null;
  qualifying_time_ms: number;
};

type Tone = "neutral" | "good" | "warn";

function normalizeEvent(event: string) {
  return event
    .trim()
    .toLowerCase()
    .replace(/freestyle/g, "free")
    .replace(/butterfly/g, "fly")
    .replace(/breaststroke/g, "breast")
    .replace(/backstroke/g, "back")
    .replace(/\s+/g, " ");
}

function normalizeCourse(course: string) {
  const c = course.trim().toUpperCase();

  if (c === "50M") return "LCM";
  if (c === "25M") return "SCM";

  return c;
}

function keyOf(event: string, course: string) {
  return `${normalizeEvent(event)}|${normalizeCourse(course)}`;
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

function gapSeconds(pbMs: number, qualMs: number) {
  return (pbMs - qualMs) / 1000;
}

function gapText(pbMs: number, qualMs: number) {
  const g = gapSeconds(pbMs, qualMs);
  const abs = Math.abs(g).toFixed(2);

  if (g <= 0) return `Qualified • ${abs}s under`;
  return `Needs ${abs}s`;
}

function gapTone(pbMs: number, qualMs: number): Tone {
  const g = gapSeconds(pbMs, qualMs);

  if (g <= 0) return "good";
  if (g <= 1.0) return "warn";
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
}: {
  swimmerId: number;
  swimmerAge: number;
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
  }, [swimmerId, swimmerAge]);

  useEffect(() => {
    if (!selectedSetId) {
      setItems([]);
      return;
    }
    loadItemsForSet(Number(selectedSetId));
  }, [selectedSetId, swimmerAge]);

  async function loadInitialData() {
    setLoading(true);

    const { data: times, error: tErr } = await supabase
      .from("swim_times")
      .select("event, course, time_ms")
      .eq("swimmer_id", swimmerId);

    if (tErr) {
      alert("Failed to load swim times ❌ " + tErr.message);
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
      } else if (!labelMap.has(k)) {
        labelMap.set(k, {
          event: t.event.trim(),
          course: normalizeCourse(t.course),
        });
      }
    });

    const { data: setData, error: setErr } = await supabase
      .from("standard_sets")
      .select("id, name, type")
      .order("created_at", { ascending: false });

    if (setErr) {
      alert("Failed to load standard sets ❌ " + setErr.message);
      setLoading(false);
      return;
    }

    const loadedSets = (setData as StandardSet[] | null) ?? [];

    setPbMap(map);
    setPbLabelMap(labelMap);
    setSets(loadedSets);

    if (loadedSets.length > 0) {
      setSelectedSetId(loadedSets[0].id);
    }

    setLoading(false);
  }

  async function loadItemsForSet(setId: number) {
    setLoadingItems(true);

    const { data, error } = await supabase
      .from("standard_items")
      .select("id, standard_set_id, event, course, min_age, max_age, gender, qualifying_time_ms")
      .eq("standard_set_id", setId)
      .order("event", { ascending: true });

    if (error) {
      alert("Failed to load standard items ❌ " + error.message);
      setLoadingItems(false);
      return;
    }

    const filtered =
      (data as StandardItem[] | null)?.filter((s) => {
        const minOk = s.min_age == null || swimmerAge >= s.min_age;
        const maxOk = s.max_age == null || swimmerAge <= s.max_age;
        return minOk && maxOk;
      }) ?? [];

    setItems(filtered);
    setLoadingItems(false);
  }

  const rows = useMemo(() => {
    const byKey = new Map<
      string,
      {
        event: string;
        course: string;
        pbMs: number | null;
        targetMs: number | null;
      }
    >();

    for (const [k, pb] of pbMap.entries()) {
      const label = pbLabelMap.get(k);

      byKey.set(k, {
        event: label?.event ?? "",
        course: label?.course ?? "",
        pbMs: pb,
        targetMs: null,
      });
    }

    for (const s of items) {
      const k = keyOf(s.event, s.course);
      const existing = byKey.get(k);

      const row = existing ?? {
        event: s.event.trim(),
        course: normalizeCourse(s.course),
        pbMs: pbMap.get(k) ?? null,
        targetMs: null,
      };

      row.targetMs = s.qualifying_time_ms;

      if (!row.event) row.event = s.event.trim();
      if (!row.course) row.course = normalizeCourse(s.course);

      byKey.set(k, row);
    }

    return Array.from(byKey.values())
      .filter((r) => r.pbMs != null || r.targetMs != null)
      .sort((a, b) => {
        const aGap = a.pbMs != null && a.targetMs != null ? a.pbMs - a.targetMs : 999999999;
        const bGap = b.pbMs != null && b.targetMs != null ? b.pbMs - b.targetMs : 999999999;
        return aGap - bGap;
      });
  }, [pbMap, pbLabelMap, items]);

  const selectedSet = sets.find((s) => s.id === selectedSetId) ?? null;

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Qualifying / Upgrading</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Age: {swimmerAge}</p>
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
            const chips: Array<{ label: string; value: string; tone?: Tone }> = [];

            if (r.pbMs != null && r.targetMs != null) {
              chips.push({
                label: "Gap",
                value: gapText(r.pbMs, r.targetMs),
                tone: gapTone(r.pbMs, r.targetMs),
              });
            }

            const statusValue =
              r.pbMs != null && r.targetMs != null
                ? r.pbMs <= r.targetMs
                  ? "Qualified ✅"
                  : "In progress"
                : r.pbMs != null
                ? "No target"
                : "No PB yet";

            const statusTone: Tone =
              r.pbMs != null && r.targetMs != null && r.pbMs <= r.targetMs
                ? "good"
                : r.pbMs != null &&
                  r.targetMs != null &&
                  r.pbMs - r.targetMs <= 1000
                ? "warn"
                : "neutral";

            return (
              <EventCard
                key={keyOf(r.event, r.course)}
                title={r.event}
                subtitle={r.course ? `Course: ${r.course}` : undefined}
                chips={chips.length ? chips : undefined}
                tiles={[
                  {
                    label: "PB",
                    value: formatMs(r.pbMs),
                    hint: r.pbMs != null ? "Best recorded time" : "No PB yet",
                    tone: "neutral",
                  },
                  {
                    label: "Target",
                    value: formatMs(r.targetMs),
                    hint: r.targetMs != null ? "Selected standard set" : "Not set",
                    tone:
                      r.pbMs != null && r.targetMs != null
                        ? gapTone(r.pbMs, r.targetMs)
                        : "neutral",
                  },
                  {
                    label: "Gap",
                    value:
                      r.pbMs != null && r.targetMs != null
                        ? gapText(r.pbMs, r.targetMs)
                        : "—",
                    hint: "How far from target",
                    tone:
                      r.pbMs != null && r.targetMs != null
                        ? gapTone(r.pbMs, r.targetMs)
                        : "neutral",
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
    </div>
  );
}