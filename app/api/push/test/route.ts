import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRouteUser } from "@/lib/routeUser";
import { pushIsConfigured, sendPush, type SubRow } from "@/lib/webPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Send test reminder" button in Settings — pings this parent's own phones.
export async function POST() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!pushIsConfigured()) {
    return NextResponse.json(
      { error: "Reminders aren't set up on the server yet." },
      { status: 503 }
    );
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);

  let sent = 0;
  for (const sub of (subs ?? []) as SubRow[]) {
    const ok = await sendPush(sub, {
      title: "Time to report to call room",
      body: "This is a test reminder. Real ones arrive before each swim.",
      url: "/meets",
      tag: "natrix-test",
    });
    if (ok) sent++;
  }

  return NextResponse.json({ success: true, sent });
}
