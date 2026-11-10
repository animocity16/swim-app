"use client";

// Settings card: "Swim reminders". Turns on a push notification
// ("Time to report to call room") a set number of minutes before each of
// your swimmer's events on the Meets page.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(255,255,255,0.9)",
  boxShadow: "0 10px 24px rgba(0,25,55,0.10)",
};
const INK = "#0B2A54";
const MUTED = "#71859A";
const ACCENT_GRADIENT = "var(--natrix-font-colour, #168AE8)";

const LEAD_OPTIONS = [
  { value: 20, label: "20 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 45, label: "45 minutes before" },
  { value: 60, label: "1 hour before" },
];

type Status =
  | "loading"
  | "unsupported" // browser can't do push at all
  | "needs-install" // iPhone, but not opened from the Home Screen icon yet
  | "blocked" // notifications switched off in phone settings
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIPhoneOrIPad(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

function isInstalledApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export default function ReminderCard() {
  const [status, setStatus] = useState<Status>("loading");
  const [lead, setLead] = useState(30);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const set = (s: Status) => {
        if (!cancelled) setStatus(s);
      };

      if (isIPhoneOrIPad() && !isInstalledApp()) return set("needs-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return set("unsupported");
      }
      if (Notification.permission === "denied") return set("blocked");

      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!sub) return set("off");

        // Make sure the server still knows this phone, and read its lead time.
        const { data } = await supabase
          .from("push_subscriptions")
          .select("lead_minutes")
          .eq("endpoint", sub.endpoint)
          .maybeSingle();
        if (!data) return set("off");
        if (!cancelled) setLead(data.lead_minutes);
        set("on");
      } catch {
        set("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSubscription(sub: PushSubscription, leadMinutes: number) {
    const json = sub.toJSON();
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        leadMinutes,
        deviceLabel: navigator.userAgent.includes("iPhone") ? "iPhone" : "This device",
      }),
    });
    if (!res.ok) throw new Error("Couldn't save your reminder settings.");
  }

  async function turnOn() {
    setBusy(true);
    setMessage("");
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Reminders aren't set up yet.");

      // Must be asked straight after the tap, or iPhone ignores it.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      await saveSubscription(sub, lead);
      setStatus("on");
      setMessage("✓ Reminders are on.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setMessage("Couldn't turn reminders off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function changeLead(value: number) {
    setLead(value);
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await saveSubscription(sub, value);
        setMessage("✓ Saved.");
      }
    } catch {
      setMessage("Couldn't save that. Try again.");
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Test failed.");
      setMessage(
        data.sent > 0
          ? "✓ Test sent. It should pop up in a few seconds."
          : "Nothing was sent. Try turning reminders off and on again."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  }

  const primaryBtn: React.CSSProperties = { background: ACCENT_GRADIENT };

  return (
    <div className="rounded-[28px] p-5 space-y-3" style={CARD}>
      <div className="flex items-center justify-between">
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.16em] accent-text-light">
          Swim reminders
        </p>
        {status === "on" && (
          <span
            className="rounded-lg px-2.5 py-1 text-xs font-semibold"
            style={{ background: "#E6F6EF", color: "#1F9D68" }}
          >
            On
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
        Get a heads-up before each of your swimmers races: &quot;Time to report to call room&quot;,
        with the event, heat and lane. Works for swimmers under My Swimmers once their start list
        is on the Meets page.
      </p>

      {status === "loading" && (
        <p className="text-sm" style={{ color: MUTED }}>
          Checking...
        </p>
      )}

      {status === "needs-install" && (
        <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed" style={{ background: "#FFF6E5", color: "#8A5A00" }}>
          On iPhone, reminders only work from the app icon. Tap the Share button in Safari, choose{" "}
          <b>Add to Home Screen</b>, then open Natrix from that icon and come back here.
        </div>
      )}

      {status === "unsupported" && (
        <p className="text-sm" style={{ color: MUTED }}>
          This browser can&apos;t show reminders. Try Safari on iPhone (from the Home Screen icon) or
          Chrome on Android.
        </p>
      )}

      {status === "blocked" && (
        <p className="text-sm leading-relaxed" style={{ color: "#C0392B" }}>
          Notifications are switched off for Natrix. Turn them on in your phone&apos;s Settings →
          Notifications → Natrix, then come back here.
        </p>
      )}

      {status === "off" && (
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
          style={primaryBtn}
        >
          {busy ? "Turning on..." : "Turn on reminders"}
        </button>
      )}

      {status === "on" && (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold" style={{ color: INK }}>
              Remind me
            </span>
            <select
              value={lead}
              onChange={(e) => changeLead(Number(e.target.value))}
              className="w-full rounded-2xl px-4 py-3 text-sm"
              style={{ background: "#F7FAFC", border: "1px solid #E1EDF5", color: INK }}
            >
              {LEAD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={sendTest}
              disabled={busy}
              className="flex-1 rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
              style={primaryBtn}
            >
              Send test
            </button>
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50"
              style={{ color: "#C0392B", border: "1px solid rgba(192,57,43,0.35)" }}
            >
              Turn off
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="text-sm" style={{ color: message.startsWith("✓") ? "#1F9D68" : "#C0392B" }}>
          {message}
        </p>
      )}
    </div>
  );
}
