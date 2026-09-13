"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { UsageRow } from "@/app/api/admin/usage/route";

const ADMIN_USER_ID = "9156c797-d133-4a7f-aa93-03688f2bdfd1";

type Summary = {
  totalSignups: number;
  realUsers: number;
  activated: number;
  returned: number;
  activeLast30Days: number;
};

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysAgo(dateStr: string | null) {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86400000);
}

function statusFor(row: UsageRow): { label: string; className: string } {
  if (row.timesLogged === 0 && row.swimmersAdded === 0) {
    return { label: "Never used it", className: "danger-text" };
  }
  if (row.timesLogged === 0) {
    return { label: "Added a swimmer, no times logged", className: "warning-text" };
  }
  const ago = daysAgo(row.lastTimeLoggedAt);
  if (ago !== null && ago <= 30) {
    return { label: "Active — logged a time in the last 30 days", className: "success-text" };
  }
  return { label: "Went quiet", className: "warning-text" };
}

export default function AdminUsagePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void checkAccess(); }, []);

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
    setError(null);
    try {
      const res = await fetch("/api/admin/usage", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load usage data");
      setSummary(json.summary);
      setRows(json.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="shell">
        <div className="container-app pt-10 text-center muted">Checking access...</div>
      </div>
    );
  }
  if (!allowed) return null;

  const activationPct = summary && summary.realUsers > 0
    ? Math.round((summary.activated / summary.realUsers) * 100)
    : 0;

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        <div className="pt-2 pb-1 flex items-start justify-between gap-3">
          <div>
            <p className="label" style={{ color: "#BA7517", marginBottom: "4px" }}>Natrix Admin</p>
            <h1 className="title">Real Usage</h1>
            <p className="mt-2 text-sm muted">
              Who actually logs times, not just who visited.
            </p>
          </div>
          <button onClick={() => void load()} className="btn flex-shrink-0" disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="card">
            <p className="text-sm" style={{ color: "#fca5a5" }}>{error}</p>
          </div>
        )}

        {loading && !summary ? (
          <p className="muted text-sm">Loading...</p>
        ) : summary ? (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card-soft">
                <p className="label">Activation</p>
                <p className="stat-number">{activationPct}%</p>
                <p className="text-xs muted mt-1">
                  {summary.activated} of {summary.realUsers} real users logged a time
                </p>
              </div>
              <div className="card-soft">
                <p className="label">Active now</p>
                <p className="stat-number">{summary.activeLast30Days}</p>
                <p className="text-xs muted mt-1">logged a time in the last 30 days</p>
              </div>
              <div className="card-soft">
                <p className="label">Came back</p>
                <p className="stat-number">{summary.returned}</p>
                <p className="text-xs muted mt-1">opened the app on a different day than signup</p>
              </div>
              <div className="card-soft">
                <p className="label">Total signups</p>
                <p className="stat-number">{summary.totalSignups}</p>
                <p className="text-xs muted mt-1">includes you + seed/test accounts</p>
              </div>
            </div>

            {/* Per-user list */}
            <div className="space-y-2">
              {rows.map((row) => {
                const status = statusFor(row);
                return (
                  <div key={row.userId} className="card-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {row.email}
                          {row.isAdmin && <span className="muted font-normal"> · you</span>}
                          {row.isSeed && <span className="muted font-normal"> · seed/test</span>}
                        </p>
                        <p className="text-xs muted mt-0.5">
                          Signed up {fmtDate(row.signedUpAt)} · last seen {fmtDate(row.lastSignInAt)}
                        </p>
                      </div>
                    </div>

                    <p className={`text-xs font-semibold mt-2 ${status.className}`}>
                      {status.label}
                    </p>

                    <div className="flex gap-4 mt-2 text-xs muted">
                      <span>{row.swimmersAdded} swimmer{row.swimmersAdded === 1 ? "" : "s"}</span>
                      <span>{row.timesLogged} time{row.timesLogged === 1 ? "" : "s"} logged</span>
                      {row.lastTimeLoggedAt && (
                        <span>last logged {fmtDate(row.lastTimeLoggedAt)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
