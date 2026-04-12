"use client";

import { useState } from "react";
import Link from "next/link";

type Platform = "iphone" | "android";

const STEPS = {
  iphone: [
    {
      number: "1",
      title: "Open in Safari",
      detail: "This link must be opened in Safari — not Chrome or another browser. Copy the link and paste it into Safari if needed.",
      icon: "🧭",
    },
    {
      number: "2",
      title: "Tap the Share button",
      detail: "Tap the Share icon at the bottom of Safari — it looks like a box with an arrow pointing up.",
      icon: "⬆️",
    },
    {
      number: "3",
      title: "Add to Home Screen",
      detail: 'Scroll down in the share sheet and tap "Add to Home Screen". Give it a name (Natrix) and tap Add.',
      icon: "➕",
    },
    {
      number: "4",
      title: "Open from your home screen",
      detail: "Natrix will appear on your home screen like a real app — full screen, no browser bar. Tap it to open!",
      icon: "🏊",
    },
  ],
  android: [
    {
      number: "1",
      title: "Open in Chrome",
      detail: "Open this link in Chrome on your Android phone. Other browsers may also work but Chrome is recommended.",
      icon: "🌐",
    },
    {
      number: "2",
      title: "Tap the three dots menu",
      detail: "Tap the ⋮ menu in the top right corner of Chrome.",
      icon: "⋮",
    },
    {
      number: "3",
      title: "Add to Home screen",
      detail: 'Tap "Add to Home screen" from the menu. Confirm by tapping Add when prompted.',
      icon: "➕",
    },
    {
      number: "4",
      title: "Open from your home screen",
      detail: "Natrix will appear on your home screen. Tap it to launch the app in full screen mode!",
      icon: "🏊",
    },
  ],
};

const APP_URL = "https://swimnatrix.vercel.app";
const INVITE_CODE = "NATRIX2026";

export default function InvitePage() {
  const [platform, setPlatform] = useState<Platform>("iphone");
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(APP_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyCode() {
    navigator.clipboard.writeText(INVITE_CODE).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-5 py-10">

      {/* Header */}
      <div className="text-center mb-8">
        <div
          className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl text-4xl"
          style={{ background: "rgba(217,119,6,0.25)", border: "1px solid rgba(253,230,138,0.3)" }}
        >
          🏊
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">You&apos;re invited!</h1>
        <p className="mt-2 text-white/50 text-sm max-w-xs mx-auto">
          You&apos;ve been invited to beta test Natrix — the swim meet tracker built for parents like you.
        </p>
      </div>

      {/* Beta badge */}
      <div
        className="mb-6 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
        style={{ background: "rgba(217,119,6,0.2)", border: "1px solid rgba(253,230,138,0.3)", color: "#FDE68A" }}
      >
        🎉 Beta Access — Free
      </div>

      {/* What is Natrix */}
      <div
        className="w-full max-w-sm rounded-3xl p-5 mb-5 space-y-3"
        style={{
          background: "rgba(255,255,255,0.09)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.18)",
        }}
      >
        <p className="text-xs font-medium uppercase tracking-widest text-white/40">What is Natrix?</p>
        {[
          { icon: "📷", text: "Scan Meet Mobile screenshots — results save automatically" },
          { icon: "📈", text: "Track PBs and progress charts for every event" },
          { icon: "⭐", text: "See how close your swimmer is to qualifying standards" },
          { icon: "👥", text: "Follow multiple swimmers across different clubs" },
        ].map((item) => (
          <div key={item.text} className="flex items-start gap-3">
            <span className="text-lg flex-shrink-0">{item.icon}</span>
            <p className="text-sm text-white/70 leading-snug">{item.text}</p>
          </div>
        ))}
      </div>

      {/* ✅ Invite code */}
      <div
        className="w-full max-w-sm rounded-3xl p-5 mb-5"
        style={{
          background: "rgba(217,119,6,0.1)",
          border: "1px solid rgba(253,230,138,0.25)",
        }}
      >
        <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: "#FDE68A" }}>
          🔑 Your invite code
        </p>
        <p className="text-xs text-white/40 mb-4">You&apos;ll need this when creating your account.</p>
        <div
          className="rounded-2xl px-4 py-4 mb-3 flex items-center justify-between gap-3"
          style={{ background: "rgba(0,20,50,0.4)", border: "1px solid rgba(253,230,138,0.2)" }}
        >
          <p className="text-2xl font-bold tracking-widest" style={{ color: "#FDE68A" }}>{INVITE_CODE}</p>
          <button
            type="button"
            onClick={copyCode}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition flex-shrink-0"
            style={{
              background: codeCopied ? "rgba(110,231,183,0.2)" : "rgba(253,230,138,0.15)",
              border: codeCopied ? "1px solid rgba(110,231,183,0.4)" : "1px solid rgba(253,230,138,0.3)",
              color: codeCopied ? "#6EE7B7" : "#FDE68A",
            }}
          >
            {codeCopied ? "✓ Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-white/35 text-center">Keep this code safe — it&apos;s your beta pass 🎟️</p>
      </div>

      {/* Install instructions */}
      <div
        className="w-full max-w-sm rounded-3xl p-5 mb-5"
        style={{
          background: "rgba(255,255,255,0.09)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.18)",
        }}
      >
        <p className="text-xs font-medium uppercase tracking-widest text-white/40 mb-4">
          Install on your phone
        </p>

        {/* Platform toggle */}
        <div className="flex gap-2 mb-5">
          {(["iphone", "android"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className="flex-1 rounded-2xl py-2.5 text-sm font-semibold transition"
              style={
                platform === p
                  ? { background: "#D97706", color: "#fff" }
                  : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }
              }
            >
              {p === "iphone" ? "📱 iPhone" : "🤖 Android"}
            </button>
          ))}
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {STEPS[platform].map((step) => (
            <div key={step.number} className="flex items-start gap-3">
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: "rgba(217,119,6,0.25)", color: "#FDE68A", border: "1px solid rgba(253,230,138,0.2)" }}
              >
                {step.number}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* App link + copy */}
      <div
        className="w-full max-w-sm rounded-3xl p-5 mb-5"
        style={{
          background: "rgba(255,255,255,0.09)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.18)",
        }}
      >
        <p className="text-xs font-medium uppercase tracking-widest text-white/40 mb-3">
          App link
        </p>
        <div
          className="rounded-2xl px-4 py-3 mb-3 flex items-center justify-between gap-3"
          style={{ background: "rgba(0,20,50,0.35)", border: "1px solid rgba(255,255,255,0.15)" }}
        >
          <p className="text-sm text-white/60 truncate font-mono">{APP_URL}</p>
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="w-full rounded-2xl py-3 text-sm font-bold text-white transition"
          style={{ background: copied ? "rgba(110,231,183,0.25)" : "#D97706", border: copied ? "1px solid rgba(110,231,183,0.4)" : "none" }}
        >
          {copied ? "✓ Copied!" : "Copy link"}
        </button>
        <p className="mt-3 text-xs text-center text-white/30">
          {platform === "iphone"
            ? "Open this link in Safari, then follow the steps above"
            : "Open this link in Chrome, then follow the steps above"}
        </p>
      </div>

      {/* Sign up CTA */}
      <div className="w-full max-w-sm space-y-3 mb-8">
        <Link
          href="/signup"
          className="flex items-center justify-center w-full rounded-2xl py-4 text-base font-bold text-white transition"
          style={{ background: "#D97706" }}
        >
          Create your free account →
        </Link>
        <Link
          href="/login"
          className="flex items-center justify-center w-full rounded-2xl py-3 text-sm font-semibold transition"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" }}
        >
          Already have an account? Sign in
        </Link>
      </div>

      {/* Footer */}
      <p className="text-xs text-white/20 text-center">
        Made with 🏊 by J.O.D — Just an Ordinary Dad<br />
        Beta v1.0 · Natrix · Singapore
      </p>

    </div>
  );
}