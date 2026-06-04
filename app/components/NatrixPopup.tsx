"use client";

import { useEffect, useState } from "react";

export type NatrixMoment =
  | "welcome"
  | "add_swimmer"
  | "scan_prompt"
  | "first_scan_done"
  | "locked"
  | "level_up"
  | "customise";

interface NatrixPopupProps {
  moment: NatrixMoment;
  onDismiss: () => void;
  lockedFeature?: string;
}

const MESSAGES: Record<NatrixMoment, { lines: string[] }> = {
  welcome: {
    lines: ["Ssso you found me! 🐍", "I'm Natrix. Let's get your swimmer set up first!"],
  },
  add_swimmer: {
    lines: ["Oi! No swimmer yet!", "Add your child and let's get tracking! 🏊"],
  },
  scan_prompt: {
    lines: ["Yesss! Swimmer added! 🎉", "Now go scan your first meet result!"],
  },
  first_scan_done: {
    lines: ["Sssplendid! First scan done!", "One more meet and something special unlocks... 👀"],
  },
  locked: {
    lines: ["Sssorry, not yet! 🔒", "Keep scanning to unlock this feature!"],
  },
  level_up: {
    lines: ["YESSS!! Level up!! 🎉", "You've unlocked something new — go explore!"],
  },
  customise: {
    lines: ["Make it yours! 🎨", "Head to Settings and customise your Natrix app!"],
  },
};

export default function NatrixPopup({
  moment,
  onDismiss,
  lockedFeature,
}: NatrixPopupProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const content = MESSAGES[moment];

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pb-10 px-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={handleDismiss}
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
          {/* Bubble tail - outer */}
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
          {/* Bubble tail - inner */}
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

          {/* Text */}
          <div className="space-y-1 mb-4">
            {content.lines.map((line, i) => (
              <p
                key={i}
                className="text-gray-900"
                style={{
                  fontSize: i === 0 ? "1.05rem" : "0.92rem",
                  fontWeight: i === 0 ? 800 : 600,
                  lineHeight: 1.3,
                }}
              >
                {line}
              </p>
            ))}
            {lockedFeature && (
              <p className="text-gray-500 text-xs mt-1 font-medium">
                ({lockedFeature})
              </p>
            )}
          </div>

          {/* Button */}
          <button
            onClick={handleDismiss}
            className="w-full py-2.5 rounded-xl font-bold text-sm text-white tracking-wide"
            style={{
              background: "#111",
              border: "2px solid #111",
            }}
          >
            Got it, Natrix! 🐍
          </button>
        </div>
      </div>
    </div>
  );
}