"use client";

import {
  readWizardMeta,
  resumeStepFor,
  writeWizardMeta,
  type PathForgeCharacterV1,
  type WizardStepKey,
} from "@pathforge/schema";
import { useCharacterEditor } from "../editor/use-character-editor";
import { CREATE_WIZARD_STEPS } from "./create-wizard-steps";
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
  // resumeStepFor, not the raw stored step: a v1-order checkpoint resuming by key would skip the
  // v2-inserted Systems/Abilities steps forever (the shell only walks forward — review finding).
  const meta = readWizardMeta(initial);
  return (
    <WizardShell
      ed={ed}
      characterId={characterId}
      steps={CREATE_WIZARD_STEPS}
      initialStep={meta ? resumeStepFor(meta) : "welcome"}
      writeStep={(c, step) => {
        writeWizardMeta(c, { step: step as WizardStepKey });
      }}
    />
  );
}
