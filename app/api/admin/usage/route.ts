import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ADMIN_USER_ID = "9156c797-d133-4a7f-aa93-03688f2bdfd1";

export type UsageRow = {
  userId: string;
  email: string;
  signedUpAt: string;
  lastSignInAt: string | null;
  swimmersAdded: number;
  timesLogged: number;
  lastTimeLoggedAt: string | null;
  notificationsReceived: number;
  isAdmin: boolean;
  isSeed: boolean;
  returned: boolean; // logged in on a different day than signup
};

export async function GET(_req: NextRequest) {
  // ── Authenticate the calling user and make sure it's you ──────────────────
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
  if (user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // ── All signed-up accounts (this needs the service-role Admin API —
    //    auth.users isn't reachable through the normal table client) ────────
    const { data: usersPage, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (usersError) throw new Error(`List users: ${usersError.message}`);

    const users = usersPage.users;

    // ── Pull every swimmer + swim_time once, then group in memory ─────────
    // (cheap at this scale — a handful of users — and avoids N+1 queries)
    const [{ data: swimmers, error: swimmersError }, { data: notifications, error: notifError }] =
      await Promise.all([
        supabaseAdmin
          .from("swimmers")
          .select("id, user_id, group_type"),
        supabaseAdmin
          .from("notifications")
          .select("user_id"),
      ]);
    if (swimmersError) throw new Error(`Fetch swimmers: ${swimmersError.message}`);
    if (notifError) throw new Error(`Fetch notifications: ${notifError.message}`);

    const primarySwimmerIdsByUser = new Map<string, number[]>();
    for (const s of swimmers ?? []) {
      if (!s.user_id || s.group_type !== "primary") continue;
      const list = primarySwimmerIdsByUser.get(s.user_id) ?? [];
      list.push(s.id);
      primarySwimmerIdsByUser.set(s.user_id, list);
    }

    const notificationCountByUser = new Map<string, number>();
    for (const n of notifications ?? []) {
      if (!n.user_id) continue;
      notificationCountByUser.set(n.user_id, (notificationCountByUser.get(n.user_id) ?? 0) + 1);
    }

    // swim_times only carries swimmer_id, so fetch them all and fold up
    // through the swimmer -> user map built above.
    const { data: swimTimes, error: timesError } = await supabaseAdmin
      .from("swim_times")
      .select("swimmer_id, created_at");
    if (timesError) throw new Error(`Fetch swim_times: ${timesError.message}`);

    const swimmerIdToUser = new Map<number, string>();
    for (const s of swimmers ?? []) {
      if (s.user_id) swimmerIdToUser.set(s.id, s.user_id);
    }

    const timesLoggedByUser = new Map<string, number>();
    const lastTimeLoggedByUser = new Map<string, string>();
    for (const t of swimTimes ?? []) {
      const uid = swimmerIdToUser.get(t.swimmer_id);
      if (!uid) continue;
      timesLoggedByUser.set(uid, (timesLoggedByUser.get(uid) ?? 0) + 1);
      const prev = lastTimeLoggedByUser.get(uid);
      if (!prev || t.created_at > prev) lastTimeLoggedByUser.set(uid, t.created_at);
    }

    const rows: UsageRow[] = users
      .map((u) => {
        const signedUpAt = u.created_at;
        const lastSignInAt = u.last_sign_in_at ?? null;
        const signedUpDay = signedUpAt?.slice(0, 10);
        const lastSignInDay = lastSignInAt?.slice(0, 10);
        return {
          userId: u.id,
          email: u.email ?? "(no email)",
          signedUpAt,
          lastSignInAt,
          swimmersAdded: primarySwimmerIdsByUser.get(u.id)?.length ?? 0,
          timesLogged: timesLoggedByUser.get(u.id) ?? 0,
          lastTimeLoggedAt: lastTimeLoggedByUser.get(u.id) ?? null,
          notificationsReceived: notificationCountByUser.get(u.id) ?? 0,
          isAdmin: u.id === ADMIN_USER_ID,
          isSeed: (u.email ?? "").endsWith("@swimnatrix.app"),
          returned: Boolean(lastSignInDay && signedUpDay && lastSignInDay !== signedUpDay),
        };
      })
      .sort((a, b) => new Date(b.signedUpAt).getTime() - new Date(a.signedUpAt).getTime());

    const realUsers = rows.filter((r) => !r.isAdmin && !r.isSeed);
    const summary = {
      totalSignups: rows.length,
      realUsers: realUsers.length,
      activated: realUsers.filter((r) => r.timesLogged > 0).length,
      returned: realUsers.filter((r) => r.returned).length,
      activeLast30Days: realUsers.filter(
        (r) => r.lastTimeLoggedAt && Date.now() - new Date(r.lastTimeLoggedAt).getTime() < 30 * 86400000
      ).length,
    };

    return NextResponse.json({ summary, rows }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
