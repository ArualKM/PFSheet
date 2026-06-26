import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "@/components/character/import/import-wizard";

export const metadata: Metadata = { title: "Import into character" };

export default async function CharacterImportPage({
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

  // Merging replaces the sheet, so require edit rights (owner or editor/co_owner).
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

  const { data: mine } = await supabase
    .from("characters")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("is_archived", false)
    .order("name");

  // Ensure the merge target itself is an option (an editor collaborator's target
  // isn't among their own characters), so the dropdown can't silently retarget.
  const mineList = mine ?? [];
  const characters = mineList.some((c) => c.id === characterId)
    ? mineList
    : [{ id: characterId, name: character.name }, ...mineList];

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href={`/characters/${characterId}`}>
          <ArrowLeft className="size-4" /> {character.name}
        </Link>
      </Button>
      <PageHeader
        title={`Import into ${character.name}`}
        description="Replace this character's sheet with an imported one. The current version is snapshotted first, so it's reversible from History."
      />
      <ImportWizard characters={characters} defaultMergeId={characterId} />
    </div>
  );
}
