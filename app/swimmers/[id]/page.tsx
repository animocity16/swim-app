"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
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
  photo_url?: string | null;
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

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB

export default function SwimmerProfilePage() {
  return (
    <Suspense fallback={null}>
      <SwimmerProfilePageInner />
    </Suspense>
  );
}

function SwimmerProfilePageInner() {
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
  const [userId, setUserId] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editClub, setEditClub] = useState("");
  const [editSchool, setEditSchool] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editSquad, setEditSquad] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void init();
  }, [swimmerId]);

  async function init() {
    if (!swimmerId || isNaN(swimmerId)) { setNotFound(true); setLoading(false); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }
    setUserId(session.user.id);

    const { data, error } = await supabase
      .from("swimmers")
      .select("id, name, age, birth_month, country, swim_club, school, gender, squad, group_type, created_at, user_id, photo_url")
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

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file || !swimmer || !userId) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Image must be under 8MB.");
      return;
    }

    setPhotoError("");
    setPhotoUploading(true);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/swimmer-${swimmer.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("splash-media")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        setPhotoError(`Upload failed: ${uploadError.message}`);
        setPhotoUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("splash-media").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`; // cache-bust so the new photo shows immediately

      const { error: dbError } = await supabase
        .from("swimmers")
        .update({ photo_url: publicUrl })
        .eq("id", swimmer.id);

      if (dbError) {
        setPhotoError(`Couldn't save photo: ${dbError.message}`);
        setPhotoUploading(false);
        return;
      }

      setSwimmer((prev) => prev ? { ...prev, photo_url: publicUrl } : prev);
    } catch {
      setPhotoError("Something went wrong uploading the photo.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleRemovePhoto() {
    if (!swimmer) return;
    setPhotoError("");
    setPhotoUploading(true);
    const { error } = await supabase.from("swimmers").update({ photo_url: null }).eq("id", swimmer.id);
    if (error) {
      setPhotoError(`Couldn't remove photo: ${error.message}`);
    } else {
      setSwimmer((prev) => prev ? { ...prev, photo_url: null } : prev);
    }
    setPhotoUploading(false);
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
            Swimmers
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
      <div className="container-app space-y-5 pb-28 md:max-w-2xl">

        {/* Top bar */}
        <div className="flex items-center justify-between pt-2">
          <Link
            href="/swimmers"
            className="flex items-center gap-2 text-sm font-medium text-white/55 transition hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 3L5 8L10 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Swimmers
          </Link>

          <button
            type="button"
            onClick={startEdit}
            className="flex items-center gap-1.5 rounded-2xl border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/65 transition hover:bg-white/10"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Edit
          </button>
        </div>

        {/* Profile hero */}
        <section
          className="relative overflow-hidden rounded-[30px]"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.99) 0%, rgba(226,243,255,0.98) 100%)",
            border: "1px solid rgba(255,255,255,0.92)",
            boxShadow: "0 18px 42px rgba(0,25,55,0.16)",
          }}
        >
          <div
            className="absolute -right-10 -top-12 h-44 w-44 rounded-full"
            style={{ background: "rgba(48,158,246,0.08)" }}
          />
          <div
            className="absolute right-16 top-20 h-20 w-44 rotate-[-8deg] rounded-full"
            style={{ background: "rgba(48,158,246,0.05)" }}
          />

          <div className="relative p-5">
            <div className="flex items-start gap-4">
              {/* Avatar / photo control */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoUploading}
                  className="relative block rounded-full disabled:opacity-70"
                  aria-label={swimmer.photo_url ? "Change swimmer photo" : "Add swimmer photo"}
                >
                  {swimmer.photo_url ? (
                    <img
                      src={swimmer.photo_url}
                      alt={swimmer.name}
                      className="h-24 w-24 rounded-full object-cover"
                      style={{
                        border: "4px solid rgba(255,255,255,0.92)",
                        boxShadow: "0 10px 24px rgba(11,42,84,0.18)",
                      }}
                    />
                  ) : (
                    <div
                      className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-black"
                      style={{
                        background: "linear-gradient(135deg,#185FA5,#2D8BD8)",
                        color: "#D8ECFF",
                        border: "4px solid rgba(255,255,255,0.92)",
                        boxShadow: "0 10px 24px rgba(11,42,84,0.18)",
                      }}
                    >
                      {getInitials(swimmer.name)}
                    </div>
                  )}

                  <span
                    className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      background: "#0B2A54",
                      border: "3px solid white",
                      color: "white",
                    }}
                  >
                    {photoUploading ? (
                      <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeOpacity="0.3" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="white" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M2 3.5C2 3.22386 2.22386 3 2.5 3H4.5L5.3 1.7C5.39 1.55 5.55 1.5 5.7 1.5H10.3C10.45 1.5 10.61 1.55 10.7 1.7L11.5 3H13.5C13.7761 3 14 3.22386 14 3.5V12.5C14 12.7761 13.7761 13 13.5 13H2.5C2.22386 13 2 12.7761 2 12.5V3.5Z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                        <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                    )}
                  </span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>

              <div className="min-w-0 flex-1 pt-1">
                <div className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: "#4F91C8" }}>
                  Swimmer profile
                </div>
                <h1 className="mt-1 truncate text-2xl font-black tracking-tight" style={{ color: "#0B2A54" }}>
                  {swimmer.name}
                </h1>
                <p className="mt-1 text-sm" style={{ color: "#60758B" }}>
                  Age {swimmer.age}
                  {swimmer.gender ? ` · ${swimmer.gender}` : ""}
                </p>
                {swimmer.swim_club && (
                  <p className="mt-1 truncate text-sm font-medium" style={{ color: "#416889" }}>
                    {swimmer.swim_club}
                  </p>
                )}
                {swimmer.school && (
                  <p className="mt-0.5 truncate text-xs" style={{ color: "#7B90A3" }}>
                    {swimmer.school}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {isPrimary && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold"
                  style={{
                    background: "#E6F3FC",
                    border: "1px solid #C8E2F5",
                    color: "#185FA5",
                  }}
                >
                  My Swimmer
                </span>
              )}
              {swimmer.squad && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold"
                  style={{
                    background: "#F3F8FC",
                    border: "1px solid #DCE8F1",
                    color: "#60758B",
                  }}
                >
                  {swimmer.squad} Squad
                </span>
              )}
              {swimmer.group_type === "following" && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold"
                  style={{
                    background: "#EEF8FD",
                    border: "1px solid #D3ECF8",
                    color: "#1685B6",
                  }}
                >
                  Following
                </span>
              )}
            </div>

            <p className="mt-4 text-[11px]" style={{ color: "#8295A6" }}>
              Tap the photo or initials to personalise this swimmer.
            </p>

            {photoError && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                {photoError}
              </p>
            )}

            {swimmer.photo_url && !photoUploading && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="mt-3 text-[11px] font-medium underline decoration-dotted"
                style={{ color: "#7B90A3" }}
              >
                Remove photo
              </button>
            )}
          </div>
        </section>

        {/* Profile navigation */}
        <div>
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Performance
          </p>
          <div
            className="grid grid-cols-4 gap-1 rounded-[22px] p-1.5"
            style={{
              background: "rgba(6,31,66,0.72)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
            }}
          >
            {(["times", "progress", "standards", "diary"] as Tab[]).map((tab) => {
              const labels: Record<Tab, string> = {
                times: "Results",
                progress: "Progress",
                standards: "Standards",
                diary: "Diary",
              };
              const active = activeTab === tab;

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className="min-w-0 rounded-[16px] px-1 py-2.5 text-center text-[11px] font-bold tracking-tight transition"
                  style={
                    active
                      ? {
                          background: "linear-gradient(135deg,#FFFFFF,#E8F5FD)",
                          color: "#0B2A54",
                          boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                        }
                      : {
                          color: "rgba(255,255,255,0.48)",
                          background: "transparent",
                        }
                  }
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Existing feature components — logic intentionally unchanged */}
        <section className="space-y-4">
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
        </section>

        <div className="h-4" />
      </div>
    </div>
  );
}
