import type { Metadata, Viewport } from "next";
import { Bitcount_Grid_Double, Geist_Mono, LINE_Seed_JP } from "next/font/google";
import "./globals.css";

const lineSeed = LINE_Seed_JP({
  variable: "--font-line-seed",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const bitcount = Bitcount_Grid_Double({
  variable: "--font-bitcount",
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
      className={`${lineSeed.variable} ${bitcount.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
