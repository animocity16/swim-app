"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AuthConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleAuth() {
      const hash = window.location.hash;
      const search = window.location.search;

      // ✅ Check hash params (implicit flow) — e.g. #access_token=...&type=recovery
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1));
        if (hashParams.get("type") === "recovery") {
          router.replace("/reset-password" + hash);
          return;
        }
      }

      // ✅ Check query params (PKCE flow) — e.g. ?type=recovery&token_hash=...
      if (search) {
        const queryParams = new URLSearchParams(search);
        if (queryParams.get("type") === "recovery") {
          router.replace("/reset-password" + search + hash);
          return;
        }
      }

      // Normal login confirmation — go to app
      await supabase.auth.getSession();
      router.replace("/swimmers");
    }

    handleAuth();
  }, [router]);

  return <div style={{ padding: 20 }}>Logging you in...</div>;
}