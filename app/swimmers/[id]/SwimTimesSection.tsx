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

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";

  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
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
  const e = canonicalEventName(event);

  return e
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
    return (
      Number(mm) * 60_000 +
      Number(sec) * 1000 +
      Number(hundredths) * 10
    );
  }

  if (/^\d{1,2}\.\d{2}$/.test(trimmed)) {
    const [sec, hundredths] = trimmed.split(".");
    return Number(sec) * 1000 + Number(hundredths) * 10;
  }

  return null;
}

export default function SwimTimesSection({ swimmerId }: Props) {
  const [rows, setRows] = useState<SwimTimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading swim times...");

  const [newEvent, setNewEvent] = useState("");
  const [newCourse, setNewCourse] = useState("LCM");
  const [newTime, setNewTime] = useState("");
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

    const { data, error } = await supabase
      .from("swim_times")
      .select("id, swimmer_id, event, course, time_ms, created_at")
      .eq("swimmer_id", swimmerId)
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(`Error loading swim times: ${error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as SwimTimeRow[]) || []);
    setStatus("Ready");
    setLoading(false);
  }

  async function handleAddTime() {
    const event = canonicalEventName(newEvent.trim());
    const course = canonicalCourse(newCourse.trim());
    const timeMs = parseTimeInputToMs(newTime);

    if (!event) {
      setStatus("Please enter an event.");
      return;
    }

    if (!timeMs) {
      setStatus("Please enter a valid time like 35.04 or 1:12.33");
      return;
    }

    setSaving(true);
    setStatus("Adding time...");

    const { error } = await supabase.from("swim_times").insert([
      {
        swimmer_id: swimmerId,
        event,
        course,
        time_ms: timeMs,
      },
    ]);

    if (error) {
      setStatus(`Error adding time: ${error.message}`);
      setSaving(false);
      return;
    }

    setNewEvent("");
    setNewCourse("LCM");
    setNewTime("");
    setShowAddModal(false);
    setStatus("Time added.");
    setSaving(false);
    await loadTimes();
  }

  async function handleDelete(id: number) {
    const confirmed = window.confirm("Delete this swim time?");
    if (!confirmed) return;

    setStatus("Deleting time...");

    const { error } = await supabase.from("swim_times").delete().eq("id", id);

    if (error) {
      setStatus(`Error deleting time: ${error.message}`);
      return;
    }

    setStatus("Time deleted.");
    await loadTimes();
  }

  function toggleStroke(stroke: string) {
    setExpandedStrokes((prev) => ({
      ...prev,
      [stroke]: !prev[stroke],
    }));
  }

  function toggleEvent(key: string) {
    setExpandedEvents((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  const strokeGroups = useMemo<StrokeGroup[]>(() => {
    const groupedEvents = new Map<string, SwimTimeRow[]>();

    for (const row of rows) {
      const key = eventKey(
        canonicalEventName(row.event),
        canonicalCourse(row.course)
      );

      const current = groupedEvents.get(key) || [];
      current.push({
        ...row,
        event: canonicalEventName(row.event),
        course: canonicalCourse(row.course),
      });
      groupedEvents.set(key, current);
    }

    const eventGroups: EventGroup[] = Array.from(groupedEvents.entries()).map(
      ([key, times]) => {
        const sortedTimes = [...times].sort((a, b) => a.time_ms - b.time_ms);
        const event = canonicalEventName(sortedTimes[0].event);

        return {
          key,
          event,
          shortEvent: toShortEventName(event),
          course: canonicalCourse(sortedTimes[0].course),
          pb: sortedTimes[0],
          times: sortedTimes,
        };
      }
    );

    const groupedByStroke: Record<string, EventGroup[]> = {};

    for (const group of eventGroups) {
      const stroke = getStrokeKey(group.event);
      if (!groupedByStroke[stroke]) groupedByStroke[stroke] = [];
      groupedByStroke[stroke].push(group);
    }

    const order = ["freestyle", "backstroke", "breaststroke", "butterfly", "im", "other"];

    return order
      .filter((stroke) => groupedByStroke[stroke]?.length)
      .map((stroke) => ({
        key: stroke,
        label: getStrokeLabel(stroke),
        events: [...groupedByStroke[stroke]].sort((a, b) => {
          const distanceDiff = getEventDistance(a.event) - getEventDistance(b.event);
          if (distanceDiff !== 0) return distanceDiff;
          return a.course.localeCompare(b.course);
        }),
      }));
  }, [rows]);

  if (loading) {
    return <p className="muted">{status}</p>;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="card-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="title">Swim Times</h2>
              <p className="mt-2 muted">
                PB-first view with full time history grouped by stroke.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
            >
              Add Time
            </button>
          </div>

          <p className="mt-4 text-sm text-white/50">{status}</p>
        </div>

        {strokeGroups.length === 0 ? (
          <div className="card-soft">
            <p className="text-white/70">No swim times yet.</p>
          </div>
        ) : (
          strokeGroups.map((strokeGroup) => {
            const isStrokeOpen = !!expandedStrokes[strokeGroup.key];

            return (
              <div key={strokeGroup.key} className="card-soft">
                <button
                  type="button"
                  onClick={() => toggleStroke(strokeGroup.key)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-3xl font-bold text-white">
                        {strokeGroup.label}
                      </h3>
                      <p className="mt-1 text-sm text-white/50">
                        {strokeGroup.events.length} event
                        {strokeGroup.events.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <p className="text-sm text-white/40">
                      {isStrokeOpen ? "Hide" : "Show"}
                    </p>
                  </div>
                </button>

                {isStrokeOpen && (
                  <div className="mt-5 space-y-5">
                    {strokeGroup.events.map((group) => {
                      const isEventOpen = !!expandedEvents[group.key];

                      return (
                        <div
                          key={group.key}
                          className="rounded-3xl border border-white/10 bg-white/5 p-5"
                        >
                          <button
                            type="button"
                            onClick={() => toggleEvent(group.key)}
                            className="w-full text-left"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h4 className="text-3xl font-bold text-white">
                                  {group.shortEvent}
                                </h4>
                                <p className="mt-1 text-2xl text-white/55">
                                  {group.course}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="text-3xl font-bold text-emerald-400">
                                  PB {formatMs(group.pb.time_ms)}
                                </p>
                                <p className="mt-1 text-xs text-white/40">
                                  {isEventOpen ? "Hide history" : "Show history"}
                                </p>
                              </div>
                            </div>
                          </button>

                          <div className="mt-5 space-y-3">
                            {group.times
                              .slice(0, isEventOpen ? group.times.length : 1)
                              .map((time, index) => {
                                const isPb = index === 0;

                                return (
                                  <div
                                    key={time.id}
                                    className={`flex items-center justify-between gap-4 rounded-3xl border p-5 ${
                                      isPb
                                        ? "border-emerald-500/40 bg-emerald-500/15"
                                        : "border-white/10 bg-white/5"
                                    }`}
                                  >
                                    <div>
                                      <div className="flex items-center gap-4">
                                        <p className="text-3xl font-bold text-white">
                                          {formatMs(time.time_ms)}
                                        </p>
                                        {isPb && (
                                          <span className="text-2xl font-bold text-emerald-400">
                                            PB
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleDelete(time.id)}
                                      className="rounded-3xl border border-white/15 bg-white/5 px-6 py-4 text-2xl font-semibold text-white transition hover:bg-white/10"
                                    >
                                      Delete
                                    </button>
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111318] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-4xl font-bold text-white">Add Time</h3>
                <p className="mt-2 text-white/55">
                  Add a new swim time for this swimmer.
                </p>
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
                placeholder="50 Free"
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
                placeholder="35.04 or 1:12.33"
                className="input"
              />

              <button
                type="button"
                onClick={handleAddTime}
                disabled={saving}
                className="w-full rounded-2xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-4 text-lg font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-50"
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