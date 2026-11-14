"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { extractStartListText } from "@/lib/startListExtract";
import { parseAllStartListEntries, type StartListParseResult } from "@/lib/startListParser";

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

const MEET_TYPES = ["Club Meet", "SAQ Meet", "International Meet", "Overseas Meet", "Other"];

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

  // ── Central start list upload ──
  const [slMeetId, setSlMeetId] = useState("");
  const [slDate, setSlDate] = useState("");
  const [slReading, setSlReading] = useState(false);
  const [slStatus, setSlStatus] = useState<string | null>(null);
  const [slResult, setSlResult] = useState<StartListParseResult | null>(null);
  const [slFileName, setSlFileName] = useState("");
  const [slSaving, setSlSaving] = useState(false);
  const [slError, setSlError] = useState<string | null>(null);
  const [slDone, setSlDone] = useState<string | null>(null);
  // What is already saved for the chosen meet: one line per day.
  const [slSaved, setSlSaved] = useState<{ event_date: string; count: number }[]>([]);

  useEffect(() => { void checkAccess(); }, []);

  useEffect(() => {
    if (!slMeetId) { setSlSaved([]); return; }
    void loadSavedStartLists(slMeetId);
  }, [slMeetId]);

  async function loadSavedStartLists(meetId: string) {
    const counts = new Map<string, number>();
    let from = 0;
    // Page through the table (the API returns at most 1000 rows per request).
    for (;;) {
      const { data, error: err } = await supabase
        .from("meet_start_list_entries")
        .select("event_date")
        .eq("meet_id", meetId)
        .range(from, from + 999);
      if (err || !data) break;
      for (const r of data as { event_date: string }[]) {
        counts.set(r.event_date, (counts.get(r.event_date) ?? 0) + 1);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
    setSlSaved([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([event_date, count]) => ({ event_date, count })));
  }

  function pickStartListMeet(id: string) {
    setSlMeetId(id);
    setSlResult(null);
    setSlDone(null);
    setSlError(null);
    const m = meets.find((x) => String(x.id) === id);
    if (m && !slDate) setSlDate(m.start_date);
  }

  async function handleStartListFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    if (!slMeetId) { setSlError("Pick the meet first."); return; }
    if (!slDate) { setSlError("Pick which day this start list is for first."); return; }

    setSlReading(true);
    setSlError(null);
    setSlDone(null);
    setSlResult(null);
    setSlFileName(file.name);
    try {
      const { text } = await extractStartListText(file, (msg) => setSlStatus(msg));
      const result = parseAllStartListEntries(text);
      if (result.entries.length === 0) {
        setSlError("No swimmers found in this PDF. Check it is a start list (not results).");
      } else {
        setSlResult(result);
      }
    } catch (err) {
      setSlError(err instanceof Error ? err.message : String(err));
    }
    setSlReading(false);
    setSlStatus(null);
  }

  async function saveStartList() {
    if (!slResult || !slMeetId || !slDate) return;
    setSlSaving(true);
    setSlError(null);
    setSlDone(null);
    try {
      const eventNumbers = slResult.events.filter((ev) => !ev.isRelay).map((ev) => ev.eventNumber);

      // Re-uploading a corrected list replaces those events (so scratched
      // swimmers disappear) without touching other events saved for the day.
      const { error: delErr } = await supabase
        .from("meet_start_list_entries")
        .delete()
        .eq("meet_id", slMeetId)
        .eq("event_date", slDate)
        .in("event_number", eventNumbers);
      if (delErr) throw new Error(delErr.message);

      const rows = slResult.entries.map((en) => ({
        meet_id: slMeetId,
        event_date: slDate,
        event_number: en.eventNumber,
        event_name: en.eventName,
        distance: en.distance,
        stroke: en.stroke,
        category: en.category || null,
        heat: en.heat,
        lane: en.lane,
        seed_time: en.seedTime,
        start_time: en.startTime,
        swimmer_name: en.swimmerName,
        age: en.age,
        team: en.team,
      }));
      for (let i = 0; i < rows.length; i += 400) {
        const { error: insErr } = await supabase.from("meet_start_list_entries").insert(rows.slice(i, i + 400));
        if (insErr) throw new Error(insErr.message);
      }

      // Copy the races into every matching parent's Meets right now (and so
      // reminders work without the parent opening the meet first).
      let syncNote = "";
      try {
        const res = await fetch("/api/sync-start-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetId: slMeetId, eventDate: slDate, eventNumbers }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Sync failed");
        syncNote = ` Sent ${json.added} race${json.added === 1 ? "" : "s"} to ${json.accounts} account${json.accounts === 1 ? "" : "s"} (${json.swimmers} swimmer${json.swimmers === 1 ? "" : "s"}).`;
      } catch (syncErr) {
        syncNote = ` Saved, but the instant copy to parents failed (${syncErr instanceof Error ? syncErr.message : String(syncErr)}). They will still get their races when they open the meet.`;
      }

      setSlDone(`Saved ${rows.length} swimmer entries.${syncNote}`);
      setSlResult(null);
      void loadSavedStartLists(slMeetId);
    } catch (err) {
      setSlError(err instanceof Error ? err.message : String(err));
    }
    setSlSaving(false);
  }

  async function removeSavedDay(day: string) {
    if (!slMeetId) return;
    if (!window.confirm(`Remove ALL saved start list entries for ${day}? Parents who already have these events keep them.`)) return;
    const { error: delErr } = await supabase
      .from("meet_start_list_entries")
      .delete()
      .eq("meet_id", slMeetId)
      .eq("event_date", day);
    if (delErr) { setSlError(delErr.message); return; }
    void loadSavedStartLists(slMeetId);
  }

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

        <div className="pt-2 pb-1">
          <p className="label" style={{ color: "#BA7517", marginBottom: "4px" }}>Natrix Admin</p>
          <h1 className="title">Upcoming Meets</h1>
          <p className="mt-2 text-sm muted">
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

        {/* Central start list upload */}
        <div className="card space-y-4">
          <div>
            <p className="text-sm font-bold" style={{ color: "#FDE68A" }}>Start list for everyone</p>
            <p className="text-xs muted mt-1">
              Upload a start list PDF once. Every parent who has one of these swimmers
              as their own swimmer sees the events in Meets. One PDF per day.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="label">Meet</label>
            <select className="input" value={slMeetId} onChange={(e) => pickStartListMeet(e.target.value)}>
              <option value="">Choose a meet...</option>
              {meets.map((m) => (
                <option key={m.id} value={String(m.id)}>{m.name} ({fmt(m.start_date)})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="label">Which day is this start list for?</label>
            <div className="input" style={{ padding: 0, overflow: "hidden", display: "flex", alignItems: "center" }}>
              <input
                type="date"
                value={slDate}
                onChange={(e) => setSlDate(e.target.value)}
                style={{
                  width: "100%", height: "100%", minWidth: 0,
                  background: "transparent", border: "none", outline: "none",
                  color: "#fff", padding: "0 16px", colorScheme: "dark",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {slSaved.length > 0 && (
            <div className="space-y-1">
              <p className="label">Already saved</p>
              {slSaved.map((d) => (
                <div key={d.event_date} className="flex items-center gap-3">
                  <p className="text-xs flex-1 text-white">{fmt(d.event_date)}: {d.count} swimmer entries</p>
                  <button onClick={() => removeSavedDay(d.event_date)} className="btn-danger flex-shrink-0">Remove</button>
                </div>
              ))}
            </div>
          )}

          <div>
            <input
              id="start-list-pdf"
              type="file"
              accept=".pdf"
              onChange={handleStartListFile}
              disabled={slReading || slSaving}
              style={{ display: "none" }}
            />
            <label
              htmlFor="start-list-pdf"
              className="btn-outline"
              style={{ display: "block", textAlign: "center", cursor: slReading || slSaving ? "not-allowed" : "pointer", padding: "14px 12px" }}
            >
              {slReading ? (slStatus ?? "Reading PDF...") : slResult ? "Choose a different PDF" : "Choose start list PDF"}
            </label>
            <p className="text-xs muted mt-2">
              Image-only PDFs (like Canva exports) are read with OCR on this device. It can take a minute or two.
            </p>
          </div>

          {slError && <p className="text-sm" style={{ color: "#fca5a5" }}>{slError}</p>}
          {slDone && <p className="text-sm" style={{ color: "#86efac" }}>{slDone}</p>}

          {slResult && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-white">
                {slFileName}: found {slResult.entries.length} swimmer entries in {slResult.events.filter((ev) => !ev.isRelay).length} events
              </p>

              <div className="space-y-1" style={{ maxHeight: "220px", overflowY: "auto" }}>
                {slResult.events.map((ev) => (
                  <p key={ev.eventNumber} className="text-xs" style={{ color: ev.isRelay ? "rgba(255,255,255,0.4)" : "#fff" }}>
                    Event {ev.eventNumber} · {ev.category} {ev.eventName}
                    {ev.isRelay ? " · relay (skipped)" : ` · ${ev.heats} heats · ${ev.swimmers} swimmers`}
                  </p>
                ))}
              </div>

              {slResult.warnings.length > 0 && (
                <div className="space-y-1">
                  <p className="label" style={{ color: "#FDE68A" }}>Please check</p>
                  {slResult.warnings.map((w, i) => (
                    <p key={i} className="text-xs" style={{ color: "#FDE68A" }}>{w}</p>
                  ))}
                </div>
              )}

              {slResult.skippedLines.length > 0 && (
                <div className="space-y-1">
                  <p className="label" style={{ color: "#fca5a5" }}>
                    {slResult.skippedLines.length} line(s) could not be read and will NOT be saved
                  </p>
                  {slResult.skippedLines.map((l, i) => (
                    <p key={i} className="text-xs" style={{ color: "#fca5a5" }}>{l}</p>
                  ))}
                </div>
              )}

              <button onClick={saveStartList} disabled={slSaving} className="btn-block w-full">
                {slSaving ? "Saving..." : "Save for all parents"}
              </button>
            </div>
          )}
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