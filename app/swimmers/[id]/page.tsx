"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SwimTimesSection from "./SwimTimesSection";
import ProgressTab from "./ProgressTab";
import StandardsTab from "./StandardsTab";
import DiaryTab from "./DiaryTab";

type Swimmer = {
  id: number;
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

type Tab = "times" | "progress" | "standards" | "diary";

const AVATAR_COLORS = [
  { bg: "#0F6E56", text: "#9FE1CB" },
  { bg: "#185FA5", text: "#B5D4F4" },
  { bg: "#854F0B", text: "#FAC775" },
  { bg: "#72243E", text: "#F4C0D1" },
  { bg: "#3C3489", text: "#CECBF6" },
];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

export default function SwimmerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawId = params?.id;
  const swimmerId = typeof rawId === "string" ? Number(rawId) : Array.isArray(rawId) ? Number(rawId[0]) : null;

  const initialTab = (searchParams?.get("tab") as Tab) ?? "times";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const [swimmer, setSwimmer] = useState<Swimmer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editClub, setEditClub] = useState("");
  const [editSchool, setEditSchool] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editSquad, setEditSquad] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    void init();
  }, [swimmerId]);

  async function init() {
    if (!swimmerId || isNaN(swimmerId)) { setNotFound(true); setLoading(false); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    const { data, error } = await supabase
      .from("swimmers")
      .select("id, name, age, birth_month, country, swim_club, school, gender, squad, group_type, created_at, user_id")
      .eq("id", swimmerId)
      .single();

    if (error || !data) { setNotFound(true); setLoading(false); return; }

    setSwimmer(data as Swimmer);
    setLoading(false);
  }

  function startEdit() {
    if (!swimmer) return;
    setEditName(swimmer.name ?? "");
    setEditAge(String(swimmer.age ?? ""));
    setEditClub(swimmer.swim_club ?? "");
    setEditSchool(swimmer.school ?? "");
    setEditGender(swimmer.gender ?? "");
    setEditSquad(swimmer.squad ?? "");
    setSaveMsg("");
    setEditing(true);
  }

  async function saveEdit() {
    if (!swimmer) return;
    setSaving(true);
    setSaveMsg("");
    const { error } = await supabase.from("swimmers").update({
      name: editName.trim() || swimmer.name,
      age: editAge ? Number(editAge) : swimmer.age,
      swim_club: editClub.trim() || null,
      school: editSchool.trim() || null,
      gender: editGender || null,
      squad: editSquad.trim() || null,
    }).eq("id", swimmer.id);

    if (error) {
      setSaveMsg(`Error: ${error.message}`);
    } else {
      setSwimmer((prev) => prev ? {
        ...prev,
        name: editName.trim() || prev.name,
        age: editAge ? Number(editAge) : prev.age,
        swim_club: editClub.trim() || null,
        school: editSchool.trim() || null,
        gender: editGender || null,
        squad: editSquad.trim() || null,
      } : prev);
      setEditing(false);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app space-y-5">
          <div className="flex items-center gap-3 pt-2">
            <div className="h-8 w-8 rounded-xl bg-white/10 animate-pulse" />
            <div className="h-5 w-32 rounded-full bg-white/10 animate-pulse" />
          </div>
          <div className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 animate-pulse">
            <div className="h-16 w-16 rounded-2xl bg-white/10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-2/3 rounded-full bg-white/10" />
              <div className="h-3 w-1/2 rounded-full bg-white/5" />
            </div>
          </div>
          <div className="h-10 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !swimmer) {
    return (
      <div className="shell">
        <div className="container-app space-y-5">
          <Link href="/swimmers" className="flex items-center gap-2 text-white/50 text-sm pt-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Brood
          </Link>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-lg font-semibold text-white">Swimmer not found</p>
            <p className="mt-1 text-sm text-white/40">This profile may have been removed.</p>
          </div>
        </div>
      </div>
    );
  }

  const colors = avatarColor(swimmer.id);
  const isPrimary = swimmer.group_type === "primary";
  const avatarBg   = isPrimary ? "var(--natrix-avatar-colour, " + colors.bg + ")" : colors.bg;
  const avatarText = isPrimary ? "var(--natrix-avatar-text, " + colors.text + ")" : colors.text;

  if (editing) {
    return (
      <div className="shell">
        <div className="container-app space-y-5">
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={() => setEditing(false)}
              className="flex items-center gap-2 text-white/50 text-sm">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Cancel
            </button>
            <p className="text-sm font-semibold text-white">Edit profile</p>
            <button type="button" onClick={saveEdit} disabled={saving}
              className="text-sm font-semibold disabled:opacity-40"
              style={{ color: "#FDE68A" }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div>
              <p className="text-xs text-white/40 mb-1.5 px-1">Name</p>
              <input value={editName} onChange={(e) => setEditName(e.target.value)}
                placeholder="Full name" className="input" />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1.5 px-1">Age</p>
              <input value={editAge} onChange={(e) => setEditAge(e.target.value.replace(/\D/g, ""))}
                placeholder="Age" inputMode="numeric" className="input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["Male", "Female"] as const).map((g) => (
                <button key={g} type="button" onClick={() => setEditGender(editGender === g ? "" : g)}
                  className="rounded-2xl border py-2.5 text-sm font-medium transition"
                  style={editGender === g
                    ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
                  {g === "Male" ? "♂ Male" : "♀ Female"}
                </button>
              ))}
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1.5 px-1">Swim club</p>
              <input value={editClub} onChange={(e) => setEditClub(e.target.value)}
                placeholder="Swim club (optional)" className="input" />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1.5 px-1">School</p>
              <input value={editSchool} onChange={(e) => setEditSchool(e.target.value)}
                placeholder="School (optional)" className="input" />
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1.5 px-1">Squad</p>
              <input value={editSquad} onChange={(e) => setEditSquad(e.target.value)}
                placeholder="Squad (optional)" className="input" />
            </div>
            {saveMsg && <p className="text-sm text-red-300 px-1">{saveMsg}</p>}
          </div>

          <div className="h-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        <div className="flex items-center justify-between pt-2">
          <Link href="/swimmers" className="flex items-center gap-2 text-white/50 text-sm">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Brood
          </Link>
          <button type="button" onClick={startEdit}
            className="flex items-center gap-1.5 rounded-2xl border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/10">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Edit
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
              style={{ background: avatarBg, color: avatarText }}>
              {getInitials(swimmer.name)}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white truncate">{swimmer.name}</h1>
              <p className="mt-0.5 text-sm text-white/50">
                Age {swimmer.age}
                {swimmer.gender ? ` · ${swimmer.gender}` : ""}
                {swimmer.swim_club ? ` · ${swimmer.swim_club}` : ""}
              </p>
              {swimmer.school && (
                <p className="mt-0.5 text-xs text-white/35 truncate">{swimmer.school}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {isPrimary && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.25)", color: "#FDE68A" }}>
                My Swimmer
              </span>
            )}
            {swimmer.squad && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" }}>
                {swimmer.squad} Squad
              </span>
            )}
            {swimmer.group_type === "following" && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", color: "#7DD3FC" }}>
                Following
              </span>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1.5 overflow-x-auto rounded-2xl p-1.5 scrollbar-none"
          style={{ background: "rgba(0,20,50,0.3)", border: "1px solid rgba(255,255,255,0.1)" }}>
          {(["times", "progress", "standards", "diary"] as Tab[]).map((tab) => {
            const labels: Record<Tab, string> = { times: "Times", progress: "Progress", standards: "Standards", diary: "Diary" };
            const active = activeTab === tab;
            return (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className="flex-shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition"
                style={active
                  ? { background: "rgba(217,119,6,0.2)", color: "#FDE68A", border: "1px solid rgba(253,230,138,0.35)" }
                  : { color: "rgba(255,255,255,0.4)", border: "1px solid transparent" }}>
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {activeTab === "times" && (
          <SwimTimesSection
            swimmerId={swimmer.id}
            swimmerAge={swimmer.age}
            swimmerName={swimmer.name}
          />
        )}

        {activeTab === "progress" && (
          <ProgressTab swimmerId={swimmer.id} swimmerName={swimmer.name} />
        )}

        {activeTab === "standards" && (
          <StandardsTab
            swimmerId={swimmer.id}
            swimmerAge={swimmer.age}
            swimmerGender={swimmer.gender}
            swimmerSquad={swimmer.squad}
          />
        )}

        {activeTab === "diary" && (
          <DiaryTab swimmerId={swimmer.id} swimmerName={swimmer.name} />
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
