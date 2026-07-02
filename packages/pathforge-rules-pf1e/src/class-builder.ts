import {
  applyClassPreset,
  compendiumRowToPreset,
  type CharacterArchetype,
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
  opts: { features: CompendiumFeatureRow[]; toLevel: number; fromLevel?: number; exclude?: string[] },
): string[] {
  const from = opts.fromLevel ?? 0;
  // Standard features an applied archetype replaces — never (re-)grant them (e.g. on level-up).
  const exclude = new Set((opts.exclude ?? []).map((s) => s.toLowerCase()));
  const have = new Set(character.features.list.map((f) => f.compendiumId).filter(Boolean) as string[]);
  const added: string[] = [];
  for (const row of opts.features) {
    if (row.level <= from || row.level > opts.toLevel) continue;
    if (have.has(row.id)) continue;
    if (exclude.has(row.feature.trim().toLowerCase())) continue;
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
  opts: {
    input: CompendiumClassInput;
    level: number;
    hpMethod?: HpMethod;
    features?: CompendiumFeatureRow[];
    /** Prestige classes advance an EXISTING caster ("+1 level of existing class"), not a new one — set this
     * so the apply doesn't create a spurious caster from the progression's spell columns. */
    suppressCaster?: boolean;
  },
): ApplyCompendiumClassResult {
  const { input, level, hpMethod = "manual", features, suppressCaster } = opts;
  const { preset, warnings } = compendiumRowToPreset(input);
  if (suppressCaster) delete preset.caster;

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
  // If the class already carries archetypes, don't re-grant the features they replace.
  const row = character.identity.classes.find((c) => c.compendiumId === input.key);
  const exclude = (row?.archetypes ?? []).flatMap((a) => a.replaces);
  const featuresAdded = features ? grantClassFeatures(character, { features, fromLevel: 0, toLevel: level, exclude }) : [];

  return {
    wrote: report.wrote,
    skipped: report.skipped,
    warnings: [...warnings, ...report.warnings],
    skillRankBudget: report.skillRankBudget,
    featuresAdded,
  };
}

// ---- Phase 5: archetypes (replace standard features, conflict-check, grant archetype features) ----

/** An `archetype_feature_compendium` row the builder applies. */
export type ArchetypeFeatureRow = {
  slug: string;
  archetype: string;
  feature: string;
  type?: string | null;
  level?: number | string | null;
  /** The standard class feature(s) this row replaces (lowercased base names, in the dataset). */
  replaces?: string | null;
  /** Pre-split replaces names. When present it is authoritative — no comma/";"/"and" re-split — so a
   * SINGLE feature name containing " and " ("Up Close and Personal") survives intact. Core compendium rows
   * never set it (their `replaces` cells keep {@link parseReplaces} semantics); the 3pp adapter always does. */
  replacesList?: string[] | null;
  text?: string | null;
};

/** Split a `replaces` cell into lowercased base feature names (comma / semicolon / "and" separated). */
export function parseReplaces(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[,;]|\band\b/i)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Every standard feature an archetype's rows replace (deduped, lowercased). A row's pre-split
 * `replacesList` wins over the re-split of its raw `replaces` cell. */
export function archetypeReplaces(features: ArchetypeFeatureRow[]): string[] {
  return [
    ...new Set(
      features.flatMap((f) =>
        f.replacesList ? f.replacesList.map((s) => s.trim().toLowerCase()).filter(Boolean) : parseReplaces(f.replaces),
      ),
    ),
  ];
}

/** Replaced features that an already-applied archetype on this class also replaced → a hard conflict
 * (two archetypes can't both replace the same standard feature). */
export function findArchetypeConflicts(existing: CharacterArchetype[] | undefined, newReplaces: string[]): string[] {
  const taken = new Set((existing ?? []).flatMap((a) => a.replaces));
  return [...new Set(newReplaces.filter((r) => taken.has(r)))];
}

const TYPE_SUFFIX = /\s*\((?:Ex|Su|Sp|Ex\/Su|Su\/Sp|Sp\/Su)\)\s*$/i;
const baseName = (name: string) => name.replace(TYPE_SUFFIX, "").trim().toLowerCase();

export type ApplyArchetypeResult = { added: string[]; replaced: string[]; conflicts: string[] };

/**
 * Apply an archetype to a class row: conflict-check vs already-applied archetypes; if clear, remove the
 * standard class features it replaces, grant its leveled features (category "archetype_feature", no automation —
 * the dataset gives prose, not effect seeds), and record it (with its `replaces`) on the class row. Idempotent
 * by archetype compendiumId. On conflict it mutates nothing and returns the conflicting feature names.
 */
export function applyArchetype(
  character: PathForgeCharacterV1,
  opts: { classId: string; archetype: { name: string; compendiumId?: string }; features: ArchetypeFeatureRow[] },
): ApplyArchetypeResult {
  const row = character.identity.classes.find((c) => c.id === opts.classId);
  if (!row) return { added: [], replaced: [], conflicts: [] };

  // Idempotent: already applied?
  if (opts.archetype.compendiumId && (row.archetypes ?? []).some((a) => a.compendiumId === opts.archetype.compendiumId)) {
    return { added: [], replaced: [], conflicts: [] };
  }

  const replaces = archetypeReplaces(opts.features);
  const conflicts = findArchetypeConflicts(row.archetypes, replaces);
  if (conflicts.length) return { added: [], replaced: [], conflicts };

  // Remove the standard class features this archetype replaces.
  const replacedSet = new Set(replaces);
  const replaced: string[] = [];
  character.features.list = character.features.list.filter((f) => {
    if (f.category === "class_feature" && replacedSet.has(baseName(f.name))) {
      replaced.push(f.name);
      return false;
    }
    return true;
  });

  // Grant the archetype's leveled features (note-only rows with no numeric level are skipped).
  const have = new Set(character.features.list.map((f) => f.compendiumId).filter(Boolean) as string[]);
  const added: string[] = [];
  const grantedFeatureIds: string[] = [];
  for (const f of opts.features) {
    const lvl = Number(f.level);
    // note-only rows (e.g. "Rogue Talents") have empty/null level → Number(...) is 0/NaN, not a real level.
    if (!Number.isFinite(lvl) || lvl < 1) continue;
    if (have.has(f.slug)) continue;
    character.features.list.push({
      id: `arch_${f.slug}`,
      name: f.type ? `${f.feature} (${f.type})` : f.feature,
      category: "archetype_feature",
      compendiumId: f.slug,
      level: lvl,
      description: f.text ?? undefined,
      automation: [],
    });
    have.add(f.slug);
    added.push(f.feature);
    grantedFeatureIds.push(f.slug);
  }

  row.archetypes = [
    ...(row.archetypes ?? []),
    { name: opts.archetype.name, compendiumId: opts.archetype.compendiumId, replaces, grantedFeatureIds },
  ];
  return { added, replaced, conflicts: [] };
}

export type UnapplyArchetypeResult = {
  /** Names of the archetype features removed from the sheet. */
  removedFeatures: string[];
  /** Lowercased base names of the standard class features that should be RESTORED (what this archetype
   * replaced, minus anything a remaining archetype on the class still replaces). The caller re-grants them
   * from the class feature rows — the engine has no class-feature data to restore them itself. */
  restore: string[];
};

/**
 * Remove an applied archetype from a class row (the inverse of {@link applyArchetype}): drop its record, remove
 * the archetype features it granted (by the slugs recorded in `grantedFeatureIds`), and report the standard
 * features to restore. Pure + idempotent (a no-op if the archetype isn't applied). Restoring the standards is
 * the caller's job (it owns the async class-feature fetch).
 */
export function unapplyArchetype(
  character: PathForgeCharacterV1,
  opts: { classId: string; archetype: { name: string; compendiumId?: string } },
): UnapplyArchetypeResult {
  const row = character.identity.classes.find((c) => c.id === opts.classId);
  if (!row || !row.archetypes?.length) return { removedFeatures: [], restore: [] };

  const match = (a: CharacterArchetype) =>
    opts.archetype.compendiumId ? a.compendiumId === opts.archetype.compendiumId : a.name === opts.archetype.name;
  const target = row.archetypes.find(match);
  if (!target) return { removedFeatures: [], restore: [] };

  row.archetypes = row.archetypes.filter((a) => !match(a));

  const grantedIds = new Set(target.grantedFeatureIds ?? []);
  const removedFeatures: string[] = [];
  if (grantedIds.size) {
    character.features.list = character.features.list.filter((f) => {
      if (f.category === "archetype_feature" && f.compendiumId && grantedIds.has(f.compendiumId)) {
        removedFeatures.push(f.name);
        return false;
      }
      return true;
    });
  }

  const stillReplaced = new Set((row.archetypes ?? []).flatMap((a) => a.replaces));
  const restore = (target.replaces ?? []).filter((r) => !stillReplaced.has(r));
  return { removedFeatures, restore };
}
