// app/demo/swimmers/[id]/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  DEMO_SWIMMERS,
  DEMO_TIMES,
  DEMO_STANDARDS,
  getDemoSwimmerById,
  getDemoTimesForSwimmer,
  formatMs,
  formatDate,
  getInitials,
  type DemoTime,
} from "@/lib/demoData";

type Tab = "times" | "progress" | "standards";

const AVATAR_COLORS = [
  { bg: "#0F6E56", text: "#9FE1CB" },
  { bg: "#185FA5", text: "#B5D4F4" },
  { bg: "#854F0B", text: "#FAC775" },
  { bg: "#72243E", text: "#F4C0D1" },
  { bg: "#3C3489", text: "#CECBF6" },
];
function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

function getStrokeColor(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("breast")) return "#34D399";
  if (e.includes("back")) return "#A78BFA";
  if (e.includes("fly")) return "#FB923C";
  if (e.includes("free")) return "#38BDF8";
  if (e.includes("im")) return "#F472B6";
  return "#FDE68A";
}

export default function DemoSwimmerProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const rawId = params?.id;
  const swimmerId = typeof rawId === "string" ? Number(rawId) : Array.isArray(rawId) ? Number(rawId[0]) : null;

  const initialTab = (searchParams?.get("tab") as Tab) ?? "times";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const swimmer = swimmerId != null ? getDemoSwimmerById(swimmerId) : undefined;

  if (!swimmer) {
    return (
      <div className="shell">
        <div className="container-app space-y-5">
          <Link href="/demo/swimmers" className="flex items-center gap-2 text-white/50 text-sm pt-2">
            ← Brood
          </Link>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-lg font-semibold text-white">Swimmer not found</p>
          </div>
        </div>
      </div>
    );
  }

  const colors = avatarColor(swimmer.id);
  const isPrimary = swimmer.group_type === "primary";

  return (
    <div className="shell">
      <div className="container-app space-y-5">
        {/* Back nav */}
        <div className="flex items-center justify-between pt-2">
          <Link href="/demo/swimmers" className="flex items-center gap-2 text-white/50 text-sm">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Brood
          </Link>
        </div>

        {/* Profile card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
              style={{ background: colors.bg, color: colors.text }}>
              {getInitials(swimmer.name)}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white truncate">{swimmer.name}</h1>
              <p className="mt-0.5 text-sm text-white/50">
                Age {swimmer.age} · {swimmer.gender} · {swimmer.swim_club}
              </p>
              <p className="mt-0.5 text-xs text-white/35 truncate">{swimmer.school}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {isPrimary && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.25)", color: "#FDE68A" }}>
                My Swimmer
              </span>
            )}
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" }}>
              {swimmer.squad} Squad
            </span>
            {!isPrimary && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", color: "#7DD3FC" }}>
                Following
              </span>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex rounded-2xl overflow-hidden"
          style={{ background: "rgba(0,20,50,0.3)", border: "1px solid rgba(255,255,255,0.1)" }}>
          {(["times", "progress", "standards"] as Tab[]).map((tab) => {
            const labels: Record<Tab, string> = { times: "Times", progress: "Progress", standards: "Standards" };
            const active = activeTab === tab;
            return (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className="flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition"
                style={active
                  ? { background: "rgba(217,119,6,0.2)", color: "#FDE68A", borderBottom: "2px solid #D97706" }
                  : { color: "rgba(255,255,255,0.4)" }}>
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {activeTab === "times" && <TimesTab swimmerId={swimmer.id} />}
        {activeTab === "progress" && <ProgressTab swimmerId={swimmer.id} />}
        {activeTab === "standards" && (
          <StandardsTab swimmerId={swimmer.id} swimmerSquad={swimmer.squad} />
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Times tab ────────────────────────────────────────────────────────────────

function TimesTab({ swimmerId }: { swimmerId: number }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const rows = useMemo(
    () => getDemoTimesForSwimmer(swimmerId).sort((a, b) => new Date(b.swam_at).getTime() - new Date(a.swam_at).getTime()),
    [swimmerId]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center">
        <p className="text-sm font-semibold text-white">No times yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const color = getStrokeColor(row.event);
        const expanded = expandedId === row.id;
        return (
          <div key={row.id} className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
            <button type="button" onClick={() => setExpandedId(expanded ? null : row.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <div className="w-1 h-9 rounded-full flex-shrink-0" style={{ background: color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{row.event} <span className="text-white/30 font-normal">· {row.course}</span></p>
                <p className="text-xs text-white/40 truncate">{row.meet_name} · {formatDate(row.swam_at)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-base font-bold text-white">{formatMs(row.time_ms)}</p>
                <div className="flex items-center gap-1 justify-end mt-0.5">
                  {row.place && (
                    <span className="text-[10px] text-white/40">#{row.place}</span>
                  )}
                  {row.is_pb && (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(110,231,183,0.15)", color: "#6EE7B7" }}>PB</span>
                  )}
                </div>
              </div>
            </button>
            {expanded && row.splits && (
              <div className="px-4 pb-3">
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <span>Split</span><span className="text-center">Leg</span><span className="text-right">Cum</span>
                  </div>
                  {row.splits.map((s) => (
                    <div key={s.no} className="grid grid-cols-3 px-3 py-2 text-xs"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className="text-white/50">{s.no * 50}m</span>
                      <span className="text-center font-semibold" style={{ color: "#FDE68A" }}>{formatMs(s.legMs)}</span>
                      <span className="text-right text-white/60">{formatMs(s.cumMs)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Progress tab ─────────────────────────────────────────────────────────────

function MiniSparkline({ rows, color }: { rows: DemoTime[]; color: string }) {
  const times = rows.map((r) => r.time_ms);
  if (times.length < 2) return null;
  const W = 300, H = 60, pad = 6;
  const min = Math.min(...times), max = Math.max(...times);
  const range = max - min || 1000;
  const pts = times.map((time, i) => ({
    x: pad + (i / (times.length - 1)) * (W - pad * 2),
    y: H - pad - ((max - time) / range) * (H - pad * 2),
  }));
  const pathD = pts.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    const prev = pts[i - 1];
    const cpx = ((prev.x + p.x) / 2).toFixed(1);
    return `${d} C ${cpx} ${prev.y.toFixed(1)} ${cpx} ${p.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }, "");
  const fillD = `${pathD} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`fg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#fg-${color.replace("#", "")})`} />
      <path d={pathD} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const isPB = times[i] === min;
        const isLatest = i === pts.length - 1;
        return (
          <circle key={i} cx={p.x} cy={p.y} r={isPB || isLatest ? 4.5 : 3} fill={color} opacity={isPB || isLatest ? 0.9 : 0.5} />
        );
      })}
    </svg>
  );
}

function ProgressTab({ swimmerId }: { swimmerId: number }) {
  const rows = getDemoTimesForSwimmer(swimmerId);

  const series = useMemo(() => {
    const map = new Map<string, DemoTime[]>();
    for (const row of rows) {
      const key = `${row.event}|${row.course}`;
      const existing = map.get(key) || [];
      existing.push(row);
      map.set(key, existing);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([key, eventRows]) => {
        const sorted = [...eventRows].sort((a, b) => new Date(a.swam_at).getTime() - new Date(b.swam_at).getTime());
        const times = sorted.map((r) => r.time_ms);
        const pb = Math.min(...times);
        const first = times[0];
        return {
          key,
          label: eventRows[0].event,
          color: getStrokeColor(eventRows[0].event),
          rows: sorted,
          pb,
          first,
          deltaMs: first - pb,
        };
      });
  }, [rows]);

  const bestImprovement = [...series].filter((s) => s.deltaMs > 0).sort((a, b) => b.deltaMs - a.deltaMs)[0] ?? null;

  if (series.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center">
        <p className="text-sm font-semibold text-white">No times yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bestImprovement && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(110,231,183,0.08)", border: "1px solid rgba(110,231,183,0.2)" }}>
          <p className="text-xs font-semibold" style={{ color: "#6EE7B7" }}>Biggest improvement</p>
          <p className="text-sm text-white mt-1">
            {bestImprovement.label} — down {(bestImprovement.deltaMs / 1000).toFixed(2)}s since first recorded swim
          </p>
        </div>
      )}
      {series.map((s) => (
        <div key={s.key} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <p className="text-sm font-semibold text-white">{s.label}</p>
            </div>
            <p className="text-sm font-bold text-white">{formatMs(s.pb)}</p>
          </div>
          <MiniSparkline rows={s.rows} color={s.color} />
          <div className="flex justify-between mt-1 text-[10px] text-white/35">
            <span>{formatDate(s.rows[0].swam_at)}</span>
            <span>{formatDate(s.rows[s.rows.length - 1].swam_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Standards tab ────────────────────────────────────────────────────────────

function StandardsTab({ swimmerId, swimmerSquad }: { swimmerId: number; swimmerSquad: string }) {
  const rows = getDemoTimesForSwimmer(swimmerId);
  const pbMap = new Map<string, number>();
  for (const row of [...rows].sort((a, b) => a.time_ms - b.time_ms)) {
    const key = `${row.event}|${row.course}`;
    if (!pbMap.has(key)) pbMap.set(key, row.time_ms);
  }

  const relevant = DEMO_STANDARDS.filter((s) => s.squad === swimmerSquad);
  const qualified = relevant.filter((s) => {
    const pb = pbMap.get(`${s.event}|${s.course}`);
    return pb != null && pb <= s.cutoffMs;
  }).length;

  if (relevant.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center">
        <p className="text-sm font-semibold text-white">No standards set for this squad</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 flex items-center justify-between"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div>
          <p className="text-sm font-semibold text-white">{swimmerSquad} Squad standards</p>
          <p className="text-xs text-white/40 mt-0.5">{qualified} of {relevant.length} cutoffs met</p>
        </div>
        <div className="text-2xl font-bold" style={{ color: "#6EE7B7" }}>{qualified}/{relevant.length}</div>
      </div>

      {relevant.map((s) => {
        const pb = pbMap.get(`${s.event}|${s.course}`);
        const met = pb != null && pb <= s.cutoffMs;
        const diffMs = pb != null ? pb - s.cutoffMs : null;
        return (
          <div key={`${s.event}-${s.label}`} className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${met ? "rgba(110,231,183,0.25)" : "rgba(255,255,255,0.1)"}` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{s.event} <span className="text-white/30 font-normal">· {s.course}</span></p>
                <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white">{formatMs(s.cutoffMs)}</p>
                <p className="text-xs text-white/40">cutoff</p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-white/50">
                Current PB: {pb != null ? formatMs(pb) : "—"}
              </span>
              {met ? (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(110,231,183,0.15)", color: "#6EE7B7" }}>
                  Qualified
                </span>
              ) : diffMs != null ? (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                  {(diffMs / 1000).toFixed(2)}s to go
                </span>
              ) : (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                  No time yet
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
