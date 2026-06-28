import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.pfsheet.org").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Authenticated app routes (redirect to /login for crawlers anyway) + the API + auth callbacks.
      disallow: ["/api/", "/dashboard", "/characters", "/campaigns", "/settings", "/spells", "/auth/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
