// lib/devices.ts
// Family bundle: one account, up to 3 devices.
// Each phone/tablet/computer gets a random ID the first time Natrix opens on it.
// The database (see supabase/family-devices.sql) keeps the list and enforces the cap.
//
// Every function here fails OPEN: if something goes wrong (no internet, SQL not run yet,
// storage blocked), the app keeps working instead of locking a parent out.

import { supabase } from "@/lib/supabaseClient";

// Display only. The real limit lives in the register_device() SQL function.
export const MAX_DEVICES = 3;

const ID_KEY = "natrix_device_id";
const REGISTERED_KEY = "natrix_device_registered_for";

export type DeviceType = "phone" | "tablet" | "computer";

export interface DeviceRow {
  id: string;
  device_id: string;
  device_name: string | null;
  device_type: string | null;
  created_at: string;
  last_seen_at: string;
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

// Returns "" if the browser blocks storage, which makes the guard skip the check.
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(ID_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

// Friendly label like "iPhone · Safari" or "iPad · Home screen app".
// A phone's Safari and its Home Screen app keep separate storage, so they count as two devices.
export function getDeviceInfo(): { name: string; type: DeviceType } {
  if (typeof window === "undefined") return { name: "Device", type: "computer" };

  const ua = navigator.userAgent || "";
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;

  let base = "Computer";
  let type: DeviceType = "computer";

  if (/iPhone/.test(ua)) {
    base = "iPhone";
    type = "phone";
  } else if (/iPad/.test(ua) || touchMac) {
    base = "iPad";
    type = "tablet";
  } else if (/Android/.test(ua)) {
    if (/Mobile/.test(ua)) {
      base = "Android phone";
      type = "phone";
    } else {
      base = "Android tablet";
      type = "tablet";
    }
  } else if (/Windows/.test(ua)) {
    base = "Windows computer";
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    base = "Mac";
  }

  const standalone =
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  let how = "Browser";
  if (standalone) how = "Home screen app";
  else if (/Edg\//.test(ua)) how = "Edge";
  else if (/FxiOS|Firefox/.test(ua)) how = "Firefox";
  else if (/CriOS|Chrome/.test(ua)) how = "Chrome";
  else if (/Safari/.test(ua)) how = "Safari";

  return { name: `${base} · ${how}`, type };
}

// ─── "Has this device been registered for this account?" flag ─────────────────
// Lets us tell "brand new device" apart from "this device was removed from another one".

export function wasRegisteredFor(userId: string): boolean {
  try {
    return window.localStorage.getItem(REGISTERED_KEY) === userId;
  } catch {
    return false;
  }
}

export function markRegistered(userId: string) {
  try {
    window.localStorage.setItem(REGISTERED_KEY, userId);
  } catch {
    // ignore
  }
}

export function clearRegistered() {
  try {
    window.localStorage.removeItem(REGISTERED_KEY);
  } catch {
    // ignore
  }
}

// ─── Database calls ───────────────────────────────────────────────────────────

export type RegisterStatus = "ok" | "full" | "error";

export async function registerDevice(): Promise<RegisterStatus> {
  const id = getDeviceId();
  if (!id) return "ok"; // storage blocked: don't lock anyone out
  const { name, type } = getDeviceInfo();
  const { data, error } = await supabase.rpc("register_device", {
    p_device_id: id,
    p_name: name,
    p_type: type,
  });
  if (error) return "error";
  const status = (data as { status?: string } | null)?.status;
  if (status === "full") return "full";
  if (status === "ok") return "ok";
  return "error";
}

export type CheckStatus = "ok" | "missing" | "error";

export async function checkDevice(): Promise<CheckStatus> {
  const id = getDeviceId();
  if (!id) return "ok";
  const { data, error } = await supabase.rpc("check_device", { p_device_id: id });
  if (error) return "error";
  const status = (data as { status?: string } | null)?.status;
  if (status === "ok") return "ok";
  if (status === "missing") return "missing";
  return "error";
}

export async function listDevices(): Promise<DeviceRow[]> {
  const { data, error } = await supabase
    .from("user_devices")
    .select("id, device_id, device_name, device_type, created_at, last_seen_at")
    .order("last_seen_at", { ascending: false });
  if (error || !data) return [];
  return data as DeviceRow[];
}

export async function removeDevice(rowId: string): Promise<boolean> {
  const { error } = await supabase.from("user_devices").delete().eq("id", rowId);
  return !error;
}

// Called on sign out so a signed-out device frees its slot straight away.
export async function unregisterThisDevice(): Promise<void> {
  const id = getDeviceId();
  if (!id) return;
  try {
    await supabase.from("user_devices").delete().eq("device_id", id);
  } catch {
    // best effort
  }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function deviceEmoji(type: string | null): string {
  if (type === "phone") return "📱";
  if (type === "tablet") return "📲";
  return "💻";
}

export function formatLastUsed(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 15) return "Active now";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return "Last used today";
  const days = Math.floor(hours / 24);
  if (days === 1) return "Last used yesterday";
  if (days < 14) return `Last used ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `Last used ${weeks} weeks ago`;
  return "Last used a while ago";
}
