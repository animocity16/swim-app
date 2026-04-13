"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";

const SPLASH_KEY = "natrix_splash_shown";
const PARALLAX_STRENGTH = 20;

function isVideo(url: string) {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

export default function SplashScreen() {
  const [ready, setReady] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [gone, setGone] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const gyroActive = useRef(false);

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem(SPLASH_KEY);
    if (alreadyShown) return;
    sessionStorage.setItem(SPLASH_KEY, "1");
    void loadThenShow();
  }, []);

  // Mouse parallax for desktop testing
  useEffect(() => {
    if (!ready || gone) return;

    function handleMouseMove(e: MouseEvent) {
      if (gyroActive.current) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setTiltX(x);
      setTiltY(y);
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [ready, gone]);

  // iOS gyroscope — request permission on first tap then activate
  async function requestGyro() {
    try {
      // @ts-ignore — DeviceOrientationEvent.requestPermission is iOS only
      if (typeof DeviceOrientationEvent?.requestPermission === "function") {
        // @ts-ignore
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === "granted") {
          activateGyro();
        }
      } else {
        // Android / non-iOS — no permission needed
        activateGyro();
      }
    } catch {
      // permission failed silently — mouse fallback still works
    }
  }

  function activateGyro() {
    gyroActive.current = true;
    window.addEventListener("deviceorientation", handleOrientation);
  }

  function handleOrientation(e: DeviceOrientationEvent) {
    const x = Math.max(-20, Math.min(20, e.gamma ?? 0)) / 20;
    const y = Math.max(-20, Math.min(20, (e.beta ?? 0) - 30)) / 20;
    setTiltX(x);
    setTiltY(y);
  }

  async function loadThenShow() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const url = user?.user_metadata?.splash_image_url as string | undefined;
      if (url && !isVideo(url)) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        });
        setMediaUrl(url);
      } else if (url) {
        setMediaUrl(url);
      }
    } catch {
      // default background
    }
    setReady(true);
  }

  function handleTap() {
    if (dismissed) return;
    setDismissed(true);

    // ✅ Request gyro permission on first tap — iOS requires user gesture
    void requestGyro();

    // Small delay then dismiss so gyro has a moment
    setTimeout(() => {
      setFadingOut(true);
      setTimeout(() => {
        setGone(true);
        window.removeEventListener("deviceorientation", handleOrientation);
      }, 700);
    }, 800);
  }

  if (!ready || gone) return null;

  const showVideo = mediaUrl && isVideo(mediaUrl);
  const showImage = mediaUrl && !isVideo(mediaUrl);

  const photoStyle: React.CSSProperties = showImage ? {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: `scale(1.12) translate(${tiltX * PARALLAX_STRENGTH}px, ${tiltY * PARALLAX_STRENGTH}px)`,
    transition: "transform 0.12s ease-out",
    willChange: "transform",
  } : {};

  const content = (
    <>
      <style>{`
        @keyframes natrix-drop {
          from { opacity: 0; transform: translateY(-24px) scale(0.75); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes natrix-title {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes natrix-sub {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes natrix-shimmer {
          0%   { opacity: 0.15; transform: scale(1); }
          50%  { opacity: 0.25; transform: scale(1.05); }
          100% { opacity: 0.15; transform: scale(1); }
        }
        .splash-drop    { animation: natrix-drop  0.55s cubic-bezier(0.34,1.56,0.64,1) 0.15s both; }
        .splash-title   { animation: natrix-title 0.75s ease-out 0.45s both; }
        .splash-sub     { animation: natrix-sub   0.75s ease-out 0.85s both; }
        .splash-hint    { animation: natrix-sub   0.75s ease-out 1.1s both; }
        .splash-shimmer { animation: natrix-shimmer 3s ease-in-out infinite; }
      `}</style>

      <div
        onClick={handleTap}
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 999999,
          cursor: "pointer",
          opacity: fadingOut ? 0 : 1,
          transition: fadingOut ? "opacity 0.65s ease" : "none",
          overflow: "hidden",
        }}
      >
        {/* Background */}
        {showVideo && (
          <video autoPlay muted loop playsInline style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%", objectFit: "cover",
          }}>
            <source src={mediaUrl} />
          </video>
        )}

        {showImage && <img src={mediaUrl} alt="" style={photoStyle} />}
        {!mediaUrl && <DefaultBackground />}

        {/* Dark overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.72) 100%)",
        }} />

        {/* Shimmer */}
        <div className="splash-shimmer" style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 50% 40%, rgba(14,165,233,0.18) 0%, transparent 65%)",
        }} />

        {/* Content — fixed, doesn't move with parallax */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "40px 32px", textAlign: "center",
        }}>
          <div className="splash-drop" style={{ fontSize: "52px", lineHeight: 1, marginBottom: "20px" }}>
            💧
          </div>

          <div className="splash-title" style={{
            fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
            fontSize: "clamp(52px, 14vw, 88px)",
            lineHeight: 1.05, letterSpacing: "0.06em", color: "#ffffff",
            textShadow: "0 2px 20px rgba(0,0,0,0.6), 0 0 80px rgba(14,165,233,0.4)",
          }}>
            WELCOME TO<br />NATRIX
          </div>

          <div className="splash-sub" style={{
            marginTop: "16px", fontSize: "13px",
            letterSpacing: "0.25em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.6)", fontWeight: 500,
          }}>
            Track Every Stroke
          </div>

          <div className="splash-hint" style={{
            marginTop: "48px", padding: "14px 40px",
            borderRadius: "100px",
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.1)",
            fontSize: "13px", letterSpacing: "0.2em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.85)",
            fontWeight: 600, backdropFilter: "blur(8px)",
          }}>
            Tap to Enter
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}

function DefaultBackground() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "linear-gradient(160deg, #010f1c 0%, #062a45 30%, #0a4d7a 60%, #063554 80%, #011627 100%)",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(175deg, rgba(14,165,233,0.08) 0%, transparent 40%),
          linear-gradient(185deg, rgba(14,165,233,0.05) 0%, transparent 40%)
        `,
      }} />
    </div>
  );
}