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
  return date.toLocaleString();
}

export default function StandardsPage() {
  const [sets, setSets] = useState<StandardSet[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<"UPGRADING" | "IMPORTANT_MEET">("UPGRADING");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    void loadSets();
  }, []);

  async function loadSets() {
    try {
      setLoading(true);
      setStatus("Loading standards...");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("loadSets user error:", userError);
        setStatus("Could not check login.");
        setSets([]);
        return;
      }

      if (!user) {
        setStatus("You must be logged in.");
        setSets([]);
        return;
      }

      const { data, error } = await supabase
        .from("standard_sets")
        .select("id, name, type, created_at, user_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("loadSets error:", error);
        setStatus(`Error loading sets: ${error.message}`);
        setSets([]);
        return;
      }

      setSets((data as StandardSet[]) || []);
      setStatus("Ready");
    } catch (err) {
      console.error("Unexpected loadSets error:", err);
      setStatus("Something went wrong while loading standards.");
      setSets([]);
    } finally {
      setLoading(false);
    }
  }

  async function addSet() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setStatus("Please enter a set name.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Adding standards set...");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("addSet user error:", userError);
        setStatus("Could not check login.");
        return;
      }

      if (!user) {
        setStatus("You must be logged in.");
        return;
      }

      const { error } = await supabase.from("standard_sets").insert([
        {
          name: trimmedName,
          type,
          user_id: user.id,
        },
      ]);

      if (error) {
        console.error("addSet error:", error);
        setStatus(`Error adding set: ${error.message}`);
        return;
      }

      setName("");
      setType("UPGRADING");
      setStatus("Standards set added.");
      await loadSets();
    } catch (err) {
      console.error("Unexpected addSet error:", err);
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

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("deleteSet user error:", userError);
        setStatus("Could not check login.");
        return;
      }

      if (!user) {
        setStatus("You must be logged in.");
        return;
      }

      const { error: childError } = await supabase
        .from("standard_items")
        .delete()
        .eq("standard_set_id", setId)
        .eq("user_id", user.id);

      if (childError) {
        console.error("delete standard_items error:", childError);
        setStatus(`Error deleting standard items: ${childError.message}`);
        return;
      }

      const { error: setError } = await supabase
        .from("standard_sets")
        .delete()
        .eq("id", setId)
        .eq("user_id", user.id);

      if (setError) {
        console.error("delete standard_sets error:", setError);
        setStatus(`Error deleting set: ${setError.message}`);
        return;
      }

      setStatus(`Deleted "${setName}".`);
      await loadSets();
    } catch (err) {
      console.error("Unexpected deleteSet error:", err);
      setStatus("Something went wrong while deleting the set.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Standards
          </h1>

          <Link
            href="/swimmers"
            className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
          >
            Back
          </Link>
        </div>

        <div className="mb-6 rounded-3xl border border-white/15 bg-white/5 p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_120px]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Set name"
              className="h-14 w-full rounded-2xl border border-white/25 bg-black px-4 text-lg text-white placeholder:text-white/35 outline-none"
            />

            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as "UPGRADING" | "IMPORTANT_MEET")
              }
              className="h-14 w-full rounded-2xl border border-white/25 bg-black px-4 text-lg text-white outline-none"
            >
              <option value="UPGRADING">Upgrading</option>
              <option value="IMPORTANT_MEET">Important Meet</option>
            </select>

            <button
              onClick={addSet}
              disabled={loading}
              className="h-14 rounded-2xl border border-white/25 bg-white/5 px-5 text-lg font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>

          <p className="mt-4 text-base text-white/55">{status}</p>
        </div>

        <div className="space-y-4">
          {sets.length === 0 && !loading ? (
            <div className="rounded-3xl border border-white/15 bg-white/5 p-5 text-white/60">
              No standards sets yet.
            </div>
          ) : (
            sets.map((setItem) => (
              <div
                key={setItem.id}
                className="rounded-3xl border border-white/15 bg-white/5 p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                      {setItem.name}
                    </h2>

                    <p className="mt-2 text-base uppercase tracking-wide text-white/45">
                      {setItem.type === "UPGRADING"
                        ? "Upgrading"
                        : "Important Meet"}
                    </p>

                    <p className="mt-3 text-sm text-white/40">
                      Added: {formatCreatedAt(setItem.created_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/standards/${setItem.id}`}
                      className="rounded-2xl border border-white/20 px-5 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
                    >
                      Open
                    </Link>

                    <button
                      onClick={() => void deleteSet(setItem.id, setItem.name)}
                      disabled={loading}
                      className="rounded-2xl border border-red-400/40 px-5 py-2.5 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}