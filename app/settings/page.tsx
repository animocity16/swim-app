"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { replayTutorial } from "@/app/components/TutorialOverlay";
import SplashMediaUpload from "@/app/components/SplashMediaUpload";
import { applyTheme } from "@/app/components/ThemeProvider";
import Link from "next/link";

const APP_VERSION = "1.0.0";

const FEATURE_REQUESTS = [
  "AI nutrition guide",
  "Meet calendar",
  "Apple Watch support",
  "Team / club dashboard",
  "Relay tracking",
  "Compare with teammates",
  "Export to PDF / spreadsheet",
  "Push notifications",
  "Other",
];

// ─── Theme options — must match ThemeProvider.tsx ─────────────────────────────

const THEMES = [
  { id: "ocean",    label: "Ocean",    from: "#062840", to: "#0F4C75", accent: "#38BDF8" },
  { id: "midnight", label: "Midnight", from: "#0D0D1A", to: "#1A1A3E", accent: "#A78BFA" },
  { id: "forest",   label: "Forest",   from: "#051A10", to: "#0A3020", accent: "#34D399" },
  { id: "sunset",   label: "Sunset",   from: "#C2390A", to: "#F59E0B", accent: "#FED7AA" },
  { id: "cosmos",   label: "Cosmos",   from: "#0D0820", to: "#1E1040", accent: "#F472B6" },
  { id: "slate",    label: "Slate",    from: "#0D1117", to: "#1C2333", accent: "#94A3B8" },
];

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Theme
  const [activeTheme, setActiveTheme] = useState("ocean");
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeSaved, setThemeSaved] = useState(false);

  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackFeature, setFeedbackFeature] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");

  useEffect(() => {
    void loadUser();
  }, []);

  async function loadUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setEmail(session.user.email ?? "");
    const meta = session.user.user_metadata;
    setDisplayName(meta?.full_name ?? meta?.name ?? "");
    setActiveTheme(meta?.app_theme ?? "ocean");
    setLoading(false);
  }

  async function handleSelectTheme(themeId: string) {
    setActiveTheme(themeId);
    // Apply instantly — user sees the change live
    applyTheme(themeId);

    setSavingTheme(true);
    setThemeSaved(false);
    await supabase.auth.updateUser({ data: { app_theme: themeId } });
    setSavingTheme(false);
    setThemeSaved(true);
    setTimeout(() => setThemeSaved(false), 2000);
  }

  async function handleChangePassword() {
    if (!newPassword) {
      setPasswordMsg("Please enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Passwords don't match.");
      return;
    }
    setSavingPassword(true);
    setPasswordMsg("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg(`Error: ${error.message}`);
    } else {
      setPasswordMsg("✓ Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setShowPasswordForm(false);
        setPasswordMsg("");
      }, 2000);
    }
    setSavingPassword(false);
  }

  async function handleSendFeedback() {
    if (feedbackRating === 0) {
      setFeedbackError("Please select a star rating.");
      return;
    }
    if (!feedbackMessage.trim()) {
      setFeedbackError("Please write something — even a sentence helps!");
      return;
    }
    setSavingFeedback(true);
    setFeedbackError("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { error } = await supabase.from("feedback").insert([
      {
        user_id: session?.user?.id ?? null,
        rating: feedbackRating,
        message: feedbackMessage.trim(),
        feature_request: feedbackFeature || null,
      },
    ]);
    if (error) {
      setFeedbackError(`Couldn't send feedback: ${error.message}`);
    } else {
      setFeedbackSent(true);
      setFeedbackRating(0);
      setFeedbackMessage("");
      setFeedbackFeature("");
    }
    setSavingFeedback(false);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleDeleteAccount() {
    if (deleteInput !== "DELETE") {
      setDeleteStatus("Please type DELETE to confirm.");
      return;
    }
    setDeletingAccount(true);
    setDeleteStatus("Deleting account...");
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="shell">
        <div className="container-app">
          <p className="muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5">

        {/* Header */}
        <div className="pt-2">
          <p
            className="text-[10px] font-medium uppercase tracking-widest"
            style={{ color: "#BA7517" }}
          >
            Natrix
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            Settings
          </h1>
        </div>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <p className="label">Account</p>

          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
              style={{
                background: "rgba(217,119,6,0.25)",
                color: "#FDE68A",
                border: "1px solid rgba(253,230,138,0.2)",
              }}
            >
              {(displayName || email).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              {displayName && (
                <p className="truncate text-base font-semibold text-white">
                  {displayName}
                </p>
              )}
              <p className="truncate text-sm text-white/50">{email}</p>
            </div>
          </div>

          {/* Change password accordion */}
          <div
            className="overflow-hidden rounded-2xl"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setShowPasswordForm((v) => !v);
                setPasswordMsg("");
              }}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <LockIcon />
                <span className="text-sm font-medium text-white">
                  Change password
                </span>
              </div>
              <ChevronIcon open={showPasswordForm} />
            </button>
            {showPasswordForm && (
              <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="input"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="input"
                />
                {passwordMsg && (
                  <p
                    className="text-sm"
                    style={{
                      color: passwordMsg.startsWith("✓")
                        ? "#6EE7B7"
                        : "#FCA5A5",
                    }}
                  >
                    {passwordMsg}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={savingPassword}
                  className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ background: "#D97706" }}
                >
                  {savingPassword ? "Saving..." : "Update password"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── App Theme ───────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <div>
            <p className="label">App Theme</p>
            <p className="mt-1 text-xs text-white/40">
              Changes the background colour throughout the app.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {THEMES.map((theme) => {
              const isActive = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => void handleSelectTheme(theme.id)}
                  disabled={savingTheme}
                  className="relative overflow-hidden rounded-2xl transition disabled:opacity-60"
                  style={{
                    aspectRatio: "1",
                    background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
                    border: isActive
                      ? `2px solid ${theme.accent}`
                      : "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full"
                        style={{ background: theme.accent }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M2 7l3.5 3.5L12 4"
                            stroke="#000"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 p-2">
                    <p className="text-center text-[10px] font-semibold text-white/80">
                      {theme.label}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Save feedback */}
          {themeSaved && (
            <p className="text-center text-xs" style={{ color: "#6EE7B7" }}>
              ✓ Theme saved
            </p>
          )}
          {savingTheme && (
            <p className="text-center text-xs text-white/30">Saving...</p>
          )}
        </div>

        {/* ── Splash screen ───────────────────────────────────────────────── */}
        <SplashMediaUpload />

        {/* ── Help ────────────────────────────────────────────────────────── */}
        <div className="card">
          <p className="label mb-3">Help</p>

          <button
            type="button"
            onClick={replayTutorial}
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition"
            style={{
              background: "rgba(217,119,6,0.1)",
              border: "1px solid rgba(253,230,138,0.2)",
            }}
          >
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 18 }}>🎓</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#FDE68A" }}>
                  Replay tutorial
                </p>
                <p className="mt-0.5 text-xs text-white/40">
                  Walk through the app step by step again
                </p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 3l5 5-5 5"
                stroke="rgba(253,230,138,0.5)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Import Data */}
          <button
            type="button"
            onClick={() => router.push("/import")}
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition mt-3"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 18 }}>📥</span>
              <div>
                <p className="text-sm font-semibold text-white">Import swimmer data</p>
                <p className="mt-0.5 text-xs text-white/40">
                  Download template · upload your existing times
                </p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="mt-4 space-y-2">
            <p className="mb-2 text-[9px] uppercase tracking-wider text-white/30">
              Quick reference
            </p>
            {[
              { emoji: "👥", title: "Add a swimmer", desc: "Tap Brood → + button → fill in profile" },
              { emoji: "📷", title: "Scan a result", desc: "Tap Scan → upload Meet Mobile screenshot" },
              { emoji: "📈", title: "View progress", desc: "Swimmer profile → Progress tab" },
              { emoji: "⭐", title: "Check standards", desc: "Swimmer profile → Standards tab" },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-2xl px-3 py-2.5"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                  {item.emoji}
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="text-xs text-white/40">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Feedback ────────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <div>
            <p className="label">Feedback</p>
            <p className="mt-1 text-xs text-white/40">
              Help shape Natrix — every message goes straight to J.O.D.
            </p>
          </div>

          {feedbackSent ? (
            <div
              className="space-y-2 rounded-2xl py-6 text-center"
              style={{
                background: "rgba(217,119,6,0.1)",
                border: "1px solid rgba(253,230,138,0.2)",
              }}
            >
              <p className="text-2xl">🙏</p>
              <p className="text-sm font-semibold" style={{ color: "#FDE68A" }}>
                Thank you!
              </p>
              <p className="text-xs text-white/40">
                Your feedback means the world. We&apos;ll use it to make Natrix better.
              </p>
              <button
                type="button"
                onClick={() => setFeedbackSent(false)}
                className="mt-2 text-xs text-white/30 underline"
              >
                Send another
              </button>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs text-white/50">How are you finding Natrix?</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className="text-2xl transition-transform active:scale-90"
                      style={{
                        opacity: feedbackRating >= star ? 1 : 0.25,
                        filter: feedbackRating >= star ? "none" : "grayscale(1)",
                      }}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
                {feedbackRating > 0 && (
                  <p className="mt-1.5 text-xs" style={{ color: "#FDE68A" }}>
                    {feedbackRating === 5 ? "Love it! 🏊" : feedbackRating === 4 ? "Really good!" : feedbackRating === 3 ? "It's okay" : feedbackRating === 2 ? "Needs work" : "Not great"}
                  </p>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs text-white/50">What would make Natrix better?</p>
                <textarea
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder="Tell us anything — bugs, ideas, what you love, what's missing..."
                  rows={3}
                  className="w-full resize-none rounded-[20px] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                  style={{
                    background: "rgba(0,20,50,0.35)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                />
              </div>

              <div>
                <p className="mb-2 text-xs text-white/50">Most wanted feature (optional)</p>
                <select
                  value={feedbackFeature}
                  onChange={(e) => setFeedbackFeature(e.target.value)}
                  className="input"
                >
                  <option value="">Pick one...</option>
                  {FEATURE_REQUESTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              {feedbackError && (
                <p className="text-sm" style={{ color: "#FCA5A5" }}>{feedbackError}</p>
              )}

              <button
                type="button"
                onClick={handleSendFeedback}
                disabled={savingFeedback}
                className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ background: "#D97706" }}
              >
                {savingFeedback ? "Sending..." : "Send feedback 🚀"}
              </button>
            </>
          )}
        </div>

        {/* ── About ───────────────────────────────────────────────────────── */}
        <div className="card">
          <p className="label mb-3">About</p>
          {[
            { label: "Version", value: APP_VERSION, color: undefined },
            { label: "Built for", value: "Southeast Asia · expanding globally", color: undefined },
            { label: "Made with", value: "🏊 for swim parents", color: "#FDE68A" },
            { label: "Developed by", value: "J.O.D — Just an Ordinary Dad", color: undefined },
          ].map((row, i, arr) => (
            <div key={row.label}>
              <div className="flex items-center justify-between py-2">
                <p className="text-sm text-white/60">{row.label}</p>
                <p className="text-sm font-semibold text-white" style={row.color ? { color: row.color } : undefined}>
                  {row.value}
                </p>
              </div>
              {i < arr.length - 1 && (
                <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
              )}
            </div>
          ))}
        </div>

        <Link
          href="/privacy"
          className="block w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/50 transition hover:bg-white/10"
        >
          Privacy Policy
        </Link>

        {/* ── Sign out ────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-50"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>

        {/* ── Delete account ───────────────────────────────────────────────── */}
        <div
          className="overflow-hidden rounded-3xl"
          style={{
            border: "1px solid rgba(239,68,68,0.2)",
            background: "rgba(239,68,68,0.06)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setShowDeleteConfirm((v) => !v);
              setDeleteInput("");
              setDeleteStatus("");
            }}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: "#FCA5A5" }}>
                Delete account
              </p>
              <p className="mt-0.5 text-xs text-white/35">
                Permanently removes all your data
              </p>
            </div>
            <ChevronIcon open={showDeleteConfirm} danger />
          </button>
          {showDeleteConfirm && (
            <div className="space-y-3 border-t border-red-500/15 px-5 pb-5 pt-4">
              <p className="text-sm leading-relaxed text-white/60">
                This will permanently delete your account and all swimmer data. This cannot be undone. Type{" "}
                <span className="font-bold text-white">DELETE</span> to confirm.
              </p>
              <input
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="input"
                style={{ borderColor: "rgba(239,68,68,0.3)" }}
              />
              {deleteStatus && (
                <p className="text-sm" style={{ color: "#FCA5A5" }}>{deleteStatus}</p>
              )}
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount || deleteInput !== "DELETE"}
                className="w-full rounded-2xl py-3 text-sm font-semibold transition disabled:opacity-40"
                style={{
                  background: "rgba(239,68,68,0.25)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  color: "#FCA5A5",
                }}
              >
                {deletingAccount ? "Deleting..." : "Permanently delete account"}
              </button>
            </div>
          )}
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="8" rx="2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open, danger }: { open: boolean; danger?: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke={danger ? "rgba(252,165,165,0.6)" : "rgba(255,255,255,0.3)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}