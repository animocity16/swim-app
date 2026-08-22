import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/app/components/BottomNav";
import TutorialOverlay from "@/app/components/TutorialOverlay";
import SplashScreen from "@/app/components/SplashScreen";
import ThemeProvider from "@/app/components/ThemeProvider";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Natrix — Swim Tracker",
  description: "Swim meet result tracker for parents. Scan, save and track your swimmer's PBs.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Natrix",
  },
  icons: {
    apple: [
      { url: "/icon-192.png", sizes: "192x192" },
      { url: "/icon-512.png", sizes: "512x512" },
    ],
  },
  openGraph: {
    title: "Natrix — Swim Tracker",
    description: "Scan Meet Mobile results and track your swimmer's PBs. Built for swim parents.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#063554",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // maximumScale and userScalable intentionally removed —
  // letting the phone's system text size setting work as expected.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* PWA — iPhone full screen, no browser bar */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Natrix" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* App icons for iOS home screen */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />
        <link rel="icon" type="image/svg+xml" href="/natrix-favicon.svg" />

        {/* Splash screen colour matches water background */}
        <meta name="msapplication-TileColor" content="#063554" />

        {/* Bebas Neue — splash screen hero font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* ✅ ThemeProvider — loads saved theme from Supabase on every app open */}
        <ThemeProvider />

        {/* Splash screen — cold launch only, skipped when returning from background */}
        <SplashScreen />

        {/* Water ripple overlay — sits behind all content */}
        <div className="water-ripple" aria-hidden="true" />

        <div className="min-h-screen pb-24" style={{ position: "relative", zIndex: 1 }}>
          {children}
        </div>

        <BottomNav />

        {/* Tutorial — shows on first login, replay from Settings */}
        <TutorialOverlay />

        {/* Vercel Web Analytics */}
        <Analytics />
      </body>
    </html>
  );
}