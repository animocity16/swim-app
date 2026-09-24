"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  swimmerId: number;
  swimmerName?: string;
};

type TrainingRow = {
  id: number;
  swimmer_id: number;
  distance: number;
  stroke: string;
  time_ms: number;
  swam_at?: string | null;
  logged_by?: string | null;
  created_at?: string | null;
};

const STROKES = [
  { key: "Free", label: "Free", color: "#38BDF8", icon: "/icons/strokes/free.png" },
  { key: "Back", label: "Back", color: "#A78BFA", icon: "/icons/strokes/back.png" },
  { key: "Breast", label: "Breast", color: "#34D399", icon: "/icons/strokes/breast.png" },
  { key: "Fly", label: "Fly", color: "#FB923C", icon: "/icons/strokes/fly.png" },
  { key: "IM", label: "IM", color: "#F472B6", icon: "/icons/strokes/im.png" },
];

const DISTANCES = [25, 50, 100, 200, 400, 800, 1500];

function strokeColor(stroke: string) {
  return STROKES.find((s) => s.key === stroke)?.color ?? "#94A3B8";
}

function strokeIcon(stroke: string) {
  return STROKES.find((s) => s.key === stroke)?.icon ?? "/icons/strokes/free.png";
}

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

export default function DiaryTab({ swimmerId, swimmerName = "Swimmer" }: Props) {
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [newDistance, setNewDistance] = useState(100);
  const [newStroke, setNewStroke] = useState("Free");
  const [newTime, setNewTime] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newLoggedBy, setNewLoggedBy] = useState("Parent");
  const [saving, setSaving] = useState(false);
  const [addStatus, setAddStatus] = useState("");
  const [addStatusIsError, setAddStatusIsError] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editLoggedBy, setEditLoggedBy] = useState("Parent");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => { void loadEntries(); }, [swimmerId]);

  async function loadEntries() {
    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await supabase
        .from("training_times")
        .select("id, swimmer_id, distance, stroke, time_ms, swam_at, logged_by, created_at")
        .eq("swimmer_id", swimmerId)
        .order("swam_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("DiaryTab loadEntries error:", error);
        setLoadError(error.message || "Couldn't load diary entries.");
        setRows([]);
        return;
      }

      setRows(((data as TrainingRow[]) || []).filter(
        (r) => typeof r.id === "number" && typeof r.time_ms === "number"
      ));
    } catch (err: any) {
      console.error("DiaryTab loadEntries exception:", err);
      setLoadError(err?.message || "Couldn't load diary entries.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    const ms = parseTimeInputToMs(newTime);
    if (!ms) {
      setAddStatusIsError(true);
      setAddStatus("Enter a valid time e.g. 35.04 or 1:12.33");
      return;
    }
    setSaving(true);
    setAddStatusIsError(false);
    setAddStatus("Saving...");
    try {
      const { error } = await supabase.from("training_times").insert([{
        swimmer_id: swimmerId,
        distance: newDistance,
        stroke: newStroke,
        time_ms: ms,
        swam_at: newDate || null,
        logged_by: newLoggedBy,
      }]);
      if (error) {
        console.error("DiaryTab handleAdd error:", error);
        setAddStatusIsError(true);
        setAddStatus(`Couldn't save: ${error.message}`);
        return;
      }
      setNewDistance(100); setNewStroke("Free"); setNewTime(""); setNewDate("");
      setShowAddForm(false); setAddStatus(""); setAddStatusIsError(false);
      await loadEntries();
    } catch (err: any) {
      console.error("DiaryTab handleAdd exception:", err);
      setAddStatusIsError(true);
      setAddStatus(`Couldn't save: ${err?.message || "unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this diary entry?")) return;
    try {
      const { error } = await supabase.from("training_times").delete().eq("id", id);
      if (error) {
        console.error("DiaryTab handleDelete error:", error);
        window.alert(`Couldn't delete: ${error.message}`);
        return;
      }
      await loadEntries();
    } catch (err: any) {
      console.error("DiaryTab handleDelete exception:", err);
      window.alert(`Couldn't delete: ${err?.message || "unknown error"}`);
    }
  }

  function startEdit(row: TrainingRow) {
    setEditingId(row.id);
    setEditDate(row.swam_at ?? "");
    setEditLoggedBy(row.logged_by ?? "Parent");
  }

  async function handleSaveEdit() {
    if (editingId == null) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase.from("training_times").update({
        swam_at: editDate || null,
        logged_by: editLoggedBy,
      }).eq("id", editingId);
      if (error) {
        console.error("DiaryTab handleSaveEdit error:", error);
        window.alert(`Couldn't save changes: ${error.message}`);
        return;
      }
      setEditingId(null);
      await loadEntries();
    } catch (err: any) {
      console.error("DiaryTab handleSaveEdit exception:", err);
      window.alert(`Couldn't save changes: ${err?.message || "unknown error"}`);
    } finally {
      setSavingEdit(false);
    }
  }

  const sorted = useMemo(() => rows, [rows]);

  if (loading) {
    return (
      <div
        className="rounded-3xl py-8 text-center text-sm text-white/45"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.11)",
        }}
      >
        Loading diary…
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/30">
            Training diary
          </p>
          <p className="mt-1 text-sm text-white/45">
            {rows.length} entr{rows.length === 1 ? "y" : "ies"} logged
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
          style={{
            background: showAddForm ? "rgba(255,255,255,0.10)" : "#168AE8",
            border: showAddForm
              ? "1px solid rgba(255,255,255,0.14)"
              : "1px solid rgba(22,138,232,0.22)",
            color: showAddForm ? "rgba(255,255,255,0.72)" : "#fff",
            boxShadow: showAddForm ? "none" : "0 10px 24px rgba(22,138,232,0.18)",
          }}
        >
          {showAddForm ? "Cancel" : "+ Log time"}
        </button>
      </div>

      <div
        className="rounded-3xl px-5 py-4"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.11)",
        }}
      >
        <p className="text-xs leading-relaxed text-white/45">
          Practice times logged by you or {swimmerName}. They stay separate from meet results, PBs, and standards.
        </p>
      </div>

      {loadError && (
        <div
          className="rounded-3xl px-4 py-3"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.18)",
          }}
        >
          <p className="text-xs text-red-300">Couldn&apos;t load diary: {loadError}</p>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div
          className="rounded-[30px] p-5"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(234,244,255,0.96))",
            border: "1px solid rgba(255,255,255,0.80)",
            boxShadow: "0 20px 44px rgba(0,0,0,0.12)",
          }}
        >
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#168AE8" }}>
              Practice time
            </p>
            <h3 className="mt-1 text-xl font-bold" style={{ color: "#0C2E59" }}>
              Log a new time
            </h3>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newDistance}
                onChange={(e) => setNewDistance(Number(e.target.value))}
                className="h-14 w-full rounded-2xl px-4 outline-none"
                style={{
                  background: "rgba(12,46,89,0.055)",
                  border: "1px solid rgba(12,46,89,0.10)",
                  color: "#0C2E59",
                }}
              >
                {DISTANCES.map((d) => <option key={d} value={d}>{d}m</option>)}
              </select>

              <input
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                placeholder="35.04"
                className="h-14 w-full rounded-2xl px-4 outline-none"
                style={{
                  background: "rgba(12,46,89,0.055)",
                  border: "1px solid rgba(12,46,89,0.10)",
                  color: "#0C2E59",
                }}
              />
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#6B84A2" }}>
                Stroke
              </p>
              <div className="grid grid-cols-5 gap-2">
                {STROKES.map((stroke) => (
                  <button
                    key={stroke.key}
                    type="button"
                    onClick={() => setNewStroke(stroke.key)}
                    className="flex flex-col items-center gap-1.5 rounded-2xl px-2 py-2.5 text-[10px] font-semibold transition"
                    style={newStroke === stroke.key
                      ? {
                          background: "rgba(22,138,232,0.10)",
                          border: "1px solid rgba(22,138,232,0.24)",
                          color: "#168AE8",
                        }
                      : {
                          background: "rgba(12,46,89,0.035)",
                          border: "1px solid rgba(12,46,89,0.08)",
                          color: "#6B84A2",
                        }}
                  >
                    <img src={stroke.icon} alt="" className="h-8 w-8 rounded-lg object-cover" />
                    {stroke.label}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-14 w-full rounded-2xl px-4 outline-none"
              style={{
                background: "rgba(12,46,89,0.055)",
                border: "1px solid rgba(12,46,89,0.10)",
                color: "#0C2E59",
                colorScheme: "light",
              }}
            />

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#6B84A2" }}>
                Logged by
              </p>
              <div className="grid grid-cols-2 gap-2">
                {["Parent", swimmerName].map((who) => (
                  <button
                    key={who}
                    type="button"
                    onClick={() => setNewLoggedBy(who)}
                    className="rounded-2xl py-3 text-xs font-bold transition"
                    style={newLoggedBy === who
                      ? { background: "#168AE8", border: "1px solid #168AE8", color: "#fff" }
                      : { background: "rgba(12,46,89,0.045)", border: "1px solid rgba(12,46,89,0.09)", color: "#6B84A2" }}
                  >
                    {who}
                  </button>
                ))}
              </div>
            </div>

            {addStatus && (
              <p
                className="text-xs font-semibold"
                style={{ color: addStatusIsError ? "#D65B5B" : "#6B84A2" }}
              >
                {addStatus}
              </p>
            )}

            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="w-full rounded-2xl py-4 text-base font-bold text-white transition disabled:opacity-50"
              style={{ background: "#168AE8" }}
            >
              {saving ? "Saving…" : "Save entry"}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {sorted.length === 0 && !loadError && (
        <div
          className="rounded-[30px] px-6 py-9 text-center"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.13)",
          }}
        >
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
            style={{
              background: "rgba(22,138,232,0.14)",
              border: "1px solid rgba(125,211,252,0.20)",
            }}
          >
            📝
          </div>
          <p className="text-base font-bold text-white">No diary entries yet</p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/40">
            Log a practice time to start building a separate training history.
          </p>
        </div>
      )}

      {/* Entries */}
      {sorted.map((row) => {
        const isEditing = editingId === row.id;
        const color = strokeColor(row.stroke);
        const icon = strokeIcon(row.stroke);

        return (
          <div
            key={row.id}
            className="overflow-hidden rounded-[28px]"
            style={{
              background: "rgba(255,255,255,0.085)",
              border: "1px solid rgba(255,255,255,0.13)",
              boxShadow: "0 14px 32px rgba(0,0,0,0.08)",
            }}
          >
            {isEditing ? (
              <div className="space-y-3 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                  Edit entry
                </p>

                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="input"
                />

                <div className="grid grid-cols-2 gap-2">
                  {["Parent", swimmerName].map((who) => (
                    <button
                      key={who}
                      type="button"
                      onClick={() => setEditLoggedBy(who)}
                      className="rounded-2xl py-2.5 text-xs font-bold transition"
                      style={editLoggedBy === who
                        ? { background: "#168AE8", border: "1px solid #168AE8", color: "#fff" }
                        : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.50)" }}
                    >
                      {who}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="rounded-2xl py-3 text-xs font-bold text-white disabled:opacity-50"
                    style={{ background: "#168AE8" }}
                  >
                    {savingEdit ? "Saving…" : "Save changes"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-2xl py-3 text-xs font-semibold text-white/55"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-4">
                <img
                  src={icon}
                  alt=""
                  className="h-12 w-12 flex-shrink-0 rounded-xl object-cover"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-white">
                    {row.distance}m {row.stroke}
                  </p>
                  <p className="mt-1 text-xs text-white/38">
                    {row.swam_at ? formatDate(row.swam_at) : "No date"} · {row.logged_by || "Parent"}
                  </p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] uppercase tracking-wide text-white/25">Time</p>
                  <p className="mt-0.5 text-xl font-bold" style={{ color: "#FDE68A" }}>
                    {formatMs(row.time_ms)}
                  </p>
                </div>

                <div className="ml-1 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="rounded-xl px-2.5 py-1.5 text-[10px] font-semibold text-white/55 transition"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDelete(row.id)}
                    className="rounded-xl px-2.5 py-1.5 text-[10px] font-semibold text-red-300 transition"
                    style={{
                      background: "rgba(239,68,68,0.07)",
                      border: "1px solid rgba(239,68,68,0.14)",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
