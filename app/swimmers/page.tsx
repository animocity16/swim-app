"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Swimmer = {
  id: number | string;
  name: string;
  age: number;
  birth_month?: number | null;
  country?: string | null;
  swim_club?: string | null;
  school?: string | null;
  group_type?: "primary" | "following" | string | null;
  created_at?: string | null;
  user_id?: string | null;
};

type SectionProps = {
  title: string;
  swimmers: Swimmer[];
  loading: boolean;
  onDelete: (id: number | string, name: string) => void;
};

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function formatCreatedAt(value?: string | null) {
  if (!value) return "No date available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date available";
  return date.toLocaleString();
}

function formatBirthMonth(value?: number | null) {
  if (!value) return null;
  const found = MONTHS.find((month) => month.value === value);
  return found ? found.label : null;
}

function SwimmerSection({
  title,
  swimmers,
  loading,
  onDelete,
}: SectionProps) {
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
          {swimmers.map((swimmer) => {
            const birthMonthLabel = formatBirthMonth(swimmer.birth_month);

            return (
              <div key={swimmer.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="label">Swimmer</p>
                    <h3 className="mt-2 truncate text-2xl font-bold">
                      {swimmer.name}
                    </h3>
                    <p className="mt-2 text-white/75">Age {swimmer.age}</p>

                    <div className="mt-3 space-y-1 text-sm text-white/55">
                      {birthMonthLabel ? <p>Birth month: {birthMonthLabel}</p> : null}
                      {swimmer.country ? <p>Country: {swimmer.country}</p> : null}
                      {swimmer.swim_club ? <p>Swim club: {swimmer.swim_club}</p> : null}
                      {swimmer.school ? <p>School: {swimmer.school}</p> : null}
                      <p>Added {formatCreatedAt(swimmer.created_at)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-right">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">
                      ID
                    </p>
                    <p className="text-lg font-bold text-emerald-200">
                      {swimmer.id}
                    </p>
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
            );
          })}
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
  const [showAddForm, setShowAddForm] = useState(false);

  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [birthMonth, setBirthMonth] = useState<number | "">("");
  const [country, setCountry] = useState("");
  const [swimClub, setSwimClub] = useState("");
  const [school, setSchool] = useState("");
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

    void initPage();

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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("fetchSwimmers user error:", userError);
      setStatus("You must be logged in.");
      setSwimmers([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("swimmers")
      .select(
        "id, name, age, birth_month, country, swim_club, school, group_type, created_at, user_id"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchSwimmers error:", error);
      setStatus(`Error loading swimmers: ${error.message}`);
      setSwimmers([]);
      setLoading(false);
      return;
    }

    console.log("Fetched swimmers:", data);

    setSwimmers((data as Swimmer[]) || []);
    setStatus("Ready");
    setLoading(false);
  }

  async function addSwimmer() {
    console.log("addSwimmer started");

    const trimmedName = name.trim();
    const parsedAge = Number(age);
    const trimmedCountry = country.trim();
    const trimmedSwimClub = swimClub.trim();
    const trimmedSchool = school.trim();

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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("addSwimmer user error:", userError);
      setStatus("You must be logged in.");
      setLoading(false);
      return;
    }

    const payload = {
      name: trimmedName,
      age: parsedAge,
      birth_month: birthMonth === "" ? null : birthMonth,
      country: trimmedCountry || null,
      swim_club: trimmedSwimClub || null,
      school: trimmedSchool || null,
      group_type: groupType,
      user_id: user.id,
    };

    console.log("Adding swimmer payload:", payload);

    const { data, error } = await supabase
      .from("swimmers")
      .insert([payload])
      .select();

    if (error) {
      console.error("addSwimmer insert error:", error);
      setStatus(`Error adding swimmer: ${error.message}`);
      setLoading(false);
      return;
    }

    console.log("Inserted swimmer:", data);

    setName("");
    setAge("");
    setBirthMonth("");
    setCountry("");
    setSwimClub("");
    setSchool("");
    setGroupType("primary");
    setShowAddForm(false);
    setStatus("Swimmer added.");

    await fetchSwimmers();
  }

  async function deleteSwimmer(id: number | string, swimmerName: string) {
    const confirmed = window.confirm(`Delete "${swimmerName}"?`);
    if (!confirmed) return;

    setLoading(true);
    setStatus(`Deleting "${swimmerName}"...`);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setStatus("You must be logged in.");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("swimmers")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

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
        <section className="card relative mb-6 overflow-hidden">
          <button
            onClick={handleLogout}
            className="absolute right-5 top-5 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/15"
          >
            Logout
          </button>

          <div className="flex items-start justify-between gap-4 pr-24">
            <div>
              <p className="label">Natrix</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight">Progress</h1>
              <p className="mt-2 max-w-md text-white/60">
                Track times, build swimmer profiles, and keep progress in one place.
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-right">
              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">
                Total
              </p>
              <p className="text-3xl font-bold text-emerald-200">
                {swimmers.length}
              </p>
            </div>
          </div>
        </section>

        <section className="card mb-6">
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <p className="label">Add swimmer</p>
              <h2 className="mt-2 text-2xl font-bold">
                {showAddForm ? "Close swimmer form" : "Add swimmer"}
              </h2>
            </div>

            <div className="text-3xl text-white/45">
              {showAddForm ? "−" : "+"}
            </div>
          </button>

          {showAddForm && (
            <div className="mt-5 space-y-3">
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
                value={birthMonth}
                onChange={(e) =>
                  setBirthMonth(e.target.value ? Number(e.target.value) : "")
                }
                className="input"
              >
                <option value="">Birth month (optional)</option>
                {MONTHS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>

              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country (optional)"
                className="input"
              />

              <input
                value={swimClub}
                onChange={(e) => setSwimClub(e.target.value)}
                placeholder="Swim club (optional)"
                className="input"
              />

              <input
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="School (optional)"
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

              <button
                type="button"
                onClick={addSwimmer}
                disabled={loading}
                className="btn-block"
              >
                {loading ? "Saving..." : "Add swimmer"}
              </button>

              <p className="mt-4 text-sm text-white/55">{status}</p>
            </div>
          )}
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