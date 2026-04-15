"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SwimTimesSection from "./SwimTimesSection";
import ProgressTab from "./ProgressTab";
import { canonicalCourse, canonicalEventName, eventKey } from "@/lib/events";
import { seedETCStandard, etcStandardExists } from "@/lib/emergingTalentsStandards";
import { seedSNAGStandard, snagStandardExists, getSNAGQualifyingTime } from "@/lib/snagStandards";

// ─── Types ────────────────────────────────────────────────────────────────────

type Swimmer = {
  id: number | string;
  name: string;
  age: number;
  group_type?: string | null;
  created_at?: string | null;
  swim_club?: string | null;
  school?: string | null;
  status?: string | null;
  gender?: string | null;
};

type SwimTimeRow = {
  id?: number;
  swimmer_id?: number | string;
  event: string;
  course: string;
  time_ms: number;
  swam_at?: string | null;
  created_at?: string | null;
  place?: number | null;
};

type StandardSet = {
  id: number;
  name: string;
  type: "UPGRADING" | "IMPORTANT_MEET";
  created_at?: string | null;
};

type StandardItem = {
  id: number;
  standard_set_id: number;
  event: string;
  course: string;
  gender?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  qualifying_time_ms: number;
  created_at?: string | null;
};

type StandardsRow = StandardItem & {
  pbMs: number | null;
  pbSwamAt: string | null;
  gapMs: number | null;
  pctNeeded: number | null;
  status: "Qualified" | "In progress" | "No PB yet" | "Age not in range";
};

type TabKey = "swimTimes" | "progress" | "standards";

type EditProfileForm = {
  name: string;
  age: string;
  club: string;
  school: string;
  status: string;
  gender: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabKey, string> = {
  swimTimes: "Times",
  progress: "Progress",
  standards: "Standards",
};

const TAB_ORDER: TabKey[] = ["swimTimes", "progress", "standards"];

const STROKE_ORDER = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];

function formatSwamAt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(ms)) return "-";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function keyOf(event: string, course: string) {
  return eventKey(canonicalEventName(event), canonicalCourse(course));
}

function getPBMap(swimTimes: SwimTimeRow[]) {
  const map = new Map<string, SwimTimeRow>();
  for (const row of swimTimes) {
    const key = keyOf(row.event, row.course);
    const existing = map.get(key);
    if (!existing || row.time_ms < existing.time_ms) map.set(key, row);
  }
  return map;
}

function getStrokeName(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breaststroke") || e.includes("breast")) return "Breaststroke";
  if (e.includes("backstroke") || e.includes("back")) return "Backstroke";
  if (e.includes("butterfly") || e.includes("fly")) return "Butterfly";
  if (e.includes("freestyle") || e.includes("free")) return "Freestyle";
  if (e.includes("medley") || e.endsWith(" im") || e === "im") return "IM";
  return "Other";
}

function getEventDistance(event: string) {
  const match = canonicalEventName(event).match(/\d+/);
  return match ? Number(match[0]) : 9999;
}

function createEditForm(swimmer: Swimmer | null): EditProfileForm {
  return {
    name: swimmer?.name ?? "",
    age: swimmer?.age != null ? String(swimmer.age) : "",
    club: swimmer?.swim_club ?? "",
    school: swimmer?.school ?? "",
    status: swimmer?.status ?? "Active",
    gender: swimmer?.gender ?? "",
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-white/35">
      {children}
    </label>
  );
}

function StatPill({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${accent ? "border-amber-400/20 bg-amber-500/10" : "border-white/8 bg-white/[0.03]"}`}>
      <p className={`text-[10px] uppercase tracking-[0.2em] ${accent ? "text-amber-200/60" : "text-white/35"}`}>{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${accent ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SwimmerProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const swimmerId = Number(params?.id);

  const tabParam = searchParams.get("tab") as TabKey | null;
  const validTabs: TabKey[] = ["swimTimes", "progress", "standards"];
  const initialTab: TabKey = tabParam && validTabs.includes(tabParam) ? tabParam : "swimTimes";

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading swimmer...");

  const [swimmer, setSwimmer] = useState<Swimmer | null>(null);
  const [swimTimes, setSwimTimes] = useState<SwimTimeRow[]>([]);
  const [standardSets, setStandardSets] = useState<StandardSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
  const [standardItems, setStandardItems] = useState<StandardItem[]>([]);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editForm, setEditForm] = useState<EditProfileForm>(createEditForm(null));

  // Standards UI
  const [showNextAge, setShowNextAge] = useState(false);

  // ETC standards
  const [seedingETC, setSeedingETC] = useState(false);
  const [etcMessage, setEtcMessage] = useState("");
  const [etcAlreadyExists, setEtcAlreadyExists] = useState(false);

  // SNAG standards
  const [seedingSNAG, setSeedingSNAG] = useState(false);
  const [snagMessage, setSnagMessage] = useState("");
  const [snagAlreadyExists, setSnagAlreadyExists] = useState(false);

  useEffect(() => { void loadPage(); }, [swimmerId]);
  useEffect(() => { void loadStandardItems(selectedSetId); }, [selectedSetId]);

  async function loadPage() {
    if (!swimmerId || Number.isNaN(swimmerId)) { setStatus("Invalid swimmer id."); setLoading(false); return; }
    setLoading(true);

    const [swimmerRes, swimTimesRes, standardSetsRes] = await Promise.all([
      supabase.from("swimmers").select("id, name, age, group_type, created_at, swim_club, school, status, gender").eq("id", swimmerId).limit(1),
      supabase.from("swim_times").select("id, swimmer_id, event, course, time_ms, swam_at, created_at, place").eq("swimmer_id", swimmerId).order("event", { ascending: true }),
      supabase.from("standard_sets").select("id, name, type, created_at").order("created_at", { ascending: false }),
    ]);

    if (swimmerRes.error || swimTimesRes.error || standardSetsRes.error) {
      const err = swimmerRes.error?.message || swimTimesRes.error?.message || standardSetsRes.error?.message;
      setStatus(`Error: ${err}`); setLoading(false); return;
    }

    const swimmerRows = (swimmerRes.data as Swimmer[]) || [];
    if (swimmerRows.length === 0) {
      setSwimmer(null); setStatus("Swimmer not found."); setLoading(false); return;
    }

    const swimmerData = swimmerRows[0];
    const swimTimesData = (swimTimesRes.data as SwimTimeRow[]) || [];
    const standardSetsData = (standardSetsRes.data as StandardSet[]) || [];

    setSwimmer(swimmerData);
    setEditForm(createEditForm(swimmerData));
    setSwimTimes(swimTimesData);
    setStandardSets(standardSetsData);

    const firstSet = standardSetsData[0] ?? null;
    setSelectedSetId(firstSet?.id ?? null);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [etcExists, snagExists] = await Promise.all([
        etcStandardExists(user.id),
        snagStandardExists(user.id),
      ]);
      setEtcAlreadyExists(etcExists);
      setSnagAlreadyExists(snagExists);
    }

    setStatus("Ready");
    setLoading(false);
  }

  async function loadStandardItems(setId: number | null) {
    if (!setId) { setStandardItems([]); return; }
    const { data, error } = await supabase
      .from("standard_items")
      .select("id, standard_set_id, event, course, gender, min_age, max_age, qualifying_time_ms, created_at")
      .eq("standard_set_id", setId).order("event", { ascending: true });
    if (error) { setStandardItems([]); return; }
    setStandardItems((data as StandardItem[]) || []);
  }

  async function handleSaveProfile() {
    if (!swimmer) return;
    const trimmedName = editForm.name.trim();
    const parsedAge = Number(editForm.age);
    if (!trimmedName) { setStatus("Name is required."); return; }
    if (!editForm.age || Number.isNaN(parsedAge) || parsedAge < 0) { setStatus("Please enter a valid age."); return; }
    setSavingProfile(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { setStatus("Not logged in."); return; }
      const { data, error } = await supabase.from("swimmers").update({
        name: trimmedName, age: parsedAge,
        swim_club: editForm.club.trim() || null,
        school: editForm.school.trim() || null,
        status: editForm.status.trim() || "Active",
        gender: editForm.gender || null,
      }).eq("id", Number(swimmer.id)).eq("user_id", user.id).select();
      if (error) { setStatus(`Error: ${error.message}`); return; }
      if (!data || data.length === 0) { setStatus("⚠️ No rows updated."); return; }
      setIsEditingProfile(false);
      await loadPage();
    } finally {
      setSavingProfile(false);
    }
  }

  function handleCancelEdit() {
    setEditForm(createEditForm(swimmer));
    setIsEditingProfile(false);
    setStatus("");
  }

  async function handleSeedETC() {
    if (!swimmer?.gender || !swimmer?.age) { setEtcMessage("Set age and gender first."); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSeedingETC(true); setEtcMessage("");
    const result = await seedETCStandard(user.id, swimmer.age, swimmer.gender as "Male" | "Female");
    setEtcMessage(result.message);
    if (result.success) { setEtcAlreadyExists(true); await loadPage(); }
    setSeedingETC(false);
  }

  async function handleSeedSNAG() {
    if (!swimmer?.gender || !swimmer?.age) { setSnagMessage("Set age and gender first."); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSeedingSNAG(true); setSnagMessage("");
    const result = await seedSNAGStandard(user.id, swimmer.age, swimmer.gender as "Male" | "Female");
    setSnagMessage(result.message);
    if (result.success) { setSnagAlreadyExists(true); await loadPage(); }
    setSeedingSNAG(false);
  }

  const pbMap = useMemo(() => getPBMap(swimTimes), [swimTimes]);

  const standardsRows = useMemo<StandardsRow[]>(() => {
    return standardItems.map((item) => {
      const pb = pbMap.get(keyOf(item.event, item.course));
      const swimmerAge = swimmer?.age ?? null;
      const ageTooYoung = swimmerAge != null && item.min_age != null && swimmerAge < item.min_age;
      const ageTooOld = swimmerAge != null && item.max_age != null && swimmerAge > item.max_age;
      if (ageTooYoung || ageTooOld) return { ...item, pbMs: null, pbSwamAt: null, gapMs: null, pctNeeded: null, status: "Age not in range" };
      if (!pb) return { ...item, pbMs: null, pbSwamAt: null, gapMs: null, pctNeeded: null, status: "No PB yet" };
      const gapMs = pb.time_ms - item.qualifying_time_ms;
      const pctNeeded = gapMs > 0 ? (gapMs / pb.time_ms) * 100 : null;
      return {
        ...item,
        pbMs: pb.time_ms,
        pbSwamAt: pb.swam_at ?? null,
        gapMs,
        pctNeeded,
        status: gapMs <= 0 ? "Qualified" : "In progress",
      };
    });
  }, [standardItems, pbMap, swimmer?.age]);

  // Group by stroke
  const strokeGroups = useMemo(() => {
    const grouped = new Map<string, StandardsRow[]>();
    for (const row of standardsRows) {
      if (row.status === "Age not in range") continue;
      const stroke = getStrokeName(row.event);
      if (!grouped.has(stroke)) grouped.set(stroke, []);
      grouped.get(stroke)!.push(row);
    }
    return STROKE_ORDER
      .filter((s) => grouped.has(s))
      .map((s) => ({
        stroke: s,
        rows: (grouped.get(s) ?? []).sort((a, b) => getEventDistance(a.event) - getEventDistance(b.event)),
      }));
  }, [standardsRows]);

  const qualifiedCount = standardsRows.filter((r) => r.status === "Qualified").length;
  const inProgressCount = standardsRows.filter((r) => r.status === "In progress").length;
  const noPBCount = standardsRows.filter((r) => r.status === "No PB yet").length;

  const latestResultDate = useMemo(() => {
    const datedRows = swimTimes.filter((row) => row.swam_at);
    if (datedRows.length === 0) return null;
    return [...datedRows].sort((a, b) => new Date(b.swam_at || "").getTime() - new Date(a.swam_at || "").getTime())[0]?.swam_at ?? null;
  }, [swimTimes]);

  const totalUniqueEvents = useMemo(() => pbMap.size, [pbMap]);
  const etcEligible = swimmer?.age != null && [10, 11, 12].includes(swimmer.age) && !!swimmer.gender;

  if (loading) return <div className="shell"><div className="container-app"><p className="muted">Loading...</p></div></div>;

  if (!swimmer) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="danger-text">{status || "Swimmer not found."}</p>
          <Link href="/swimmers" className="btn-outline mt-4 inline-flex">← Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Back nav */}
        <div className="pt-2">
          <Link href="/swimmers" className="inline-flex items-center gap-1.5 text-sm text-white/40 transition hover:text-white/70">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Swimmers
          </Link>
        </div>

        {/* ── Profile header ─────────────────────────────────────────────── */}
        {!isEditingProfile ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Profile</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-white truncate">{swimmer.name}</h1>
              </div>
              <button
                onClick={() => { setEditForm(createEditForm(swimmer)); setIsEditingProfile(true); }}
                className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-base transition hover:bg-white/10"
              >
                ✏️
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {swimmer.age != null && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">Age {swimmer.age}</span>}
              {swimmer.gender && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">{swimmer.gender}</span>}
              {swimmer.status && <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-sm text-amber-300">{swimmer.status}</span>}
              {swimmer.swim_club && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">{swimmer.swim_club}</span>}
              {swimmer.school && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">{swimmer.school}</span>}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <StatPill label="PB Events" value={totalUniqueEvents} accent />
              <StatPill label="All Times" value={swimTimes.length} />
              <StatPill label="Latest" value={latestResultDate ? <span className="text-lg">{formatSwamAt(latestResultDate)}</span> : <span className="text-base text-white/40">—</span>} />
            </div>

            <div className="flex gap-2 border-t border-white/8 pt-4">
              {TAB_ORDER.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 rounded-2xl border py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "border-amber-400/30 bg-amber-500/15 text-amber-300"
                      : "border-white/10 bg-transparent text-white/45 hover:text-white/70"
                  }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30">Editing profile</p>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <div>
                <FieldLabel>Name</FieldLabel>
                <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="input text-lg font-semibold" placeholder="Full name" />
              </div>
              <div>
                <FieldLabel>Age</FieldLabel>
                <input value={editForm.age} onChange={(e) => setEditForm((p) => ({ ...p, age: e.target.value }))} className="input text-center text-lg font-semibold" inputMode="numeric" placeholder="—" />
              </div>
            </div>
            <div>
              <FieldLabel>Gender</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {(["Male", "Female"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setEditForm((p) => ({ ...p, gender: p.gender === g ? "" : g }))}
                    className="rounded-2xl border py-2.5 text-sm font-medium transition"
                    style={editForm.gender === g
                      ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
                  >
                    {g === "Male" ? "♂ Male" : "♀ Female"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Club</FieldLabel><input value={editForm.club} onChange={(e) => setEditForm((p) => ({ ...p, club: e.target.value }))} className="input" placeholder="Swim club" /></div>
              <div><FieldLabel>School</FieldLabel><input value={editForm.school} onChange={(e) => setEditForm((p) => ({ ...p, school: e.target.value }))} className="input" placeholder="School" /></div>
            </div>
            <div><FieldLabel>Status</FieldLabel><input value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))} className="input" placeholder="Active" /></div>
            {status && <p className="text-sm" style={{ color: status.startsWith("Error") ? "#F09595" : "#6EE7B7" }}>{status}</p>}
            <div className="flex gap-2 border-t border-white/8 pt-4">
              <button onClick={handleSaveProfile} disabled={savingProfile} className="btn">{savingProfile ? "Saving..." : "Save changes"}</button>
              <button onClick={handleCancelEdit} disabled={savingProfile} className="btn-outline">Cancel</button>
            </div>
          </div>
        )}

        {/* ── Tab: Times ────────────────────────────────────────────────── */}
        {!isEditingProfile && activeTab === "swimTimes" && (
          <section className="card"><SwimTimesSection swimmerId={Number(swimmer.id)} /></section>
        )}

        {/* ── Tab: Progress ─────────────────────────────────────────────── */}
        {!isEditingProfile && activeTab === "progress" && (
          <ProgressTab swimmerId={Number(swimmer.id)} swimmerName={swimmer.name} />
        )}

        {/* ── Tab: Standards ────────────────────────────────────────────── */}
        {!isEditingProfile && activeTab === "standards" && (
          <section className="space-y-4">

            {/* Seed banners */}
            {etcEligible && !etcAlreadyExists && (
              <div className="rounded-3xl p-5 space-y-3" style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(253,230,138,0.25)" }}>
                <div>
                  <p className="text-sm font-semibold text-white">🏊 Emerging Talents Championship 2026</p>
                  <p className="mt-1 text-xs text-white/55">{swimmer.name} is age {swimmer.age} ({swimmer.gender}) — load qualifying standards in one tap.</p>
                </div>
                <button type="button" onClick={handleSeedETC} disabled={seedingETC}
                  className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ background: "#D97706" }}>
                  {seedingETC ? "Loading…" : "Load ETC 2026 standards"}
                </button>
                {etcMessage && <p className="text-xs" style={{ color: etcMessage.startsWith("✓") ? "#6EE7B7" : "#FCA5A5" }}>{etcMessage}</p>}
              </div>
            )}

            {swimmer.gender && swimmer.age && !snagAlreadyExists && (
              <div className="rounded-3xl p-5 space-y-3" style={{ background: "rgba(24,95,165,0.1)", border: "1px solid rgba(147,197,253,0.25)" }}>
                <div>
                  <p className="text-sm font-semibold text-white">🏆 56th SNAG 2026</p>
                  <p className="mt-1 text-xs text-white/55">National Age Group qualifying standards — age {swimmer.age} ({swimmer.gender}), LCM.</p>
                </div>
                <button type="button" onClick={handleSeedSNAG} disabled={seedingSNAG}
                  className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ background: "#185FA5" }}>
                  {seedingSNAG ? "Loading…" : "Load SNAG 2026 standards"}
                </button>
                {snagMessage && <p className="text-xs" style={{ color: snagMessage.startsWith("✓") ? "#6EE7B7" : "#FCA5A5" }}>{snagMessage}</p>}
              </div>
            )}

            {/* Standard set pill switcher */}
            {standardSets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {standardSets.map((set) => (
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => setSelectedSetId(set.id)}
                    className="rounded-2xl border px-3 py-2 text-xs font-semibold transition"
                    style={selectedSetId === set.id
                      ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
                  >
                    {set.name}
                  </button>
                ))}
                <Link
                  href="/standards"
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/40 transition hover:bg-white/10"
                >
                  Manage
                </Link>
              </div>
            )}

            {/* Nothing selected */}
            {!selectedSetId && standardSets.length === 0 && (
              <div className="rounded-3xl p-8 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-base font-semibold text-white">No standards yet</p>
                <p className="mt-1 text-sm text-white/40">Load the SNAG or ETC standards above, or create your own.</p>
              </div>
            )}

            {selectedSetId && standardItems.length > 0 && (
              <>
                {/* Summary stats + age toggle */}
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold" style={{ color: "#6EE7B7" }}>{qualifiedCount}</p>
                        <p className="text-[10px] uppercase tracking-wider text-white/35 mt-0.5">Qualified</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-white">{inProgressCount}</p>
                        <p className="text-[10px] uppercase tracking-wider text-white/35 mt-0.5">In progress</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-white/40">{noPBCount}</p>
                        <p className="text-[10px] uppercase tracking-wider text-white/35 mt-0.5">No PB</p>
                      </div>
                    </div>

                    {/* Age toggle */}
                    <div className="flex rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                      <button
                        type="button"
                        onClick={() => setShowNextAge(false)}
                        className="px-3 py-1.5 text-xs font-semibold transition"
                        style={!showNextAge
                          ? { background: "rgba(217,119,6,0.2)", color: "#FDE68A" }
                          : { background: "transparent", color: "rgba(255,255,255,0.4)" }}
                      >
                        Age {swimmer.age}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNextAge(true)}
                        className="px-3 py-1.5 text-xs font-semibold transition"
                        style={showNextAge
                          ? { background: "rgba(24,95,165,0.3)", color: "#93C5FD" }
                          : { background: "transparent", color: "rgba(255,255,255,0.4)" }}
                      >
                        Age {swimmer.age + 1} ↑
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-white/30">
                    {swimmer.name} · {swimmer.gender} · {standardSets.find(s => s.id === selectedSetId)?.name}
                  </p>
                </div>

                {/* Table */}
                {!showNextAge ? (
                  <div className="space-y-3">
                    {strokeGroups.map(({ stroke, rows }) => (
                      <div key={stroke} className="rounded-3xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)" }}>
                        <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-white/30">{stroke}</p>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                              <th style={{ padding: "6px 16px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Event</th>
                              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>PB</th>
                              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Target</th>
                              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Gap</th>
                              <th style={{ padding: "6px 16px 6px 8px", textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, i) => {
                              const qualified = row.status === "Qualified";
                              const noPB = row.status === "No PB yet";
                              const isLast = i === rows.length - 1;
                              return (
                                <tr key={row.id} style={{ borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
                                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 500, color: "white" }}>
                                    {canonicalEventName(row.event).replace(` ${stroke}`, "").replace("Freestyle", "Free").replace("Backstroke", "Back").replace("Breaststroke", "Breast").replace("Butterfly", "Fly")}
                                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>{canonicalCourse(row.course)}</span>
                                  </td>
                                  <td style={{ padding: "10px 8px", textAlign: "right", fontSize: 13, color: qualified ? "#6EE7B7" : noPB ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.8)" }}>
                                    {row.pbMs == null ? "—" : formatMs(row.pbMs)}
                                  </td>
                                  <td style={{ padding: "10px 8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                                    {formatMs(row.qualifying_time_ms)}
                                  </td>
                                  <td style={{ padding: "10px 8px", textAlign: "right", fontSize: 12 }}>
                                    {qualified ? (
                                      <span style={{ background: "rgba(16,185,129,0.15)", color: "#6EE7B7", border: "1px solid rgba(110,231,183,0.25)", borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 500 }}>✓ Done</span>
                                    ) : noPB ? (
                                      <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>No PB</span>
                                    ) : (
                                      <span style={{ color: (row.pctNeeded ?? 0) < 3 ? "#FDE68A" : "rgba(255,255,255,0.55)" }}>
                                        {formatMs(row.gapMs != null ? Math.abs(row.gapMs) : null)}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: "10px 16px 10px 8px", textAlign: "right", fontSize: 12 }}>
                                    {qualified || noPB ? (
                                      <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
                                    ) : (
                                      <span style={{ color: (row.pctNeeded ?? 0) < 2 ? "#FDE68A" : (row.pctNeeded ?? 0) < 5 ? "#FAC775" : "rgba(255,255,255,0.4)" }}>
                                        {row.pctNeeded?.toFixed(1)}%
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Next age up view */
                  <div className="rounded-3xl p-5 space-y-3" style={{ background: "rgba(24,95,165,0.08)", border: "1px solid rgba(147,197,253,0.2)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ background: "rgba(24,95,165,0.2)", color: "#93C5FD", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 10, padding: "2px 10px", fontSize: 10, fontWeight: 500 }}>
                        Age {swimmer.age + 1} targets
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Planning ahead for next year</span>
                    </div>

                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(147,197,253,0.1)" }}>
                          <th style={{ padding: "6px 0", textAlign: "left", fontSize: 10, color: "rgba(147,197,253,0.5)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Event</th>
                          <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "rgba(147,197,253,0.5)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Current PB</th>
                          <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "rgba(147,197,253,0.5)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Age {swimmer.age + 1} target</th>
                          <th style={{ padding: "6px 0", textAlign: "right", fontSize: 10, color: "rgba(147,197,253,0.5)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standardsRows
                          .filter((r) => r.pbMs != null && r.status !== "Age not in range")
                          .map((row) => {
                            if (!swimmer.gender) return null;
                            const nextTarget = getSNAGQualifyingTime(row.event, swimmer.age + 1, swimmer.gender as "Male" | "Female");
                            if (!nextTarget) return null;
                            const nextTargetMs = parseFloat(nextTarget.includes(":") ?
                              (() => { const [m, s] = nextTarget.split(":"); return (Number(m) * 60 + Number(s)).toString(); })()
                              : nextTarget) * 1000;
                            const gapToNext = row.pbMs! - nextTargetMs;
                            return (
                              <tr key={row.id} style={{ borderBottom: "1px solid rgba(147,197,253,0.06)" }}>
                                <td style={{ padding: "9px 0", fontSize: 13, fontWeight: 500, color: "white" }}>
                                  {canonicalEventName(row.event)}
                                </td>
                                <td style={{ padding: "9px 8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                                  {formatMs(row.pbMs)}
                                </td>
                                <td style={{ padding: "9px 8px", textAlign: "right", fontSize: 13, color: "#93C5FD" }}>
                                  {nextTarget}
                                </td>
                                <td style={{ padding: "9px 0", textAlign: "right", fontSize: 12, color: gapToNext <= 0 ? "#6EE7B7" : "rgba(255,255,255,0.4)" }}>
                                  {gapToNext <= 0 ? "✓ Ready" : formatMs(Math.abs(gapToNext)) + " off"}
                                </td>
                              </tr>
                            );
                          })
                          .filter(Boolean)}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}