import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pushIsConfigured, sendPush } from "@/lib/webPush";
import { namesMatch, parseClockToMinutes, zonedToUtcMs } from "@/lib/reminderTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called once a minute by Supabase (see supabase/push_reminders_cron.sql).
// Finds swims starting soon and sends "Time to report to call room".

type SubRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
  lead_minutes: number;
};

type EventRow = {
  id: string | number;
  meet_id: string;
  swimmer_name: string;
  event_number: number;
  event_name: string;
  heat: number | null;
  lane: number | null;
  start_time: string | null;
  event_date: string | null;
};

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pushIsConfigured()) {
    return NextResponse.json({ error: "Push keys not set" }, { status: 503 });
  }

  const nowMs = Date.now();

  // 1) Who has reminders turned on?
  const { data: subsData } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, tz, lead_minutes");
  const subs = (subsData ?? []) as SubRow[];
  if (subs.length === 0) return NextResponse.json({ checked: 0, sent: 0 });

  // 2) Their own swimmers (My Swimmers only, not ones they just follow).
  const userIds = Array.from(new Set(subs.map((s) => s.user_id)));
  const { data: swimmerData } = await supabaseAdmin
    .from("swimmers")
    .select("user_id, name")
    .in("user_id", userIds)
    .eq("group_type", "primary");
  const namesByUser = new Map<string, string[]>();
  for (const s of (swimmerData ?? []) as { user_id: string; name: string }[]) {
    if (!s.name) continue;
    namesByUser.set(s.user_id, [...(namesByUser.get(s.user_id) ?? []), s.name]);
  }

  // 3) Events happening around now. Window is wide on purpose so every time
  //    zone is covered; the exact minute is worked out per phone below.
  const from = ymd(nowMs - 24 * 3600 * 1000);
  const to = ymd(nowMs + 36 * 3600 * 1000);
  const eventCols =
    "id, meet_id, swimmer_name, event_number, event_name, heat, lane, start_time, event_date";

  const { data: datedData } = await supabaseAdmin
    .from("meet_events")
    .select(eventCols)
    .gte("event_date", from)
    .lte("event_date", to)
    .not("start_time", "is", null);

  // Older events with "Day not set": only trusted when the meet is one day.
  const { data: meetData } = await supabaseAdmin
    .from("upcoming_meets")
    .select("id, start_date, end_date")
    .gte("start_date", from)
    .lte("start_date", to);
  const singleDayMeetDates = new Map<string, string>();
  for (const m of (meetData ?? []) as { id: string; start_date: string; end_date: string | null }[]) {
    const start = m.start_date.slice(0, 10);
    if (!m.end_date || m.end_date.slice(0, 10) === start) singleDayMeetDates.set(m.id, start);
  }
  let undated: EventRow[] = [];
  if (singleDayMeetDates.size > 0) {
    const { data } = await supabaseAdmin
      .from("meet_events")
      .select(eventCols)
      .in("meet_id", Array.from(singleDayMeetDates.keys()))
      .is("event_date", null)
      .not("start_time", "is", null);
    undated = (data ?? []) as EventRow[];
  }

  const events: (EventRow & { day: string })[] = [
    ...((datedData ?? []) as EventRow[]).map((e) => ({ ...e, day: e.event_date as string })),
    ...undated.map((e) => ({ ...e, day: singleDayMeetDates.get(e.meet_id) as string })),
  ];

  // 4) Match, time-check, claim, send.
  let sent = 0;
  for (const sub of subs) {
    const myNames = namesByUser.get(sub.user_id) ?? [];
    if (myNames.length === 0) continue;

    for (const ev of events) {
      if (!myNames.some((n) => namesMatch(n, ev.swimmer_name))) continue;

      const mins = parseClockToMinutes(ev.start_time);
      if (mins === null) continue;
      const swimMs = zonedToUtcMs(ev.day, mins, sub.tz);
      if (swimMs === null) continue;

      const remindAtMs = swimMs - sub.lead_minutes * 60000;
      if (nowMs < remindAtMs || nowMs >= swimMs) continue;

      // One reminder per parent per swim, even if this runs twice.
      const eventKey = String(ev.id);
      const { data: claimed } = await supabaseAdmin
        .from("reminder_log")
        .upsert(
          { user_id: sub.user_id, event_id: eventKey },
          { onConflict: "user_id,event_id", ignoreDuplicates: true }
        )
        .select("event_id");
      if (!claimed || claimed.length === 0) continue;

      const detail = [
        `Event ${ev.event_number}`,
        ev.event_name,
        ev.heat && ev.lane ? `Heat ${ev.heat}, Lane ${ev.lane}` : null,
        `swims ~${ev.start_time!.replace("~", "").trim()}`,
      ]
        .filter(Boolean)
        .join(" · ");

      const ok = await sendPush(sub, {
        title: "Time to report to call room",
        body: `${ev.swimmer_name}: ${detail}`,
        url: `/meets/upcoming/${ev.meet_id}`,
        tag: `swim-${eventKey}`,
      });

      if (ok) {
        sent++;
      } else {
        // Didn't go through — free the slot so the next minute tries again.
        await supabaseAdmin
          .from("reminder_log")
          .delete()
          .eq("user_id", sub.user_id)
          .eq("event_id", eventKey);
      }
    }
  }

  // Tidy: the log only matters for recent swims.
  if (new Date(nowMs).getUTCMinutes() === 0) {
    await supabaseAdmin
      .from("reminder_log")
      .delete()
      .lt("sent_at", new Date(nowMs - 3 * 24 * 3600 * 1000).toISOString());
  }

  return NextResponse.json({ checked: events.length, sent });
}

export const GET = handle;
export const POST = handle;
