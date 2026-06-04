"use client";

import { useState } from "react";
import NatrixPopup from "./NatrixPopup";

interface LockedFeatureProps {
  featureName: string;
  children: React.ReactNode;
  locked: boolean;
}

export default function LockedFeature({
  featureName,
  children,
  locked,
}: LockedFeatureProps) {
  const [showPopup, setShowPopup] = useState(false);

  if (!locked) return <>{children}</>;

  return (
    <>
      <div
        className="relative select-none"
        onClick={() => setShowPopup(true)}
      >
        {/* Blurred locked content */}
        <div
          className="pointer-events-none"
          style={{ filter: "blur(3px)", opacity: 0.4 }}
        >
          {children}
        </div>

        {/* Lock badge */}
        <div
          className="absolute inset-0 flex items-center justify-center"
        >
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm"
            style={{
              background: "#FFF176",
              border: "2px solid #111",
              boxShadow: "3px 3px 0px #111",
            }}
          >
            <span>🔒</span>
            <span className="text-gray-900">Keep scanning to unlock!</span>
          </div>
        </div>
      </div>

      {showPopup && (
        <NatrixPopup
          moment="locked"
          lockedFeature={featureName}
          onDismiss={() => setShowPopup(false)}
        />
      )}
    </>
  );
}