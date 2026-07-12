"use client";

import { readLevelUpMeta, featsOwedAtLevel } from "@pathforge/schema";
import { FeatsStep } from "../steps/feats-step";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/**
 * Level-Up Wizard Stage 5 — the Feats step (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "The step list").
 *
 * Composition choice: REUSE, DON'T FORK — the create wizard's `FeatsStep` (`../steps/feats-step.tsx`)
 * already composes exactly what PF1e feat-picking needs (`FeatPicker`, the traits `EntryPicker`,
 * `DrawbackPicker`, plus the current feats/traits chip lists with remove) and is embedded here with
 * level-up `heading`/`intro` overrides (the same additive-props pattern `HpStep`/`SkillsStep` gained
 * in Stage 4) — ONE h2 renders, owned by the embedded step, with this wrapper contributing only the
 * advisory banner above it (a review caught the original wrapper stacking a second h2 card).
 *
 * The advisory: how many feat picks THIS level-up owes, per the core "1 feat at 1st level, +1 every
 * odd level" formula (`featsOwedAtLevel`, diffed old→new so a multi-level catch-up sums every odd
 * level crossed in ONE pass, never per-level UI — mirrors the HP/Skills wrappers' `meta`-diff idiom
 * exactly). Class-granted bonus feats (Fighter and similar) already arrived automatically via the
 * Class step's `grantClassFeatures` call — this badge is purely the core "any class" progression.
 * Picks made THIS session aren't tracked against a snapshot (none is taken — faking a "picked N of M"
 * counter here would be dishonest); the owed badge alone is the correct, complete advisory.
 */
export function LevelUpFeatsStep({ ed, characterId }: { ed: CharacterEditorApi; characterId: string }) {
  const meta = readLevelUpMeta(ed.draft);
  const owed = meta ? Math.max(0, featsOwedAtLevel(meta.targetLevel) - featsOwedAtLevel(meta.fromLevel)) : 0;

  return (
    <div className="space-y-3">
      {meta && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-sm font-medium text-foreground">
          This level-up grants {owed} feat pick{owed === 1 ? "" : "s"}{" "}
          <span className="font-normal text-muted-foreground">(a feat at 1st level and every odd level)</span>
        </div>
      )}
      <FeatsStep
        ed={ed}
        characterId={characterId}
        heading="Feats"
        intro="Pick the feats gained from leveling — class bonus feats (Fighter and similar) already arrived automatically on the Class step. Traits and drawbacks are here too if your table allows adding them later."
        showLevelOneGuideline={false}
      />
    </div>
  );
}
