import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { safeParseCharacter } from "@pathforge/schema";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell/app-shell";
import { CharacterEditor } from "@/components/character/editor/character-editor";

export const metadata: Metadata = { title: "Edit character" };

export default async function EditCharacterPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("characters")
    .select("id, name, sheet_data")
    .eq("id", characterId)
    .single();
  if (error || !data) notFound();

  const result = safeParseCharacter(data.sheet_data);

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href={`/characters/${characterId}`}>
          <ArrowLeft className="size-4" /> Back to overview
        </Link>
      </Button>
      <PageHeader
        title={`Editing ${data.name}`}
        description="Changes autosave. Values recalculate as you type."
      />

      {result.ok ? (
        <CharacterEditor characterId={characterId} initial={result.character} />
      ) : (
        <Card className="border-dashed">
          <CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">
            This sheet&rsquo;s data doesn&rsquo;t match the current schema, so it can&rsquo;t be
            edited yet. It may need migration.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
