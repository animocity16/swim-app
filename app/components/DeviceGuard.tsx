"use client";

// Family bundle guard: one account, up to 3 devices.
// Mounted once in app/layout.tsx. It does nothing for logged-out visitors.
//   - New device + free slot  -> registers quietly
//   - New device + account full -> full-screen "pick a device to sign out" screen
//   - Device removed from another phone -> signs this one out next time it opens
// If anything fails (offline, SQL not run yet), it fails open and the app works as normal.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  MAX_DEVICES,
  checkDevice,
  clearRegistered,
  deviceEmoji,
  formatLastUsed,
  listDevices,
  markRegistered,
  registerDevice,
  removeDevice,
  wasRegisteredFor,
  type DeviceRow,
} from "@/lib/devices";

// Pages where the guard stays out of the way
const SKIP_PREFIXES = ["/demo", "/reset-password", "/forgot-password", "/auth"];

const RECHECK_AFTER_MS = 30_000;

export default function DeviceGuard() {
  const pathname = usePathname();
  const router = useRouter();

  const [blocked, setBlocked] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const running = useRef(false);
  const lastRun = useRef(0);

  const skip = SKIP_PREFIXES.some((p) => pathname.startsWith(p));

  const runCheck = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    lastRun.current = Date.now();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setBlocked(false);
        return;
      }

      const uid = session.user.id;

      // Already registered here: just confirm we haven't been removed.
      if (wasRegisteredFor(uid)) {
        const status = await checkDevice();
        if (status === "missing") {
          clearRegistered();
          setBlocked(false);
          await supabase.auth.signOut();
          router.replace("/login");
        } else if (status === "ok") {
          setBlocked(false);
        }
        return;
      }

      // First time on this device for this account.
      const status = await registerDevice();
      if (status === "ok") {
        markRegistered(uid);
        setBlocked(false);
      } else if (status === "full") {
        const list = await listDevices();
        setDevices(list);
        setMessage("");
        setBlocked(true);
      }
      // "error": fail open
    } finally {
      running.current = false;
    }
  }, [router]);

  useEffect(() => {
    if (skip) return;

    void runCheck();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearRegistered();
        setBlocked(false);
        return;
      }
      if (event === "SIGNED_IN") {
        // Don't call Supabase inside this callback directly.
        setTimeout(() => {
          void runCheck();
        }, 0);
      }
    });

    function handleVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRun.current < RECHECK_AFTER_MS) return;
      void runCheck();
    }
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [skip, runCheck]);

  async function handleRemove(row: DeviceRow) {
    setBusyId(row.id);
    setMessage("");

    const removed = await removeDevice(row.id);
    if (!removed) {
      setMessage("Couldn't sign that device out. Check your connection and try again.");
      setBusyId(null);
      return;
    }

    // A slot is free now, so try again to add this device.
    const status = await registerDevice();
    if (status === "ok") {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) markRegistered(session.user.id);
      setBlocked(false);
    } else {
      setDevices(await listDevices());
      if (status === "error") setMessage("Something went wrong. Try again.");
    }
    setBusyId(null);
  }

  async function handleCancel() {
    setSigningOut(true);
    clearRegistered();
    await supabase.auth.signOut();
    setBlocked(false);
    setSigningOut(false);
    router.replace("/login");
  }

  if (skip || !blocked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-limit-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflowY: "auto",
        background: "#063554",
        color: "#fff",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-5 py-10">
        <div className="mb-5 text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
            style={{
              background: "rgba(217,119,6,0.25)",
              border: "1px solid rgba(253,230,138,0.3)",
            }}
          >
            📱
          </div>
          <h1 id="device-limit-title" className="text-xl font-bold text-white">
            Your family plan is full
          </h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
            Natrix works on up to {MAX_DEVICES} devices. Sign one out to use this one.
          </p>
        </div>

        <div
          className="rounded-3xl px-4 py-1"
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          {devices.length === 0 && (
            <p className="py-4 text-center text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              Loading your devices...
            </p>
          )}
          {devices.map((d, i) => (
            <div
              key={d.id}
              className="flex items-center gap-3 py-3"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <span className="text-xl" aria-hidden="true">
                {deviceEmoji(d.device_type)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {d.device_name || "Device"}
                </p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {formatLastUsed(d.last_seen_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(d)}
                disabled={busyId !== null}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                style={{
                  color: "#F09595",
                  border: "1px solid rgba(240,149,149,0.4)",
                  background: "transparent",
                }}
              >
                {busyId === d.id ? "Signing out..." : "Sign out"}
              </button>
            </div>
          ))}
        </div>

        {message && (
          <p
            className="mt-3 rounded-2xl px-3 py-2 text-sm"
            style={{
              background: "rgba(226,75,74,0.1)",
              border: "1px solid rgba(226,75,74,0.2)",
              color: "#F09595",
            }}
          >
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={handleCancel}
          disabled={signingOut || busyId !== null}
          className="mt-5 text-center text-xs underline disabled:opacity-50"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {signingOut ? "Signing out..." : "Not now: sign out of this device"}
        </button>
      </div>
    </div>
  );
}
