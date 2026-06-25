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
    // Baseline security headers. A full CSP is added in the security-hardening
    // milestone; the public embed route opts out of frame restrictions separately.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
