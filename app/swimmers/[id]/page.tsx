"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import SwimTimesSection from "./SwimTimesSection";
import StandardsCompare from "./StandardsCompare";
import MeetMobileImport from "./MeetMobileImport";

type Swimmer = {
  id: number;
  name: string;
  age: number;
  created_at?: string | null;
};

type TabKey = "overview" | "times" | "standards" | "import";

function formatCreatedAt(value?: string | null) {
  if (!value) return "No date available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date available";
  return date.toLocaleString();
}

export default function SwimmerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const idStr = params?.id ?? "";
  const swimmerId = useMemo(() => {
    const n = Number(idStr);
    return Number.isFinite(n) ? n : null;
  }, [idStr]);

  const [loading, setLoading] = useState(true);
  const [swimmer, setSwimmer] = useState<Swimmer | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  function toggleTab(tab: TabKey) {
  setActiveTab((prev) => (prev === tab ? "overview" : tab));
}

  useEffect(() => {
    async function fetchSwimmer() {
      if (!swimmerId) {
        setLoading(false);
        setSwimmer(null);
        setErrorMsg("Invalid swimmer id.");
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from("swimmers")
        .select("id,name,age,created_at")
        .eq("id", swimmerId)
        .single();

      if (error) {
        setSwimmer(null);
        setErrorMsg(error.message);
      } else {
        setSwimmer(data as Swimmer);
      }

      setLoading(false);
    }

    fetchSwimmer();
  }, [swimmerId]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-gray-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <button
          onClick={() => router.back()}
          className="rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-gray-50"
        >
          ← Back to swimmers
        </button>

        <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-6 text-gray-600">Loading swimmer…</div>
          ) : errorMsg ? (
            <div className="p-6 text-red-600">
              <div className="text-lg font-semibold">
                Couldn&apos;t load swimmer ❌
              </div>
              <div className="mt-2">{errorMsg}</div>
              <div className="mt-2 text-sm text-gray-600">URL ID: {idStr}</div>
            </div>
          ) : !swimmer ? (
            <div className="p-6 text-gray-600">Swimmer not found 😅</div>
          ) : (
            <>
              <div className="bg-gradient-to-r from-sky-600 to-cyan-500 p-6 text-white">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-sm font-medium uppercase tracking-[0.2em] text-white/80">
                      Swimmer Profile
                    </div>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                      {swimmer.name}
                    </h1>
                    <p className="mt-2 text-base text-white/90">
                      Age {swimmer.age}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:w-[260px]">
                    <div className="rounded-2xl bg-white/15 p-3 backdrop-blur-sm">
                      <div className="text-xs uppercase tracking-wide text-white/75">
                        Swimmer ID
                      </div>
                      <div className="mt-1 text-lg font-bold">{swimmer.id}</div>
                    </div>

                    <div className="rounded-2xl bg-white/15 p-3 backdrop-blur-sm">
                      <div className="text-xs uppercase tracking-wide text-white/75">
                        Status
                      </div>
                      <div className="mt-1 text-lg font-bold">Active</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 border-t border-gray-200 p-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Age
                  </div>
                  <div className="mt-1 text-2xl font-bold text-gray-900">
                    {swimmer.age}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Added
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    {formatCreatedAt(swimmer.created_at)}
                  </div>
                </div>

                
              </div>
            </>
          )}
        </section>

        {!loading && !errorMsg && swimmerId && swimmer ? (
          <>
            <section className="rounded-3xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                <TabButton
                  label="Overview"
                  active={activeTab === "overview"}
                  onClick={() => toggleTab("overview")}
                />
                <TabButton
                  label="Swim Times"
                  active={activeTab === "times"}
                  onClick={() => toggleTab("times")}
                />
                <TabButton
                  label="Standards"
                  active={activeTab === "standards"}
                  onClick={() => toggleTab("standards")}
                />
                <TabButton
                  label="MeetMobile Import"
                  active={activeTab === "import"}
                  onClick={() => toggleTab("import")}
                />
              </div>
            </section>

            {activeTab === "overview" ? (
  <div className="grid gap-4 md:grid-cols-2">
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Swim Times</h2>
          <p className="mt-1 text-sm text-gray-500">
            View PBs and manage race times.
          </p>
        </div>

        <button
          type="button"
          onClick={() => toggleTab("times")}
          className="rounded-xl bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-200"
        >
          Open →
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <div className="text-sm font-medium text-gray-500">Quick note</div>
        <div className="mt-1 text-base font-semibold text-gray-900">
          Add or review this swimmer&apos;s best times here.
        </div>
      </div>
    </section>

    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Standards</h2>
          <p className="mt-1 text-sm text-gray-500">
            Check upgrading and SEA Age gaps.
          </p>
        </div>

        <button
          type="button"
          onClick={() => toggleTab("standards")}
          className="rounded-xl bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-200"
        >
          Open →
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <div className="text-sm font-medium text-gray-500">Quick note</div>
        <div className="mt-1 text-base font-semibold text-gray-900">
          Compare this swimmer against target qualifying times.
        </div>
      </div>
    </section>

    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm md:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">MeetMobile Import</h2>
          <p className="mt-1 text-sm text-gray-500">
            Import results from a screenshot.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab("import")}
          className="rounded-xl bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-200"
        >
          Open →
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <div className="text-sm font-medium text-gray-500">Quick note</div>
        <div className="mt-1 text-base font-semibold text-gray-900">
          Upload a MeetMobile screenshot and save the result to this swimmer.
        </div>
      </div>
    </section>
  </div>
) : null}

            {activeTab === "times" ? (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
  <div className="mb-4 flex items-start justify-between gap-3">
    <div>
      <h2 className="text-2xl font-bold text-gray-900">
        Swim Times
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Add, edit, and review race times for {swimmer.name}.
      </p>
    </div>

    <button
      type="button"
      onClick={() => setActiveTab("overview")}
      className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
    >
      Close ✕
    </button>
  </div>

  <SwimTimesSection swimmerId={swimmerId} />
</section>
            ) : null}

           {activeTab === "standards" ? (
  <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Standards Compare
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          See how close {swimmer.name} is to qualifying standards.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setActiveTab("overview")}
        className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
      >
        Close ✕
      </button>
    </div>

    <StandardsCompare
      swimmerId={swimmerId}
      swimmerAge={swimmer.age}
    />
  </section>
) : null}

            {activeTab === "import" ? (
  <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          MeetMobile Import
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload a screenshot and import results into this swimmer.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setActiveTab("overview")}
        className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
      >
        Close ✕
      </button>
    </div>

    <MeetMobileImport
      swimmerId={swimmerId}
      swimmerName={swimmer.name}
      clubHint=""
    />
  </section>
) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-sky-600 text-white shadow-sm"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}