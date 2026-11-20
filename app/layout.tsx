import type { Metadata, Viewport } from "next";
import { Geist_Mono, JetBrains_Mono, LINE_Seed_JP } from "next/font/google";
import "./globals.css";

const lineSeed = LINE_Seed_JP({
  variable: "--font-line-seed",
  weight: "700", // only the bold is used
  subsets: ["latin"],
  // LINE Seed JP is split into ~60 Japanese slices that Next cannot tell apart from latin, so preloading would fetch all of
  // them (about 2 MB). Without preload the browser fetches only the slices that contain the characters on the page.
  preload: false,
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guillermo Aliaga — Fullstack Developer",
  description: "Portfolio: web apps, Three.js demos and IoT projects.",
  openGraph: {
    title: "Guillermo Aliaga — Fullstack Developer",
    description: "Portfolio: web apps, Three.js demos and IoT projects.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${lineSeed.variable} ${jetbrains.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
