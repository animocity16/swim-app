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
  { key: "Free", label: "Free", color: "#38BDF8" },
  { key: "Back", label: "Back", color: "#A78BFA" },
  { key: "Breast", label: "Breast", color: "#34D399" },
  { key: "Fly", label: "Fly", color: "#FB923C" },
  { key: "IM", label: "IM", color: "#F472B6" },
];

const DISTANCES = [25, 50, 100, 200, 400, 800, 1500];

function strokeColor(stroke: string) {
  return STROKES.find((s) => s.key === stroke)?.color ?? "#94A3B8";
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

  const [showAddForm, setShowAddForm] = useState(false);
  const [newDistance, setNewDistance] = useState(100);
  const [newStroke, setNewStroke] = useState("Free");
  const [newTime, setNewTime] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newLoggedBy, setNewLoggedBy] = useState("Parent");
  const [saving, setSaving] = useState(false);
  const [addStatus, setAddStatus] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editLoggedBy, setEditLoggedBy] = useState("Parent");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => { void loadEntries(); }, [swimmerId]);

  async function loadEntries() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("training_times")
        .select("id, swimmer_id, distance, stroke, time_ms, swam_at, logged_by, created_at")
        .eq("swimmer_id", swimmerId)
        .order("swam_at", { ascending: false })
        .order("created_at", { ascending: false });

      setRows(((data as TrainingRow[]) || []).filter(
        (r) => typeof r.id === "number" && typeof r.time_ms === "number"
      ));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    const ms = parseTimeInputToMs(newTime);
    if (!ms) { setAddStatus("Enter a valid time e.g. 35.04 or 1:12.33"); return; }
    setSaving(true);
    setAddStatus("Saving...");
    const { error } = await supabase.from("training_times").insert([{
      swimmer_id: swimmerId,
      distance: newDistance,
      stroke: newStroke,
      time_ms: ms,
      swam_at: newDate || null,
      logged_by: newLoggedBy,
    }]);
    if (error) { setAddStatus(`Error: ${error.message}`); setSaving(false); return; }
    setNewDistance(100); setNewStroke("Free"); setNewTime(""); setNewDate("");
    setShowAddForm(false); setAddStatus("");
    await loadEntries();
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this diary entry?")) return;
    await supabase.from("training_times").delete().eq("id", id);
    await loadEntries();
  }

  function startEdit(row: TrainingRow) {
    setEditingId(row.id);
    setEditDate(row.swam_at ?? "");
    setEditLoggedBy(row.logged_by ?? "Parent");
  }

  async function handleSaveEdit() {
    if (editingId == null) return;
    setSavingEdit(true);
    await supabase.from("training_times").update({
      swam_at: editDate || null,
      logged_by: editLoggedBy,
    }).eq("id", editingId);
    setEditingId(null);
    setSavingEdit(false);
    await loadEntries();
  }

  const sorted = useMemo(() => rows, [rows]);

  if (loading) return <div className="py-4 text-center text-sm text-white/40">Loading diary…</div>;

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}
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
          {showAddForm ? "Cancel" : "+ Log time"}
        </button>
      </div>

      <p className="text-[11px] text-white/35 leading-relaxed">
        Practice times logged by you or {swimmerName}. Kept separate from meet results, PBs, and standards.
      </p>

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select value={newDistance} onChange={(e) => setNewDistance(Number(e.target.value))} className="input">
              {DISTANCES.map((d) => <option key={d} value={d}>{d}m</option>)}
            </select>
            <input value={newTime} onChange={(e) => setNewTime(e.target.value)}
              placeholder="35.04 or 1:12.33" className="input" />
          </div>

          <div>
            <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">Stroke</p>
            <div className="flex flex-wrap gap-1.5">
              {STROKES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setNewStroke(s.key)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
                  style={newStroke === s.key
                    ? { background: "rgba(217,119,6,0.25)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.45)" }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="input" />

          <div>
            <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">Logged by</p>
            <div className="flex gap-1.5">
              {["Parent", swimmerName].map((who) => (
                <button
                  key={who}
                  type="button"
                  onClick={() => setNewLoggedBy(who)}
                  className="flex-1 rounded-xl py-2 text-xs font-bold transition"
                  style={newLoggedBy === who
                    ? { background: "#D97706", border: "1px solid #D97706", color: "#fff" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
                >
                  {who}
                </button>
              ))}
            </div>
          </div>

          {addStatus && <p className="text-xs text-white/50">{addStatus}</p>}
          <button type="button" onClick={handleAdd} disabled={saving}
            className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ background: "#D97706" }}>
            {saving ? "Saving…" : "Save entry"}
          </button>
        </div>
      )}

      {/* Empty state */}
      {sorted.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center">
          <p className="text-sm text-white/40">No diary entries yet — log one above after practice.</p>
        </div>
      )}

      {/* Entries */}
      {sorted.map((row) => {
        const isEditing = editingId === row.id;
        const color = strokeColor(row.stroke);
        return (
          <div key={row.id} className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
            {isEditing ? (
              <div className="p-4 space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">Date</p>
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="input" />
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">Logged by</p>
                <div className="flex gap-1.5">
                  {["Parent", swimmerName].map((who) => (
                    <button key={who} type="button" onClick={() => setEditLoggedBy(who)}
                      className="flex-1 rounded-xl py-2 text-xs font-bold transition"
                      style={editLoggedBy === who
                        ? { background: "#D97706", border: "1px solid #D97706", color: "#fff" }
                        : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
                      {who}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={handleSaveEdit} disabled={savingEdit}
                    className="flex-1 rounded-xl py-2 text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: "#D97706" }}>
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white/50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center text-[10px] font-bold"
                  style={{ background: `${color}26`, color }}>
                  {row.stroke === "Free" ? "FR" : row.stroke === "Back" ? "BK" : row.stroke === "Breast" ? "BR" : row.stroke === "Fly" ? "FL" : "IM"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{row.distance}m {row.stroke}</p>
                  <p className="text-[11px] text-white/35 mt-0.5">
                    {row.swam_at ? formatDate(row.swam_at) : "No date"} · {row.logged_by || "Parent"}
                  </p>
                </div>
                <p className="text-sm font-bold flex-shrink-0" style={{ color: "#FDE68A" }}>
                  {formatMs(row.time_ms)}
                </p>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button type="button" onClick={() => startEdit(row)}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/50 transition hover:bg-white/10">
                    Edit
                  </button>
                  <button type="button" onClick={() => void handleDelete(row.id)}
                    className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300 transition hover:bg-red-500/20">
                    Del
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
