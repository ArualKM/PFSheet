"use client";

import { useState } from "react";
import {
  readLevelUpMeta,
  resumeLevelUpStepFor,
  writeLevelUpMeta,
  type LevelUpStepKey,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import { useCharacterEditor } from "../../editor/use-character-editor";
import { LEVEL_UP_STEPS } from "./level-up-steps";
import { WizardShell } from "../wizard-shell";

/**
 * The level-up wizard's root client component — mirrors `character-wizard.tsx` exactly: calls
 * `useCharacterEditor` EXACTLY once (the wizard and the full editor are two different shells around
 * one save loop; nothing is re-loaded or re-saved specially on handoff), then hands the FULL
 * `LEVEL_UP_STEPS` list to the generalized `WizardShell` (Level-Up Wizard Stage 2), which filters to
 * what's visible for THIS session on every render.
 */
export function LevelUpWizard({
  characterId,
  initial,
  initialVersion,
}: {
  characterId: string;
  initial: PathForgeCharacterV1;
  initialVersion: number;
}) {
  const ed = useCharacterEditor(characterId, initial, initialVersion);
  const meta = readLevelUpMeta(initial);

  // Computed ONCE, via a lazy useState initializer — not on every render — because it's the initial
  // step only; after mount, WizardShell's own resolveVisibleStep takes over re-landing the user if
  // their CURRENT step's predicate flips false mid-session. `ed` here is the freshly created editor
  // session from the hook call above (already available: computed is a synchronous useMemo, not
  // async), so a checkpoint pointing at a now-hidden step (e.g. "feats" stored before the player
  // lowered the target level on a refresh) resolves forward to the next visible one before first paint.
  const [initialStep] = useState<LevelUpStepKey>(() => {
    if (!meta) return "class";
    const visibleKeys = LEVEL_UP_STEPS.filter((s) => !s.visible || s.visible(ed)).map((s) => s.key) as LevelUpStepKey[];
    return resumeLevelUpStepFor(meta, visibleKeys);
  });

  return (
    <WizardShell
      ed={ed}
      characterId={characterId}
      steps={LEVEL_UP_STEPS}
      initialStep={initialStep}
      writeStep={(c, step) => {
        writeLevelUpMeta(c, { step: step as LevelUpStepKey });
      }}
      navLabel="Level-up steps"
    />
  );
}
