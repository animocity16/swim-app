// app/demo/layout.tsx
import type { Metadata } from "next";
import DemoBanner from "./DemoBanner";

// Overrides the root layout's manifest (which points at /dashboard) for
// everything under /demo/*. Without this, a home-screen icon added while
// browsing the demo would still launch into the real, login-gated app,
// because iOS reads start_url from whichever manifest is linked on the
// page — and the root manifest's start_url is "/dashboard".
export const metadata: Metadata = {
  title: "Natrix Demo",
  manifest: "/demo-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Natrix Demo",
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <DemoBanner />
      {children}
    </div>
  );
}
