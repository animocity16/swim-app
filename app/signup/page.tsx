"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SwimmerContextBanner from "@/app/components/swimmer-context-banner";

function EyeIcon({ show }: { show: boolean }) {
  return show ? (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1 9C1 9 4 3 9 3s8 6 8 6-3 6-8 6-8-6-8-6Z" stroke="#7A8EA3" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="9" r="2.5" stroke="#7A8EA3" strokeWidth="1.4"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1 1l16 16M7.5 7.6A2.5 2.5 0 0 0 11.4 11M5.2 5.3C3.3 6.5 2 8 2 9c0 0 3 5.5 7 5.5a7 7 0 0 0 3.5-1M9 3.5C13 3.5 16 9 16 9a13 13 0 0 1-1.5 2" stroke="#7A8EA3" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PasswordInput({
  placeholder,
  value,
  onChange,
  autoComplete,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border px-4 py-3.5 pr-12 text-sm outline-none"
        style={{
          background: "#F7FAFD",
          borderColor: "#DCE8F0",
          color: "#0B2A54",
        }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center"
        tabIndex={-1}
      >
        <EyeIcon show={show} />
      </button>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName.trim()) { setStatus("Please enter your first name."); setIsError(true); return; }
    if (!email.trim()) { setStatus("Please enter your email."); setIsError(true); return; }
    if (!password) { setStatus("Please enter a password."); setIsError(true); return; }
    if (password.length < 8) { setStatus("Password must be at least 8 characters."); setIsError(true); return; }
    if (password !== confirmPassword) { setStatus("Passwords don't match."); setIsError(true); return; }

    setLoading(true);
    setStatus("");
    setIsError(false);

    const cleanName = firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: cleanName,
        },
      },
    });

    if (error) {
      setStatus(error.message);
      setIsError(true);
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      router.replace("/login");
      return;
    }

    // Send new users through the story onboarding flow
    router.replace("/onboarding");
  }

  return (
    <div className="min-h-screen px-5 py-7 md:py-10">
      <div className="mx-auto w-full max-w-md">
        {/* Match the public Search page branding */}
        <div className="mb-5 flex items-center justify-between">
          <Link href="/search" className="flex items-center gap-3">
            <img src="/natrix-favicon.svg" alt="Natrix" className="h-10 w-10 object-contain" />
            <div>
              <div className="text-xl font-bold tracking-tight text-white">Natrix</div>
              <div className="text-[10px] text-white/40">Swim Smarter Together</div>
            </div>
          </Link>

          <Link
            href="/login"
            className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white/80"
          >
            Log in
          </Link>
        </div>

        {/* Continuation from Search */}
        <div className="mb-5 grid grid-cols-[92px_1fr] items-center gap-4">
          <img
            src="/natrix-mascot-search.png"
            alt="Natrix mascot"
            className="h-[92px] w-[92px] object-contain"
          />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/80">
              You found your swimmer
            </p>
            <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight text-white">
              Keep tracking them
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              Create your account to save results, follow PBs and get new-result updates.
            </p>
          </div>
        </div>

        {/* Existing search handoff context */}
        <div className="mb-4">
          <SwimmerContextBanner />
        </div>

        {/* Main signup card */}
        <div
          className="rounded-[28px] p-5 md:p-6"
          style={{
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(255,255,255,0.90)",
            boxShadow: "0 18px 42px rgba(0,25,55,0.20)",
          }}
        >
          <div className="mb-5">
            <h2 className="text-2xl font-bold" style={{ color: "#0B2A54" }}>
              Create your account
            </h2>
            <p className="mt-1 text-xs" style={{ color: "#71859A" }}>
              Free to join. Takes less than a minute.
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-3">
            <input
              type="text"
              placeholder="Your first name"
              autoComplete="given-name"
              autoCapitalize="words"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none"
              style={{ background: "#F7FAFD", borderColor: "#DCE8F0", color: "#0B2A54" }}
            />

            <input
              type="email"
              placeholder="Email address"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3.5 text-sm outline-none"
              style={{ background: "#F7FAFD", borderColor: "#DCE8F0", color: "#0B2A54" }}
            />

            <PasswordInput
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />

            <PasswordInput
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />

            {status && (
              <p
                className="rounded-2xl px-3 py-2 text-sm"
                style={
                  isError
                    ? { background: "#FFF0F0", border: "1px solid #F4CACA", color: "#B33A3A" }
                    : { background: "#ECFBF2", border: "1px solid #C9EED8", color: "#167A4F" }
                }
              >
                {status}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl py-3.5 text-base font-bold text-white transition disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg,#2B9CF3,#0871D8)",
                boxShadow: "0 10px 22px rgba(0,106,220,0.22)",
              }}
            >
              {loading ? "Creating account..." : "Track my swimmer →"}
            </button>
          </form>

          <div className="pt-4 text-center">
            <p className="text-xs" style={{ color: "#768A9E" }}>
              Already have an account?{" "}
              <Link href="/login" className="font-bold" style={{ color: "#0876DC" }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-[10px] text-white/30">
          Natrix · Singapore · Built for swim families
        </p>
      </div>
    </div>
  );
}
