"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [status, setStatus] = useState("Enter your email and password.");

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        console.error("getSession error:", error);
        setCheckingSession(false);
        return;
      }

      if (data.session) {
        window.location.href = "/swimmers";
        return;
      }

      setCheckingSession(false);
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  console.log("LIVE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("LIVE KEY:", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setStatus("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setStatus("Signing in...");

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    });

    if (error) {
      console.error("signInWithPassword error:", error);
      setStatus(`Login error: ${error.message}`);
      setLoading(false);
      return;
    }

    setStatus("Login successful. Redirecting...");
    setLoading(false);
    window.location.href = "/swimmers";
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-bold">Login</h1>
          <p className="mt-4 text-white/70">Checking session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Login</h1>
        <p className="mt-3 text-white/70">
          Sign in with your email and password.
        </p>

        <form onSubmit={handlePasswordLogin} className="mt-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="h-14 w-full rounded-2xl border border-white/20 bg-black px-4 text-lg text-white placeholder:text-white/35 outline-none"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="h-14 w-full rounded-2xl border border-white/20 bg-black px-4 text-lg text-white placeholder:text-white/35 outline-none"
          />

          <button
            type="submit"
            disabled={loading}
            className="h-14 w-full rounded-2xl border border-white/20 bg-white/10 text-lg font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="mt-4 text-sm text-white/60">{status}</p>
      </div>
    </main>
  );
}