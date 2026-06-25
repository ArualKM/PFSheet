import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "PathForge — Pathfinder 1e character command center",
    template: "%s · PathForge",
  },
  description:
    "Build, customize, share, and play Pathfinder 1e characters from any device. Formula-aware, GM-verifiable, mobile-first.",
  applicationName: "PathForge",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PathForge", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "PathForge",
    description: "The modern Pathfinder 1e character command center.",
    siteName: "PathForge",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090d12" },
    { media: "(prefers-color-scheme: light)", color: "#f1ead9" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} obsidian h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
