"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import OnboardingFlow from "../components/OnboardingFlow";

export default function OnboardingPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    // If onboarding already complete skip to dashboard
    if (user.user_metadata?.onboarding_complete) {
      router.replace("/dashboard");
      return;
    }

    const meta = user.user_metadata;
    const displayName = meta?.full_name ?? meta?.name ?? user.email?.split("@")[0].split(".")[0] ?? "there";
    setUserName(displayName.split(" ")[0].charAt(0).toUpperCase() + displayName.split(" ")[0].slice(1));
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
      </div>
    );
  }

  return <OnboardingFlow userName={userName ?? "there"} />;
}