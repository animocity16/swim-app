"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// ─── New-look design tokens (matches Settings/Swimmers/Dashboard/Compare/Meets) ─

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(255,255,255,0.9)",
  boxShadow: "0 10px 24px rgba(0,25,55,0.10)",
};
const INK = "#0B2A54";
const MUTED = "#71859A";
const ACCENT = "var(--natrix-font-colour, #168AE8)";
const inputStyle: React.CSSProperties = {
  background: "#F7FAFC",
  border: "1px solid #DFEAF2",
  color: INK,
  borderRadius: "16px",
  padding: "12px 16px",
  fontSize: "14px",
  width: "100%",
  boxSizing: "border-box",
};

type MyMeet = {
  id: string;
  name: string;
  location: string | null;
  meet_type: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_by: string | null;
};

const MEET_TYPES = ["Club Meet", "SAQ Meet", "International Meet", "Overseas Meet", "Other"];

const emptyForm = {
  id: null as string | null,
  name: "",
  location: "",
  meet_type: "Club Meet",
  start_date: "",
  end_date: "",
  notes: "",
};

function fmt(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function MyMeetsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [meets, setMeets] = useState<MyMeet[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MyMeet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void checkAccess(); }, []);

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    setUserId(user.id);
    setAuthChecked(true);
    void load(user.id);
  }

  async function load(uid: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("upcoming_meets")
      .select("*")
      .eq("created_by", uid)
      .order("start_date", { ascending: true });
    if (!error && data) setMeets(data as MyMeet[]);
    setLoading(false);
  }

  function startEdit(meet: MyMeet) {
    setForm({
      id: meet.id,
      name: meet.name,
      location: meet.location ?? "",
      meet_type: meet.meet_type ?? "Club Meet",
      start_date: meet.start_date,
      end_date: meet.end_date ?? "",
      notes: meet.notes ?? "",
    });
  }

  function resetForm() {
    setForm(emptyForm);
    setError(null);
  }

  async function handleSave() {
    if (!userId) return;
    if (!form.name.trim() || !form.start_date) {
      setError("Meet name and start date are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      location: form.location.trim() || null,
      meet_type: form.meet_type || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      notes: form.notes.trim() || null,
      created_by: userId,
    };

    const result = form.id
      ? await supabase.from("upcoming_meets").update(payload).eq("id", form.id).eq("created_by", userId)
      : await supabase.from("upcoming_meets").insert(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    resetForm();
    void load(userId);
  }

  async function handleCancelMeet() {
    if (!pendingDelete || !userId) return;
    await supabase.from("upcoming_meets").delete().eq("id", pendingDelete.id).eq("created_by", userId);
    setPendingDelete(null);
    void load(userId);
  }

  if (!authChecked) {
    return (
      <div className="shell">
        <div className="container-app pt-10 text-center" style={{ color: MUTED }}>Checking access...</div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        <div className="pt-2 pb-1">
          <Link href="/meets" className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>← Back to meets</Link>
          <div className="flex items-start justify-between mt-3">
            <div>
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.16em]" style={{ color: ACCENT, marginBottom: "4px" }}>Natrix</p>
              <h1 className="text-3xl font-bold tracking-tight text-white">My Meets</h1>
            </div>
            <img src="/natrix-mascot-search.png" alt="Natrix" className="h-[56px] w-[56px] object-contain" />
          </div>
          <p className="mt-2 text-sm text-white/65">
            Add meets your club is swimming that aren&apos;t on the calendar yet. These are only visible to you — official Natrix meets show up automatically for everyone.
          </p>
        </div>

        {/* Form */}
        <div className="rounded-[28px] p-5 space-y-4" style={CARD}>
          <p className="text-sm font-bold" style={{ color: ACCENT }}>
            {form.id ? "Editing your meet" : "Add a meet"}
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: MUTED }}>Meet name</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. CSC Invitational 2026"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: MUTED }}>Start date</label>
            <div style={{ ...inputStyle, padding: 0, overflow: "hidden", display: "flex", alignItems: "center" }}>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                style={{
                  width: "100%", height: "100%", minWidth: 0,
                  background: "transparent", border: "none", outline: "none",
                  color: INK, padding: "12px 16px", colorScheme: "light",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: MUTED }}>End date (optional)</label>
            <div style={{ ...inputStyle, padding: 0, overflow: "hidden", display: "flex", alignItems: "center" }}>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                style={{
                  width: "100%", height: "100%", minWidth: 0,
                  background: "transparent", border: "none", outline: "none",
                  color: INK, padding: "12px 16px", colorScheme: "light",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: MUTED }}>Type</label>
              <select
                style={inputStyle}
                value={form.meet_type}
                onChange={(e) => setForm({ ...form, meet_type: e.target.value })}
              >
                {MEET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: MUTED }}>Location</label>
              <input
                style={inputStyle}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. OCBC Aquatic"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: MUTED }}>Notes</label>
            <textarea
              style={{ ...inputStyle, height: "auto", minHeight: "70px", paddingTop: "12px", paddingBottom: "12px", resize: "none" }}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anything worth remembering"
            />
          </div>

          {error && <p className="text-sm" style={{ color: "#C0392B" }}>{error}</p>}

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: ACCENT }}>
              {saving ? "Saving..." : form.id ? "Save changes" : "Add meet"}
            </button>
            {form.id && (
              <button onClick={resetForm}
                className="rounded-2xl px-5 py-3 text-sm font-semibold transition"
                style={{ background: "#F7FAFC", border: "1px solid #E1EDF5", color: INK }}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>Your meets</p>
          {loading ? (
            <p className="text-sm" style={{ color: MUTED }}>Loading...</p>
          ) : meets.length === 0 ? (
            <p className="text-sm" style={{ color: MUTED }}>You haven&apos;t added any meets yet.</p>
          ) : (
            meets.map((meet) => (
              <div key={meet.id} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: "#F7FAFC", border: "1px solid #E1EDF5" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: INK }}>{meet.name}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>
                    {[fmt(meet.start_date), meet.meet_type, meet.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button onClick={() => startEdit(meet)} className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold"
                  style={{ background: "#EEF5FA", border: "1px solid #D6ECFB", color: ACCENT }}>
                  Edit
                </button>
                <button onClick={() => setPendingDelete(meet)} className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold"
                  style={{ background: "rgba(220,80,80,0.08)", border: "1px solid rgba(220,80,80,0.25)", color: "#C0392B" }}>
                  Cancel
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Cancel confirm sheet */}
      {pendingDelete && (
        <>
          <div
            onClick={() => setPendingDelete(null)}
            style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(11,42,84,0.45)", backdropFilter: "blur(6px)" }}
          />
          <div
            style={{
              position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
              width: "100%", maxWidth: "480px", zIndex: 51,
              background: "#FFFFFF",
              border: "1px solid rgba(255,255,255,0.9)",
              borderBottom: "none", borderRadius: "28px 28px 0 0",
              padding: "20px 20px 40px",
              boxShadow: "0 -10px 30px rgba(0,25,55,0.16)",
            }}
          >
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#E1EDF5", margin: "0 auto 20px" }} />
            <p className="text-center text-lg font-bold mb-1.5" style={{ color: INK }}>Cancel this meet?</p>
            <p className="text-center text-sm mb-5" style={{ color: MUTED }}>{pendingDelete.name}</p>
            <div className="space-y-2.5">
              <button onClick={handleCancelMeet}
                className="w-full h-14 rounded-2xl text-sm font-semibold"
                style={{ background: "#DC2626", color: "#fff" }}>
                Cancel meet
              </button>
              <button onClick={() => setPendingDelete(null)}
                className="w-full h-14 rounded-2xl text-sm font-semibold"
                style={{ background: "#F7FAFC", border: "1px solid #E1EDF5", color: INK }}>
                Keep it
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
