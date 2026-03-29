"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState("Checking reset link...");

  useEffect(() => {
    async function handleRecovery() {
      try {
        const hash = window.location.hash;

        if (hash) {
          const params = new URLSearchParams(hash.substring(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          const type = params.get("type");

          if (type === "recovery" && access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            if (error) {
              setStatus(`Recovery link error: ${error.message}`);
              setChecking(false);
              return;
            }

            setStatus("Recovery verified. Enter your new password.");
            setChecking(false);
            return;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setStatus("Session found. Enter your new password.");
        } else {
          setStatus("Invalid or expired reset link.");
        }
      } catch {
        setStatus("Something went wrong while checking the reset link.");
      } finally {
        setChecking(false);
      }
    }

    handleRecovery();
  }, []);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();

    if (!password || !confirmPassword) {
      setStatus("Please fill in both password fields.");
      return;
    }

    if (password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    setLoading(true);
    setStatus("Updating password...");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setStatus(`Update failed: ${error.message}`);
      setLoading(false);
      return;
    }

    setStatus("Password updated successfully. Redirecting to login...");

    setTimeout(() => {
      router.push("/login");
    }, 1500);

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <h1 className="text-5xl font-bold mb-4">Reset Password</h1>
        <p className="text-white/70 mb-8">Set a new password for your account.</p>

        {checking ? (
          <p className="text-white/70">{status}</p>
        ) : (
          <form onSubmit={handleUpdatePassword} className="space-y-5">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-black px-5 py-4 text-xl outline-none"
            />

            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-black px-5 py-4 text-xl outline-none"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-white/20 py-4 text-2xl font-medium hover:bg-white/30 disabled:opacity-60"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>

            <p className="text-white/70">{status}</p>
          </form>
        )}
      </div>
    </main>
  );
}