"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { canonicalEventName, canonicalCourse } from "@/lib/events";

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
  min_age: number | null;
  max_age: number | null;
  gender: string | null;
  qualifying_time_ms: number;
};

const EVENTS = [
  "50 Freestyle", "100 Freestyle", "200 Freestyle", "400 Freestyle", "800 Freestyle", "1500 Freestyle",
  "50 Backstroke", "100 Backstroke", "200 Backstroke",
  "50 Breaststroke", "100 Breaststroke", "200 Breaststroke",
  "50 Butterfly", "100 Butterfly", "200 Butterfly",
  "200 IM", "400 IM",
];

const COURSES = ["LCM", "SCM", "SCY"];

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function timeToMs(timeStr: string): number | null {
  const s = timeStr.trim();
  if (!s) return null;
  if (s.includes(":")) {
    const [mm, rest] = s.split(":");
    const [sec, hundredths] = rest.split(".");
    const ms = Number(mm) * 60_000 + Number(sec) * 1_000 + Number((hundredths ?? "0").padEnd(2, "0").slice(0, 2)) * 10;
    return isNaN(ms) ? null : ms;
  }
  const [sec, hundredths] = s.split(".");
  const ms = Number(sec) * 1_000 + Number((hundredths ?? "0").padEnd(2, "0").slice(0, 2)) * 10;
  return isNaN(ms) ? null : ms;
}

function getStrokeColor(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breast")) return "#34D399";
  if (e.includes("back")) return "#A78BFA";
  if (e.includes("fly") || e.includes("butterfly")) return "#FB923C";
  if (e.includes("free")) return "#38BDF8";
  if (e.includes("im")) return "#F472B6";
  return "#FDE68A";
}

export default function StandardsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const setId = Number(params.id);

  const [set, setSet] = useState<StandardSet | null>(null);
  const [items, setItems] = useState<StandardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  // ── Set-level gender — set once, applies to all items ──
  const [setGender, setSetGender] = useState<"Male" | "Female" | "">("");

  // ── Add form state ──
  const [event, setEvent] = useState(EVENTS[0]);
  const [course, setCourse] = useState("LCM");
  const [timeStr, setTimeStr] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (!setId || isNaN(setId)) { router.replace("/standards"); return; }
    void loadPage();
  }, [setId]);

  async function loadPage() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const { data: setData, error: setError } = await supabase
      .from("standard_sets")
      .select("id, name, type, created_at")
      .eq("id", setId)
      .eq("user_id", user.id)
      .single();

    if (setError || !setData) { router.replace("/standards"); return; }
    setSet(setData as StandardSet);

    const { data: itemsData } = await supabase
      .from("standard_items")
      .select("id, standard_set_id, event, course, min_age, max_age, gender, qualifying_time_ms")
      .eq("standard_set_id", setId)
      .order("event", { ascending: true });

    const loadedItems = (itemsData as StandardItem[]) || [];
    setItems(loadedItems);

    // Auto-detect gender from existing items
    const detectedGender = loadedItems.find((i) => i.gender)?.gender;
    if (detectedGender === "Male" || detectedGender === "Female") {
      setSetGender(detectedGender);
    }

    setLoading(false);
  }

  async function addItem() {
    const ms = timeToMs(timeStr);
    if (!ms || ms <= 0) { setStatus("Please enter a valid time (e.g. 1:23.45 or 28.90)"); return; }
    if (!setGender) { setStatus("Please set the gender for this standard set first."); return; }

    setAdding(true);
    setStatus("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("Not logged in."); setAdding(false); return; }

    const { error } = await supabase.from("standard_items").insert({
      standard_set_id: setId,
      user_id: user.id,
      event: canonicalEventName(event),
      course: canonicalCourse(course),
      qualifying_time_ms: ms,
      min_age: minAge ? Number(minAge) : null,
      max_age: maxAge ? Number(maxAge) : null,
      gender: setGender || null,
    });

    if (error) { setStatus(`Error: ${error.message}`); setAdding(false); return; }

    setTimeStr(""); setMinAge(""); setMaxAge("");
    setStatus("Standard added!");
    await loadPage();
    setAdding(false);
  }

  async function deleteItem(itemId: number) {
    if (!window.confirm("Remove this standard?")) return;
    await supabase.from("standard_items").delete().eq("id", itemId);
    await loadPage();
  }

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!set) return null;

  // Group by stroke
  const grouped = items.reduce((acc, item) => {
    const stroke = item.event.split(" ").slice(1).join(" ") || item.event;
    if (!acc[stroke]) acc[stroke] = [];
    acc[stroke].push(item);
    return acc;
  }, {} as Record<string, StandardItem[]>);

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => router.push("/standards")}
            className="mb-3 flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Standards
          </button>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">{set.name}</h1>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    background: set.type === "UPGRADING" ? "rgba(217,119,6,0.2)" : "rgba(99,130,201,0.2)",
                    color: set.type === "UPGRADING" ? "#FDE68A" : "#93C5FD",
                    border: `1px solid ${set.type === "UPGRADING" ? "rgba(253,230,138,0.25)" : "rgba(147,197,253,0.25)"}`,
                  }}
                >
                  {set.type === "UPGRADING" ? "Upgrading" : "Important Meet"}
                </span>
                {setGender && (
                  <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
                    {setGender === "Male" ? "♂ Male" : "♀ Female"}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl text-white transition hover:bg-white/10"
            >
              {showAddForm ? "×" : "+"}
            </button>
          </div>
        </div>

        {/* ── Gender picker — shown once at top level ─────────────────── */}
        {!setGender && (
          <div className="rounded-3xl p-5 space-y-3"
            style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(253,230,138,0.2)" }}>
            <p className="text-sm font-semibold text-white">Set the gender for this standard</p>
            <p className="text-xs text-white/45">
              This applies to all times in this set — you won't need to select it again for each event.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["Male", "Female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSetGender(g)}
                  className="rounded-2xl border py-3 text-sm font-semibold transition"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}
                >
                  {g === "Male" ? "♂ Male" : "♀ Female"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Change gender button — shown after gender is set */}
        {setGender && items.length === 0 && (
          <div className="flex gap-2">
            {(["Male", "Female"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSetGender(g)}
                className="rounded-2xl border px-4 py-2 text-sm font-medium transition"
                style={setGender === g
                  ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
              >
                {g === "Male" ? "♂ Male" : "♀ Female"}
              </button>
            ))}
          </div>
        )}

        {/* ── Add form ─────────────────────────────────────────────────── */}
        {showAddForm && (
          <div className="rounded-3xl p-5 space-y-3"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-white/40">Add standard time</p>
              {setGender && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {setGender === "Male" ? "♂ Male" : "♀ Female"}
                </span>
              )}
            </div>

            <select value={event} onChange={(e) => setEvent(e.target.value)} className="input">
              {EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            </select>

            <select value={course} onChange={(e) => setCourse(e.target.value)} className="input">
              {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <input
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              placeholder="Qualifying time (e.g. 1:23.45 or 28.90)"
              className="input"
              inputMode="text"
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                placeholder="Min age (optional)"
                className="input"
                inputMode="numeric"
              />
              <input
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                placeholder="Max age (optional)"
                className="input"
                inputMode="numeric"
              />
            </div>

            {!setGender && (
              <p className="text-xs text-amber-300/70">⚠ Set the gender above before adding standards.</p>
            )}

            {status && (
              <p className="text-sm" style={{ color: status.startsWith("Error") || status.startsWith("Please") ? "#F09595" : "#6EE7B7" }}>
                {status}
              </p>
            )}

            <button
              type="button"
              onClick={addItem}
              disabled={adding || !timeStr.trim() || !setGender}
              className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ background: "#D97706" }}
            >
              {adding ? "Adding..." : `Add ${setGender ? `${setGender} ` : ""}standard`}
            </button>
          </div>
        )}

        {/* ── Items list ───────────────────────────────────────────────── */}
        {items.length === 0 ? (
          <div className="rounded-3xl p-8 text-center"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p className="text-base font-semibold text-white">No standards yet</p>
            <p className="mt-1 text-sm text-white/40">Tap + to add your first qualifying time.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/30 px-1">
              {items.length} standard{items.length === 1 ? "" : "s"}
            </p>
            {Object.entries(grouped).map(([stroke, strokeItems]) => {
              const color = getStrokeColor(strokeItems[0].event);
              return (
                <div key={stroke} className="rounded-2xl overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                  <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>{stroke}</p>
                  </div>
                  {strokeItems
                    .sort((a, b) => Number(a.event.match(/\d+/)?.[0] ?? 0) - Number(b.event.match(/\d+/)?.[0] ?? 0))
                    .map((item, i) => (
                      <div key={item.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{item.event}</p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="text-xs text-white/35">{item.course}</span>
                            {(item.min_age || item.max_age) && (
                              <span className="text-xs text-white/25">
                                Age {item.min_age ?? "?"}-{item.max_age ?? "?"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <p className="text-base font-bold" style={{ color: "#FDE68A" }}>
                            {formatMs(item.qualifying_time_ms)}
                          </p>
                          <button
                            type="button"
                            onClick={() => void deleteItem(item.id)}
                            className="rounded-xl border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}