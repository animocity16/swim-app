// app/demo/swimmers/[id]/page.tsx
//
// Demo swimmer profile. Uses the same five tab components as the live app
// (Results, Progress, Standards, Diary, Zones) but feeds them the fictional
// swimmers from lib/demoData.ts as static data. In this mode the real tabs never
// contact Supabase and cannot write anything.
//
// Everything on this page links only to other /demo routes. There is deliberately
// no Edit button, photo upload or link into the live app's swimmer routes.
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getDemoSwimmerById, getInitials } from "@/lib/demoData";
import SwimTimesSection from "@/app/swimmers/[id]/SwimTimesSection";
import ProgressTab from "@/app/swimmers/[id]/ProgressTab";
import StandardsTab from "@/app/swimmers/[id]/StandardsTab";
import ZonesTab from "@/app/swimmers/[id]/ZonesTab";
import DemoDiaryPreview from "../../DemoDiaryPreview";
import { demoSplitRows, demoStandards, demoTimeRows } from "../../demoProfileAdapters";

type Tab = "times" | "progress" | "standards" | "diary" | "zones";

const TABS: Tab[] = ["times", "progress", "standards", "diary", "zones"];

const TAB_LABELS: Record<Tab, string> = {
  times: "Results",
  progress: "Progress",
  standards: "Standards",
  diary: "Diary",
  zones: "Zones",
};

const AVATAR_COLORS = [
  { bg: "#0F6E56", text: "#9FE1CB" },
  { bg: "#185FA5", text: "#B5D4F4" },
  { bg: "#854F0B", text: "#FAC775" },
  { bg: "#72243E", text: "#F4C0D1" },
  { bg: "#3C3489", text: "#CECBF6" },
];

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

export default function DemoSwimmerProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const rawId = params?.id;
  const swimmerId = typeof rawId === "string" ? Number(rawId) : Array.isArray(rawId) ? Number(rawId[0]) : null;

  const requestedTab = searchParams?.get("tab");
  const initialTab: Tab = TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "times";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const swimmer = swimmerId != null ? getDemoSwimmerById(swimmerId) : undefined;

  // Static data handed to the real tabs. Built once per swimmer so the tabs
  // receive stable references.
  const data = useMemo(() => {
    if (!swimmer) return null;
    const { sets, items } = demoStandards(swimmer);
    return {
      timesNewest: demoTimeRows(swimmer.id, "newest"),
      timesOldest: demoTimeRows(swimmer.id, "oldest"),
      splits: demoSplitRows(swimmer.id),
      sets,
      items,
    };
  }, [swimmer]);

  if (!swimmer || !data) {
    return (
      <div className="shell">
        <div className="container-app space-y-5">
          <Link href="/demo/swimmers" className="flex items-center gap-2 pt-2 text-sm text-white/50">
            ← Swimmers
          </Link>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-lg font-semibold text-white">Swimmer not found</p>
          </div>
        </div>
      </div>
    );
  }

  const colors = avatarColor(swimmer.id);
  const isPrimary = swimmer.group_type === "primary";
  const avatarBg = isPrimary ? "var(--natrix-avatar-colour, " + colors.bg + ")" : colors.bg;
  const avatarText = isPrimary ? "var(--natrix-avatar-text, " + colors.text + ")" : colors.text;

  return (
    <div className="shell">
      <div className="container-app space-y-5 pb-28 md:max-w-2xl">

        {/* Top bar */}
        <div className="flex items-center justify-between pt-2">
          <Link
            href="/demo/swimmers"
            className="flex items-center gap-2 text-sm font-medium text-white/55 transition hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Swimmers
          </Link>
        </div>

        {/* Profile hero */}
        <section
          className="relative overflow-hidden rounded-[30px]"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.99) 0%, rgba(226,243,255,0.98) 100%)",
            border: "1px solid rgba(255,255,255,0.92)",
            boxShadow: "0 18px 42px rgba(0,25,55,0.16)",
          }}
        >
          <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full" style={{ background: "rgba(48,158,246,0.08)" }} />
          <div className="absolute right-16 top-20 h-20 w-44 rotate-[-8deg] rounded-full" style={{ background: "rgba(48,158,246,0.05)" }} />

          <div className="relative p-5">
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-black"
                  style={{
                    background: avatarBg,
                    color: avatarText,
                    border: "4px solid rgba(255,255,255,0.92)",
                    boxShadow: "0 10px 24px rgba(11,42,84,0.18)",
                  }}
                >
                  {getInitials(swimmer.name)}
                </div>
              </div>

              <div className="min-w-0 flex-1 pt-1">
                <div className="text-[0.5625rem] font-black uppercase tracking-[0.18em]" style={{ color: "var(--natrix-font-colour, #168AE8)" }}>
                  Swimmer profile
                </div>
                <h1 className="mt-1 truncate text-2xl font-black tracking-tight" style={{ color: "#0B2A54" }}>
                  {swimmer.name}
                </h1>
                <p className="mt-1 text-sm" style={{ color: "#60758B" }}>
                  Age {swimmer.age} · {swimmer.gender}
                </p>
                <p className="mt-1 truncate text-sm font-medium" style={{ color: "#416889" }}>
                  {swimmer.swim_club}
                </p>
                <p className="mt-0.5 truncate text-xs" style={{ color: "#7B90A3" }}>
                  {swimmer.school}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {isPrimary && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[0.625rem] font-bold"
                  style={{ background: "#E6F3FC", border: "1px solid #C8E2F5", color: "#185FA5" }}
                >
                  My Swimmer
                </span>
              )}
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-[0.625rem] font-bold"
                style={{ background: "#F3F8FC", border: "1px solid #DCE8F1", color: "#60758B" }}
              >
                {swimmer.squad} Squad
              </span>
              {!isPrimary && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[0.625rem] font-bold"
                  style={{ background: "#EEF8FD", border: "1px solid #D3ECF8", color: "#1685B6" }}
                >
                  Following
                </span>
              )}
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-[0.625rem] font-bold"
                style={{ background: "#FFF6E5", border: "1px solid #F5DFAE", color: "#9A6A0B" }}
              >
                Fictional demo swimmer
              </span>
            </div>
          </div>
        </section>

        {/* Profile navigation */}
        <div>
          <p className="mb-2 px-1 text-[0.625rem] font-bold uppercase tracking-[0.18em] text-white/40">
            Performance
          </p>
          <div
            className="grid grid-cols-5 gap-1 rounded-[22px] p-1.5"
            style={{
              background: "rgba(6,31,66,0.72)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
            }}
          >
            {TABS.map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className="min-w-0 rounded-[16px] px-1 py-2.5 text-center text-[0.6875rem] font-bold tracking-tight transition"
                  style={
                    active
                      ? { background: "linear-gradient(135deg,#FFFFFF,#E8F5FD)", color: "#0B2A54", boxShadow: "0 6px 14px rgba(0,0,0,0.12)" }
                      : { color: "rgba(255,255,255,0.48)", background: "transparent" }
                  }
                >
                  {TAB_LABELS[tab]}
                </button>
              );
            })}
          </div>
        </div>

        {/* The same tab components as the live app, fed static demo data.
            key={swimmer.id} remounts them when the swimmer changes. */}
        <section className="space-y-4" key={swimmer.id}>
          {activeTab === "times" && (
            <SwimTimesSection
              swimmerId={swimmer.id}
              swimmerAge={swimmer.age}
              swimmerName={swimmer.name}
              staticRows={data.timesNewest}
              staticSplits={data.splits}
            />
          )}

          {activeTab === "progress" && (
            <ProgressTab swimmerId={swimmer.id} swimmerName={swimmer.name} staticRows={data.timesOldest} />
          )}

          {activeTab === "standards" && (
            <StandardsTab
              swimmerId={swimmer.id}
              swimmerAge={swimmer.age}
              swimmerGender={swimmer.gender}
              swimmerSquad={swimmer.squad}
              staticTimes={data.timesNewest}
              staticSets={data.sets}
              staticItems={data.items}
            />
          )}

          {activeTab === "diary" && <DemoDiaryPreview swimmerName={swimmer.name} />}

          {activeTab === "zones" && (
            <ZonesTab swimmerId={swimmer.id} swimmerName={swimmer.name} staticRows={data.timesNewest} />
          )}
        </section>

        <div className="h-4" />
      </div>
    </div>
  );
}
