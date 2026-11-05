"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// ─── New-look design tokens (matches Settings/Swimmers/Dashboard/Compare) ────

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(255,255,255,0.9)",
  boxShadow: "0 10px 24px rgba(0,25,55,0.10)",
};
const INK = "#0B2A54";
const MUTED = "#71859A";
const ACCENT = "var(--natrix-font-colour, #168AE8)";

// ─── Types ────────────────────────────────────────────────────────────────────

type UpcomingMeet = {
  id: string;
  name: string;
  location: string | null;
  meet_type: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_by: string | null;
};

type PastMeet = {
  meetName: string;
  resultCount: number;
  latestDate: string | null;
  course: string | null;
};

// A meet from the full database (every scraped meet, not just the ones this
// parent's swimmers swam in).
type AllMeet = {
  meet_id: string;
  meet_name: string;
  start_date: string | null;
  result_count: number;
  swimmer_count: number;
};

// A swimmer found by name across every saved meet.
type SwimmerHit = {
  swimmer_name: string; // as stored, e.g. "Tan, Alex"
  team_name: string | null;
  latest_age: number | null;
  result_count: number;
  meet_count: number;
};

type Tab = "upcoming" | "past" | "all";

// Meet results store names as "Last, First". Show "First Last".
function displayName(raw: string): string {
  const idx = raw.indexOf(",");
  const flipped = idx > -1 ? `${raw.slice(idx + 1).trim()} ${raw.slice(0, idx).trim()}` : raw.trim();
  return flipped.replace(/\s+/g, " ");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateRange(start: string, end: string | null): string {
  const s = new Date(start);
  if (isNaN(s.getTime())) return "";
  const startStr = s.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (!end) return startStr;
  const e = new Date(end);
  if (isNaN(e.getTime())) return startStr;
  const endStr = e.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function getYear(dateStr: string | null): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Unknown";
  return String(d.getFullYear());
}

function groupByYear<T>(items: T[], getDate: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const year = getYear(getDate(item));
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(item);
  }
  return map;
}

// A meet counts as "over" the moment its last day has passed — not when
// someone happens to scan a result for it. end_date wins if set, otherwise
// fall back to start_date. Compared at day resolution so a meet doesn't flip
// to Past partway through its own final day.
function toDateOnly(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isMeetOverdue(meet: UpcomingMeet): boolean {
  const refDateStr = meet.end_date ?? meet.start_date;
  const refDate = toDateOnly(refDateStr);
  if (isNaN(refDate.getTime())) return false;
  const today = toDateOnly(new Date().toISOString());
  return refDate.getTime() < today.getTime();
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      height: "72px",
      background: "rgba(255,255,255,0.6)",
      border: "1px solid rgba(255,255,255,0.8)",
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
  meet: PastMeet;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(11,42,84,0.45)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      />
      <div
        style={{
          position: "fixed", bottom: 0, left: "50%",
          transform: "translateX(-50%)",
          width: "100%", maxWidth: "480px", zIndex: 51,
          background: "#FFFFFF",
          border: "1px solid rgba(255,255,255,0.9)",
          borderBottom: "none",
          borderRadius: "28px 28px 0 0",
          padding: "20px 20px 40px",
          boxShadow: "0 -10px 30px rgba(0,25,55,0.16)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#E1EDF5", margin: "0 auto 20px" }} />
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <div style={{
            width: "52px", height: "52px", borderRadius: "16px",
            background: "rgba(220,80,80,0.12)", border: "1px solid rgba(220,80,80,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 12px", fontSize: "22px",
          }}>🗑️</div>
          <p style={{ fontSize: "17px", fontWeight: 700, color: INK, marginBottom: "6px" }}>Delete this meet?</p>
          <p style={{ fontSize: "14px", fontWeight: 600, color: INK, marginBottom: "4px" }}>{meet.meetName}</p>
          <p style={{ fontSize: "13px", color: MUTED }}>
            This will permanently remove all {meet.resultCount} result{meet.resultCount !== 1 ? "s" : ""} from this meet. Swimmer profiles are not affected.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" }}>
          <button
            type="button" onClick={onConfirm} disabled={deleting}
            style={{
              width: "100%", padding: "15px", borderRadius: "16px", border: "none",
              background: deleting ? "rgba(220,80,80,0.4)" : "#DC2626",
              color: "#fff", fontSize: "15px", fontWeight: 700,
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? "Deleting..." : `Delete ${meet.resultCount} result${meet.resultCount !== 1 ? "s" : ""}`}
          </button>
          <button
            type="button" onClick={onCancel} disabled={deleting}
            style={{
              width: "100%", padding: "15px", borderRadius: "16px",
              border: "1px solid #E1EDF5",
              background: "#F7FAFC",
              color: INK, fontSize: "15px", fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Past Meet card with long-press (has logged results — links to FINA points page) ─
// Amber identity = "past/completed" status, kept consistent regardless of Accent Colour.

function PastMeetCard({ meet, onLongPress }: { meet: PastMeet; onLongPress: (meet: PastMeet) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  function startPress() {
    didLongPress.current = false;
    timerRef.current = setTimeout(() => { didLongPress.current = true; onLongPress(meet); }, 500);
  }
  function cancelPress() { if (timerRef.current) clearTimeout(timerRef.current); }
  function handleClick(e: React.MouseEvent) { if (didLongPress.current) e.preventDefault(); }

  return (
    <Link
      href={`/meets/${encodeURIComponent(meet.meetName)}`}
      onClick={handleClick}
      onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
      onTouchStart={startPress} onTouchEnd={cancelPress} onTouchMove={cancelPress}
      style={{
        display: "flex", alignItems: "center", gap: "14px",
        ...CARD, borderRadius: "20px", padding: "14px 16px",
        textDecoration: "none", userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      <div style={{
        width: "44px", height: "44px", borderRadius: "14px",
        background: "#FEF3E2", border: "1px solid #FBDBA7",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "20px", flexShrink: 0,
      }}>🏊</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "14px", fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meet.meetName}
        </p>
        <p style={{ fontSize: "11px", color: MUTED, marginTop: "2px" }}>
          {formatDate(meet.latestDate)}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
        <span style={{
          background: "#FEF3E2", border: "1px solid #FBDBA7",
          borderRadius: "20px", padding: "3px 10px",
          fontSize: "10px", fontWeight: 700, color: "#B45309", whiteSpace: "nowrap",
        }}>
          {meet.resultCount} result{meet.resultCount !== 1 ? "s" : ""}
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3L9 7L5 11" stroke="#B7C9D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

// ─── Upcoming Meet card ────────────────────────────────────────────────────────
// Blue identity = "upcoming" status, kept consistent regardless of Accent Colour.

function UpcomingMeetCard({ meet, mine }: { meet: UpcomingMeet; mine: boolean }) {
  return (
    <Link
      href={`/meets/upcoming/${meet.id}`}
      style={{
        display: "flex", alignItems: "center", gap: "14px",
        ...CARD, borderRadius: "20px", padding: "14px 16px",
        textDecoration: "none",
      }}
    >
      <div style={{
        width: "44px", height: "44px", borderRadius: "14px",
        background: "#EAF6FE", border: "1px solid #BAE6FD",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "20px", flexShrink: 0,
      }}>🏅</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "14px", fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meet.name}
        </p>
        <p style={{ fontSize: "11px", color: MUTED, marginTop: "2px" }}>
          {[formatDateRange(meet.start_date, meet.end_date), meet.location].filter(Boolean).join(" · ")}
        </p>
        {mine && (
          <span style={{
            display: "inline-block", marginTop: "5px",
            background: "#EAF6FE", border: "1px solid #BAE6FD",
            borderRadius: "20px", padding: "2px 8px",
            fontSize: "9px", fontWeight: 700, color: "#0369A1",
          }}>
            Added by you
          </span>
        )}
      </div>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <path d="M5 3L9 7L5 11" stroke="#B7C9D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

// ─── Overdue meet card (date has passed, no results logged yet) ──────────────
// Sits in the Past tab alongside PastMeetCard, but styled distinctly since
// there's nothing to show FINA points for until a result gets scanned.

function OverdueMeetCard({ meet }: { meet: UpcomingMeet }) {
  return (
    <Link
      href={`/meets/upcoming/${meet.id}`}
      style={{
        display: "flex", alignItems: "center", gap: "14px",
        background: "rgba(255,255,255,0.7)", border: "1px dashed #C7D6E3",
        borderRadius: "20px", padding: "14px 16px",
        textDecoration: "none",
      }}
    >
      <div style={{
        width: "44px", height: "44px", borderRadius: "14px",
        background: "#F1F6FA", border: "1px solid #E1EDF5",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "20px", flexShrink: 0,
      }}>🏅</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "14px", fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meet.name}
        </p>
        <p style={{ fontSize: "11px", color: MUTED, marginTop: "2px" }}>
          {[formatDateRange(meet.start_date, meet.end_date), meet.location].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span style={{
        background: "#F1F6FA", border: "1px solid #E1EDF5",
        borderRadius: "20px", padding: "3px 10px",
        fontSize: "10px", fontWeight: 700, color: MUTED, whiteSpace: "nowrap", flexShrink: 0,
      }}>
        Awaiting results
      </span>
    </Link>
  );
}

// ─── Meet from the full database (search results) ────────────────────────────

function AllMeetCard({ meet }: { meet: AllMeet }) {
  return (
    <Link
      href={`/meets/all/${encodeURIComponent(meet.meet_id)}`}
      style={{
        display: "flex", alignItems: "center", gap: "14px",
        ...CARD, borderRadius: "20px", padding: "14px 16px",
        textDecoration: "none",
      }}
    >
      <div style={{
        width: "44px", height: "44px", borderRadius: "14px",
        background: "#EAF6FE", border: "1px solid #BAE6FD",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "20px", flexShrink: 0,
      }}>🏊</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "14px", fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meet.meet_name}
        </p>
        <p style={{ fontSize: "11px", color: MUTED, marginTop: "2px" }}>
          {[formatDate(meet.start_date), `${meet.swimmer_count} swimmer${meet.swimmer_count !== 1 ? "s" : ""}`]
            .filter(Boolean).join(" · ")}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
        <span style={{
          background: "#EAF6FE", border: "1px solid #BAE6FD",
          borderRadius: "20px", padding: "3px 10px",
          fontSize: "10px", fontWeight: 700, color: "#0369A1", whiteSpace: "nowrap",
        }}>
          {meet.result_count} result{meet.result_count !== 1 ? "s" : ""}
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3L9 7L5 11" stroke="#B7C9D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

// ─── Swimmer from the full database (search results) ─────────────────────────

function SwimmerHitCard({ hit }: { hit: SwimmerHit }) {
  const href =
    `/meets/swimmer?name=${encodeURIComponent(hit.swimmer_name)}` +
    (hit.team_name ? `&team=${encodeURIComponent(hit.team_name)}` : "");
  const initial = displayName(hit.swimmer_name).charAt(0).toUpperCase() || "?";
  return (
    <Link
      href={href}
      style={{
        display: "flex", alignItems: "center", gap: "14px",
        ...CARD, borderRadius: "20px", padding: "14px 16px",
        textDecoration: "none",
      }}
    >
      <div style={{
        width: "44px", height: "44px", borderRadius: "50%",
        background: "#EAF6FE", border: "1px solid #BAE6FD",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "16px", fontWeight: 800, color: "#0369A1", flexShrink: 0,
      }}>
        {initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "14px", fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName(hit.swimmer_name)}
        </p>
        <p style={{ fontSize: "11px", color: MUTED, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[hit.team_name, hit.latest_age != null ? `Age ${hit.latest_age}` : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
        <span style={{
          background: "#EAF6FE", border: "1px solid #BAE6FD",
          borderRadius: "20px", padding: "3px 10px",
          fontSize: "10px", fontWeight: 700, color: "#0369A1", whiteSpace: "nowrap",
        }}>
          {hit.result_count} result{hit.result_count !== 1 ? "s" : ""}
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3L9 7L5 11" stroke="#B7C9D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

// ─── Year group (collapsible) ─────────────────────────────────────────────────

function YearGroup({ year, defaultOpen, children }: { year: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 4px", background: "none", border: "none", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: "12px", fontWeight: 700, color: MUTED, letterSpacing: "0.08em" }}>
          {year}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <path d="M4 6L8 10L12 6" stroke="#B7C9D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "8px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MeetsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upcoming");

  // Search tab state (shared text box for Meets and Swimmers)
  const [allMode, setAllMode] = useState<"meets" | "swimmers">("meets");
  const [swimHits, setSwimHits] = useState<SwimmerHit[]>([]);
  const [swimLoading, setSwimLoading] = useState(false);
  const [swimError, setSwimError] = useState("");
  const [allQuery, setAllQuery] = useState("");
  const [swimClub, setSwimClub] = useState("");
  const [swimAge, setSwimAge] = useState("");
  const [allYear, setAllYear] = useState<number | null>(null);
  const [allMeets, setAllMeets] = useState<AllMeet[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState("");
  const allLoadedOnce = useRef(false);
  const [upcomingMeets, setUpcomingMeets] = useState<UpcomingMeet[]>([]);
  const [overdueMeets, setOverdueMeets] = useState<UpcomingMeet[]>([]);
  const [pastMeets, setPastMeets] = useState<PastMeet[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<PastMeet | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [swimmerIds, setSwimmerIds] = useState<number[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  // Open straight to a tab when linked, e.g. Home → Quick tools → "Find a meet"
  // goes to /meets?tab=all.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted === "all" || wanted === "past" || wanted === "upcoming") setTab(wanted);
  }, []);

  // Search the full meet database whenever the All meets tab is open and the
  // text or year changes (short pause after typing so we don't fire per keystroke).
  useEffect(() => {
    if (tab !== "all" || allMode !== "meets") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setAllLoading(true);
      setAllError("");
      const { data, error } = await supabase.rpc("search_meets", {
        p_query: allQuery.trim() || null,
        p_year: allYear,
      });
      if (cancelled) return;
      if (error) {
        setAllError("Couldn't load meets right now. Please try again.");
        setAllMeets([]);
      } else {
        setAllMeets((data ?? []) as AllMeet[]);
      }
      setAllLoading(false);
      allLoadedOnce.current = true;
    }, allLoadedOnce.current ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tab, allMode, allQuery, allYear]);

  // Swimmer search: any swimmer in the saved meet data, no age limit.
  useEffect(() => {
    if (tab !== "all" || allMode !== "swimmers") return;
    const q = allQuery.trim();
    const club = swimClub.trim();
    const age = swimAge ? Number(swimAge) : null;
    if (q.length < 2 && club.length < 2 && age === null) {
      setSwimHits([]);
      setSwimError("");
      setSwimLoading(false);
      return;
    }
    let cancelled = false;
    setSwimLoading(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_all_swimmers", {
        p_query: q.length >= 2 ? q : null,
        p_club: club.length >= 2 ? club : null,
        p_age: age,
      });
      if (cancelled) return;
      if (error) {
        setSwimError("Couldn't search swimmers right now. Please try again.");
        setSwimHits([]);
      } else {
        setSwimError("");
        setSwimHits((data ?? []) as SwimmerHit[]);
      }
      setSwimLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tab, allMode, allQuery, swimClub, swimAge]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }
    setUserId(session.user.id);

    // ── Load upcoming meets (official + this parent's own, thanks to RLS) ─────
    const { data: upcoming } = await supabase
      .from("upcoming_meets")
      .select("*")
      .order("start_date", { ascending: true });

    const allUpcomingRows = (upcoming ?? []) as UpcomingMeet[];

    // A meet whose last day has already passed moves to the Past tab, even if
    // nobody has scanned a result for it yet — it's date-driven, not
    // results-driven.
    setUpcomingMeets(allUpcomingRows.filter((m) => !isMeetOverdue(m)));
    setOverdueMeets(allUpcomingRows.filter((m) => isMeetOverdue(m)));

    // ── Load past meets from swim_times ───────────────────────────────────────
    const { data: swimmers } = await supabase.from("swimmers").select("id");
    const ids = (swimmers ?? []).map((s: { id: number }) => s.id);
    setSwimmerIds(ids);

    if (ids.length > 0) {
      const { data: times } = await supabase
        .from("swim_times")
        .select("meet_name, swam_at, course")
        .in("swimmer_id", ids)
        .not("meet_name", "is", null);

      const map = new Map<string, PastMeet>();
      for (const t of (times ?? []) as { meet_name: string; swam_at: string | null; course: string | null }[]) {
        if (!t.meet_name) continue;
        const existing = map.get(t.meet_name);
        if (!existing) {
          map.set(t.meet_name, { meetName: t.meet_name, resultCount: 1, latestDate: t.swam_at, course: t.course ?? null });
        } else {
          existing.resultCount++;
          if (t.swam_at && (!existing.latestDate || t.swam_at > existing.latestDate)) existing.latestDate = t.swam_at;
        }
      }
      const sorted = Array.from(map.values()).sort((a, b) => {
        if (a.latestDate && b.latestDate) return b.latestDate.localeCompare(a.latestDate);
        if (a.latestDate) return -1;
        if (b.latestDate) return 1;
        return a.meetName.localeCompare(b.meetName);
      });
      setPastMeets(sorted);
    }

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
    if (!error) setPastMeets((prev) => prev.filter((m) => m.meetName !== pendingDelete.meetName));
  }

  // ── Group past meets (results-based) by year ───────────────────────────────
  const pastByYear = groupByYear(pastMeets, (m) => m.latestDate);
  const pastYears = Array.from(pastByYear.keys()).sort((a, b) => b.localeCompare(a));

  // ── Group upcoming meets by year ────────────────────────────────────────────
  const upcomingByYear = groupByYear(upcomingMeets, (m) => m.start_date);
  const upcomingYears = Array.from(upcomingByYear.keys()).sort((a, b) => a.localeCompare(b));

  // Overdue meets that don't already have a matching results-based past
  // entry (matched by name) — shown separately so they aren't lost once
  // their date passes, but also aren't duplicated once results do arrive.
  const pastMeetNamesLower = new Set(pastMeets.map((m) => m.meetName.trim().toLowerCase()));
  const overdueWithoutResults = overdueMeets.filter(
    (m) => !pastMeetNamesLower.has(m.name.trim().toLowerCase())
  );

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="shell">
        <div className="container-app space-y-5">
          <div className="pt-2">
            <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>Natrix</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Meets</h1>
          </div>
          <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="shell">
      <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      <div className="container-app space-y-4">

        {/* Branded header — matches Settings / Swimmers / Dashboard / Compare */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <div className="text-[1.75rem] font-black tracking-[0.08em] text-white">NATRIX</div>
            <div className="mt-0.5 text-[0.5rem] font-semibold uppercase tracking-[0.24em] text-sky-200/50">
              Track · Improve · Belong
            </div>
            <div className="mt-5">
              <h1 className="text-3xl font-bold tracking-tight text-white">Meets</h1>
            </div>
          </div>
          <img src="/natrix-mascot-search.png" alt="Natrix" className="h-[72px] w-[72px] object-contain" />
        </div>

        {/* Tab toggle */}
        <div style={{
          display: "flex", ...CARD, borderRadius: "16px", padding: "4px", gap: "3px",
        }}>
          {(["upcoming", "past", "all"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "9px 0", borderRadius: "12px", border: "none",
                background: tab === t ? ACCENT : "transparent",
                color: tab === t ? "#fff" : MUTED,
                fontSize: "13px", fontWeight: tab === t ? 700 : 500,
                cursor: "pointer", transition: "all 0.15s ease",
                textTransform: "capitalize",
              }}
            >
              {t === "upcoming" ? "Upcoming" : t === "past" ? "Past" : "Search"}
            </button>
          ))}
        </div>

        {/* Upcoming tab */}
        {tab === "upcoming" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "6px" }}>
              <Link href="/meets/manage" style={{ fontSize: "12px", fontWeight: 700, color: "#168AE8", textDecoration: "none" }}>
                + Add your meet
              </Link>
            </div>
            {upcomingMeets.length === 0 ? (
              <div className="rounded-[28px] p-8 text-center" style={CARD}>
                <div style={{ fontSize: "32px", marginBottom: "10px" }}>📅</div>
                <p className="font-semibold" style={{ color: INK }}>No upcoming meets</p>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                  Meets will appear here once they're added.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {upcomingYears.map((year, i) => (
                  <YearGroup key={year} year={year} defaultOpen={i === 0}>
                    {(upcomingByYear.get(year) ?? []).map((meet) => (
                      <UpcomingMeetCard key={meet.id} meet={meet} mine={meet.created_by === userId} />
                    ))}
                  </YearGroup>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Past tab */}
        {tab === "past" && (
          <div className="space-y-5">
            {pastMeets.length === 0 && overdueWithoutResults.length === 0 ? (
              <div className="rounded-[28px] p-8 text-center" style={CARD}>
                <div style={{ fontSize: "32px", marginBottom: "10px" }}>🏅</div>
                <p className="font-semibold" style={{ color: INK }}>No past meets yet</p>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                  Scan a Meet Mobile screenshot to get started.
                </p>
              </div>
            ) : (
              <>
                {pastMeets.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {pastYears.map((year, i) => (
                      <YearGroup key={year} year={year} defaultOpen={i === 0}>
                        {(pastByYear.get(year) ?? []).map((meet) => (
                          <PastMeetCard key={meet.meetName} meet={meet} onLongPress={setPendingDelete} />
                        ))}
                      </YearGroup>
                    ))}
                  </div>
                )}

                {overdueWithoutResults.length > 0 && (
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: 700, color: MUTED, letterSpacing: "0.08em", padding: "8px 4px" }}>
                      AWAITING RESULTS
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {overdueWithoutResults.map((meet) => (
                        <OverdueMeetCard key={meet.id} meet={meet} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Search tab — look up any meet, or any swimmer, in the Natrix database */}
        {tab === "all" && (
          <div className="space-y-3">
            {/* Meets | Swimmers */}
            <div style={{ display: "flex", ...CARD, borderRadius: "14px", padding: "3px", gap: "3px" }}>
              {(["meets", "swimmers"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAllMode(m)}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: "11px", border: "none",
                    background: allMode === m ? INK : "transparent",
                    color: allMode === m ? "#fff" : MUTED,
                    fontSize: "12px", fontWeight: allMode === m ? 700 : 500, cursor: "pointer",
                  }}
                >
                  {m === "meets" ? "Meets" : "Swimmers"}
                </button>
              ))}
            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              ...CARD, borderRadius: "18px", padding: "4px 14px",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" stroke={INK} strokeWidth="2" />
                <path d="M16 16L21 21" stroke={INK} strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={allQuery}
                onChange={(e) => setAllQuery(e.target.value)}
                placeholder={allMode === "meets" ? "Search meets by name…" : "Search any swimmer by name…"}
                style={{
                  flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
                  padding: "12px 0", fontSize: "15px", color: INK,
                }}
              />
              {allQuery && (
                <button
                  type="button"
                  onClick={() => setAllQuery("")}
                  aria-label="Clear search"
                  style={{ background: "none", border: "none", color: MUTED, fontSize: "18px", cursor: "pointer" }}
                >
                  ×
                </button>
              )}
            </div>

            {/* ── Meets mode ── */}
            {allMode === "meets" && (
              <>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[null, ...Array.from(
                    { length: Math.max(1, new Date().getFullYear() - 2026 + 1) },
                    (_, i) => new Date().getFullYear() - i
                  )].map((y) => {
                    const active = allYear === y;
                    return (
                      <button
                        key={y ?? "any"}
                        type="button"
                        onClick={() => setAllYear(y)}
                        style={{
                          padding: "7px 14px", borderRadius: "999px", cursor: "pointer",
                          fontSize: "12px", fontWeight: 700,
                          background: active ? ACCENT : "rgba(255,255,255,0.9)",
                          color: active ? "#fff" : MUTED,
                          border: active ? `1px solid ${ACCENT}` : "1px solid #E1EDF5",
                        }}
                      >
                        {y ?? "All years"}
                      </button>
                    );
                  })}
                </div>

                {allError && (
                  <p style={{ fontSize: "13px", color: "#FCA5A5", padding: "4px" }}>{allError}</p>
                )}

                {allLoading && allMeets.length === 0 ? (
                  <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
                ) : allMeets.length === 0 && !allError ? (
                  <div className="rounded-[28px] p-8 text-center" style={CARD}>
                    <div style={{ fontSize: "32px", marginBottom: "10px" }}>🔎</div>
                    <p className="font-semibold" style={{ color: INK }}>No meets found</p>
                    <p className="mt-1 text-sm" style={{ color: MUTED }}>
                      Try fewer words, or pick a different year.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", opacity: allLoading ? 0.6 : 1 }}>
                    {allMeets.map((meet) => (
                      <AllMeetCard key={meet.meet_id} meet={meet} />
                    ))}
                    {allMeets.length >= 60 && (
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "6px" }}>
                        Showing the 60 most recent matches. Type more of the meet name to narrow it down.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Swimmers mode: anyone in the saved meet data, no age limit ── */}
            {allMode === "swimmers" && (
              <>
                {/* Filters: club and age (name is the search box above) */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={swimClub}
                    onChange={(e) => setSwimClub(e.target.value)}
                    placeholder="Club…"
                    style={{
                      flex: 1, minWidth: 0, ...CARD, borderRadius: "14px",
                      padding: "11px 14px", fontSize: "14px", color: INK, outline: "none",
                    }}
                  />
                  <select
                    value={swimAge}
                    onChange={(e) => setSwimAge(e.target.value)}
                    aria-label="Age"
                    style={{
                      flexShrink: 0, width: "112px", ...CARD, borderRadius: "14px",
                      padding: "11px 10px", fontSize: "14px", color: swimAge ? INK : MUTED, outline: "none",
                    }}
                  >
                    <option value="">Any age</option>
                    {Array.from({ length: 36 }, (_, i) => i + 6).map((a) => (
                      <option key={a} value={a}>{`Age ${a}`}</option>
                    ))}
                  </select>
                </div>
                {(swimClub || swimAge) && (
                  <button
                    type="button"
                    onClick={() => { setSwimClub(""); setSwimAge(""); }}
                    style={{
                      alignSelf: "flex-start", background: "none", border: "none", padding: "2px 4px",
                      color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Clear club and age
                  </button>
                )}

                {swimError && (
                  <p style={{ fontSize: "13px", color: "#FCA5A5", padding: "4px" }}>{swimError}</p>
                )}

                {allQuery.trim().length < 2 && swimClub.trim().length < 2 && !swimAge ? (
                  <div className="rounded-[28px] p-8 text-center" style={CARD}>
                    <div style={{ fontSize: "32px", marginBottom: "10px" }}>🏊</div>
                    <p className="font-semibold" style={{ color: INK }}>Find any swimmer</p>
                    <p className="mt-1 text-sm" style={{ color: MUTED }}>
                      Search by name, club, age, or any mix. It covers every swimmer in the meets we&apos;ve saved, and you don&apos;t have to follow them first.
                    </p>
                  </div>
                ) : swimLoading && swimHits.length === 0 ? (
                  <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
                ) : swimHits.length === 0 && !swimError ? (
                  <div className="rounded-[28px] p-8 text-center" style={CARD}>
                    <div style={{ fontSize: "32px", marginBottom: "10px" }}>🔎</div>
                    <p className="font-semibold" style={{ color: INK }}>No swimmers found</p>
                    <p className="mt-1 text-sm" style={{ color: MUTED }}>
                      Try fewer filters, just the first or last name, or check the spelling.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", opacity: swimLoading ? 0.6 : 1 }}>
                    {swimHits.map((hit) => (
                      <SwimmerHitCard key={`${hit.swimmer_name}|${hit.team_name ?? ""}`} hit={hit} />
                    ))}
                    {swimHits.length >= 40 && (
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "6px" }}>
                        Showing the first 40 matches. Add a name, club or age to narrow it down.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="h-4" />
      </div>

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
