"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function checkSession() {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) { setCheckingSession(false); return; }
      const isResetting = window.location.pathname === "/reset-password";
      if (session && !isResetting) { router.replace("/dashboard"); return; }
      setCheckingSession(false);
    }
    checkSession();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setStatus("Please enter your email and password."); return; }

    setLoading(true);
    setStatus("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">

      {/* Logo + branding */}
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
          <h2 className="text-2xl font-bold text-white">Welcome back</h2>
          <p className="mt-1 text-sm text-white/45">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email address"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />

          {/* Password with show/hide toggle */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
            >
              {showPassword ? (
                // Eye-off icon
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                // Eye icon
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          <div className="text-right">
            <Link href="/forgot-password" className="text-xs text-white/40 hover:text-white/70 transition">
              Forgot password?
            </Link>
          </div>

          {status && (
            <p className="rounded-2xl border px-3 py-2 text-sm"
              style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.2)", color: "#F09595" }}>
              {status}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-3.5 text-base font-bold text-white transition disabled:opacity-50"
            style={{ background: "#D97706" }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.12)" }} />
          <span className="text-[11px] text-white/30 uppercase tracking-widest">or</span>
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Try Demo — no login required, drops straight into a sample account */}
        <Link
          href="/demo/dashboard"
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#FDE68A" }}
        >
          👀 Try the demo — no signup needed
        </Link>

        <div className="text-center pt-2">
          <p className="text-sm text-white/40">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold transition" style={{ color: "#FDE68A" }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
