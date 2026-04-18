"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
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
  gender?: string | null;
  group_type?: "primary" | "following" | string | null;
  created_at?: string | null;
  user_id?: string | null;
};

const MONTHS = [
  { value: 1, label: "January" }, { value: 2, label: "February" },
  { value: 3, label: "March" }, { value: 4, label: "April" },
  { value: 5, label: "May" }, { value: 6, label: "June" },
  { value: 7, label: "July" }, { value: 8, label: "August" },
  { value: 9, label: "September" }, { value: 10, label: "October" },
  { value: 11, label: "November" }, { value: 12, label: "December" },
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

// Assign a stable color per group name
function groupColor(groupName: string) {
  let hash = 0;
  for (let i = 0; i < groupName.length; i++) hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function SwimmersPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]);

  // Group toggle: club or school
  const [groupBy, setGroupBy] = useState<"club" | "school">("club");
  // Track which groups are expanded — all open by default
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Add form state
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [birthMonth, setBirthMonth] = useState<number | "">("");
  const [country, setCountry] = useState("");
  const [swimClub, setSwimClub] = useState("");
  const [school, setSchool] = useState("");
  const [gender, setGender] = useState<"Male" | "Female" | "">("");
  const [groupType, setGroupType] = useState<"primary" | "following">("primary");

  useEffect(() => {
    let mounted = true;
    async function initPage() {
      let session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        await new Promise(r => setTimeout(r, 800));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (!mounted) return;
      if (!session) { router.replace("/login"); return; }
      setAuthChecked(true);
      await fetchSwimmers();
    }
    void initPage();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [router]);

  async function fetchSwimmers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("swimmers")
      .select("id, name, age, birth_month, country, swim_club, school, gender, group_type, created_at, user_id")
      .order("name", { ascending: true });

    if (error) { setStatus(`Error: ${error.message}`); }
    else {
      const rows = (data as Swimmer[]) || [];
      setSwimmers(rows);
      // Auto-expand all groups on first load
      const following = rows.filter((s) => s.group_type === "following");
      const groups: Record<string, boolean> = {};
      following.forEach((s) => {
        const key = (groupBy === "club" ? s.swim_club : s.school) || "Other";
        groups[key] = false;
      });
      setExpandedGroups(groups);
    }
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
      gender: gender || null,
      group_type: groupType,
      user_id: user.id,
    }]).select();

    if (error) { setStatus(`Error: ${error.message}`); setLoading(false); return; }

    setName(""); setAge(""); setBirthMonth(""); setCountry("");
    setSwimClub(""); setSchool(""); setGender(""); setGroupType("primary");
    setShowAddForm(false);
    setStatus("Swimmer added.");
    await fetchSwimmers();
  }

  async function deleteSwimmer(id: number | string, swimmerName: string) {
    const confirmed = window.confirm(`Remove "${swimmerName}" from Following?`);
    if (!confirmed) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("Not logged in."); setLoading(false); return; }
    const { error } = await supabase.from("swimmers").delete().eq("id", id).eq("user_id", user.id);
    if (error) { setStatus(`Error: ${error.message}`); }
    else { setStatus("Removed."); }
    await fetchSwimmers();
  }

  function toggleGroup(groupName: string) {
    setExpandedGroups((prev) => ({ ...prev, [groupName]: prev[groupName] === true ? false : false }));
  }

  const primarySwimmers = swimmers.filter((s) => s.group_type === "primary");
  const followingSwimmers = swimmers.filter((s) => s.group_type === "following");

  // Group following swimmers by club or school
  const followingGroups = useMemo(() => {
    const map = new Map<string, Swimmer[]>();
    for (const s of followingSwimmers) {
      const key = (groupBy === "club" ? s.swim_club?.trim() : s.school?.trim()) || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    // Sort: alphabetical, but "Other" always last
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
      });
  }, [followingSwimmers, groupBy]);

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
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Swimmers</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Brood</h1>
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
            <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Race Age" inputMode="numeric" className="input" />

            <div className="grid grid-cols-2 gap-2">
              {(["Male", "Female"] as const).map((g) => (
                <button key={g} type="button" onClick={() => setGender(g)}
                  className="rounded-2xl border py-2.5 text-sm font-medium transition"
                  style={gender === g
                    ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
                >
                  {g === "Male" ? "♂ Male" : "♀ Female"}
                </button>
              ))}
            </div>
            {!gender && <p className="text-[10px] text-white/30 -mt-1">Gender is used for qualifying standards matching</p>}

            <select value={birthMonth} onChange={(e) => setBirthMonth(e.target.value ? Number(e.target.value) : "")} className="input">
              <option value="">Birth month (optional)</option>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country (optional)" className="input" />
            <input value={swimClub} onChange={(e) => setSwimClub(e.target.value)} placeholder="Swim club (optional)" className="input" />
            <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="School (optional)" className="input" />
            <select value={groupType} onChange={(e) => setGroupType(e.target.value as "primary" | "following")} className="input">
              <option value="primary">My Swimmer</option>
              <option value="following">Following</option>
            </select>

            {status ? <p className="text-sm text-white/50">{status}</p> : null}

            <button type="button" onClick={addSwimmer} disabled={loading}
              className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: "#D97706" }}>
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
                  <Link key={swimmer.id} href={`/swimmers/${swimmer.id}`}
                    className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold"
                      style={{ background: colors.bg, color: colors.text }}>
                      {getInitials(swimmer.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-white">{swimmer.name}</p>
                      <p className="mt-0.5 text-sm text-white/40">
                        Age {swimmer.age}
                        {swimmer.gender ? ` · ${swimmer.gender}` : ""}
                        {swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
                      </p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-white/20">
                      <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

        {/* Following — grouped & collapsible */}
        {followingSwimmers.length > 0 && (
          <div className="space-y-3">

            {/* Following header + group toggle */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
                Following · {followingSwimmers.length}
              </p>
              <div className="flex rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                <button
                  type="button"
                  onClick={() => setGroupBy("club")}
                  className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition"
                  style={groupBy === "club"
                    ? { background: "rgba(217,119,6,0.2)", color: "#FDE68A" }
                    : { background: "transparent", color: "rgba(255,255,255,0.35)" }}
                >
                  Club
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBy("school")}
                  className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition"
                  style={groupBy === "school"
                    ? { background: "rgba(217,119,6,0.2)", color: "#FDE68A" }
                    : { background: "transparent", color: "rgba(255,255,255,0.35)" }}
                >
                  School
                </button>
              </div>
            </div>

            {/* Group cards */}
            {followingGroups.map(([groupName, groupSwimmers]) => {
                const isOpen = expandedGroups[groupName] === true;
              const colors = groupColor(groupName);

              return (
                <div key={groupName} className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">

                  {/* Group header — tap to expand/collapse */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupName)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-[10px] font-bold"
                        style={{ background: colors.bg, color: colors.text }}
                      >
                        {groupName.slice(0, 3).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{groupName}</p>
                        <p className="text-xs text-white/40">{groupSwimmers.length} swimmer{groupSwimmers.length === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <svg
                      width="16" height="16" viewBox="0 0 16 16" fill="none"
                      className={`text-white/30 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* Swimmer rows */}
                  {isOpen && (
                    <div className="border-t border-white/8">
                      {groupSwimmers.map((swimmer, index) => (
                        <div
                          key={swimmer.id}
                          className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/5"
                          style={{ borderBottom: index < groupSwimmers.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
                        >
                          <Link
                            href={`/swimmers/${swimmer.id}`}
                            className="flex flex-1 items-center gap-3 min-w-0"
                          >
                            <div
                              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold opacity-80"
                              style={{ background: colors.bg, color: colors.text }}
                            >
                              {getInitials(swimmer.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white/80">{swimmer.name}</p>
                              <p className="text-xs text-white/35">
                                Age {swimmer.age}
                                {swimmer.gender ? ` · ${swimmer.gender}` : ""}
                                {groupBy === "club" && swimmer.school ? ` · ${swimmer.school}` : ""}
                                {groupBy === "school" && swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
                              </p>
                            </div>
                          </Link>
                          <button
                            type="button"
                            onClick={() => void deleteSwimmer(swimmer.id, swimmer.name)}
                            className="flex-shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}