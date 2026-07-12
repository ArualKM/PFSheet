"use client";

import { readLevelUpMeta, featsOwedAtLevel } from "@pathforge/schema";
import { FeatsStep } from "../steps/feats-step";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/**
 * Level-Up Wizard Stage 5 — the Feats step (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "The step list").
 *
 * Composition choice: REUSE, DON'T FORK — the create wizard's `FeatsStep` (`../steps/feats-step.tsx`)
 * already composes exactly what PF1e feat-picking needs (`FeatPicker`, the traits `EntryPicker`,
 * `DrawbackPicker`, plus the current feats/traits chip lists with remove) and is embedded here
 * VERBATIM, unmodified. The Master Plan's suggested DRY move — give it optional `heading?`/`intro?`
 * props the way `HpStep`/`SkillsStep` gained in Stage 4 — is NOT available to this file:
 * `../steps/feats-step.tsx` is owned by a concurrent agent this session and is off-limits to edit
 * here (file-ownership constraint, not a design preference). That component's own default copy
 * ("Feats and traits round out what your character is good at beyond their class…") already reads
 * fine outside the create-wizard's welcome-flow framing — nothing level-up-specific needs overriding
 * — so embedding it as-is is genuinely the SMALLER diff (zero lines changed in the shared component),
 * not a consolation-prize fallback for the bigger one.
 *
 * This wrapper's only job is the level-up-specific advisory: how many feat picks THIS level-up owes,
 * per the core "1 feat at 1st level, +1 every odd level" formula (`featsOwedAtLevel`, diffed old→new
 * so a multi-level catch-up sums every odd level crossed in ONE pass, never per-level UI — mirrors the
 * HP/Skills wrappers' `meta`-diff idiom exactly). Class-granted bonus feats (Fighter and similar)
 * already arrived automatically via the Class step's `grantClassFeatures` call — this badge is purely
 * the core "any class" progression. Picks made THIS session aren't tracked against a snapshot (none is
 * taken — faking a "picked N of M" counter here would be dishonest); the owed badge alone is the
 * correct, complete advisory per the Master Plan.
 */
export function LevelUpFeatsStep({ ed, characterId }: { ed: CharacterEditorApi; characterId: string }) {
  const meta = readLevelUpMeta(ed.draft);
  const owed = meta ? Math.max(0, featsOwedAtLevel(meta.targetLevel) - featsOwedAtLevel(meta.fromLevel)) : 0;

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Feats</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Core PF1e grants a feat at 1st level and every odd level after that. Class-granted bonus
          feats (Fighter and similar) already arrived automatically on the Class step — there&rsquo;s
          nothing to pick for those here.
        </p>
        {meta && (
          <div className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-sm font-medium text-foreground">
            This level-up grants {owed} feat pick{owed === 1 ? "" : "s"}{" "}
            <span className="font-normal text-muted-foreground">(a feat at 1st level and every odd level)</span>
          </div>
        )}
      </div>
      <FeatsStep ed={ed} characterId={characterId} />
    </div>
  );
}
