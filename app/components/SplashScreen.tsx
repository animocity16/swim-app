"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";

const SPLASH_KEY = "natrix_splash_shown";

function isVideo(url: string) {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

export default function SplashScreen() {
  const [ready, setReady] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [gone, setGone] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  useEffect(() => {
    if (
      window.location.pathname === "/reset-password" ||
      window.location.search.includes("code=") ||
      window.location.search.includes("type=recovery") ||
      window.location.hash.includes("type=recovery")
    ) return;
    const alreadyShown = sessionStorage.getItem(SPLASH_KEY);
  
    if (alreadyShown) return;
    sessionStorage.setItem(SPLASH_KEY, "1");
    void loadThenShow();
  }, []);

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

  function handleEnter() {
    setFadingOut(true);
    setTimeout(() => setGone(true), 700);
  }

  if (!ready || gone) return null;

  const showVideo = mediaUrl && isVideo(mediaUrl);
  const showImage = mediaUrl && !isVideo(mediaUrl);

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

        /* Cinematic drift — slow, smooth, no permissions */
        @keyframes natrix-drift {
          0%   { transform: scale(1.12) translate(0px, 0px); }
          25%  { transform: scale(1.12) translate(-12px, -6px); }
          50%  { transform: scale(1.12) translate(8px, -10px); }
          75%  { transform: scale(1.12) translate(12px, 4px); }
          100% { transform: scale(1.12) translate(0px, 0px); }
        }

        .splash-drop    { animation: natrix-drop  0.55s cubic-bezier(0.34,1.56,0.64,1) 0.15s both; }
        .splash-title   { animation: natrix-title 0.75s ease-out 0.45s both; }
        .splash-sub     { animation: natrix-sub   0.75s ease-out 0.85s both; }
        .splash-hint    { animation: natrix-sub   0.75s ease-out 1.1s both; }
        .splash-shimmer { animation: natrix-shimmer 3s ease-in-out infinite; }
        .splash-drift   { animation: natrix-drift 12s ease-in-out infinite; }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 999999,
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

        {/* Photo with cinematic drift animation */}
        {showImage && (
          <img
            src={mediaUrl}
            alt=""
            className="splash-drift"
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover",
            }}
          />
        )}

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

        {/* Content — stays perfectly still while photo drifts */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "40px 32px", textAlign: "center",
        }}>
          {/* Logo */}
          <img
            src="/natrix-favicon.svg"
            alt="Natrix"
            className="splash-drop"
            style={{
              width: "72px", height: "72px",
              objectFit: "contain",
              marginBottom: "20px",
            }}
          />

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

          <button
            onClick={handleEnter}
            className="splash-hint"
            style={{
              marginTop: "48px", padding: "14px 40px",
              borderRadius: "100px",
              border: "none",
              background: "#BA7517",
              fontSize: "13px", letterSpacing: "0.2em",
              textTransform: "uppercase", color: "#2C1A04",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Let&rsquo;s Go
          </button>
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