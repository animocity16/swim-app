
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { calcFinaPoints, type Gender } from "@/lib/finaPoints";
import { canonicalEventName, canonicalCourse } from "@/lib/events";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultRow = {
  id: number;
  event: string;
  course: string;
  time_ms: number;
  place: number | null;
  swam_at: string | null;
  swimmer_id: number;
  swimmer_name: string;
  swim_club: string | null;
  is_pb: boolean;
  fina_points: number | null;
  gender: Gender | null;
};

// Grouped by event name — and by gender ONLY when the scanned official
// placings actually collide (two different swimmers both "1st", etc.),
// which is the one reliable signal that boys and girls were scored as
// separate fields under the same event name. A genuinely combined field
// (mixed gender, or a combined age group) never produces duplicate
// placings, so it's left as a single group untouched.
//   gender === null           -> not split, single combined field
//   gender === "Male"/"Female" -> split, this is that gender's field
//   gender === "unspecified"  -> split occurred, but this swimmer has no
//                                 gender set on their Brood profile
type EventGroup = {
  event: string;
  gender: Gender | "unspecified" | null;
  results: ResultRow[];
};

type LeaderboardEntry = {
  swimmer_id: number;
  swimmer_name: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
  total_points: number;
  breakdown: { event: string; place: number | null; points: number }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatCourseFull(course: string | null): string {
  if (!course) return "";
  if (course === "SCM") return "Short Course · Metres";
  if (course === "LCM") return "Long Course · Metres";
  if (course === "SCY") return "Short Course · Yards";
  return course;
}

const STROKE_ORDER = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM", "Other"];

function getStroke(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breaststroke") || e.includes("breast")) return "Breaststroke";
  if (e.includes("backstroke") || e.includes("back")) return "Backstroke";
  if (e.includes("butterfly") || e.includes("fly")) return "Butterfly";
  if (e.includes("freestyle") || e.includes("free")) return "Freestyle";
  if (e.includes("medley") || e.endsWith(" im") || e === "im") return "IM";
  return "Other";
}

function getDistance(event: string): number {
  const m = event.match(/\d+/);
  return m ? Number(m[0]) : 9999;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function placeColor(place: number | null): string {
  if (place === 1) return "#FDE68A";
  if (place === 2) return "#CBD5E1";
  if (place === 3) return "#FDBA74";
  return "rgba(255,255,255,0.45)";
}

function genderLabel(gender: Gender | "unspecified" | null): string {
  if (gender === "Male") return "Boys";
  if (gender === "Female") return "Girls";
  if (gender === "unspecified") return "Unspecified";
  return ""; // not split — no label needed
}

function groupKeyOf(event: string, gender: Gender | "unspecified" | null): string {
  return `${event}|${gender ?? "combined"}`;
}

function buildLeaderboard(groups: EventGroup[]): LeaderboardEntry[] {
  const map = new Map<number, LeaderboardEntry>();
  for (const g of groups) {
    g.results.forEach((r) => {
      if (!map.has(r.swimmer_id)) {
        map.set(r.swimmer_id, {
          swimmer_id: r.swimmer_id, swimmer_name: r.swimmer_name,
          gold: 0, silver: 0, bronze: 0, total: 0, total_points: 0, breakdown: [],
        });
      }
      const e = map.get(r.swimmer_id)!;
      // Medal counts come from the swimmer's true official place in the
      // event (r.place) — never from their position among only the
      // swimmers actually saved into the app, since saving a subset of an
      // age group can silently promote someone to a medal they didn't win.
      if (r.place === 1) { e.gold += 1; e.total += 1; }
      else if (r.place === 2) { e.silver += 1; e.total += 1; }
      else if (r.place === 3) { e.bronze += 1; e.total += 1; }
      // Points are summed across every swim in the meet, not just podium finishes
      if (r.fina_points != null) {
        e.total_points += r.fina_points;
        e.breakdown.push({ event: g.event, place: r.place, points: r.fina_points });
      }
    });
  }
  const entries = Array.from(map.values());
  for (const entry of entries) {
    entry.breakdown.sort((a, b) => {
      const sA = STROKE_ORDER.indexOf(getStroke(a.event));
      const sB = STROKE_ORDER.indexOf(getStroke(b.event));
      if (sA !== sB) return sA - sB;
      return getDistance(a.event) - getDistance(b.event);
    });
  }
  return entries.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    return a.swimmer_name.localeCompare(b.swimmer_name);
  });
}

// ─── Place badge ──────────────────────────────────────────────────────────────

function PlaceBadge({ rank }: { rank: number }) {
  const PLACE_STYLES: Record<number, { bg: string; border: string; color: string }> = {
    1: { bg: "rgba(234,179,8,0.18)",   border: "rgba(253,230,138,0.4)",  color: "#FDE68A" },
    2: { bg: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.35)", color: "#CBD5E1" },
    3: { bg: "rgba(180,100,50,0.18)",  border: "rgba(180,100,50,0.4)",   color: "#FDBA74" },
  };
  const s = PLACE_STYLES[rank] ?? {
    bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.38)",
  };
  return (
    <div style={{
      width: "26px", height: "26px", borderRadius: "8px",
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      fontSize: "11px", fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      {rank}
    </div>
  );
}

// ─── Action sheet — delete or edit ────────────────────────────────────────────

function ActionSheet({
  row,
  onDelete,
  onEdit,
  onCancel,
}: {
  row: ResultRow;
  onDelete: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div onClick={onCancel} style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      }} />
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: "480px", zIndex: 51,
        background: "rgba(6,25,45,0.98)",
        border: "1px solid rgba(255,255,255,0.14)", borderBottom: "none",
        borderRadius: "28px 28px 0 0", padding: "20px 20px 40px",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.2)", margin: "0 auto 20px" }} />

        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <p style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>{row.swimmer_name}</p>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
            {row.event} · {formatMs(row.time_ms)} · {row.course}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button type="button" onClick={onEdit} style={{
            width: "100%", padding: "15px", borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
            color: "#fff", fontSize: "15px", fontWeight: 600, cursor: "pointer",
          }}>
            ✏️ Edit course
          </button>
          <button type="button" onClick={onDelete} style={{
            width: "100%", padding: "15px", borderRadius: "16px", border: "none",
            background: "#DC2626", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer",
          }}>
            🗑️ Delete result
          </button>
          <button type="button" onClick={onCancel} style={{
            width: "100%", padding: "15px", borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
            color: "rgba(255,255,255,0.5)", fontSize: "15px", fontWeight: 500, cursor: "pointer",
          }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Edit course sheet ────────────────────────────────────────────────────────

function EditCourseSheet({
  row,
  onSave,
  onCancel,
  saving,
}: {
  row: ResultRow;
  onSave: (course: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<string>(row.course);
  const courses = ["LCM", "SCM", "SCY"];

  return (
    <>
      <div onClick={onCancel} style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      }} />
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: "480px", zIndex: 51,
        background: "rgba(6,25,45,0.98)",
        border: "1px solid rgba(255,255,255,0.14)", borderBottom: "none",
        borderRadius: "28px 28px 0 0", padding: "20px 20px 40px",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.2)", margin: "0 auto 20px" }} />

        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <p style={{ fontSize: "17px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>Edit course</p>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
            {row.swimmer_name} · {row.event} · {formatMs(row.time_ms)}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          {courses.map((c) => (
            <button key={c} type="button" onClick={() => setSelected(c)}
              style={{
                flex: 1, padding: "14px", borderRadius: "16px", fontSize: "15px", fontWeight: 700,
                cursor: "pointer", transition: "all 0.15s",
                background: selected === c ? "#D97706" : "rgba(255,255,255,0.06)",
                border: selected === c ? "1px solid #D97706" : "1px solid rgba(255,255,255,0.12)",
                color: selected === c ? "#fff" : "rgba(255,255,255,0.5)",
              }}>
              {c}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button type="button" onClick={() => onSave(selected)} disabled={saving || selected === row.course}
            style={{
              width: "100%", padding: "15px", borderRadius: "16px", border: "none",
              background: saving || selected === row.course ? "rgba(217,119,6,0.3)" : "#D97706",
              color: "#fff", fontSize: "15px", fontWeight: 700,
              cursor: saving || selected === row.course ? "not-allowed" : "pointer",
            }}>
            {saving ? "Saving…" : `Save as ${selected}`}
          </button>
          <button type="button" onClick={onCancel} disabled={saving}
            style={{
              width: "100%", padding: "15px", borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
              color: "rgba(255,255,255,0.5)", fontSize: "15px", fontWeight: 500, cursor: "pointer",
            }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm sheet ─────────────────────────────────────────────────────

function DeleteSheet({
  row,
  onConfirm,
  onCancel,
  deleting,
}: {
  row: ResultRow;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <>
      <div onClick={onCancel} style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      }} />
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: "480px", zIndex: 51,
        background: "rgba(6,25,45,0.98)",
        border: "1px solid rgba(255,255,255,0.14)", borderBottom: "none",
        borderRadius: "28px 28px 0 0", padding: "20px 20px 40px",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.2)", margin: "0 auto 20px" }} />
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <div style={{
            width: "52px", height: "52px", borderRadius: "16px",
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 12px", fontSize: "22px",
          }}>🗑️</div>
          <p style={{ fontSize: "17px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>Delete this result?</p>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "4px" }}>{row.swimmer_name}</p>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>{row.event} · {formatMs(row.time_ms)} · {row.course}</p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "8px" }}>
            Swimmer profile is not affected.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" }}>
          <button type="button" onClick={onConfirm} disabled={deleting} style={{
            width: "100%", padding: "15px", borderRadius: "16px", border: "none",
            background: deleting ? "rgba(239,68,68,0.4)" : "#DC2626",
            color: "#fff", fontSize: "15px", fontWeight: 700,
            cursor: deleting ? "not-allowed" : "pointer",
          }}>
            {deleting ? "Deleting..." : "Delete result"}
          </button>
          <button type="button" onClick={onCancel} disabled={deleting} style={{
            width: "100%", padding: "15px", borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.75)", fontSize: "15px", fontWeight: 600, cursor: "pointer",
          }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Leaderboard — most podium spots ─────────────────────────────────────────

function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  if (entries.length === 0) return null;

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "18px", padding: "14px 16px",
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "transparent", border: "none", padding: 0, cursor: "pointer",
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
          🏆 Top Performers
        </span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", opacity: 0.4 }}>
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
          {entries.map((e, idx) => {
            const isExpanded = expandedId === e.swimmer_id;
            return (
              <div key={e.swimmer_id} style={{
                borderRadius: "12px",
                background: idx === 0 ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.03)",
                overflow: "hidden",
              }}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : e.swimmer_id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.3)", width: "16px", flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: "13px", fontWeight: 600, color: "#fff",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left",
                  }}>
                    {e.swimmer_name}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    {e.gold > 0 && <span style={{ fontSize: "11px", fontWeight: 700, color: "#FDE68A" }}>🥇{e.gold}</span>}
                    {e.silver > 0 && <span style={{ fontSize: "11px", fontWeight: 700, color: "#CBD5E1" }}>🥈{e.silver}</span>}
                    {e.bronze > 0 && <span style={{ fontSize: "11px", fontWeight: 700, color: "#FDBA74" }}>🥉{e.bronze}</span>}
                    <span style={{
                      fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.4)",
                      background: "rgba(255,255,255,0.06)", borderRadius: "8px", padding: "2px 6px",
                    }}>
                      {e.total_points} pts
                    </span>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none"
                      style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", opacity: 0.35, flexShrink: 0 }}>
                      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ padding: "0 10px 10px 36px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {e.breakdown.map((b, bIdx) => (
                      <div key={`${b.event}-${bIdx}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "rgba(255,255,255,0.55)" }}>{b.event}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 700, color: placeColor(b.place) }}>
                            {b.place != null ? ordinal(b.place) : "—"}
                          </span>
                          <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600, minWidth: "52px", textAlign: "right" }}>
                            {b.points} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Podium (top 3) ───────────────────────────────────────────────────────────

const MEDALS: Record<number, { emoji: string; bg: string; border: string; glow: string }> = {
  1: { emoji: "🥇", bg: "linear-gradient(135deg, rgba(234,179,8,0.22), rgba(234,179,8,0.06))", border: "rgba(253,230,138,0.45)", glow: "0 0 24px rgba(234,179,8,0.15)" },
  2: { emoji: "🥈", bg: "linear-gradient(135deg, rgba(148,163,184,0.20), rgba(148,163,184,0.05))", border: "rgba(203,213,225,0.4)", glow: "0 0 18px rgba(148,163,184,0.1)" },
  3: { emoji: "🥉", bg: "linear-gradient(135deg, rgba(180,100,50,0.22), rgba(180,100,50,0.06))", border: "rgba(253,186,116,0.4)", glow: "0 0 18px rgba(180,100,50,0.12)" },
};

function PodiumCard({
  r, rank, onLongPress,
}: {
  r: ResultRow; rank: number; onLongPress: (r: ResultRow) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const MOVE_TOLERANCE = 12; // px — small jitter while holding still won't cancel the press

  function startPress(e: React.TouchEvent | React.MouseEvent) {
    const point = "touches" in e ? e.touches[0] : e;
    startPos.current = { x: point.clientX, y: point.clientY };
    timerRef.current = setTimeout(() => onLongPress(r), 400);
  }
  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    startPos.current = null;
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!startPos.current) return;
    const dx = e.touches[0].clientX - startPos.current.x;
    const dy = e.touches[0].clientY - startPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_TOLERANCE) cancelPress();
  }
  const m = MEDALS[rank];

  // Order on screen: 2nd, 1st, 3rd — with 1st taller
  const heightPad = rank === 1 ? "16px 14px" : "12px 12px";

  return (
    <div
      onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
      onTouchStart={startPress} onTouchEnd={cancelPress} onTouchMove={handleTouchMove}
      style={{
        flex: 1, minWidth: 0, background: m.bg, border: `1px solid ${m.border}`, boxShadow: m.glow,
        borderRadius: "16px", padding: heightPad,
        display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
        userSelect: "none", WebkitUserSelect: "none",
        transform: rank === 1 ? "translateY(-6px)" : "none",
      }}
    >
      <span style={{ fontSize: rank === 1 ? "26px" : "20px" }}>{m.emoji}</span>
      <span style={{
        fontSize: "12px", fontWeight: 700, color: "#fff", textAlign: "center",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
      }}>
        {r.swimmer_name}
      </span>
      <span style={{ fontSize: rank === 1 ? "15px" : "13px", fontWeight: 800, color: "#FDE68A", fontVariantNumeric: "tabular-nums" }}>
        {formatMs(r.time_ms)}
      </span>
      {r.fina_points != null && (
        <span style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
          {r.fina_points} pts
        </span>
      )}
      {r.is_pb && (
        <span style={{
          fontSize: "8px", fontWeight: 700, letterSpacing: "0.06em",
          background: "rgba(217,119,6,0.3)", color: "#FDE68A",
          borderRadius: "5px", padding: "1px 5px",
        }}>PB</span>
      )}
    </div>
  );
}

function Podium({ results, onLongPress }: { results: ResultRow[]; onLongPress: (r: ResultRow) => void }) {
  const first = results.find((r) => r.place === 1);
  const second = results.find((r) => r.place === 2);
  const third = results.find((r) => r.place === 3);
  if (!first && !second && !third) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", marginBottom: "10px" }}>
      {second && <PodiumCard r={second} rank={2} onLongPress={onLongPress} />}
      {first && <PodiumCard r={first} rank={1} onLongPress={onLongPress} />}
      {third && <PodiumCard r={third} rank={3} onLongPress={onLongPress} />}
    </div>
  );
}

// ─── Result row with long-press ───────────────────────────────────────────────

function ResultRowCard({
  r, idx, onLongPress,
}: {
  r: ResultRow; idx: number; onLongPress: (r: ResultRow) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const MOVE_TOLERANCE = 12; // px — small jitter while holding still won't cancel the press

  function startPress(e: React.TouchEvent | React.MouseEvent) {
    didLongPress.current = false;
    const point = "touches" in e ? e.touches[0] : e;
    startPos.current = { x: point.clientX, y: point.clientY };
    timerRef.current = setTimeout(() => { didLongPress.current = true; onLongPress(r); }, 400);
  }
  function cancelPress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    startPos.current = null;
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!startPos.current) return;
    const dx = e.touches[0].clientX - startPos.current.x;
    const dy = e.touches[0].clientY - startPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_TOLERANCE) cancelPress();
  }

  return (
    <div
      onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
      onTouchStart={startPress} onTouchEnd={cancelPress} onTouchMove={handleTouchMove}
      style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: "14px", padding: "10px 14px",
        display: "flex", alignItems: "center", gap: "10px",
        userSelect: "none", WebkitUserSelect: "none", cursor: "default",
      }}
    >
      <PlaceBadge rank={r.place ?? idx + 1} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.swimmer_name}
          </span>
          {r.is_pb && (
            <span style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
              background: "rgba(217,119,6,0.25)", color: "#FDE68A",
              borderRadius: "5px", padding: "2px 5px", flexShrink: 0,
            }}>PB</span>
          )}
        </div>
        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "1px" }}>
          {[r.swim_club, r.course, r.place != null ? `Official #${r.place}` : null, r.fina_points != null ? `${r.fina_points} pts` : null].filter(Boolean).join(" · ")}
        </p>
      </div>

      <span style={{ fontSize: "14px", fontWeight: 700, color: "#FDE68A", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        {formatMs(r.time_ms)}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MeetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetName = decodeURIComponent(params.slug as string);

  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [meetDate, setMeetDate] = useState<string | null>(null);
  const [course, setCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Sheet state — action → then either delete or edit
  const [actionRow, setActionRow] = useState<ResultRow | null>(null);
  const [editRow, setEditRow] = useState<ResultRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<ResultRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleEvent(event: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return next;
    });
  }

  useEffect(() => { if (meetName) void load(); }, [meetName]);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    const { data: swimmers } = await supabase.from("swimmers").select("id, name, swim_club, gender");
    const swimmerMap = new Map<number, { name: string; swim_club: string | null; gender: Gender | null }>();
    for (const s of (swimmers ?? []) as { id: number; name: string; swim_club: string | null; gender: Gender | null }[]) {
      swimmerMap.set(s.id, { name: s.name, swim_club: s.swim_club ?? null, gender: s.gender ?? null });
    }
    const swimmerIds = Array.from(swimmerMap.keys());
    if (swimmerIds.length === 0) { setLoading(false); return; }

    const { data: meetTimes } = await supabase
      .from("swim_times")
      .select("id, event, course, time_ms, place, swam_at, swimmer_id")
      .in("swimmer_id", swimmerIds)
      .eq("meet_name", meetName);

    const meetTimesArr = (meetTimes ?? []) as {
      id: number; event: string; course: string; time_ms: number;
      place: number | null; swam_at: string | null; swimmer_id: number;
    }[];

    if (meetTimesArr.length === 0) { setLoading(false); return; }

    const { data: allTimes } = await supabase
      .from("swim_times").select("swimmer_id, event, course, time_ms").in("swimmer_id", swimmerIds);

    const pbMap = new Map<string, number>();
    for (const t of (allTimes ?? []) as { swimmer_id: number; event: string; course: string; time_ms: number }[]) {
      const key = `${t.swimmer_id}|${t.event}|${t.course}`;
      const existing = pbMap.get(key);
      if (!existing || t.time_ms < existing) pbMap.set(key, t.time_ms);
    }

    const firstRow = meetTimesArr[0];
    setMeetDate(firstRow.swam_at);
    setCourse(firstRow.course);

    buildGroups(meetTimesArr, swimmerMap, pbMap);
    setLoading(false);
  }

  function buildGroups(
    meetTimesArr: { id: number; event: string; course: string; time_ms: number; place: number | null; swam_at: string | null; swimmer_id: number }[],
    swimmerMap: Map<number, { name: string; swim_club: string | null; gender: Gender | null }>,
    pbMap: Map<string, number>,
  ) {
    const rows: ResultRow[] = meetTimesArr.map((t) => {
      const sw = swimmerMap.get(t.swimmer_id);
      const pbKey = `${t.swimmer_id}|${t.event}|${t.course}`;
      const bestEver = pbMap.get(pbKey);
      return {
        id: t.id, event: t.event, course: t.course, time_ms: t.time_ms,
        place: t.place, swam_at: t.swam_at, swimmer_id: t.swimmer_id,
        swimmer_name: sw?.name ?? "Unknown", swim_club: sw?.swim_club ?? null,
        is_pb: bestEver === t.time_ms,
        fina_points: calcFinaPoints(t.time_ms, canonicalEventName(t.event), canonicalCourse(t.course), sw?.gender),
        gender: sw?.gender ?? null,
      };
    });

    // ── Group by event name — split by gender ONLY where placings collide ────
    const byEvent = new Map<string, ResultRow[]>();
    for (const row of rows) {
      if (!byEvent.has(row.event)) byEvent.set(row.event, []);
      byEvent.get(row.event)!.push(row);
    }

    const finalGroups: EventGroup[] = [];
    for (const [eventName, eventRows] of byEvent) {
      const placeCounts = new Map<number, number>();
      for (const r of eventRows) {
        if (r.place == null) continue;
        placeCounts.set(r.place, (placeCounts.get(r.place) ?? 0) + 1);
      }
      const hasCollision = Array.from(placeCounts.values()).some((c) => c > 1);

      if (!hasCollision) {
        // Single combined field — mixed gender or combined age group, doesn't
        // matter which; the placings are already internally consistent.
        finalGroups.push({ event: eventName, gender: null, results: eventRows });
      } else {
        const byGender = new Map<string, ResultRow[]>();
        for (const r of eventRows) {
          const key = r.gender ?? "unspecified";
          if (!byGender.has(key)) byGender.set(key, []);
          byGender.get(key)!.push(r);
        }
        for (const [key, subRows] of byGender) {
          finalGroups.push({
            event: eventName,
            gender: key === "unspecified" ? "unspecified" : (key as Gender),
            results: subRows,
          });
        }
      }
    }

    const sortedGroups = finalGroups.sort((a, b) => {
      const sA = STROKE_ORDER.indexOf(getStroke(a.event));
      const sB = STROKE_ORDER.indexOf(getStroke(b.event));
      if (sA !== sB) return sA - sB;
      const dA = getDistance(a.event) - getDistance(b.event);
      if (dA !== 0) return dA;
      return genderLabel(a.gender).localeCompare(genderLabel(b.gender));
    });

    // Sort results within each group by time asc
    for (const g of sortedGroups) g.results.sort((a, b) => a.time_ms - b.time_ms);
    setGroups(sortedGroups);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    await supabase.from("swim_splits").delete().eq("swim_time_id", deleteRow.id);
    await supabase.from("swim_times").delete().eq("id", deleteRow.id);
    setDeleting(false);
    const deletedId = deleteRow.id;
    setDeleteRow(null);
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, results: g.results.filter((r) => r.id !== deletedId) }))
        .filter((g) => g.results.length > 0)
    );
  }

  // ── Edit course ───────────────────────────────────────────────────────────

  async function handleSaveCourse(newCourse: string) {
    if (!editRow) return;
    setSaving(true);
    await supabase.from("swim_times").update({ course: newCourse }).eq("id", editRow.id);
    await supabase.from("swim_splits").update({ course: newCourse }).eq("swim_time_id", editRow.id);
    setSaving(false);
    const updatedId = editRow.id;
    setEditRow(null);
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        results: g.results.map((r) => r.id === updatedId ? { ...r, course: newCourse } : r),
      }))
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app">
          <div className="pt-2">
            <button type="button" onClick={() => router.push("/meets")}
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Meets
            </button>
          </div>
          <p className="muted">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <button type="button" onClick={() => router.push("/meets")}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Meets
          </button>

          <h1 className="text-2xl font-bold tracking-tight text-white leading-snug">{meetName}</h1>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {meetDate && (
              <span style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "20px", padding: "3px 10px", fontSize: "11px", color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>
                {formatDate(meetDate)}
              </span>
            )}
            {course && (
              <span style={{ background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.22)", borderRadius: "20px", padding: "3px 10px", fontSize: "11px", color: "#FDE68A", fontWeight: 600 }}>
                {formatCourseFull(course)}
              </span>
            )}
          </div>

          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", marginTop: "10px" }}>
            Hold any result to edit or delete.
          </p>
        </div>

        {/* Empty */}
        {groups.length === 0 ? (
          <div className="rounded-3xl p-8 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p style={{ color: "rgba(255,255,255,0.45)" }}>No results found for this meet.</p>
          </div>
        ) : (
          <>
            <Leaderboard entries={buildLeaderboard(groups)} />
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "20px" }}>
            {groups.map((group) => {
              const groupKey = groupKeyOf(group.event, group.gender);
              const isCollapsed = collapsed.has(groupKey);
              const podiumPlaces = new Set([1, 2, 3]);
              const restResults = group.results.filter((r) => r.place == null || !podiumPlaces.has(r.place));
              return (
                <div key={groupKey}>
                  <button
                    type="button"
                    onClick={() => toggleEvent(groupKey)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "transparent", border: "none", padding: "0 2px 8px", cursor: "pointer",
                    }}
                  >
                    <p style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>
                      {group.event}
                      {group.gender !== null && (
                        <span style={{ color: "rgba(255,255,255,0.25)" }}> · {genderLabel(group.gender)}</span>
                      )}
                      {" "}<span style={{ color: "rgba(255,255,255,0.2)" }}>· {group.results.length}</span>
                    </p>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                      style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s", opacity: 0.4, flexShrink: 0 }}>
                      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {!isCollapsed && (
                    <>
                      <Podium results={group.results} onLongPress={setActionRow} />
                      {restResults.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {restResults.map((r, idx) => (
                            <ResultRowCard key={r.id} r={r} idx={idx} onLongPress={setActionRow} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}

        <div className="h-4" />
      </div>

      {/* Action sheet — first tap: edit or delete choice */}
      {actionRow && !editRow && !deleteRow && (
        <ActionSheet
          row={actionRow}
          onDelete={() => { setDeleteRow(actionRow); setActionRow(null); }}
          onEdit={() => { setEditRow(actionRow); setActionRow(null); }}
          onCancel={() => setActionRow(null)}
        />
      )}

      {/* Edit course sheet */}
      {editRow && (
        <EditCourseSheet
          row={editRow}
          onSave={handleSaveCourse}
          onCancel={() => setEditRow(null)}
          saving={saving}
        />
      )}

      {/* Delete confirm sheet */}
      {deleteRow && (
        <DeleteSheet
          row={deleteRow}
          onConfirm={handleDelete}
          onCancel={() => setDeleteRow(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
