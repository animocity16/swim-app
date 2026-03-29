"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Enter your email to reset your password.");

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!email.trim()) {
      setStatus("Please enter your email.");
      return;
    }

    setLoading(true);
    setStatus("Sending reset email...");

    const redirectTo =
      window.location.hostname === "localhost"
        ? "http://localhost:3000/reset-password"
        : "https://swim-app-beta.vercel.app/reset-password";

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
      setLoading(false);
      return;
    }

    setStatus("Reset email sent! Check your inbox.");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <h1 className="text-5xl font-bold mb-4">Forgot Password</h1>
        <p className="text-white/70 mb-8">
          Enter your email and we’ll send you a reset link.
        </p>

        <form onSubmit={handleResetPassword} className="space-y-5">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-white/15 bg-black px-5 py-4 text-xl outline-none"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white/20 py-4 text-2xl font-medium hover:bg-white/30 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send Reset Email"}
          </button>

          <p className="text-white/70">{status}</p>
        </form>

        <div className="mt-6">
          <Link href="/login" className="text-white/70 underline hover:text-white">
            Back to Login
          </Link>
        </div>
      </div>
    </main>
  );
}