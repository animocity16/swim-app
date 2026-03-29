"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Swimmer = {
  id: number | string;
  name: string;
  age: number;
  birth_year?: number | null;
  group_type?: "primary" | "following" | string | null;
  created_at?: string | null;
};

function formatCreatedAt(value?: string | null) {
  if (!value) return "No date available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date available";
  return date.toLocaleString();
}

export default function SwimmersPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [status, setStatus] = useState("Checking session...");
  const [loading, setLoading] = useState(false);

  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [groupType, setGroupType] = useState<"primary" | "following">("primary");

  useEffect(() => {
    let mounted = true;

    async function initPage() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        console.error("getSession error:", error);
        setStatus(`Session error: ${error.message}`);
        setAuthChecked(true);
        return;
      }

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setAuthChecked(true);
      await fetchSwimmers();
    }

    initPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function fetchSwimmers() {
    setLoading(true);
    setStatus("Loading swimmers...");

    const { data, error } = await supabase
      .from("swimmers")
      .select("id, name, age, birth_year, group_type, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchSwimmers error:", error);
      setStatus(`Error loading swimmers: ${error.message}`);
      setSwimmers([]);
      setLoading(false);
      return;
    }

    setSwimmers((data as Swimmer[]) || []);
    setStatus("Ready");
    setLoading(false);
  }

  async function addSwimmer() {
    const trimmedName = name.trim();
    const parsedAge = Number(age);

    if (!trimmedName) {
      setStatus("Please enter swimmer name.");
      return;
    }

    if (!age || Number.isNaN(parsedAge) || parsedAge <= 0) {
      setStatus("Please enter a valid age.");
      return;
    }

    setLoading(true);
    setStatus("Adding swimmer...");

    const { error } = await supabase.from("swimmers").insert([
      {
        name: trimmedName,
        age: parsedAge,
        group_type: groupType,
      },
    ]);

    if (error) {
      console.error("addSwimmer error:", error);
      setStatus(`Error adding swimmer: ${error.message}`);
      setLoading(false);
      return;
    }

    setName("");
    setAge("");
    setGroupType("primary");
    setStatus("Swimmer added.");
    await fetchSwimmers();
  }

  async function deleteSwimmer(id: number | string, swimmerName: string) {
    const confirmed = window.confirm(`Delete "${swimmerName}"?`);
    if (!confirmed) return;

    setLoading(true);
    setStatus(`Deleting "${swimmerName}"...`);

    const { error } = await supabase.from("swimmers").delete().eq("id", id);

    if (error) {
      console.error("deleteSwimmer error:", error);
      setStatus(`Error deleting swimmer: ${error.message}`);
      setLoading(false);
      return;
    }

    setStatus(`Deleted "${swimmerName}".`);
    await fetchSwimmers();
  }

  async function handleLogout() {
    setStatus("Signing out...");

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("signOut error:", error);
      setStatus(`Logout error: ${error.message}`);
      return;
    }

    router.replace("/login");
  }

  const primarySwimmers = swimmers.filter((s) => s.group_type === "primary");
  const followingSwimmers = swimmers.filter((s) => s.group_type === "following");

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 sm:py-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-white/70">{status}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold sm:text-4xl">Swimmers</h1>

          <div className="flex gap-3">
            <Link
              href="/standards"
              className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              Standards
            </Link>

            <button
              onClick={handleLogout}
              className="rounded-2xl border border-red-400/30 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_160px_120px]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Swimmer name"
              className="h-14 rounded-2xl border border-white/20 bg-black px-4 text-lg text-white placeholder:text-white/35 outline-none"
            />

            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Age"
              inputMode="numeric"
              className="h-14 rounded-2xl border border-white/20 bg-black px-4 text-lg text-white placeholder:text-white/35 outline-none"
            />

            <select
              value={groupType}
              onChange={(e) =>
                setGroupType(e.target.value as "primary" | "following")
              }
              className="h-14 rounded-2xl border border-white/20 bg-black px-4 text-lg text-white outline-none"
            >
              <option value="primary">My Swimmer</option>
              <option value="following">Following</option>
            </select>

            <button
              onClick={addSwimmer}
              disabled={loading}
              className="h-14 rounded-2xl border border-white/20 bg-white/10 text-lg font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>

          <p className="mt-4 text-sm text-white/60">{status}</p>
        </div>

        <section className="space-y-6">
          <div>
            <h2 className="mb-3 text-2xl font-semibold">My Swimmers</h2>

            <div className="space-y-4">
              {primarySwimmers.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white/60">
                  No primary swimmers yet.
                </div>
              ) : (
                primarySwimmers.map((swimmer) => (
                  <div
                    key={swimmer.id}
                    className="rounded-3xl border border-white/10 bg-white/5 p-5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-2xl font-bold">{swimmer.name}</h3>
                        <p className="mt-2 text-white/70">Age: {swimmer.age}</p>
                        <p className="mt-1 text-sm text-white/40">
                          Added: {formatCreatedAt(swimmer.created_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/swimmers/${swimmer.id}`}
                          className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
                        >
                          Open
                        </Link>

                        <button
                          onClick={() =>
                            deleteSwimmer(swimmer.id, swimmer.name)
                          }
                          disabled={loading}
                          className="rounded-2xl border border-red-400/30 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
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

          <div>
            <h2 className="mb-3 text-2xl font-semibold">Following</h2>

            <div className="space-y-4">
              {followingSwimmers.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white/60">
                  No followed swimmers yet.
                </div>
              ) : (
                followingSwimmers.map((swimmer) => (
                  <div
                    key={swimmer.id}
                    className="rounded-3xl border border-white/10 bg-white/5 p-5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-2xl font-bold">{swimmer.name}</h3>
                        <p className="mt-2 text-white/70">Age: {swimmer.age}</p>
                        <p className="mt-1 text-sm text-white/40">
                          Added: {formatCreatedAt(swimmer.created_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/swimmers/${swimmer.id}`}
                          className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
                        >
                          Open
                        </Link>

                        <button
                          onClick={() =>
                            deleteSwimmer(swimmer.id, swimmer.name)
                          }
                          disabled={loading}
                          className="rounded-2xl border border-red-400/30 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
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
        </section>
      </div>
    </main>
  );
}