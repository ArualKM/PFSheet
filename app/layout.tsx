import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";

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
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // iOS home-screen icon — needs a real PNG (it ignores SVG); full-bleed since iOS masks corners.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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

// Applies a stored motion preference before first paint so an explicit "Off" never flashes an
// animation. The SSR default is data-motion="system" (plays, but OS reduce-motion wins); this only
// overrides to "full" or "off". Mirrors the next-themes no-flash pattern (CSP allows inline script).
const MOTION_INIT = `try{var m=localStorage.getItem('pf-motion');if(m==='full'||m==='off'){document.documentElement.dataset.motion=m}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} obsidian h-full`}
      data-motion="system"
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">
        <script dangerouslySetInnerHTML={{ __html: MOTION_INIT }} />
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
