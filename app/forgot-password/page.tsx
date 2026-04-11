"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState("");

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) { setStatus("Please enter your email."); return; }

    setLoading(true);
    setStatus("");

    const redirectTo =
      window.location.hostname === "localhost"
        ? "http://localhost:3000/reset-password"
        : `${window.location.origin}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
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
        {sent ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">📬</div>
            <h2 className="text-xl font-bold text-white">Check your inbox</h2>
            <p className="text-sm text-white/50">
              We&apos;ve sent a reset link to <span className="text-white font-medium">{email}</span>
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-semibold transition"
              style={{ color: "#FDE68A" }}
            >
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-2xl font-bold text-white">Reset password</h2>
              <p className="mt-1 text-sm text-white/45">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleReset} className="space-y-4">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />

              {status && (
                <p className="rounded-2xl px-3 py-2 text-sm"
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
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>

            <div className="text-center pt-1">
              <Link href="/login" className="text-sm text-white/40 hover:text-white/70 transition">
                ← Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}