import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Meet results store names as "Last, First". Natrix shows "First Last".
function displayName(raw: string): string {
  const idx = raw.indexOf(",");
  const flipped = idx > -1 ? `${raw.slice(idx + 1).trim()} ${raw.slice(0, idx).trim()}` : raw.trim();
  return flipped.replace(/\s+/g, " ");
}

// A handful of rows are ALL CAPS in the source data; tidy those only.
function tidyCase(s: string): string {
  return s === s.toUpperCase()
    ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : s;
}

export async function POST(req: NextRequest) {
  // 1. Authenticate the parent (same pattern as the other API routes)
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

  // 2. Read and sanity-check the request
  let body: { swimmerName?: unknown; teamName?: unknown; age?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const swimmerName = typeof body.swimmerName === "string" ? body.swimmerName.trim() : "";
  const teamName = typeof body.teamName === "string" ? body.teamName.trim() : "";
  const rawAge = Number(body.age);
  const age = Number.isInteger(rawAge) && rawAge >= 4 && rawAge <= 80 ? rawAge : null;

  if (!swimmerName || !teamName) {
    return NextResponse.json({ error: "Swimmer name and club are required" }, { status: 400 });
  }

  // 3. Never trust the browser: confirm this swimmer + club really exists in the results
  const { data: found, error: findError } = await supabase
    .from("meet_results")
    .select("swimmer_name")
    .eq("swimmer_name", swimmerName)
    .eq("team_name", teamName)
    .limit(1);

  if (findError || !found || found.length === 0) {
    return NextResponse.json({ error: "We couldn't find that swimmer in the results" }, { status: 404 });
  }

  const name = tidyCase(displayName(swimmerName));

  // 4. Already following this swimmer? Same name + age within 1 year counts as the same
  //    swimmer. Club is not used: older follows store acronyms (e.g. "APSC").
  const escapedName = name.replace(/[\\%_]/g, "\\$&");
  const { data: sameName } = await supabase
    .from("swimmers")
    .select("id, age")
    .eq("user_id", user.id)
    .eq("group_type", "following")
    .ilike("name", escapedName);

  const existing = (sameName ?? []).find(
    (s) => age === null || s.age === null || Math.abs(s.age - age) <= 1
  );

  if (existing) {
    return NextResponse.json({ success: true, swimmerId: existing.id, alreadyFollowing: true });
  }

  // 5. Create the Following swimmer. It belongs to this parent only.
  const { data: inserted, error: insertError } = await supabase
    .from("swimmers")
    .insert({
      user_id: user.id,
      name,
      age,
      swim_club: teamName,
      country: "Singapore",
      group_type: "following",
      status: "Active",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? "Couldn't follow that swimmer" },
      { status: 500 }
    );
  }

  // 6. Link their results using the existing, already-tested matching function.
  //    If this step fails the follow still succeeded, so we report it but don't fail.
  const { error: linkError } = await supabase.rpc("confirm_swimmer_match", {
    p_swimmer_id: inserted.id,
    p_matched_name: swimmerName,
    p_action: "confirm",
  });

  if (linkError) {
    console.error("follow-result-swimmer: result linking failed", linkError.message);
  }

  return NextResponse.json({
    success: true,
    swimmerId: inserted.id,
    linked: !linkError,
  });
}
