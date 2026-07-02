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
          {event.swimmer_name && (
            <p style={{ fontSize: "11px", color: "rgba(100,180,255,0.7)", marginTop: "2px" }}>
              {event.swimmer_name}
            </p>
          )}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UpcomingMeetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const meetId = params.id as string;

  const [meet, setMeet] = useState<UpcomingMeet | null>(null);
  const [events, setEvents] = useState<MeetEvent[]>([]);
  const [swimmerNames, setSwimmerNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
      .select("name")
      .eq("user_id", session.user.id);
    setSwimmerNames((swimmers ?? []).map((s: { name: string }) => s.name));

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

  async function handlePDFUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith(".pdf")) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("swimmerNames", JSON.stringify(swimmerNames));

      const res = await fetch("/api/parse-start-list", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to parse PDF");

      const parsed: ParsedEvent[] = data.events;

      if (parsed.length === 0) {
        setUploadError("No matching swimmers found in this PDF. Check the start list is for the right session.");
        setUploading(false);
        return;
      }

      // Delete existing events for this meet first
      await supabase.from("meet_events").delete().eq("meet_id", meetId);

      // Insert new events
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

      const { error } = await supabase.from("meet_events").insert(rows);
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

        {/* Events list */}
        {events.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {events.length} event{events.length !== 1 ? "s" : ""} found
            </p>
            {events.map((ev) => (
              <EventCard key={ev.id} event={ev} />
            ))}
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