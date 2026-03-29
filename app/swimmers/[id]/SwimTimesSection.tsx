"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { canonicalCourse, canonicalEventName, eventKey } from "@/lib/events";

type SwimTime = {
  id: number;
  swimmer_id: number;
  event: string;
  course: string;
  time_ms: number;
  meet_name: string | null;
  meet_date: string | null;
  notes: string | null;
  created_at: string;
};

const EVENT_OPTIONS = [
  "50 Free",
  "100 Free",
  "200 Free",
  "400 Free",
  "800 Free",
  "1500 Free",
  "50 Fly",
  "100 Fly",
  "200 Fly",
  "50 Back",
  "100 Back",
  "200 Back",
  "50 Breast",
  "100 Breast",
  "200 Breast",
  "100 IM",
  "200 IM",
  "400 IM",
];

function parseToMs(input: string) {
  const s = input.trim();
  if (!s) return null;

  if (s.includes(":")) {
    const [mStr, secStr] = s.split(":");
    const minutes = Number(mStr);
    const seconds = Number(secStr);

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return Math.round((minutes * 60 + seconds) * 1000);
  }

  const seconds = Number(s);
  if (!Number.isFinite(seconds)) return null;
  return Math.round(seconds * 1000);
}

function formatMs(ms: number) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function formatGapMs(gapMs: number) {
  const s = (gapMs / 1000).toFixed(2);
  return `+${s}s`;
}

function keyOf(t: Pick<SwimTime, "event" | "course">) {
  return eventKey(t.event, t.course);
}

export default function SwimTimesSection({ swimmerId }: { swimmerId: number }) {
  const [times, setTimes] = useState<SwimTime[]>([]);
  const [eventMode, setEventMode] = useState<"preset" | "custom">("preset");
  const [event, setEvent] = useState("50 Free");
  const [customEvent, setCustomEvent] = useState("");
  const [course, setCourse] = useState("SCM");
  const [timeStr, setTimeStr] = useState("");
  const [meetName, setMeetName] = useState("");
  const [meetDate, setMeetDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchTimes() {
    const { data, error } = await supabase
      .from("swim_times")
      .select("*")
      .eq("swimmer_id", swimmerId)
      .order("meet_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      alert("Fetch times failed ❌ " + error.message);
      return;
    }

    setTimes((data as SwimTime[]) || []);
  }

  async function addTime() {
    const rawEvent = eventMode === "custom" ? customEvent : event;

    if (!rawEvent.trim()) {
      alert("Please enter an event");
      return;
    }

    const time_ms = parseToMs(timeStr);
    if (!time_ms) {
      alert("Enter a valid time like 35.04 or 1:12.33");
      return;
    }

    const cleanEvent = canonicalEventName(rawEvent);
    const cleanCourse = canonicalCourse(course);

    setSaving(true);

    const { error } = await supabase.from("swim_times").insert([
      {
        swimmer_id: swimmerId,
        event: cleanEvent,
        course: cleanCourse,
        time_ms,
        meet_name: meetName.trim() || null,
        meet_date: meetDate || null,
      },
    ]);

    setSaving(false);

    if (error) {
      alert("Insert failed ❌ " + error.message);
      return;
    }

    setEventMode("preset");
    setEvent("50 Free");
    setCustomEvent("");
    setCourse("SCM");
    setTimeStr("");
    setMeetName("");
    setMeetDate("");

    fetchTimes();
  }

  async function deleteTime(id: number) {
    const ok = confirm("Delete this swim time?");
    if (!ok) return;

    const { error } = await supabase.from("swim_times").delete().eq("id", id);

    if (error) {
      alert("Delete failed ❌ " + error.message);
      return;
    }

    fetchTimes();
  }

  useEffect(() => {
    if (!swimmerId) return;
    fetchTimes();
  }, [swimmerId]);

  const pbByEventCourse = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of times) {
      const k = keyOf(t);
      const cur = map.get(k);

      if (cur === undefined || t.time_ms < cur) {
        map.set(k, t.time_ms);
      }
    }

    return map;
  }, [times]);

  const pbSummary = useMemo(() => {
    const items: { key: string; event: string; course: string; pb_ms: number }[] = [];

    for (const [k, pb_ms] of pbByEventCourse.entries()) {
      const first = times.find((t) => keyOf(t) === k);
      if (!first) continue;

      items.push({
        key: k,
        event: canonicalEventName(first.event),
        course: canonicalCourse(first.course),
        pb_ms,
      });
    }

    items.sort((a, b) => (a.event + a.course).localeCompare(b.event + b.course));
    return items;
  }, [pbByEventCourse, times]);

  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Swim Times</h2>
        <div className="text-sm text-gray-500">Swimmer ID: {swimmerId}</div>
      </div>

      {pbSummary.length > 0 ? (
        <div className="mt-3 rounded-xl border bg-gray-50 p-3">
          <div className="text-sm font-semibold text-gray-800">PB Summary</div>
          <div className="mt-2 grid gap-1">
            {pbSummary.map((p) => (
              <div key={p.key} className="flex justify-between text-sm text-gray-700">
                <span>
                  {p.event} ({p.course})
                </span>
                <span className="font-semibold">{formatMs(p.pb_ms)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid max-w-md gap-3">
        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Event</span>

          <select
            className="rounded-xl border px-3 py-2"
            value={eventMode === "custom" ? "__custom__" : event}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setEventMode("custom");
              } else {
                setEventMode("preset");
                setEvent(e.target.value);
              }
            }}
          >
            {EVENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="__custom__">Custom event</option>
          </select>

          {eventMode === "custom" ? (
            <input
              className="rounded-xl border px-3 py-2"
              value={customEvent}
              onChange={(e) => setCustomEvent(e.target.value)}
              placeholder="e.g. 200 Medley Relay Lead-Off"
            />
          ) : null}
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Course</span>
          <select
            className="rounded-xl border px-3 py-2"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
          >
            <option value="SCM">SCM</option>
            <option value="LCM">LCM</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Time (35.04 or 1:12.33)</span>
          <input
            className="rounded-xl border px-3 py-2"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            placeholder="35.04"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Meet name (optional)</span>
          <input
            className="rounded-xl border px-3 py-2"
            value={meetName}
            onChange={(e) => setMeetName(e.target.value)}
            placeholder="SSA Meet"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Meet date (optional)</span>
          <input
            className="rounded-xl border px-3 py-2"
            type="date"
            value={meetDate}
            onChange={(e) => setMeetDate(e.target.value)}
          />
        </label>

        <button
          onClick={addTime}
          disabled={saving}
          className="rounded-xl border px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Add time"}
        </button>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-sm font-semibold text-gray-800">All Swim Times</div>

        {times.length === 0 ? (
          <p className="text-gray-600">No swim times yet.</p>
        ) : (
          <ul className="space-y-2">
            {times.map((t) => {
              const k = keyOf(t);
              const pb = pbByEventCourse.get(k);
              const isPB = pb !== undefined && t.time_ms === pb;
              const gapMs = pb !== undefined ? t.time_ms - pb : 0;

              return (
                <li
                  key={t.id}
                  className={[
                    "flex items-center justify-between rounded-xl border p-3",
                    isPB ? "border-green-200 bg-green-50" : "",
                  ].join(" ")}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      <span>
                        {canonicalEventName(t.event)} ({canonicalCourse(t.course)}) —{" "}
                        {formatMs(t.time_ms)}
                      </span>

                      {isPB ? (
                        <span className="rounded-full border bg-white px-2 py-1 text-xs font-semibold">
                          🏅 PB
                        </span>
                      ) : pb !== undefined ? (
                        <span className="text-xs text-gray-600">
                          {formatGapMs(gapMs)} vs PB
                        </span>
                      ) : null}
                    </div>

                    <div className="text-sm text-gray-600">
                      {t.meet_date ? t.meet_date : "No date"}
                      {t.meet_name ? ` • ${t.meet_name}` : ""}
                    </div>
                  </div>

                  <button
                    onClick={() => deleteTime(t.id)}
                    className="rounded-xl border px-3 py-2 hover:bg-gray-50"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}