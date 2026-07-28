// lib/demoData.ts
// Fully self-contained fake dataset for the public "Try Demo" experience.
// Nothing in this file ever touches Supabase — it's pure static data so the
// demo is safe to expose with no login and can never be corrupted by visitors.

export type DemoSwimmer = {
  id: number;
  name: string;
  age: number;
  gender: "Male" | "Female";
  swim_club: string;
  school: string;
  squad: string;
  group_type: "primary" | "following";
};

export type DemoSplit = {
  no: number;      // length number, e.g. 1, 2, 3...
  legMs: number;    // time for that length alone
  cumMs: number;    // cumulative time at that length
};

export type DemoTime = {
  id: number;
  swimmer_id: number;
  event: string;       // e.g. "100 Free"
  course: "LCM" | "SCM";
  time_ms: number;
  swam_at: string;      // ISO date
  meet_name: string;
  place?: number;
  is_pb?: boolean;
  splits?: DemoSplit[];
};

export type DemoStandard = {
  event: string;
  course: "LCM" | "SCM";
  squad: string;
  label: string;       // e.g. "Gold", "National Qualifying"
  cutoffMs: number;
};

export type DemoMeetEvent = {
  event: string;
  stroke: string;
  heat: number;
  lane: number;
  startTime: string; // e.g. "9:15 AM"
};

export type DemoMeet = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  meetType: "SNAG" | "ETC" | "NSG" | "NSC";
  location: string;
  swimmerEvents?: DemoMeetEvent[]; // events for the primary demo swimmer
};

// ─── Time helpers ───────────────────────────────────────────────────────────

function t(min: number, sec: number): number {
  return Math.round((min * 60 + sec) * 1000);
}

// ─── Swimmers ───────────────────────────────────────────────────────────────
// 1 primary (the demo "your child") + 10 followed swimmers, spread across
// clubs/schools so club/school filtering and NSG-style sorting has something
// real to show.

export const DEMO_SWIMMERS: DemoSwimmer[] = [
  { id: 1,  name: "Miki Tan",       age: 11, gender: "Female", swim_club: "Aquastars SC",  school: "Nan Hua Primary",    squad: "Competitive", group_type: "primary" },
  { id: 2,  name: "Chloe Lim",      age: 11, gender: "Female", swim_club: "Aquastars SC",  school: "Nan Hua Primary",    squad: "Competitive", group_type: "following" },
  { id: 3,  name: "Ryan Koh",       age: 12, gender: "Male",   swim_club: "Aquastars SC",  school: "Ai Tong School",     squad: "Competitive", group_type: "following" },
  { id: 4,  name: "Sophia Ng",      age: 10, gender: "Female", swim_club: "Dolphins SC",   school: "Rosyth School",      squad: "Development", group_type: "following" },
  { id: 5,  name: "Ethan Tan",      age: 11, gender: "Male",   swim_club: "Dolphins SC",   school: "Nan Hua Primary",    squad: "Development", group_type: "following" },
  { id: 6,  name: "Ava Wong",       age: 12, gender: "Female", swim_club: "Marlins SC",    school: "Henry Park Primary", squad: "Competitive", group_type: "following" },
  { id: 7,  name: "Jayden Lee",     age: 11, gender: "Male",   swim_club: "Marlins SC",    school: "Ai Tong School",     squad: "Competitive", group_type: "following" },
  { id: 8,  name: "Isabelle Chua",  age: 10, gender: "Female", swim_club: "Aquastars SC",  school: "Rosyth School",      squad: "Development", group_type: "following" },
  { id: 9,  name: "Marcus Goh",     age: 12, gender: "Male",   swim_club: "Barracudas SC", school: "Henry Park Primary", squad: "Competitive", group_type: "following" },
  { id: 10, name: "Natalie Teo",    age: 11, gender: "Female", swim_club: "Barracudas SC", school: "Nan Hua Primary",    squad: "Competitive", group_type: "following" },
  { id: 11, name: "Kai Ong",        age: 10, gender: "Male",   swim_club: "Dolphins SC",   school: "Ai Tong School",     squad: "Development", group_type: "following" },
];

export const DEMO_PRIMARY_SWIMMER_ID = 1;

// ─── Swim times ─────────────────────────────────────────────────────────────
// Miki (id 1) gets a full history across several events so the progression
// graph, splits table and standards tab all have something meaningful to
// show. Everyone else gets enough PBs to make Compare feel real.

let _id = 1;
const nextId = () => _id++;

export const DEMO_TIMES: DemoTime[] = [
  // ── Miki Tan — 100 Free progression (with splits on most recent) ─────────
  { id: nextId(), swimmer_id: 1, event: "100 Free", course: "LCM", time_ms: t(1, 28.40), swam_at: "2025-08-10", meet_name: "August Age Group Meet" },
  { id: nextId(), swimmer_id: 1, event: "100 Free", course: "LCM", time_ms: t(1, 24.90), swam_at: "2025-11-16", meet_name: "November SNAG Meet" },
  { id: nextId(), swimmer_id: 1, event: "100 Free", course: "LCM", time_ms: t(1, 21.75), swam_at: "2026-02-22", meet_name: "February Championships" },
  {
    id: nextId(), swimmer_id: 1, event: "100 Free", course: "LCM", time_ms: t(1, 18.30),
    swam_at: "2026-06-14", meet_name: "June Invitational", place: 2, is_pb: true,
    splits: [
      { no: 1, legMs: t(0, 37.60), cumMs: t(0, 37.60) },
      { no: 2, legMs: t(0, 40.70), cumMs: t(1, 18.30) },
    ],
  },

  // ── Miki Tan — 200 Free ───────────────────────────────────────────────────
  { id: nextId(), swimmer_id: 1, event: "200 Free", course: "LCM", time_ms: t(3, 5.10), swam_at: "2025-09-14", meet_name: "September Meet" },
  { id: nextId(), swimmer_id: 1, event: "200 Free", course: "LCM", time_ms: t(2, 58.40), swam_at: "2026-01-18", meet_name: "January Meet" },
  {
    id: nextId(), swimmer_id: 1, event: "200 Free", course: "LCM", time_ms: t(2, 52.85),
    swam_at: "2026-06-14", meet_name: "June Invitational", place: 3, is_pb: true,
    splits: [
      { no: 1, legMs: t(0, 39.10), cumMs: t(0, 39.10) },
      { no: 2, legMs: t(0, 43.40), cumMs: t(1, 22.50) },
      { no: 3, legMs: t(0, 44.90), cumMs: t(2, 7.40) },
      { no: 4, legMs: t(0, 45.45), cumMs: t(2, 52.85) },
    ],
  },

  // ── Miki Tan — 50 Free ────────────────────────────────────────────────────
  { id: nextId(), swimmer_id: 1, event: "50 Free", course: "LCM", time_ms: t(0, 34.80), swam_at: "2025-08-10", meet_name: "August Age Group Meet" },
  { id: nextId(), swimmer_id: 1, event: "50 Free", course: "LCM", time_ms: t(0, 32.10), swam_at: "2026-02-22", meet_name: "February Championships" },
  { id: nextId(), swimmer_id: 1, event: "50 Free", course: "LCM", time_ms: t(0, 30.95), swam_at: "2026-06-14", meet_name: "June Invitational", place: 1, is_pb: true },

  // ── Miki Tan — 100 Back ───────────────────────────────────────────────────
  { id: nextId(), swimmer_id: 1, event: "100 Back", course: "LCM", time_ms: t(1, 38.20), swam_at: "2025-09-14", meet_name: "September Meet" },
  { id: nextId(), swimmer_id: 1, event: "100 Back", course: "LCM", time_ms: t(1, 32.60), swam_at: "2026-01-18", meet_name: "January Meet" },
  {
    id: nextId(), swimmer_id: 1, event: "100 Back", course: "LCM", time_ms: t(1, 29.45),
    swam_at: "2026-06-14", meet_name: "June Invitational", place: 4, is_pb: true,
    splits: [
      { no: 1, legMs: t(0, 43.90), cumMs: t(0, 43.90) },
      { no: 2, legMs: t(0, 45.55), cumMs: t(1, 29.45) },
    ],
  },

  // ── Miki Tan — 100 Breast ─────────────────────────────────────────────────
  { id: nextId(), swimmer_id: 1, event: "100 Breast", course: "LCM", time_ms: t(1, 48.90), swam_at: "2025-11-16", meet_name: "November SNAG Meet" },
  { id: nextId(), swimmer_id: 1, event: "100 Breast", course: "LCM", time_ms: t(1, 43.20), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },

  // ── Miki Tan — 100 IM (splits, 4 legs) ────────────────────────────────────
  { id: nextId(), swimmer_id: 1, event: "100 IM", course: "LCM", time_ms: t(1, 32.40), swam_at: "2025-11-16", meet_name: "November SNAG Meet" },
  {
    id: nextId(), swimmer_id: 1, event: "100 IM", course: "LCM", time_ms: t(1, 26.80),
    swam_at: "2026-06-14", meet_name: "June Invitational", place: 2, is_pb: true,
    splits: [
      { no: 1, legMs: t(0, 20.10), cumMs: t(0, 20.10) },
      { no: 2, legMs: t(0, 22.90), cumMs: t(0, 43.00) },
      { no: 3, legMs: t(0, 25.30), cumMs: t(1, 8.30) },
      { no: 4, legMs: t(0, 18.50), cumMs: t(1, 26.80) },
    ],
  },

  // ── Miki Tan — 50 Fly ─────────────────────────────────────────────────────
  { id: nextId(), swimmer_id: 1, event: "50 Fly", course: "LCM", time_ms: t(0, 39.60), swam_at: "2025-09-14", meet_name: "September Meet" },
  { id: nextId(), swimmer_id: 1, event: "50 Fly", course: "LCM", time_ms: t(0, 37.05), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },

  // ── The other 10 swimmers — enough PBs across shared events for Compare ──
  { id: nextId(), swimmer_id: 2, event: "50 Free",  course: "LCM", time_ms: t(0, 31.40), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },
  { id: nextId(), swimmer_id: 2, event: "100 Free", course: "LCM", time_ms: t(1, 16.20), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },
  { id: nextId(), swimmer_id: 2, event: "100 Back", course: "LCM", time_ms: t(1, 33.80), swam_at: "2026-02-22", meet_name: "February Championships", is_pb: true },

  { id: nextId(), swimmer_id: 3, event: "50 Free",  course: "LCM", time_ms: t(0, 29.85), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true, place: 1 },
  { id: nextId(), swimmer_id: 3, event: "100 Free", course: "LCM", time_ms: t(1, 9.40),  swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true, place: 1 },
  { id: nextId(), swimmer_id: 3, event: "100 IM",   course: "LCM", time_ms: t(1, 22.10), swam_at: "2026-02-22", meet_name: "February Championships", is_pb: true },

  { id: nextId(), swimmer_id: 4, event: "50 Free",  course: "LCM", time_ms: t(0, 36.90), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },
  { id: nextId(), swimmer_id: 4, event: "100 Breast", course: "LCM", time_ms: t(1, 52.60), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },

  { id: nextId(), swimmer_id: 5, event: "100 Free", course: "LCM", time_ms: t(1, 25.30), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },
  { id: nextId(), swimmer_id: 5, event: "50 Fly",   course: "LCM", time_ms: t(0, 40.20), swam_at: "2026-02-22", meet_name: "February Championships", is_pb: true },

  { id: nextId(), swimmer_id: 6, event: "50 Free",  course: "LCM", time_ms: t(0, 30.60), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true, place: 2 },
  { id: nextId(), swimmer_id: 6, event: "100 Back", course: "LCM", time_ms: t(1, 27.90), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true, place: 1 },

  { id: nextId(), swimmer_id: 7, event: "100 Free", course: "LCM", time_ms: t(1, 20.50), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },
  { id: nextId(), swimmer_id: 7, event: "100 IM",   course: "LCM", time_ms: t(1, 24.75), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },

  { id: nextId(), swimmer_id: 8, event: "50 Free",  course: "LCM", time_ms: t(0, 38.10), swam_at: "2026-02-22", meet_name: "February Championships", is_pb: true },
  { id: nextId(), swimmer_id: 8, event: "100 Breast", course: "LCM", time_ms: t(1, 58.40), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },

  { id: nextId(), swimmer_id: 9, event: "100 Free", course: "LCM", time_ms: t(1, 12.60), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true, place: 3 },
  { id: nextId(), swimmer_id: 9, event: "50 Fly",   course: "LCM", time_ms: t(0, 34.40), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true, place: 1 },

  { id: nextId(), swimmer_id: 10, event: "50 Free", course: "LCM", time_ms: t(0, 32.75), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },
  { id: nextId(), swimmer_id: 10, event: "100 Back", course: "LCM", time_ms: t(1, 36.10), swam_at: "2026-02-22", meet_name: "February Championships", is_pb: true },

  { id: nextId(), swimmer_id: 11, event: "50 Free", course: "LCM", time_ms: t(0, 39.90), swam_at: "2026-06-14", meet_name: "June Invitational", is_pb: true },
  { id: nextId(), swimmer_id: 11, event: "100 IM",  course: "LCM", time_ms: t(1, 38.60), swam_at: "2026-02-22", meet_name: "February Championships", is_pb: true },
];

// ─── Standards (upgrading timings) ─────────────────────────────────────────
// A small reference table Miki's tab checks her times against.

export const DEMO_STANDARDS: DemoStandard[] = [
  { event: "50 Free",  course: "LCM", squad: "Competitive", label: "Squad Upgrade", cutoffMs: t(0, 29.50) },
  { event: "100 Free", course: "LCM", squad: "Competitive", label: "Squad Upgrade", cutoffMs: t(1, 15.00) },
  { event: "100 Free", course: "LCM", squad: "Competitive", label: "NSG Qualifying", cutoffMs: t(1, 20.00) },
  { event: "200 Free", course: "LCM", squad: "Competitive", label: "Squad Upgrade", cutoffMs: t(2, 48.00) },
  { event: "100 Back", course: "LCM", squad: "Competitive", label: "Squad Upgrade", cutoffMs: t(1, 28.00) },
  { event: "100 Breast", course: "LCM", squad: "Competitive", label: "Squad Upgrade", cutoffMs: t(1, 40.00) },
  { event: "100 IM",   course: "LCM", squad: "Competitive", label: "Squad Upgrade", cutoffMs: t(1, 24.00) },
];

// ─── Meets ──────────────────────────────────────────────────────────────────

export const DEMO_MEETS: DemoMeet[] = [
  {
    id: "demo-meet-1",
    name: "National Age Group Championships",
    startDate: "2026-08-15",
    endDate: "2026-08-17",
    meetType: "NSC",
    location: "OCBC Aquatic Centre",
    swimmerEvents: [
      { event: "100 Free", stroke: "Freestyle", heat: 4, lane: 5, startTime: "9:15 AM" },
      { event: "50 Free",  stroke: "Freestyle", heat: 6, lane: 3, startTime: "10:40 AM" },
      { event: "100 IM",   stroke: "Individual Medley", heat: 2, lane: 4, startTime: "2:05 PM" },
    ],
  },
  {
    id: "demo-meet-2",
    name: "SNAG Meet #4",
    startDate: "2026-09-05",
    endDate: "2026-09-05",
    meetType: "SNAG",
    location: "Toa Payoh Swimming Complex",
    swimmerEvents: [
      { event: "100 Back", stroke: "Backstroke", heat: 3, lane: 6, startTime: "8:30 AM" },
      { event: "200 Free", stroke: "Freestyle", heat: 1, lane: 2, startTime: "11:20 AM" },
    ],
  },
  {
    id: "demo-meet-3",
    name: "Inter-School NSG Zonals",
    startDate: "2026-10-02",
    endDate: "2026-10-03",
    meetType: "NSG",
    location: "Singapore Sports School",
  },
];

// ─── Helpers used across demo pages ────────────────────────────────────────

export function getDemoSwimmerById(id: number): DemoSwimmer | undefined {
  return DEMO_SWIMMERS.find((s) => s.id === id);
}

export function getDemoTimesForSwimmer(id: number): DemoTime[] {
  return DEMO_TIMES.filter((t) => t.swimmer_id === id);
}

export function formatMs(ms?: number | null): string {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2);
}

export function formatDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}
