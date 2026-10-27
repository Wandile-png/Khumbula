import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Funeral cover", description: "Funeral cover sign-up and member portal" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Fonts load from Google Fonts in the browser, so the build never needs to download them.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Figtree:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
