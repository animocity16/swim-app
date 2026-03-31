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

type SectionProps = {
  title: string;
  swimmers: Swimmer[];
  loading: boolean;
  onDelete: (id: number | string, name: string) => void;
};

function SwimmerSection({ title, swimmers, loading, onDelete }: SectionProps) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
          {swimmers.length}
        </span>
      </div>

      {swimmers.length === 0 ? (
        <div className="card">
          <p className="muted">No swimmers here yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {swimmers.map((swimmer) => (
            <div key={swimmer.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="label">Swimmer</p>
                  <h3 className="mt-2 truncate text-2xl font-bold">{swimmer.name}</h3>
                  <p className="mt-2 text-white/75">Age {swimmer.age}</p>
                  <p className="mt-1 text-sm text-white/45">
                    Added {formatCreatedAt(swimmer.created_at)}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-right">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">
                    ID
                  </p>
                  <p className="text-lg font-bold text-emerald-200">{swimmer.id}</p>
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <Link href={`/swimmers/${swimmer.id}`} className="btn-outline">
                  Open
                </Link>

                <button
                  onClick={() => onDelete(swimmer.id, swimmer.name)}
                  disabled={loading}
                  className="btn-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
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
      setStatus(`Logout error: ${error.message}`);
      return;
    }

    router.replace("/login");
  }

  const primarySwimmers = swimmers.filter((s) => s.group_type === "primary");
  const followingSwimmers = swimmers.filter((s) => s.group_type === "following");

  if (!authChecked) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="muted">{status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app">
        <section className="card mb-6 overflow-hidden">
          <div className="absolute pointer-events-none" />

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label">Swimio</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight">Swimmers</h1>
              <p className="mt-2 max-w-xs text-white/60">
                Track swimmers, compare progress, and keep everything clean in one place.
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-right">
              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">
                Total
              </p>
              <p className="text-3xl font-bold text-emerald-200">{swimmers.length}</p>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <Link href="/standards" className="btn-outline">
              Standards
            </Link>

            <button onClick={handleLogout} className="btn-danger">
              Logout
            </button>
          </div>
        </section>

        <section className="card mb-6">
          <div className="mb-4">
            <p className="label">Add swimmer</p>
            <h2 className="mt-2 text-2xl font-bold">New entry</h2>
          </div>

          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Swimmer name"
              className="input"
            />

            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Age"
              inputMode="numeric"
              className="input"
            />

            <select
              value={groupType}
              onChange={(e) => setGroupType(e.target.value as "primary" | "following")}
              className="input"
            >
              <option value="primary">My Swimmer</option>
              <option value="following">Following</option>
            </select>

            <button onClick={addSwimmer} disabled={loading} className="btn-block">
              Add swimmer
            </button>
          </div>

          <p className="mt-4 text-sm text-white/55">{status}</p>
        </section>

        <SwimmerSection
          title="My Swimmers"
          swimmers={primarySwimmers}
          loading={loading}
          onDelete={deleteSwimmer}
        />

        <SwimmerSection
          title="Following"
          swimmers={followingSwimmers}
          loading={loading}
          onDelete={deleteSwimmer}
        />
      </div>
    </div>
  );
}