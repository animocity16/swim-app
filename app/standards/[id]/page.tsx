"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type StandardSet = {
  id: number;
  name: string;
  type: "UPGRADING" | "IMPORTANT_MEET";
};

type StandardItem = {
  id: number;
  standard_set_id: number;
  event: string;
  course: "SCM" | "LCM";
  gender: "Male" | "Female" | null;
  min_age: number | null;
  max_age: number | null;
  qualifying_time_ms: number;
};

function formatMs(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(
      hundredths
    ).padStart(2, "0")}`;
  }

  return `${seconds}.${String(hundredths).padStart(2, "0")}`;
}

function parseTimeToMs(input: string) {
  const trimmed = input.trim();

  if (!trimmed) return null;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;

    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);

    if (isNaN(minutes) || isNaN(seconds)) return null;

    return Math.round((minutes * 60 + seconds) * 1000);
  }

  const seconds = Number(trimmed);
  if (isNaN(seconds)) return null;

  return Math.round(seconds * 1000);
}

export default function StandardItemsPage() {
  const params = useParams();
  const setId = Number(params.id);

  const [setInfo, setSetInfo] = useState<StandardSet | null>(null);
  const [items, setItems] = useState<StandardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready");

  const [event, setEvent] = useState("");
  const [course, setCourse] = useState<"SCM" | "LCM">("SCM");
  const [gender, setGender] = useState<"Male" | "Female" | "">("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [timeInput, setTimeInput] = useState("");

  useEffect(() => {
    if (!setId) return;
    loadPage();
  }, [setId]);

  async function loadPage() {
    setStatus("Loading...");

    const { data: setData, error: setError } = await supabase
      .from("standard_sets")
      .select("id, name, type")
      .eq("id", setId)
      .single();

    if (setError) {
      setStatus(setError.message);
      return;
    }

    setSetInfo(setData);

    const { data: itemData, error: itemError } = await supabase
      .from("standard_items")
      .select(
        "id, standard_set_id, event, course, gender, min_age, max_age, qualifying_time_ms"
      )
      .eq("standard_set_id", setId)
      .order("event", { ascending: true });

    if (itemError) {
      setStatus(itemError.message);
      return;
    }

    setItems(itemData || []);
    setStatus("Ready");
  }

  async function addItem() {
    if (!event.trim()) {
      alert("Please enter an event");
      return;
    }

    if (!timeInput.trim()) {
      alert("Please enter time (e.g. 36.50 or 1:12.34)");
      return;
    }

    const timeMs = parseTimeToMs(timeInput);

    if (!timeMs) {
      alert("Invalid time format");
      return;
    }

    setLoading(true);
    setStatus("Adding item...");

    const { error } = await supabase.from("standard_items").insert([
      {
        standard_set_id: setId,
        event: event.trim(),
        course,
        gender: gender || null,
        min_age: minAge ? Number(minAge) : null,
        max_age: maxAge ? Number(maxAge) : null,
        qualifying_time_ms: timeMs,
      },
    ]);

    if (error) {
      setLoading(false);
      setStatus(error.message);
      alert(error.message);
      return;
    }

    setEvent("");
    setCourse("SCM");
    setGender("");
    setMinAge("");
    setMaxAge("");
    setTimeInput("");

    await loadPage();
    setLoading(false);
    setStatus("Item added");
  }

  async function deleteItem(id: number) {
    const ok = window.confirm("Delete this timing row?");
    if (!ok) return;

    const { error } = await supabase
      .from("standard_items")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadPage();
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/standards">← Back to Standards</Link>
      </div>

      <h1 style={{ fontSize: 32, marginBottom: 8 }}>
        {setInfo ? setInfo.name : "Standard Set"}
      </h1>

      <p style={{ color: "#666", marginBottom: 20 }}>
        {setInfo ? setInfo.type : ""}
      </p>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          display: "grid",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Add Timing Row</h2>

        <input
          placeholder="Event (e.g. 50 Freestyle)"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          style={{
            padding: "10px 12px",
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value as "SCM" | "LCM")}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
          >
            <option value="SCM">SCM</option>
            <option value="LCM">LCM</option>
          </select>

          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as "Male" | "Female" | "")}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
          >
            <option value="">All genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          <input
            placeholder="Min age"
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              width: 120,
            }}
          />

          <input
            placeholder="Max age"
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              width: 120,
            }}
          />

          <input
            placeholder="Time (e.g. 36.50 or 1:12.34)"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              width: 220,
            }}
          />
        </div>

        <button
          onClick={addItem}
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: "pointer",
            width: 140,
          }}
        >
          {loading ? "Adding..." : "Add Row"}
        </button>
      </div>

      <p style={{ color: "#666", marginBottom: 16 }}>{status}</p>

      {items.length === 0 ? (
        <p>No timing rows yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 700 }}>{item.event}</div>
              <div style={{ color: "#666", marginTop: 4 }}>
                {item.course} · {item.gender || "All genders"} · Ages{" "}
                {item.min_age ?? "Any"}-{item.max_age ?? "Any"}
              </div>
              <div style={{ marginTop: 6 }}>
                Target: {formatMs(item.qualifying_time_ms)} ({item.qualifying_time_ms} ms)
              </div>
              <button
                onClick={() => deleteItem(item.id)}
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}