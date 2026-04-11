"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SwimScan from "./SwimScan";
import SwimTimesSection from "./SwimTimesSection";
import ProgressTab from "./ProgressTab";
import { canonicalCourse, canonicalEventName, eventKey } from "@/lib/events";

type Swimmer = {
  id: number | string;
  name: string;
  age: number;
  birth_year?: number | null;
  group_type?: string | null;
  created_at?: string | null;
  swim_club?: string | null;
  school?: string | null;
  status?: string | null;
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
  gapMs: number | null;
  status: "Qualified" | "In progress" | "No PB yet" | "Age not in range";
};

// ✅ Added "progress" tab
type TabKey = "overview" | "swimTimes" | "progress" | "standards" | "swimscan" | "matchups";

type StrokeGroup = {
  key: string;
  label: string;
  rows: StandardsRow[];
};

type MatchupRow = {
  id: number;
  swimmer_id: number;
  target_swimmer_id: number;
  user_id?: string | null;
  created_at?: string | null;
};

type MatchupComparison = {
  event: string;
  course: string;
  myBestMs: number;
  targetBestMs: number;
  diffMs: number;
};

type EditProfileForm = {
  name: string;
  age: string;
  club: string;
  school: string;
  status: string;
};

const TAB_LABELS: Record<TabKey, string> = {
  overview: "Overview",
  swimTimes: "Swim Times",
  progress: "Progress",
  standards: "Standards",
  swimscan: "SwimScan",
  matchups: "Matchups",
};

const TAB_ORDER: TabKey[] = [
  "overview",
  "swimTimes",
  "progress",
  "standards",
  "swimscan",
  "matchups",
];

function formatCreatedAt(value?: string | null) {
  if (!value) return "No date available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date available";
  return date.toLocaleString();
}

function formatAddedDateShort(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function formatSwamAt(value?: string | null) {
  if (!value) return "No date detected";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
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

function findBestMatchupComparison(mySwimTimes: SwimTimeRow[], targetSwimTimes: SwimTimeRow[]): MatchupComparison | null {
  const myPbMap = getPBMap(mySwimTimes);
  const targetPbMap = getPBMap(targetSwimTimes);
  const comparisons: MatchupComparison[] = [];
  for (const [key, myPb] of myPbMap.entries()) {
    const targetPb = targetPbMap.get(key);
    if (!targetPb) continue;
    comparisons.push({
      event: canonicalEventName(myPb.event),
      course: canonicalCourse(myPb.course),
      myBestMs: myPb.time_ms,
      targetBestMs: targetPb.time_ms,
      diffMs: myPb.time_ms - targetPb.time_ms,
    });
  }
  if (comparisons.length === 0) return null;
  comparisons.sort((a, b) => Math.abs(a.diffMs) - Math.abs(b.diffMs));
  return comparisons[0];
}

function statusClass(status: StandardsRow["status"]) {
  if (status === "Qualified") return "success-text";
  if (status === "In progress") return "warning-text";
  return "text-white";
}

function getStrokeKey(event: string) {
  const e = canonicalEventName(event).toLowerCase();
  if (e.includes("free")) return "freestyle";
  if (e.includes("back")) return "backstroke";
  if (e.includes("breast")) return "breaststroke";
  if (e.includes("fly")) return "butterfly";
  if (e.includes("im")) return "im";
  return "other";
}

function getStrokeLabel(stroke: string) {
  const labels: Record<string, string> = {
    freestyle: "Freestyle", backstroke: "Backstroke", breaststroke: "Breaststroke",
    butterfly: "Butterfly", im: "IM", other: "Other",
  };
  return labels[stroke] ?? "Other";
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
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-white/35">
      {children}
    </label>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${accent ? "border-amber-400/20 bg-amber-500/10" : "border-white/8 bg-white/[0.03]"}`}>
      <p className={`text-[10px] uppercase tracking-[0.2em] ${accent ? "text-amber-200/60" : "text-white/35"}`}>{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${accent ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}

export default function SwimmerProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const swimmerId = Number(params?.id);

  const tabParam = searchParams.get("tab") as TabKey | null;
  const validTabs: TabKey[] = ["overview", "swimTimes", "progress", "standards", "swimscan", "matchups"];
  const initialTab: TabKey = tabParam && validTabs.includes(tabParam) ? tabParam : "overview";

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading swimmer...");

  const [swimmer, setSwimmer] = useState<Swimmer | null>(null);
  const [swimTimes, setSwimTimes] = useState<SwimTimeRow[]>([]);
  const [standardSets, setStandardSets] = useState<StandardSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
  const [standardItems, setStandardItems] = useState<StandardItem[]>([]);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [expandedStrokes, setExpandedStrokes] = useState<Record<string, boolean>>({
    freestyle: true, backstroke: false, breaststroke: false, butterfly: false, im: false, other: false,
  });

  const [allSwimmers, setAllSwimmers] = useState<Swimmer[]>([]);
  const [matchups, setMatchups] = useState<MatchupRow[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [loadingMatchups, setLoadingMatchups] = useState(false);
  const [savingMatchup, setSavingMatchup] = useState(false);
  const [matchupTimesMap, setMatchupTimesMap] = useState<Map<number, SwimTimeRow[]>>(new Map());

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editForm, setEditForm] = useState<EditProfileForm>(createEditForm(null));

  useEffect(() => { void loadPage(); }, [swimmerId]);
  useEffect(() => { void loadStandardItems(selectedSetId); }, [selectedSetId]);

  async function loadPage() {
    if (!swimmerId || Number.isNaN(swimmerId)) { setStatus("Invalid swimmer id."); setLoading(false); return; }
    setLoading(true);
    setStatus("Loading swimmer...");

    const [swimmerRes, swimTimesRes, standardSetsRes, allSwimmersRes, matchupsRes] = await Promise.all([
      supabase.from("swimmers").select("id, name, age, birth_year, group_type, created_at, swim_club, school, status").eq("id", swimmerId).limit(1),
      supabase.from("swim_times").select("id, swimmer_id, event, course, time_ms, swam_at, created_at, place").eq("swimmer_id", swimmerId).order("event", { ascending: true }),
      supabase.from("standard_sets").select("id, name, type, created_at").order("created_at", { ascending: false }),
      supabase.from("swimmers").select("id, name, age, birth_year, group_type, created_at, club, school, status").order("name", { ascending: true }),
      supabase.from("matchups").select("id, swimmer_id, target_swimmer_id, user_id, created_at").eq("swimmer_id", swimmerId).order("created_at", { ascending: false }),
    ]);

    if (swimmerRes.error || swimTimesRes.error || standardSetsRes.error || allSwimmersRes.error || matchupsRes.error) {
      const err = swimmerRes.error?.message || swimTimesRes.error?.message || standardSetsRes.error?.message || allSwimmersRes.error?.message || matchupsRes.error?.message;
      setStatus(`Error: ${err}`); setLoading(false); return;
    }

    const swimmerRows = (swimmerRes.data as Swimmer[]) || [];
    if (swimmerRows.length === 0) {
      setSwimmer(null); setSwimTimes([]); setStandardSets([]);
      setSelectedSetId(null); setAllSwimmers([]); setMatchups([]);
      setStatus("Swimmer not found."); setLoading(false); return;
    }

    const swimmerData = swimmerRows[0];
    const swimTimesData = (swimTimesRes.data as SwimTimeRow[]) || [];
    const standardSetsData = (standardSetsRes.data as StandardSet[]) || [];
    const allSwimmersData = (allSwimmersRes.data as Swimmer[]) || [];
    const matchupsData = (matchupsRes.data as MatchupRow[]) || [];

    setSwimmer(swimmerData);
    setEditForm(createEditForm(swimmerData));
    setSwimTimes(swimTimesData);
    setStandardSets(standardSetsData);
    setAllSwimmers(allSwimmersData);
    setMatchups(matchupsData);

    const upgradingSet = standardSetsData.find((s) => s.type === "UPGRADING") || standardSetsData[0] || null;
    setSelectedSetId(upgradingSet?.id ?? null);
    await loadMatchupTimes(matchupsData, swimTimesData);
    setStatus("Ready");
    setLoading(false);
  }

  async function loadMatchupTimes(matchupRows: MatchupRow[], mySwimTimes?: SwimTimeRow[]) {
    setLoadingMatchups(true);
    const map = new Map<number, SwimTimeRow[]>();
    map.set(swimmerId, mySwimTimes || swimTimes);
    const targetIds = Array.from(new Set(matchupRows.map((m) => Number(m.target_swimmer_id)).filter((id) => id && !Number.isNaN(id))));
    if (targetIds.length === 0) { setMatchupTimesMap(map); setLoadingMatchups(false); return; }
    const { data, error } = await supabase.from("swim_times").select("id, swimmer_id, event, course, time_ms, swam_at, created_at, place").in("swimmer_id", targetIds).order("event", { ascending: true });
    if (error) { setStatus(`Error loading matchup swim times: ${error.message}`); setMatchupTimesMap(map); setLoadingMatchups(false); return; }
    for (const row of (data as SwimTimeRow[]) || []) {
      const targetId = Number(row.swimmer_id);
      const current = map.get(targetId) || [];
      current.push(row);
      map.set(targetId, current);
    }
    setMatchupTimesMap(map);
    setLoadingMatchups(false);
  }

  async function loadStandardItems(setId: number | null) {
    if (!setId) { setStandardItems([]); return; }
    const { data, error } = await supabase.from("standard_items").select("id, standard_set_id, event, course, gender, min_age, max_age, qualifying_time_ms, created_at").eq("standard_set_id", setId).order("event", { ascending: true });
    if (error) { setStatus(`Error loading standard items: ${error.message}`); setStandardItems([]); return; }
    setStandardItems((data as StandardItem[]) || []);
    setExpandedRows({});
    setExpandedStrokes({ freestyle: true, backstroke: false, breaststroke: false, butterfly: false, im: false, other: false });
  }

  async function handleSaveProfile() {
    if (!swimmer) return;
    const trimmedName = editForm.name.trim();
    const parsedAge = Number(editForm.age);
    if (!trimmedName) { setStatus("Name is required."); return; }
    if (!editForm.age || Number.isNaN(parsedAge) || parsedAge < 0) { setStatus("Please enter a valid age."); return; }
    setSavingProfile(true);
    setStatus("Saving profile...");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { setStatus("Not logged in."); return; }
      const payload = { name: trimmedName, age: parsedAge, swim_club: editForm.club.trim() || null, school: editForm.school.trim() || null, status: editForm.status.trim() || "Active" };
      const { data, error } = await supabase.from("swimmers").update(payload).eq("id", Number(swimmer.id)).eq("user_id", user.id).select();
      if (error) { setStatus(`Error: ${error.message}`); return; }
      if (!data || data.length === 0) { setStatus("⚠️ No rows updated — check RLS or user_id mismatch."); return; }
      setIsEditingProfile(false);
      setStatus("Profile updated.");
      await loadPage();
    } finally {
      setSavingProfile(false);
    }
  }

  function handleCancelEdit() {
    setEditForm(createEditForm(swimmer));
    setIsEditingProfile(false);
    setStatus("Edit cancelled.");
  }

  async function handleAddMatchup() {
    if (!swimmer || !selectedTargetId) { setStatus("Please select a swimmer to compare."); return; }
    const targetId = Number(selectedTargetId);
    if (!targetId || Number.isNaN(targetId)) { setStatus("Invalid swimmer selected."); return; }
    setSavingMatchup(true);
    setStatus("Saving matchup...");
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) { setStatus(`Error checking login: ${sessionError.message}`); return; }
      const { error } = await supabase.from("matchups").insert([{ swimmer_id: Number(swimmer.id), target_swimmer_id: targetId, user_id: session?.user?.id ?? null }]);
      if (error) {
        if (error.message?.toLowerCase().includes("duplicate") || error.message?.toLowerCase().includes("unique")) { setStatus("That matchup already exists."); return; }
        setStatus(`Error saving matchup: ${error.message}`); return;
      }
      setSelectedTargetId("");
      await loadPage();
      setStatus("Matchup added.");
    } finally {
      setSavingMatchup(false);
    }
  }

  async function handleDeleteMatchup(matchupId: number) {
    setStatus("Removing matchup...");
    const { error } = await supabase.from("matchups").delete().eq("id", matchupId);
    if (error) { setStatus(`Error removing matchup: ${error.message}`); return; }
    await loadPage();
    setStatus("Matchup removed.");
  }

  function toggleRow(id: number) { setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] })); }
  function toggleStroke(stroke: string) { setExpandedStrokes((prev) => ({ ...prev, [stroke]: !prev[stroke] })); }

  const pbMap = useMemo(() => getPBMap(swimTimes), [swimTimes]);
  const selectedSet = useMemo(() => standardSets.find((s) => s.id === selectedSetId) || null, [standardSets, selectedSetId]);

  const standardsRows = useMemo<StandardsRow[]>(() => {
    return standardItems.map((item) => {
      const pb = pbMap.get(keyOf(item.event, item.course));
      const swimmerAge = swimmer?.age ?? null;
      const ageTooYoung = swimmerAge != null && item.min_age != null && swimmerAge < item.min_age;
      const ageTooOld = swimmerAge != null && item.max_age != null && swimmerAge > item.max_age;
      if (ageTooYoung || ageTooOld) return { ...item, pbMs: null, gapMs: null, status: "Age not in range" };
      if (!pb) return { ...item, pbMs: null, gapMs: null, status: "No PB yet" };
      const gapMs = pb.time_ms - item.qualifying_time_ms;
      return { ...item, pbMs: pb.time_ms, gapMs, status: gapMs <= 0 ? "Qualified" : "In progress" };
    });
  }, [standardItems, pbMap, swimmer?.age]);

  const strokeGroups = useMemo<StrokeGroup[]>(() => {
    const grouped: Record<string, StandardsRow[]> = {};
    for (const row of standardsRows) {
      const stroke = getStrokeKey(row.event);
      if (!grouped[stroke]) grouped[stroke] = [];
      grouped[stroke].push(row);
    }
    const order = ["freestyle", "backstroke", "breaststroke", "butterfly", "im", "other"];
    return order.filter((stroke) => grouped[stroke]?.length).map((stroke) => ({
      key: stroke,
      label: getStrokeLabel(stroke),
      rows: [...grouped[stroke]].sort((a, b) => {
        const aHasPb = a.pbMs != null ? 0 : 1;
        const bHasPb = b.pbMs != null ? 0 : 1;
        if (aHasPb !== bHasPb) return aHasPb - bHasPb;
        const distanceDiff = getEventDistance(a.event) - getEventDistance(b.event);
        if (distanceDiff !== 0) return distanceDiff;
        return canonicalCourse(a.course).localeCompare(canonicalCourse(b.course));
      }),
    }));
  }, [standardsRows]);

  const hasQualifiedRows = useMemo(() => standardsRows.some((r) => r.status === "Qualified"), [standardsRows]);
  const hasInProgressRows = useMemo(() => standardsRows.some((r) => r.status === "In progress"), [standardsRows]);

  const swimmersById = useMemo(() => {
    const map = new Map<number, Swimmer>();
    for (const s of allSwimmers) map.set(Number(s.id), s);
    return map;
  }, [allSwimmers]);

  const availableTargets = useMemo(() => {
    const existingTargetIds = new Set(matchups.map((m) => Number(m.target_swimmer_id)));
    return allSwimmers.filter((s) => {
      const id = Number(s.id);
      if (id === Number(swimmer?.id)) return false;
      if (existingTargetIds.has(id)) return false;
      return true;
    });
  }, [allSwimmers, matchups, swimmer?.id]);

  const latestResultDate = useMemo(() => {
    const datedRows = swimTimes.filter((row) => row.swam_at);
    if (datedRows.length === 0) return null;
    const latest = [...datedRows].sort((a, b) => new Date(b.swam_at || "").getTime() - new Date(a.swam_at || "").getTime())[0];
    return latest?.swam_at ?? null;
  }, [swimTimes]);

  const totalUniqueEvents = useMemo(() => pbMap.size, [pbMap]);

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="muted">{status}</p>
        </div>
      </div>
    );
  }

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
      <div className="container-app">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/swimmers" className="btn-outline">← Back</Link>
          <p className="text-sm text-white/40">{status}</p>
        </div>

        <section className="card mb-6">
          {!isEditingProfile ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="label mb-2">Profile</p>
                  <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">{swimmer.name}</h1>
                </div>
                <button onClick={() => { setEditForm(createEditForm(swimmer)); setIsEditingProfile(true); }} className="btn-outline mt-1 min-w-[120px] flex-shrink-0">
                  ✏️ Edit
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {swimmer.age != null && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">Age {swimmer.age}</span>}
                {swimmer.status && <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-sm text-amber-300">{swimmer.status}</span>}
                {swimmer.swim_club && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">{swimmer.swim_club}</span>}
                {swimmer.school && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">{swimmer.school}</span>}
              </div>

              <p className="mt-3 text-sm text-white/30">
                ID {swimmer.id}{swimmer.created_at && <> · Added {formatAddedDateShort(swimmer.created_at)}</>}
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard label="PB Events" value={pbMap.size} accent />
                <StatCard label="All Times" value={swimTimes.length} />
                <StatCard label="Latest" value={latestResultDate ? <span className="text-lg">{formatSwamAt(latestResultDate)}</span> : <span className="text-base text-white/40">—</span>} />
              </div>

              <div className="mt-5 border-t border-white/8" />

              <div className="mt-4 flex flex-wrap gap-3">
                {TAB_ORDER.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`whitespace-nowrap rounded-full border px-5 py-3 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "border-amber-400/30 bg-amber-500/15 text-amber-300"
                        : "border-white/10 bg-transparent text-white/45 hover:text-white/70"
                    }`}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="label mb-4">Editing profile</p>
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <div>
                  <FieldLabel>Name</FieldLabel>
                  <input value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} className="input text-lg font-semibold" placeholder="Full name" />
                </div>
                <div>
                  <FieldLabel>Age</FieldLabel>
                  <input value={editForm.age} onChange={(e) => setEditForm((prev) => ({ ...prev, age: e.target.value }))} className="input text-center text-lg font-semibold" inputMode="numeric" placeholder="—" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel>Club</FieldLabel>
                  <input value={editForm.club} onChange={(e) => setEditForm((prev) => ({ ...prev, club: e.target.value }))} className="input" placeholder="Swim club" />
                </div>
                <div>
                  <FieldLabel>School</FieldLabel>
                  <input value={editForm.school} onChange={(e) => setEditForm((prev) => ({ ...prev, school: e.target.value }))} className="input" placeholder="School" />
                </div>
              </div>
              <div className="mt-3">
                <FieldLabel>Status</FieldLabel>
                <input value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))} className="input" placeholder="Active" />
              </div>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
                <button onClick={handleSaveProfile} disabled={savingProfile} className="btn">{savingProfile ? "Saving..." : "Save changes"}</button>
                <button onClick={handleCancelEdit} disabled={savingProfile} className="btn-outline">Cancel</button>
              </div>
            </>
          )}
        </section>

        {!isEditingProfile && activeTab === "overview" && (
          <section className="card">
            <h2 className="title">Overview</h2>
            <p className="mt-2 muted">Quick snapshot for {swimmer.name}.</p>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="card-soft"><p className="label">Current status</p><p className="mt-3 text-2xl font-bold text-white">{swimTimes.length > 0 ? "Tracking active" : "No times yet"}</p><p className="mt-2 text-white/70">{swimTimes.length > 0 ? `${swimTimes.length} swim time entr${swimTimes.length === 1 ? "y" : "ies"} recorded.` : "Import or add some times to get started."}</p></div>
              <div className="card-soft"><p className="label">Total swim times</p><p className="mt-3 text-2xl font-bold text-white">{swimTimes.length}</p><p className="mt-2 text-white/70">All recorded result entries.</p></div>
              <div className="card-soft"><p className="label">Total events</p><p className="mt-3 text-2xl font-bold text-white">{totalUniqueEvents}</p><p className="mt-2 text-white/70">Unique PB event-course combinations.</p></div>
              <div className="card-soft"><p className="label">Latest result date</p><p className="mt-3 text-2xl font-bold text-white">{latestResultDate ? formatSwamAt(latestResultDate) : "No date yet"}</p><p className="mt-2 text-white/70">Most recent swim result with a detected date.</p></div>
            </div>
          </section>
        )}

        {!isEditingProfile && activeTab === "swimTimes" && (
          <section className="card">
            <SwimTimesSection swimmerId={Number(swimmer.id)} />
          </section>
        )}

        {/* ✅ Progress tab */}
        {!isEditingProfile && activeTab === "progress" && (
          <ProgressTab swimmerId={Number(swimmer.id)} swimmerName={swimmer.name} />
        )}

        {!isEditingProfile && activeTab === "standards" && (
          <section className="space-y-6">
            <div className="card">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="title">Standards Compare</h2>
                    <p className="mt-2 muted">See how close {swimmer.name} is to qualifying standards.</p>
                  </div>
                  <Link href="/standards" className="btn-outline shrink-0">➕ Create Standard</Link>
                </div>
                <div>
                  <FieldLabel>Standard Set</FieldLabel>
                  <select value={selectedSetId ?? ""} onChange={(e) => setSelectedSetId(Number(e.target.value))} className="input">
                    {standardSets.map((set) => (
                      <option key={set.id} value={set.id}>{set.name} ({set.type === "UPGRADING" ? "Upgrading" : "Important Meet"})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {!hasInProgressRows && !hasQualifiedRows && selectedSet && (
              <div className="card">
                <h3 className="text-2xl font-bold text-white">Standards Summary</h3>
                <p className="mt-3 text-white/70">No active standards progress found for <strong>{selectedSet.name}</strong>.</p>
                <div className="mt-3 space-y-1 text-white/70"><p>• No matching PB exists yet</p><p>• Age range may not match this swimmer</p><p>• Course or event naming may not match</p></div>
              </div>
            )}

            {hasQualifiedRows && !hasInProgressRows && selectedSet && (
              <div className="card">
                <h3 className="text-2xl font-bold text-white">Standards Summary</h3>
                <p className="mt-3 text-white/70">All current standards for <strong>{selectedSet.name}</strong> are already achieved ✅</p>
              </div>
            )}

            <div className="card">
              <h3 className="title">{selectedSet?.name || "Standards"}</h3>
              <p className="mt-2 muted">Age: {swimmer.age}</p>
              <div className="mt-6 space-y-4">
                {strokeGroups.length === 0 ? (
                  <div className="card-soft"><p className="text-white/70">No standards found in this set.</p></div>
                ) : (
                  strokeGroups.map((group) => {
                    const isStrokeOpen = !!expandedStrokes[group.key];
                    const qualifiedCount = group.rows.filter((r) => r.status === "Qualified").length;
                    const activeCount = group.rows.filter((r) => r.status === "In progress").length;
                    return (
                      <div key={group.key} className="card-soft">
                        <button type="button" onClick={() => toggleStroke(group.key)} className="w-full text-left">
                          <div className="flex items-center justify-between gap-4">
                            <div><h4 className="text-2xl font-bold text-white">{group.label}</h4><p className="mt-1 text-sm text-white/50">{group.rows.length} event{group.rows.length === 1 ? "" : "s"}</p></div>
                            <div className="text-right"><p className="text-sm text-white/70">{qualifiedCount} qualified · {activeCount} active</p><p className="mt-1 text-xs text-white/40">{isStrokeOpen ? "Hide" : "Show"}</p></div>
                          </div>
                        </button>
                        {isStrokeOpen && (
                          <div className="mt-4 space-y-3">
                            {group.rows.map((row) => {
                              const qualified = row.status === "Qualified";
                              const inProgress = row.status === "In progress";
                              const isExpanded = !!expandedRows[row.id];
                              return (
                                <div key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <button type="button" onClick={() => toggleRow(row.id)} className="w-full text-left">
                                    <div className="flex items-center justify-between gap-4">
                                      <div className="min-w-0">
                                        <h5 className="text-xl font-bold text-white">{canonicalEventName(row.event)}</h5>
                                        <p className="text-sm text-white/50">{canonicalCourse(row.course)}</p>
                                        <div className="mt-2 flex items-center gap-4 text-sm text-white/70">
                                          <span>PB <span className="font-semibold text-white">{row.pbMs == null ? "-" : formatMs(row.pbMs)}</span></span>
                                          <span>Target <span className="font-semibold text-white">{formatMs(row.qualifying_time_ms)}</span></span>
                                        </div>
                                      </div>
                                      <div className="shrink-0 text-right">
                                        <p className="text-lg font-bold text-white">{row.gapMs == null ? "-" : formatMs(Math.abs(row.gapMs))}</p>
                                        <p className={`text-sm font-semibold ${statusClass(row.status)}`}>{qualified ? "Qualified" : inProgress ? "In progress" : row.status}</p>
                                        <p className="mt-1 text-xs text-white/40">{isExpanded ? "Hide" : "Details"}</p>
                                      </div>
                                    </div>
                                  </button>
                                  {isExpanded && (
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                      {[
                                        { label: "PB", val: row.pbMs == null ? "-" : formatMs(row.pbMs) },
                                        { label: "Target", val: formatMs(row.qualifying_time_ms) },
                                        { label: "Gap", val: row.gapMs == null ? "-" : formatMs(Math.abs(row.gapMs)) },
                                        { label: "Status", val: qualified ? "Qualified" : inProgress ? "In progress" : row.status, colorClass: statusClass(row.status) },
                                      ].map(({ label, val, colorClass }) => (
                                        <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                          <p className="text-xs text-white/50">{label}</p>
                                          <p className={`mt-1 text-xl font-bold ${colorClass || "text-white"}`}>{val}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}

        {!isEditingProfile && activeTab === "swimscan" && (
          <section className="card">
            <h2 className="title">SwimScan</h2>
            <p className="mt-2 muted">Scan race results for {swimmer.name}. Results will save automatically.</p>
            <div className="mt-6">
              <SwimScan
                swimmerId={Number(swimmer.id)}
                swimmerName={swimmer.name}
                clubHint={swimmer.swim_club ?? undefined}
                onSaved={() => void loadPage()}
              />
            </div>
          </section>
        )}

        {!isEditingProfile && activeTab === "matchups" && (
          <section className="card">
            <h2 className="title">Matchups</h2>
            <p className="mt-2 muted">Compare {swimmer.name} against other swimmers.</p>
            <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
              <select value={selectedTargetId} onChange={(e) => setSelectedTargetId(e.target.value)} className="input">
                <option value="">Select swimmer to compare</option>
                {availableTargets.map((target) => (<option key={target.id} value={Number(target.id)}>{target.name} — Age {target.age}</option>))}
              </select>
              <button onClick={handleAddMatchup} disabled={savingMatchup || !selectedTargetId} className="btn">{savingMatchup ? "Adding..." : "+ Add Matchup"}</button>
            </div>
            <div className="mt-6">
              {loadingMatchups ? (
                <div className="card-soft"><p className="text-white/70">Loading matchups...</p></div>
              ) : matchups.length === 0 ? (
                <div className="card-soft"><p className="text-white/70">No matchups yet.</p></div>
              ) : (
                <div className="space-y-4">
                  {matchups.map((matchup) => {
                    const target = swimmersById.get(Number(matchup.target_swimmer_id));
                    const targetTimes = matchupTimesMap.get(Number(matchup.target_swimmer_id)) || [];
                    const bestComparison = findBestMatchupComparison(swimTimes, targetTimes);
                    return (
                      <div key={matchup.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h3 className="text-2xl font-bold text-white">{swimmer.name} vs {target?.name || `Swimmer ${matchup.target_swimmer_id}`}</h3>
                            <p className="mt-1 text-white/50">Added {formatCreatedAt(matchup.created_at)}</p>
                            {bestComparison ? (
                              <div className="mt-4 space-y-2">
                                <p className="text-lg font-semibold text-white">Best comparison: {bestComparison.event} ({bestComparison.course})</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="card-soft p-3"><p className="label">{swimmer.name}</p><p className="mt-1 text-xl font-bold text-white">{formatMs(bestComparison.myBestMs)}</p></div>
                                  <div className="card-soft p-3"><p className="label">{target?.name || "Other swimmer"}</p><p className="mt-1 text-xl font-bold text-white">{formatMs(bestComparison.targetBestMs)}</p></div>
                                </div>
                                <p className={`text-sm font-semibold ${bestComparison.diffMs < 0 ? "danger-text" : bestComparison.diffMs > 0 ? "success-text" : "accent-text"}`}>
                                  {bestComparison.diffMs === 0 ? "Same PB for this event." : bestComparison.diffMs < 0 ? `${swimmer.name} is faster by ${formatMs(Math.abs(bestComparison.diffMs))}` : `${target?.name || "Other swimmer"} is faster by ${formatMs(Math.abs(bestComparison.diffMs))}`}
                                </p>
                              </div>
                            ) : (
                              <div className="mt-4 card-soft p-3"><p className="text-white/70">No shared events yet.</p><p className="mt-1 text-sm text-white/45">Both swimmers need a PB in the same event and course.</p></div>
                            )}
                          </div>
                          <button onClick={() => handleDeleteMatchup(matchup.id)} className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20">Remove</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}