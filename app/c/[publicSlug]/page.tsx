import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { CharacterDashboard } from "@/components/character/character-dashboard";

export const dynamic = "force-dynamic";

/**
 * Public share view. Resolves a character by its public slug using the trusted
 * admin client (so unlisted, link-only sheets are reachable without exposing
 * the row via anon RLS), then renders ONLY the privacy-filtered public view
 * model — private notes, GM secrets, and owner-restricted sections never leave
 * the server. Per spec §5.3.
 */
async function loadShared(slug: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("characters")
    .select("id, name, visibility, sheet_data")
    .eq("public_slug", slug)
    .in("visibility", ["public", "unlisted"])
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}): Promise<Metadata> {
  const { publicSlug } = await params;
  const data = await loadShared(publicSlug);
  if (!data) return { title: "Character not found" };
  return {
    title: data.name,
    description: `${data.name} — a Pathfinder 1e character on PathForge.`,
    openGraph: { title: data.name, type: "profile" },
  };
}

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}) {
  const { publicSlug } = await params;
  const data = await loadShared(publicSlug);
  if (!data) notFound();

  const result = safeParseCharacter(data.sheet_data);
  if (!result.ok) notFound();

  const computed = computeCharacter(result.character);
  const vm = buildCharacterViewModel(result.character, computed, "public", data.visibility);

  return (
    <div className="mx-auto max-w-5xl">
      <CharacterDashboard vm={vm} />
    </div>
  );
}
