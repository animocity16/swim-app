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

  const { name, age, gender, swim_club, school, squad } = await req.json();
  if (!name || !age) {
    return NextResponse.json({ error: "Name and age are required" }, { status: 400 });
  }

  const parentId = user.id;
  const ageNum = Number(age);
  let primarySwimmerId: number | null = null;
  let claimed = false;

  // ── 2. Try to find matching seed swimmer ────────────────────────────────────
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
          squad: squad?.trim() || seedMatch.squad || null,
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

  // ── 3. Create fresh swimmer if not claimed from seed ────────────────────────
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
        squad: squad?.trim() || null,
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

  // ── 4. Find candidate competitors (same age + gender) ───────────────────────
  // Previously this block auto-created a "following" swimmer + copied swim
  // times for every single match -- sometimes 40+ swimmers at once with no
  // way to opt out. Now it just returns candidates; the parent picks who to
  // follow on the next onboarding step, and /api/follow-swimmers does the
  // actual creating for only the ones they chose.
  let candidates: Array<{
    id: number;
    name: string;
    age: number;
    gender: string | null;
    swim_club: string | null;
    school: string | null;
  }> = [];

  if (SEED_USER_ID) {
    let query = supabaseAdmin
      .from("swimmers")
      .select("id, name, age, gender, swim_club, school")
      .eq("user_id", SEED_USER_ID)
      .eq("age", ageNum);

    if (gender) query = query.eq("gender", gender);

    const { data: competitors } = await query;

    candidates = (competitors ?? []).filter(
      (c) => c.name.toLowerCase() !== name.trim().toLowerCase()
    );
  }

  return NextResponse.json({ success: true, claimed, primarySwimmerId, candidates });
}
