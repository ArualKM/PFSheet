import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readWizardMeta } from "@pathforge/schema";
import { loadCharacterForEdit } from "@/lib/character/load-for-edit";
import { CharacterWizard } from "@/components/character/wizard/character-wizard";

export const metadata: Metadata = { title: "Create your character" };

/**
 * S6 Pillar 3 (`docs/S6_UX_OVERHAUL/03_CHARACTER_WIZARD.md` §4.1) — the guided create-a-character
 * flow. Loads exactly like `edit/page.tsx` (shared `loadCharacterForEdit`), then hands off to
 * `<CharacterWizard>`, which owns its own `useCharacterEditor` session — the SAME hook/contract the
 * full editor uses, so nothing is re-loaded or re-saved specially at handoff.
 *
 * If the sheet's `metadata.custom.wizard` isn't active (never started, already finished, or someone
 * bookmarked this URL after finishing/skipping) we redirect server-side to the full editor instead
 * of mounting the wizard client component at all — per §4.1.
 */
export default async function CharacterWizardPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  const { result, sheetVersion } = await loadCharacterForEdit(characterId);

  if (!result.ok || !readWizardMeta(result.character)?.active) {
    redirect(`/characters/${characterId}/edit`);
  }

  return (
    <CharacterWizard
      characterId={characterId}
      initial={result.character}
      initialVersion={sheetVersion}
    />
  );
}
