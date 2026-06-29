import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Workspace packages ship TypeScript source and are compiled by Next.
  transpilePackages: [
    "@pathforge/schema",
    "@pathforge/rules-pf1e",
    "@pathforge/importers",
    "@pathforge/exporters",
  ],

  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/**" }]
        : []),
    ],
  },

  async headers() {
    // Content-Security-Policy. ENFORCED in production; kept Report-Only in development so Next's
    // dev-mode HMR / React Fast Refresh (which relies on eval) isn't blocked by script-src — the
    // directive string is identical either way, so prod enforces exactly what dev reports.
    // A grounded codebase audit confirmed every directive below is sufficient as-is: 'unsafe-inline'
    // is required for Next's inline bootstrap/RSC flight scripts + next/font + the inline styles
    // (GameIcon mask / global-error); 'unsafe-eval' is NOT needed in prod (the formula engine is
    // parser-based; no eval/new Function/Wasm anywhere). img-src allows arbitrary https because
    // portraits are user-supplied URLs rendered by a plain <img>; connect-src allows the Supabase
    // host over https + wss (auth/db/realtime) — the only external client egress (no telemetry SDK).
    // frame-ancestors stays 'self': Discord unfurls links by scraping OG meta tags server-side, it
    // never iframes the page, so a "Discord embed" carve-out would do nothing but weaken clickjacking
    // protection — deliberately omitted.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ""}`,
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "worker-src 'self'",
      "manifest-src 'self'",
    ].join("; ");

    const cspHeaderKey =
      process.env.NODE_ENV === "production"
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only";

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          { key: cspHeaderKey, value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
