"use client";

import { readWizardMeta, type PathForgeCharacterV1 } from "@pathforge/schema";
import { useCharacterEditor } from "../editor/use-character-editor";
import { WizardShell } from "./wizard-shell";

/**
 * S6 Pillar 3 (`docs/S6_UX_OVERHAUL/03_CHARACTER_WIZARD.md` §4.1) — the guided create-a-character
 * flow's root client component. Calls `useCharacterEditor` EXACTLY once, the same hook/contract
 * `<CharacterEditor>` uses — the wizard and the full editor are two different shells around one save
 * loop; nothing is re-loaded or re-saved specially when the wizard hands off to `/edit`.
 */
export function CharacterWizard({
  characterId,
  initial,
  initialVersion,
}: {
  characterId: string;
  initial: PathForgeCharacterV1;
  initialVersion: number;
}) {
  const ed = useCharacterEditor(characterId, initial, initialVersion);
  return (
    <WizardShell
      ed={ed}
      characterId={characterId}
      initialStep={readWizardMeta(initial)?.step ?? "welcome"}
    />
  );
}
