import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExportPanel } from "@/components/character/export-panel";

export const metadata: Metadata = { title: "Export character" };

export default async function CharacterExportPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: character } = await supabase
    .from("characters")
    .select("id, name, owner_id")
    .eq("id", characterId)
    .single();
  if (!character) notFound();

  // Full exports include private sections, so this is an owner/editor tool.
  let canEdit = character.owner_id === user.id;
  if (!canEdit) {
    const { data: collab } = await supabase
      .from("character_collaborators")
      .select("role")
      .eq("character_id", characterId)
      .eq("user_id", user.id)
      .maybeSingle();
    canEdit = collab?.role === "editor" || collab?.role === "co_owner";
  }
  if (!canEdit) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href={`/characters/${characterId}`}>
          <ArrowLeft className="size-4" /> {character.name}
        </Link>
      </Button>
      <PageHeader title={`Export ${character.name}`} description="Download this character in a portable format." />
      <Card>
        <CardContent className="p-5">
          <ExportPanel characterId={characterId} />
        </CardContent>
      </Card>
    </div>
  );
}
