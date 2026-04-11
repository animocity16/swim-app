"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { canonicalCourse, canonicalEventName, eventKey } from "@/lib/events";

type Props = {
  swimmerId: number;
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
};

type SwimSplitRow = {
  id: number;
  swim_time_id: number;
  swimmer_id?: number | null;
  event?: string | null;
  course?: string | null;
  split_label?: string | null;
  split_order?: number | null;
  split_distance?: number | null;
  split_time_ms?: number | null;
  cumulative_time_ms?: number | null;
  created_at?: string | null;
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
  events: EventGroup[];
};

// ✅ Inline edit state for a single time entry
type EditingTime = {
  id: number;
  meetName: string;
  swamAt: string;
};

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function formatSwamAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function getStrokeKey(event: string) {
  const e = canonicalEventName(event).toLowerCase();
  if (e.includes("free")) return "freestyle";
  if (e.includes("back")) return "backstroke";
  if (e.includes("breast")) return "breaststroke";
  if (e.includes("fly")) return "butterfly";
  if (e.includes("im")) return "im";
  return "other";
}

function getStrokeLabel(stroke: string) {
  if (stroke === "freestyle") return "Freestyle";
  if (stroke === "backstroke") return "Backstroke";
  if (stroke === "breaststroke") return "Breaststroke";
  if (stroke === "butterfly") return "Butterfly";
  if (stroke === "im") return "IM";
  return "Other";
}

function getEventDistance(event: string) {
  const match = canonicalEventName(event).match(/\d+/);
  return match ? Number(match[0]) : 9999;
}

function toShortEventName(event: string) {
  return canonicalEventName(event)
    .replace("Freestyle", "Free")
    .replace("Butterfly", "Fly")
    .replace("Backstroke", "Back")
    .replace("Breaststroke", "Breast");
}

function parseTimeInputToMs(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{1,2}:\d{2}\.\d{2}$/.test(trimmed)) {
    const [mm, ss] = trimmed.split(":");
    const [sec, hundredths] = ss.split(".");
    return Number(mm) * 60_000 + Number(sec) * 1000 + Number(hundredths) * 10;
  }
  if (/^\d{1,2}\.\d{2}$/.test(trimmed)) {
    const [sec, hundredths] = trimmed.split(".");
    return Number(sec) * 1000 + Number(hundredths) * 10;
  }
  return null;
}

function isValidSplitRow(split: SwimSplitRow) {
  return (
    typeof split.id === "number" &&
    typeof split.swim_time_id === "number" &&
    typeof split.split_time_ms === "number" &&
    Number.isFinite(split.split_time_ms) &&
    split.split_time_ms > 0
  );
}

function sortTimesForDisplay(times: SwimTimeRow[]) {
  return [...times].sort((a, b) => {
    if (a.time_ms !== b.time_ms) return a.time_ms - b.time_ms;
    const aDate = a.swam_at ? new Date(a.swam_at).getTime() : 0;
    const bDate = b.swam_at ? new Date(b.swam_at).getTime() : 0;
    return bDate - aDate;
  });
}

function sortSplitsForDisplay(splits: SwimSplitRow[]) {
  return [...splits].sort((a, b) => {
    const aOrder = a.split_order ?? 9999;
    const bOrder = b.split_order ?? 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aDistance = a.split_distance ?? 9999;
    const bDistance = b.split_distance ?? 9999;
    return aDistance - bDistance;
  });
}

export default function SwimTimesSection({ swimmerId }: Props) {
  const [rows, setRows] = useState<SwimTimeRow[]>([]);
  const [splitsMap, setSplitsMap] = useState<Record<number, SwimSplitRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading swim times...");

  const [newEvent, setNewEvent] = useState("");
  const [newCourse, setNewCourse] = useState("LCM");
  const [newTime, setNewTime] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newMeetName, setNewMeetName] = useState("");
  const [saving, setSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedStrokes, setExpandedStrokes] = useState<Record<string, boolean>>({
    freestyle: true,
    backstroke: false,
    breaststroke: false,
    butterfly: false,
    im: false,
    other: false,
  });
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  const [expandedSplits, setExpandedSplits] = useState<Record<number, boolean>>({});

  // ✅ Inline editing state
  const [editingTime, setEditingTime] = useState<EditingTime | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    void loadTimes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swimmerId]);

  async function loadTimes() {
    if (!swimmerId || Number.isNaN(swimmerId)) {
      setStatus("Invalid swimmer id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("Loading swim times...");

    try {
      const { data: timesData, error: timesError } = await supabase
        .from("swim_times")
        .select("id, swimmer_id, event, course, time_ms, swam_at, meet_name, created_at")
        .eq("swimmer_id", swimmerId)
        .order("created_at", { ascending: false });

      if (timesError) {
        setStatus(`Error loading swim times: ${timesError.message}`);
        setRows([]); setSplitsMap({}); setLoading(false);
        return;
      }

      const timeRows = ((timesData as SwimTimeRow[]) || []).filter(
        (row) => typeof row.id === "number" && typeof row.time_ms === "number" && !!row.event && !!row.course
      );

      setRows(timeRows);

      if (timeRows.length === 0) {
        setSplitsMap({}); setStatus("Ready"); setLoading(false);
        return;
      }

      const timeIds = timeRows.map((row) => row.id);
      const { data: splitData, error: splitError } = await supabase
        .from("swim_splits").select("*").in("swim_time_id", timeIds);

      if (splitError) {
        setStatus(`Swim times loaded, but split load failed: ${splitError.message}`);
        setSplitsMap({}); setLoading(false);
        return;
      }

      const nextSplitsMap: Record<number, SwimSplitRow[]> = {};
      for (const rawSplit of (splitData as SwimSplitRow[]) || []) {
        if (!isValidSplitRow(rawSplit)) continue;
        const swimTimeId = Number(rawSplit.swim_time_id);
        if (!nextSplitsMap[swimTimeId]) nextSplitsMap[swimTimeId] = [];
        nextSplitsMap[swimTimeId].push(rawSplit);
      }
      for (const key of Object.keys(nextSplitsMap)) {
        nextSplitsMap[Number(key)] = sortSplitsForDisplay(nextSplitsMap[Number(key)]);
      }

      setSplitsMap(nextSplitsMap);
      setStatus("Ready");
    } catch (error: any) {
      setStatus(error?.message || "Something went wrong while loading swim times.");
      setRows([]); setSplitsMap({});
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTime() {
    const event = canonicalEventName(newEvent.trim());
    const course = canonicalCourse(newCourse.trim());
    const timeMs = parseTimeInputToMs(newTime);

    if (!event) { setStatus("Please enter an event."); return; }
    if (!timeMs) { setStatus("Please enter a valid time like 35.04 or 1:12.33"); return; }

    setSaving(true);
    setStatus("Adding time...");

    try {
      const { error } = await supabase.from("swim_times").insert([{
        swimmer_id: swimmerId,
        event, course, time_ms: timeMs,
        swam_at: newDate || null,
        meet_name: newMeetName.trim() || null,
      }]);

      if (error) { setStatus(`Error adding time: ${error.message}`); setSaving(false); return; }

      setNewEvent(""); setNewCourse("LCM"); setNewTime("");
      setNewDate(""); setNewMeetName("");
      setShowAddModal(false);
      setStatus("Time added.");
      await loadTimes();
    } catch (error: any) {
      setStatus(error?.message || "Something went wrong while adding time.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const confirmed = window.confirm("Delete this swim time and any linked splits?");
    if (!confirmed) return;

    setStatus("Deleting time...");

    try {
      await supabase.from("swim_splits").delete().eq("swim_time_id", id);
      const { error } = await supabase.from("swim_times").delete().eq("id", id);
      if (error) { setStatus(`Error deleting time: ${error.message}`); return; }
      setStatus("Time deleted.");
      await loadTimes();
    } catch (error: any) {
      setStatus(error?.message || "Something went wrong while deleting time.");
    }
  }

  // ✅ Open inline editor for a time entry
  function openEdit(time: SwimTimeRow) {
    setEditingTime({
      id: time.id,
      meetName: time.meet_name ?? "",
      swamAt: time.swam_at ?? "",
    });
  }

  // ✅ Save inline edit — updates meet_name and swam_at
  async function handleSaveEdit() {
    if (!editingTime) return;
    setSavingEdit(true);

    try {
      const { error } = await supabase
        .from("swim_times")
        .update({
          meet_name: editingTime.meetName.trim() || null,
          swam_at: editingTime.swamAt || null,
        })
        .eq("id", editingTime.id);

      if (error) {
        setStatus(`Error saving: ${error.message}`);
        return;
      }

      setEditingTime(null);
      setStatus("Updated.");
      await loadTimes();
    } catch (error: any) {
      setStatus(error?.message || "Something went wrong.");
    } finally {
      setSavingEdit(false);
    }
  }

  function toggleStroke(stroke: string) { setExpandedStrokes((prev) => ({ ...prev, [stroke]: !prev[stroke] })); }
  function toggleEvent(key: string) { setExpandedEvents((prev) => ({ ...prev, [key]: !prev[key] })); }
  function toggleSplits(timeId: number) { setExpandedSplits((prev) => ({ ...prev, [timeId]: !prev[timeId] })); }

  const strokeGroups = useMemo<StrokeGroup[]>(() => {
    const groupedEvents = new Map<string, SwimTimeRow[]>();

    for (const row of rows) {
      const key = eventKey(canonicalEventName(row.event), canonicalCourse(row.course));
      const current = groupedEvents.get(key) || [];
      current.push({ ...row, event: canonicalEventName(row.event), course: canonicalCourse(row.course) });
      groupedEvents.set(key, current);
    }

    const eventGroups: EventGroup[] = Array.from(groupedEvents.entries()).map(([key, times]) => {
      const sortedTimes = sortTimesForDisplay(times);
      const pb = [...times].sort((a, b) => a.time_ms - b.time_ms)[0];
      const event = canonicalEventName(sortedTimes[0].event);
      return { key, event, shortEvent: toShortEventName(event), course: canonicalCourse(sortedTimes[0].course), pb, times: sortedTimes };
    });

    const groupedByStroke: Record<string, EventGroup[]> = {};
    for (const group of eventGroups) {
      const stroke = getStrokeKey(group.event);
      if (!groupedByStroke[stroke]) groupedByStroke[stroke] = [];
      groupedByStroke[stroke].push(group);
    }

    const order = ["freestyle", "backstroke", "breaststroke", "butterfly", "im", "other"];
    return order.filter((stroke) => groupedByStroke[stroke]?.length).map((stroke) => ({
      key: stroke,
      label: getStrokeLabel(stroke),
      events: [...groupedByStroke[stroke]].sort((a, b) => {
        const distanceDiff = getEventDistance(a.event) - getEventDistance(b.event);
        if (distanceDiff !== 0) return distanceDiff;
        return a.course.localeCompare(b.course);
      }),
    }));
  }, [rows]);

  if (loading) return <p className="muted">{status}</p>;

  return (
    <>
      <div className="space-y-6">
        <div className="card-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="title">Swim Times</h2>
              <p className="mt-2 muted">PB-first view with full time history grouped by stroke.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="w-full rounded-2xl border border-amber-500/40 bg-amber-500/20 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-500/30 sm:w-auto"
            >
              Add Time
            </button>
          </div>
          <p className="mt-4 text-sm text-white/50">{status}</p>
        </div>

        {strokeGroups.length === 0 ? (
          <div className="card-soft"><p className="text-white/70">No swim times yet.</p></div>
        ) : (
          strokeGroups.map((strokeGroup) => {
            const isStrokeOpen = !!expandedStrokes[strokeGroup.key];
            return (
              <div key={strokeGroup.key} className="card-soft">
                <button type="button" onClick={() => toggleStroke(strokeGroup.key)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-3xl font-bold text-white">{strokeGroup.label}</h3>
                      <p className="mt-1 text-sm text-white/50">{strokeGroup.events.length} event{strokeGroup.events.length === 1 ? "" : "s"}</p>
                    </div>
                    <p className="text-sm text-white/40">{isStrokeOpen ? "Hide" : "Show"}</p>
                  </div>
                </button>

                {isStrokeOpen && (
                  <div className="mt-5 space-y-5">
                    {strokeGroup.events.map((group) => {
                      const isEventOpen = !!expandedEvents[group.key];
                      return (
                        <div key={group.key} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                          <button type="button" onClick={() => toggleEvent(group.key)} className="w-full text-left">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h4 className="text-3xl font-bold text-white">{group.shortEvent}</h4>
                                <p className="mt-1 text-2xl text-white/55">{group.course}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-3xl font-bold text-amber-400">PB {formatMs(group.pb.time_ms)}</p>
                                <p className="mt-1 text-xs text-white/40">{isEventOpen ? "Hide history" : "Show history"}</p>
                              </div>
                            </div>
                          </button>

                          <div className="mt-5 space-y-3">
                            {group.times.slice(0, isEventOpen ? group.times.length : 1).map((time) => {
                              const isPb = time.id === group.pb.id;
                              const swamAtLabel = formatSwamAt(time.swam_at);
                              const validSplits = (splitsMap[time.id] || []).filter(isValidSplitRow);
                              const showSplits = !!expandedSplits[time.id];
                              const isEditing = editingTime?.id === time.id;

                              return (
                                <div
                                  key={time.id}
                                  className={`rounded-3xl border p-4 sm:p-5 ${
                                    isPb ? "border-amber-500/40 bg-amber-500/10" : "border-white/10 bg-white/5"
                                  }`}
                                >
                                  {isEditing ? (
                                    /* ✅ Inline edit form */
                                    <div className="space-y-3">
                                      <p className="text-sm font-semibold text-white/70">
                                        Editing {formatMs(time.time_ms)}
                                      </p>
                                      <div>
                                        <label className="mb-1 block text-xs text-white/40 uppercase tracking-wider">
                                          Meet name
                                        </label>
                                        <input
                                          value={editingTime.meetName}
                                          onChange={(e) => setEditingTime((prev) => prev ? { ...prev, meetName: e.target.value } : prev)}
                                          placeholder="e.g. 56th SNAG Juniors 2026"
                                          className="input"
                                        />
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-xs text-white/40 uppercase tracking-wider">
                                          Date
                                        </label>
                                        <input
                                          type="date"
                                          value={editingTime.swamAt}
                                          onChange={(e) => setEditingTime((prev) => prev ? { ...prev, swamAt: e.target.value } : prev)}
                                          className="input"
                                        />
                                      </div>
                                      <div className="flex gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={handleSaveEdit}
                                          disabled={savingEdit}
                                          className="flex-1 rounded-2xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                                          style={{ background: "#D97706" }}
                                        >
                                          {savingEdit ? "Saving..." : "Save"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingTime(null)}
                                          className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/10"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    /* ✅ Normal display */
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                                          <p className="text-3xl font-bold text-white">{formatMs(time.time_ms)}</p>
                                          {isPb && <span className="text-2xl font-bold text-amber-400">PB</span>}
                                        </div>

                                        {/* Meet name */}
                                        {time.meet_name ? (
                                          <p className="mt-1 text-sm font-medium text-white/70">{time.meet_name}</p>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => openEdit(time)}
                                            className="mt-1 text-sm text-white/30 hover:text-amber-400 transition"
                                          >
                                            + Add meet name
                                          </button>
                                        )}

                                        {/* Date */}
                                        {swamAtLabel && (
                                          <p className="mt-0.5 text-sm text-white/40">{swamAtLabel}</p>
                                        )}

                                        {/* Splits toggle */}
                                        {validSplits.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => toggleSplits(time.id)}
                                            className="mt-3 text-sm font-medium text-amber-400 underline underline-offset-4"
                                          >
                                            {showSplits ? "Hide splits" : "Show splits"}
                                          </button>
                                        )}
                                      </div>

                                      <div className="flex gap-2">
                                        {/* ✅ Edit button */}
                                        <button
                                          type="button"
                                          onClick={() => openEdit(time)}
                                          className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/60 transition hover:bg-white/10"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDelete(time.id)}
                                          className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-lg font-semibold text-white transition hover:bg-white/10"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Splits view */}
                                  {!isEditing && validSplits.length > 0 && showSplits && (
                                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                                      <div className="space-y-2">
                                        {validSplits.map((split) => (
                                          <div key={split.id} className="flex items-center justify-between gap-4 rounded-xl bg-white/5 px-3 py-2">
                                            <div className="min-w-0">
                                              <p className="text-sm font-medium text-white">{split.split_label || "Split"}</p>
                                              {split.cumulative_time_ms != null && (
                                                <p className="text-xs text-white/45">Cumulative: {formatMs(split.cumulative_time_ms)}</p>
                                              )}
                                            </div>
                                            <p className="shrink-0 text-sm font-semibold text-amber-400">{formatMs(split.split_time_ms)}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Time Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-4xl font-bold text-white">Add Time</h3>
                <p className="mt-2 text-white/55">Add a new swim time for this swimmer.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <input
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                placeholder="Event e.g. 100 Back"
                className="input"
              />
              <select
                value={newCourse}
                onChange={(e) => setNewCourse(e.target.value)}
                className="input"
              >
                <option value="LCM">LCM</option>
                <option value="SCM">SCM</option>
                <option value="SCY">SCY</option>
              </select>
              <input
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                placeholder="Time e.g. 35.04 or 1:12.33"
                className="input"
              />
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="input"
              />
              <input
                value={newMeetName}
                onChange={(e) => setNewMeetName(e.target.value)}
                placeholder="Meet name (optional) e.g. SNAG Juniors 2026"
                className="input"
              />
              <button
                type="button"
                onClick={handleAddTime}
                disabled={saving}
                className="w-full rounded-2xl py-4 text-lg font-semibold text-white transition disabled:opacity-50"
                style={{ background: "#D97706" }}
              >
                {saving ? "Adding..." : "Add time"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}