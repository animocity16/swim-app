"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_USER_ID = "9156c797-d133-4a7f-aa93-03688f2bdfd1";

type UpcomingMeet = {
  id: string;
  name: string;
  location: string | null;
  meet_type: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

const MEET_TYPES = ["SNAG", "ETC", "NSG", "NSC", "Other"];

const emptyForm = {
  id: null as string | null,
  name: "",
  location: "",
  meet_type: "SNAG",
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

export default function AdminMeetsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [meets, setMeets] = useState<UpcomingMeet[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UpcomingMeet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void checkAccess(); }, []);

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    if (user.id !== ADMIN_USER_ID) { router.replace("/dashboard"); return; }
    setAllowed(true);
    setAuthChecked(true);
    void load();
  }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("upcoming_meets")
      .select("*")
      .order("start_date", { ascending: true });
    if (!error && data) setMeets(data as UpcomingMeet[]);
    setLoading(false);
  }

  function startEdit(meet: UpcomingMeet) {
    setForm({
      id: meet.id,
      name: meet.name,
      location: meet.location ?? "",
      meet_type: meet.meet_type ?? "SNAG",
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
    };

    const result = form.id
      ? await supabase.from("upcoming_meets").update(payload).eq("id", form.id)
      : await supabase.from("upcoming_meets").insert(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    resetForm();
    void load();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    await supabase.from("upcoming_meets").delete().eq("id", pendingDelete.id);
    setPendingDelete(null);
    void load();
  }

  if (!authChecked) {
    return (
      <div className="shell">
        <div className="container-app pt-10 text-center muted">Checking access...</div>
      </div>
    );
  }
  if (!allowed) return null;

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        <div className="pt-2">
          <p className="label" style={{ color: "#BA7517" }}>Natrix Admin</p>
          <h1 className="title mt-1">Upcoming Meets</h1>
          <p className="mt-1 text-sm muted">
            Add, edit, or remove meets on the calendar. Changes go live instantly.
          </p>
        </div>

        {/* Form */}
        <div className="card space-y-4">
          <p className="text-sm font-bold" style={{ color: "#FDE68A" }}>
            {form.id ? "Editing meet" : "Add a new meet"}
          </p>

          <div className="space-y-1.5">
            <label className="label">Meet name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. National Age Group 2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="label">Start date</label>
              <input
                type="date"
                className="input"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="label">End date</label>
              <input
                type="date"
                className="input"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
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
              placeholder="Anything parents should know"
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
          {loading ? (
            <p className="muted text-sm">Loading...</p>
          ) : meets.length === 0 ? (
            <p className="muted text-sm">No meets added yet.</p>
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
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete confirm sheet */}
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
            <p className="text-center text-lg font-bold text-white mb-1.5">Delete this meet?</p>
            <p className="text-center text-sm muted mb-5">{pendingDelete.name}</p>
            <div className="space-y-2.5">
              <button onClick={handleDelete} className="btn-danger w-full h-14" style={{ background: "rgba(220,38,38,0.9)", color: "#fff", borderColor: "rgba(220,38,38,0.9)" }}>
                Delete
              </button>
              <button onClick={() => setPendingDelete(null)} className="btn-outline w-full h-14">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}