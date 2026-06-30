import { DEFAULT_SKILLS, CLASS_CATALOG, type AbilityKey, type CasterType, type CompendiumClassInput } from "@pathforge/schema";
import type { CompendiumEffectSeed, CompendiumFeatureRow } from "@pathforge/rules-pf1e";

/** Raw `class_compendium` row (the columns the search RPC returns). */
export type ClassCompendiumRow = {
  slug: string;
  name: string;
  hit_die: string | null;
  class_skills: string | null;
  skill_points_per_level: string | null;
  role: string | null;
  source: string | null;
};

/** "d10." → 10. Prefers the die size after "d" (so "2d6" → 6, not 26). Defaults to 8. */
export function parseHitDie(raw: string | null | undefined): 6 | 8 | 10 | 12 {
  const s = String(raw ?? "");
  const m = s.match(/d\s*(\d+)/i);
  const n = m ? parseInt(m[1]!, 10) : parseInt(s.replace(/[^0-9]/g, ""), 10);
  return n === 6 || n === 8 || n === 10 || n === 12 ? n : 8;
}

/** "2 + Int modifier." → 2 (the base; the engine adds the Int modifier itself). Min 1 per PF1e. */
export function parseSkillPoints(raw: string | null | undefined): number {
  const n = parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 1 ? n : 2;
}

const TRAILING_ABILITY = /\s*\((?:str|dex|con|int|wis|cha)\)\s*\.?\s*$/i;

/**
 * "Climb (Str), Craft (Int), Knowledge (arcana) (Int), …, and Swim (Str)." → skill keys.
 * Strips the trailing "(Ability)" modifier, expands "Knowledge (all)" to every Knowledge skill, and maps the
 * rest to DEFAULT_SKILLS by label. Unmatched entries (e.g. a 3pp skill) are skipped (best-effort).
 */
export function parseClassSkills(raw: string | null | undefined): string[] {
  const labelToKey = new Map(DEFAULT_SKILLS.map((s) => [s.label.toLowerCase(), s.key]));
  const allKnowledge = DEFAULT_SKILLS.filter((s) => s.key.startsWith("knowledge_")).map((s) => s.key);
  const keys = new Set<string>();
  for (let part of String(raw ?? "")
    .replace(/\.\s*$/, "")
    .split(",")) {
    part = part.replace(/^\s*and\s+/i, "").replace(TRAILING_ABILITY, "").trim();
    if (!part) continue;
    if (/^knowledge\s*\(all\)/i.test(part)) {
      allKnowledge.forEach((k) => keys.add(k));
      continue;
    }
    const key = labelToKey.get(part.toLowerCase());
    if (key) keys.add(key);
  }
  return [...keys];
}

export type ProgressionLevel = { level: number; bab: string; fort: string; ref: string; will: string; special: string };

/** Parse `class_progression.json_data` into per-level display rows (for the progression accordion). Locates
 * columns by header label so it's robust to the dataset's column drift; rows without an ordinal level are skipped. */
export function parseProgressionTable(jsonData: unknown): ProgressionLevel[] {
  const rows: unknown[][] = Array.isArray(jsonData) ? (jsonData as unknown[][]).filter(Array.isArray) : [];
  const headerIdx = rows.findIndex(
    (r) => r.some((c) => /^level$/i.test(String(c).trim())) && r.some((c) => /base attack|^bab$/i.test(String(c).trim())),
  );
  if (headerIdx < 0) return [];
  const header = rows[headerIdx]!.map((c) => String(c ?? "").trim().toLowerCase());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const li = col(/^level$/);
  const bi = col(/base attack|^bab$/);
  const fi = col(/fort/);
  const ri = col(/ref/);
  const wi = col(/will/);
  const si = col(/special/);
  const out: ProgressionLevel[] = [];
  for (const r of rows) {
    const m = String(r[li] ?? "").match(/^(\d+)(st|nd|rd|th)/i);
    if (!m) continue;
    out.push({
      level: parseInt(m[1]!, 10),
      bab: String(r[bi] ?? "").trim(),
      fort: String(r[fi] ?? "").trim(),
      ref: String(r[ri] ?? "").trim(),
      will: String(r[wi] ?? "").trim(),
      special: si >= 0 ? String(r[si] ?? "").trim() : "",
    });
  }
  return out.sort((a, b) => a.level - b.level);
}

/** Sensible caster defaults: a matching core class supplies the real ability/type; else int/prepared. */
export function casterDefaults(className: string): { castingAbility: AbilityKey; casterType: CasterType } {
  const cat = CLASS_CATALOG.find((c) => c.name.toLowerCase() === className.toLowerCase());
  if (cat?.caster) return { castingAbility: cat.caster.castingAbility, casterType: cat.caster.casterType };
  return { castingAbility: "int", casterType: "prepared" };
}

/** Assemble the {@link CompendiumClassInput} for applyCompendiumClass from a raw row + the chosen caster fields. */
export function buildClassInput(
  row: ClassCompendiumRow,
  progression: unknown,
  caster: { castingAbility: AbilityKey; casterType: CasterType },
): CompendiumClassInput {
  return {
    key: `pfcore:${row.slug}`,
    name: row.name,
    hitDie: parseHitDie(row.hit_die),
    skillRanksPerLevel: parseSkillPoints(row.skill_points_per_level),
    classSkillKeys: parseClassSkills(row.class_skills),
    castingAbility: caster.castingAbility,
    casterType: caster.casterType,
    progression,
  };
}

/** Map `class_features` rows (+ their `feature_effect` seeds) to the granter's {@link CompendiumFeatureRow}s.
 * `level` arrives as text from the compendium table, so it's coerced (rows without a numeric level are skipped). */
export function buildFeatureRows(
  features: { slug: string; feature: string; level: number | string | null; type: string | null; description: string | null }[],
  effects: { feature: string; target: string; op: string; value_or_formula: string; bonus_type: string | null; notes: string | null }[],
): CompendiumFeatureRow[] {
  const byFeature = new Map<string, CompendiumEffectSeed[]>();
  for (const e of effects) {
    const list = byFeature.get(e.feature) ?? [];
    list.push({ target: e.target, op: e.op, valueOrFormula: e.value_or_formula, bonusType: e.bonus_type, notes: e.notes });
    byFeature.set(e.feature, list);
  }
  return features
    .map((f) => ({ row: f, level: Number(f.level) }))
    .filter((x) => Number.isFinite(x.level))
    .map(({ row, level }) => ({
      id: row.slug,
      feature: row.feature,
      level,
      type: row.type,
      description: row.description,
      effects: byFeature.get(row.feature),
    }));
}
