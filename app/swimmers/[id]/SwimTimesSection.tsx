"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

function parseToMs(input: string) {
  const s = input.trim();
  if (!s) return null;

  // "1:12.33"
  if (s.includes(":")) {
    const [mStr, secStr] = s.split(":");
    const minutes = Number(mStr);
    const seconds = Number(secStr);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return Math.round((minutes * 60 + seconds) * 1000);
  }

  // "35.04"
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
  // Always show +x.xx seconds (even if > 60s it's okay for now)
  const s = (gapMs / 1000).toFixed(2);
  return `+${s}s`;
}

function keyOf(t: Pick<SwimTime, "event" | "course">) {
  return `${t.event.trim().toLowerCase()}|${t.course.trim().toUpperCase()}`;
}

export default function SwimTimesSection({ swimmerId }: { swimmerId: number }) {
  const [times, setTimes] = useState<SwimTime[]>([]);
  const [event, setEvent] = useState("50 Free");
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
    const time_ms = parseToMs(timeStr);
    if (!time_ms) {
      alert("Enter a valid time like 35.04 or 1:12.33");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("swim_times").insert([
      {
        swimmer_id: swimmerId,
        event,
        course,
        time_ms,
        meet_name: meetName || null,
        meet_date: meetDate || null,
      },
    ]);

    setSaving(false);

    if (error) {
      alert("Insert failed ❌ " + error.message);
      return;
    }

    setTimeStr("");
    setMeetName("");
    setMeetDate("");
    fetchTimes();
  }

  async function deleteTime(id: number) {
    const ok = confirm("Delete this swim time?");
    if (!ok) return;

    const { error } = await supabase.from("swim_times").delete().eq("id", id);
    if (error) alert("Delete failed ❌ " + error.message);
    else fetchTimes();
  }

  useEffect(() => {
    if (!swimmerId) return;
    fetchTimes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swimmerId]);

  // Build PB map: (event|course) -> min time_ms
  const pbByEventCourse = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of times) {
      const k = keyOf(t);
      const cur = map.get(k);
      if (cur === undefined || t.time_ms < cur) map.set(k, t.time_ms);
    }
    return map;
  }, [times]);

  // Optional: quick PB summary rows (one per event/course)
  const pbSummary = useMemo(() => {
    const items: { key: string; event: string; course: string; pb_ms: number }[] = [];
    for (const [k, pb_ms] of pbByEventCourse.entries()) {
      // k was normalized; recover display from first matching time
      const first = times.find((t) => keyOf(t) === k);
      if (!first) continue;
      items.push({ key: k, event: first.event, course: first.course, pb_ms });
    }
    // Sort by event name then course
    items.sort((a, b) => (a.event + a.course).localeCompare(b.event + b.course));
    return items;
  }, [pbByEventCourse, times]);

  return (
    <div className="border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Swim Times</h2>
        <div className="text-sm text-gray-500">Swimmer ID: {swimmerId}</div>
      </div>

      {/* PB Summary */}
      {pbSummary.length > 0 ? (
        <div className="mt-3 rounded-xl border bg-gray-50 p-3">
          <div className="text-sm font-semibold text-gray-800">PBs</div>
          <div className="mt-2 grid gap-1">
            {pbSummary.map((p) => (
              <div key={p.key} className="text-sm text-gray-700 flex justify-between">
                <span>
                  {p.event} ({p.course})
                </span>
                <span className="font-semibold">{formatMs(p.pb_ms)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Add form */}
      <div className="mt-4 grid gap-3 max-w-md">
        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Event</span>
          <input
            className="px-3 py-2 rounded-xl border"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            placeholder="50 Free"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Course</span>
          <select
            className="px-3 py-2 rounded-xl border"
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
            className="px-3 py-2 rounded-xl border"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            placeholder="35.04"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Meet name (optional)</span>
          <input
            className="px-3 py-2 rounded-xl border"
            value={meetName}
            onChange={(e) => setMeetName(e.target.value)}
            placeholder="SSA Meet"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Meet date (optional)</span>
          <input
            className="px-3 py-2 rounded-xl border"
            type="date"
            value={meetDate}
            onChange={(e) => setMeetDate(e.target.value)}
          />
        </label>

        <button
          onClick={addTime}
          disabled={saving}
          className="px-4 py-2 rounded-xl border hover:bg-gray-50 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Add time"}
        </button>
      </div>

      {/* Times list */}
      <div className="mt-6">
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
                    "flex items-center justify-between border rounded-xl p-3",
                    isPB ? "bg-green-50 border-green-200" : "",
                  ].join(" ")}
                >
                  <div>
                    <div className="font-semibold flex items-center gap-2 flex-wrap">
                      <span>
                        {t.event} ({t.course}) — {formatMs(t.time_ms)}
                      </span>

                      {isPB ? (
                        <span className="text-xs font-semibold px-2 py-1 rounded-full border bg-white">
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
                    className="px-3 py-2 rounded-xl border hover:bg-gray-50"
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
