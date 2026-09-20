import type { Metadata } from "next";
import { Alegreya, Alegreya_Sans, Cinzel } from "next/font/google";

import AuthProvider from "@/components/AuthProvider";
import "leaflet/dist/leaflet.css";
import "./globals.css";

// "Ciudad Latina" theme fonts (see .claude/learnings.md for why these
// three, replacing the earlier Compass Rose font set). Alegreya is a
// Latin-American calligraphic serif by Huerta Tipografica (Argentina) --
// that lineage is the point of choosing it for Zamboanga's
// Spanish-colonial "Latin City" identity.
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});

const alegreya = Alegreya({
  variable: "--font-alegreya",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const alegreyaSans = Alegreya_Sans({
  variable: "--font-alegreya-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zpots",
  description: "Crowdsourced map of local spots in Zamboanga City",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${alegreya.variable} ${alegreyaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-ink font-body">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
