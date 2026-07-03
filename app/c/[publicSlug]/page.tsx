import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { CharacterDashboard } from "@/components/character/character-dashboard";
import { ClassicSheet } from "@/components/character/classic-sheet";
import { SheetViewSwitch } from "@/components/character/sheet-view-switch";
import { Button } from "@/components/ui/button";

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

  // Build the public view-model so the OG image only ever uses a portrait the owner
  // actually made public (a gated/private portrait resolves to null and is omitted).
  let portraitUrl: string | null = null;
  let classLine = "a Pathfinder 1e character";
  const parsed = safeParseCharacter(data.sheet_data);
  if (parsed.ok) {
    const vm = buildCharacterViewModel(
      parsed.character,
      computeCharacter(parsed.character),
      "public",
      data.visibility,
    );
    portraitUrl = vm.header.portraitUrl ?? null;
    if (vm.header.classLine) classLine = vm.header.classLine;
  }
  const description = `${classLine} — built on PathForge.`;

  return {
    title: data.name,
    description,
    openGraph: {
      title: data.name,
      description,
      type: "profile",
      images: portraitUrl ? [{ url: portraitUrl }] : undefined,
    },
    twitter: {
      card: portraitUrl ? "summary_large_image" : "summary",
      title: data.name,
      description,
      images: portraitUrl ? [portraitUrl] : undefined,
    },
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
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="font-display text-lg font-semibold text-gold">
          PathForge
        </Link>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Public character sheet
        </span>
      </header>

      <SheetViewSwitch
        characterId={data.id}
        modern={<CharacterDashboard vm={vm} />}
        classic={<ClassicSheet vm={vm} />}
      />

      <footer className="mt-10 border-t border-border/60 pt-6 text-center">
        <p className="text-sm text-muted-foreground">
          Build, compute, and share your own Pathfinder 1e characters — free.
        </p>
        <Button asChild size="lg" className="mt-3">
          <Link href="/signup">Create your character</Link>
        </Button>
      </footer>
    </div>
  );
}
