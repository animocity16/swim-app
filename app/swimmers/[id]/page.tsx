"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MeetMobileImport from "./MeetMobileImport";

type Swimmer = {
  id: number | string;
  name: string;
  age: number;
  birth_year?: number | null;
  group_type?: string | null;
  created_at?: string | null;
};

type SwimTimeRow = {
  id?: number;
  swimmer_id?: number | string;
  event: string;
  course: string;
  time_ms: number;
  created_at?: string | null;
};

type StandardSet = {
  id: number;
  name: string;
  type: "UPGRADING" | "IMPORTANT_MEET";
  created_at?: string | null;
};

type StandardItem = {
  id: number;
  standard_set_id: number;
  event: string;
  course: string;
  gender?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  qualifying_time_ms: number;
  created_at?: string | null;
};

type TabKey = "overview" | "swimTimes" | "standards" | "meetmobile";

function formatCreatedAt(value?: string | null) {
  if (!value) return "No date available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date available";
  return date.toLocaleString();
}

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";
  return (ms / 1000).toFixed(2);
}

function keyOf(event: string, course: string) {
  return `${event.trim().toLowerCase()}|${course.trim().toUpperCase()}`;
}

function getPBMap(swimTimes: SwimTimeRow[]) {
  const map = new Map<string, SwimTimeRow>();

  for (const row of swimTimes) {
    const key = keyOf(row.event, row.course);
    const existing = map.get(key);

    if (!existing || row.time_ms < existing.time_ms) {
      map.set(key, row);
    }
  }

  return map;
}

function findNextTarget(
  swimTimes: SwimTimeRow[],
  standards: StandardItem[],
  swimmerAge?: number | null
) {
  const pbMap = getPBMap(swimTimes);
  const candidates: Array<{
    event: string;
    course: string;
    pb: number;
    target: number;
    gap: number;
  }> = [];

  for (const std of standards) {
    if (
      swimmerAge != null &&
      std.min_age != null &&
      swimmerAge < std.min_age
    ) {
      continue;
    }

    if (
      swimmerAge != null &&
      std.max_age != null &&
      swimmerAge > std.max_age
    ) {
      continue;
    }

    const pb = pbMap.get(keyOf(std.event, std.course));
    if (!pb) continue;

    const gap = pb.time_ms - std.qualifying_time_ms;

    // Only targets not yet achieved
    if (gap > 0) {
      candidates.push({
        event: std.event,
        course: std.course,
        pb: pb.time_ms,
        target: std.qualifying_time_ms,
        gap,
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.gap - b.gap);
  return candidates[0];
}

export default function SwimmerProfilePage() {
  const params = useParams();
  const swimmerId = Number(params?.id);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading swimmer...");

  const [swimmer, setSwimmer] = useState<Swimmer | null>(null);
  const [swimTimes, setSwimTimes] = useState<SwimTimeRow[]>([]);
  const [standardSets, setStandardSets] = useState<StandardSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
  const [standardItems, setStandardItems] = useState<StandardItem[]>([]);

  async function loadPage() {
    if (!swimmerId || Number.isNaN(swimmerId)) {
      setStatus("Invalid swimmer id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("Loading swimmer...");

    const [
      swimmerRes,
      swimTimesRes,
      standardSetsRes,
    ] = await Promise.all([
      supabase
        .from("swimmers")
        .select("id, name, age, birth_year, group_type, created_at")
        .eq("id", swimmerId)
        .single(),
      supabase
        .from("swim_times")
        .select("id, swimmer_id, event, course, time_ms, created_at")
        .eq("swimmer_id", swimmerId)
        .order("event", { ascending: true }),
      supabase
        .from("standard_sets")
        .select("id, name, type, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (swimmerRes.error) {
      console.error("swimmer load error:", swimmerRes.error);
      setStatus(`Error loading swimmer: ${swimmerRes.error.message}`);
      setLoading(false);
      return;
    }

    if (swimTimesRes.error) {
      console.error("swim times load error:", swimTimesRes.error);
      setStatus(`Error loading swim times: ${swimTimesRes.error.message}`);
      setLoading(false);
      return;
    }

    if (standardSetsRes.error) {
      console.error("standard sets load error:", standardSetsRes.error);
      setStatus(`Error loading standards sets: ${standardSetsRes.error.message}`);
      setLoading(false);
      return;
    }

    const swimmerData = swimmerRes.data as Swimmer;
    const swimTimesData = (swimTimesRes.data as SwimTimeRow[]) || [];
    const standardSetsData = (standardSetsRes.data as StandardSet[]) || [];

    setSwimmer(swimmerData);
    setSwimTimes(swimTimesData);
    setStandardSets(standardSetsData);

    const upgradingSet =
      standardSetsData.find((s) => s.type === "UPGRADING") || standardSetsData[0];

    setSelectedSetId(upgradingSet?.id ?? null);

    setStatus("Ready");
    setLoading(false);
  }

  async function loadStandardItems(setId: number | null) {
    if (!setId) {
      setStandardItems([]);
      return;
    }

    const { data, error } = await supabase
      .from("standard_items")
      .select(
        "id, standard_set_id, event, course, gender, min_age, max_age, qualifying_time_ms, created_at"
      )
      .eq("standard_set_id", setId)
      .order("event", { ascending: true });

    if (error) {
      console.error("standard items load error:", error);
      setStatus(`Error loading standard items: ${error.message}`);
      setStandardItems([]);
      return;
    }

    setStandardItems((data as StandardItem[]) || []);
  }

  useEffect(() => {
    loadPage();
  }, [swimmerId]);

  useEffect(() => {
    loadStandardItems(selectedSetId);
  }, [selectedSetId]);

  const pbMap = useMemo(() => getPBMap(swimTimes), [swimTimes]);

  const nextTarget = useMemo(() => {
    return findNextTarget(swimTimes, standardItems, swimmer?.age ?? null);
  }, [swimTimes, standardItems, swimmer?.age]);

  const selectedSet = useMemo(() => {
    return standardSets.find((s) => s.id === selectedSetId) || null;
  }, [standardSets, selectedSetId]);

  const standardsRows = useMemo(() => {
    return standardItems.map((item) => {
      const pb = pbMap.get(keyOf(item.event, item.course));
      const swimmerAge = swimmer?.age ?? null;

      const ageTooYoung =
        swimmerAge != null &&
        item.min_age != null &&
        swimmerAge < item.min_age;

      const ageTooOld =
        swimmerAge != null &&
        item.max_age != null &&
        swimmerAge > item.max_age;

      if (ageTooYoung || ageTooOld) {
        return {
          ...item,
          pbMs: null,
          gapMs: null,
          status: "Age not in range",
        };
      }

      if (!pb) {
        return {
          ...item,
          pbMs: null,
          gapMs: null,
          status: "No PB yet",
        };
      }

      const gapMs = pb.time_ms - item.qualifying_time_ms;

      if (gapMs <= 0) {
        return {
          ...item,
          pbMs: pb.time_ms,
          gapMs,
          status: "Qualified",
        };
      }

      return {
        ...item,
        pbMs: pb.time_ms,
        gapMs,
        status: "In progress",
      };
    });
  }, [standardItems, pbMap, swimmer?.age]);

  if (loading) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 sm:py-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-white/70">{status}</p>
        </div>
      </main>
    );
  }

  if (!swimmer) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 sm:py-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-red-300">{status || "Swimmer not found."}</p>
          <Link
            href="/swimmers"
            className="mt-4 inline-block rounded-2xl border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
          >
            Back
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f4f6] px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <Link
            href="/swimmers"
            className="inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ← Back
          </Link>
        </div>

        <section className="mb-6 overflow-hidden rounded-[32px] bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-lg">
          <div className="grid gap-5 p-6 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/80">
                Profile
              </p>
              <h1 className="mt-3 text-5xl font-bold tracking-tight">
                {swimmer.name}
              </h1>
              <p className="mt-6 text-2xl text-white/90">Age {swimmer.age}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-[28px] bg-white/15 p-5 backdrop-blur">
                <p className="text-sm uppercase text-white/80">Swimmer ID</p>
                <p className="mt-3 text-4xl font-bold">{swimmer.id}</p>
              </div>

              <div className="rounded-[28px] bg-white/15 p-5 backdrop-blur">
                <p className="text-sm uppercase text-white/80">Status</p>
                <p className="mt-3 text-3xl font-bold">Active</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-[24px] bg-slate-100 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Age
              </p>
              <p className="mt-3 text-5xl font-bold text-slate-900">
                {swimmer.age}
              </p>
            </div>

            <div className="rounded-[24px] bg-slate-100 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Added
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {formatCreatedAt(swimmer.created_at)}
              </p>
            </div>

            <div className="rounded-[24px] bg-slate-100 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                PB Events
              </p>
              <p className="mt-3 text-5xl font-bold text-slate-900">
                {pbMap.size}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setActiveTab("overview")}
              className={`rounded-2xl px-5 py-3 text-lg font-semibold transition ${
                activeTab === "overview"
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Overview
            </button>

            <button
              onClick={() => setActiveTab("swimTimes")}
              className={`rounded-2xl px-5 py-3 text-lg font-semibold transition ${
                activeTab === "swimTimes"
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Swim Times
            </button>

            <button
              onClick={() => setActiveTab("standards")}
              className={`rounded-2xl px-5 py-3 text-lg font-semibold transition ${
                activeTab === "standards"
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Standards
            </button>

            <button
              onClick={() => setActiveTab("meetmobile")}
              className={`rounded-2xl px-5 py-3 text-lg font-semibold transition ${
                activeTab === "meetmobile"
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              MeetMobile
            </button>
          </div>
        </section>

        {activeTab === "overview" && (
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-3xl font-bold text-slate-900">Overview</h2>
            <p className="mt-2 text-lg text-slate-500">
              Quick snapshot for {swimmer.name}.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm uppercase tracking-wide text-slate-500">
                  Current status
                </p>
                <p className="mt-3 text-2xl font-bold text-slate-900">
                  {swimTimes.length > 0 ? "Tracking active" : "No times yet"}
                </p>
                <p className="mt-2 text-slate-600">
                  {swimTimes.length > 0
                    ? `${swimTimes.length} swim time entr${
                        swimTimes.length === 1 ? "y" : "ies"
                      } recorded.`
                    : "Import or add some times to start comparisons."}
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm uppercase tracking-wide text-slate-500">
                  Best next action
                </p>
                <p className="mt-3 text-2xl font-bold text-slate-900">
                  {nextTarget
                    ? `${nextTarget.event} (${nextTarget.course})`
                    : "No target yet"}
                </p>
                <p className="mt-2 text-slate-600">
                  {nextTarget
                    ? `${formatMs(nextTarget.gap)}s away from the target time.`
                    : "Choose a standards set and make sure PBs exist for matching events."}
                </p>
              </div>
            </div>
          </section>
        )}

        {activeTab === "swimTimes" && (
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-3xl font-bold text-slate-900">Swim Times</h2>
            <p className="mt-2 text-lg text-slate-500">
              Best recorded times by event and course.
            </p>

            <div className="mt-6 space-y-4">
              {pbMap.size === 0 ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-slate-600">
                  No swim times yet.
                </div>
              ) : (
                Array.from(pbMap.values())
                  .sort((a, b) => {
                    if (a.event === b.event) {
                      return a.course.localeCompare(b.course);
                    }
                    return a.event.localeCompare(b.event);
                  })
                  .map((row) => (
                    <div
                      key={`${row.event}-${row.course}`}
                      className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-2xl font-bold text-slate-900">
                            {row.event}
                          </h3>
                          <p className="mt-1 text-slate-500">
                            Course: {row.course}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                          <p className="text-sm uppercase tracking-wide text-slate-500">
                            PB
                          </p>
                          <p className="text-3xl font-bold text-slate-900">
                            {formatMs(row.time_ms)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </section>
        )}

        {activeTab === "standards" && (
          <section className="space-y-6">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">
                    Standards Compare
                  </h2>
                  <p className="mt-2 text-lg text-slate-500">
                    See how close {swimmer.name} is to qualifying standards.
                  </p>
                </div>

                <div className="w-full max-w-sm">
                  <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Standard Set
                  </label>
                  <select
                    value={selectedSetId ?? ""}
                    onChange={(e) => setSelectedSetId(Number(e.target.value))}
                    className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg text-slate-900 outline-none"
                  >
                    {standardSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name} ({set.type === "UPGRADING" ? "Upgrading" : "Important Meet"})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {nextTarget && (
              <div className="rounded-[32px] border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-600">
                  Next Target
                </p>

                <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-4xl font-bold text-slate-900">
                      {nextTarget.event}
                    </h3>
                    <p className="mt-1 text-lg text-slate-600">
                      Course: {nextTarget.course}
                    </p>
                  </div>

                  <div className="rounded-[24px] bg-white px-5 py-4 shadow-sm">
                    <p className="text-sm uppercase tracking-wide text-slate-500">
                      Gap to target
                    </p>
                    <p className="text-4xl font-bold text-emerald-600">
                      {formatMs(nextTarget.gap)}s away
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-emerald-100 bg-white p-5">
                    <p className="text-sm uppercase tracking-wide text-slate-500">
                      Current PB
                    </p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {formatMs(nextTarget.pb)}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-emerald-100 bg-white p-5">
                    <p className="text-sm uppercase tracking-wide text-slate-500">
                      Target time
                    </p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {formatMs(nextTarget.target)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!nextTarget && selectedSet && (
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-2xl font-bold text-slate-900">Next Target</h3>
                <p className="mt-3 text-slate-600">
                  No active next target found for <strong>{selectedSet.name}</strong>.
                  That usually means either:
                </p>
                <div className="mt-3 space-y-1 text-slate-600">
                  <p>• no matching PB exists yet</p>
                  <p>• all matching events are already qualified</p>
                  <p>• age range does not match this swimmer</p>
                </div>
              </div>
            )}

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-3xl font-bold text-slate-900">
                {selectedSet?.name || "Standards"}
              </h3>
              <p className="mt-2 text-lg text-slate-500">
                Age: {swimmer.age}
              </p>

              <div className="mt-6 space-y-4">
                {standardsRows.length === 0 ? (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-slate-600">
                    No standards found in this set.
                  </div>
                ) : (
                  standardsRows.map((row) => {
                    const qualified = row.status === "Qualified";
                    const inProgress = row.status === "In progress";

                    return (
                      <div
                        key={row.id}
                        className="rounded-[28px] border border-slate-200 bg-slate-50 p-5"
                      >
                        <div className="mb-4">
                          <h4 className="text-2xl font-bold text-slate-900">
                            {row.event}
                          </h4>
                          <p className="mt-1 text-slate-500">
                            Course: {row.course}
                          </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-4">
                          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <p className="text-sm text-slate-500">PB</p>
                            <p className="mt-2 text-3xl font-bold text-slate-900">
                              {row.pbMs == null ? "-" : formatMs(row.pbMs)}
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                              Best recorded time
                            </p>
                          </div>

                          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <p className="text-sm text-slate-500">Target</p>
                            <p className="mt-2 text-3xl font-bold text-slate-900">
                              {formatMs(row.qualifying_time_ms)}
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                              Standard time
                            </p>
                          </div>

                          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <p className="text-sm text-slate-500">Gap</p>
                            <p className="mt-2 text-3xl font-bold text-slate-900">
                              {row.gapMs == null ? "-" : formatMs(Math.abs(row.gapMs))}
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                              {qualified
                                ? "Inside target"
                                : inProgress
                                ? "Time to drop"
                                : "Waiting for PB"}
                            </p>
                          </div>

                          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                            <p className="text-sm text-slate-500">Status</p>
                            <p
                              className={`mt-2 text-3xl font-bold ${
                                qualified
                                  ? "text-emerald-600"
                                  : inProgress
                                  ? "text-amber-600"
                                  : "text-slate-900"
                              }`}
                            >
                              {qualified
                                ? "Qualified"
                                : inProgress
                                ? "In progress"
                                : row.status}
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                              Quick read
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "meetmobile" && (
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-3xl font-bold text-slate-900">MeetMobile Import</h2>
            <p className="mt-2 text-lg text-slate-500">
              Import meet results for {swimmer.name}.
            </p>

            <div className="mt-6">
              <MeetMobileImport
                swimmerId={Number(swimmer.id)}
                swimmerName={swimmer.name}
                onSaved={loadPage}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}