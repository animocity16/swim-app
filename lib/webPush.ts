// Server-only: sends a push notification to one saved phone/browser.
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

let configured = false;

export function pushIsConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// Returns true if the notification was handed to Apple/Google/Mozilla.
// Phones that have uninstalled or revoked permission are cleaned out here.
export async function sendPush(sub: SubRow, payload: PushPayload): Promise<boolean> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 900, urgency: "high" }
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
    } else {
      console.error("push send failed", status, (err as Error).message);
    }
    return false;
  }
}
