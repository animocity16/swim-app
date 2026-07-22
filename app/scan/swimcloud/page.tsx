"use client";

import { useRouter } from "next/navigation";

export default function SwimCloudScanPage() {
  const router = useRouter();

  return (
    <div className="shell">
      <div className="container-app space-y-5">
        <div className="pt-2">
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
            SwimScan
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">SwimCloud scan</h1>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center space-y-3">
          <div style={{ fontSize: "32px" }}>🏗️</div>
          <p className="text-base font-semibold text-white">Coming soon</p>
          <p className="text-sm text-white/40">
            SwimCloud scanning is in the works — for now, use Meet Mobile screenshots to add results.
          </p>
          <button
            type="button"
            onClick={() => router.push("/scan/meetmobile")}
            className="mt-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: "#D97706" }}
          >
            Go to Meet Mobile scan
          </button>
        </div>
      </div>
    </div>
  );
}