// app/demo/[[...slug]]/page.tsx
//
// The front door to the interactive demo. Anyone who opens /demo (including old
// links such as /demo/dashboard or /demo/swimmers/1) is switched into demo mode
// for this browser tab and sent to the real Natrix dashboard, which then runs on
// fictional sample data. Nothing is created, shared or sent anywhere.
"use client";

import { useEffect } from "react";
import { startDemo } from "@/lib/demo/demoMode";

export default function DemoEntryPage() {
  useEffect(() => {
    startDemo();
    // A full page load (not a client-side navigation) so the data client starts
    // fresh in demo mode and the real Supabase client is never created.
    window.location.replace("/dashboard");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <p className="text-sm text-white/50">Opening the Natrix demo…</p>
    </div>
  );
}
