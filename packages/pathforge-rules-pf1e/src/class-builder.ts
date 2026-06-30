import {
  applyClassPreset,
  compendiumRowToPreset,
  type CompendiumClassInput,
  type HpMethod,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import { seedsToAutomationEffects, type CompendiumEffectSeed } from "./effect-seeds";

/**
 * Phase 4 — the progression-driven class builder's mutation layer. Lives in the rules package because it
 * needs BOTH `applyClassPreset` (schema: the class math) AND `seedsToAutomationEffects` (rules: the Phase 3
 * effect mapper). Class-derived math is 100% reused via the cached synthetic preset (see class-compendium.ts
 * + resolveClassPreset); the only NEW job here is granting per-level `FeatureEntry` rows.
 */

/** A `class_features` row (with its `feature_effect` seeds attached) the builder grants at a given level. */
export type CompendiumFeatureRow = {
  /** The `class_features` row slug — the dedup key + the FeatureEntry.compendiumId. */
  id: string;
  feature: string;
  level: number;
  type?: string | null;
  description?: string | null;
  /** Seeds from `feature_effect` for this (class, feature), in our DSL. */
  effects?: CompendiumEffectSeed[];
};

/**
 * Grant a class's features for the newly-reached levels (fromLevel, toLevel], idempotently. Each becomes a
 * `FeatureEntry` (category "class_feature") with its automation pre-filled via the Phase 3 mapper — clean
 * unconditional effects compute, choice/toggle/damage ones stay `condition`-gated. Dedup is by compendiumId
 * so re-apply / level-up never duplicates. Returns the names actually added.
 */
export function grantClassFeatures(
  character: PathForgeCharacterV1,
  opts: { features: CompendiumFeatureRow[]; toLevel: number; fromLevel?: number },
): string[] {
  const from = opts.fromLevel ?? 0;
  const have = new Set(character.features.list.map((f) => f.compendiumId).filter(Boolean) as string[]);
  const added: string[] = [];
  for (const row of opts.features) {
    if (row.level <= from || row.level > opts.toLevel) continue;
    if (have.has(row.id)) continue;
    character.features.list.push({
      id: `feat_${row.id}`,
      name: row.type ? `${row.feature} (${row.type})` : row.feature,
      category: "class_feature",
      compendiumId: row.id,
      level: row.level,
      description: row.description ?? undefined,
      automation: seedsToAutomationEffects(row.effects ?? [], row.id),
    });
    have.add(row.id);
    added.push(row.feature);
  }
  return added;
}

export type ApplyCompendiumClassResult = {
  wrote: string[];
  skipped: string[];
  warnings: string[];
  skillRankBudget: number;
  featuresAdded: string[];
};

/**
 * Apply a compendium class at a level: reuse `applyClassPreset` (BAB/saves/HP/skills/caster) with a synthetic
 * preset built from the compendium row, then grant features L1..level. We PRE-SEED the class row carrying the
 * cached preset so `applyClassPreset` adopts it (by name) and its single internal recompute already resolves
 * the compendium preset — no second pass, no "manual class" warning.
 */
export function applyCompendiumClass(
  character: PathForgeCharacterV1,
  opts: { input: CompendiumClassInput; level: number; hpMethod?: HpMethod; features?: CompendiumFeatureRow[] },
): ApplyCompendiumClassResult {
  const { input, level, hpMethod = "manual", features } = opts;
  const { preset, warnings } = compendiumRowToPreset(input);

  const existing = character.identity.classes.find((c) => c.compendiumId === input.key || c.presetKey === preset.key);
  if (existing) {
    existing.compendiumId = input.key;
    existing.compendiumPreset = preset;
    existing.level = level;
  } else {
    character.identity.classes.push({
      id: `class_${input.key}_${character.identity.classes.length}`,
      name: preset.name,
      level,
      compendiumId: input.key,
      compendiumPreset: preset,
    });
  }

  const report = applyClassPreset(character, { preset, level, hpMethod });
  const featuresAdded = features ? grantClassFeatures(character, { features, fromLevel: 0, toLevel: level }) : [];

  return {
    wrote: report.wrote,
    skipped: report.skipped,
    warnings: [...warnings, ...report.warnings],
    skillRankBudget: report.skillRankBudget,
    featuresAdded,
  };
}
