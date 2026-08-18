"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// A public, no-login split/pace calculator — same "give real value before
// asking for anything" idea as the search page. Two modes:
//  1. Goal time → even-pace split plan (plan a race)
//  2. Known split → projected time for a longer distance (set a goal)

const DISTANCES = [50, 100, 200, 400, 800, 1500];
const COURSES = [
  { label: "Short Course (25m)", value: 25 },
  { label: "Long Course (50m)", value: 50 },
];

function parseTimeToMs(input: string): number | null {
  // Accepts "28.50", "1:03.58", "12:34.56"
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  let seconds = 0;
  try {
    if (parts.length === 1) {
      seconds = parseFloat(parts[0]);
    } else if (parts.length === 2) {
      seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 3) {
      seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    } else {
      return null;
    }
  } catch {
    return null;
  }
  if (Number.isNaN(seconds) || seconds <= 0) return null;
  return Math.round(seconds * 100) * 10; // ms
}

function formatMs(ms: number): string {
  const totalCs = Math.round(ms / 10);
  const minutes = Math.floor(totalCs / 6000);
  const seconds = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }
  return `${seconds}.${String(cs).padStart(2, "0")}`;
}

type Mode = "splits" | "project";

export default function CalculatorPage() {
  const [mode, setMode] = useState<Mode>("splits");
  const [distance, setDistance] = useState(100);
  const [course, setCourse] = useState(50);
  const [goalTime, setGoalTime] = useState("");
  const [knownSplitDistance, setKnownSplitDistance] = useState(50);
  const [knownSplitTime, setKnownSplitTime] = useState("");
  const [projectDistance, setProjectDistance] = useState(200);

  const splitPlan = useMemo(() => {
    const totalMs = parseTimeToMs(goalTime);
    if (!totalMs) return null;
    const lapLength = course;
    const numLaps = Math.round(distance / lapLength);
    if (numLaps < 1) return null;
    const msPerLap = totalMs / numLaps;

    const rows: { lap: number; distance: number; lapTime: number; cumulative: number }[] = [];
    for (let i = 1; i <= numLaps; i++) {
      rows.push({
        lap: i,
        distance: i * lapLength,
        lapTime: msPerLap,
        cumulative: msPerLap * i,
      });
    }
    return { rows, totalMs, msPerLap, numLaps };
  }, [goalTime, distance, course]);

  const projection = useMemo(() => {
    const splitMs = parseTimeToMs(knownSplitTime);
    if (!splitMs || knownSplitDistance <= 0) return null;
    const paceMsPerMeter = splitMs / knownSplitDistance;
    const projectedMs = paceMsPerMeter * projectDistance;
    return { projectedMs, paceMsPerMeter };
  }, [knownSplitTime, knownSplitDistance, projectDistance]);

  return (
    <div className="shell">
      <div className="container-app">
        <Link href="/search" className="text-xs text-white/40">
          ← Back to search
        </Link>

        <div className="mt-4 mb-6 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
            style={{ background: "rgba(217,119,6,0.25)", border: "1px solid rgba(253,230,138,0.3)" }}
          >
            ⏱️
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Race Split Calculator</h1>
          <p className="mt-2 text-sm text-white/50">Plan your pacing, or project a goal time from a known split.</p>
        </div>

        <div className="mb-5 flex gap-2 rounded-2xl p-1" style={{ background: "rgba(0,20,50,0.3)" }}>
          <button
            type="button"
            onClick={() => setMode("splits")}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
            style={mode === "splits" ? { background: "rgba(217,119,6,0.3)", color: "#FDE68A" } : { color: "rgba(255,255,255,0.5)" }}
          >
            Split Plan
          </button>
          <button
            type="button"
            onClick={() => setMode("project")}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
            style={mode === "project" ? { background: "rgba(217,119,6,0.3)", color: "#FDE68A" } : { color: "rgba(255,255,255,0.5)" }}
          >
            Project a Time
          </button>
        </div>

        {mode === "splits" && (
          <div className="card">
            <div className="mb-3 flex gap-2">
              <select className="input" value={distance} onChange={(e) => setDistance(Number(e.target.value))}>
                {DISTANCES.map((d) => (
                  <option key={d} value={d}>{d}m</option>
                ))}
              </select>
              <select className="input" value={course} onChange={(e) => setCourse(Number(e.target.value))}>
                {COURSES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <input
              className="input"
              placeholder="Goal time, e.g. 1:03.50"
              value={goalTime}
              onChange={(e) => setGoalTime(e.target.value)}
            />

            {goalTime && !splitPlan && (
              <p className="mt-3 text-sm" style={{ color: "#F09595" }}>
                Enter a valid time (e.g. 28.50 or 1:03.58).
              </p>
            )}

            {splitPlan && (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
                  Even pace · {formatMs(splitPlan.msPerLap)} per {course}m
                </div>
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                  {splitPlan.rows.map((row) => (
                    <div
                      key={row.lap}
                      className="flex justify-between px-4 py-2.5 text-sm"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <span className="text-white/60">{row.distance}m</span>
                      <span className="font-semibold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatMs(row.cumulative)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "project" && (
          <div className="card">
            <div className="mb-3 flex gap-2">
              <select className="input" value={knownSplitDistance} onChange={(e) => setKnownSplitDistance(Number(e.target.value))}>
                {[25, 50, 100, 200].map((d) => (
                  <option key={d} value={d}>{d}m split</option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Time, e.g. 28.50"
                value={knownSplitTime}
                onChange={(e) => setKnownSplitTime(e.target.value)}
              />
            </div>
            <select className="input" value={projectDistance} onChange={(e) => setProjectDistance(Number(e.target.value))}>
              {DISTANCES.map((d) => (
                <option key={d} value={d}>Project to {d}m</option>
              ))}
            </select>

            {knownSplitTime && !projection && (
              <p className="mt-3 text-sm" style={{ color: "#F09595" }}>
                Enter a valid time (e.g. 28.50 or 1:03.58).
              </p>
            )}

            {projection && (
              <div className="card-soft mt-4 text-center">
                <div className="text-[11px] font-bold uppercase tracking-wide text-white/40">
                  Projected {projectDistance}m (holding pace)
                </div>
                <div className="mt-1 text-3xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatMs(projection.projectedMs)}
                </div>
                <p className="mt-2 text-[11px] text-white/40">
                  This is even-pace math, not a real prediction — most swimmers slow slightly over longer distances, so
                  treat this as a best-case number, not a guarantee.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="card-soft mt-5 text-center">
          <p className="text-sm text-white/60">Want to see how these compare to real race history?</p>
          <Link href="/search" className="mt-2 inline-block text-xs font-semibold" style={{ color: "#FDE68A" }}>
            Search a swimmer →
          </Link>
        </div>
      </div>
    </div>
  );
}
