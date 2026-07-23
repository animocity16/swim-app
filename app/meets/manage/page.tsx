"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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
        <div className="container-app pt-10 text-center muted">Checking access...</div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        <div className="pt-2 pb-1">
          <Link href="/meets" className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>← Back to meets</Link>
          <p className="label mt-2" style={{ color: "#BA7517", marginBottom: "4px" }}>Natrix</p>
          <h1 className="title">My Meets</h1>
          <p className="mt-2 text-sm muted">
            Add meets your club is swimming that aren&apos;t on the calendar yet. These are only visible to you — official Natrix meets show up automatically for everyone.
          </p>
        </div>

        {/* Form */}
        <div className="card space-y-4">
          <p className="text-sm font-bold" style={{ color: "#FDE68A" }}>
            {form.id ? "Editing your meet" : "Add a meet"}
          </p>

          <div className="space-y-1.5">
            <label className="label">Meet name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. CSC Invitational 2026"
            />
          </div>

          <div className="space-y-1.5">
            <label className="label">Start date</label>
            <div className="input" style={{ padding: 0, overflow: "hidden", display: "flex", alignItems: "center" }}>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                style={{
                  width: "100%", height: "100%", minWidth: 0,
                  background: "transparent", border: "none", outline: "none",
                  color: "#fff", padding: "0 16px", colorScheme: "dark",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="label">End date (optional)</label>
            <div className="input" style={{ padding: 0, overflow: "hidden", display: "flex", alignItems: "center" }}>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                style={{
                  width: "100%", height: "100%", minWidth: 0,
                  background: "transparent", border: "none", outline: "none",
                  color: "#fff", padding: "0 16px", colorScheme: "dark",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="label">Type</label>
              <select
                className="input"
                value={form.meet_type}
                onChange={(e) => setForm({ ...form, meet_type: e.target.value })}
              >
                {MEET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label">Location</label>
              <input
                className="input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. OCBC Aquatic"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="label">Notes</label>
            <textarea
              className="input"
              style={{ height: "auto", minHeight: "70px", paddingTop: "12px", paddingBottom: "12px" }}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anything worth remembering"
            />
          </div>

          {error && <p className="text-sm" style={{ color: "#fca5a5" }}>{error}</p>}

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving} className="btn-block flex-1">
              {saving ? "Saving..." : form.id ? "Save changes" : "Add meet"}
            </button>
            {form.id && (
              <button onClick={resetForm} className="btn-outline">
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          <p className="label">Your meets</p>
          {loading ? (
            <p className="muted text-sm">Loading...</p>
          ) : meets.length === 0 ? (
            <p className="muted text-sm">You haven&apos;t added any meets yet.</p>
          ) : (
            meets.map((meet) => (
              <div key={meet.id} className="card-soft flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{meet.name}</p>
                  <p className="text-xs muted mt-0.5 truncate">
                    {[fmt(meet.start_date), meet.meet_type, meet.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button onClick={() => startEdit(meet)} className="btn flex-shrink-0">
                  Edit
                </button>
                <button onClick={() => setPendingDelete(meet)} className="btn-danger flex-shrink-0">
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
            style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
          />
          <div
            className="card"
            style={{
              position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
              width: "100%", maxWidth: "480px", zIndex: 51,
              borderBottom: "none", borderRadius: "28px 28px 0 0", paddingBottom: "40px",
            }}
          >
            <p className="text-center text-lg font-bold text-white mb-1.5">Cancel this meet?</p>
            <p className="text-center text-sm muted mb-5">{pendingDelete.name}</p>
            <div className="space-y-2.5">
              <button onClick={handleCancelMeet} className="btn-danger w-full h-14" style={{ background: "rgba(220,38,38,0.9)", color: "#fff", borderColor: "rgba(220,38,38,0.9)" }}>
                Cancel meet
              </button>
              <button onClick={() => setPendingDelete(null)} className="btn-outline w-full h-14">
                Keep it
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}