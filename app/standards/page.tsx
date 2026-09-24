"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
      const { error: childError } = await supabase.from("standard_items").delete().eq("standard_set_id", setId).eq("user_id", user.id);
      if (childError) { setStatus(`Error deleting standard items: ${childError.message}`); return; }
      const { error: setError } = await supabase.from("standard_sets").delete().eq("id", setId).eq("user_id", user.id);
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
      <div className="container-app space-y-6">

        {/* Header */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => router.push("/swimmers")}
            className="mb-5 inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>

          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">
            Natrix
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">Standards</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">
            Create qualifying standards and track the targets that matter for your swimmer.
          </p>
        </div>

        {/* Add new set */}
        <div
          className="overflow-hidden rounded-[30px] p-5"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(232,244,255,0.96))",
            border: "1px solid rgba(255,255,255,0.82)",
            boxShadow: "0 22px 50px rgba(0,0,0,0.12)",
          }}
        >
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#168AE8" }}>
              Add a target
            </p>
            <h2 className="mt-1 text-xl font-bold" style={{ color: "#0C2E59" }}>
              New standard set
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "#6B84A2" }}>
              Add an upgrading level or an important meet standard.
            </p>
          </div>

          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addSet()}
              placeholder="e.g. Elite B Upgrading 2026"
              className="h-14 w-full rounded-2xl px-4 outline-none"
              style={{
                background: "rgba(12,46,89,0.055)",
                border: "1px solid rgba(12,46,89,0.10)",
                color: "#0C2E59",
              }}
            />

            <select
              value={type}
              onChange={(e) => setType(e.target.value as "UPGRADING" | "IMPORTANT_MEET")}
              className="h-14 w-full rounded-2xl px-4 outline-none"
              style={{
                background: "rgba(12,46,89,0.055)",
                border: "1px solid rgba(12,46,89,0.10)",
                color: "#0C2E59",
              }}
            >
              <option value="UPGRADING">Upgrading</option>
              <option value="IMPORTANT_MEET">Important Meet</option>
            </select>

            {status && status !== "Ready" && (
              <p className="px-1 text-xs" style={{ color: "#6B84A2" }}>{status}</p>
            )}

            <button
              type="button"
              onClick={addSet}
              disabled={loading || !name.trim()}
              className="w-full rounded-2xl py-4 text-base font-bold text-white transition disabled:opacity-40"
              style={{
                background: "#168AE8",
                boxShadow: "0 10px 24px rgba(22,138,232,0.22)",
              }}
            >
              {loading ? "Adding..." : "Add standard set"}
            </button>
          </div>
        </div>

        {/* Standards list */}
        {loading && sets.length === 0 ? (
          <div
            className="rounded-[28px] p-6 text-center"
            style={{
              background: "rgba(255,255,255,0.075)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <p className="text-sm text-white/50">Loading standards...</p>
          </div>
        ) : sets.length === 0 ? (
          <div
            className="rounded-[30px] px-6 py-9 text-center"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
              style={{
                background: "rgba(22,138,232,0.16)",
                border: "1px solid rgba(125,211,252,0.22)",
              }}
            >
              🎯
            </div>
            <p className="text-base font-bold text-white">No standard sets yet</p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/40">
              Add your first target above. You can use it for squad upgrading, qualification meets, or any goal you want to track.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end justify-between px-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/30">
                  Your standards
                </p>
                <p className="mt-1 text-sm text-white/45">
                  {sets.length} set{sets.length === 1 ? "" : "s"} saved
                </p>
              </div>
            </div>

            {sets.map((setItem) => (
              <div
                key={setItem.id}
                className="overflow-hidden rounded-[28px]"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(235,245,255,0.96))",
                  border: "1px solid rgba(255,255,255,0.82)",
                  boxShadow: "0 16px 36px rgba(0,0,0,0.10)",
                }}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <span
                        className="inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
                        style={
                          setItem.type === "UPGRADING"
                            ? { background: "rgba(22,138,232,0.10)", color: "#168AE8", border: "1px solid rgba(22,138,232,0.16)" }
                            : { background: "rgba(217,119,6,0.10)", color: "#B86C08", border: "1px solid rgba(217,119,6,0.16)" }
                        }
                      >
                        {setItem.type === "UPGRADING" ? "Upgrading" : "Important Meet"}
                      </span>

                      <h2 className="mt-3 truncate text-xl font-bold" style={{ color: "#0C2E59" }}>
                        {setItem.name}
                      </h2>
                      <p className="mt-1 text-xs" style={{ color: "#6B84A2" }}>
                        Added {formatCreatedAt(setItem.created_at)}
                      </p>
                    </div>

                    <Link
                      href={`/standards/${setItem.id}`}
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-xl font-semibold"
                      style={{
                        background: "rgba(22,138,232,0.10)",
                        color: "#168AE8",
                        border: "1px solid rgba(22,138,232,0.14)",
                      }}
                    >
                      ›
                    </Link>
                  </div>

                  <div className="mt-5 grid grid-cols-[1fr_auto] gap-3">
                    <Link
                      href={`/standards/${setItem.id}`}
                      className="flex items-center justify-center rounded-2xl py-3.5 text-sm font-bold text-white"
                      style={{ background: "#168AE8" }}
                    >
                      Open standard
                    </Link>

                    <button
                      type="button"
                      onClick={() => void deleteSet(setItem.id, setItem.name)}
                      disabled={loading}
                      className="rounded-2xl px-4 py-3.5 text-sm font-semibold transition disabled:opacity-40"
                      style={{
                        background: "rgba(220,38,38,0.07)",
                        border: "1px solid rgba(220,38,38,0.12)",
                        color: "#D65B5B",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
