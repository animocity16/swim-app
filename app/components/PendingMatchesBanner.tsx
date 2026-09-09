"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// PendingMatchesBanner
//
// The auto-results pipeline pulls real SGAquatics results into the database
// automatically, but linking a result onto an actual swimmer's profile still
// needs a parent to confirm it's the right person (Hy-Tek's "Last, First"
// format vs Natrix's "First Last" means it can't always be 100% certain).
// That confirm step used to only ever get shown once, right when a swimmer
// was first added -- so any result posted afterwards just sat there
// unconfirmed with nothing telling the parent it was waiting. This banner
// is the fix: it checks, every time it mounts, whether any of the parent's
// swimmers (their own kids or ones they follow) have new matches waiting,
// and whether any results were already auto-linked and are worth a look.
// ─────────────────────────────────────────────────────────────────────────────

type PendingMatch = {
  swimmer_id: number;
  swimmer_name: string;
  pending_count: number;
};

type ResultNotification = {
  id: string;
  swimmer_id: number | null;
  message: string;
  created_at: string;
};

export default function PendingMatchesBanner() {
  const [loading, setLoading] = useState(true);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [notifications, setNotifications] = useState<ResultNotification[]>([]);
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { setLoading(false); return; }

      const [matchesResult, notifsResult] = await Promise.all([
        supabase.rpc("get_pending_matches_summary"),
        supabase
          .from("notifications")
          .select("id, swimmer_id, message, created_at")
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      if (!mounted) return;
      setPendingMatches((matchesResult.data as PendingMatch[]) ?? []);
      setNotifications((notifsResult.data as ResultNotification[]) ?? []);
      setLoading(false);
    }

    void load();
    return () => { mounted = false; };
  }, []);

  async function dismissNotification(id: string) {
    setDismissedNotifIds((prev) => new Set(prev).add(id));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }

  async function dismissAllNotifications() {
    const ids = notifications.map((n) => n.id);
    setDismissedNotifIds(new Set(ids));
    if (ids.length > 0) {
      await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    }
  }

  const visibleNotifications = notifications.filter((n) => !dismissedNotifIds.has(n.id));
  const totalPending = pendingMatches.reduce((sum, m) => sum + m.pending_count, 0);

  if (loading) return null;
  if (pendingMatches.length === 0 && visibleNotifications.length === 0) return null;

  return (
    <div className="space-y-3">
      {pendingMatches.length > 0 && (
        <div
          className="rounded-3xl overflow-hidden"
          style={{ border: "1px solid rgba(253,230,138,0.25)", background: "rgba(217,119,6,0.1)" }}
        >
          <div className="px-4 pt-3.5 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔎</span>
              <p className="text-sm font-semibold" style={{ color: "#FDE68A" }}>
                {totalPending} new result{totalPending === 1 ? "" : "s"} waiting to be confirmed
              </p>
            </div>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(253,230,138,0.7)" }}>
              We spotted meet results that look like they belong to your swimmer. Tap one to confirm it&apos;s really them before we add it to their times.
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            {pendingMatches.map((m) => (
              <Link
                key={m.swimmer_id}
                href={`/confirm-swimmer?swimmer_id=${m.swimmer_id}`}
                className="flex items-center justify-between px-4 py-3 transition active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{m.swimmer_name}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {m.pending_count} possible match{m.pending_count === 1 ? "" : "es"} found
                  </p>
                </div>
                <div
                  className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ background: "rgba(253,230,138,0.18)", color: "#FDE68A" }}
                >
                  Review
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {visibleNotifications.length > 0 && (
        <div
          className="rounded-3xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
        >
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🆕</span>
              <p className="text-sm font-semibold text-white">Results added automatically</p>
            </div>
            <button
              type="button"
              onClick={dismissAllNotifications}
              className="text-xs font-medium text-white/40 hover:text-white/70"
            >
              Clear all
            </button>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            {visibleNotifications.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm text-white/70 min-w-0">{n.message}</p>
                <button
                  type="button"
                  onClick={() => dismissNotification(n.id)}
                  className="flex-shrink-0 text-white/30 hover:text-white/60 text-sm"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
