"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const TUTORIAL_KEY = "natrix_tutorial_done";

type Step = {
  id: string;
  title: string;
  body: string;
  targetAttr: string | null;
  route?: string;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Sssup! I'm Natrix! 🐍",
    body: "Your swim meet tracker — built by a swim parent, for swim parents. Let me show you around real quick!",
    targetAttr: null,
  },
  {
    id: "brood",
    title: "Your ssswimmers live here!",
    body: "Tap Brood to see your child's profile, their times, and where they rank in their age group.",
    targetAttr: "brood",
    route: "/swimmers",
  },
  {
    id: "scan",
    title: "Ssscan a result! 📸",
    body: "Screenshot Meet Mobile after a race, tap Scan and upload it — I'll read the time and save it automatically!",
    targetAttr: "scan",
    route: "/scan",
  },
  {
    id: "progress",
    title: "Every PB, tracked! 🏅",
    body: "Open your swimmer's profile and tap the Progress tab to see charts for every event and every stroke.",
    targetAttr: "brood",
    route: "/swimmers",
  },
  {
    id: "standards",
    title: "Chasse those standards! 🎯",
    body: "Go to Standards and add your club's upgrading times — then I'll show you exactly how far your swimmer is from their next squad level!",
    targetAttr: "standards",
    route: "/standards",
  },
  {
    id: "done",
    title: "Yesss! You're all set! 🎉",
    body: "Start by scanning your child's first result. You can replay this guide anytime from Settings. Let's go!",
    targetAttr: null,
    route: "/swimmers",
  },
];

export function replayTutorial() {
  localStorage.removeItem(TUTORIAL_KEY);
  window.dispatchEvent(new Event("natrix_replay_tutorial"));
}

export default function TutorialOverlay() {
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const frameRef = useRef<number | null>(null);

  // Hidden on auth/onboarding screens AND anywhere under /demo — the demo
  // is a logged-out, read-only preview and has no swimmers/scan/standards
  // routes of its own for the tutorial to walk through.
    const hidden = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/invite",
    "/signup",
    "/onboarding",
    "/auth",
    "/demo",
    "/search",
    "/swimmer",
    "/confirm-swimmer",
    "/calculator",
  ].some((p) => pathname.startsWith(p));

  useEffect(() => {
    setMounted(true);
    const done = localStorage.getItem(TUTORIAL_KEY);
    if (!done && !hidden) {
      setTimeout(() => {
        setActive(true);
        setTimeout(() => setVisible(true), 50);
      }, 900);
    }
  }, [hidden]);

  useEffect(() => {
    function handleReplay() {
      setStepIndex(0);
      setActive(true);
      setTimeout(() => setVisible(true), 50);
    }
    window.addEventListener("natrix_replay_tutorial", handleReplay);
    return () => window.removeEventListener("natrix_replay_tutorial", handleReplay);
  }, []);

  // cleanup frameRef on unmount
  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(() => {
      setActive(false);
      localStorage.setItem(TUTORIAL_KEY, "true");
    }, 200);
  }

  function next() {
    const step = STEPS[stepIndex];

    if (stepIndex === STEPS.length - 1) {
      dismiss();
      if (step.route) router.push(step.route);
      return;
    }

    const nextStep = STEPS[stepIndex + 1];
    setVisible(false);

    setTimeout(() => {
      setStepIndex((i) => i + 1);
      if (nextStep.route && pathname !== nextStep.route) {
        router.push(nextStep.route);
      }
      setTimeout(() => setVisible(true), 100);
    }, 200);
  }

  if (!mounted || !active || hidden) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  // Brand colours — forced inline so app theme never overrides them
  const ORANGE = "#D97706";
  const ORANGE_DARK = "#92400E";
  const BUBBLE_BG = "#FEF3C7";
  const TEXT_DARK = "#1C1917";
  const TEXT_MED = "#44403C";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: 40,
        paddingLeft: 16,
        paddingRight: 16,
        background: "rgba(0,0,0,0.65)",
      }}
      onClick={dismiss}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          transition: "all 0.2s ease",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(40px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Comic bubble */}
        <div
          style={{
            position: "relative",
            borderRadius: 20,
            padding: 20,
            background: BUBBLE_BG,
            border: `3px solid ${ORANGE_DARK}`,
            boxShadow: `5px 5px 0px ${ORANGE_DARK}`,
          }}
        >
          {/* Snake inside bubble top-left */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 44, lineHeight: 1 }}>🐍</span>
            {/* Step dots */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: 99,
                    transition: "all 0.2s",
                    width: i === stepIndex ? 18 : 7,
                    height: 7,
                    background: i === stepIndex ? ORANGE : "rgba(0,0,0,0.2)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Text */}
          <div style={{ marginBottom: 20 }}>
            <p
              style={{
                color: TEXT_DARK,
                fontSize: "1.05rem",
                fontWeight: 900,
                lineHeight: 1.3,
                marginBottom: 8,
                fontFamily: "inherit",
              }}
            >
              {step.title}
            </p>
            <p
              style={{
                color: TEXT_MED,
                fontSize: "0.9rem",
                fontWeight: 500,
                lineHeight: 1.5,
                fontFamily: "inherit",
              }}
            >
              {step.body}
            </p>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={dismiss}
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: TEXT_MED,
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(0,0,0,0.08)",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Skip
            </button>
            <button
              onClick={next}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: 14,
                fontWeight: 800,
                fontSize: "0.95rem",
                color: "#fff",
                background: ORANGE,
                border: `2px solid ${ORANGE_DARK}`,
                boxShadow: `3px 3px 0px ${ORANGE_DARK}`,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.02em",
              }}
            >
              {isLast ? "Let's go! 🐍" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
