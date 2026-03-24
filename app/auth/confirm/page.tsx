"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AuthConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleAuth() {
      await supabase.auth.getSession();
      router.replace("/swimmers");
    }

    handleAuth();
  }, [router]);

  return <div style={{ padding: 20 }}>Logging you in...</div>;
}