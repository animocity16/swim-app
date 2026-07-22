"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ScanRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/scan/meetmobile");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-xs text-white/40">Loading scan…</p>
    </div>
  );
}