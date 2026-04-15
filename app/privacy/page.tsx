"use client";

import { useRouter } from "next/navigation";

const LAST_UPDATED = "15 April 2026";
const CONTACT_EMAIL = "JustanOrdinarydad@gmail.com";
const APP_NAME = "Natrix";
const DEVELOPER = "J.O.D — Just an Ordinary Dad";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen px-5 py-10 max-w-lg mx-auto">

      {/* Header */}
      <div className="mb-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/40 transition hover:text-white/70"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>
          {APP_NAME}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-white/40">Last updated {LAST_UPDATED}</p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-white/65">

        {/* Intro */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p>
            {APP_NAME} is built by <span className="text-white/85 font-medium">{DEVELOPER}</span> — a swim parent, just like you.
            This policy explains what data the app collects, how it's used, and what rights you have over your information.
            We believe in plain language, so there's no legal jargon here.
          </p>
        </div>

        {/* Section */}
        <Section title="What data we collect">
          <p>When you use {APP_NAME}, we collect the following:</p>
          <ul className="mt-3 space-y-2">
            {[
              { label: "Account information", desc: "Your email address and password, used to create and secure your account." },
              { label: "Swimmer profiles", desc: "Names, ages, gender, swim club, and school for swimmers you add or follow." },
              { label: "Swim results", desc: "Times, events, courses, meet names, dates, and places that you scan or import." },
              { label: "Standards data", desc: "Qualifying time targets you load or create within the app." },
              { label: "App usage", desc: "Basic session information to keep you signed in securely." },
            ].map((item) => (
              <li key={item.label} className="flex gap-2">
                <span className="mt-0.5 flex-shrink-0" style={{ color: "#FDE68A" }}>·</span>
                <span><span className="text-white/85 font-medium">{item.label}</span> — {item.desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-white/40 text-xs">
            We do not collect location data, contacts, camera roll access, or any device information beyond what is needed for the app to function.
          </p>
        </Section>

        <Section title="How we use your data">
          <p>Your data is used exclusively to power the {APP_NAME} app. Specifically:</p>
          <ul className="mt-3 space-y-2">
            {[
              "To display swimmer profiles, times, and progress charts",
              "To compare times across swimmers you follow",
              "To calculate qualifying standards progress",
              "To keep your account secure and your session active",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-0.5 flex-shrink-0" style={{ color: "#6EE7B7" }}>✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="What we never do">
          <ul className="space-y-2">
            {[
              "Sell your data to any third party — ever",
              "Share your data with advertisers or marketing platforms",
              "Use your data to train AI models",
              "Share individual swimmer information with other users without your action",
              "Send you unsolicited marketing emails",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-0.5 flex-shrink-0 text-red-300">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Where your data is stored">
          <p>
            All data is stored securely using <span className="text-white/85 font-medium">Supabase</span>, a trusted database platform.
            Your data is stored in the <span className="text-white/85 font-medium">Singapore (ap-southeast-1)</span> region,
            keeping it close to home and subject to Singapore's data protection laws (PDPA).
          </p>
          <p className="mt-3">
            Supabase uses industry-standard encryption for data at rest and in transit (TLS/SSL).
            Your password is never stored in plain text.
          </p>
        </Section>

        <Section title="Your rights">
          <p>You are in full control of your data. You can:</p>
          <ul className="mt-3 space-y-2">
            {[
              { action: "Delete your account", desc: "Go to Settings → Delete account. This permanently removes all your data from our servers within 30 days." },
              { action: "Export your data", desc: `Email us at ${CONTACT_EMAIL} and we will provide a copy of your data within 14 days.` },
              { action: "Correct your data", desc: "Edit swimmer profiles, times, and account details directly within the app at any time." },
              { action: "Withdraw consent", desc: "Stop using the app and delete your account at any time — no questions asked." },
            ].map((item) => (
              <li key={item.action} className="flex gap-2">
                <span className="mt-0.5 flex-shrink-0" style={{ color: "#FDE68A" }}>·</span>
                <span><span className="text-white/85 font-medium">{item.action}</span> — {item.desc}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Children's privacy">
          <p>
            {APP_NAME} is designed for parents and guardians to track their children's swim results.
            We do not knowingly collect data directly from children under 13.
            All accounts must be created by a parent or guardian aged 18 or over.
          </p>
          <p className="mt-3">
            Swimmer profiles (which may include a child's name and age) are created by the parent
            and are only visible to the account holder — they are never public or shared with other users
            unless the parent explicitly follows another swimmer.
          </p>
        </Section>

        <Section title="Third-party services">
          <p>
            {APP_NAME} uses the following third-party services to operate:
          </p>
          <ul className="mt-3 space-y-2">
            {[
              { name: "Supabase", desc: "Database and authentication. Privacy policy at supabase.com/privacy" },
              { name: "Vercel", desc: "App hosting and delivery. Privacy policy at vercel.com/legal/privacy-policy" },
            ].map((item) => (
              <li key={item.name} className="flex gap-2">
                <span className="mt-0.5 flex-shrink-0" style={{ color: "#FDE68A" }}>·</span>
                <span><span className="text-white/85 font-medium">{item.name}</span> — {item.desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            We do not use Google Analytics, Facebook Pixel, or any advertising tracking tools.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we make material changes to this policy, we will notify you via the app or by email
            before the changes take effect. Continued use of the app after changes means you accept the updated policy.
          </p>
        </Section>

        {/* Contact */}
        <div className="rounded-3xl p-5 space-y-2" style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(253,230,138,0.2)" }}>
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "#BA7517" }}>Questions?</p>
          <p className="text-white/65">
            If you have any questions about this privacy policy or how your data is handled, reach out directly:
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-block mt-1 font-medium transition hover:opacity-80"
            style={{ color: "#FDE68A" }}
          >
            {CONTACT_EMAIL}
          </a>
          <p className="text-xs text-white/35 pt-2">
            {DEVELOPER} · {APP_NAME} · Singapore
          </p>
        </div>

      </div>

      <div className="h-12" />
    </div>
  );
}

// ─── Section component ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-2">
      <h2 className="text-base font-bold text-white mb-3">{title}</h2>
      {children}
    </div>
  );
}