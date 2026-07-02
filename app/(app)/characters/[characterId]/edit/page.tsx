import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { buildMasterCache, masterCacheEquals } from "@/lib/character/companion-sync";
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
    .select("id, name, sheet_data, sheet_version, parent_character_id")
    .eq("id", characterId)
    .single();
  if (error || !data) notFound();

  const result = safeParseCharacter(data.sheet_data);
  let sheetVersion = data.sheet_version;

  // Master-linked familiar: refresh the cached master stats on load, so opening it right after
  // leveling the master shows current numbers even if the master's last save predates the sync
  // hook. The persist is a COMPARE-AND-SWAP on the version we just read — a save landing from
  // another tab between our read and write must not be wholesale overwritten. On a CAS miss the
  // refreshed cache is applied to the editor's initial state ONLY (not persisted, and the fresh
  // row version is used) — the next save carries it via the normal CAS path.
  if (
    result.ok &&
    result.character.companion?.syncEnabled &&
    result.character.companion.type === "familiar" &&
    data.parent_character_id
  ) {
    const { data: master } = await supabase
      .from("characters")
      .select("id, sheet_data")
      .eq("id", data.parent_character_id)
      .maybeSingle();
    const masterParsed = master ? safeParseCharacter(master.sheet_data) : null;
    if (master && masterParsed?.ok) {
      const cache = buildMasterCache(master.id, masterParsed.character, computeCharacter(masterParsed.character));
      if (!masterCacheEquals(result.character.companion.master, cache)) {
        result.character.companion.master = cache;
        const computed = computeCharacter(result.character);
        const { data: updated } = await supabase
          .from("characters")
          .update({
            sheet_data: result.character as never,
            computed_summary: computed.summary as never,
            last_calculated_at: new Date().toISOString(),
          })
          .eq("id", characterId)
          .eq("sheet_version", data.sheet_version)
          .select("sheet_version")
          .maybeSingle();
        if (updated) {
          sheetVersion = updated.sheet_version;
        } else {
          // Concurrent save won the race — re-read the row so the editor starts from THAT sheet
          // (not our stale copy) and re-apply the cache refresh in memory only; the next save
          // persists it via the normal CAS path.
          const { data: current } = await supabase
            .from("characters")
            .select("sheet_data, sheet_version")
            .eq("id", characterId)
            .maybeSingle();
          if (current) {
            const reparsed = safeParseCharacter(current.sheet_data);
            if (reparsed.ok) {
              if (reparsed.character.companion) reparsed.character.companion.master = cache;
              result.character = reparsed.character;
            }
            sheetVersion = current.sheet_version;
          }
        }
      }
    }
  }

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
        <CharacterEditor
          characterId={characterId}
          initial={result.character}
          initialVersion={sheetVersion}
        />
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
