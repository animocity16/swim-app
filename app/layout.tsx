import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/app/components/BottomNav";
import TutorialOverlay from "@/app/components/TutorialOverlay";

export const metadata: Metadata = {
  title: "Natrix",
  description: "Swim progress tracking app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Water ripple overlay — sits behind all content */}
        <div className="water-ripple" aria-hidden="true" />

        <div className="min-h-screen pb-24" style={{ position: "relative", zIndex: 1 }}>
          {children}
        </div>

        <BottomNav />

        {/* ✅ Tutorial — shows on first login, replay from Settings */}
        <TutorialOverlay />
      </body>
    </html>
  );
}