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
  squad?: string | null;
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

function avatarColor(index: number) { return AVATAR_COLORS[index % AVATAR_COLORS.length]; }
function getInitials(name: string) { return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(); }
function raceAgeFromBirthYear(birthYear: number): number { return new Date().getFullYear() - birthYear; }

type FilterMode = "all" | "club" | "school";

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 animate-pulse">
      <div className="h-12 w-12 flex-shrink-0 rounded-2xl bg-white/10" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 rounded-full bg-white/10" />
        <div className="h-3 w-1/2 rounded-full bg-white/5" />
      </div>
    </div>
  );
}

export default function SwimmersPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [status, setStatus]           = useState("");
  const [loading, setLoading]         = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [swimmers, setSwimmers]       = useState<Swimmer[]>([]);

  // Flat filter — mirrors the demo: one row of chips, All + every club + every school
  const [filterMode, setFilterMode]   = useState<FilterMode>("all");
  const [filterValue, setFilterValue] = useState<string | null>(null);

  // Add form state
  const [name, setName]               = useState("");
  const [birthYear, setBirthYear]     = useState("");
  const [birthMonth, setBirthMonth]   = useState<number | "">("");
  const [country, setCountry]         = useState("");
  const [swimClub, setSwimClub]       = useState("");
  const [school, setSchool]           = useState("");
  const [gender, setGender]           = useState<"Male" | "Female" | "">("");
  const [groupType, setGroupType]     = useState<"primary" | "following">("primary");

  const currentYear = new Date().getFullYear();
  const parsedBirthYear = Number(birthYear);
  const previewRaceAge =
    birthYear.length === 4 &&
    !Number.isNaN(parsedBirthYear) &&
    parsedBirthYear > 2000 &&
    parsedBirthYear <= currentYear
      ? raceAgeFromBirthYear(parsedBirthYear)
      : null;

  useEffect(() => {
    let mounted = true;

    async function initPage() {
      const sessionPromise = supabase.auth.getSession();
      const dataPromise = supabase
        .from("swimmers")
        .select("id, name, age, birth_month, country, swim_club, school, gender, squad, group_type, created_at, user_id")
        .order("name", { ascending: true });

      const { data: { session } } = await sessionPromise;
      if (!mounted) return;
      if (!session) { router.replace("/login"); return; }

      setAuthChecked(true);

      const { data, error } = await dataPromise;
      if (!mounted) return;
      if (error) setStatus(`Error: ${error.message}`);
      else setSwimmers((data as Swimmer[]) || []);
      setLoading(false);
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
      .select("id, name, age, birth_month, country, swim_club, school, gender, squad, group_type, created_at, user_id")
      .order("name", { ascending: true });

    if (error) { setStatus(`Error: ${error.message}`); }
    else { setSwimmers((data as Swimmer[]) || []); }
    setLoading(false);
  }

  async function addSwimmer() {
    const trimmedName = name.trim();
    if (!trimmedName) { setStatus("Please enter swimmer name."); return; }
    if (
      !birthYear ||
      birthYear.length !== 4 ||
      Number.isNaN(parsedBirthYear) ||
      parsedBirthYear < 2000 ||
      parsedBirthYear > currentYear
    ) {
      setStatus("Please enter a valid 4-digit birth year e.g. 2013");
      return;
    }

    const age = raceAgeFromBirthYear(parsedBirthYear);
    setLoading(true);
    setStatus("Adding...");

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) { setStatus("You must be logged in."); setLoading(false); return; }

    const { error } = await supabase.from("swimmers").insert([{
      name: trimmedName,
      age,
      birth_month: birthMonth === "" ? null : birthMonth,
      country: country.trim() || null,
      swim_club: swimClub.trim() || null,
      school: school.trim() || null,
      gender: gender || null,
      group_type: groupType,
      user_id: user.id,
    }]).select();

    if (error) { setStatus(`Error: ${error.message}`); setLoading(false); return; }

    setName(""); setBirthYear(""); setBirthMonth(""); setCountry("");
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

  function selectFilter(mode: FilterMode, value: string | null) {
    setFilterMode(mode);
    setFilterValue(value);
  }

  const primarySwimmers   = swimmers.filter((s) => s.group_type === "primary");
  const followingSwimmers = swimmers.filter((s) => s.group_type === "following");

  const clubs = useMemo(() => {
    const set = new Set<string>();
    for (const s of followingSwimmers) if (s.swim_club?.trim()) set.add(s.swim_club.trim());
    return Array.from(set).sort();
  }, [followingSwimmers]);

  const schools = useMemo(() => {
    const set = new Set<string>();
    for (const s of followingSwimmers) if (s.school?.trim()) set.add(s.school.trim());
    return Array.from(set).sort();
  }, [followingSwimmers]);

  const filteredFollowing = useMemo(() => {
    if (filterMode === "club" && filterValue) {
      return followingSwimmers.filter((s) => s.swim_club?.trim() === filterValue);
    }
    if (filterMode === "school" && filterValue) {
      return followingSwimmers.filter((s) => s.school?.trim() === filterValue);
    }
    return followingSwimmers;
  }, [followingSwimmers, filterMode, filterValue]);

  // Show skeleton while auth/data loads
  if (!authChecked || loading) {
    return (
      <div className="shell">
        <div className="container-app space-y-5">
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Swimmers</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Brood</h1>
            </div>
            <div className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5" />
          </div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">My swimmers</p>
          <SkeletonCard />
          <SkeletonCard />
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 mt-4">Following</p>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
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
          <button type="button" onClick={() => setShowAddForm((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl text-white transition hover:bg-white/10">
            {showAddForm ? "×" : "+"}
          </button>
        </div>

        {/* Add swimmer form */}
        {showAddForm && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-3">
            <h2 className="text-lg font-semibold text-white">Add swimmer</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="input" />

            <div>
              <input
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Year of birth e.g. 2013"
                inputMode="numeric"
                className="input"
              />
              {previewRaceAge !== null && previewRaceAge > 0 && previewRaceAge < 30 && (
                <p className="mt-1.5 text-xs font-medium px-1" style={{ color: "#FDE68A" }}>
                  ✓ Race age this year: {previewRaceAge}
                </p>
              )}
              {birthYear.length === 4 && (previewRaceAge === null || previewRaceAge <= 0 || previewRaceAge >= 30) && (
                <p className="mt-1.5 text-xs text-red-300 px-1">Please enter a valid birth year</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["Male", "Female"] as const).map((g) => (
                <button key={g} type="button" onClick={() => setGender(g)}
                  className="rounded-2xl border py-2.5 text-sm font-medium transition"
                  style={gender === g
                    ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
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
                      style={{
                        background: index === 0 ? `var(--natrix-avatar-colour, ${colors.bg})` : colors.bg,
                        color: index === 0 ? `var(--natrix-avatar-text, ${colors.text})` : colors.text,
                      }}>
                      {getInitials(swimmer.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-white">{swimmer.name}</p>
                      <p className="mt-0.5 text-sm text-white/40">
                        Age {swimmer.age}
                        {swimmer.gender ? ` · ${swimmer.gender}` : ""}
                        {swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
                      </p>
                      {swimmer.squad && (
                        <span className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.25)", color: "#FDE68A" }}>
                          {swimmer.squad} Squad
                        </span>
                      )}
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

        {/* Following — flat filter chips (All / each club / each school), then a flat list */}
        {followingSwimmers.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">
              Following ({followingSwimmers.length})
            </p>

            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => selectFilter("all", null)}
                  className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                  style={filterMode === "all"
                    ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
                  All
                </button>
              </div>

              {clubs.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 mb-1.5 px-1">Club</p>
                  <div className="flex flex-wrap gap-2">
                    {clubs.map((club) => (
                      <button key={club} type="button" onClick={() => selectFilter("club", club)}
                        className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                        style={filterMode === "club" && filterValue === club
                          ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                          : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
                        {club}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {schools.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 mb-1.5 px-1">School</p>
                  <div className="flex flex-wrap gap-2">
                    {schools.map((school) => (
                      <button key={school} type="button" onClick={() => selectFilter("school", school)}
                        className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                        style={filterMode === "school" && filterValue === school
                          ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                          : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
                        {school}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {filteredFollowing.length === 0 ? (
              <p className="text-sm text-white/40 px-1">No swimmers match this filter.</p>
            ) : (
              <div className="space-y-3">
                {filteredFollowing.map((swimmer, index) => {
                  const colors = avatarColor(primarySwimmers.length + index);
                  return (
                    <div key={swimmer.id}
                      className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
                      <Link href={`/swimmers/${swimmer.id}`} className="flex flex-1 items-center gap-4 min-w-0">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold"
                          style={{ background: colors.bg, color: colors.text }}>
                          {getInitials(swimmer.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-white">{swimmer.name}</p>
                          <p className="mt-0.5 text-sm text-white/40">
                            Age {swimmer.age}
                            {swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
                          </p>
                          {swimmer.school && (
                            <p className="mt-0.5 text-xs text-white/30 truncate">{swimmer.school}</p>
                          )}
                        </div>
                      </Link>
                      <button type="button" onClick={() => void deleteSwimmer(swimmer.id, swimmer.name)}
                        className="flex-shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-500/20">
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
