// lib/demo/seed.ts
//
// The fictional starting data for the interactive demo:
//   - 1 primary swimmer (Emma Carter) and 3 followed swimmers
//   - 8 past meets with realistic, improving results (PB progression)
//   - 4 upcoming meets (dated relative to the day the demo is opened)
//   - club squad standards and a regional qualifying standard
//   - a few training-diary entries
//   - a small pool of other fictional swimmers that visitors can search for and follow
//
// Everything is generated deterministically (no Math.random), so the sample
// data is identical for every visitor. All names, clubs and times are invented.

import { DEMO_USER_ID, DEMO_USER_EMAIL } from "./demoMode";
import type { DemoDb, Row } from "./store";

// ─── Deterministic pseudo-random numbers ─────────────────────────────────────

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Returns a number in [0, 1) that depends only on the key.
function rand(key: string): number {
  let t = (hash(key) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── Reference times and meets ───────────────────────────────────────────────

// Long-course reference times in seconds for a 12-year-old girl at the end of
// the period. Each fictional swimmer is a multiple of these.
const REF_SECONDS: Record<string, number> = {
  "50 Free": 31.2,
  "100 Free": 67.5,
  "200 Free": 147,
  "400 Free": 310,
  "50 Back": 36,
  "100 Back": 76.5,
  "200 Back": 166,
  "50 Breast": 40.5,
  "100 Breast": 89,
  "200 Breast": 192,
  "50 Fly": 34,
  "100 Fly": 75.5,
  "200 IM": 161,
  "400 IM": 335,
};

type MeetDef = {
  name: string;
  daysAgo: number;
  course: "LCM" | "SCM";
  location: string;
  events: string[];
};

// Oldest first.
const PAST_MEETS: MeetDef[] = [
  { name: "Autumn Time Trials", daysAgo: 420, course: "LCM", location: "Harbour Aquatic Centre", events: ["50 Free", "100 Free", "50 Back", "100 Breast", "200 IM"] },
  { name: "Riverside Short Course Classic", daysAgo: 360, course: "SCM", location: "Riverside Pool", events: ["50 Free", "100 Free", "200 Free", "100 Back", "50 Fly"] },
  { name: "Summit Spring Invitational", daysAgo: 300, course: "LCM", location: "Summit Sports Hall", events: ["100 Free", "200 Free", "50 Breast", "100 Fly", "200 IM"] },
  { name: "Regional Age Group Championships", daysAgo: 240, course: "LCM", location: "Metro Aquatic Stadium", events: ["50 Free", "100 Free", "400 Free", "100 Back", "100 Breast", "200 IM"] },
  { name: "Harbour Club Championships", daysAgo: 185, course: "LCM", location: "Harbour Aquatic Centre", events: ["50 Free", "100 Free", "200 Free", "50 Back", "50 Fly"] },
  { name: "Summer Sprint Series", daysAgo: 130, course: "LCM", location: "Metro Aquatic Stadium", events: ["100 Free", "200 Free", "100 Breast", "100 Fly", "400 Free"] },
  { name: "Riverside Winter Short Course Open", daysAgo: 75, course: "SCM", location: "Riverside Pool", events: ["50 Free", "100 Free", "200 Free", "100 Back", "200 IM"] },
  { name: "Metro Open Meet", daysAgo: 24, course: "LCM", location: "Metro Aquatic Stadium", events: ["50 Free", "100 Free", "200 Free", "400 Free", "100 Back", "50 Fly", "200 IM"] },
];

const UPCOMING_MEETS = [
  { daysAhead: 9, length: 1, name: "Harbour Autumn Open", meet_type: "Open meet", location: "Harbour Aquatic Centre" },
  { daysAhead: 34, length: 2, name: "Regional Age Group Championships", meet_type: "Championships", location: "Metro Aquatic Stadium" },
  { daysAhead: 66, length: 1, name: "Riverside Short Course Classic", meet_type: "Invitational", location: "Riverside Pool" },
  { daysAhead: 110, length: 2, name: "Summit Winter Invitational", meet_type: "Invitational", location: "Summit Sports Hall" },
];

// ─── Swimmers ────────────────────────────────────────────────────────────────

type Profile = {
  name: string;
  age: number;
  gender: "Male" | "Female";
  swim_club: string;
  school: string | null;
  squad: string | null;
  f: number; // speed multiplier (lower = faster)
  attends: number[]; // indexes into PAST_MEETS
};

const PRIMARY: Profile = {
  name: "Emma Carter", age: 12, gender: "Female", swim_club: "Harbour Swim Club",
  school: "Lakeside Primary", squad: "Advanced", f: 1.0, attends: [0, 1, 2, 3, 4, 5, 6, 7],
};

const FOLLOWED: Profile[] = [
  { name: "Noah Bennett", age: 12, gender: "Male", swim_club: "Harbour Swim Club", school: "Lakeside Primary", squad: null, f: 0.97, attends: [0, 2, 3, 4, 5, 6, 7] },
  { name: "Sofia Alvarez", age: 12, gender: "Female", swim_club: "Riverside Aquatics", school: "Riverside Academy", squad: null, f: 1.025, attends: [1, 2, 3, 4, 5, 7] },
  { name: "Liam Chen", age: 13, gender: "Male", swim_club: "Summit Swim Team", school: "Summit College", squad: null, f: 0.94, attends: [0, 1, 3, 4, 5, 6, 7] },
];

// Swimmers a visitor can find by searching and follow. They are not in the
// visitor's list until followed. Names are stored "Surname, First" like the
// real results database.
export type PoolSwimmer = Profile & { storedName: string };

function pool(storedName: string, p: Profile): PoolSwimmer {
  return { ...p, storedName };
}

export const DEMO_POOL: PoolSwimmer[] = [
  pool("Grant, Olivia", { name: "Olivia Grant", age: 12, gender: "Female", swim_club: "Harbour Swim Club", school: null, squad: null, f: 0.995, attends: [2, 3, 4, 5, 6, 7] }),
  pool("Walker, Ethan", { name: "Ethan Walker", age: 12, gender: "Male", swim_club: "Riverside Aquatics", school: null, squad: null, f: 0.985, attends: [0, 1, 3, 4, 5, 7] }),
  pool("Patel, Maya", { name: "Maya Patel", age: 11, gender: "Female", swim_club: "Summit Swim Team", school: null, squad: null, f: 1.04, attends: [1, 3, 5, 6, 7] }),
  pool("Meyer, Lucas", { name: "Lucas Meyer", age: 13, gender: "Male", swim_club: "Harbour Swim Club", school: null, squad: null, f: 0.95, attends: [2, 3, 4, 6, 7] }),
  pool("Nguyen, Chloe", { name: "Chloe Nguyen", age: 12, gender: "Female", swim_club: "Riverside Aquatics", school: null, squad: null, f: 1.01, attends: [0, 2, 3, 5, 7] }),
  pool("Thompson, Jack", { name: "Jack Thompson", age: 14, gender: "Male", swim_club: "Summit Swim Team", school: null, squad: null, f: 0.9, attends: [1, 3, 4, 5, 6, 7] }),
  pool("Fischer, Zoe", { name: "Zoe Fischer", age: 12, gender: "Female", swim_club: "Summit Swim Team", school: null, squad: null, f: 1.0, attends: [0, 1, 2, 3, 4, 5, 6, 7] }),
  pool("Okafor, Aiden", { name: "Aiden Okafor", age: 12, gender: "Male", swim_club: "Harbour Swim Club", school: null, squad: null, f: 1.02, attends: [3, 4, 5, 6, 7] }),
];

// ─── Result generation ───────────────────────────────────────────────────────

function isoDay(baseMs: number, offsetDays: number): string {
  return new Date(baseMs + offsetDays * 86400000).toISOString().slice(0, 10);
}

function splitWeights(legs: number, fade: number): number[] {
  const raw = Array.from({ length: legs }, (_, i) => 1 + fade * (legs > 1 ? i / (legs - 1) - 0.5 : 0));
  raw[0] *= 0.97; // the first length includes the dive
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

type Generated = { times: Row[]; splits: Row[] };

// Builds one swimmer's results across the meets they attended. Ids are handed
// out by `takeTimeId` / `takeSplitId` so the caller controls numbering.
export function generateResults(
  profile: Profile,
  swimmerId: number,
  baseMs: number,
  takeTimeId: () => number,
  takeSplitId: () => number,
  withSplits: boolean
): Generated {
  const times: Row[] = [];
  const splits: Row[] = [];
  const n = profile.attends.length;

  profile.attends.forEach((meetIndex, k) => {
    const meet = PAST_MEETS[meetIndex];
    const prog = n > 1 ? (n - 1 - k) / (n - 1) : 0; // 1 = oldest, 0 = newest
    const date = isoDay(baseMs, -meet.daysAgo);
    const courseFactor = meet.course === "SCM" ? 0.975 : 1;

    for (const event of meet.events) {
      const key = `${profile.name}|${event}|${meetIndex}`;
      let noise = (rand(key) - 0.5) * 0.014;
      // A few swims at the latest meet are slightly off a PB, as in real life.
      if (k === n - 1 && rand(key + "|off") > 0.62) noise += 0.0045;

      const seconds = REF_SECONDS[event] * profile.f * courseFactor * (1 + 0.075 * prog + noise);
      const timeMs = Math.round((seconds * 1000) / 10) * 10;
      const place = 1 + Math.floor(rand(key + "|p") * rand(key + "|q") * 8);
      const id = takeTimeId();

      times.push({
        id,
        swimmer_id: swimmerId,
        event,
        course: meet.course,
        time_ms: timeMs,
        swam_at: date,
        meet_name: meet.name,
        place,
        age_at_swim: profile.age,
        created_at: `${date}T10:00:00.000Z`,
      });

      const distance = Number(event.match(/^\d+/)?.[0] ?? 0);
      const isFreeOrIm = /Free|IM/.test(event);
      if (withSplits && isFreeOrIm && distance >= 100) {
        const legs = distance / 50;
        const weights = splitWeights(legs, event.includes("IM") ? 0.04 : 0.07);
        let cum = 0;
        weights.forEach((w, i) => {
          const leg = i === legs - 1 ? timeMs - cum : Math.round((timeMs * w) / 10) * 10;
          cum += leg;
          splits.push({
            id: takeSplitId(),
            swim_time_id: id,
            split_label: `${(i + 1) * 50}m`,
            split_order: i + 1,
            split_distance: (i + 1) * 50,
            split_time_ms: leg,
            cumulative_time_ms: cum,
            course: meet.course,
          });
        });
      }
    }
  });

  return { times, splits };
}

// ─── Standards ───────────────────────────────────────────────────────────────

// Multipliers of the reference time. >1 is easier than the reference.
const STANDARD_EVENTS = ["50 Free", "100 Free", "200 Free", "400 Free", "100 Back", "100 Breast", "100 Fly", "200 IM"];

const SQUAD_STANDARDS: { id: number; name: string; mult: Record<string, number> }[] = [
  { id: 1, name: "Intermediate Squad Standards", mult: { "50 Free": 1.1, "100 Free": 1.1, "200 Free": 1.1, "400 Free": 1.1, "100 Back": 1.12, "100 Breast": 1.12, "100 Fly": 1.12, "200 IM": 1.1 } },
  { id: 2, name: "Advanced Squad Standards", mult: { "50 Free": 1.02, "100 Free": 1.012, "200 Free": 1.0, "400 Free": 0.985, "100 Back": 1.015, "100 Breast": 0.99, "100 Fly": 1.02, "200 IM": 0.995 } },
  { id: 3, name: "Elite Squad Standards", mult: { "50 Free": 0.96, "100 Free": 0.955, "200 Free": 0.95, "400 Free": 0.95, "100 Back": 0.96, "100 Breast": 0.95, "100 Fly": 0.96, "200 IM": 0.95 } },
];

const REGIONAL = { id: 4, name: "Regional Championships Qualifying", mult: { "50 Free": 0.99, "100 Free": 0.996, "200 Free": 1.012, "100 Back": 0.985, "200 IM": 1.0, "400 Free": 1.02 } as Record<string, number> };

function buildStandards(): { sets: Row[]; items: Row[] } {
  const sets: Row[] = [];
  const items: Row[] = [];
  let itemId = 1;
  const created = "2026-01-01T00:00:00.000Z";

  const addItems = (setId: number, mult: Record<string, number>) => {
    for (const event of Object.keys(mult)) {
      for (const [gender, genderFactor] of [["Female", 1], ["Male", 0.96]] as const) {
        items.push({
          id: itemId++,
          standard_set_id: setId,
          event,
          course: "LCM",
          qualifying_time_ms: Math.round((REF_SECONDS[event] * mult[event] * genderFactor * 1000) / 10) * 10,
          gender,
          min_age: 11,
          max_age: 13,
        });
      }
    }
  };

  SQUAD_STANDARDS.forEach((s, i) => {
    sets.push({ id: s.id, name: s.name, type: "UPGRADING", user_id: null, created_at: `${created.slice(0, 9)}${i + 1}T00:00:00.000Z` });
    addItems(s.id, Object.fromEntries(STANDARD_EVENTS.map((e) => [e, s.mult[e]])));
  });
  sets.push({ id: REGIONAL.id, name: REGIONAL.name, type: "IMPORTANT_MEET", user_id: null, created_at: "2026-01-04T00:00:00.000Z" });
  addItems(REGIONAL.id, REGIONAL.mult);

  return { sets, items };
}

// ─── Whole database ──────────────────────────────────────────────────────────

export function buildSeed(): DemoDb {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const baseMs = now.getTime();

  let timeId = 1;
  let splitId = 1;
  const takeTimeId = () => timeId++;
  const takeSplitId = () => splitId++;

  const swimmers: Row[] = [];
  const swimTimes: Row[] = [];
  const swimSplits: Row[] = [];

  const people: [Profile, "primary" | "following"][] = [
    [PRIMARY, "primary"],
    ...FOLLOWED.map((p) => [p, "following"] as [Profile, "following"]),
  ];

  people.forEach(([p, groupType], i) => {
    const id = i + 1;
    swimmers.push({
      id,
      name: p.name,
      age: p.age,
      birth_month: null,
      country: null,
      swim_club: p.swim_club,
      school: p.school,
      gender: p.gender,
      squad: p.squad,
      group_type: groupType,
      status: "Active",
      user_id: DEMO_USER_ID,
      photo_url: null,
      created_at: `2026-01-0${i + 1}T08:00:00.000Z`,
    });
    const { times, splits } = generateResults(p, id, baseMs, takeTimeId, takeSplitId, id === 1);
    swimTimes.push(...times);
    swimSplits.push(...splits);
  });

  const upcoming: Row[] = UPCOMING_MEETS.map((m, i) => ({
    id: `demo-meet-${i + 1}`,
    name: m.name,
    start_date: isoDay(baseMs, m.daysAhead),
    end_date: isoDay(baseMs, m.daysAhead + m.length - 1),
    meet_type: m.meet_type,
    location: m.location,
    created_by: null,
    created_at: "2026-01-05T00:00:00.000Z",
  }));

  const diary: Row[] = [
    [100, "Free", 69800, 3], [50, "Free", 31900, 6], [200, "IM", 164200, 9],
    [100, "Back", 78100, 12], [400, "Free", 316500, 15], [100, "Free", 69100, 19],
    [50, "Fly", 34800, 22], [100, "Breast", 90600, 26],
  ].map(([distance, stroke, timeMs, daysAgo], i) => ({
    id: i + 1,
    swimmer_id: 1,
    distance,
    stroke,
    time_ms: timeMs,
    swam_at: isoDay(baseMs, -(daysAgo as number)),
    logged_by: "Parent",
    created_at: `${isoDay(baseMs, -(daysAgo as number))}T18:00:00.000Z`,
  }));

  const { sets, items } = buildStandards();

  return {
    tables: {
      swimmers,
      swim_times: swimTimes,
      swim_splits: swimSplits,
      training_times: diary,
      standard_sets: sets,
      standard_items: items,
      upcoming_meets: upcoming,
      meet_events: [],
      notifications: [],
      feedback: [],
      user_devices: [],
      profiles: [{ id: DEMO_USER_ID, is_legacy_user: true, user_level: 4 }],
    },
    seq: {
      swimmers: swimmers.length + 1,
      swim_times: timeId,
      swim_splits: splitId,
      training_times: diary.length + 1,
      standard_sets: sets.length + 1,
      standard_items: items.length + 1,
      upcoming_meets: 100,
    },
    meta: {
      seedDateMs: baseMs,
      user: {
        full_name: "Demo Parent",
        email: DEMO_USER_EMAIL,
      },
    },
  };
}
