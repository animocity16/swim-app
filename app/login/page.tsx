"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [status, setStatus] = useState("Checking session...");

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        setStatus(`Session check failed: ${error.message}`);
        setCheckingSession(false);
        return;
      }

      if (session) {
        router.replace("/swimmers");
        return;
      }

      setStatus("Enter your email and password.");
      setCheckingSession(false);
    }

    checkSession();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setStatus("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setStatus("Logging in...");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatus(`Login failed: ${error.message}`);
      setLoading(false);
      return;
    }

    setStatus("Login successful. Redirecting...");
    router.replace("/swimmers");
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
          <h1 className="text-5xl font-bold mb-4">Login</h1>
          <p className="text-white/70">{status}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <h1 className="text-5xl font-bold mb-4">Login</h1>
        <p className="text-white/70 mb-8">
          Sign in with your email and password.
        </p>

        <form onSubmit={handleLogin} className="space-y-5">
          <input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-white/15 bg-black px-5 py-4 text-xl outline-none"
          />

          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-white/15 bg-black px-5 py-4 text-xl outline-none"
          />

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm text-white/70 underline hover:text-white"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white/20 py-4 text-2xl font-medium hover:bg-white/30 disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <p className="text-white/70">{status}</p>
        </form>
      </div>
    </main>
  );
}