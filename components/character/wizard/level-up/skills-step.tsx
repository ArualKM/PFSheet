"use client";

import { readLevelUpMeta, resolveClassPreset, skillRanksForLevel } from "@pathforge/schema";
import { SkillsStep } from "../steps/skills-step";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/**
 * Level-Up Wizard Stage 4 — the Skills step (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "The step list").
 * `SkillsStep` is reused VERBATIM — same "no engine-exposed overall skill-point budget; ranks-spent +
 * the level-based per-skill cap is the honest substitute" as the create wizard (Ground Truth). This
 * wrapper adds ONE advisory line: how many new ranks this level-up nominally granted, summed per
 * class that gained a level THIS SESSION — matched against `meta.startingClasses` by id (a class
 * absent from the snapshot is brand-new this session, so it counts from level 0). Diffs
 * `skillRanksForLevel` (cumulative-through-level, `class-catalog.ts`) at each class's OLD vs NEW
 * level — zero new engine math, the same diff-two-calls idiom the HP wrapper uses for
 * `startingMaxHp`. Hidden entirely when `meta.startingClasses` is absent — never guess a baseline.
 *
 * Background Skills' own separate ranks budget is already surfaced by `SkillsStep` itself
 * (`ed.computed.summary.backgroundSkills`, shown inline when the module's on) — not duplicated here.
 */
export function LevelUpSkillsStep({ ed, characterId }: { ed: CharacterEditorApi; characterId: string }) {
  const meta = readLevelUpMeta(ed.draft);
  const startingClasses = meta?.startingClasses;
  const intMod = ed.computed.abilities.int?.modifier ?? 0;

  const newRanks = (() => {
    if (!startingClasses) return null;
    let total = 0;
    for (const cl of ed.draft.identity.classes) {
      const preset = resolveClassPreset(cl);
      if (!preset) continue;
      const snapshot = startingClasses.find((s) => s.id === cl.id);
      const oldLevel = snapshot?.level ?? 0;
      const newLevel = cl.level;
      if (newLevel <= oldLevel) continue;
      total += skillRanksForLevel(preset.skillRanksPerLevel, intMod, newLevel) - skillRanksForLevel(preset.skillRanksPerLevel, intMod, oldLevel);
    }
    return total;
  })();

  return (
    <div className="space-y-3">
      {newRanks !== null && newRanks > 0 && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-2.5 text-sm font-medium text-foreground">
          About {newRanks} new skill rank{newRanks === 1 ? "" : "s"} this level-up
        </div>
      )}
      <SkillsStep
        ed={ed}
        characterId={characterId}
        heading="Level-up skills"
        intro="Spend the new skill ranks your level-up granted — the banner above is an advisory estimate, never auto-spent."
      />
    </div>
  );
}
