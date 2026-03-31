import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swimio",
  description: "Swimmer tracking and progress app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}