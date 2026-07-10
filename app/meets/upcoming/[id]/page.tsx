"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type UpcomingMeet = {
  id: string;
  name: string;
  location: string | null;
  meet_type: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

type MeetEvent = {
  id: string;
  meet_id: string;
  swimmer_name: string;
  event_number: number;
  event_name: string;
  distance: number;
  stroke: string;
  heat: number;
  lane: number;
  seed_time: string | null;
  start_time: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string | null): string {
  const s = new Date(start);
  if (isNaN(s.getTime())) return "";
  const startStr = s.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (!end) return startStr + " " + s.getFullYear();
  const e = new Date(end);
  if (isNaN(e.getTime())) return startStr + " " + s.getFullYear();
  return `${startStr} – ${e.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

// ─── PDF Parser ───────────────────────────────────────────────────────────────

type ParsedEvent = {
  eventNumber: number;
  eventName: string;
  distance: number;
  stroke: string;
  heat: number;
  lane: number;
  seedTime: string | null;
  startTime: string | null;
  swimmerName: string;
};

function parsePDF(text: string, swimmerNames: string[]): ParsedEvent[] {
  const results: ParsedEvent[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentEvent = { number: 0, name: "", distance: 0, stroke: "" };
  let currentHeat = 0;
  let currentStartTime: string | null = null;

  // Normalise swimmer names for fuzzy matching
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s]/g, "").trim();

  const swimmerNormed = swimmerNames.map((n) => ({
    original: n,
    normed: normalise(n),
    parts: normalise(n).split(/\s+/),
  }));

  function matchSwimmer(lineName: string): string | null {
    // PDF format: "Loh, Mikaela" → try reversed + normal
    const normedLine = normalise(lineName);
    const partsLine = normedLine.split(/\s+/);

    for (const sw of swimmerNormed) {
      // All parts of swimmer name appear in line
      const allMatch = sw.parts.every((p) => partsLine.includes(p));
      if (allMatch) return sw.original;
    }
    return null;
  }

  // Event header pattern: "Event 501 Boys 7-12 50 LC Meter Backstroke"
  const eventRe = /^Event\s+(\d+)\s+.+?(\d+)\s+LC\s+Meter\s+(.+)$/i;
  // Heat header: "Heat 1 of 23 Finals Starts at 09:00 AM"
  const heatStartRe = /^Heat\s+(\d+)\s+of\s+\d+.*?Starts at\s+(\d+:\d+\s+[AP]M)/i;
  const heatRe = /^Heat\s+(\d+)/i;
  // Lane row: "4 Taguchi, Maxwell Shouki 12 SSC 34.31"
  const laneRe = /^(\d)\s+(.+?)\s+\d+\s+[A-Z0-9\-]+\s+([\d:]+\.?\d*|NT)\s*$/;

  for (const line of lines) {
    // Event header
    const evMatch = line.match(eventRe);
    if (evMatch) {
      const distance = parseInt(evMatch[2]);
      const strokeRaw = evMatch[3].trim();
      currentEvent = {
        number: parseInt(evMatch[1]),
        name: `${distance}m ${strokeRaw}`,
        distance,
        stroke: strokeRaw,
      };
      currentHeat = 0;
      currentStartTime = null;
      continue;
    }

    // Heat with start time
    const heatStartMatch = line.match(heatStartRe);
    if (heatStartMatch) {
      currentHeat = parseInt(heatStartMatch[1]);
      currentStartTime = heatStartMatch[2];
      continue;
    }

    // Heat without start time
    const heatMatch = line.match(heatRe);
    if (heatMatch && !heatStartMatch) {
      currentHeat = parseInt(heatMatch[1]);
      continue;
    }

    // Lane row — check if any swimmer matches
    if (currentEvent.number > 0 && currentHeat > 0) {
      const laneMatch = line.match(laneRe);
      if (laneMatch) {
        const lane = parseInt(laneMatch[1]);
        const namePart = laneMatch[2];
        const seedRaw = laneMatch[3];
        const matched = matchSwimmer(namePart);
        if (matched) {
          results.push({
            eventNumber: currentEvent.number,
            eventName: currentEvent.name,
            distance: currentEvent.distance,
            stroke: currentEvent.stroke,
            heat: currentHeat,
            lane,
            seedTime: seedRaw === "NT" ? null : seedRaw,
            startTime: currentStartTime,
            swimmerName: matched,
          });
        }
      }
    }
  }

  return results;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      height: "72px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "16px",
      animation: "pulse 2s ease-in-out infinite",
    }} />
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: MeetEvent }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "16px",
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
            {event.event_name}
          </p>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
            Event {event.event_number} · Heat {event.heat} · Lane {event.lane}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {event.seed_time && (
            <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
              {event.seed_time}
            </p>
          )}
          {event.start_time && (
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>
              ~{event.start_time}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Swimmer group (collapsible) ───────────────────────────────────────────────

function SwimmerGroup({ name, events, defaultOpen }: { name: string; events: MeetEvent[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "14px",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{name}</span>
          <span style={{
            fontSize: "10px", fontWeight: 700, color: "rgba(100,180,255,0.8)",
            background: "rgba(100,180,255,0.12)", borderRadius: "20px", padding: "2px 8px",
          }}>
            {events.length}
          </span>
        </span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <path d="M4 6L8 10L12 6" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px", paddingLeft: "4px" }}>
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UpcomingMeetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const meetId = params.id as string;

  const [meet, setMeet] = useState<UpcomingMeet | null>(null);
  const [events, setEvents] = useState<MeetEvent[]>([]);
  const [swimmerNames, setSwimmerNames] = useState<string[]>([]);
  const [swimmerGroups, setSwimmerGroups] = useState<{ name: string; group_type: string | null }[]>([]);
  const [selectedSwimmers, setSelectedSwimmers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<{ swimmerNames: string[]; totalLines: number; rawTextSample: string; first80Lines: string[] } | null>(null);
  const [debugSearchTerm, setDebugSearchTerm] = useState("");
  const [lastFile, setLastFile] = useState<File | null>(null);

  const [warmUp, setWarmUp] = useState("");
  const [callRoom, setCallRoom] = useState("");
  const [savingTimes, setSavingTimes] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    // Load meet
    const { data: meetData } = await supabase
      .from("upcoming_meets")
      .select("*")
      .eq("id", meetId)
      .single();

    if (!meetData) { router.replace("/meets"); return; }
    setMeet(meetData as UpcomingMeet);

    // Pre-fill warm up / call room from notes if saved there
    const notes = (meetData as UpcomingMeet).notes ?? "";
    const warmMatch = notes.match(/WARMUP:([^\|]+)/);
    const callMatch = notes.match(/CALLROOM:([^\|]+)/);
    if (warmMatch) setWarmUp(warmMatch[1].trim());
    if (callMatch) setCallRoom(callMatch[1].trim());

    // Load this user's swimmers
    const { data: swimmers } = await supabase
      .from("swimmers")
      .select("name, group_type")
      .eq("user_id", session.user.id);
    const swimmerList = (swimmers ?? []) as { name: string; group_type: string | null }[];
    const names = swimmerList.map((s) => s.name);
    setSwimmerNames(names);
    setSwimmerGroups(swimmerList);
    // Default: only "primary" (My Swimmers) selected, not the whole Following list
    const primaryNames = swimmerList.filter((s) => s.group_type === "primary").map((s) => s.name);
    setSelectedSwimmers(primaryNames.length > 0 ? primaryNames : names);

    // Load saved events for this meet
    const { data: eventsData } = await supabase
      .from("meet_events")
      .select("*")
      .eq("meet_id", meetId)
      .order("event_number", { ascending: true });

    setEvents((eventsData ?? []) as MeetEvent[]);
    setLoading(false);
  }, [meetId, router]);

  useEffect(() => { void load(); }, [load]);

  function toggleSwimmer(name: string) {
    setSelectedSwimmers((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  async function runDebugSearch() {
    if (!lastFile) return;
    const formData = new FormData();
    formData.append("file", lastFile);
    formData.append("swimmerNames", JSON.stringify(selectedSwimmers));
    formData.append("debug", "true");
    formData.append("debugSearch", debugSearchTerm);
    const res = await fetch("/api/parse-start-list", { method: "POST", body: formData });
    const data = await res.json();
    if (data.debug) setDebugData(data.debug);
  }

  async function handlePDFUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith(".pdf")) return;

    if (selectedSwimmers.length === 0) {
      setUploadError("Select at least one swimmer to match events for.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setLastFile(file);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("swimmerNames", JSON.stringify(selectedSwimmers));
      formData.append("debug", "true");
      formData.append("debugSearch", debugSearchTerm);

      const res = await fetch("/api/parse-start-list", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to parse PDF");

      if (data.debug) setDebugData(data.debug);

      const parsed: ParsedEvent[] = data.events;

      if (parsed.length === 0) {
        setUploadError("No matching swimmers found in this PDF. Check the start list is for the right session.");
        setUploading(false);
        return;
      }

      // Upsert events — accumulates across multiple PDF uploads (different
      // days/sessions) instead of wiping previously imported events. Re-uploading
      // the same session's PDF just refreshes those specific events.
      const rows = parsed.map((ev) => ({
        meet_id: meetId,
        swimmer_name: ev.swimmerName,
        event_number: ev.eventNumber,
        event_name: ev.eventName,
        distance: ev.distance,
        stroke: ev.stroke,
        heat: ev.heat,
        lane: ev.lane,
        seed_time: ev.seedTime,
        start_time: ev.startTime,
      }));

      const { error } = await supabase
        .from("meet_events")
        .upsert(rows, { onConflict: "meet_id,swimmer_name,event_number" });
      if (error) throw new Error(error.message);

      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to parse PDF");
    }

    setUploading(false);
  }

  async function saveTimes() {
    if (!meet) return;
    setSavingTimes(true);

    // Store warm up + call room in notes field using a simple format
    const existingNotes = (meet.notes ?? "")
      .replace(/WARMUP:[^\|]+\|?/g, "")
      .replace(/CALLROOM:[^\|]+\|?/g, "")
      .trim();

    const timeParts = [];
    if (warmUp.trim()) timeParts.push(`WARMUP:${warmUp.trim()}`);
    if (callRoom.trim()) timeParts.push(`CALLROOM:${callRoom.trim()}`);

    const newNotes = [existingNotes, ...timeParts].filter(Boolean).join(" | ");

    await supabase
      .from("upcoming_meets")
      .update({ notes: newNotes })
      .eq("id", meetId);

    setSavingTimes(false);
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="shell">
        <div className="container-app space-y-4 pt-4">
          <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }

  if (!meet) return null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="shell">
      <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      <div className="container-app space-y-4">

        {/* Back + Header */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(100,180,255,0.8)", fontSize: "13px", padding: "0 0 8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L6 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Meets
          </button>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
            {meet.name}
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
            {[formatDateRange(meet.start_date, meet.end_date), meet.location].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Warm up + Call room */}
        <div style={{ display: "flex", gap: "10px" }}>
          {[
            { label: "Warm up", value: warmUp, set: setWarmUp },
            { label: "Call room", value: callRoom, set: setCallRoom },
          ].map(({ label, value, set }) => (
            <div key={label} style={{ flex: 1 }}>
              <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                {label}
              </p>
              <input
                type="text"
                placeholder="e.g. 8:15 AM"
                value={value}
                onChange={(e) => set(e.target.value)}
                onBlur={saveTimes}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px",
                  padding: "10px 12px", color: "#fff", fontSize: "13px",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          ))}
        </div>
        {savingTimes && (
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "-8px" }}>Saving...</p>
        )}

        {/* Swimmer selection */}
        {swimmerNames.length > 0 && (() => {
          const primary = swimmerGroups.filter((s) => s.group_type === "primary").map((s) => s.name);
          const following = swimmerGroups.filter((s) => s.group_type !== "primary").map((s) => s.name);

          const Pill = ({ name }: { name: string }) => {
            const active = selectedSwimmers.includes(name);
            return (
              <button
                type="button"
                onClick={() => toggleSwimmer(name)}
                style={{
                  padding: "7px 14px",
                  borderRadius: "20px",
                  border: `1px solid ${active ? "rgba(100,180,255,0.4)" : "rgba(255,255,255,0.12)"}`,
                  background: active ? "rgba(100,180,255,0.15)" : "rgba(255,255,255,0.04)",
                  color: active ? "rgba(150,200,255,0.95)" : "rgba(255,255,255,0.4)",
                  fontSize: "12px",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {active ? "✓ " : ""}{name}
              </button>
            );
          };

          const GroupHeader = ({ label, group }: { label: string; group: string[] }) => {
            const allSelected = group.every((n) => selectedSwimmers.includes(n));
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {label}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSwimmers((prev) =>
                      allSelected
                        ? prev.filter((n) => !group.includes(n))
                        : Array.from(new Set([...prev, ...group]))
                    )
                  }
                  style={{ fontSize: "11px", color: "rgba(100,180,255,0.8)", background: "none", border: "none", cursor: "pointer" }}
                >
                  {allSelected ? "Clear" : "Select all"}
                </button>
              </div>
            );
          };

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {primary.length > 0 && (
                <div>
                  <GroupHeader label="My Swimmers" group={primary} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {primary.map((name) => <Pill key={name} name={name} />)}
                  </div>
                </div>
              )}
              {following.length > 0 && (
                <div>
                  <GroupHeader label="Following" group={following} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {following.map((name) => <Pill key={name} name={name} />)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* PDF Upload */}
        <div>
          <label
            htmlFor="pdf-upload"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: "8px",
              background: events.length > 0 ? "rgba(255,255,255,0.03)" : "rgba(100,180,255,0.07)",
              border: `1px dashed ${events.length > 0 ? "rgba(255,255,255,0.1)" : "rgba(100,180,255,0.3)"}`,
              borderRadius: "16px", padding: "20px 16px",
              cursor: uploading ? "not-allowed" : "pointer",
              textAlign: "center",
            }}
          >
            {uploading ? (
              <>
                <div style={{ fontSize: "24px" }}>⏳</div>
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>Reading PDF...</p>
              </>
            ) : events.length > 0 ? (
              <>
                <div style={{ fontSize: "20px" }}>📄</div>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                  Re-upload start list PDF
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: "28px" }}>📋</div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "rgba(100,180,255,0.9)" }}>
                  Import start list PDF
                </p>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
                  Tap to upload your session start list
                </p>
              </>
            )}
          </label>
          <input
            id="pdf-upload"
            type="file"
            accept=".pdf"
            onChange={handlePDFUpload}
            disabled={uploading}
            style={{ display: "none" }}
          />
          {uploadError && (
            <p style={{ fontSize: "12px", color: "#f87171", marginTop: "8px", textAlign: "center" }}>
              {uploadError}
            </p>
          )}
        </div>

        {debugData && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "16px",
            padding: "14px",
            fontFamily: "monospace",
            fontSize: "10px",
            color: "rgba(255,255,255,0.6)",
            whiteSpace: "pre-wrap",
            maxHeight: "400px",
            overflowY: "auto",
          }}>
            <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
              <input
                type="text"
                placeholder="Search e.g. Mikaela or BREAK"
                value={debugSearchTerm}
                onChange={(e) => setDebugSearchTerm(e.target.value)}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "8px", padding: "6px 10px", color: "#fff", fontSize: "11px", outline: "none",
                }}
              />
              <button
                type="button"
                onClick={runDebugSearch}
                style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: "rgba(100,180,255,0.25)", color: "#fff", fontSize: "11px", cursor: "pointer" }}
              >
                Find
              </button>
            </div>
            <p style={{ color: "#FDE68A", fontWeight: 700, marginBottom: "6px" }}>
              DEBUG — swimmer names in DB: {JSON.stringify(debugData.swimmerNames)}
            </p>
            <p style={{ color: "#FDE68A", fontWeight: 700, marginBottom: "6px" }}>
              Total lines extracted: {debugData.totalLines}
            </p>
            <p style={{ color: "#93C5FD", fontWeight: 700, marginTop: "10px", marginBottom: "6px" }}>
              First 80 lines:
            </p>
            {debugData.first80Lines.map((line, i) => (
              <div key={i}>{i}: {line}</div>
            ))}
          </div>
        )}

        {/* Events list */}
        {events.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {events.length} event{events.length !== 1 ? "s" : ""} across {new Set(events.map((e) => e.swimmer_name)).size} swimmer{new Set(events.map((e) => e.swimmer_name)).size !== 1 ? "s" : ""}
            </p>
            {(() => {
              const grouped = new Map<string, MeetEvent[]>();
              for (const ev of events) {
                const key = ev.swimmer_name || "Unknown";
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(ev);
              }
              const names = Array.from(grouped.keys()).sort();
              return names.map((name, i) => (
                <SwimmerGroup key={name} name={name} events={grouped.get(name)!} defaultOpen={names.length === 1 || i === 0} />
              ));
            })()}
          </div>
        ) : (
          !uploading && (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px", padding: "24px",
              textAlign: "center",
            }}>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.2)" }}>
                Events will appear here after PDF import
              </p>
            </div>
          )
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}