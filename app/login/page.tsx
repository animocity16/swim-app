"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const COOLDOWN_SECONDS = 60;
const COOLDOWN_KEY = "magic_link_cooldown_until";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(
    "Enter your email to receive a magic login link."
  );
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.replace("/swimmers");
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/swimmers");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    function updateCooldownFromStorage() {
      const savedUntil = localStorage.getItem(COOLDOWN_KEY);
      if (!savedUntil) {
        setCooldown(0);
        return;
      }

      const until = Number(savedUntil);
      const now = Date.now();
      const secondsLeft = Math.max(0, Math.ceil((until - now) / 1000));

      if (secondsLeft <= 0) {
        localStorage.removeItem(COOLDOWN_KEY);
        setCooldown(0);
        return;
      }

      setCooldown(secondsLeft);
    }

    updateCooldownFromStorage();

    const timer = setInterval(() => {
      updateCooldownFromStorage();
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  function startCooldown(seconds: number) {
    const until = Date.now() + seconds * 1000;
    localStorage.setItem(COOLDOWN_KEY, String(until));
    setCooldown(seconds);
  }

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setStatus("Please enter your email 🙂");
      return;
    }

    if (cooldown > 0) {
      setStatus(`Please wait ${cooldown}s before requesting another link.`);
      return;
    }

    setLoading(true);
    setStatus("Sending magic link…");

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: "http://localhost:3000/swimmers",
      },
    });

    if (error) {
      const message = error.message.toLowerCase();

      if (message.includes("rate limit")) {
        setStatus(
          "Too many email requests. Please wait a while before trying again."
        );
        startCooldown(COOLDOWN_SECONDS);
      } else if (message.includes("invalid")) {
        setStatus("Please enter a valid email address.");
      } else {
        setStatus(`Error: ${error.message}`);
      }

      setLoading(false);
      return;
    }

    setStatus("Magic link sent ✅ Check your email.");
    startCooldown(COOLDOWN_SECONDS);
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4 py-8">
        <section className="w-full rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-5xl font-bold tracking-tight text-sky-700">
            Login
          </h1>

          <p className="mt-4 text-lg text-gray-600">
            Enter your email to receive a magic login link.
          </p>

          <form onSubmit={handleSendMagicLink} className="mt-8 space-y-6">
            <div>
              <label
                htmlFor="email"
                className="mb-3 block text-xl font-medium text-gray-700"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full rounded-2xl border border-gray-300 px-6 py-5 text-2xl outline-none transition focus:border-sky-500 disabled:bg-gray-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading || cooldown > 0}
              className="w-full rounded-2xl bg-sky-600 px-6 py-5 text-2xl font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
            >
              {loading
                ? "Sending..."
                : cooldown > 0
                ? `Wait ${cooldown}s`
                : "Send Magic Link"}
            </button>
          </form>

          <div className="mt-6 text-lg text-gray-700">{status}</div>
        </section>
      </div>
    </main>
  );
}