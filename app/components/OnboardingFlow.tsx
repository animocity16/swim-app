"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const THEMES = [
  { id: "ocean",    label: "Ocean",    from: "#062840", to: "#0F4C75", accent: "#38BDF8" },
  { id: "midnight", label: "Midnight", from: "#0D0D1A", to: "#1A1A3E", accent: "#A78BFA" },
  { id: "forest",   label: "Forest",   from: "#051A10", to: "#0A3020", accent: "#34D399" },
  { id: "white",    label: "White",    from: "#C9D4DA", to: "#ECF0F3", accent: "#FFFFFF" },
  { id: "cosmos",   label: "Cosmos",   from: "#0D0820", to: "#1E1040", accent: "#F472B6" },
  { id: "slate",    label: "Slate",    from: "#0D1117", to: "#1C2333", accent: "#94A3B8" },
];

const SSC_ALIASES = ["singapore swimming club", "ssc"];
const SSC_SQUADS = [
  { label: "Elem",    value: "Elementary" },
  { label: "Inter",   value: "Intermediate" },
  { label: "Adv",     value: "Advanced" },
  { label: "Elite B", value: "Elite B" },
  { label: "Elite A", value: "Elite A" },
];

type Candidate = {
  id: number;
  name: string;
  age: number;
  gender: string | null;
  swim_club: string | null;
  school: string | null;
};

// Shape returned by the get_pending_swimmer_matches RPC — real scraped
// SGAquatics results that look like they belong to the swimmer just added,
// not the seed-based age/gender competitor list above (that's a different,
// pre-existing system for "follow other swimmers").
type MatchCandidate = {
  matched_name: string;
  team_name: string | null;
  best_similarity: number;
  club_match: boolean | null;
  result_count: number;
};

// Hy-Tek stores names as "Last, First Middle" — flip to "First Middle Last"
// for display. Same helper used on the public swimmer page.
function toDisplayName(hyTekName: string): string {
  const [last, rest] = hyTekName.split(",").map((s) => s.trim());
  if (!rest) return hyTekName;
  return `${rest} ${last}`;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="rounded-full transition-all"
          style={{
            width: i === current ? 20 : 6,
            height: 6,
            background: i === current ? "#FDE68A" : "rgba(255,255,255,0.2)",
          }} />
      ))}
    </div>
  );
}

// ─── Race age helper ──────────────────────────────────────────────────────────

function raceAgeFromBirthYear(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingFlow({ userName }: { userName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const TOTAL_STEPS = 8;

  // Swimmer form
  const [swimmerName, setSwimmerName]     = useState("");
  const [birthYear, setBirthYear]         = useState("");
  const [swimmerGender, setSwimmerGender] = useState<"Male" | "Female" | "">("");
  const [swimmerClub, setSwimmerClub]     = useState("");
  const [swimmerSchool, setSwimmerSchool] = useState("");
  const [swimmerSquad, setSwimmerSquad]   = useState("");
  const [savingSwimmer, setSavingSwimmer] = useState(false);
  const [swimmerError, setSwimmerError]   = useState("");
  const [swimmerSaved, setSwimmerSaved]   = useState(false);
  const [savedSwimmerName, setSavedSwimmerName] = useState("");

  // Real SGAquatics match check (new) — the swimmer's own historical
  // results, found automatically instead of relying on a Meet Mobile scan.
  const [primarySwimmerId, setPrimarySwimmerId] = useState<number | null>(null);
  const [matchCandidates, setMatchCandidates]   = useState<MatchCandidate[]>([]);
  const [matchActingOn, setMatchActingOn]       = useState<string | null>(null);
  const [matchError, setMatchError]             = useState("");
  const [confirmedMatch, setConfirmedMatch]     = useState<MatchCandidate | null>(null);

  // Follow picker
  const [candidates, setCandidates]     = useState<Candidate[]>([]);
  const [selectedIds, setSelectedIds]   = useState<Set<number>>(new Set());
  const [followSubmitting, setFollowSubmitting] = useState(false);
  const [followError, setFollowError]   = useState("");

  // Theme
  const [selectedTheme, setSelectedTheme] = useState("ocean");
  const [saving, setSaving]               = useState(false);

  // Install tab
  const [installTab, setInstallTab] = useState<"iphone" | "android">("iphone");

  function next() { setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1)); }

  // Live race age preview
  const parsedBirthYear = Number(birthYear);
  const currentYear = new Date().getFullYear();
  const previewRaceAge =
    birthYear.length === 4 &&
    !Number.isNaN(parsedBirthYear) &&
    parsedBirthYear > 2000 &&
    parsedBirthYear <= currentYear
      ? raceAgeFromBirthYear(parsedBirthYear)
      : null;

  const isSSC = SSC_ALIASES.includes(swimmerClub.trim().toLowerCase());

  async function handleAddSwimmer() {
    if (!swimmerName.trim()) { setSwimmerError("Please enter a name."); return; }
    if (
      !birthYear ||
      birthYear.length !== 4 ||
      Number.isNaN(parsedBirthYear) ||
      parsedBirthYear < 2000 ||
      parsedBirthYear > currentYear
    ) {
      setSwimmerError("Please enter a valid 4-digit birth year e.g. 2013");
      return;
    }
    if (!swimmerGender) { setSwimmerError("Please select a gender."); return; }

    const age = raceAgeFromBirthYear(parsedBirthYear);
    setSavingSwimmer(true);
    setSwimmerError("");

    try {
      const res = await fetch("/api/claim-swimmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: swimmerName.trim(),
          age,
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

      setSwimmerSaved(true);
      setSavedSwimmerName(swimmerName.trim());
      setCandidates(result.candidates ?? []);
      setPrimarySwimmerId(result.primarySwimmerId ?? null);

      // Check for real, already-scraped SGAquatics results for this exact
      // swimmer before falling back to "scan a Meet Mobile screenshot" —
      // if the automation already has their history, load it automatically
      // instead of asking the parent to do manual work.
      if (result.primarySwimmerId) {
        const { data: matches, error: matchErr } = await supabase.rpc(
          "get_pending_swimmer_matches",
          { p_swimmer_id: result.primarySwimmerId }
        );
        if (!matchErr) {
          setMatchCandidates((matches ?? []) as MatchCandidate[]);
        }
        // A failed match check isn't fatal — the new step below just shows
        // its own "no matches yet" state, same as zero real matches would.
      }

      setSavingSwimmer(false);
      next();
    } catch {
      setSwimmerError("Network error. Please try again.");
      setSavingSwimmer(false);
    }
  }

  async function handleMatchAction(candidate: MatchCandidate, action: "confirm" | "reject") {
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
      setMatchError("Something went wrong saving that. You can try again from your dashboard later.");
      return;
    }

    if (action === "confirm") {
      // Confirming one match clears out the rest automatically on the
      // backend (a swimmer only has one real identity), so just show the
      // confirmed result and move on rather than re-fetch remaining cards.
      setConfirmedMatch(candidate);
      setMatchCandidates([]);
    } else {
      setMatchCandidates((prev) => prev.filter((c) => c.matched_name !== candidate.matched_name));
    }
  }

  function toggleCandidate(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleFollowSelected() {
    if (selectedIds.size === 0) { next(); return; }
    setFollowSubmitting(true);
    setFollowError("");

    try {
      const res = await fetch("/api/follow-swimmers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorIds: Array.from(selectedIds) }),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        setFollowError(result.error ?? "Couldn't follow those swimmers. You can add them later.");
        setFollowSubmitting(false);
        return;
      }

      setFollowSubmitting(false);
      next();
    } catch {
      setFollowError("Network error. You can follow swimmers later from your dashboard.");
      setFollowSubmitting(false);
    }
  }

  async function finish() {
    setSaving(true);
    await supabase.auth.updateUser({ data: { app_theme: selectedTheme } });
    await supabase.auth.updateUser({ data: { onboarding_complete: true } });
    router.replace("/dashboard");
  }

  // ── Step 0: Welcome ──────────────────────────────────────────────────────────

  if (step === 0) return (
    <div className="onb-screen">
      <StepDots total={TOTAL_STEPS} current={0} />
      <div className="text-center space-y-6 px-6">
        <div className="text-6xl mb-2">🏊</div>
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">
            Welcome,<br />{userName}!
          </h1>
          <p className="mt-3 text-white/55 text-base leading-relaxed">
            Natrix is your personal swim meet tracker — built by a swim parent, for swim parents.
          </p>
        </div>
        <div className="space-y-3 text-left">
          {[
            { icon: "📷", title: "Scan results instantly",       desc: "Screenshot Meet Mobile — times save automatically" },
            { icon: "📈", title: "Track every PB",               desc: "Progress charts for every event, every stroke" },
            { icon: "⭐", title: "Check qualifying standards",   desc: "Squad upgrading times — pre-loaded for Singapore" },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 items-start rounded-2xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-xs text-white/45 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={next} className="onb-btn-primary w-full">
          Let's get started →
        </button>
      </div>
    </div>
  );

  // ── Step 1: How it works ─────────────────────────────────────────────────────

  if (step === 1) return (
    <div className="onb-screen">
      <StepDots total={TOTAL_STEPS} current={1} />
      <div className="text-center px-6 space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-white/35 mb-2">How it works</p>
          <h2 className="text-3xl font-bold text-white">Three taps.<br />Times saved.</h2>
        </div>
        <div className="space-y-3">
          {[
            { n: "1", title: "After your child races",  desc: "Open Meet Mobile and find their result on the screen.", color: "#38BDF8" },
            { n: "2", title: "Screenshot and scan",     desc: "Take a screenshot. Open Natrix, tap Scan, upload it.", color: "#FDE68A" },
            { n: "3", title: "Done — time saved",       desc: "Event, time, date and meet name all saved automatically. No typing.", color: "#6EE7B7" },
          ].map((item) => (
            <div key={item.n} className="flex gap-4 items-start rounded-2xl px-4 py-4 text-left"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{ background: item.color + "25", border: `1px solid ${item.color}40`, color: item.color }}>
                {item.n}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={next} className="onb-btn-primary flex-1 w-full">
          Got it →
        </button>
      </div>
    </div>
  );

  // ── Step 2: Add swimmer ──────────────────────────────────────────────────────

  if (step === 2) return (
    <div className="onb-screen">
      <StepDots total={TOTAL_STEPS} current={2} />
      <div className="px-6 space-y-5">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-white/35 mb-2">Your swimmer</p>
          <h2 className="text-3xl font-bold text-white">Who are you<br />tracking?</h2>
          <p className="mt-2 text-sm text-white/45">Add your primary swimmer — you can add more later.</p>
        </div>

        <div className="space-y-3">
          {/* Name */}
          <input
            value={swimmerName}
            onChange={(e) => setSwimmerName(e.target.value)}
            placeholder="Swimmer's full name"
            className="input"
          />

          {/* Birth year */}
          <div>
            <input
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Year of birth e.g. 2013"
              className="input"
              inputMode="numeric"
            />
            {previewRaceAge !== null && previewRaceAge > 0 && previewRaceAge < 30 && (
              <p className="mt-1.5 text-xs font-medium px-1" style={{ color: "#FDE68A" }}>
                ✓ Race age this year: {previewRaceAge}
              </p>
            )}
            {birthYear.length === 4 && (previewRaceAge === null || previewRaceAge <= 0 || previewRaceAge >= 30) && (
              <p className="mt-1.5 text-xs text-red-300 px-1">Please enter a valid birth year</p>
            )}
          </div>

          {/* Gender */}
          <div className="grid grid-cols-2 gap-2">
            {(["Male", "Female"] as const).map((g) => (
              <button key={g} type="button"
                onClick={() => setSwimmerGender(swimmerGender === g ? "" : g)}
                className="rounded-2xl border py-3 text-xs font-semibold transition"
                style={swimmerGender === g
                  ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
                {g === "Male" ? "♂" : "♀"} {g}
              </button>
            ))}
          </div>

          {/* Club */}
          <input
            value={swimmerClub}
            onChange={(e) => { setSwimmerClub(e.target.value); setSwimmerSquad(""); }}
            placeholder="Swim club (optional)"
            className="input"
          />

          {/* Squad — SSC gets buttons, everyone else gets free text */}
          {swimmerClub.trim() && (
            <div>
              <p className="text-xs font-medium text-white/40 px-1 mb-2">
                {isSSC ? "Which squad?" : "Squad (optional)"}
              </p>
              {isSSC ? (
                <div className="grid grid-cols-3 gap-2">
                  {SSC_SQUADS.map((sq) => (
                    <button key={sq.value} type="button"
                      onClick={() => setSwimmerSquad(swimmerSquad === sq.value ? "" : sq.value)}
                      className="rounded-2xl border py-2.5 text-xs font-semibold transition"
                      style={swimmerSquad === sq.value
                        ? { background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.4)", color: "#FDE68A" }
                        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}>
                      {sq.label}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  value={swimmerSquad}
                  onChange={(e) => setSwimmerSquad(e.target.value)}
                  placeholder="e.g. Gold, Development…"
                  className="input"
                />
              )}
            </div>
          )}

          {/* School */}
          <input
            value={swimmerSchool}
            onChange={(e) => setSwimmerSchool(e.target.value)}
            placeholder="School (optional)"
            className="input"
          />
        </div>

        {swimmerError && (
          <p className="text-sm text-red-300 text-center">{swimmerError}</p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={next} className="onb-btn-secondary flex-1">
            Skip for now
          </button>
          <button type="button" onClick={handleAddSwimmer} disabled={savingSwimmer}
            className="onb-btn-primary flex-1 disabled:opacity-50">
            {savingSwimmer ? "Setting up…" : "Add swimmer →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Step 3: Existing results found (NEW) ─────────────────────────────────────
  // Checks the real, automatically-scraped SGAquatics database for this exact
  // swimmer instead of relying on a Meet Mobile screenshot scan. Uses the
  // same get_pending_swimmer_matches / confirm_swimmer_match functions that
  // power the standalone /confirm-swimmer page.

  if (step === 3) {
    if (confirmedMatch) return (
      <div className="onb-screen">
        <StepDots total={TOTAL_STEPS} current={3} />
        <div className="text-center px-6 space-y-5">
          <div className="text-5xl">🎉</div>
          <h2 className="text-3xl font-bold text-white">Found it!</h2>
          <p className="text-sm text-white/45">
            {confirmedMatch.result_count} result{confirmedMatch.result_count === 1 ? "" : "s"} for{" "}
            {toDisplayName(confirmedMatch.matched_name)} {confirmedMatch.result_count === 1 ? "is" : "are"} already
            loaded into {savedSwimmerName || "your swimmer"}&apos;s account — no scanning needed.
          </p>
          <button type="button" onClick={next} className="onb-btn-primary w-full">
            Continue →
          </button>
        </div>
      </div>
    );

    return (
      <div className="onb-screen">
        <StepDots total={TOTAL_STEPS} current={3} />
        <div className="px-6 space-y-5">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-white/35 mb-2">Existing results</p>
            <h2 className="text-3xl font-bold text-white">
              {matchCandidates.length > 0 ? "Is this you?" : "Nothing found yet"}
            </h2>
            <p className="mt-2 text-sm text-white/45">
              {matchCandidates.length > 0
                ? `We found ${matchCandidates.length === 1 ? "a swimmer" : "swimmers"} in our meet records that might be ${savedSwimmerName || "your swimmer"}. Confirm to load their full history automatically.`
                : `We haven't found ${savedSwimmerName || "your swimmer"} in our meet records yet. That's fine — you can scan a Meet Mobile screenshot instead, and we'll keep checking automatically as new results come in.`}
            </p>
          </div>

          {matchCandidates.length > 0 && (
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {matchCandidates.map((c) => (
                <div key={c.matched_name} className="rounded-2xl px-4 py-3"
                  style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(253,230,138,0.3)" }}>
                  <p className="text-sm font-semibold text-white">{toDisplayName(c.matched_name)}</p>
                  {c.team_name && <p className="text-xs text-white/45 mt-0.5">{c.team_name}</p>}
                  <p className="text-xs mt-1 font-medium" style={{ color: "#FDE68A" }}>
                    {c.result_count} result{c.result_count === 1 ? "" : "s"} found
                    {c.club_match ? " · club matches" : ""}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button type="button"
                      disabled={matchActingOn === c.matched_name}
                      onClick={() => handleMatchAction(c, "reject")}
                      className="onb-btn-secondary flex-1 disabled:opacity-50">
                      Not them
                    </button>
                    <button type="button"
                      disabled={matchActingOn === c.matched_name}
                      onClick={() => handleMatchAction(c, "confirm")}
                      className="onb-btn-primary flex-1 disabled:opacity-50">
                      {matchActingOn === c.matched_name ? "Saving…" : "Yes, that's them"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {matchError && (
            <p className="text-sm text-red-300 text-center">{matchError}</p>
          )}

          <button type="button" onClick={next} className="onb-btn-secondary w-full">
            {matchCandidates.length > 0 ? "Skip for now" : "Continue →"}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 4: Who do you want to follow ────────────────────────────────────────

  if (step === 4) return (
    <div className="onb-screen">
      <StepDots total={TOTAL_STEPS} current={4} />
      <div className="px-6 space-y-5">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-white/35 mb-2">Optional</p>
          <h2 className="text-3xl font-bold text-white">Follow other<br />swimmers?</h2>
          <p className="mt-2 text-sm text-white/45">
            {candidates.length > 0
              ? `${candidates.length} swimmer${candidates.length > 1 ? "s" : ""} in ${savedSwimmerName || "your swimmer"}'s age group. Pick who you want to follow — you can add more anytime.`
              : "No other swimmers in this age group yet. You can follow swimmers anytime from your dashboard."}
          </p>
        </div>

        {candidates.length > 0 && (
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {candidates.map((c) => {
              const isSelected = selectedIds.has(c.id);
              return (
                <div key={c.id}
                  onClick={() => toggleCandidate(c.id)}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer transition"
                  style={isSelected
                    ? { background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.4)" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                    <p className="text-xs text-white/45 mt-0.5 truncate">
                      {c.swim_club || "Unattached"}{c.school ? ` · ${c.school}` : ""}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCandidate(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-[18px] h-[18px] flex-shrink-0"
                    aria-label={`Follow ${c.name}`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {followError && (
          <p className="text-sm text-red-300 text-center">{followError}</p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={next} className="onb-btn-secondary flex-1">
            Skip for now
          </button>
          <button type="button" onClick={handleFollowSelected} disabled={followSubmitting}
            className="onb-btn-primary flex-1 disabled:opacity-50">
            {followSubmitting
              ? "Following…"
              : selectedIds.size === 0
              ? "Continue →"
              : `Follow ${selectedIds.size} →`}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Step 5: Choose theme ─────────────────────────────────────────────────────

  if (step === 5) return (
    <div className="onb-screen">
      <StepDots total={TOTAL_STEPS} current={5} />
      <div className="px-6 space-y-5">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-white/35 mb-2">Make it yours</p>
          <h2 className="text-3xl font-bold text-white">Choose your<br />app theme</h2>
          <p className="mt-2 text-sm text-white/45">Pick a colour that feels right. You can also set a photo or video background in Settings → Appearance.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((theme) => (
            <button key={theme.id} type="button"
              onClick={() => setSelectedTheme(theme.id)}
              className="relative rounded-2xl overflow-hidden transition"
              style={{
                aspectRatio: "1",
                background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
                border: selectedTheme === theme.id
                  ? `2px solid ${theme.accent}`
                  : "1px solid rgba(255,255,255,0.12)",
              }}>
              {selectedTheme === theme.id && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full w-7 h-7 flex items-center justify-center"
                    style={{ background: theme.accent }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 7l3.5 3.5L12 4" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 p-2">
                <p className="text-[10px] font-semibold text-white/80 text-center">{theme.label}</p>
              </div>
            </button>
          ))}
        </div>

        <button type="button" onClick={next} className="onb-btn-primary w-full">
          Looks great →
        </button>
        <p className="text-xs text-white/25">You can always change your theme and settings later.</p>
      </div>
    </div>
  );

  // ── Step 6: Install on your phone ────────────────────────────────────────────

  if (step === 6) return (
    <div className="onb-screen">
      <StepDots total={TOTAL_STEPS} current={6} />
      <div className="px-6 space-y-5">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-white/35 mb-2">One last thing</p>
          <h2 className="text-3xl font-bold text-white">Add Natrix to<br />your home screen</h2>
          <p className="mt-2 text-sm text-white/45">It opens like a real app — no browser bar, full screen.</p>
        </div>

        <div className="flex rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
          {(["iphone", "android"] as const).map((tab) => (
            <button key={tab} type="button"
              onClick={() => setInstallTab(tab)}
              className="flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition"
              style={installTab === tab
                ? { background: "rgba(217,119,6,0.25)", color: "#FDE68A" }
                : { background: "transparent", color: "rgba(255,255,255,0.4)" }}>
              {tab === "iphone" ? "📱 iPhone" : "🤖 Android"}
            </button>
          ))}
        </div>

        {installTab === "iphone" && (
          <div className="space-y-3">
            <div className="rounded-2xl px-4 py-3 text-sm text-amber-200/80 font-medium"
              style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(253,230,138,0.2)" }}>
              ⚠️ Must be opened in <strong>Safari</strong> — not Chrome or another browser.
            </div>
            {[
              { n: "1", icon: "🧭", title: "Open in Safari",             desc: "Copy swimnatrix.vercel.app and paste it into Safari if you're not already there." },
              { n: "2", icon: "⬆️", title: "Tap the Share button",       desc: "The Share icon is at the bottom of Safari — a box with an arrow pointing up." },
              { n: "3", icon: "➕", title: "Add to Home Screen",          desc: 'Scroll down and tap "Add to Home Screen", then tap Add.' },
              { n: "4", icon: "🏊", title: "Open Natrix from home screen", desc: "Tap the Natrix icon — full screen, no browser bar!" },
            ].map((item) => (
              <div key={item.n} className="flex gap-3 items-start rounded-2xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                  style={{ background: "rgba(253,230,138,0.12)", border: "1px solid rgba(253,230,138,0.25)", color: "#FDE68A" }}>
                  {item.n}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{item.icon} {item.title}</p>
                  <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {installTab === "android" && (
          <div className="space-y-3">
            <div className="rounded-2xl px-4 py-3 text-sm text-amber-200/80 font-medium"
              style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(253,230,138,0.2)" }}>
              ⚠️ Must be opened in <strong>Chrome</strong> for the install option to appear.
            </div>
            {[
              { n: "1", icon: "🌐", title: "Open in Chrome",              desc: "Copy swimnatrix.vercel.app and paste it into Chrome if you're not already there." },
              { n: "2", icon: "⋮",  title: "Tap the three-dot menu",      desc: "Tap the ⋮ menu in the top-right corner of Chrome." },
              { n: "3", icon: "➕", title: "Add to Home screen",           desc: 'Tap "Add to Home screen" and confirm by tapping Add.' },
              { n: "4", icon: "🏊", title: "Open Natrix from home screen", desc: "Tap the Natrix icon — it launches full screen. You're in!" },
            ].map((item) => (
              <div key={item.n} className="flex gap-3 items-start rounded-2xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                  style={{ background: "rgba(253,230,138,0.12)", border: "1px solid rgba(253,230,138,0.25)", color: "#FDE68A" }}>
                  {item.n}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{item.icon} {item.title}</p>
                  <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={next} className="onb-btn-secondary flex-1">Skip for now</button>
          <button type="button" onClick={next} className="onb-btn-primary flex-1">Done! →</button>
        </div>
      </div>
    </div>
  );

  // ── Step 7: All set ──────────────────────────────────────────────────────────

  if (step === 7) return (
    <div className="onb-screen">
      <StepDots total={TOTAL_STEPS} current={7} />
      <div className="text-center px-6 space-y-6">
        <div className="text-6xl">🎉</div>
        <div>
          <h2 className="text-4xl font-bold text-white tracking-tight">You're all set!</h2>
          <p className="mt-3 text-white/55 text-base leading-relaxed">
            {confirmedMatch
              ? `${savedSwimmerName}'s results are already loaded — ${confirmedMatch.result_count} race${confirmedMatch.result_count === 1 ? "" : "s"} and counting.`
              : swimmerSaved
              ? `${savedSwimmerName} has been added. Start scanning their results!`
              : "Your account is ready. Add your swimmer and start tracking results."}
          </p>
        </div>

        <div className="space-y-3">
          {confirmedMatch ? (
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ background: "rgba(217,119,6,0.12)", border: "1px solid rgba(253,230,138,0.25)" }}>
              <span style={{ fontSize: 22 }}>📊</span>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">View {savedSwimmerName}&apos;s results</p>
                <p className="text-xs text-white/40 mt-0.5">Already loaded — new results get added automatically</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ background: "rgba(217,119,6,0.12)", border: "1px solid rgba(253,230,138,0.25)" }}>
              <span style={{ fontSize: 22 }}>📷</span>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Scan your child&apos;s latest result</p>
                <p className="text-xs text-white/40 mt-0.5">
                  We&apos;ll also keep checking automatically — this is just for meets we haven&apos;t found yet.
                </p>
              </div>
            </div>
          )}
        </div>

        <button type="button" onClick={finish} disabled={saving}
          className="onb-btn-primary w-full disabled:opacity-50 text-base">
          {saving ? "Setting up…" : "Take me to Natrix 🏊"}
        </button>
      </div>
    </div>
  );

  return null;
}
