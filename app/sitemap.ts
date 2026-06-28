import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.pfsheet.org").replace(/\/+$/, "");

// Cap the dynamic section so a large library can't blow past the 50k-URL sitemap limit.
const MAX_SHARED = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/developers`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Public (indexable) shared characters only — unlisted (link-only) and private are excluded.
  let shared: MetadataRoute.Sitemap = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("characters")
      .select("public_slug, updated_at")
      .eq("visibility", "public")
      .not("public_slug", "is", null)
      .order("updated_at", { ascending: false })
      .limit(MAX_SHARED);
    if (data) {
      shared = data
        .filter((r): r is { public_slug: string; updated_at: string | null } => Boolean(r.public_slug))
        .map((r) => ({
          url: `${baseUrl}/c/${r.public_slug}`,
          lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
          changeFrequency: "weekly" as const,
          priority: 0.5,
        }));
    }
  } catch {
    // If the DB is unreachable, still serve the static routes rather than failing the whole sitemap.
  }

  return [...staticRoutes, ...shared];
}
