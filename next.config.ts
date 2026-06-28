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
    // Content-Security-Policy. Shipped REPORT-ONLY first (it cannot break the app) so violations can
    // be observed in the browser console across the authed surfaces before promoting to enforcing —
    // flip the header key to "Content-Security-Policy" once clean. 'unsafe-inline' is required for
    // Next's inline bootstrap + next/font + the few inline styles (GameIcon mask / global-error);
    // img-src allows arbitrary https because portraits are user-supplied URLs; connect-src allows the
    // Supabase host over https + wss (auth/db/realtime).
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
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
