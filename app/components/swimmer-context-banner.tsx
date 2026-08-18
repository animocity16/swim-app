"use client";

import { useEffect, useState } from "react";

const PENDING_MATCH_KEY = "natrix_pending_match";

type PendingMatch = {
  displayName: string;
  team: string | null;
};

/**
 * Shows a "Following [Name]" pill on signup when the parent arrived from a
 * search result, so it doesn't feel like starting over. Renders nothing on
 * a normal signup visit.
 */
export default function SwimmerContextBanner() {
  const [match, setMatch] = useState<PendingMatch | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_MATCH_KEY);
    if (raw) {
      try {
        setMatch(JSON.parse(raw));
      } catch {
        // ignore malformed value
      }
    }
  }, []);

  if (!match) return null;

  const initials = match.displayName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="card-soft mb-4 flex items-center gap-3">
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
        style={{ background: "rgba(217,119,6,0.5)" }}
      >
        {initials}
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#FDE68A" }}>
          Ready to Track
        </div>
        <div className="text-sm font-semibold text-white">
          {match.displayName}
          {match.team ? ` · ${match.team}` : ""}
        </div>
      </div>
    </div>
  );
}
