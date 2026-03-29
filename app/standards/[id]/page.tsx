"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { canonicalCourse, canonicalEventName } from "@/lib/events";

type StandardSet = {
  id: number;
  name: string;
  type: "UPGRADING" | "IMPORTANT_MEET";
};

type StandardItem = {
  id: number;
  standard_set_id: number;
  event: string;
  course: "SCM" | "LCM";
  gender: "Male" | "Female" | null;
  min_age: number | null;
  max_age: number | null;
  qualifying_time_ms: number;
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

function formatMs(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(
      hundredths
    ).padStart(2, "0")}`;
  }

  return `${seconds}.${String(hundredths).padStart(2, "0")}`;
}

function parseTimeToMs(input: string) {
  const trimmed = input.trim();

  if (!trimmed) return null;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;

    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;

    return Math.round((minutes * 60 + seconds) * 1000);
  }

  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds)) return null;

  return Math.round(seconds * 1000);
}

function sortEventName(event: string) {
  const match = canonicalEventName(event).match(/^(\d+)\s+(.*)$/);
  if (!match) return { distance: 9999, stroke: canonicalEventName(event) };

  return {
    distance: Number(match[1]),
    stroke: match[2],
  };
}

export default function StandardItemsPage() {
  const params = useParams();
  const setId = Number(params.id);

  const [setInfo, setSetInfo] = useState<StandardSet | null>(null);
  const [items, setItems] = useState<StandardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready");

  const [eventMode, setEventMode] = useState<"preset" | "custom">("preset");
  const [event, setEvent] = useState("50 Free");
  const [customEvent, setCustomEvent] = useState("");
  const [course, setCourse] = useState<"SCM" | "LCM">("SCM");
  const [gender, setGender] = useState<"Male" | "Female" | "">("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [timeInput, setTimeInput] = useState("");

  useEffect(() => {
    if (!setId || Number.isNaN(setId)) return;
    loadPage();
  }, [setId]);

  async function loadPage() {
    setStatus("Loading...");

    const { data: setData, error: setError } = await supabase
      .from("standard_sets")
      .select("id, name, type")
      .eq("id", setId)
      .single();

    if (setError) {
      setStatus(setError.message);
      return;
    }

    setSetInfo(setData as StandardSet);

    const { data: itemData, error: itemError } = await supabase
      .from("standard_items")
      .select(
        "id, standard_set_id, event, course, gender, min_age, max_age, qualifying_time_ms"
      )
      .eq("standard_set_id", setId);

    if (itemError) {
      setStatus(itemError.message);
      return;
    }

    setItems((itemData as StandardItem[]) || []);
    setStatus("Ready");
  }

  async function addItem() {
    const rawEvent = eventMode === "custom" ? customEvent : event;

    if (!rawEvent.trim()) {
      alert("Please enter an event");
      return;
    }

    if (!timeInput.trim()) {
      alert("Please enter time like 36.50 or 1:12.34");
      return;
    }

    const timeMs = parseTimeToMs(timeInput);
    if (!timeMs) {
      alert("Invalid time format");
      return;
    }

    const cleanEvent = canonicalEventName(rawEvent);
    const cleanCourse = canonicalCourse(course) as "SCM" | "LCM";

    setLoading(true);
    setStatus("Adding item...");

    const { error } = await supabase.from("standard_items").insert([
      {
        standard_set_id: setId,
        event: cleanEvent,
        course: cleanCourse,
        gender: gender || null,
        min_age: minAge.trim() ? Number(minAge) : null,
        max_age: maxAge.trim() ? Number(maxAge) : null,
        qualifying_time_ms: timeMs,
      },
    ]);

    if (error) {
      setLoading(false);
      setStatus(error.message);
      alert(error.message);
      return;
    }

    setEventMode("preset");
    setEvent("50 Free");
    setCustomEvent("");
    setCourse("SCM");
    setGender("");
    setMinAge("");
    setMaxAge("");
    setTimeInput("");

    await loadPage();
    setLoading(false);
    setStatus("Timing row added");
  }

  async function deleteItem(id: number) {
    const ok = window.confirm("Delete this timing row?");
    if (!ok) return;

    const { error } = await supabase
      .from("standard_items")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadPage();
  }

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aSort = sortEventName(a.event);
      const bSort = sortEventName(b.event);

      if (aSort.stroke !== bSort.stroke) {
        return aSort.stroke.localeCompare(bSort.stroke);
      }

      if (aSort.distance !== bSort.distance) {
        return aSort.distance - bSort.distance;
      }

      return a.course.localeCompare(b.course);
    });
  }, [items]);

  return (
    <main className="min-h-screen bg-[#f3f4f6] px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <Link
            href="/standards"
            className="inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ← Back to Standards
          </Link>
        </div>

        <section className="mb-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">
            {setInfo ? setInfo.name : "Standard Set"}
          </h1>
          <p className="mt-2 text-lg text-slate-500">
            {setInfo
              ? setInfo.type === "UPGRADING"
                ? "Upgrading"
                : "Important Meet"
              : ""}
          </p>
        </section>

        <section className="mb-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Add Timing Row</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-600">Event</label>

              <select
                value={eventMode === "custom" ? "__custom__" : event}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setEventMode("custom");
                  } else {
                    setEventMode("preset");
                    setEvent(e.target.value);
                  }
                }}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 outline-none"
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
                  placeholder="Enter custom event"
                  value={customEvent}
                  onChange={(e) => setCustomEvent(e.target.value)}
                  className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 outline-none"
                />
              ) : null}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-600">Course</label>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value as "SCM" | "LCM")}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 outline-none"
              >
                <option value="SCM">SCM</option>
                <option value="LCM">LCM</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-600">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as "Male" | "Female" | "")}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 outline-none"
              >
                <option value="">All genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-600">
                Target Time
              </label>
              <input
                placeholder="36.50 or 1:12.34"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 outline-none"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-600">Min Age</label>
              <input
                placeholder="Optional"
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 outline-none"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-600">Max Age</label>
              <input
                placeholder="Optional"
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 outline-none"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={addItem}
              disabled={loading}
              className="rounded-2xl border border-slate-300 bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Row"}
            </button>

            <p className="text-sm text-slate-500">{status}</p>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Timing Rows</h2>

          <div className="mt-5 space-y-4">
            {sortedItems.length === 0 ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-slate-600">
                No timing rows yet.
              </div>
            ) : (
              sortedItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900">
                        {canonicalEventName(item.event)}
                      </h3>

                      <p className="mt-2 text-slate-500">
                        {canonicalCourse(item.course)} · {item.gender || "All genders"} · Ages{" "}
                        {item.min_age ?? "Any"}–{item.max_age ?? "Any"}
                      </p>

                      <p className="mt-3 text-lg font-semibold text-slate-900">
                        Target: {formatMs(item.qualifying_time_ms)}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {item.qualifying_time_ms} ms
                      </p>
                    </div>

                    <button
                      onClick={() => deleteItem(item.id)}
                      className="rounded-2xl border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}