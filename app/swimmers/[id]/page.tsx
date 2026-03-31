"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SwimScan from "./SwimScan";
import SwimTimesSection from "./SwimTimesSection";
import { canonicalCourse, canonicalEventName, eventKey } from "@/lib/events";
import {
  parseSwimOCRText,
  type ParsedSwimResult,
} from "@/lib/ocrMultiEventParser";

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

type StandardsRow = StandardItem & {
  pbMs: number | null;
  gapMs: number | null;
  status: "Qualified" | "In progress" | "No PB yet" | "Age not in range";
};

type NextTarget = {
  event: string;
  course: string;
  pb: number;
  target: number;
  gap: number;
};

type TabKey = "overview" | "swimTimes" | "standards" | "swimscan";

type StrokeGroup = {
  key: string;
  label: string;
  rows: StandardsRow[];
};

function formatCreatedAt(value?: string | null) {
  if (!value) return "No date available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date available";
  return date.toLocaleString();
}

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";

  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function keyOf(event: string, course: string) {
  return eventKey(canonicalEventName(event), canonicalCourse(course));
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
): NextTarget | null {
  const pbMap = getPBMap(swimTimes);
  const candidates: NextTarget[] = [];

  for (const std of standards) {
    if (swimmerAge != null && std.min_age != null && swimmerAge < std.min_age) {
      continue;
    }

    if (swimmerAge != null && std.max_age != null && swimmerAge > std.max_age) {
      continue;
    }

    const pb = pbMap.get(keyOf(std.event, std.course));
    if (!pb) continue;

    const gap = pb.time_ms - std.qualifying_time_ms;

    if (gap > 0) {
      candidates.push({
        event: canonicalEventName(std.event),
        course: canonicalCourse(std.course),
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

function tabClass(active: boolean) {
  return active ? "segmented-btn-active" : "segmented-btn";
}

function statusClass(status: StandardsRow["status"]) {
  if (status === "Qualified") return "success-text";
  if (status === "In progress") return "warning-text";
  return "text-white";
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
  const [ocrResults, setOcrResults] = useState<ParsedSwimResult[]>([]);
  const [savingOcr, setSavingOcr] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [expandedStrokes, setExpandedStrokes] = useState<Record<string, boolean>>({
    freestyle: true,
    backstroke: false,
    breaststroke: false,
    butterfly: false,
    im: false,
    other: false,
  });

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swimmerId]);

  useEffect(() => {
    void loadStandardItems(selectedSetId);
  }, [selectedSetId]);

  async function loadPage() {
    if (!swimmerId || Number.isNaN(swimmerId)) {
      setStatus("Invalid swimmer id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("Loading swimmer...");

    const [swimmerRes, swimTimesRes, standardSetsRes] = await Promise.all([
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
      setStatus(`Error loading swimmer: ${swimmerRes.error.message}`);
      setLoading(false);
      return;
    }

    if (swimTimesRes.error) {
      setStatus(`Error loading swim times: ${swimTimesRes.error.message}`);
      setLoading(false);
      return;
    }

    if (standardSetsRes.error) {
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
      standardSetsData.find((s) => s.type === "UPGRADING") ||
      standardSetsData[0] ||
      null;

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
      setStatus(`Error loading standard items: ${error.message}`);
      setStandardItems([]);
      return;
    }

    setStandardItems((data as StandardItem[]) || []);
    setExpandedRows({});
    setExpandedStrokes({
      freestyle: true,
      backstroke: false,
      breaststroke: false,
      butterfly: false,
      im: false,
      other: false,
    });
  }

  async function saveParsedResults() {
    if (!swimmer || ocrResults.length === 0) {
      setStatus("No OCR results to save.");
      return;
    }

    setSavingOcr(true);
    setStatus("Saving OCR results...");

    try {
      const rows = ocrResults.map((r) => ({
        swimmer_id: Number(swimmer.id),
        event: canonicalEventName(r.event),
        course: canonicalCourse(r.course === "UNKNOWN" ? "LCM" : r.course),
        time_ms: r.timeMs,
      }));

      const uniqueRows = rows.filter(
        (row, index, arr) =>
          index ===
          arr.findIndex(
            (x) =>
              x.swimmer_id === row.swimmer_id &&
              x.event === row.event &&
              x.course === row.course &&
              x.time_ms === row.time_ms
          )
      );

      for (const row of uniqueRows) {
        const { data: existing, error: checkError } = await supabase
          .from("swim_times")
          .select("id")
          .eq("swimmer_id", row.swimmer_id)
          .eq("event", row.event)
          .eq("course", row.course)
          .eq("time_ms", row.time_ms)
          .limit(1);

        if (checkError) {
          setStatus(`Error checking duplicates: ${checkError.message}`);
          return;
        }

        if (!existing || existing.length === 0) {
          const { error: insertError } = await supabase
            .from("swim_times")
            .insert([row]);

          if (insertError) {
            setStatus(`Error saving OCR results: ${insertError.message}`);
            return;
          }
        }
      }

      setStatus("OCR results saved!");
      setOcrResults([]);
      await loadPage();
    } finally {
      setSavingOcr(false);
    }
  }

  function toggleRow(id: number) {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function toggleStroke(stroke: string) {
    setExpandedStrokes((prev) => ({
      ...prev,
      [stroke]: !prev[stroke],
    }));
  }

  const pbMap = useMemo(() => getPBMap(swimTimes), [swimTimes]);

  const nextTarget = useMemo(() => {
    return findNextTarget(swimTimes, standardItems, swimmer?.age ?? null);
  }, [swimTimes, standardItems, swimmer?.age]);

  const selectedSet = useMemo(() => {
    return standardSets.find((s) => s.id === selectedSetId) || null;
  }, [standardSets, selectedSetId]);

  const standardsRows = useMemo<StandardsRow[]>(() => {
    return standardItems.map((item) => {
      const pb = pbMap.get(keyOf(item.event, item.course));
      const swimmerAge = swimmer?.age ?? null;

      const ageTooYoung =
        swimmerAge != null && item.min_age != null && swimmerAge < item.min_age;

      const ageTooOld =
        swimmerAge != null && item.max_age != null && swimmerAge > item.max_age;

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

  const strokeGroups = useMemo<StrokeGroup[]>(() => {
    const grouped: Record<string, StandardsRow[]> = {};

    for (const row of standardsRows) {
      const stroke = getStrokeKey(row.event);
      if (!grouped[stroke]) grouped[stroke] = [];
      grouped[stroke].push(row);
    }

    const order = ["freestyle", "backstroke", "breaststroke", "butterfly", "im", "other"];

    return order
      .filter((stroke) => grouped[stroke]?.length)
      .map((stroke) => ({
        key: stroke,
        label: getStrokeLabel(stroke),
        rows: [...grouped[stroke]].sort((a, b) => {
          const aHasPb = a.pbMs != null ? 0 : 1;
          const bHasPb = b.pbMs != null ? 0 : 1;
          if (aHasPb !== bHasPb) return aHasPb - bHasPb;

          const distanceDiff = getEventDistance(a.event) - getEventDistance(b.event);
          if (distanceDiff !== 0) return distanceDiff;

          return canonicalCourse(a.course).localeCompare(canonicalCourse(b.course));
        }),
      }));
  }, [standardsRows]);

  const hasQualifiedRows = useMemo(
    () => standardsRows.some((row) => row.status === "Qualified"),
    [standardsRows]
  );

  const hasInProgressRows = useMemo(
    () => standardsRows.some((row) => row.status === "In progress"),
    [standardsRows]
  );

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="muted">{status}</p>
        </div>
      </div>
    );
  }

  if (!swimmer) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="danger-text">{status || "Swimmer not found."}</p>
          <Link href="/swimmers" className="btn-outline mt-4 inline-flex">
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app">
        <div className="mb-6">
          <Link href="/swimmers" className="btn-outline">
            ← Back
          </Link>
        </div>

        <section className="card mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="label">Profile</p>
              <h1 className="mt-2 truncate text-5xl font-bold tracking-tight">
                {swimmer.name}
              </h1>
              <p className="mt-4 text-2xl text-white/80">Age {swimmer.age}</p>
            </div>

            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-right">
              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">
                PB Events
              </p>
              <p className="text-3xl font-bold text-emerald-200">{pbMap.size}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="card-soft">
              <p className="label">Swimmer ID</p>
              <p className="stat-number">{swimmer.id}</p>
            </div>

            <div className="card-soft">
              <p className="label">Status</p>
              <p className="stat-number accent-text">Active</p>
            </div>

            <div className="card-soft col-span-2">
              <p className="label">Added</p>
              <p className="mt-3 break-words text-xl font-semibold text-white">
                {formatCreatedAt(swimmer.created_at)}
              </p>
            </div>
          </div>
        </section>

        <section className="card mb-6">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setActiveTab("overview")}
              className={tabClass(activeTab === "overview")}
            >
              Overview
            </button>

            <button
              onClick={() => setActiveTab("swimTimes")}
              className={tabClass(activeTab === "swimTimes")}
            >
              Swim Times
            </button>

            <button
              onClick={() => setActiveTab("standards")}
              className={tabClass(activeTab === "standards")}
            >
              Standards
            </button>

            <button
              onClick={() => setActiveTab("swimscan")}
              className={tabClass(activeTab === "swimscan")}
            >
              SwimScan
            </button>
          </div>
        </section>

        {activeTab === "overview" && (
          <section className="card">
            <h2 className="title">Overview</h2>
            <p className="mt-2 muted">Quick snapshot for {swimmer.name}.</p>

            <div className="mt-6 space-y-4">
              <div className="card-soft">
                <p className="label">Current status</p>
                <p className="mt-3 text-2xl font-bold text-white">
                  {swimTimes.length > 0 ? "Tracking active" : "No times yet"}
                </p>
                <p className="mt-2 text-white/70">
                  {swimTimes.length > 0
                    ? `${swimTimes.length} swim time entr${
                        swimTimes.length === 1 ? "y" : "ies"
                      } recorded.`
                    : "Import or add some times to start comparisons."}
                </p>
              </div>

              <div className="card-soft">
                <p className="label">Best next action</p>
                <p className="mt-3 text-2xl font-bold text-white">
                  {nextTarget
                    ? `${canonicalEventName(nextTarget.event)} (${canonicalCourse(
                        nextTarget.course
                      )})`
                    : hasQualifiedRows
                    ? "All standards achieved"
                    : "No target yet"}
                </p>
                <p className="mt-2 text-white/70">
                  {nextTarget
                    ? `${formatMs(nextTarget.gap)} away from the target time.`
                    : hasQualifiedRows
                    ? "This swimmer has already achieved all currently matching standards."
                    : "Choose a standards set and make sure PBs exist for matching events."}
                </p>
              </div>
            </div>
          </section>
        )}

        {activeTab === "swimTimes" && (
          <section className="card">
            <SwimTimesSection swimmerId={Number(swimmer.id)} />
          </section>
        )}

        {activeTab === "standards" && (
          <section className="space-y-6">
            <div className="card">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="title">Standards Compare</h2>
                  <p className="mt-2 muted">
                    See how close {swimmer.name} is to qualifying standards.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.25em] text-white/45">
                    Standard Set
                  </label>
                  <select
                    value={selectedSetId ?? ""}
                    onChange={(e) => setSelectedSetId(Number(e.target.value))}
                    className="input"
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
              <div className="card border-emerald-400/20 bg-emerald-500/10">
                <p className="label text-emerald-300/70">Next Target</p>

                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-4xl font-bold text-white">
                      {canonicalEventName(nextTarget.event)}
                    </h3>
                    <p className="mt-1 text-white/70">
                      Course: {canonicalCourse(nextTarget.course)}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-emerald-400/20 bg-black/20 px-4 py-3 text-right">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">
                      Gap
                    </p>
                    <p className="text-2xl font-bold text-emerald-200">
                      {formatMs(nextTarget.gap)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="card-soft p-3">
                    <p className="label">Current PB</p>
                    <p className="mt-1 text-xl font-bold text-white">
                      {formatMs(nextTarget.pb)}
                    </p>
                  </div>

                  <div className="card-soft p-3">
                    <p className="label">Target time</p>
                    <p className="mt-1 text-xl font-bold text-white">
                      {formatMs(nextTarget.target)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!nextTarget && selectedSet && (
              <div className="card">
                <h3 className="text-2xl font-bold text-white">Next Target</h3>

                {hasInProgressRows ? (
                  <>
                    <p className="mt-3 text-white/70">
                      A target should be available, but no closest next target could be calculated.
                    </p>
                    <div className="mt-3 space-y-1 text-white/70">
                      <p>• check event/course naming</p>
                      <p>• check age ranges</p>
                      <p>• check that PBs and standards are in the same course</p>
                    </div>
                  </>
                ) : hasQualifiedRows ? (
                  <>
                    <p className="mt-3 text-white/70">
                      All current standards for <strong>{selectedSet.name}</strong> are already achieved ✅
                    </p>
                    <div className="mt-3 space-y-1 text-white/70">
                      <p>• all matching events are qualified</p>
                      <p>• add tougher standards if you want a new target</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-white/70">
                      No active next target found for <strong>{selectedSet.name}</strong>.
                    </p>
                    <div className="mt-3 space-y-1 text-white/70">
                      <p>• no matching PB exists yet</p>
                      <p>• age range does not match this swimmer</p>
                      <p>• course or event naming still does not match</p>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="card">
              <h3 className="title">{selectedSet?.name || "Standards"}</h3>
              <p className="mt-2 muted">Age: {swimmer.age}</p>

              <div className="mt-6 space-y-4">
                {strokeGroups.length === 0 ? (
                  <div className="card-soft">
                    <p className="text-white/70">No standards found in this set.</p>
                  </div>
                ) : (
                  strokeGroups.map((group) => {
                    const isStrokeOpen = !!expandedStrokes[group.key];
                    const qualifiedCount = group.rows.filter((r) => r.status === "Qualified").length;
                    const activeCount = group.rows.filter((r) => r.status === "In progress").length;

                    return (
                      <div key={group.key} className="card-soft">
                        <button
                          type="button"
                          onClick={() => toggleStroke(group.key)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h4 className="text-2xl font-bold text-white">{group.label}</h4>
                              <p className="mt-1 text-sm text-white/50">
                                {group.rows.length} event{group.rows.length === 1 ? "" : "s"}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-sm text-white/70">
                                {qualifiedCount} qualified • {activeCount} active
                              </p>
                              <p className="mt-1 text-xs text-white/40">
                                {isStrokeOpen ? "Hide" : "Show"}
                              </p>
                            </div>
                          </div>
                        </button>

                        {isStrokeOpen && (
                          <div className="mt-4 space-y-3">
                            {group.rows.map((row) => {
                              const qualified = row.status === "Qualified";
                              const inProgress = row.status === "In progress";
                              const isExpanded = !!expandedRows[row.id];

                              return (
                                <div
                                  key={row.id}
                                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleRow(row.id)}
                                    className="w-full text-left"
                                  >
                                    <div className="flex items-center justify-between gap-4">
                                      <div className="min-w-0">
                                        <h5 className="text-xl font-bold text-white">
                                          {canonicalEventName(row.event)}
                                        </h5>

                                        <p className="text-sm text-white/50">
                                          {canonicalCourse(row.course)}
                                        </p>

                                        <div className="mt-2 flex items-center gap-4 text-sm text-white/70">
                                          <span>
                                            PB{" "}
                                            <span className="font-semibold text-white">
                                              {row.pbMs == null ? "-" : formatMs(row.pbMs)}
                                            </span>
                                          </span>

                                          <span>
                                            Target{" "}
                                            <span className="font-semibold text-white">
                                              {formatMs(row.qualifying_time_ms)}
                                            </span>
                                          </span>
                                        </div>
                                      </div>

                                      <div className="shrink-0 text-right">
                                        <p className="text-lg font-bold text-white">
                                          {row.gapMs == null ? "-" : formatMs(Math.abs(row.gapMs))}
                                        </p>

                                        <p className={`text-sm font-semibold ${statusClass(row.status)}`}>
                                          {qualified
                                            ? "Qualified"
                                            : inProgress
                                            ? "In progress"
                                            : row.status}
                                        </p>

                                        <p className="mt-1 text-xs text-white/40">
                                          {isExpanded ? "Hide" : "Details"}
                                        </p>
                                      </div>
                                    </div>
                                  </button>

                                  {isExpanded && (
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                        <p className="text-xs text-white/50">PB</p>
                                        <p className="mt-1 text-xl font-bold text-white">
                                          {row.pbMs == null ? "-" : formatMs(row.pbMs)}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                        <p className="text-xs text-white/50">Target</p>
                                        <p className="mt-1 text-xl font-bold text-white">
                                          {formatMs(row.qualifying_time_ms)}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                        <p className="text-xs text-white/50">Gap</p>
                                        <p className="mt-1 text-xl font-bold text-white">
                                          {row.gapMs == null ? "-" : formatMs(Math.abs(row.gapMs))}
                                        </p>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                        <p className="text-xs text-white/50">Status</p>
                                        <p className={`mt-1 text-xl font-bold ${statusClass(row.status)}`}>
                                          {qualified
                                            ? "Qualified"
                                            : inProgress
                                            ? "In progress"
                                            : row.status}
                                        </p>
                                      </div>
                                    </div>
                                  )}
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
            </div>
          </section>
        )}

        {activeTab === "swimscan" && (
          <section className="card">
            <h2 className="title">SwimScan</h2>
            <p className="mt-2 muted">Scan race results for {swimmer.name}.</p>

            <div className="mt-6">
              <SwimScan
                swimmerId={Number(swimmer.id)}
                swimmerName={swimmer.name}
                onSaved={(text) => {
                  const parsed = parseSwimOCRText(text, {
                    swimmerName: swimmer.name,
                    defaultCourse: "LCM",
                  });

                  setOcrResults(parsed);
                  setStatus(
                    parsed.length > 0
                      ? `Detected ${parsed.length} result${parsed.length === 1 ? "" : "s"}.`
                      : "No results detected."
                  );
                }}
              />
            </div>

            {ocrResults.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-white/60">Detected results</div>

                  <button
                    onClick={saveParsedResults}
                    disabled={savingOcr}
                    className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {savingOcr ? "Saving..." : "Save all results"}
                  </button>
                </div>

                {ocrResults.map((r, idx) => (
                  <div
                    key={`${r.event}-${r.timeStr}-${idx}`}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="text-lg font-semibold text-white">{r.event}</div>

                    <div className="mt-1 text-sm text-white/70">
                      {r.name || "Unknown swimmer"} • {r.course}
                    </div>

                    <div className="mt-2 text-2xl font-bold text-white">{r.timeStr}</div>

                    <div className="mt-2 text-xs text-white/50">
                      Confidence: {r.confidence}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}