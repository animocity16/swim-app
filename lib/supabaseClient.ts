import { createBrowserClient } from "@supabase/ssr";
import { isDemoActive } from "@/lib/demo/demoMode";
import { demoClient } from "@/lib/demo/fakeSupabase";

function createRealClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
      },
    }
  );
}

type RealClient = ReturnType<typeof createRealClient>;

// Normal visitors: the real client is created immediately, exactly as before.
// Interactive demo (this browser tab only): the real client is never created and
// every call is answered by the in-browser demo client, so nothing reaches Supabase.
let real: RealClient | null = isDemoActive() ? null : createRealClient();

export const supabase: RealClient = new Proxy({} as RealClient, {
  get(_target, prop) {
    if (isDemoActive()) return Reflect.get(demoClient as object, prop);
    real ??= createRealClient();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
