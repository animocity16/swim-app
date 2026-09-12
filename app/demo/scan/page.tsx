"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ShareCardModal, { type ShareResult } from "@/app/components/ShareCardModal";
import {
  DEMO_PRIMARY_SWIMMER_ID,
  DEMO_SWIMMERS,
  DEMO_TIMES,
  formatDate,
  formatMs,
} from "@/lib/demoData";

type Stage = "ready" | "scanning" | "result";

export default function DemoScanPage() {
  const [stage, setStage] = useState<Stage>("ready");
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);

  const swimmer = DEMO_SWIMMERS.find((s) => s.id === DEMO_PRIMARY_SWIMMER_ID)!;
  const result = useMemo(() => {
    return [...DEMO_TIMES]
      .filter((row) => row.swimmer_id === DEMO_PRIMARY_SWIMMER_ID && row.event === "100 Free")
      .sort((a, b) => new Date(b.swam_at).getTime() - new Date(a.swam_at).getTime())[0];
  }, []);

  function runDemoScan() {
    setStage("scanning");
    window.setTimeout(() => setStage("result"), 1100);
  }

  function openShareCard() {
    if (!result) return;
    setShareResult({
      swimmerName: swimmer.name,
      event: result.event,
      course: result.course,
      timeMs: result.time_ms,
      meetName: result.meet_name,
      swamAt: result.swam_at,
      isPB: result.is_pb,
      place: result.place,
      strokeColor: "#38BDF8",
    });
  }

  return (
    <div className="shell">
      <div className="container-app space-y-5 pb-28">
        <div className="flex items-center justify-between pt-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
              Interactive demo
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">Scan a meet result</h1>
            <p className="mt-1 text-sm text-white/45">
              See how a parent can turn a result screenshot into a tracked swim time.
            </p>
          </div>
          <Link href="/demo/dashboard" className="rounded-full px-3 py-2 text-xs font-semibold text-white/60"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
            Home
          </Link>
        </div>

        <div className="rounded-3xl p-4"
          style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.18)" }}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl text-lg"
              style={{ background: "rgba(56,189,248,0.12)" }}>
              📷
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Safe portfolio simulation</p>
              <p className="mt-1 text-xs leading-5 text-white/45">
                This uses sample data only. It demonstrates the scan-to-result workflow without uploading anything or writing to the live database.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl overflow-hidden"
          style={{ background: "#F7F8FA", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "#111827" }}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Sample result screenshot</p>
              <p className="text-sm font-semibold text-white">June Invitational</p>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold text-white/70"
              style={{ background: "rgba(255,255,255,0.1)" }}>
              Meet results
            </span>
          </div>

          <div className="p-4 text-gray-900">
            <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <p className="text-xs text-gray-500">Girls 11 yrs · 100m Freestyle</p>
                <p className="mt-0.5 text-base font-bold">Final Results</p>
              </div>
              <p className="text-xs text-gray-400">LCM</p>
            </div>

            <div className="space-y-2 text-sm">
              <ResultRow place="1" name="Chloe Lim" time="1:16.20" muted />
              <ResultRow place="2" name={swimmer.name} time={result ? formatMs(result.time_ms) : "1:18.30"} highlight />
              <ResultRow place="3" name="Ava Wong" time="1:19.05" muted />
              <ResultRow place="4" name="Natalie Teo" time="1:20.41" muted />
            </div>
          </div>
        </div>

        {stage === "ready" && (
          <button type="button" onClick={runDemoScan}
            className="w-full rounded-2xl py-4 text-sm font-bold text-white transition active:scale-[0.99]"
            style={{ background: "#D97706", boxShadow: "0 10px 30px rgba(217,119,6,0.18)" }}>
            Scan this sample result
          </button>
        )}

        {stage === "scanning" && (
          <div className="rounded-3xl p-6 text-center"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
              style={{ background: "rgba(217,119,6,0.15)", border: "1px solid rgba(253,230,138,0.2)" }}>
              🔎
            </div>
            <p className="text-sm font-semibold text-white">Reading result…</p>
            <p className="mt-1 text-xs text-white/40">Finding swimmer, event, time, placing and meet.</p>
            <div className="mx-auto mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 rounded-full" style={{ background: "#D97706", animation: "pulse 0.7s ease-in-out infinite alternate" }} />
            </div>
          </div>
        )}

        {stage === "result" && result && (
          <div className="space-y-3">
            <div className="rounded-3xl p-5"
              style={{ background: "rgba(110,231,183,0.08)", border: "1px solid rgba(110,231,183,0.22)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6EE7B7" }}>
                    Result recognised
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-white">{swimmer.name}</h2>
                  <p className="mt-0.5 text-sm text-white/45">{result.event} · {result.course}</p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                  style={{ background: "rgba(110,231,183,0.15)", color: "#6EE7B7" }}>
                  99% match
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric label="Time" value={formatMs(result.time_ms)} />
                <Metric label="Place" value={result.place ? `#${result.place}` : "—"} />
                <Metric label="Meet" value={result.meet_name} small />
                <Metric label="Date" value={formatDate(result.swam_at)} small />
              </div>

              <div className="mt-4 flex items-center gap-2">
                {result.is_pb && (
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{ background: "rgba(217,119,6,0.18)", color: "#FDE68A" }}>
                    PERSONAL BEST
                  </span>
                )}
                <span className="text-xs text-white/35">Ready to add to swimmer history</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={openShareCard}
                className="rounded-2xl py-3.5 text-sm font-bold text-white"
                style={{ background: "#D97706" }}>
                Share result
              </button>
              <Link href={`/demo/swimmers/${swimmer.id}`}
                className="rounded-2xl py-3.5 text-center text-sm font-semibold text-white/80"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                View profile
              </Link>
            </div>

            <button type="button" onClick={() => setStage("ready")}
              className="w-full py-2 text-xs font-semibold text-white/35">
              Reset demo
            </button>
          </div>
        )}
      </div>

      {shareResult && <ShareCardModal result={shareResult} onClose={() => setShareResult(null)} />}
    </div>
  );
}

function ResultRow({ place, name, time, highlight, muted }: {
  place: string;
  name: string;
  time: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-xl px-3 py-2.5"
      style={{
        background: highlight ? "#FFF7E6" : "transparent",
        border: highlight ? "1px solid #F5C26B" : "1px solid transparent",
        opacity: muted ? 0.58 : 1,
      }}>
      <span className="font-semibold text-gray-500">{place}</span>
      <span className="font-semibold">{name}</span>
      <span className="font-bold tabular-nums">{time}</span>
    </div>
  );
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl p-3"
      style={{ background: "rgba(0,0,0,0.12)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</p>
      <p className={`${small ? "text-xs" : "text-lg"} mt-1 font-bold text-white`}>{value}</p>
    </div>
  );
}
