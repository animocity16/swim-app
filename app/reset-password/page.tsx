
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
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      window.history.replaceState({}, "", "/reset-password");
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setStatus("Reset link is invalid or expired.");
          setIsError(true);
        } else {
          setSessionReady(true);
        }
        setChecking(false);
      });
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
        setChecking(false);
      }
    });
    const timeout = setTimeout(() => {
      setStatus("Reset link is invalid or expired.");
      setIsError(true);
      setChecking(false);
    }, 3000);
    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !confirmPassword) { setStatus("Please fill in both fields."); setIsError(true); return; }
    if (password.length < 6) { setStatus("Password must be at least 6 characters."); setIsError(true); return; }
    if (password !== confirmPassword) { setStatus("Passwords do not match."); setIsError(true); return; }
    setLoading(true);
    setStatus("");
    setIsError(false);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setStatus(error.message); setIsError(true); setLoading(false); return; }
    setDone(true);
    setLoading(false);
    setTimeout(() => router.push("/dashboard"), 2000);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
          style={{ background: "rgba(217,119,6,0.25)", border: "1px solid rgba(253,230,138,0.3)" }}>🏊</div>
        <h1 className="text-4xl font-bold tracking-tight text-white">Natrix</h1>
        <p className="mt-1 text-sm text-white/40">Swim meet results for parents</p>
      </div>
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-5"
        style={{ background: "rgba(255,255,255,0.13)", backdropFilter: "blur(24px) saturate(1.3)",
          WebkitBackdropFilter: "blur(24px) saturate(1.3)", border: "1px solid rgba(255,255,255,0.24)" }}>
        {checking ? (
          <div className="text-center py-4"><p className="text-sm text-white/40">Verifying reset link...</p></div>
        ) : done ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-bold text-white">Password updated!</h2>
            <p className="text-sm text-white/50">Redirecting you to the app...</p>
          </div>
        ) : isError && !sessionReady ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-bold text-white">Invalid link</h2>
            <p className="text-sm text-white/50">{status}</p>
            <a href="/forgot-password" className="mt-2 inline-block text-sm font-semibold" style={{ color: "#FDE68A" }}>
              Request a new link</a>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-2xl font-bold text-white">Set new password</h2>
              <p className="mt-1 text-sm text-white/45">Choose a strong password for your account.</p>
            </div>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <input type="password" placeholder="New password" value={password}
                onChange={(e) => setPassword(e.target.value)} className="input" />
              <input type="password" placeholder="Confirm new password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} className="input" />
              {status && <p className="rounded-2xl px-3 py-2 text-sm"
                style={{ background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.2)", color: "#F09595" }}>{status}</p>}
              <button type="submit" disabled={loading}
                className="w-full rounded-2xl py-3.5 text-base font-bold text-white transition disabled:opacity-50"
                style={{ background: "#D97706" }}>{loading ? "Updating..." : "Update password"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
