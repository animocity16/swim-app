// app/demo/meets/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DEMO_MEETS,
  DEMO_TIMES,
  DEMO_SWIMMERS,
  DEMO_PRIMARY_SWIMMER_ID,
  formatDate,
  type DemoMeet,
} from "@/lib/demoData";
import { splitMeetsByStatus, useNow } from "../meetStatus";

function meetEmoji(meetType: string): string {
  switch (meetType) {
    case "SNAG": return "🌟";
    case "ETC": return "🎉";
    case "NSG": return "🏫";
    case "NSC": return "🏆";
    default: return "🏊";
  }
}

type PastMeet = { meetName: string; resultCount: number; latestDate: string | null };

// One scheduled meet (name, place, date, and the primary swimmer's events if
// we have them). Used for both upcoming and past meets; past ones get a chip.
function ScheduledMeetCard({
  meet,
  primaryName,
  expanded,
  onToggle,
  isPast,
}: {
  meet: DemoMeet;
  primaryName: string;
  expanded: boolean;
  onToggle: () => void;
  isPast: boolean;
}) {
  return (
    <div className="rounded-3xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left">
        <span style={{ fontSize: 22 }}>{meetEmoji(meet.meetType)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{meet.name}</p>
          <p className="text-xs text-white/40 mt-0.5 truncate">{meet.location}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-semibold text-white/70">{formatDate(meet.startDate)}</p>
          {isPast && (
            <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}>
              Past
            </span>
          )}
          {meet.swimmerEvents && (
            <p className="text-[10px] mt-0.5" style={{ color: "#FDE68A" }}>{meet.swimmerEvents.length} events</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {meet.swimmerEvents && meet.swimmerEvents.length > 0 ? (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/35"
                style={{ background: "rgba(255,255,255,0.03)" }}>
                {primaryName}&apos;s events — pulled from scanned start list
              </div>
              {meet.swimmerEvents.map((ev, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 text-xs"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <p className="font-medium text-white">{ev.event}</p>
                    <p className="text-white/40 mt-0.5">Heat {ev.heat} · Lane {ev.lane}</p>
                  </div>
                  <p className="font-semibold" style={{ color: "#FDE68A" }}>{ev.startTime}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs text-white/40">Scan the PDF start list to pull in events automatically</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DemoMeetsPage() {
  const [tab, setTab] = useState<"upcoming" | "past">("past");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const primary = DEMO_SWIMMERS.find((s) => s.id === DEMO_PRIMARY_SWIMMER_ID)!;

  // Which meets are upcoming vs past depends on today's date, so it is worked
  // out in the browser (see useNow). The meet dates themselves are unchanged.
  const now = useNow();
  const { upcoming: upcomingMeets, past: pastScheduledMeets } = useMemo(
    () => (now ? splitMeetsByStatus(DEMO_MEETS, now) : { upcoming: [], past: [] }),
    [now]
  );

  // Past meets are derived from logged results, same as the real app —
  // any distinct meet_name that shows up in a scanned time becomes a card.
  const pastMeets = useMemo((): PastMeet[] => {
    const map = new Map<string, PastMeet>();
    for (const t of DEMO_TIMES) {
      const existing = map.get(t.meet_name);
      if (!existing) {
        map.set(t.meet_name, { meetName: t.meet_name, resultCount: 1, latestDate: t.swam_at });
      } else {
        existing.resultCount++;
        if (t.swam_at && (!existing.latestDate || t.swam_at > existing.latestDate)) existing.latestDate = t.swam_at;
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.latestDate ?? "").localeCompare(a.latestDate ?? ""));
  }, []);

  return (
    <div className="shell">
      <div className="container-app space-y-5">
        <div className="pt-2">
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>Natrix</p>
          <h1 className="mt-1 text-2xl font-bold text-white">Meets</h1>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-2xl p-[3px] gap-[3px]" style={{ background: "rgba(255,255,255,0.06)" }}>
          {(["upcoming", "past"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className="flex-1 rounded-xl py-2 text-sm font-semibold capitalize transition"
              style={tab === t ? { background: "rgba(255,255,255,0.12)", color: "#fff" } : { color: "rgba(255,255,255,0.4)" }}>
              {t}
            </button>
          ))}
        </div>

        {tab === "upcoming" ? (
          <div className="space-y-3">
            {upcomingMeets.map((meet) => (
              <ScheduledMeetCard key={meet.id} meet={meet} primaryName={primary.name} isPast={false}
                expanded={expandedId === meet.id}
                onToggle={() => setExpandedId(expandedId === meet.id ? null : meet.id)} />
            ))}

            {now && upcomingMeets.length === 0 && (
              <div className="rounded-3xl p-6 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <p className="text-sm font-semibold text-white">No upcoming meets in the demo</p>
                <p className="mt-1 text-xs text-white/40">The sample meets have already taken place. You can find them under Past.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {pastScheduledMeets.map((meet) => (
              <ScheduledMeetCard key={meet.id} meet={meet} primaryName={primary.name} isPast
                expanded={expandedId === meet.id}
                onToggle={() => setExpandedId(expandedId === meet.id ? null : meet.id)} />
            ))}

            {pastMeets.map((meet) => (
              <Link key={meet.meetName} href={`/demo/meets/${encodeURIComponent(meet.meetName)}`}
                className="flex items-center gap-4 rounded-3xl p-4"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-lg"
                  style={{ background: "rgba(217,119,6,0.18)", border: "1px solid rgba(253,230,138,0.2)" }}>
                  🏊
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{meet.meetName}</p>
                  <p className="text-xs text-white/40 mt-0.5">{formatDate(meet.latestDate)}</p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold flex-shrink-0"
                  style={{ background: "rgba(217,119,6,0.18)", border: "1px solid rgba(253,230,138,0.22)", color: "#FDE68A" }}>
                  {meet.resultCount} result{meet.resultCount !== 1 ? "s" : ""}
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
