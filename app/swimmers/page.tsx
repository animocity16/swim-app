"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PendingMatchesBanner from "@/app/components/PendingMatchesBanner";

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
  const [clubSectionOpen, setClubSectionOpen] = useState(false);
  const [schoolSectionOpen, setSchoolSectionOpen] = useState(false);

  // Following list is collapsed by default so it doesn't turn the page into
  // one long scroll — tap the "Following" header to expand it.
  const [followingOpen, setFollowingOpen] = useState(false);

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
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Swimmers</h1>
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

        {/* Branded header */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <div className="text-[28px] font-black tracking-[0.08em] text-white">NATRIX</div>
            <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.24em] text-sky-200/50">
              Track · Improve · Belong
            </div>
            <div className="mt-5">
              <h1 className="text-3xl font-bold tracking-tight text-white">Swimmers</h1>
              <p className="mt-1 text-sm text-white/45">Manage and follow your swimmers.</p>
            </div>
          </div>

          <img
            src="/natrix-mascot-search.png"
            alt="Natrix"
            className="h-[72px] w-[72px] object-contain"
          />
        </div>

        <PendingMatchesBanner />

        {/* Add swimmer form */}
        {showAddForm && (
          <div
            className="rounded-[28px] p-5 space-y-3"
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(255,255,255,0.9)",
              boxShadow: "0 16px 34px rgba(0,25,55,0.14)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#168AE8" }}>
                  Add swimmer
                </p>
                <h2 className="mt-1 text-xl font-bold" style={{ color: "#0B2A54" }}>
                  Create or follow a swimmer
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                style={{ background: "#EEF5FA", color: "#52708D" }}
              >
                ×
              </button>
            </div>

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
                <p className="mt-1.5 px-1 text-xs font-medium" style={{ color: "#168AE8" }}>
                  ✓ Race age this year: {previewRaceAge}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["Male", "Female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className="rounded-2xl border py-2.5 text-sm font-medium transition"
                  style={
                    gender === g
                      ? { background: "#E7F4FE", border: "1px solid #A8D7F8", color: "#0B63A5" }
                      : { background: "#F7FAFC", border: "1px solid #DFEAF2", color: "#71859A" }
                  }
                >
                  {g === "Male" ? "♂ Male" : "♀ Female"}
                </button>
              ))}
            </div>

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

            {status ? <p className="text-sm" style={{ color: "#71859A" }}>{status}</p> : null}

            <button
              type="button"
              onClick={addSwimmer}
              disabled={loading}
              className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition disabled:opacity-50"
              style={{ background: "linear-gradient(90deg,#2AA4F4,#168AE8)" }}
            >
              {loading ? "Adding..." : "Add swimmer"}
            </button>
          </div>
        )}

        {/* Featured active swimmer */}
        {primarySwimmers.length > 0 && (() => {
          const swimmer = primarySwimmers[0];
          const colors = avatarColor(0);
          return (
            <section
              className="overflow-hidden rounded-[30px]"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.99) 0%, rgba(230,245,255,0.98) 100%)",
                border: "1px solid rgba(255,255,255,0.92)",
                boxShadow: "0 18px 42px rgba(0,25,55,0.16)",
              }}
            >
              <div className="relative p-5">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full" style={{ background: "rgba(48,158,246,0.08)" }} />
                <div className="relative flex items-center gap-4">
                  <div
                    className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold"
                    style={{
                      background: `var(--natrix-avatar-colour, ${colors.bg})`,
                      color: `var(--natrix-avatar-text, ${colors.text})`,
                      border: "4px solid rgba(255,255,255,0.9)",
                    }}
                  >
                    {getInitials(swimmer.name)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "#168AE8" }}>
                      Primary swimmer
                    </div>
                    <h2 className="mt-1 truncate text-2xl font-bold" style={{ color: "#0B2A54" }}>
                      {swimmer.name}
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: "#60758B" }}>
                      Age {swimmer.age}{swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "#1F9D68" }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: "#22C55E" }} />
                      Linked and tracking progress
                    </div>
                  </div>
                </div>

                <Link
                  href={`/swimmers/${swimmer.id}`}
                  className="mt-5 flex items-center justify-between rounded-2xl px-4 py-3.5 font-semibold text-white"
                  style={{ background: "linear-gradient(90deg,#2AA4F4,#168AE8)" }}
                >
                  <span>View full profile</span>
                  <span>›</span>
                </Link>
              </div>
            </section>
          );
        })()}

        {/* My swimmers */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              My swimmers
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="text-[10px] font-bold uppercase tracking-wide text-sky-200/75"
            >
              + Add swimmer
            </button>
          </div>

          {primarySwimmers.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {primarySwimmers.map((swimmer, index) => {
                const colors = avatarColor(index);
                return (
                  <Link
                    key={swimmer.id}
                    href={`/swimmers/${swimmer.id}`}
                    className="rounded-[24px] p-4 transition active:scale-[0.98]"
                    style={{
                      background: "rgba(255,255,255,0.96)",
                      border: index === 0 ? "2px solid #3AAAF4" : "1px solid rgba(255,255,255,0.9)",
                      boxShadow: "0 10px 24px rgba(0,25,55,0.10)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold"
                        style={{ background: colors.bg, color: colors.text }}
                      >
                        {getInitials(swimmer.name)}
                      </div>
                      {index === 0 && (
                        <span
                          className="rounded-full px-2 py-1 text-[9px] font-bold"
                          style={{ background: "#168AE8", color: "white" }}
                        >
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="mt-3 truncate text-sm font-bold" style={{ color: "#0B2A54" }}>
                      {swimmer.name}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "#71859A" }}>
                      Age {swimmer.age}
                    </div>
                    {swimmer.swim_club && (
                      <div className="mt-1 truncate text-[10px]" style={{ color: "#71859A" }}>
                        {swimmer.swim_club}
                      </div>
                    )}
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="rounded-[24px] border border-dashed p-4 text-left transition active:scale-[0.98]"
                style={{
                  background: "rgba(255,255,255,0.90)",
                  borderColor: "#BFD8E8",
                }}
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                  style={{ background: "#E8F4FD", color: "#168AE8" }}
                >
                  +
                </div>
                <div className="mt-3 text-sm font-bold" style={{ color: "#0B2A54" }}>Add swimmer</div>
                <div className="mt-1 text-[10px]" style={{ color: "#71859A" }}>Link a new swimmer</div>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="w-full rounded-[28px] p-7 text-center"
              style={{ background: "rgba(255,255,255,0.94)", border: "1px solid rgba(255,255,255,0.88)" }}
            >
              <div className="text-base font-bold" style={{ color: "#0B2A54" }}>Add your first swimmer</div>
              <div className="mt-1 text-sm" style={{ color: "#71859A" }}>Start tracking results and progress.</div>
            </button>
          )}
        </section>

        {/* Following */}
        {followingSwimmers.length > 0 && (
          <section className="space-y-3">
            <button
              type="button"
              onClick={() => setFollowingOpen((v) => !v)}
              className="flex w-full items-center justify-between px-1"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                Following ({followingSwimmers.length})
              </span>
              <span className="text-sm text-white/35">{followingOpen ? "⌃" : "⌄"}</span>
            </button>

            {followingOpen && (
              <>
                {(clubs.length > 0 || schools.length > 0) && (
                  <div className="space-y-3">
                    <div
                      className="grid grid-cols-3 gap-1.5 rounded-2xl p-1.5"
                      style={{
                        background: "rgba(0,0,0,0.14)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => selectFilter("all", null)}
                        className="rounded-xl px-3 py-2 text-xs font-semibold transition"
                        style={
                          filterMode === "all"
                            ? { background: "#168AE8", color: "white" }
                            : { background: "transparent", color: "rgba(255,255,255,0.55)" }
                        }
                      >
                        All
                      </button>

                      <button
                        type="button"
                        onClick={() => selectFilter("club", null)}
                        disabled={clubs.length === 0}
                        className="rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-30"
                        style={
                          filterMode === "club"
                            ? { background: "#168AE8", color: "white" }
                            : { background: "transparent", color: "rgba(255,255,255,0.55)" }
                        }
                      >
                        Club
                      </button>

                      <button
                        type="button"
                        onClick={() => selectFilter("school", null)}
                        disabled={schools.length === 0}
                        className="rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-30"
                        style={
                          filterMode === "school"
                            ? { background: "#168AE8", color: "white" }
                            : { background: "transparent", color: "rgba(255,255,255,0.55)" }
                        }
                      >
                        School
                      </button>
                    </div>

                    {filterMode === "club" && (
                      <div className="flex flex-wrap gap-2">
                        {clubs.map((club) => (
                          <button
                            key={club}
                            type="button"
                            onClick={() => selectFilter("club", club)}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold"
                            style={
                              filterValue === club
                                ? { background: "#168AE8", color: "white" }
                                : { background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.6)" }
                            }
                          >
                            {club}
                          </button>
                        ))}
                      </div>
                    )}

                    {filterMode === "school" && (
                      <div className="flex flex-wrap gap-2">
                        {schools.map((schoolName) => (
                          <button
                            key={schoolName}
                            type="button"
                            onClick={() => selectFilter("school", schoolName)}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold"
                            style={
                              filterValue === schoolName
                                ? { background: "#168AE8", color: "white" }
                                : { background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.6)" }
                            }
                          >
                            {schoolName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {filteredFollowing.map((swimmer, index) => {
                    const colors = avatarColor(primarySwimmers.length + index);
                    return (
                      <div
                        key={swimmer.id}
                        className="rounded-[24px] p-4"
                        style={{
                          background: "rgba(255,255,255,0.96)",
                          border: "1px solid rgba(255,255,255,0.9)",
                          boxShadow: "0 10px 24px rgba(0,25,55,0.10)",
                        }}
                      >
                        <Link href={`/swimmers/${swimmer.id}`} className="block">
                          <div
                            className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold"
                            style={{ background: colors.bg, color: colors.text }}
                          >
                            {getInitials(swimmer.name)}
                          </div>
                          <div className="mt-3 truncate text-sm font-bold" style={{ color: "#0B2A54" }}>
                            {swimmer.name}
                          </div>
                          <div className="mt-1 text-xs" style={{ color: "#71859A" }}>Age {swimmer.age}</div>
                          {swimmer.swim_club && (
                            <div className="mt-1 truncate text-[10px]" style={{ color: "#71859A" }}>
                              {swimmer.swim_club}
                            </div>
                          )}
                        </Link>

                        <button
                          type="button"
                          onClick={() => void deleteSwimmer(swimmer.id, swimmer.name)}
                          className="mt-3 text-[10px] font-semibold"
                          style={{ color: "#C85C5C" }}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {/* One useful secondary action — no duplicate Scan action */}
        <Link
          href="/compare"
          className="flex items-center justify-between rounded-[24px] px-5 py-4 transition active:scale-[0.99]"
          style={{
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(255,255,255,0.88)",
            boxShadow: "0 10px 24px rgba(0,25,55,0.08)",
          }}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#168AE8" }}>
              Compare
            </div>
            <div className="mt-1 text-base font-bold" style={{ color: "#0B2A54" }}>
              Compare swimmers
            </div>
            <div className="mt-1 text-xs" style={{ color: "#71859A" }}>
              See progress side by side
            </div>
          </div>
          <span className="text-2xl" style={{ color: "#168AE8" }}>›</span>
        </Link>

        <div className="h-6" />
      </div>
    </div>
  );
}
