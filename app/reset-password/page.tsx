"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState("Checking recovery session...");

  useEffect(() => {
    async function checkRecoverySession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("getSession error:", error);
        setStatus("Could not verify reset session.");
        setChecking(false);
        return;
      }

      if (!data.session) {
        setStatus("Reset link is invalid or expired.");
        setChecking(false);
        return;
      }

      setStatus("Enter your new password.");
      setChecking(false);
    }

    checkRecoverySession();
  }, []);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();

    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    if (!trimmedPassword || !trimmedConfirmPassword) {
      setStatus("Please enter and confirm your new password.");
      return;
    }

    if (trimmedPassword.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    setLoading(true);
    setStatus("Updating password...");

    const { error } = await supabase.auth.updateUser({
      password: trimmedPassword,
    });

    if (error) {
      console.error("updateUser error:", error);
      setStatus(`Reset error: ${error.message}`);
      setLoading(false);
      return;
    }

    setStatus("Password updated successfully. Redirecting to swimmers...");
    setLoading(false);
    window.location.href = "/swimmers";
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Reset Password</h1>
        <p className="mt-3 text-white/70">{status}</p>

        {!checking && (
          <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              className="h-14 w-full rounded-2xl border border-white/20 bg-black px-4 text-lg text-white placeholder:text-white/35 outline-none"
            />

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="h-14 w-full rounded-2xl border border-white/20 bg-black px-4 text-lg text-white placeholder:text-white/35 outline-none"
            />

            <button
              type="submit"
              disabled={loading}
              className="h-14 w-full rounded-2xl border border-white/20 bg-white/10 text-lg font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Updating..." : "Set New Password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}