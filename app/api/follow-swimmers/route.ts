import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SEED_USER_ID = process.env.SEED_USER_ID ?? "";

export async function POST(req: NextRequest) {
  // ── 1. Authenticate the calling parent ──────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { competitorIds } = await req.json();

  if (!Array.isArray(competitorIds) || competitorIds.length === 0) {
    return NextResponse.json({ success: true, followed: 0 });
  }

  if (!SEED_USER_ID) {
    return NextResponse.json({ error: "Follow source not configured" }, { status: 500 });
  }

  const parentId = user.id;

  // Only trust ids that actually belong to the seed competitor pool --
  // never take name/age/club fields from the request body directly.
  const { data: competitors } = await supabaseAdmin
    .from("swimmers")
    .select("id, name, age, gender, swim_club, school, country")
    .eq("user_id", SEED_USER_ID)
    .in("id", competitorIds);

  let followedCount = 0;

  for (const c of competitors ?? []) {
    const { data: existing } = await supabaseAdmin
      .from("swimmers")
      .select("id")
      .eq("user_id", parentId)
      .eq("name", c.name)
      .eq("age", c.age)
      .maybeSingle();

    let newSwimmerId: number;

    if (existing) {
      newSwimmerId = existing.id;
    } else {
      const { data: inserted } = await supabaseAdmin
        .from("swimmers")
        .insert({
          user_id: parentId,
          name: c.name,
          age: c.age,
          gender: c.gender,
          swim_club: c.swim_club,
          school: c.school,
          country: c.country ?? "Singapore",
          group_type: "following",
          status: "Active",
        })
        .select("id")
        .single();

      if (!inserted) continue;
      newSwimmerId = inserted.id;
      followedCount++;
    }

    // Copy swim times from seed swimmer to new following swimmer
    const { data: seedTimes } = await supabaseAdmin
      .from("swim_times")
      .select("event, course, time_ms, meet_name, meet_date, swam_at, place, meet_type, notes")
      .eq("swimmer_id", c.id);

    if (seedTimes && seedTimes.length > 0) {
      const { data: existingTimes } = await supabaseAdmin
        .from("swim_times")
        .select("event, swam_at")
        .eq("swimmer_id", newSwimmerId);

      const existingKeys = new Set(
        (existingTimes ?? []).map((t) => `${t.event}|${t.swam_at}`)
      );

      const timesToInsert = seedTimes
        .filter((t) => !existingKeys.has(`${t.event}|${t.swam_at}`))
        .map((t) => ({
          swimmer_id: newSwimmerId,
          event: t.event,
          course: t.course,
          time_ms: t.time_ms,
          meet_name: t.meet_name,
          meet_date: t.meet_date,
          swam_at: t.swam_at,
          place: t.place,
          meet_type: t.meet_type ?? "CLUB",
          notes: t.notes ?? null,
        }));

      if (timesToInsert.length > 0) {
        await supabaseAdmin.from("swim_times").insert(timesToInsert);
      }
    }

    // Also check the real, automatically-scraped SGAquatics results
    // (meet_results) for this exact competitor and link/copy them into
    // swim_times too -- reuses confirm_swimmer_match (already built and
    // tested for the "add my own swimmer" flow) rather than duplicating
    // its matching/canonicalization logic here.
    //
    // No "is this you?" confirmation is needed for a followed swimmer --
    // unlike a parent's own child, this is a specific, already-identified
    // person the parent deliberately picked from a list, not an ambiguous
    // name match. confirm_swimmer_match's normalize_swimmer_name() call
    // handles the "First Last" (Natrix) vs "Last, First" (Hy-Tek) format
    // difference on both sides, so passing the plain seed name through
    // works correctly without any reformatting here.
    //
    // Must run through the user-session `supabase` client, not
    // `supabaseAdmin` -- confirm_swimmer_match is SECURITY DEFINER and
    // checks auth.uid() against swimmers.user_id internally; calling it
    // with the service-role client would have no JWT for auth.uid() to
    // read, and the ownership check would fail.
    await supabase.rpc("confirm_swimmer_match", {
      p_swimmer_id: newSwimmerId,
      p_matched_name: c.name,
      p_action: "confirm",
    });
    // Deliberately not checking this call's error -- a followed competitor
    // with zero SGAquatics results yet is a normal, non-error case (the
    // RPC's updates simply match zero rows), and a transient failure here
    // shouldn't block the follow action itself, which already succeeded
    // above via the swim_times copy.
  }

  return NextResponse.json({ success: true, followed: followedCount });
}
