import type { Metadata, Viewport } from "next";
import { Cinzel, Figtree, Playfair_Display } from "next/font/google";
import "./globals.css";

const caps = Cinzel({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-caps" });
const display = Playfair_Display({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = { title: "Funeral cover", description: "Funeral cover sign-up and member portal" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`${caps.variable} ${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
