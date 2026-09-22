"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const PENDING_MATCH_KEY = "natrix_pending_match";

type PendingMatch = {
  displayName: string;
  team: string | null;
};

type MatchCandidate = {
  matched_name: string;
  team_name: string | null;
  best_similarity: number;
  club_match: boolean | null;
  result_count: number;
};

function toDisplayName(hyTekName: string): string {
  const [last, rest] = hyTekName.split(",").map((s) => s.trim());
  if (!rest) return hyTekName;
  return `${rest} ${last}`;
}

function raceAgeFromBirthYear(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}

function StepDots({ current }: { current: number }) {
  const total = 4;

  return (
    <div className="mb-5 flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all"
          style={{
            width: i === current ? 24 : 7,
            height: 7,
            background: i === current ? "#2B9CF3" : "rgba(255,255,255,0.20)",
          }}
        />
      ))}
    </div>
  );
}

function Shell({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen px-5 py-7 md:py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/natrix-favicon.svg"
            alt="Natrix"
            className="h-10 w-10 object-contain"
          />
          <div>
            <div className="text-xl font-bold tracking-tight text-white">Natrix</div>
            <div className="text-[10px] text-white/40">Swim Smarter Together</div>
          </div>
        </div>

        <StepDots current={step} />
        {children}

        <p className="mt-5 text-center text-[10px] text-white/30">
          Natrix · Singapore · Built for swim families
        </p>
      </div>
    </div>
  );
}

export default function OnboardingFlow({ userName }: { userName: string }) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null);

  const [swimmerName, setSwimmerName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [swimmerGender, setSwimmerGender] = useState<"Male" | "Female" | "">("");
  const [swimmerClub, setSwimmerClub] = useState("");
  const [swimmerSchool, setSwimmerSchool] = useState("");
  const [swimmerSquad, setSwimmerSquad] = useState("");

  const [savingSwimmer, setSavingSwimmer] = useState(false);
  const [swimmerError, setSwimmerError] = useState("");

  const [primarySwimmerId, setPrimarySwimmerId] = useState<number | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);
  const [confirmedMatch, setConfirmedMatch] = useState<MatchCandidate | null>(null);
  const [matchActingOn, setMatchActingOn] = useState<string | null>(null);
  const [matchError, setMatchError] = useState("");

  const [installTab, setInstallTab] = useState<"iphone" | "android">("iphone");
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_MATCH_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PendingMatch;
      setPendingMatch(parsed);
      setSwimmerName(parsed.displayName ?? "");
      setSwimmerClub(parsed.team ?? "");
    } catch {
      // Ignore malformed search handoff.
    }
  }, []);

  const currentYear = new Date().getFullYear();
  const parsedBirthYear = Number(birthYear);

  function next() {
    setStep((s) => Math.min(s + 1, 3));
  }

  async function handleAddSwimmer() {
    if (!swimmerName.trim()) {
      setSwimmerError("Please enter the swimmer's name.");
      return;
    }

    if (
      !birthYear ||
      birthYear.length !== 4 ||
      Number.isNaN(parsedBirthYear) ||
      parsedBirthYear < 2000 ||
      parsedBirthYear > currentYear
    ) {
      setSwimmerError("Please enter a valid 4-digit birth year.");
      return;
    }

    if (!swimmerGender) {
      setSwimmerError("Please select a gender.");
      return;
    }

    setSavingSwimmer(true);
    setSwimmerError("");

    try {
      const res = await fetch("/api/claim-swimmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: swimmerName.trim(),
          age: raceAgeFromBirthYear(parsedBirthYear),
          gender: swimmerGender,
          swim_club: swimmerClub.trim() || null,
          school: swimmerSchool.trim() || null,
          squad: swimmerSquad.trim() || null,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setSwimmerError(result.error ?? "Something went wrong. Please try again.");
        setSavingSwimmer(false);
        return;
      }

      const swimmerId = result.primarySwimmerId ?? null;
      setPrimarySwimmerId(swimmerId);

      if (swimmerId) {
        const { data: matches, error: matchErr } = await supabase.rpc(
          "get_pending_swimmer_matches",
          { p_swimmer_id: swimmerId }
        );

        if (!matchErr) {
          setMatchCandidates((matches ?? []) as MatchCandidate[]);
        }
      }

      setSavingSwimmer(false);
      next();
    } catch {
      setSwimmerError("Network error. Please try again.");
      setSavingSwimmer(false);
    }
  }

  async function handleMatchAction(
    candidate: MatchCandidate,
    action: "confirm" | "reject"
  ) {
    if (!primarySwimmerId) return;

    setMatchActingOn(candidate.matched_name);
    setMatchError("");

    const { error } = await supabase.rpc("confirm_swimmer_match", {
      p_swimmer_id: primarySwimmerId,
      p_matched_name: candidate.matched_name,
      p_action: action,
    });

    setMatchActingOn(null);

    if (error) {
      setMatchError("We couldn't save that match. You can review it later from your dashboard.");
      return;
    }

    if (action === "confirm") {
      setConfirmedMatch(candidate);
      setMatchCandidates([]);
    } else {
      setMatchCandidates((prev) =>
        prev.filter((c) => c.matched_name !== candidate.matched_name)
      );
    }
  }

  async function finish() {
    setFinishing(true);

    await supabase.auth.updateUser({
      data: { onboarding_complete: true },
    });

    try {
      sessionStorage.removeItem(PENDING_MATCH_KEY);
    } catch {}

    router.replace("/dashboard");
  }

  if (step === 0) {
    return (
      <Shell step={0}>
        <div className="mb-5 flex items-center gap-4">
          <img
            src="/natrix-mascot-search.png"
            alt="Natrix mascot"
            className="h-28 w-28 flex-shrink-0 object-contain"
          />

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/80">
              Welcome, {userName}
            </p>

            <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight text-white">
              {pendingMatch ? `${pendingMatch.displayName} is ready` : "Let's set up your swimmer"}
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-white/55">
              {pendingMatch
                ? "You already found your swimmer. Now we just need a few details to connect their results to your account."
                : "Add one swimmer now. You can add more later from your dashboard."}
            </p>
          </div>
        </div>

        {pendingMatch && (
          <div
            className="mb-5 rounded-[24px] p-4"
            style={{
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200/75">
              Ready to connect
            </div>
            <div className="mt-1 text-base font-bold text-white">
              {pendingMatch.displayName}
            </div>
            {pendingMatch.team && (
              <div className="mt-0.5 text-xs text-white/45">
                {pendingMatch.team}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={next}
          className="w-full rounded-2xl py-3.5 text-base font-bold text-white"
          style={{
            background: "linear-gradient(135deg,#2B9CF3,#0871D8)",
            boxShadow: "0 10px 22px rgba(0,106,220,0.22)",
          }}
        >
          Continue →
        </button>
      </Shell>
    );
  }

  if (step === 1) {
    return (
      <Shell step={1}>
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/80">
            Swimmer details
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            Confirm your swimmer
          </h1>
          <p className="mt-2 text-sm text-white/55">
            We use these details to make sure the right results are connected.
          </p>
        </div>

        <div
          className="rounded-[28px] p-5"
          style={{
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(255,255,255,0.9)",
            boxShadow: "0 18px 42px rgba(0,25,55,0.20)",
          }}
        >
          <div className="space-y-3">
            <input
              value={swimmerName}
              onChange={(e) => setSwimmerName(e.target.value)}
              placeholder="Swimmer name"
              className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none"
              style={{ background: "#F7FAFD", borderColor: "#DCE8F0", color: "#0B2A54" }}
            />

            <input
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Birth year e.g. 2016"
              inputMode="numeric"
              className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none"
              style={{ background: "#F7FAFD", borderColor: "#DCE8F0", color: "#0B2A54" }}
            />

            <div className="grid grid-cols-2 gap-3">
              {(["Male", "Female"] as const).map((gender) => {
                const selected = swimmerGender === gender;
                return (
                  <button
                    key={gender}
                    type="button"
                    onClick={() => setSwimmerGender(gender)}
                    className="rounded-2xl border py-3 text-sm font-bold"
                    style={
                      selected
                        ? { background: "#E6F4FF", borderColor: "#2B9CF3", color: "#0871D8" }
                        : { background: "#F7FAFD", borderColor: "#DCE8F0", color: "#71859A" }
                    }
                  >
                    {gender}
                  </button>
                );
              })}
            </div>

            <input
              value={swimmerClub}
              onChange={(e) => setSwimmerClub(e.target.value)}
              placeholder="Swim club"
              className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none"
              style={{ background: "#F7FAFD", borderColor: "#DCE8F0", color: "#0B2A54" }}
            />

            <input
              value={swimmerSchool}
              onChange={(e) => setSwimmerSchool(e.target.value)}
              placeholder="School (optional)"
              className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none"
              style={{ background: "#F7FAFD", borderColor: "#DCE8F0", color: "#0B2A54" }}
            />

            <input
              value={swimmerSquad}
              onChange={(e) => setSwimmerSquad(e.target.value)}
              placeholder="Squad (optional)"
              className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none"
              style={{ background: "#F7FAFD", borderColor: "#DCE8F0", color: "#0B2A54" }}
            />

            {swimmerError && (
              <p
                className="rounded-2xl px-3 py-2 text-sm"
                style={{ background: "#FFF0F0", border: "1px solid #F4CACA", color: "#B33A3A" }}
              >
                {swimmerError}
              </p>
            )}

            <button
              type="button"
              onClick={handleAddSwimmer}
              disabled={savingSwimmer}
              className="w-full rounded-2xl py-3.5 text-base font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#2B9CF3,#0871D8)" }}
            >
              {savingSwimmer ? "Connecting swimmer..." : "Connect swimmer →"}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (step === 2) {
    return (
      <Shell step={2}>
        <div className="mb-5 flex items-center gap-4">
          <img
            src="/natrix-mascot-search.png"
            alt="Natrix mascot"
            className="h-24 w-24 flex-shrink-0 object-contain"
          />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/80">
              Results connection
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
              {confirmedMatch ? "Connected 🎉" : "Let's check their results"}
            </h1>
          </div>
        </div>

        {confirmedMatch ? (
          <div
            className="rounded-[28px] p-5"
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(255,255,255,0.9)",
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#168257" }}>
              Result history connected
            </div>
            <div className="mt-2 text-xl font-bold" style={{ color: "#0B2A54" }}>
              {toDisplayName(confirmedMatch.matched_name)}
            </div>
            <div className="mt-1 text-sm" style={{ color: "#71859A" }}>
              {confirmedMatch.result_count} result{confirmedMatch.result_count === 1 ? "" : "s"} found
            </div>

            <button
              type="button"
              onClick={next}
              className="mt-5 w-full rounded-2xl py-3.5 text-base font-bold text-white"
              style={{ background: "linear-gradient(135deg,#2B9CF3,#0871D8)" }}
            >
              Continue →
            </button>
          </div>
        ) : matchCandidates.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-white/55">
              We found results that may belong to {swimmerName}. Confirm the right swimmer.
            </p>

            {matchCandidates.map((candidate) => (
              <div
                key={candidate.matched_name}
                className="rounded-[24px] p-4"
                style={{
                  background: "rgba(255,255,255,0.96)",
                  border: "1px solid rgba(255,255,255,0.9)",
                }}
              >
                <div className="text-base font-bold" style={{ color: "#0B2A54" }}>
                  {toDisplayName(candidate.matched_name)}
                </div>

                {candidate.team_name && (
                  <div className="mt-1 text-xs" style={{ color: "#71859A" }}>
                    {candidate.team_name}
                  </div>
                )}

                <div className="mt-2 text-xs" style={{ color: "#71859A" }}>
                  {candidate.result_count} result{candidate.result_count === 1 ? "" : "s"} found
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={matchActingOn === candidate.matched_name}
                    onClick={() => handleMatchAction(candidate, "reject")}
                    className="rounded-2xl border py-3 text-sm font-bold"
                    style={{ background: "#F7FAFD", borderColor: "#DCE8F0", color: "#71859A" }}
                  >
                    Not mine
                  </button>

                  <button
                    type="button"
                    disabled={matchActingOn === candidate.matched_name}
                    onClick={() => handleMatchAction(candidate, "confirm")}
                    className="rounded-2xl py-3 text-sm font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#2B9CF3,#0871D8)" }}
                  >
                    {matchActingOn === candidate.matched_name ? "Saving..." : "Yes, that's them"}
                  </button>
                </div>
              </div>
            ))}

            {matchError && (
              <p className="text-sm text-red-300">{matchError}</p>
            )}
          </div>
        ) : (
          <div
            className="rounded-[28px] p-5"
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(255,255,255,0.9)",
            }}
          >
            <div className="text-xl font-bold" style={{ color: "#0B2A54" }}>
              You're set
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "#71859A" }}>
              We don't need you to scan anything right now. Natrix will keep checking for new supported results and you can add results manually whenever you need to.
            </p>

            <button
              type="button"
              onClick={next}
              className="mt-5 w-full rounded-2xl py-3.5 text-base font-bold text-white"
              style={{ background: "linear-gradient(135deg,#2B9CF3,#0871D8)" }}
            >
              Continue →
            </button>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell step={3}>
      <div className="mb-5 flex items-center gap-4">
        <img
          src="/natrix-mascot-search.png"
          alt="Natrix mascot"
          className="h-24 w-24 flex-shrink-0 object-contain"
        />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/80">
            One last thing
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            Make Natrix feel like an app
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/55">
            Add Natrix to your Home Screen so you can open it with one tap.
          </p>
        </div>
      </div>

      <div
        className="rounded-[28px] p-5"
        style={{
          background: "rgba(255,255,255,0.96)",
          border: "1px solid rgba(255,255,255,0.9)",
        }}
      >
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setInstallTab("iphone")}
            className="rounded-2xl border py-3 text-sm font-bold"
            style={
              installTab === "iphone"
                ? { background: "#E6F4FF", borderColor: "#2B9CF3", color: "#0871D8" }
                : { background: "#F7FAFD", borderColor: "#DCE8F0", color: "#71859A" }
            }
          >
            iPhone
          </button>

          <button
            type="button"
            onClick={() => setInstallTab("android")}
            className="rounded-2xl border py-3 text-sm font-bold"
            style={
              installTab === "android"
                ? { background: "#E6F4FF", borderColor: "#2B9CF3", color: "#0871D8" }
                : { background: "#F7FAFD", borderColor: "#DCE8F0", color: "#71859A" }
            }
          >
            Android
          </button>
        </div>

        <div className="space-y-3">
          {(installTab === "iphone"
            ? [
                ["1", "Open Natrix in Safari"],
                ["2", "Tap the Share button"],
                ["3", "Choose Add to Home Screen"],
                ["4", "Tap Add"],
              ]
            : [
                ["1", "Open Natrix in Chrome"],
                ["2", "Tap the browser menu"],
                ["3", "Choose Add to Home screen"],
                ["4", "Confirm Add"],
              ]
          ).map(([number, text]) => (
            <div key={number} className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "#E6F4FF", color: "#0871D8" }}
              >
                {number}
              </div>
              <div className="text-sm font-semibold" style={{ color: "#0B2A54" }}>
                {text}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={finish}
          disabled={finishing}
          className="mt-5 w-full rounded-2xl py-3.5 text-base font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#2B9CF3,#0871D8)" }}
        >
          {finishing ? "Opening Natrix..." : "Go to my dashboard →"}
        </button>

        <button
          type="button"
          onClick={finish}
          disabled={finishing}
          className="mt-3 w-full text-center text-xs font-semibold"
          style={{ color: "#71859A" }}
        >
          Not now
        </button>
      </div>
    </Shell>
  );
}
