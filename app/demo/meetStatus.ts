// app/demo/meetStatus.ts
//
// Works out whether a demo meet is upcoming or past, so a meet whose dates have
// already gone by is never labelled "upcoming". It only reads the dates; it
// never changes them.

import { useMemo, useSyncExternalStore } from "react";
import type { DemoMeet } from "@/lib/demoData";

// A meet counts as past once the end of its last day has gone by (local time).
export function isMeetPast(meet: Pick<DemoMeet, "endDate">, now: Date): boolean {
  const endOfLastDay = new Date(`${meet.endDate}T23:59:59`);
  return endOfLastDay.getTime() < now.getTime();
}

// Upcoming: soonest first. Past: most recent first.
export function splitMeetsByStatus(meets: DemoMeet[], now: Date): { upcoming: DemoMeet[]; past: DemoMeet[] } {
  const byStart = (a: DemoMeet, b: DemoMeet) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  const upcoming = meets.filter((m) => !isMeetPast(m, now)).sort(byStart);
  const past = meets.filter((m) => isMeetPast(m, now)).sort((a, b) => byStart(b, a));
  return { upcoming, past };
}

// The current time, available only in the browser. The demo pages are
// pre-built, so reading the clock during the build would bake in the build date.
// On the server (and during hydration) this returns null; callers should render
// nothing date-dependent until it returns a Date. The time is read once per
// page load so the value stays stable between renders.
let clientNowMs: number | null = null;
const subscribeNever = () => () => {};
const getClientNowMs = (): number => (clientNowMs ??= Date.now());
const getServerNowMs = (): number | null => null;

export function useNow(): Date | null {
  const ms = useSyncExternalStore<number | null>(subscribeNever, getClientNowMs, getServerNowMs);
  return useMemo(() => (ms === null ? null : new Date(ms)), [ms]);
}
