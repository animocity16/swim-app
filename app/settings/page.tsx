"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { replayTutorial } from "@/app/components/TutorialOverlay";

const APP_VERSION = "1.0.0";

type NotifPrefs = {
  pbAlerts: boolean;
  meetReminders: boolean;
  weeklyRecap: boolean;
};

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

  const [notifs, setNotifs] = useState<NotifPrefs>({
    pbAlerts: true,
    meetReminders: true,
    weeklyRecap: false,
  });

  // Feedback state
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
  const [status, setStatus] = useState("");

  useEffect(() => { void loadUser(); }, []);

  async function loadUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }
    setEmail(session.user.email ?? "");
    const meta = session.user.user_metadata;
    setDisplayName(meta?.full_name ?? meta?.name ?? "");
    setLoading(false);
  }

  async function handleChangePassword() {
    if (!newPassword) { setPasswordMsg("Please enter a new password."); return; }
    if (newPassword.length < 8) { setPasswordMsg("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordMsg("Passwords don't match."); return; }
    setSavingPassword(true);
    setPasswordMsg("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg(`Error: ${error.message}`);
    } else {
      setPasswordMsg("✓ Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => { setShowPasswordForm(false); setPasswordMsg(""); }, 2000);
    }
    setSavingPassword(false);
  }

  async function handleSendFeedback() {
    if (feedbackRating === 0) { setFeedbackError("Please select a star rating."); return; }
    if (!feedbackMessage.trim()) { setFeedbackError("Please write something — even a sentence helps!"); return; }

    setSavingFeedback(true);
    setFeedbackError("");

    const { data: { session } } = await supabase.auth.getSession();

    const { error } = await supabase.from("feedback").insert([{
      user_id: session?.user?.id ?? null,
      rating: feedbackRating,
      message: feedbackMessage.trim(),
      feature_request: feedbackFeature || null,
    }]);

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
    if (deleteInput !== "DELETE") { setStatus("Please type DELETE to confirm."); return; }
    setDeletingAccount(true);
    setStatus("Deleting account...");
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function toggleNotif(key: keyof NotifPrefs) {
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }));
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
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
            Natrix
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Settings</h1>
        </div>

        {/* Account */}
        <div className="card space-y-4">
          <p className="label">Account</p>
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
              style={{ background: "rgba(217,119,6,0.25)", color: "#FDE68A", border: "1px solid rgba(253,230,138,0.2)" }}
            >
              {(displayName || email).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              {displayName && <p className="text-base font-semibold text-white truncate">{displayName}</p>}
              <p className="text-sm text-white/50 truncate">{email}</p>
            </div>
          </div>

          {/* Change password */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)" }}>
            <button
              type="button"
              onClick={() => { setShowPasswordForm((v) => !v); setPasswordMsg(""); }}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <LockIcon />
                <span className="text-sm font-medium text-white">Change password</span>
              </div>
              <ChevronIcon open={showPasswordForm} />
            </button>
            {showPasswordForm && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="input" />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="input" />
                {passwordMsg && (
                  <p className="text-sm" style={{ color: passwordMsg.startsWith("✓") ? "#6EE7B7" : "#FCA5A5" }}>{passwordMsg}</p>
                )}
                <button type="button" onClick={handleChangePassword} disabled={savingPassword}
                  className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ background: "#D97706" }}>
                  {savingPassword ? "Saving..." : "Update password"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className="card space-y-1">
          <p className="label mb-3">Notifications</p>
          <NotifRow icon={<BellIcon />} label="PB alerts" sub="Get notified when a new personal best is saved" value={notifs.pbAlerts} onToggle={() => toggleNotif("pbAlerts")} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
          <NotifRow icon={<CalendarIcon />} label="Meet reminders" sub="Reminders before upcoming meets" value={notifs.meetReminders} onToggle={() => toggleNotif("meetReminders")} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
          <NotifRow icon={<ChartIcon />} label="Weekly recap" sub="Summary of the week's results every Sunday" value={notifs.weeklyRecap} onToggle={() => toggleNotif("weeklyRecap")} />
        </div>

        {/* Tutorial recap */}
        <div className="card">
          <p className="label mb-3">Help</p>
          <button
            type="button"
            onClick={replayTutorial}
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-left transition"
            style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(253,230,138,0.2)" }}
          >
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 18 }}>🎓</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#FDE68A" }}>Replay tutorial</p>
                <p className="text-xs text-white/40 mt-0.5">Walk through the app step by step again</p>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="rgba(253,230,138,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="mt-4 space-y-2">
            <p className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Quick reference</p>
            {[
              { emoji: "👥", title: "Add a swimmer", desc: "Tap Brood → + button → fill in profile" },
              { emoji: "📷", title: "Scan a result", desc: "Tap Scan → upload Meet Mobile screenshot" },
              { emoji: "📈", title: "View progress", desc: "Swimmer profile → Progress tab" },
              { emoji: "⭐", title: "Check standards", desc: "Tap Standards in bottom nav" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-2xl px-3 py-2.5"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{item.emoji}</span>
                <div>
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="text-xs text-white/40">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ✅ Feedback */}
        <div className="card space-y-4">
          <div>
            <p className="label">Feedback</p>
            <p className="text-xs text-white/40 mt-1">Help shape Natrix — every message goes straight to J.O.D.</p>
          </div>

          {feedbackSent ? (
            <div className="rounded-2xl py-6 text-center space-y-2"
              style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(253,230,138,0.2)" }}>
              <p className="text-2xl">🙏</p>
              <p className="text-sm font-semibold" style={{ color: "#FDE68A" }}>Thank you!</p>
              <p className="text-xs text-white/40">Your feedback means the world. We&apos;ll use it to make Natrix better.</p>
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
              {/* Star rating */}
              <div>
                <p className="text-xs text-white/50 mb-2">How are you finding Natrix?</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className="text-2xl transition-transform active:scale-90"
                      style={{ opacity: feedbackRating >= star ? 1 : 0.25, filter: feedbackRating >= star ? "none" : "grayscale(1)" }}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
                {feedbackRating > 0 && (
                  <p className="text-xs mt-1.5" style={{ color: "#FDE68A" }}>
                    {feedbackRating === 5 ? "Love it! 🏊" : feedbackRating === 4 ? "Really good!" : feedbackRating === 3 ? "It's okay" : feedbackRating === 2 ? "Needs work" : "Not great"}
                  </p>
                )}
              </div>

              {/* Message */}
              <div>
                <p className="text-xs text-white/50 mb-2">What would make Natrix better?</p>
                <textarea
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder="Tell us anything — bugs, ideas, what you love, what's missing..."
                  rows={3}
                  className="w-full rounded-[20px] px-4 py-3 text-sm text-white outline-none resize-none placeholder:text-white/35"
                  style={{
                    background: "rgba(0,20,50,0.35)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                />
              </div>

              {/* Feature request */}
              <div>
                <p className="text-xs text-white/50 mb-2">Most wanted feature (optional)</p>
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

        {/* App info */}
        <div className="card">
          <p className="label mb-3">About</p>
          <div className="flex items-center justify-between py-1">
            <p className="text-sm text-white/60">Version</p>
            <p className="text-sm font-semibold text-white">{APP_VERSION}</p>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />
          <div className="flex items-center justify-between py-1">
            <p className="text-sm text-white/60">Built for</p>
            <p className="text-sm font-semibold text-white">Southeast Asia · expanding globally</p>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />
          <div className="flex items-center justify-between py-1">
            <p className="text-sm text-white/60">Made with</p>
            <p className="text-sm font-semibold" style={{ color: "#FDE68A" }}>🏊 for swim parents</p>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />
          <div className="flex items-center justify-between py-1">
            <p className="text-sm text-white/60">Developed by</p>
            <p className="text-sm font-semibold text-white">J.O.D <span className="text-white/40 text-xs">Just an Ordinary Dad</span></p>
          </div>
        </div>

        {/* Sign out */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-50"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)" }}
        >
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>

        {/* Delete account */}
        <div className="rounded-3xl overflow-hidden" style={{ border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)" }}>
          <button
            type="button"
            onClick={() => { setShowDeleteConfirm((v) => !v); setDeleteInput(""); setStatus(""); }}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: "#FCA5A5" }}>Delete account</p>
              <p className="text-xs text-white/35 mt-0.5">Permanently removes all your data</p>
            </div>
            <ChevronIcon open={showDeleteConfirm} danger />
          </button>
          {showDeleteConfirm && (
            <div className="px-5 pb-5 space-y-3 border-t border-red-500/15 pt-4">
              <p className="text-sm text-white/60 leading-relaxed">
                This will permanently delete your account and all swimmer data. This cannot be undone. Type <span className="font-bold text-white">DELETE</span> to confirm.
              </p>
              <input value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder="Type DELETE to confirm" className="input" style={{ borderColor: "rgba(239,68,68,0.3)" }} />
              {status && <p className="text-sm" style={{ color: "#FCA5A5" }}>{status}</p>}
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount || deleteInput !== "DELETE"}
                className="w-full rounded-2xl py-3 text-sm font-semibold transition disabled:opacity-40"
                style={{ background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.4)", color: "#FCA5A5" }}
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

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="8" rx="2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2a5 5 0 0 1 5 5v3l1 1H2l1-1V7a5 5 0 0 1 5-5Z" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
      <path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="4" width="12" height="10" rx="2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
      <path d="M5 2v3M11 2v3M2 7h12" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 12 6 7l3 3 5-6" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ open, danger }: { open: boolean; danger?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
      <path d="M4 6l4 4 4-4" stroke={danger ? "rgba(252,165,165,0.6)" : "rgba(255,255,255,0.3)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NotifRow({ icon, label, sub, value, onToggle }: { icon: React.ReactNode; label: string; sub: string; value: boolean; onToggle: () => void; }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-xs text-white/40 mt-0.5">{sub}</p>
        </div>
      </div>
      <button type="button" onClick={onToggle} className="flex-shrink-0 rounded-full transition-all duration-200"
        style={{ width: 44, height: 26, padding: 3, background: value ? "#D97706" : "rgba(255,255,255,0.12)", border: "none", display: "flex", alignItems: "center", justifyContent: value ? "flex-end" : "flex-start" }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", display: "block", transition: "all 0.2s ease" }} />
      </button>
    </div>
  );
}