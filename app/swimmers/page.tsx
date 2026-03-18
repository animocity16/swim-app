"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Swimmer = {
  id: string | number;
  name: string;
  age: number;
  birth_year?: number | null;
  group_type?: "primary" | "following" | string | null;
  created_at?: string | null;
};

type GroupKey = "primary" | "following";

function formatCreatedAt(value?: string | null) {
  if (!value) return "No date available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date available";
  return date.toLocaleString();
}

function getGroupLabel(group: GroupKey) {
  return group === "primary" ? "My Swimmers" : "Following";
}

function getEmptyLabel(group: GroupKey) {
  return group === "primary"
    ? "No primary swimmers yet."
    : "No followed swimmers yet.";
}

export default function SwimmersPage() {
  const [status, setStatus] = useState("Ready ✅");
  const [loading, setLoading] = useState(false);

  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [groupType, setGroupType] = useState<GroupKey>("primary");

  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>({
    primary: true,
    following: false,
  });

  const primarySwimmers = useMemo(
    () => swimmers.filter((s) => s.group_type === "primary"),
    [swimmers]
  );

  const followingSwimmers = useMemo(
    () => swimmers.filter((s) => s.group_type === "following"),
    [swimmers]
  );

  async function fetchSwimmers() {
    setLoading(true);
    setStatus("Loading swimmers…");

    const { data, error } = await supabase
      .from("swimmers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(`Fetch failed ❌ ${error.message}`);
      setLoading(false);
      return;
    }

    setSwimmers((data ?? []) as Swimmer[]);
    setStatus("Loaded ✅");
    setLoading(false);
  }

  async function addSwimmer() {
    const trimmedName = name.trim();
    const parsedAge = Number(age);

    if (!trimmedName) {
      alert("Please enter a name 🙂");
      return;
    }

    if (!Number.isFinite(parsedAge) || parsedAge <= 0) {
      alert("Please enter a valid age 🙂");
      return;
    }

    setLoading(true);
    setStatus("Adding swimmer…");

    const { error } = await supabase.from("swimmers").insert([
      {
        name: trimmedName,
        age: parsedAge,
        group_type: groupType,
      },
    ]);

    if (error) {
      alert(`Insert failed ❌ ${error.message}`);
      setStatus("Insert failed ❌");
      setLoading(false);
      return;
    }

    setName("");
    setAge("");
    setGroupType("primary");
    setStatus("Added ✅");
    setLoading(false);

    await fetchSwimmers();
  }

  async function deleteSwimmer(id: string | number, swimmerName: string) {
    const ok = confirm(`Delete ${swimmerName}?`);
    if (!ok) return;

    setLoading(true);
    setStatus("Deleting swimmer…");

    const { error } = await supabase.from("swimmers").delete().eq("id", id);

    if (error) {
      alert(`Delete failed ❌ ${error.message}`);
      setStatus("Delete failed ❌");
      setLoading(false);
      return;
    }

    setStatus("Deleted ✅");
    setLoading(false);

    await fetchSwimmers();
  }

  function toggleGroup(group: GroupKey) {
    setOpenGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  }

  useEffect(() => {
    fetchSwimmers();
  }, []);

  function renderSwimmerGroup(group: GroupKey, items: Swimmer[]) {
    const isOpen = openGroups[group];

    return (
      <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => toggleGroup(group)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <div>
            <h2
              className={`text-xl font-bold ${
                group === "primary" ? "text-sky-700" : "text-gray-800"
              }`}
            >
              {getGroupLabel(group)}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {items.length} swimmer{items.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
            {isOpen ? "Hide" : "Show"}
          </div>
        </button>

        {isOpen ? (
          items.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-500">
              {getEmptyLabel(group)}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {items.map((s) => (
                <div
                  key={String(s.id)}
                  className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/swimmers/${s.id}`}
                      className="min-w-0 flex-1 rounded-2xl transition hover:bg-sky-50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900">
                          {s.name}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          Age {s.age}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            group === "primary"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {group === "primary" ? "My Swimmer" : "Following"}
                        </span>
                      </div>

                      <div className="mt-3 text-sm text-gray-400">No PB yet</div>

                      <div className="mt-2 text-sm text-gray-600">
                        Added: {formatCreatedAt(s.created_at)}
                      </div>

                      <div className="mt-3 text-sm font-semibold text-sky-700">
                        View profile →
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => deleteSwimmer(s.id, s.name)}
                      className="shrink-0 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 active:scale-[0.98]"
                      aria-label={`Delete ${s.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <header className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-sky-700">
                Swimmers
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Manage your swimmer list and open each profile from here.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-right">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Status
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {status} {loading ? "⏳" : ""}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-sky-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-sky-700">
                Total
              </div>
              <div className="mt-1 text-2xl font-bold text-sky-900">
                {swimmers.length}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3 ring-1 ring-gray-200">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                My Swimmers
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900">
                {primarySwimmers.length}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3 ring-1 ring-gray-200">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Following
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900">
                {followingSwimmers.length}
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Add Swimmer</h2>
          <p className="mt-1 text-sm text-gray-500">
            Add your own swimmer or someone you want to follow.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-sky-500"
            />

            <input
              type="number"
              placeholder="Age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-sky-500"
            />

            <select
              value={groupType}
              onChange={(e) => setGroupType(e.target.value as GroupKey)}
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-sky-500"
            >
              <option value="primary">My Swimmer</option>
              <option value="following">Following</option>
            </select>
          </div>

          <button
            type="button"
            onClick={addSwimmer}
            className="mt-4 w-full rounded-2xl bg-sky-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-sky-700 active:scale-[0.99]"
          >
            Add Swimmer
          </button>
        </section>

        <div className="space-y-4">
          {renderSwimmerGroup("primary", primarySwimmers)}
          {renderSwimmerGroup("following", followingSwimmers)}
        </div>
      </div>
    </main>
  );
}