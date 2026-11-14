import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { printedNameMatchesSwimmer } from "@/lib/startListParser";

// Admin-only. After a start list is saved, copy each matching swimmer's races
// into meet_events for every parent who has that swimmer under My Swimmers,
// so reminders and the Meets page work without the parent opening the meet.

const ADMIN_USER_ID = "9156c797-d133-4a7f-aa93-03688f2bdfd1";

type CentralEntry = {
  event_date: string | null;
  event_number: number;
  event_name: string;
  distance: number | null;
  stroke: string | null;
  heat: number | null;
  lane: number | null;
  seed_time: string | null;
  start_time: string | null;
  swimmer_name: string;
};

const wordCount = (n: string) => n.trim().split(/\s+/).length;

export async function POST(req: NextRequest) {
  // ── Only you can run this ───────────────────────────────────────────────
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.id !== ADMIN_USER_ID) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { meetId?: string; eventDate?: string; eventNumbers?: number[] } = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const meetId = body.meetId;
  if (!meetId) return NextResponse.json({ error: "meetId is required" }, { status: 400 });

  try {
    // ── 1) The central start list entries just saved ─────────────────────
    const entries: CentralEntry[] = [];
    for (let from = 0; ; from += 1000) {
      let q = supabaseAdmin
        .from("meet_start_list_entries")
        .select("event_date, event_number, event_name, distance, stroke, heat, lane, seed_time, start_time, swimmer_name")
        .eq("meet_id", meetId);
      if (body.eventDate) q = q.eq("event_date", body.eventDate);
      if (body.eventNumbers && body.eventNumbers.length > 0) q = q.in("event_number", body.eventNumbers);
      const { data, error } = await q.order("event_number", { ascending: true }).range(from, from + 999);
      if (error) throw new Error(`Read start list: ${error.message}`);
      entries.push(...((data ?? []) as CentralEntry[]));
      if (!data || data.length < 1000) break;
    }
    if (entries.length === 0) return NextResponse.json({ added: 0, accounts: 0, swimmers: 0, entries: 0 });

    // ── 2) Every account's "My Swimmers" (not follows) ───────────────────
    const owners = new Map<string, Set<string>>(); // swimmer name -> user ids
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("swimmers")
        .select("user_id, name")
        .eq("group_type", "primary")
        .range(from, from + 999);
      if (error) throw new Error(`Read swimmers: ${error.message}`);
      for (const s of (data ?? []) as { user_id: string; name: string }[]) {
        if (!s.name) continue;
        if (!owners.has(s.name)) owners.set(s.name, new Set());
        owners.get(s.name)!.add(s.user_id);
      }
      if (!data || data.length < 1000) break;
    }
    const allNames = [...owners.keys()];

    // ── 3) Match printed names to My Swimmers, build meet_events rows ────
    const rowsByKey = new Map<string, Record<string, unknown>>();
    const matchedNames = new Set<string>();
    for (const en of entries) {
      let best: string | null = null;
      for (const name of allNames) {
        if (!printedNameMatchesSwimmer(en.swimmer_name, name)) continue;
        if (best === null || wordCount(name) > wordCount(best)) best = name;
      }
      if (best === null) continue;
      matchedNames.add(best);
      const key = `${best}|${en.event_number}`;
      if (rowsByKey.has(key)) continue;
      rowsByKey.set(key, {
        meet_id: meetId,
        swimmer_name: best,
        event_number: en.event_number,
        event_name: en.event_name,
        distance: en.distance ?? 0,
        stroke: en.stroke ?? "",
        heat: en.heat,
        lane: en.lane,
        seed_time: en.seed_time,
        start_time: en.start_time,
        event_date: en.event_date,
      });
    }
    const rows = [...rowsByKey.values()];

    const accounts = new Set<string>();
    for (const n of matchedNames) for (const u of owners.get(n) ?? []) accounts.add(u);

    if (rows.length === 0) {
      return NextResponse.json({ added: 0, accounts: 0, swimmers: 0, entries: entries.length });
    }

    // ── 4) Add only what's missing (never overwrite an existing race) ────
    let added = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { data, error } = await supabaseAdmin
        .from("meet_events")
        .upsert(chunk, { onConflict: "meet_id,swimmer_name,event_number", ignoreDuplicates: true })
        .select("swimmer_name");

      if (!error) { added += data?.length ?? 0; continue; }

      // If the table also stores an owner (user_id), retry once with one.
      const withOwner = chunk.map((r) => ({
        ...r,
        user_id: [...(owners.get(r.swimmer_name as string) ?? [])][0],
      }));
      const retry = await supabaseAdmin
        .from("meet_events")
        .upsert(withOwner, { onConflict: "meet_id,swimmer_name,event_number", ignoreDuplicates: true })
        .select("swimmer_name");
      if (retry.error) throw new Error(`Save events: ${error.message} / ${retry.error.message}`);
      added += retry.data?.length ?? 0;
    }

    return NextResponse.json({
      added,
      accounts: accounts.size,
      swimmers: matchedNames.size,
      entries: entries.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
