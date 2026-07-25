"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { canonicalCourse, canonicalEventName, eventKey } from "@/lib/events";
import ShareCardModal, { type ShareResult } from "@/app/components/ShareCardModal";

type Props = {
  swimmerId: number;
  swimmerAge?: number | null;
  swimmerName?: string;
};

type SwimTimeRow = {
  id: number;
  swimmer_id: number;
  event: string;
  course: string;
  time_ms: number;
  swam_at?: string | null;
  meet_name?: string | null;
  created_at?: string | null;
  place?: number | null;
};

type SwimSplitRow = {
  id: number;
  swim_time_id: number;
  split_label?: string | null;
  split_order?: number | null;
  split_distance?: number | null;
  split_time_ms?: number | null;
  cumulative_time_ms?: number | null;
};

type EventGroup = {
  key: string;
  event: string;
  shortEvent: string;
  course: string;
  pb: SwimTimeRow;
  times: SwimTimeRow[];
};

type StrokeGroup = {
  key: string;
  label: string;
  color: string;
  events: EventGroup[];
};

type EditingTime = { id: number; meetName: string; swamAt: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2);
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getEventDistanceM(event: string): number | null {
  const match = canonicalEventName(event).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function formatSpeed(timeMs: number | null | undefined, event: string): string | null {
  if (timeMs == null || timeMs <= 0) return null;
  const distance = getEventDistanceM(event);
  if (!distance) return null;
  const seconds = timeMs / 1000;
  const speed = distance / seconds;
  return `${speed.toFixed(2)} m/s`;
}

// ─── Per-split pacing ─────────────────────────────────────────────────────
// NOTE: split_distance as stored is CUMULATIVE distance at that checkpoint
// (e.g. 50, 100, 150, 200 for a 200m race split every 50m) — not the
// distance of that individual leg. Leg distance must be derived as the
// difference between consecutive cumulative values.

function computeSplitSpeeds(sortedSplits: SwimSplitRow[]): (number | null)[] {
  let prevCumDistance = 0;
  return sortedSplits.map((split) => {
    if (!split.split_time_ms || split.split_time_ms <= 0) return null;
    if (split.split_distance == null || split.split_distance <= 0) return null;

    const legDistance = split.split_distance - prevCumDistance;
    prevCumDistance = split.split_distance;

    if (legDistance <= 0) return null;
    return legDistance / (split.split_time_ms / 1000);
  });
}

const FADE_THRESHOLD = 0.05; // >5% drop first-to-last lap counts as "fading"

type PacingSummary = { label: string; colorHex: string; icon: "down" | "up" | "flat" } | null;

function getPacingSummary(speeds: (number | null)[]): PacingSummary {
  const validSpeeds = speeds.filter((s): s is number => s != null);
  if (validSpeeds.length < 2) return null;

  const first = validSpeeds[0];
  const last = validSpeeds[validSpeeds.length - 1];
  if (!first || first <= 0) return null;

  const delta = last - first;
  const pctChange = delta / first;

  if (pctChange <= -FADE_THRESHOLD) {
    return {
      label: `Fading pace, ${delta.toFixed(2)} m/s by the last lap`,
      colorHex: "#F87171",
      icon: "down",
    };
  }
  if (pctChange >= FADE_THRESHOLD) {
    return {
      label: `Negative split, +${delta.toFixed(2)} m/s by the last lap`,
      colorHex: "#34D399",
      icon: "up",
    };
  }
  return {
    label: "Even pacing across the swim",
    colorHex: "#94A3B8",
    icon: "flat",
  };
}

function getStrokeKey(event: string) {
  const e = event.toLowerCase();
  if (e.includes("breaststroke") || e.includes("breast")) return "breaststroke";
  if (e.includes("backstroke") || e.includes("back")) return "backstroke";
  if (e.includes("butterfly") || e.includes("fly")) return "butterfly";
  if (e.includes("freestyle") || e.includes("free")) return "freestyle";
  if (e.includes("medley") || e.endsWith(" im") || e === "im") return "im";
  return "other";
}

const STROKE_META: Record<string, { label: string; color: string; order: number }> = {
  freestyle:    { label: "Freestyle",    color: "#38BDF8", order: 0 },
  backstroke:   { label: "Backstroke",   color: "#A78BFA", order: 1 },
  breaststroke: { label: "Breaststroke", color: "#34D399", order: 2 },
  butterfly:    { label: "Butterfly",    color: "#FB923C", order: 3 },
  im:           { label: "IM",           color: "#F472B6", order: 4 },
  other:        { label: "Other",        color: "#94A3B8", order: 5 },
};

function toShortEvent(event: string) {
  return canonicalEventName(event)
    .replace("Freestyle", "Free").replace("Butterfly", "Fly")
    .replace("Backstroke", "Back").replace("Breaststroke", "Breast");
}

function getEventDistance(event: string) {
  const match = canonicalEventName(event).match(/\d+/);
  return match ? Number(match[0]) : 9999;
}

function parseTimeInputToMs(value: string) {
  const t = value.trim();
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(t)) {
    const [mm, ss] = t.split(":");
    const [sec, hun] = ss.split(".");
    return Number(mm) * 60_000 + Number(sec) * 1000 + Number(hun) * 10;
  }
  if (/^\d{1,2}\.\d{2}$/.test(t)) {
    const [sec, hun] = t.split(".");
    return Number(sec) * 1000 + Number(hun) * 10;
  }
  return null;
}

const EVENTS = [
  "50 Freestyle", "100 Freestyle", "200 Freestyle", "400 Freestyle", "800 Freestyle", "1500 Freestyle",
  "50 Backstroke", "100 Backstroke", "200 Backstroke",
  "50 Breaststroke", "100 Breaststroke", "200 Breaststroke",
  "50 Butterfly", "100 Butterfly", "200 Butterfly",
  "200 IM", "400 IM",
];

// ─── Dynamic meet presets ─────────────────────────────────────────────────────

function getMeetPresets(swimmerAge?: number | null): string[] {
  const currentYear = new Date().getFullYear();
  const snagNumber = 56 + (currentYear - 2026);
  const snscNumber = 21 + (currentYear - 2026);
  const jicNumber = 39 + (currentYear - 2026);

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const base = [
    "Swim Series 1",
    "Swim Series 2",
    `${ordinal(snagNumber)} SNAG ${currentYear}`,
    `NSG ${currentYear}`,
    `Pesta Sukan ${currentYear}`,
  ];

  const ageSpecific =
    swimmerAge != null && swimmerAge <= 12
      ? [`ETC ${currentYear}`, `${ordinal(jicNumber)} JIC ${currentYear}`]
      : [`${ordinal(snscNumber)} SNSC ${currentYear}`];

  return [...base, ...ageSpecific, "Club Time Trial", "Time Trial"];
}

// ─── Share icon ───────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path
        d="M10 2L13 5M13 5L10 8M13 5H6C4.34 5 3 6.34 3 8V13"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SwimTimesSection({ swimmerId, swimmerAge, swimmerName = "Swimmer" }: Props) {
  const [rows, setRows] = useState<SwimTimeRow[]>([]);
  const [splitsMap, setSplitsMap] = useState<Record<number, SwimSplitRow[]>>({});
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState("");
  const [newCourse, setNewCourse] = useState("LCM");
  const [newTime, setNewTime] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newMeetName, setNewMeetName] = useState("");
  const [saving, setSaving] = useState(false);
  const [addStatus, setAddStatus] = useState("");

  const [expandedStrokes, setExpandedStrokes] = useState<Record<string, boolean>>({});
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  const [expandedSplits, setExpandedSplits] = useState<Record<number, boolean>>({});
  const [editingTime, setEditingTime] = useState<EditingTime | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [shareResult, setShareResult] = useState<ShareResult | null>(null);

  const meetPresets = useMemo(() => getMeetPresets(swimmerAge), [swimmerAge]);

  useEffect(() => { void loadTimes(); }, [swimmerId]);

  async function loadTimes() {
    setLoading(true);
    try {
      const { data: timesData } = await supabase
        .from("swim_times")
        .select("id, swimmer_id, event, course, time_ms, swam_at, meet_name, created_at, place")
        .eq("swimmer_id", swimmerId)
        .order("swam_at", { ascending: false });

      const timeRows = ((timesData as SwimTimeRow[]) || []).filter(
        (r) => typeof r.id === "number" && typeof r.time_ms === "number" && !!r.event && !!r.course
      );
      setRows(timeRows);

      if (timeRows.length > 0) {
        const { data: splitData } = await supabase
          .from("swim_splits").select("*")
          .in("swim_time_id", timeRows.map((r) => r.id));
        const map: Record<number, SwimSplitRow[]> = {};
        for (const s of (splitData as SwimSplitRow[]) || []) {
          if (!map[s.swim_time_id]) map[s.swim_time_id] = [];
          map[s.swim_time_id].push(s);
        }
        setSplitsMap(map);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTime() {
    const event = canonicalEventName(newEvent.trim());
    const course = canonicalCourse(newCourse);
    const ms = parseTimeInputToMs(newTime);
    if (!event) { setAddStatus("Please select an event."); return; }
    if (!ms) { setAddStatus("Enter a valid time e.g. 35.04 or 1:12.33"); return; }
    setSaving(true);
    setAddStatus("Saving...");
    const { error } = await supabase.from("swim_times").insert([{
      swimmer_id: swimmerId, event, course, time_ms: ms,
      swam_at: newDate || null,
      meet_name: newMeetName.trim() || null,
    }]);
    if (error) { setAddStatus(`Error: ${error.message}`); setSaving(false); return; }
    setNewEvent(""); setNewCourse("LCM"); setNewTime(""); setNewDate(""); setNewMeetName("");
    setShowAddForm(false); setAddStatus("");
    await loadTimes();
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this time?")) return;
    await supabase.from("swim_splits").delete().eq("swim_time_id", id);
    await supabase.from("swim_times").delete().eq("id", id);
    await loadTimes();
  }

  async function handleSaveEdit() {
    if (!editingTime) return;
    setSavingEdit(true);
    await supabase.from("swim_times").update({
      meet_name: editingTime.meetName.trim() || null,
      swam_at: editingTime.swamAt || null,
    }).eq("id", editingTime.id);
    setEditingTime(null);
    setSavingEdit(false);
    await loadTimes();
  }

  function toggleStroke(key: string) {
    setExpandedStrokes((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleEvent(key: string) {
    setExpandedEvents((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const strokeGroups = useMemo<StrokeGroup[]>(() => {
    const grouped = new Map<string, SwimTimeRow[]>();
    for (const row of rows) {
      const key = eventKey(canonicalEventName(row.event), canonicalCourse(row.course));
      const cur = grouped.get(key) || [];
      cur.push({ ...row, event: canonicalEventName(row.event), course: canonicalCourse(row.course) });
      grouped.set(key, cur);
    }

    const eventGroups: EventGroup[] = Array.from(grouped.entries()).map(([key, times]) => {
      const pb = [...times].sort((a, b) => a.time_ms - b.time_ms)[0];
      const byDate = [...times].sort((a, b) =>
        new Date(b.swam_at || "").getTime() - new Date(a.swam_at || "").getTime()
      );
      return {
        key,
        event: canonicalEventName(times[0].event),
        shortEvent: toShortEvent(times[0].event),
        course: canonicalCourse(times[0].course),
        pb,
        times: byDate,
      };
    });

    const byStroke: Record<string, EventGroup[]> = {};
    for (const eg of eventGroups) {
      const stroke = getStrokeKey(eg.event);
      if (!byStroke[stroke]) byStroke[stroke] = [];
      byStroke[stroke].push(eg);
    }

    return Object.entries(byStroke)
      .sort(([a], [b]) => (STROKE_META[a]?.order ?? 9) - (STROKE_META[b]?.order ?? 9))
      .map(([stroke, events]) => ({
        key: stroke,
        label: STROKE_META[stroke]?.label ?? stroke,
        color: STROKE_META[stroke]?.color ?? "#94A3B8",
        events: events.sort((a, b) => getEventDistance(a.event) - getEventDistance(b.event)),
      }));
  }, [rows]);

  if (loading) return <div className="py-4 text-center text-sm text-white/40">Loading times…</div>;

  return (
    <>
      <div className="space-y-3">

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
            {rows.length} result{rows.length === 1 ? "" : "s"} · {strokeGroups.reduce((n, g) => n + g.events.length, 0)} events
          </p>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-2xl border px-3 py-1.5 text-xs font-semibold transition"
            style={{
              background: showAddForm ? "rgba(217,119,6,0.2)" : "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: showAddForm ? "#FDE68A" : "rgba(255,255,255,0.5)",
            }}
          >
            {showAddForm ? "Cancel" : "+ Add time"}
          </button>
        </div>

        {/* Add time form */}
        {showAddForm && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <select value={newEvent} onChange={(e) => setNewEvent(e.target.value)} className="input">
              <option value="">Select event…</option>
              {EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={newCourse} onChange={(e) => setNewCourse(e.target.value)} className="input">
                <option value="LCM">LCM</option>
                <option value="SCM">SCM</option>
                <option value="SCY">SCY</option>
              </select>
              <input value={newTime} onChange={(e) => setNewTime(e.target.value)}
                placeholder="35.04 or 1:12.33" className="input" />
            </div>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="input" />

            <div>
              <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">Meet name</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {meetPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNewMeetName(preset)}
                    className="rounded-full px-2.5 py-1 text-[10px] font-medium transition"
                    style={newMeetName === preset
                      ? { background: "rgba(217,119,6,0.25)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                      : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.45)" }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input value={newMeetName} onChange={(e) => setNewMeetName(e.target.value)}
                placeholder="Or type a meet name…" className="input" />
            </div>

            {addStatus && <p className="text-xs text-white/50">{addStatus}</p>}
            <button type="button" onClick={handleAddTime} disabled={saving}
              className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: "#D97706" }}>
              {saving ? "Saving…" : "Add time"}
            </button>
          </div>
        )}

        {/* Empty state */}
        {strokeGroups.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center">
            <p className="text-sm text-white/40">No times yet — add one above or import from Settings.</p>
          </div>
        )}

        {/* Stroke groups — collapsible */}
        {strokeGroups.map((sg) => {
          const isStrokeOpen = !!expandedStrokes[sg.key];
          return (
            <div key={sg.key} className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>

              {/* Stroke header — tappable to collapse/expand */}
              <button
                type="button"
                onClick={() => toggleStroke(sg.key)}
                className="w-full px-4 pt-3 pb-3 flex items-center gap-2 transition hover:bg-white/5"
              >
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: sg.color }} />
               <p className="text-sm font-bold uppercase tracking-normal truncate min-w-0 flex-1" style={{ color: sg.color }}>
                  {sg.label}
                </p>
                <p className="text-xs text-white/25 flex-shrink-0">
                  {sg.events.length} event{sg.events.length === 1 ? "" : "s"}
                </p>
                {!isStrokeOpen && (
                  <p className="ml-auto text-sm font-bold" style={{ color: "#FDE68A" }}>
                    {formatMs(sg.events[0]?.pb.time_ms)}
                  </p>
                )}
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"
                  className="flex-shrink-0 text-white/20 transition-transform ml-1"
                  style={{ transform: isStrokeOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
                  <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Event rows — only show when stroke is expanded */}
              {isStrokeOpen && sg.events.map((eg) => {
                const isOpen = !!expandedEvents[eg.key];
                const pbSpeed = formatSpeed(eg.pb.time_ms, eg.event);
                return (
                  <div key={eg.key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>

                    {/* PB row */}
                    <div className="flex items-center gap-1 pr-2">
                      <button
                        type="button"
                        onClick={() => toggleEvent(eg.key)}
                        className="flex flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-semibold text-white">{eg.shortEvent}</span>
                            <span className="text-[10px] text-white/30">{eg.course}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold" style={{ color: "#FDE68A" }}>{formatMs(eg.pb.time_ms)}</p>
                          {pbSpeed && (
                            <p className="text-[10px] font-medium mt-0.5" style={{ color: "rgba(253,230,138,0.5)" }}>
                              {pbSpeed}
                            </p>
                          )}
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            {eg.pb.place != null && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: "rgba(99,179,237,0.15)", color: "#90CDF4", border: "1px solid rgba(99,179,237,0.25)" }}>
                                {eg.pb.place}{eg.pb.place === 1 ? "st" : eg.pb.place === 2 ? "nd" : eg.pb.place === 3 ? "rd" : "th"}
                              </span>
                            )}
                            {eg.pb.swam_at && (
                              <p className="text-[10px] text-white/30">{formatDate(eg.pb.swam_at)}</p>
                            )}
                          </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                          className="flex-shrink-0 text-white/20 transition-transform"
                          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
                          <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {/* Share button */}
                      <button
                        type="button"
                        onClick={() => setShareResult({
                          swimmerName,
                          event: eg.event,
                          course: eg.course,
                          timeMs: eg.pb.time_ms,
                          meetName: eg.pb.meet_name,
                          swamAt: eg.pb.swam_at,
                          isPB: true,
                          strokeColor: sg.color,
                          place: eg.pb.place ?? null,
                        })}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition"
                        style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)" }}
                        title="Share result"
                      >
                        <ShareIcon />
                      </button>
                    </div>

                    {/* Expanded history */}
                    {isOpen && (
                      <div style={{ background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        {eg.times.map((time, tIdx) => {
                          const isPB = time.id === eg.pb.id;
                          const splits = (splitsMap[time.id] || []).filter((s) => s.split_time_ms && s.split_time_ms > 0);
                          const showSplits = !!expandedSplits[time.id];
                          const isEditing = editingTime?.id === time.id;
                          const isLastTime = tIdx === eg.times.length - 1;
                          const timeSpeed = formatSpeed(time.time_ms, eg.event);

                          return (
                            <div key={time.id}
                              style={{ borderBottom: isLastTime ? "none" : "1px solid rgba(255,255,255,0.04)", padding: "10px 16px" }}>

                              {isEditing ? (
                                <div className="space-y-2">
                                  <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">Meet name</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {meetPresets.map((preset) => (
                                      <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setEditingTime((p) => p ? { ...p, meetName: preset } : p)}
                                        className="rounded-full px-2.5 py-1 text-[10px] font-medium transition"
                                        style={editingTime?.meetName === preset
                                          ? { background: "rgba(217,119,6,0.25)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                                          : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.45)" }}
                                      >
                                        {preset}
                                      </button>
                                    ))}
                                  </div>
                                  <input
                                    value={editingTime?.meetName ?? ""}
                                    onChange={(e) => setEditingTime((p) => p ? { ...p, meetName: e.target.value } : p)}
                                    placeholder="Or type a meet name…"
                                    className="input"
                                  />
                                  <input
                                    type="date"
                                    value={editingTime?.swamAt ?? ""}
                                    onChange={(e) => setEditingTime((p) => p ? { ...p, swamAt: e.target.value } : p)}
                                    className="input"
                                  />
                                  <div className="flex gap-2">
                                    <button type="button" onClick={handleSaveEdit} disabled={savingEdit}
                                      className="flex-1 rounded-xl py-2 text-xs font-semibold text-white disabled:opacity-50"
                                      style={{ background: "#D97706" }}>
                                      {savingEdit ? "Saving…" : "Save"}
                                    </button>
                                    <button type="button" onClick={() => setEditingTime(null)}
                                      className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white/50">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-bold" style={{ color: isPB ? "#FDE68A" : "white" }}>
                                        {formatMs(time.time_ms)}
                                      </span>
                                      {isPB && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                          style={{ background: "rgba(253,230,138,0.15)", color: "#FDE68A", border: "1px solid rgba(253,230,138,0.25)" }}>
                                          PB
                                        </span>
                                      )}
                                      {timeSpeed && (
                                        <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
                                          {timeSpeed}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-white/35 mt-0.5">
                                      {time.meet_name || "—"}
                                      {time.swam_at ? ` · ${formatDate(time.swam_at)}` : ""}
                                    </p>
                                    {splits.length > 0 && (
                                      <button type="button"
                                        onClick={() => setExpandedSplits((p) => ({ ...p, [time.id]: !p[time.id] }))}
                                        className="mt-1 text-[10px] font-medium transition"
                                        style={{ color: "#FDE68A" }}>
                                        {showSplits ? "Hide splits" : `Show ${splits.length} splits`}
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex gap-1.5 flex-shrink-0">
                                    <button type="button"
                                      onClick={() => setEditingTime({ id: time.id, meetName: time.meet_name ?? "", swamAt: time.swam_at ?? "" })}
                                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/50 transition hover:bg-white/10">
                                      Edit
                                    </button>
                                    <button type="button" onClick={() => void handleDelete(time.id)}
                                      className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300 transition hover:bg-red-500/20">
                                      Del
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Splits table */}
                              {!isEditing && showSplits && splits.length > 0 && (() => {
                                const sortedSplits = [...splits].sort(
                                  (a, b) => (a.split_order ?? 0) - (b.split_order ?? 0)
                                );
                                const speeds = computeSplitSpeeds(sortedSplits);
                                const validSpeeds = speeds.filter((s): s is number => s != null);
                                const fastest = validSpeeds.length > 1 ? Math.max(...validSpeeds) : null;
                                const slowest = validSpeeds.length > 1 ? Math.min(...validSpeeds) : null;
                                const pacing = getPacingSummary(speeds);

                                return (
                                  <div className="mt-2 rounded-xl overflow-hidden"
                                    style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                    {pacing && (
                                      <div className="flex items-center gap-1.5 px-3 py-1.5"
                                        style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                        <span className="text-[10px] font-semibold" style={{ color: pacing.colorHex }}>
                                          {pacing.icon === "down" ? "↓" : pacing.icon === "up" ? "↑" : "→"}
                                        </span>
                                        <span className="text-[10px] font-medium" style={{ color: pacing.colorHex }}>
                                          {pacing.label}
                                        </span>
                                      </div>
                                    )}
                                    <div className="grid grid-cols-[1fr_56px_62px_80px] gap-2 px-3 py-2 items-center"
                                      style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                      <span className="text-[9px] font-semibold uppercase tracking-widest text-white/30">Split</span>
                                      <span className="text-[9px] font-semibold uppercase tracking-widest text-white/30 text-right">Leg</span>
                                      <span className="text-[9px] font-semibold uppercase tracking-widest text-white/30 text-right">Cum.</span>
                                      <span className="text-[9px] font-semibold uppercase tracking-widest text-white/30 text-right">Speed</span>
                                    </div>
                                    {sortedSplits.map((split, sIdx, arr) => {
                                      const speed = speeds[sIdx];
                                      let speedColor = "rgba(255,255,255,0.5)";
                                      if (speed != null && fastest != null && speed === fastest) speedColor = "#34D399";
                                      else if (speed != null && slowest != null && speed === slowest) speedColor = "#F87171";

                                      return (
                                        <div key={split.id}
                                          className="grid grid-cols-[1fr_56px_62px_80px] gap-2 px-3 py-2 items-center"
                                          style={{ borderBottom: sIdx === arr.length - 1 ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
                                          <p className="text-xs font-medium text-white/75">
                                            {split.split_label || "Split"}
                                          </p>
                                          <p className="text-xs font-bold tabular-nums text-right" style={{ color: "#FDE68A" }}>
                                            {formatMs(split.split_time_ms)}
                                          </p>
                                          <p className="text-xs tabular-nums text-right text-white/50">
                                            {split.cumulative_time_ms != null ? formatMs(split.cumulative_time_ms) : "—"}
                                          </p>
                                          <p className="text-[11px] font-semibold tabular-nums text-right whitespace-nowrap" style={{ color: speedColor }}>
                                            {speed != null ? `${speed.toFixed(2)} m/s` : "—"}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {shareResult && (
        <ShareCardModal
          result={shareResult}
          onClose={() => setShareResult(null)}
        />
      )}
    </>
  );
}