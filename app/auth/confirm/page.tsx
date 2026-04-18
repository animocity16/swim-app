"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AuthConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleAuth() {
      const search = window.location.search;
      const hash = window.location.hash;

      if (search) {
        const params = new URLSearchParams(search);
        const type = params.get("type");
        const code = params.get("code");

        if (type === "recovery") {
          router.replace("/reset-password" + search);
          return;
        }

        if (code) {
          router.replace("/reset-password" + search);
          return;
        }
      }

      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1));
        if (hashParams.get("type") === "recovery") {
          router.replace("/reset-password" + hash);
          return;
        }
      }

      await supabase.auth.getSession();
      router.replace("/swimmers");
    }

    handleAuth();
  }, [router]);

  return <div style={{ padding: 20 }}>Logging you in...</div>;
}