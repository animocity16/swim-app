"use client";

// Settings card: "My devices". Shows every device signed in to this account
// and lets the parent sign any other device out.

import { useEffect, useState } from "react";
import {
  MAX_DEVICES,
  deviceEmoji,
  formatLastUsed,
  getDeviceId,
  listDevices,
  removeDevice,
  type DeviceRow,
} from "@/lib/devices";

// Same look as the other Settings cards
const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(255,255,255,0.9)",
  boxShadow: "0 10px 24px rgba(0,25,55,0.10)",
};
const INK = "#0B2A54";
const MUTED = "#71859A";

export default function MyDevicesCard() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [thisDeviceId, setThisDeviceId] = useState("");

  async function reload() {
    const list = await listDevices();
    setDevices(list);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listDevices();
      if (cancelled) return;
      setThisDeviceId(getDeviceId());
      setDevices(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRemove(row: DeviceRow) {
    const label = row.device_name || "this device";
    if (!window.confirm(`Sign ${label} out of Natrix?`)) return;
    setBusyId(row.id);
    setMessage("");
    const ok = await removeDevice(row.id);
    if (!ok) setMessage("Couldn't sign that device out. Try again.");
    await reload();
    setBusyId(null);
  }

  return (
    <div className="rounded-[28px] p-5 space-y-3" style={CARD}>
      <div className="flex items-center justify-between">
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.16em] accent-text-light">
          My devices
        </p>
        {!loading && (
          <span
            className="rounded-lg px-2.5 py-1 text-xs font-semibold"
            style={{ background: "#EEF5FA", color: INK }}
          >
            {devices.length} of {MAX_DEVICES} used
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
        Everyone in your family can sign in with your email on up to {MAX_DEVICES} devices.
      </p>

      {loading && (
        <p className="text-sm" style={{ color: MUTED }}>
          Loading...
        </p>
      )}

      {!loading && devices.length === 0 && (
        <p className="text-sm" style={{ color: MUTED }}>
          No devices listed yet. This device appears here after your next sign in.
        </p>
      )}

      {devices.length > 0 && (
        <div
          className="overflow-hidden rounded-2xl"
          style={{ border: "1px solid #E1EDF5", background: "#F7FAFC" }}
        >
          {devices.map((d, i) => {
            const isThis = d.device_id === thisDeviceId;
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: i === 0 ? "none" : "1px solid #E1EDF5" }}
              >
                <span className="text-xl" aria-hidden="true">
                  {deviceEmoji(d.device_type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: INK }}>
                    {d.device_name || "Device"}
                    {isThis && (
                      <span className="ml-2 text-[0.6875rem] font-semibold" style={{ color: "#1F9D68" }}>
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: MUTED }}>
                    {isThis ? "Active now" : formatLastUsed(d.last_seen_at)}
                  </p>
                </div>
                {!isThis && (
                  <button
                    type="button"
                    onClick={() => handleRemove(d)}
                    disabled={busyId !== null}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                    style={{ color: "#C0392B", border: "1px solid rgba(192,57,43,0.35)" }}
                  >
                    {busyId === d.id ? "Removing..." : "Remove"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {message && (
        <p className="text-sm" style={{ color: "#C0392B" }}>
          {message}
        </p>
      )}
    </div>
  );
}
