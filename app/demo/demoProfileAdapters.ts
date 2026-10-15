// app/demo/demoProfileAdapters.ts
//
// Pure converters from the fictional dataset in lib/demoData.ts into the row
// shapes the production swimmer-profile tabs already understand. This lets the
// demo reuse the real tab components (and their real calculations) with static
// data instead of building a second copy of them.
//
// Rules for this file:
//  - No Supabase, no network, no side effects. Everything is a plain function.
//  - It never changes lib/demoData.ts or any fictional swimmer, result or standard.

import { DEMO_STANDARDS, getDemoTimesForSwimmer, type DemoSwimmer } from "@/lib/demoData";

// Shapes below mirror what the production tabs read from Supabase.

export type StaticSwimTimeRow = {
  id: number;
  swimmer_id: number;
  event: string;
  course: string;
  time_ms: number;
  swam_at: string | null;
  meet_name: string | null;
  created_at: string | null;
  place: number | null;
};

export type StaticSwimSplitRow = {
  id: number;
  swim_time_id: number;
  split_label: string | null;
  split_order: number | null;
  split_distance: number | null; // CUMULATIVE distance at this checkpoint (same as production)
  split_time_ms: number | null;
  cumulative_time_ms: number | null;
};

export type StaticStandardSet = {
  id: number;
  name: string;
  type: "UPGRADING" | "IMPORTANT_MEET";
};

export type StaticStandardItem = {
  id: number;
  standard_set_id: number;
  event: string;
  course: string;
  qualifying_time_ms: number;
  gender: string | null;
  min_age: number | null;
  max_age: number | null;
};

function eventDistance(event: string): number {
  return Number(event.match(/\d+/)?.[0] ?? 0);
}

// Swim times for one demo swimmer. Production queries order by swam_at, so we
// do the same: "newest" for the Results tab, "oldest" for the Progress tab.
export function demoTimeRows(swimmerId: number, order: "newest" | "oldest" = "newest"): StaticSwimTimeRow[] {
  const rows: StaticSwimTimeRow[] = getDemoTimesForSwimmer(swimmerId).map((t) => ({
    id: t.id,
    swimmer_id: t.swimmer_id,
    event: t.event,
    course: t.course,
    time_ms: t.time_ms,
    swam_at: t.swam_at ?? null,
    meet_name: t.meet_name ?? null,
    created_at: null,
    place: t.place ?? null,
  }));

  rows.sort((a, b) => {
    const diff = (a.swam_at ?? "").localeCompare(b.swam_at ?? "") || a.id - b.id;
    return order === "newest" ? -diff : diff;
  });
  return rows;
}

// Splits for one demo swimmer. The demo stores leg + cumulative time per length;
// production stores a label, cumulative distance, leg time and cumulative time.
// Leg length is the race distance divided evenly by the number of splits
// (e.g. 100 Free with 2 splits = 50m legs, 100 IM with 4 splits = 25m legs).
export function demoSplitRows(swimmerId: number): StaticSwimSplitRow[] {
  const out: StaticSwimSplitRow[] = [];
  for (const t of getDemoTimesForSwimmer(swimmerId)) {
    if (!t.splits || t.splits.length === 0) continue;
    const legLength = eventDistance(t.event) / t.splits.length;
    for (const s of t.splits) {
      const cumulativeDistance = legLength > 0 ? Math.round(legLength * s.no) : null;
      out.push({
        id: t.id * 100 + s.no,
        swim_time_id: t.id,
        split_label: cumulativeDistance ? `${cumulativeDistance}m` : null,
        split_order: s.no,
        split_distance: cumulativeDistance,
        split_time_ms: s.legMs,
        cumulative_time_ms: s.cumMs,
      });
    }
  }
  return out;
}

// Standards for one demo swimmer. The existing demo only showed standards that
// match the swimmer's own squad, so we keep exactly that rule. Standards that
// share a label ("Squad Upgrade", "NSG Qualifying") become one production-style set.
export function demoStandards(swimmer: DemoSwimmer): { sets: StaticStandardSet[]; items: StaticStandardItem[] } {
  const mine = DEMO_STANDARDS.filter((s) => s.squad === swimmer.squad);

  const labels: string[] = [];
  for (const s of mine) if (!labels.includes(s.label)) labels.push(s.label);

  const sets: StaticStandardSet[] = labels.map((label, i) => ({
    id: i + 1,
    name: label,
    type: /upgrade/i.test(label) ? "UPGRADING" : "IMPORTANT_MEET",
  }));

  const items: StaticStandardItem[] = mine.map((s, i) => ({
    id: i + 1,
    standard_set_id: labels.indexOf(s.label) + 1,
    event: s.event,
    course: s.course,
    qualifying_time_ms: s.cutoffMs,
    gender: null,
    min_age: null,
    max_age: null,
  }));

  return { sets, items };
}
