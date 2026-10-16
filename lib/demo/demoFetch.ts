// lib/demo/demoFetch.ts
//
// Drop-in replacement for fetch() on the few screens that call Natrix's own
// server routes. In demo mode those calls are answered locally from the
// visitor's sample data and never leave the browser; otherwise this is a plain
// fetch() and behaves exactly as before.

import { isDemoActive } from "./demoMode";
import { demoFollowSwimmer } from "./fakeSupabase";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function appFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!isDemoActive()) return fetch(input, init);

  if (input === "/api/follow-result-swimmer") {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}"));
    } catch {
      return json(400, { error: "Invalid request" });
    }
    const { status, json: payload } = demoFollowSwimmer(body);
    return json(status, payload);
  }

  // Every other server route is switched off in the demo.
  return json(403, { error: "That isn't available in the demo." });
}
