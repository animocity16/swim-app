"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type MeetSummary = {
  meetName: string;
  resultCount: number;
  latestDate: string | null;
  course: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatCourse(course: string | null): string {
  if (!course) return "";
  if (course === "SCM") return "SCM";
  if (course === "LCM") return "LCM";
  if (course === "SCY") return "SCY";
  return course;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      height: "72px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "20px",
      animation: "pulse 2s ease-in-out infinite",
    }} />
  );
}

// ─── Delete confirmation sheet ────────────────────────────────────────────────

function DeleteSheet({
  meet,
  onConfirm,
  onCancel,
  deleting,
}: {
  meet: MeetSummary;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: "480px",
          zIndex: 51,
          background: "rgba(6,25,45,0.98)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderBottom: "none",
          borderRadius: "28px 28px 0 0",
          padding: "20px 20px 40px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{
          width: "36px",
          height: "4px",
          borderRadius: "2px",
          background: "rgba(255,255,255,0.2)",
          margin: "0 auto 20px",
        }} />

        {/* Icon + title */}
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <div style={{
            width: "52px",
            height: "52px",
            borderRadius: "16px",
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 12px",
            fontSize: "22px",
          }}>
            🗑️
          </div>
          <p style={{ fontSize: "17px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            Delete this meet?
          </p>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "4px" }}>
            {meet.meetName}
          </p>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
            This will permanently remove all {meet.resultCount} result{meet.resultCount !== 1 ? "s" : ""} from this meet.
            Swimmer profiles are not affected.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" }}>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{
              width: "100%",
              padding: "15px",
              borderRadius: "16px",
              border: "none",
              background: deleting ? "rgba(239,68,68,0.4)" : "#DC2626",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 700,
              cursor: deleting ? "not-allowed" : "pointer",
              transition: "background 0.15s ease",
            }}
          >
            {deleting ? "Deleting..." : `Delete ${meet.resultCount} result${meet.resultCount !== 1 ? "s" : ""}`}
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            style={{
              width: "100%",
              padding: "15px",
              borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.75)",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Meet card with long-press ─────────────────────────────────────────────────

function MeetCard({
  meet,
  onLongPress,
}: {
  meet: MeetSummary;
  onLongPress: (meet: MeetSummary) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  function startPress() {
    didLongPress.current = false;
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress(meet);
    }, 500);
  }

  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function handleClick(e: React.MouseEvent) {
    if (didLongPress.current) e.preventDefault();
  }

  return (
    <Link
      href={`/meets/${encodeURIComponent(meet.meetName)}`}
      onClick={handleClick}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "20px",
        padding: "14px 16px",
        textDecoration: "none",
        transition: "background 0.15s ease",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Icon */}
      <div style={{
        width: "44px",
        height: "44px",
        borderRadius: "14px",
        background: "rgba(217,119,6,0.18)",
        border: "1px solid rgba(253,230,138,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "20px",
        flexShrink: 0,
      }}>
        🏊
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: "14px",
          fontWeight: 700,
          color: "#fff",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {meet.meetName}
        </p>
        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
          {[formatDate(meet.latestDate), formatCourse(meet.course)].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* Count badge + chevron */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
        <span style={{
          background: "rgba(217,119,6,0.18)",
          border: "1px solid rgba(253,230,138,0.22)",
          borderRadius: "20px",
          padding: "3px 10px",
          fontSize: "10px",
          fontWeight: 700,
          color: "#FDE68A",
          whiteSpace: "nowrap",
        }}>
          {meet.resultCount} result{meet.resultCount !== 1 ? "s" : ""}
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3L9 7L5 11" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MeetsPage() {
  const router = useRouter();
  const [meets, setMeets] = useState<MeetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<MeetSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [swimmerIds, setSwimmerIds] = useState<number[]>([]);

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    // ── 1. Get all swimmer IDs for this user ──────────────────────────────────
    const { data: swimmers } = await supabase
      .from("swimmers")
      .select("id");

    const ids = (swimmers ?? []).map((s: { id: number }) => s.id);
    setSwimmerIds(ids);
    if (ids.length === 0) { setLoading(false); return; }

    // ── 2. Get all swim_times that have a meet_name ───────────────────────────
    const { data: times } = await supabase
      .from("swim_times")
      .select("meet_name, swam_at, course")
      .in("swimmer_id", ids)
      .not("meet_name", "is", null);

    // ── 3. Group by meet_name ─────────────────────────────────────────────────
    const map = new Map<string, MeetSummary>();

    for (const t of (times ?? []) as { meet_name: string; swam_at: string | null; course: string | null }[]) {
      if (!t.meet_name) continue;
      const existing = map.get(t.meet_name);
      if (!existing) {
        map.set(t.meet_name, {
          meetName: t.meet_name,
          resultCount: 1,
          latestDate: t.swam_at,
          course: t.course ?? null,
        });
      } else {
        existing.resultCount++;
        if (t.swam_at && (!existing.latestDate || t.swam_at > existing.latestDate)) {
          existing.latestDate = t.swam_at;
        }
      }
    }

    // ── 4. Sort most recent first ─────────────────────────────────────────────
    const sorted = Array.from(map.values()).sort((a, b) => {
      if (a.latestDate && b.latestDate) return b.latestDate.localeCompare(a.latestDate);
      if (a.latestDate) return -1;
      if (b.latestDate) return 1;
      return a.meetName.localeCompare(b.meetName);
    });

    setMeets(sorted);
    setLoading(false);
  }

  async function handleDelete() {
    if (!pendingDelete || swimmerIds.length === 0) return;
    setDeleting(true);

    const { error } = await supabase
      .from("swim_times")
      .delete()
      .in("swimmer_id", swimmerIds)
      .eq("meet_name", pendingDelete.meetName);

    setDeleting(false);
    setPendingDelete(null);

    if (!error) {
      // Remove from local state instantly — no reload needed
      setMeets((prev) => prev.filter((m) => m.meetName !== pendingDelete.meetName));
    }
  }

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app space-y-5">
          <div className="pt-2">
            <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
              Natrix
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Meets</h1>
          </div>
          <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="shell">
      <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>

      <div className="container-app space-y-4">

        {/* Header */}
        <div className="pt-2">
          <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#BA7517" }}>
            Natrix
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Meets</h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            All meets from your scanned results. Hold to delete.
          </p>
        </div>

        {/* Empty state */}
        {meets.length === 0 ? (
          <div
            className="rounded-3xl p-8 text-center"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>🏅</div>
            <p className="font-semibold text-white">No meets yet</p>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
              Scan a Meet Mobile screenshot to get started.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {meets.map((meet) => (
              <MeetCard
                key={meet.meetName}
                meet={meet}
                onLongPress={setPendingDelete}
              />
            ))}
          </div>
        )}

        <div className="h-4" />
      </div>

      {/* Delete confirmation sheet */}
      {pendingDelete && (
        <DeleteSheet
          meet={pendingDelete}
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}