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
    title: "Chasse those sstandards! 🎯",
    body: "Tap Standards to see exactly how many seconds away your swimmer is from qualifying for their next big meet.",
    targetAttr: "standards",
    route: "/standards",
  },
  {
    id: "done",
    title: "Yesss! You're all set! 🎉",
    body: "Start by scanning your child's first result. You can replay this guide anytime from Settings → Help. Let's go! 🐍",
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pb-10 px-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={dismiss}
    >
      <div
        className={`w-full max-w-sm transition-all duration-200 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Snake */}
        <div className="pl-5 mb-[-6px] relative z-10">
          <span
            className="text-5xl inline-block"
            style={{ animation: "bounce 1s infinite" }}
          >
            🐍
          </span>
        </div>

        {/* Comic bubble */}
        <div
          className="relative rounded-2xl p-5 shadow-2xl"
          style={{
            background: "#FFF176",
            border: "3px solid #111",
            boxShadow: "5px 5px 0px #111",
          }}
        >
          {/* Bubble tail outer */}
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: "30px",
              width: 0,
              height: 0,
              borderLeft: "11px solid transparent",
              borderRight: "11px solid transparent",
              borderBottom: "15px solid #111",
            }}
          />
          {/* Bubble tail inner */}
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% - 4px)",
              left: "33px",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderBottom: "13px solid #FFF176",
              zIndex: 1,
            }}
          />

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mb-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-200"
                style={{
                  width: i === stepIndex ? 16 : 6,
                  height: 6,
                  background: i === stepIndex ? "#111" : "rgba(0,0,0,0.2)",
                }}
              />
            ))}
          </div>

          {/* Text */}
          <div className="space-y-2 mb-5">
            <p
              className="text-gray-900 font-black"
              style={{ fontSize: "1.05rem", lineHeight: 1.3 }}
            >
              {step.title}
            </p>
            <p
              className="text-gray-700 font-medium"
              style={{ fontSize: "0.88rem", lineHeight: 1.45 }}
            >
              {step.body}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={dismiss}
              className="text-xs font-semibold text-gray-500 py-2 px-3 rounded-xl"
              style={{ background: "rgba(0,0,0,0.08)" }}
            >
              Skip
            </button>
            <button
              onClick={next}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white tracking-wide"
              style={{ background: "#111", border: "2px solid #111" }}
            >
              {isLast ? "Let's go! 🐍" : `Next →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}