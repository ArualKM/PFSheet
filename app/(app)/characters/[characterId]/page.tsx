import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { CharacterDashboard } from "@/components/character/character-dashboard";
import { ShareControls } from "@/components/character/share-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Character" };

type Visibility = "private" | "campaign" | "unlisted" | "public";

export default async function CharacterOverviewPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("characters")
    .select("id, name, visibility, public_slug, sheet_data")
    .eq("id", characterId)
    .single();

  if (error || !data) notFound();

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href="/characters">
        <ArrowLeft className="size-4" /> All characters
      </Link>
    </Button>
  );

  const result = safeParseCharacter(data.sheet_data);
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-2xl">
        {backLink}
        <Card className="border-dashed">
          <CardContent className="px-6 py-12 text-center">
            <p className="mb-1 font-semibold text-foreground">This sheet couldn&rsquo;t be loaded</p>
            <p className="text-sm text-muted-foreground">
              Its data doesn&rsquo;t match the current character schema and may need migration.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const computed = computeCharacter(result.character);
  const vm = buildCharacterViewModel(result.character, computed, "owner", data.visibility);

  return (
    <div className="mx-auto max-w-5xl">
      {backLink}
      <CharacterDashboard
        vm={vm}
        actions={
          <>
            <ShareControls
              characterId={data.id}
              initialVisibility={data.visibility as Visibility}
              initialSlug={data.public_slug}
              appUrl={env.appUrl}
            />
            <Button asChild variant="ghost" size="sm">
              <Link href={`/characters/${characterId}/history`}>History</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/characters/${characterId}/edit`}>Edit</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
