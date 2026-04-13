"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const MAX_SIZE_MB = 50;
const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm";

function isVideo(url: string) {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

export default function SplashMediaUpload() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadCurrent();
  }, []);

  async function loadCurrent() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    // ✅ Read from user metadata — no profiles table needed
    const url = user.user_metadata?.splash_image_url ?? null;
    if (url) setCurrentUrl(url);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      setStatus(`File too large — max ${MAX_SIZE_MB}MB.`);
      return;
    }

    setUploading(true);
    setStatus("Uploading...");

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const filename = `${userId}/splash.${ext}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("splash-media")
        .upload(filename, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        setStatus(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("splash-media")
        .getPublicUrl(filename);

      const publicUrl = urlData.publicUrl;

      // ✅ Save to user metadata — bypasses RLS entirely
      const { error: metaError } = await supabase.auth.updateUser({
        data: { splash_image_url: publicUrl }
      });

      if (metaError) {
        setStatus(`Upload saved but metadata failed: ${metaError.message}`);
        setUploading(false);
        return;
      }

      setCurrentUrl(publicUrl);
      setStatus("✓ Splash screen updated!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error: ${message}`);
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleRemove() {
    setUploading(true);
    setStatus("Removing...");

    await supabase.auth.updateUser({
      data: { splash_image_url: null }
    });

    setCurrentUrl(null);
    setStatus("Splash screen reset to default.");
    setUploading(false);
  }

  return (
    <div
      style={{
        borderRadius: "24px",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.04)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div>
        <p style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.3)",
          marginBottom: "4px",
        }}>
          Splash Screen
        </p>
        <p style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>
          Your swimmer's moment
        </p>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", marginTop: "4px" }}>
          Upload a photo or short video of your swimmer. It appears every time you open Natrix.
        </p>
      </div>

      {/* Current media preview */}
      {currentUrl && (
        <div style={{
          borderRadius: "16px",
          overflow: "hidden",
          position: "relative",
          aspectRatio: "16/9",
          background: "#000",
        }}>
          {isVideo(currentUrl) ? (
            <video
              src={currentUrl}
              autoPlay
              muted
              loop
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <img
              src={currentUrl}
              alt="Splash"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
          <div style={{
            position: "absolute",
            bottom: "8px",
            left: "8px",
            background: "rgba(0,0,0,0.6)",
            borderRadius: "8px",
            padding: "4px 10px",
            fontSize: "11px",
            color: "rgba(255,255,255,0.7)",
          }}>
            {isVideo(currentUrl) ? "🎬 Video" : "🖼️ Photo"}
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* Upload button */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          width: "100%",
          padding: "14px",
          borderRadius: "14px",
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.08)",
          color: "#fff",
          fontSize: "14px",
          fontWeight: 600,
          cursor: uploading ? "not-allowed" : "pointer",
          opacity: uploading ? 0.5 : 1,
          transition: "background 0.2s",
        }}
      >
        {currentUrl ? "📸 Change Photo / Video" : "📸 Upload Photo or Video"}
      </button>

      {/* Remove button */}
      {currentUrl && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={uploading}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "14px",
            border: "1px solid rgba(239,68,68,0.25)",
            background: "rgba(239,68,68,0.08)",
            color: "rgba(252,165,165,0.9)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: uploading ? "not-allowed" : "pointer",
            opacity: uploading ? 0.5 : 1,
          }}
        >
          Remove — use default background
        </button>
      )}

      {status && (
        <p style={{
          fontSize: "13px",
          color: status.startsWith("✓") ? "#6ee7b7" : "rgba(255,255,255,0.45)",
          textAlign: "center",
        }}>
          {status}
        </p>
      )}

      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
        Supports JPG, PNG, HEIC, MP4, MOV · Max {MAX_SIZE_MB}MB
      </p>
    </div>
  );
}