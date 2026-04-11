"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type StandardSet = {
  id: number;
  name: string;
  type: "UPGRADING" | "IMPORTANT_MEET";
  created_at?: string | null;
  user_id?: string | null;
};

function formatCreatedAt(value?: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function StandardsPage() {
  const [sets, setSets] = useState<StandardSet[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<"UPGRADING" | "IMPORTANT_MEET">("UPGRADING");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready");

  useEffect(() => { void loadSets(); }, []);

  async function loadSets() {
    try {
      setLoading(true);
      setStatus("Loading standards...");

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) { setStatus("Could not check login."); setSets([]); return; }
      if (!user) { setStatus("You must be logged in."); setSets([]); return; }

      const { data, error } = await supabase
        .from("standard_sets")
        .select("id, name, type, created_at, user_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) { setStatus(`Error loading sets: ${error.message}`); setSets([]); return; }

      setSets((data as StandardSet[]) || []);
      setStatus("Ready");
    } catch {
      setStatus("Something went wrong while loading standards.");
      setSets([]);
    } finally {
      setLoading(false);
    }
  }

  async function addSet() {
    const trimmedName = name.trim();
    if (!trimmedName) { setStatus("Please enter a set name."); return; }

    try {
      setLoading(true);
      setStatus("Adding standards set...");

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) { setStatus("Could not check login."); return; }
      if (!user) { setStatus("You must be logged in."); return; }

      const { error } = await supabase.from("standard_sets").insert([{ name: trimmedName, type, user_id: user.id }]);
      if (error) { setStatus(`Error adding set: ${error.message}`); return; }

      setName("");
      setType("UPGRADING");
      setStatus("Standards set added.");
      await loadSets();
    } catch {
      setStatus("Something went wrong while adding the set.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSet(setId: number, setName: string) {
    const confirmed = window.confirm(`Delete "${setName}" and all its standard items?`);
    if (!confirmed) return;

    try {
      setLoading(true);
      setStatus(`Deleting "${setName}"...`);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) { setStatus("Could not check login."); return; }
      if (!user) { setStatus("You must be logged in."); return; }

      const { error: childError } = await supabase
        .from("standard_items").delete()
        .eq("standard_set_id", setId).eq("user_id", user.id);

      if (childError) { setStatus(`Error deleting standard items: ${childError.message}`); return; }

      const { error: setError } = await supabase
        .from("standard_sets").delete()
        .eq("id", setId).eq("user_id", user.id);

      if (setError) { setStatus(`Error deleting set: ${setError.message}`); return; }

      setStatus(`Deleted "${setName}".`);
      await loadSets();
    } catch {
      setStatus("Something went wrong while deleting the set.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
            Natrix
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Standards</h1>
          <p className="mt-1 text-sm text-white/40">
            Create qualifying standard sets to track how close your swimmer is to their next goal.
          </p>
        </div>

        {/* Add new set */}
        <div className="card space-y-4">
          <p className="label">New standard set</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addSet()}
            placeholder="e.g. Elite B Upgrading 2026"
            className="input"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "UPGRADING" | "IMPORTANT_MEET")}
            className="input"
          >
            <option value="UPGRADING">Upgrading</option>
            <option value="IMPORTANT_MEET">Important Meet</option>
          </select>

          {status && status !== "Ready" && (
            <p className="text-sm text-white/50">{status}</p>
          )}

          <button
            type="button"
            onClick={addSet}
            disabled={loading || !name.trim()}
            className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-40"
            style={{ background: "#D97706" }}
          >
            {loading ? "Adding..." : "Add standard set"}
          </button>
        </div>

        {/* Standards list */}
        {loading && sets.length === 0 ? (
          <p className="muted">Loading...</p>
        ) : sets.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-white font-semibold">No standard sets yet</p>
            <p className="mt-1 text-sm text-white/40">
              Add your first set above — e.g. "Elite B Upgrading" or "SNAG Juniors 2026".
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="label">Your sets</p>
            {sets.map((setItem) => (
              <div
                key={setItem.id}
                className="rounded-3xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.09)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold text-white truncate">{setItem.name}</h2>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span
                          className="rounded-full px-3 py-1 text-xs font-semibold"
                          style={{
                            background: setItem.type === "UPGRADING"
                              ? "rgba(217,119,6,0.2)"
                              : "rgba(99,130,201,0.2)",
                            color: setItem.type === "UPGRADING" ? "#FDE68A" : "#93C5FD",
                            border: `1px solid ${setItem.type === "UPGRADING" ? "rgba(253,230,138,0.25)" : "rgba(147,197,253,0.25)"}`,
                          }}
                        >
                          {setItem.type === "UPGRADING" ? "Upgrading" : "Important Meet"}
                        </span>
                        <span className="text-xs text-white/30">
                          Added {formatCreatedAt(setItem.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <Link
                        href={`/standards/${setItem.id}`}
                        className="rounded-2xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => void deleteSet(setItem.id, setItem.name)}
                        disabled={loading}
                        className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}