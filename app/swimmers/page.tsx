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

const AVATAR_COLORS = [
  { bg: "#0F6E56", text: "#9FE1CB" },
  { bg: "#185FA5", text: "#B5D4F4" },
  { bg: "#854F0B", text: "#FAC775" },
  { bg: "#72243E", text: "#F4C0D1" },
  { bg: "#3C3489", text: "#CECBF6" },
];

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function SwimmersPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [status, setStatus] = useState("");
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
      if (error || !data.session) { router.replace("/login"); return; }
      setAuthChecked(true);
      await fetchSwimmers();
    }
    void initPage();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [router]);

  async function fetchSwimmers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("swimmers")
      .select("id, name, age, birth_month, country, swim_club, school, group_type, created_at, user_id")
      .order("name", { ascending: true });

    if (error) { setStatus(`Error: ${error.message}`); }
    else { setSwimmers((data as Swimmer[]) || []); }
    setLoading(false);
  }

  async function addSwimmer() {
    const trimmedName = name.trim();
    const parsedAge = Number(age);

    if (!trimmedName) { setStatus("Please enter swimmer name."); return; }
    if (!age || Number.isNaN(parsedAge) || parsedAge <= 0) { setStatus("Please enter a valid age."); return; }

    setLoading(true);
    setStatus("Adding...");

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) { setStatus("You must be logged in."); setLoading(false); return; }

    const { error } = await supabase.from("swimmers").insert([{
      name: trimmedName,
      age: parsedAge,
      birth_month: birthMonth === "" ? null : birthMonth,
      country: country.trim() || null,
      swim_club: swimClub.trim() || null,
      school: school.trim() || null,
      group_type: groupType,
      user_id: user.id,
    }]).select();

    if (error) { setStatus(`Error: ${error.message}`); setLoading(false); return; }

    setName(""); setAge(""); setBirthMonth(""); setCountry("");
    setSwimClub(""); setSchool(""); setGroupType("primary");
    setShowAddForm(false);
    setStatus("Swimmer added.");
    await fetchSwimmers();
  }

  async function deleteSwimmer(id: number | string, swimmerName: string) {
    const confirmed = window.confirm(`Delete "${swimmerName}"?`);
    if (!confirmed) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("Not logged in."); setLoading(false); return; }

    const { error } = await supabase.from("swimmers").delete().eq("id", id).eq("user_id", user.id);
    if (error) { setStatus(`Error: ${error.message}`); }
    else { setStatus("Deleted."); }
    await fetchSwimmers();
  }

  const primarySwimmers = swimmers.filter((s) => s.group_type === "primary");
  const followingSwimmers = swimmers.filter((s) => s.group_type === "following");

  if (!authChecked) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
              Swimmers
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
              Brood
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl text-white transition hover:bg-white/10"
          >
            {showAddForm ? "×" : "+"}
          </button>
        </div>

        {/* Add swimmer form */}
        {showAddForm && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-3">
            <h2 className="text-lg font-semibold text-white">Add swimmer</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="input" />
            <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" inputMode="numeric" className="input" />
            <select value={birthMonth} onChange={(e) => setBirthMonth(e.target.value ? Number(e.target.value) : "")} className="input">
              <option value="">Birth month (optional)</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country (optional)" className="input" />
            <input value={swimClub} onChange={(e) => setSwimClub(e.target.value)} placeholder="Swim club (optional)" className="input" />
            <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="School (optional)" className="input" />
            <select value={groupType} onChange={(e) => setGroupType(e.target.value as "primary" | "following")} className="input">
              <option value="primary">My Swimmer</option>
              <option value="following">Following</option>
            </select>

            {status ? <p className="text-sm text-white/50">{status}</p> : null}

            {/* ✅ Fixed: was bg-emerald-500, now amber */}
            <button
              type="button"
              onClick={addSwimmer}
              disabled={loading}
              className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: "#D97706" }}
            >
              {loading ? "Adding..." : "Add swimmer"}
            </button>
          </div>
        )}

        {/* My Swimmers */}
        {primarySwimmers.length > 0 && (
          <div>
            <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/30">My swimmers</p>
            <div className="space-y-3">
              {primarySwimmers.map((swimmer, index) => {
                const colors = avatarColor(index);
                return (
                  <Link
                    key={swimmer.id}
                    href={`/swimmers/${swimmer.id}`}
                    className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                  >
                    <div
                      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold"
                      style={{ background: colors.bg, color: colors.text }}
                    >
                      {getInitials(swimmer.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-white">{swimmer.name}</p>
                      <p className="mt-0.5 text-sm text-white/40">
                        Age {swimmer.age}{swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
                      </p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-white/20">
                      <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {primarySwimmers.length === 0 && !showAddForm && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-base font-semibold text-white">No swimmers yet</p>
            <p className="mt-1 text-sm text-white/40">Tap + to add your first swimmer.</p>
          </div>
        )}

        {/* Following swimmers */}
        {followingSwimmers.length > 0 && (
          <div>
            <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/30">Following</p>
            <div className="space-y-3">
              {followingSwimmers.map((swimmer, index) => {
                const colors = avatarColor(primarySwimmers.length + index);
                return (
                  <Link
                    key={swimmer.id}
                    href={`/swimmers/${swimmer.id}`}
                    className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                  >
                    <div
                      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold opacity-70"
                      style={{ background: colors.bg, color: colors.text }}
                    >
                      {getInitials(swimmer.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-white/70">{swimmer.name}</p>
                      <p className="mt-0.5 text-sm text-white/30">
                        Age {swimmer.age}{swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); void deleteSwimmer(swimmer.id, swimmer.name); }}
                      className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}