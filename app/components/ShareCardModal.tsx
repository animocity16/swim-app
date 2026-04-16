"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShareResult = {
  swimmerName: string;
  event: string;
  course: string;
  timeMs: number;
  meetName?: string | null;
  swamAt?: string | null;
  isPB?: boolean;
  strokeColor?: string;
  place?: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
}

function formatCourse(course: string): string {
  if (course === "SCM") return "Short Course · Metres";
  if (course === "LCM") return "Long Course · Metres";
  if (course === "SCY") return "Short Course · Yards";
  return course;
}

function formatDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ─── Canvas rounded rect helper ───────────────────────────────────────────────

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────

function drawShareCard(canvas: HTMLCanvasElement, result: ShareResult) {
  const ctx = canvas.getContext("2d")!;
  const W = 1080, H = 1080;
  canvas.width = W;
  canvas.height = H;

  const stroke = result.strokeColor ?? "#38BDF8";
  const CX = W / 2;

  // ── Background ─────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, "#041E30");
  bgGrad.addColorStop(0.5, "#063554");
  bgGrad.addColorStop(1, "#0A3D5C");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const glow1 = ctx.createRadialGradient(180, 180, 0, 180, 180, 700);
  glow1.addColorStop(0, `${stroke}18`);
  glow1.addColorStop(1, "transparent");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(900, 900, 0, 900, 900, 600);
  glow2.addColorStop(0, "rgba(8,74,115,0.55)");
  glow2.addColorStop(1, "transparent");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let y = 0; y < H; y += 54) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // ── Card ───────────────────────────────────────────────────────────────────
  const PAD = 56;
  const cardX = PAD, cardY = PAD, cardW = W - PAD * 2, cardH = H - PAD * 2;

  ctx.fillStyle = "rgba(255,255,255,0.055)";
  rrect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.lineWidth = 1.5;
  rrect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.stroke();

  // Accent line top
  const accentGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
  accentGrad.addColorStop(0, "transparent");
  accentGrad.addColorStop(0.25, stroke);
  accentGrad.addColorStop(0.75, stroke);
  accentGrad.addColorStop(1, "transparent");
  ctx.strokeStyle = accentGrad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cardX + 100, cardY);
  ctx.lineTo(cardX + cardW - 100, cardY);
  ctx.stroke();

  // ── Layout — each section has an explicit Y, no accumulated drift ──────────

  // NATRIX wordmark — top section
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.font = "600 26px -apple-system, 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N A T R I X", CX, cardY + 72);

  // Swimmer name
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 72px -apple-system, 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  let displayName = result.swimmerName.toUpperCase();
  while (ctx.measureText(displayName).width > cardW - 100 && displayName.length > 4) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== result.swimmerName.toUpperCase()) displayName += "…";
  ctx.fillText(displayName, CX, cardY + 152);

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 140, cardY + 176);
  ctx.lineTo(cardX + cardW - 140, cardY + 176);
  ctx.stroke();

  // Event + course — upper-middle
  ctx.fillStyle = stroke;
  ctx.font = "bold 44px -apple-system, 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(result.event, CX, cardY + 232);

  ctx.fillStyle = "rgba(255,255,255,0.36)";
  ctx.font = "28px -apple-system, 'Helvetica Neue', Arial, sans-serif";
  ctx.fillText(formatCourse(result.course), CX, cardY + 272);

  // BIG time — centre of card
  ctx.shadowColor = `${stroke}55`;
  ctx.shadowBlur = 45;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 152px -apple-system, 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(formatMs(result.timeMs), CX, cardY + 470);
  ctx.shadowBlur = 0;

  // PB badge + place badge — just below time
  let badgeRowY = cardY + 496;

  if (result.isPB) {
    // If we also have a place, show both side by side
    if (result.place != null) {
      const ordinal = result.place === 1 ? "st" : result.place === 2 ? "nd" : result.place === 3 ? "rd" : "th";
      const placeLabel = `${result.place}${ordinal} Place`;
      const pbW = 210, placeW = 190, badgeH = 50, gap = 16;
      const totalW = pbW + placeW + gap;
      const startX = CX - totalW / 2;

      // PB badge
      const pbGrad = ctx.createLinearGradient(startX, 0, startX + pbW, 0);
      pbGrad.addColorStop(0, "#B45309");
      pbGrad.addColorStop(1, "#D97706");
      ctx.fillStyle = pbGrad;
      rrect(ctx, startX, badgeRowY, pbW, badgeH, 25);
      ctx.fill();
      ctx.fillStyle = "#FDE68A";
      ctx.font = "bold 20px -apple-system, 'Helvetica Neue', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PERSONAL BEST", startX + pbW / 2, badgeRowY + 33);

      // Place badge
      const placeX = startX + pbW + gap;
      ctx.fillStyle = "rgba(99,179,237,0.2)";
      rrect(ctx, placeX, badgeRowY, placeW, badgeH, 25);
      ctx.fill();
      ctx.strokeStyle = "rgba(99,179,237,0.4)";
      ctx.lineWidth = 1;
      rrect(ctx, placeX, badgeRowY, placeW, badgeH, 25);
      ctx.stroke();
      ctx.fillStyle = "#90CDF4";
      ctx.font = "bold 20px -apple-system, 'Helvetica Neue', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(placeLabel, placeX + placeW / 2, badgeRowY + 33);
    } else {
      // Just PB badge centred
      const badgeW = 230, badgeH = 50;
      const badgeX = CX - badgeW / 2;
      const badgeGrad = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0);
      badgeGrad.addColorStop(0, "#B45309");
      badgeGrad.addColorStop(1, "#D97706");
      ctx.fillStyle = badgeGrad;
      rrect(ctx, badgeX, badgeRowY, badgeW, badgeH, 25);
      ctx.fill();
      ctx.fillStyle = "#FDE68A";
      ctx.font = "bold 22px -apple-system, 'Helvetica Neue', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PERSONAL BEST", CX, badgeRowY + 33);
    }
  } else if (result.place != null) {
    // No PB but has a place — show place badge only
    const ordinal = result.place === 1 ? "st" : result.place === 2 ? "nd" : result.place === 3 ? "rd" : "th";
    const badgeW = 200, badgeH = 50;
    const badgeX = CX - badgeW / 2;
    ctx.fillStyle = "rgba(99,179,237,0.2)";
    rrect(ctx, badgeX, badgeRowY, badgeW, badgeH, 25);
    ctx.fill();
    ctx.strokeStyle = "rgba(99,179,237,0.4)";
    ctx.lineWidth = 1;
    rrect(ctx, badgeX, badgeRowY, badgeW, badgeH, 25);
    ctx.stroke();
    ctx.fillStyle = "#90CDF4";
    ctx.font = "bold 22px -apple-system, 'Helvetica Neue', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${result.place}${ordinal} Place`, CX, badgeRowY + 33);
  }

  // Divider — lower section
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 140, cardY + 590);
  ctx.lineTo(cardX + cardW - 140, cardY + 590);
  ctx.stroke();

  // Meet name + date — lower section
  let lowerY = cardY + 644;

  if (result.meetName) {
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "bold 36px -apple-system, 'Helvetica Neue', Arial, sans-serif";
    ctx.textAlign = "center";
    let meetDisplay = result.meetName;
    while (ctx.measureText(meetDisplay).width > cardW - 140 && meetDisplay.length > 4) {
      meetDisplay = meetDisplay.slice(0, -1);
    }
    if (meetDisplay !== result.meetName) meetDisplay += "…";
    ctx.fillText(meetDisplay, CX, lowerY);
    lowerY += 48;
  }

  if (result.swamAt) {
    ctx.fillStyle = "rgba(255,255,255,0.34)";
    ctx.font = "28px -apple-system, 'Helvetica Neue', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(formatDate(result.swamAt), CX, lowerY);
  }

  // Branding — pinned to bottom of card
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.font = "22px -apple-system, 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Track every PB with Natrix", CX, cardY + cardH - 38);
}

// ─── Share icon ───────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M10 2L13 5M13 5L10 8M13 5H6C4.34 5 3 6.34 3 8V13"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function ShareCardModal({
  result,
  onClose,
}: {
  result: ShareResult;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      drawShareCard(canvasRef.current, result);
    }
  }, [result]);

  async function handleShare() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSharing(true);

    canvas.toBlob(async (blob) => {
      if (!blob) { setSharing(false); return; }
      const file = new File([blob], "natrix-result.png", { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${result.swimmerName} — ${result.event}`,
            text: `${result.swimmerName} swam ${formatMs(result.timeMs)} in the ${result.event}!`,
          });
          setSharing(false);
          return;
        } catch { /* cancelled */ }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `natrix-${result.swimmerName.replace(/\s+/g, "-")}-${result.event.replace(/\s+/g, "-")}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setSharing(false);
    }, "image/png");
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `natrix-${result.swimmerName.replace(/\s+/g, "-")}-${result.event.replace(/\s+/g, "-")}.png`;
    a.click();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-end"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl px-5 pt-5 pb-8 space-y-4"
        style={{
          background: "rgba(6,35,54,0.95)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderBottom: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Share result</p>
            <p className="text-base font-bold text-white mt-0.5">{result.event} · {formatMs(result.timeMs)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/40"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div
          className="w-full overflow-hidden rounded-2xl"
          style={{ border: "1px solid rgba(255,255,255,0.1)", aspectRatio: "1" }}
        >
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "#D97706" }}
          >
            <ShareIcon />
            {sharing ? "Preparing…" : "Share"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white/80"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 2v8M4 7l3.5 4L11 7M2 13h11"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {copied ? "Saved! ✓" : "Save image"}
          </button>
        </div>

        <p className="text-center text-xs text-white/20">
          1080×1080 · ready for Instagram, WhatsApp & Stories
        </p>
      </div>
    </div>
  );
}