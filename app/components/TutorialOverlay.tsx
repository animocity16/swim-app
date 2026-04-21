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
    title: "Welcome to Natrix! 🏊",
    body: "The swim meet tracker built for parents. Let us show you around — takes less than a minute.",
    targetAttr: null,
  },
  {
    id: "brood",
    title: "Your swimmers are here",
    body: "Tap 'Brood' to see your child's profile and their competitors. We've already loaded their age group!",
    targetAttr: "brood",
    route: "/swimmers",
  },
  {
    id: "scan",
    title: "Scan your child's 50M Free result",
    body: "Screenshot their 50M Free from Meet Mobile, tap Scan and upload it — Natrix reads the time and shows you exactly where they rank against the competition.",
    targetAttr: "scan",
    route: "/scan",
  },
  {
    id: "progress",
    title: "Track every PB",
    body: "Open your swimmer's profile and tap the Progress tab to see sparkline charts for every event.",
    targetAttr: "brood",
    route: "/swimmers",
  },
  {
    id: "standards",
    title: "Chase qualifying standards",
    body: "Tap Standards to see exactly how many seconds away your swimmer is from qualifying for their next big meet.",
    targetAttr: "standards",
    route: "/standards",
  },
  {
    id: "done",
    title: "You're all set! 🎉",
    body: "Start by scanning your child's 50M Free result. You can replay this guide anytime from Settings → Help.",
    targetAttr: null,
    route: "/swimmers",
  },
];

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export default function TutorialOverlay() {
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const frameRef = useRef<number | null>(null);

  const hidden = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/invite",
    "/signup",
    "/onboarding",
    "/auth",
  ].some((p) => pathname.startsWith(p));

  useEffect(() => {
    setMounted(true);
    const done = localStorage.getItem(TUTORIAL_KEY);
    if (!done && !hidden) {
      setTimeout(() => setActive(true), 900);
    }
  }, [hidden]);

  useEffect(() => {
    function handleReplay() {
      setStepIndex(0);
      setActive(true);
    }
    window.addEventListener("natrix_replay_tutorial", handleReplay);
    return () => window.removeEventListener("natrix_replay_tutorial", handleReplay);
  }, []);

  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];
    if (!step.targetAttr) { setSpotlight(null); return; }

    function measure() {
      const el = document.querySelector(
        `[data-tutorial="${step.targetAttr}"]`
      ) as HTMLElement | null;

      if (el) {
        const rect = el.getBoundingClientRect();
        setSpotlight({
          top: rect.top - 6,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 12,
        });
      } else {
        frameRef.current = requestAnimationFrame(measure);
      }
    }

    const timer = setTimeout(measure, 150);
    return () => {
      clearTimeout(timer);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [active, stepIndex]);

  const step = STEPS[stepIndex];
  const navIsTarget = active && step?.targetAttr !== null;

  if (!mounted || !active || hidden) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const isCentre = step.targetAttr === null;

  function next() {
    if (isLast) { finish(); return; }
    const nextStep = STEPS[stepIndex + 1];
    if (nextStep.route) router.push(nextStep.route);
    setStepIndex((i) => i + 1);
  }

  function prev() {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
  }

  function finish() {
    localStorage.setItem(TUTORIAL_KEY, "1");
    setActive(false);
    router.push("/swimmers");
  }

  function skip() {
    localStorage.setItem(TUTORIAL_KEY, "1");
    setActive(false);
  }

  const tooltipBottom = spotlight
    ? window.innerHeight - spotlight.top + 18
    : 0;

  const tooltipLeft = spotlight
    ? Math.min(
        Math.max(spotlight.left + spotlight.width / 2, 170),
        window.innerWidth - 170
      )
    : window.innerWidth / 2;

  return (
    <>
      {navIsTarget && (
        <style>{`
          nav.fixed { z-index: 10002 !important; }
        `}</style>
      )}

      <div
        onClick={skip}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(0,8,20,0.85)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
        }}
      />

      {spotlight && (
        <div
          style={{
            position: "fixed",
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            borderRadius: 18,
            zIndex: 10003,
            background: "transparent",
            boxShadow: "0 0 0 9999px rgba(0,8,20,0.85)",
            border: "2px solid rgba(253,230,138,0.8)",
            pointerEvents: "none",
            transition: "all 0.3s ease",
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          zIndex: 10004,
          ...(isCentre
            ? {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "min(340px, calc(100vw - 48px))",
              }
            : {
                bottom: tooltipBottom,
                left: tooltipLeft,
                transform: "translateX(-50%)",
                width: "min(300px, calc(100vw - 48px))",
              }),
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.97)",
            borderRadius: 22,
            padding: "22px 24px",
            boxShadow: "0 12px 48px rgba(0,20,60,0.6)",
            position: "relative",
            fontFamily: "-apple-system, 'SF Pro Display', sans-serif",
          }}
        >
          <div style={{ display: "flex", gap: 5, marginBottom: 16 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === stepIndex ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === stepIndex ? "#D97706" : "#E5E7EB",
                transition: "all 0.25s ease",
              }} />
            ))}
          </div>

          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 6px", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Step {stepIndex + 1} of {STEPS.length}
          </p>

          <p style={{ fontSize: 18, fontWeight: 700, color: "#0A1628", margin: "0 0 10px", lineHeight: 1.3 }}>
            {step.title}
          </p>

          <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.65, margin: "0 0 22px" }}>
            {step.body}
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            {!isFirst && (
              <button onClick={prev} style={{
                flex: 1, padding: "11px 16px", borderRadius: 14,
                border: "1px solid #E5E7EB", background: "transparent",
                color: "#6B7280", fontSize: 14, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                ← Back
              </button>
            )}
            <button onClick={next} style={{
              flex: isFirst ? 1 : 2, padding: "11px 16px", borderRadius: 14,
              border: "none", background: "linear-gradient(135deg, #F59E0B, #D97706)",
              color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 4px 14px rgba(217,119,6,0.4)",
            }}>
              {isLast ? "Let's go! 🏊" : "Next →"}
            </button>
          </div>

          {!isLast && (
            <button onClick={skip} style={{
              display: "block", width: "100%", marginTop: 14,
              background: "none", border: "none",
              color: "#9CA3AF", fontSize: 12,
              cursor: "pointer", textAlign: "center", fontFamily: "inherit",
            }}>
              Skip tutorial
            </button>
          )}

          {!isCentre && spotlight && (
            <div style={{
              position: "absolute", bottom: -20, left: "50%",
              transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "11px solid transparent",
              borderRight: "11px solid transparent",
              borderTop: "20px solid rgba(255,255,255,0.97)",
            }} />
          )}
        </div>
      </div>

      {spotlight && (
        <div style={{
          position: "fixed",
          top: spotlight.top - 40,
          left: spotlight.left + spotlight.width / 2,
          transform: "translateX(-50%)",
          fontSize: 26,
          zIndex: 10003,
          pointerEvents: "none",
          animation: "tutBounce 1s ease-in-out infinite",
        }}>
          👆
        </div>
      )}

      <style>{`
        @keyframes tutBounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-7px); }
        }
      `}</style>
    </>
  );
}

export function replayTutorial() {
  localStorage.removeAll(TUTORIAL_KEY);
  window.dispatchEvent(new Event("natrix_replay_tutorial"));
}