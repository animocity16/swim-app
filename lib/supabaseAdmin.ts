import { createClient } from "@supabase/supabase-js";

// Server-side only — never import this in client components!
// Uses the service role key which bypasses RLS entirely.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);