import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readWizardMeta } from "@pathforge/schema";
import { loadCharacterForEdit } from "@/lib/character/load-for-edit";
import { CharacterWizard } from "@/components/character/wizard/character-wizard";
import { reopenWizardAction } from "@/lib/actions/characters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Create your character" };

/**
 * S6 Pillar 3 (`docs/S6_UX_OVERHAUL/03_CHARACTER_WIZARD.md` §4.1) — the guided create-a-character
 * flow. Loads exactly like `edit/page.tsx` (shared `loadCharacterForEdit`), then hands off to
 * `<CharacterWizard>`, which owns its own `useCharacterEditor` session — the SAME hook/contract the
 * full editor uses, so nothing is re-loaded or re-saved specially at handoff.
 *
 * 2026-07-11 follow-up — reopening: the wizard used to redirect straight to `/edit` whenever
 * `metadata.custom.wizard` was missing/inactive, which made this URL a dead end once a character
 * finished (or skipped) guided setup — there was no way back in. Now an inactive/absent meta renders
 * a small interstitial instead of redirecting: it explains itself either way (a brand-new character
 * that never touched the wizard, or a finished one), and posting `reopenWizardAction` is the single
 * canonical way back to guided setup — see the CLAUDE.md status note for why no other entry point
 * was added. An unparseable sheet still redirects straight to `/edit` (nothing safe to render here).
 */
export default async function CharacterWizardPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  const { result, sheetVersion } = await loadCharacterForEdit(characterId);

  if (!result.ok) {
    redirect(`/characters/${characterId}/edit`);
  }

  if (!readWizardMeta(result.character)?.active) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CardTitle className="text-lg">Guided setup is closed for this character</CardTitle>
            <CardDescription>
              You can reopen the guided wizard and pick up where it left off, or keep using the full
              editor.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <form action={reopenWizardAction.bind(null, characterId)} className="w-full">
              <Button type="submit" className="w-full">
                Reopen guided setup
              </Button>
            </form>
            <Button asChild variant="ghost">
              <Link href={`/characters/${characterId}/edit`}>Back to the editor</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <CharacterWizard
      characterId={characterId}
      initial={result.character}
      initialVersion={sheetVersion}
    />
  );
}
