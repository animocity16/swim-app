"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Only this account can see/use this page.
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.45)",
  marginBottom: "6px",
  display: "block",
};

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

  useEffect(() => {
    void checkAccess();
  }, []);

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
    return <div className="shell"><div className="container-app pt-10 text-center text-white/40">Checking access...</div></div>;
  }
  if (!allowed) return null;

  return (
    <div className="shell">
      <div className="container-app space-y-5 pb-24">

        <div className="pt-2">
          <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "#BA7517" }}>
            Natrix Admin
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Upcoming Meets</h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            Add or edit meets on the calendar. Changes are live instantly — no code, no deploy.
          </p>
        </div>

        {/* Form */}
        <div
          className="rounded-3xl p-5 space-y-4"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#FDE68A" }}>
            {form.id ? "Editing meet" : "Add a new meet"}
          </p>

          <div>
            <label style={labelStyle}>Meet name</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. National Age Group 2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Start date</label>
              <input
                type="date"
                style={inputStyle}
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}>End date (optional)</label>
              <input
                type="date"
                style={inputStyle}
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Type</label>
              <select
                style={inputStyle}
                value={form.meet_type}
                onChange={(e) => setForm({ ...form, meet_type: e.target.value })}
              >
                {MEET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <input
                style={inputStyle}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. OCBC Aquatic Centre"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea
              style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anything parents should know"
            />
          </div>

          {error && <p style={{ color: "#F87171", fontSize: "13px" }}>{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1,
                padding: "13px",
                borderRadius: "14px",
                border: "none",
                background: saving ? "rgba(217,119,6,0.5)" : "#D97706",
                color: "#fff",
                fontWeight: 700,
                fontSize: "14px",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : form.id ? "Save changes" : "Add meet"}
            </button>
            {form.id && (
              <button
                onClick={resetForm}
                style={{
                  padding: "13px 18px",
                  borderRadius: "14px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.75)",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {loading ? (
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Loading...</p>
          ) : meets.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>No meets added yet.</p>
          ) : (
            meets.map((meet) => (
              <div
                key={meet.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "18px",
                  padding: "12px 14px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{meet.name}</p>
                  <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
                    {[fmt(meet.start_date), meet.meet_type, meet.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(meet)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(253,230,138,0.25)",
                    background: "rgba(217,119,6,0.15)",
                    color: "#FDE68A",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setPendingDelete(meet)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(239,68,68,0.25)",
                    background: "rgba(239,68,68,0.12)",
                    color: "#FCA5A5",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {pendingDelete && (
        <>
          <div
            onClick={() => setPendingDelete(null)}
            style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
          />
          <div
            style={{
              position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
              width: "100%", maxWidth: "480px", zIndex: 51,
              background: "rgba(6,25,45,0.98)", border: "1px solid rgba(255,255,255,0.14)",
              borderBottom: "none", borderRadius: "28px 28px 0 0", padding: "20px 20px 40px",
            }}
          >
            <p style={{ fontSize: "17px", fontWeight: 700, color: "#fff", marginBottom: "6px", textAlign: "center" }}>
              Delete this meet?
            </p>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", marginBottom: "18px", textAlign: "center" }}>
              {pendingDelete.name}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={handleDelete}
                style={{ padding: "15px", borderRadius: "16px", border: "none", background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: "15px", cursor: "pointer" }}
              >
                Delete
              </button>
              <button
                onClick={() => setPendingDelete(null)}
                style={{ padding: "15px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)", fontWeight: 600, fontSize: "15px", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}