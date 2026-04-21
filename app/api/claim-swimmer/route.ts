import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SEED_USER_ID = process.env.SEED_USER_ID ?? "";

export async function POST(req: NextRequest) {
  // ── 1. Authenticate the calling parent ──────────────────────────────────
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

  const { name, age, gender, swim_club, school } = await req.json();
  if (!name || !age) {
    return NextResponse.json({ error: "Name and age are required" }, { status: 400 });
  }

  const parentId = user.id;
  const ageNum = Number(age);
  let primarySwimmerId: number | null = null;
  let claimed = false;

  // ── 2. Try to find matching seed swimmer ────────────────────────────────
  if (SEED_USER_ID) {
    const { data: seedMatch } = await supabaseAdmin
      .from("swimmers")
      .select("*")
      .eq("user_id", SEED_USER_ID)
      .ilike("name", name.trim())
      .eq("age", ageNum)
      .maybeSingle();

    if (seedMatch) {
      const { data: claimedSwimmer } = await supabaseAdmin
        .from("swimmers")
        .update({
          user_id: parentId,
          group_type: "primary",
          gender: gender || seedMatch.gender,
          swim_club: swim_club || seedMatch.swim_club,
          school: school || seedMatch.school,
          status: "Active",
        })
        .eq("id", seedMatch.id)
        .select("id")
        .single();

      if (claimedSwimmer) {
        primarySwimmerId = claimedSwimmer.id;
        claimed = true;
      }
    }
  }

  // ── 3. Create fresh swimmer if not claimed from seed ────────────────────
  if (!primarySwimmerId) {
    const { data: newSwimmer, error: insertError } = await supabaseAdmin
      .from("swimmers")
      .insert({
        user_id: parentId,
        name: name.trim(),
        age: ageNum,
        gender: gender || null,
        swim_club: swim_club?.trim() || null,
        school: school?.trim() || null,
        group_type: "primary",
        status: "Active",
        country: "Singapore",
      })
      .select("id")
      .single();

    if (insertError || !newSwimmer) {
      return NextResponse.json({ error: insertError?.message ?? "Failed to create swimmer" }, { status: 500 });
    }
    primarySwimmerId = newSwimmer.id;
  }

  // ── 4. Auto-follow seed competitors + copy their times ──────────────────
  let competitorsAdded = 0;
  if (SEED_USER_ID) {
    let query = supabaseAdmin
      .from("swimmers")
      .select("id, name, age, gender, swim_club, school, country")
      .eq("user_id", SEED_USER_ID)
      .eq("age", ageNum);

    if (gender) query = query.eq("gender", gender);

    const { data: competitors } = await query;

    if (competitors && competitors.length > 0) {
      for (const c of competitors) {
        // Skip if same name as primary swimmer
        if (c.name.toLowerCase() === name.trim().toLowerCase()) continue;

        // Check if already following
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
          // Insert the following swimmer
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
          competitorsAdded++;
        }

        // ── Copy swim times from seed swimmer to new following swimmer ──
        const { data: seedTimes } = await supabaseAdmin
          .from("swim_times")
          .select("event, course, time_ms, meet_name, meet_date, swam_at, place, meet_type, notes")
          .eq("swimmer_id", c.id);

        if (seedTimes && seedTimes.length > 0) {
          // Only insert times that don't already exist
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
      }
    }
  }

  return NextResponse.json({ success: true, claimed, primarySwimmerId, competitorsAdded });
}