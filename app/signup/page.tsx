"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const BETA_INVITE_CODE = "NATRIX2026";

function EyeIcon({ show }: { show: boolean }) {
  return show ? (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1 9C1 9 4 3 9 3s8 6 8 6-3 6-8 6-8-6-8-6Z" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="9" r="2.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1 1l16 16M7.5 7.6A2.5 2.5 0 0 0 11.4 11M5.2 5.3C3.3 6.5 2 8 2 9c0 0 3 5.5 7 5.5a7 7 0 0 0 3.5-1M9 3.5C13 3.5 16 9 16 9a13 13 0 0 1-1.5 2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
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
        className="input pr-12"
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) { setStatus("Please enter your email."); setIsError(true); return; }
    if (!password) { setStatus("Please enter a password."); setIsError(true); return; }
    if (password.length < 8) { setStatus("Password must be at least 8 characters."); setIsError(true); return; }
    if (password !== confirmPassword) { setStatus("Passwords don't match."); setIsError(true); return; }

    if (inviteCode.trim().toUpperCase() !== BETA_INVITE_CODE) {
      setStatus("Invalid invite code. Please check your invite and try again.");
      setIsError(true);
      return;
    }

    setLoading(true);
    setStatus("");
    setIsError(false);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
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

    router.replace("/swimmers");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">

      {/* Logo */}
      <div className="mb-10 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
          style={{ background: "rgba(217,119,6,0.25)", border: "1px solid rgba(253,230,138,0.3)" }}
        >
          🏊
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white">Natrix</h1>
        <p className="mt-1 text-sm text-white/40">Swim meet results for parents</p>
      </div>

      {/* Glass card */}
      <div
        className="w-full max-w-sm rounded-3xl p-6 space-y-5"
        style={{
          background: "rgba(255,255,255,0.13)",
          backdropFilter: "blur(24px) saturate(1.3)",
          WebkitBackdropFilter: "blur(24px) saturate(1.3)",
          border: "1px solid rgba(255,255,255,0.24)",
        }}
      >
        <div>
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-3"
            style={{ background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.25)", color: "#FDE68A" }}
          >
            🎉 Beta access
          </div>
          <h2 className="text-2xl font-bold text-white">Create account</h2>
          <p className="mt-1 text-sm text-white/45">You&apos;ll need your invite code to join.</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-3">
          <input
            type="email"
            placeholder="Email address"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
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

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />

          <div>
            <input
              type="text"
              placeholder="Invite code"
              autoComplete="off"
              autoCapitalize="characters"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="input"
              style={{ letterSpacing: "0.1em", fontWeight: 600 }}
            />
            <p className="mt-1.5 text-xs text-white/30 px-1">
              Ask J.O.D for your invite code if you don&apos;t have one.
            </p>
          </div>

          {status && (
            <p
              className="rounded-2xl px-3 py-2 text-sm"
              style={
                isError
                  ? { background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.2)", color: "#F09595" }
                  : { background: "rgba(110,231,183,0.1)", border: "1px solid rgba(110,231,183,0.2)", color: "#6EE7B7" }
              }
            >
              {status}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-3.5 text-base font-bold text-white transition disabled:opacity-50"
            style={{ background: "#D97706" }}
          >
            {loading ? "Creating account..." : "Join Natrix 🏊"}
          </button>
        </form>

        <div className="text-center pt-1">
          <p className="text-sm text-white/40">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold transition" style={{ color: "#FDE68A" }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-white/20">
        Made with 🏊 by J.O.D — Just an Ordinary Dad
      </p>
    </div>
  );
}