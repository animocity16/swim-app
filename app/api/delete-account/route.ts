import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ─── Safety lock ──────────────────────────────────────────────────────────────
// Set to true during dry-run testing (logs steps, touches nothing).
// Flip to false only after taking a fresh backup and testing on a throwaway account.
const SAFETY_LOCK = false;

export async function POST(_req: NextRequest) {
  // ── 1. Authenticate the calling user ──────────────────────────────────────
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

  const userId = user.id;
  const log: string[] = [];

  if (SAFETY_LOCK) {
    log.push("🔒 SAFETY_LOCK=true — dry run only, nothing will be deleted");
  }

  try {
    // ── 2. Get all swimmer IDs owned by this user ────────────────────────────
    const { data: swimmers, error: swimmerFetchError } = await supabaseAdmin
      .from("swimmers")
      .select("id")
      .eq("user_id", userId);

    if (swimmerFetchError) throw new Error(`Fetch swimmers: ${swimmerFetchError.message}`);
    const swimmerIds = (swimmers ?? []).map((s: { id: number }) => s.id);
    log.push(`Found ${swimmerIds.length} swimmer(s): [${swimmerIds.join(", ")}]`);

    // ── 3. Delete swim_splits ────────────────────────────────────────────────
    if (swimmerIds.length > 0) {
      const { count: splitCount } = await supabaseAdmin
        .from("swim_splits")
        .select("id", { count: "exact", head: true })
        .in("swimmer_id", swimmerIds);
      log.push(`swim_splits to delete: ${splitCount ?? 0}`);

      if (!SAFETY_LOCK && swimmerIds.length > 0) {
        const { error } = await supabaseAdmin
          .from("swim_splits")
          .delete()
          .in("swimmer_id", swimmerIds);
        if (error) throw new Error(`Delete swim_splits: ${error.message}`);
        log.push("✓ swim_splits deleted");
      }
    }

    // ── 4. Delete swim_times ─────────────────────────────────────────────────
    if (swimmerIds.length > 0) {
      const { count: timesCount } = await supabaseAdmin
        .from("swim_times")
        .select("id", { count: "exact", head: true })
        .in("swimmer_id", swimmerIds);
      log.push(`swim_times to delete: ${timesCount ?? 0}`);

      if (!SAFETY_LOCK) {
        const { error } = await supabaseAdmin
          .from("swim_times")
          .delete()
          .in("swimmer_id", swimmerIds);
        if (error) throw new Error(`Delete swim_times: ${error.message}`);
        log.push("✓ swim_times deleted");
      }
    }

    // ── 5. Delete standard_items ─────────────────────────────────────────────
    const { count: itemsCount } = await supabaseAdmin
      .from("standard_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    log.push(`standard_items to delete: ${itemsCount ?? 0}`);

    if (!SAFETY_LOCK) {
      const { error } = await supabaseAdmin
        .from("standard_items")
        .delete()
        .eq("user_id", userId);
      if (error) throw new Error(`Delete standard_items: ${error.message}`);
      log.push("✓ standard_items deleted");
    }

    // ── 6. Delete standard_sets ──────────────────────────────────────────────
    const { count: setsCount } = await supabaseAdmin
      .from("standard_sets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    log.push(`standard_sets to delete: ${setsCount ?? 0}`);

    if (!SAFETY_LOCK) {
      const { error } = await supabaseAdmin
        .from("standard_sets")
        .delete()
        .eq("user_id", userId);
      if (error) throw new Error(`Delete standard_sets: ${error.message}`);
      log.push("✓ standard_sets deleted");
    }

    // ── 7. Delete feedback ───────────────────────────────────────────────────
    const { count: feedbackCount } = await supabaseAdmin
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    log.push(`feedback rows to delete: ${feedbackCount ?? 0}`);

    if (!SAFETY_LOCK) {
      const { error } = await supabaseAdmin
        .from("feedback")
        .delete()
        .eq("user_id", userId);
      if (error) throw new Error(`Delete feedback: ${error.message}`);
      log.push("✓ feedback deleted");
    }

    // ── 8. Delete swimmers ───────────────────────────────────────────────────
    log.push(`swimmers to delete: ${swimmerIds.length}`);

    if (!SAFETY_LOCK && swimmerIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("swimmers")
        .delete()
        .eq("user_id", userId);
      if (error) throw new Error(`Delete swimmers: ${error.message}`);
      log.push("✓ swimmers deleted");
    }

    // ── 9. Delete splash-media storage files ─────────────────────────────────
    const { data: storageList } = await supabaseAdmin
      .storage
      .from("splash-media")
      .list(userId);
    const storageFiles = storageList ?? [];
    log.push(`splash-media files to delete: ${storageFiles.length}`);

    if (!SAFETY_LOCK && storageFiles.length > 0) {
      const filePaths = storageFiles.map((f: { name: string }) => `${userId}/${f.name}`);
      const { error } = await supabaseAdmin
        .storage
        .from("splash-media")
        .remove(filePaths);
      if (error) throw new Error(`Delete splash-media: ${error.message}`);
      log.push("✓ splash-media deleted");
    }

    // ── 10. Delete auth user ─────────────────────────────────────────────────
    log.push(`auth user to delete: ${userId}`);

    if (!SAFETY_LOCK) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw new Error(`Delete auth user: ${error.message}`);
      log.push("✓ auth user deleted");
    }

    // ── Done ─────────────────────────────────────────────────────────────────
    if (SAFETY_LOCK) {
      log.push("✅ Dry run complete — flip SAFETY_LOCK to false to run for real");
      return NextResponse.json({ dryRun: true, log }, { status: 200 });
    }

    return NextResponse.json({ success: true, log }, { status: 200 });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.push(`❌ ERROR: ${message}`);
    return NextResponse.json({ error: message, log }, { status: 500 });
  }
}