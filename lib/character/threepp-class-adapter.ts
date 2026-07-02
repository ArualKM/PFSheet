import type { AbilityKey, CasterType, CompendiumClassInput } from "@pathforge/schema";
import type { ArchetypeFeatureRow, CompendiumFeatureRow } from "@pathforge/rules-pf1e";
import { casterDefaults, parseHitDie, parseSkillPoints, parseProgressionTable } from "./class-compendium";

/**
 * Phase 2b-B — pure adapters that let the module-gated 3pp compendium rows ride the SAME apply paths as the
 * PFcore builder. `threepp_class_compendium.progression_json` comes in TWO shapes (the two scrapers): the
 * d20pfsrd parser's header-row 2D array (same as PFcore `class_progression.json_data`) and the Miraheze
 * parser's ARRAY OF OBJECTS (73 of 129 prod rows — e.g. vizier-akashic). {@link normalizeProgression}
 * converts the object shape to the header-row shape so `parseProgression` / `compendiumRowToPreset` /
 * `parseProgressionTable` work on both; the remaining work here is (a) mapping the 3pp row columns onto
 * {@link CompendiumClassInput}, (b) synthesizing feature rows from data the 3pp tables DON'T break out
 * per-feature (the progression's "Special" column for classes; the `altered_features` comma list + prose
 * description for archetypes), and (c) whole-name `base_class` matching for the archetype union.
 */

/** Raw `threepp_class_compendium` row (the columns the search RPC returns). */
export type ThreeppClassRow = {
  slug: string;
  name: string | null;
  class_type: string | null;
  system: string | null;
  alignment: string | null;
  hit_die: string | null;
  skill_points: string | null;
  bab: string | null;
  fort: string | null;
  ref: string | null;
  will: string | null;
  class_features: string | null;
  progression_json: unknown;
  description: string | null;
  source: string | null;
  url: string | null;
};

/** Raw `threepp_archetype_compendium` row. */
export type ThreeppArchetypeRow = {
  slug: string;
  name: string | null;
  base_class: string | null;
  system: string | null;
  altered_features: string | null;
  description: string | null;
  source: string | null;
  url?: string | null;
};

/** Raw `threepp_race_compendium` row. */
export type ThreeppRaceRow = {
  slug: string;
  name: string | null;
  system: string | null;
  ability_modifiers: string | null;
  size: string | null;
  speed: string | null;
  racial_traits: string | null;
  description: string | null;
  source: string | null;
  url?: string | null;
};

/** Split a comma list at TOP level only (commas inside parentheses stay put, e.g. "Bond (mount, weapon)"). */
function splitTopLevel(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of raw) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Trailing footnote markers on a progression feature name: asterisks/daggers/superscript digits. */
const FOOTNOTE = /[*†‡¹²³⁰⁴-⁹]+\s*$/;
/** A "no features this level" placeholder cell — em/en dash, hyphen, or true minus. */
const PLACEHOLDER = /^[—–−-]+$/;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * The header labels the parsers locate BY NAME (column order only affects display), in canonical order.
 * jsonb alphabetizes object keys, so the original column order of an object-format progression is lost —
 * we emit Level first, then BAB/saves/Special, then the system columns (Essence/Veils/Manifesting/…)
 * alphabetically. Match patterns cover the dataset's key drift: "Class Level", "Reflex Save", short
 * "BAB"/"Fort"/"Ref"/"Will" (aquanaut), and soulforge's "Class Features" standing in for "Special".
 */
const CANONICAL_HEADERS: [label: string, match: RegExp][] = [
  ["Level", /^(class\s+)?level$/i],
  ["Base Attack Bonus", /^(base attack bonus|bab)$/i],
  ["Fort Save", /^fort(itude)?(\s+save)?$/i],
  ["Ref Save", /^ref(lex)?(\s+save)?$/i],
  ["Will Save", /^will(\s+save)?$/i],
  ["Special", /^(special|class features)$/i],
];

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd" — the parsers accept only ordinal level cells. */
const ordinal = (n: number) => {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

/**
 * Normalize a `threepp_class_compendium.progression_json` value to the header-row 2D-array format the
 * PFcore parsers consume. The Miraheze scraper stored 73/129 prod progressions as an ARRAY OF OBJECTS
 * (`[{ "Level": "1st", "Base Attack Bonus": "+0", … }, …]`); those are converted to
 * `[headers[], ...rows[]]` with canonical header names/order (see {@link CANONICAL_HEADERS}) and
 * plain-digit level cells ("1") rewritten to the ordinals ("1st") the parsers require. Header-row arrays,
 * `null`, and anything unrecognized pass through unchanged (idempotent).
 */
export function normalizeProgression(json: unknown): unknown {
  if (!Array.isArray(json) || json.length === 0) return json;
  const objRows = json.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r));
  if (objRows.length !== json.length) return json; // header-row 2D array (or mixed/unknown) — pass through

  // Key union across all rows (some tables drift keys between levels), then classify.
  const keys: string[] = [];
  for (const r of objRows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  const used = new Set<string>();
  const canonical: { label: string; key: string }[] = [];
  for (const [label, re] of CANONICAL_HEADERS) {
    const k = keys.find((key) => !used.has(key) && re.test(key.trim()));
    if (k) {
      canonical.push({ label, key: k });
      used.add(k);
    }
  }
  const rest = keys.filter((k) => !used.has(k)).sort((a, b) => a.localeCompare(b));
  const header = [...canonical.map((c) => c.label), ...rest];
  const srcKeys = [...canonical.map((c) => c.key), ...rest];
  const levelIdx = canonical.findIndex((c) => c.label === "Level"); // 0 when present (Level sorts first)

  const rows = objRows.map((r) =>
    srcKeys.map((k, i) => {
      const cell = String(r[k] ?? "").trim();
      return i === levelIdx && /^\d+$/.test(cell) ? ordinal(parseInt(cell, 10)) : cell;
    }),
  );
  return [header, ...rows];
}

/**
 * Map a 3pp class row → the {@link CompendiumClassInput} shape `applyCompendiumClass` consumes. 3pp rows carry
 * no class-skill list (fine — `applyClassPreset` tolerates empty) and no casting stat, so the caster fields
 * default via `casterDefaults(name)` (int/prepared for non-core names; parseProgression only emits a caster
 * when the table has real spell-level columns, which akashic/psionic/PoW tables don't — their extra columns
 * are Essence/Power Points/Maneuvers).
 */
export function threeppClassRowToInput(
  row: ThreeppClassRow,
  caster?: { castingAbility: AbilityKey; casterType: CasterType },
): CompendiumClassInput {
  const name = row.name ?? row.slug;
  const def = caster ?? casterDefaults(name);
  return {
    key: `3pp:${row.slug}`,
    name,
    hitDie: parseHitDie(row.hit_die),
    skillRanksPerLevel: parseSkillPoints(row.skill_points),
    classSkillKeys: [],
    castingAbility: def.castingAbility,
    casterType: def.casterType,
    progression: normalizeProgression(row.progression_json),
  };
}

/**
 * Synthesize {@link CompendiumFeatureRow}s from the progression's "Special" column — one row per distinct
 * feature name per level (top-level comma split, footnote markers stripped, "—" placeholders skipped).
 * Works on both progression formats via {@link normalizeProgression}. Name-only grants (type/description
 * empty). A feature repeated at later levels (e.g. "Stalker art" every few levels) keeps the same slug, so
 * `grantClassFeatures` grants it once — at its first level — by its id dedup.
 */
export function threeppFeaturesFromProgression(progressionJson: unknown, classSlug: string): CompendiumFeatureRow[] {
  const out: CompendiumFeatureRow[] = [];
  for (const row of parseProgressionTable(normalizeProgression(progressionJson))) {
    const seen = new Set<string>();
    for (const entry of splitTopLevel(row.special)) {
      const name = entry.replace(FOOTNOTE, "").trim();
      if (!name || PLACEHOLDER.test(name)) continue;
      const id = `3pp:${classSlug}:${slugify(name)}`;
      if (seen.has(id)) continue; // distinct per level
      seen.add(id);
      out.push({ id, feature: name, level: row.level, type: null, description: null });
    }
  }
  return out;
}

/** "(Su)" / "(Ex)" / "(Sp)" (incl. combos like "(Ex/Su)") trailing type tags on an altered-feature name. */
const TYPE_SUFFIX = /\s*\((?:ex|su|sp)(?:\s*\/\s*(?:ex|su|sp))*\)\s*$/i;

/**
 * Synthesize the minimal {@link ArchetypeFeatureRow}s `applyArchetype` needs from a 3pp archetype row. The 3pp
 * table has no per-feature rows — just an `altered_features` comma list + a prose description — so:
 * - each altered-features entry becomes a level-less row whose `replacesList` is that ONE feature name (type
 *   tag stripped so it matches `applyArchetype`'s base-name removal) → drives the replaces-removal + the
 *   two-archetypes-can't-alter-the-same-feature conflict check, but is never granted (no numeric level).
 *   `replacesList` (not `replaces`) because names like "Up Close and Personal" would be fragmented by
 *   `parseReplaces`'s comma/"and" split — the pre-split list is authoritative;
 * - ONE level-1 row carries the archetype name + full description (its `<br>` markup normalized to newlines,
 *   matching the read view's `whitespace-pre-wrap` renderer) as the granted feature.
 */
export function threeppArchetypeFeatureRows(row: ThreeppArchetypeRow): ArchetypeFeatureRow[] {
  const name = row.name ?? row.slug;
  const rows: ArchetypeFeatureRow[] = splitTopLevel(row.altered_features ?? "")
    .map((entry) => entry.replace(TYPE_SUFFIX, "").trim())
    .filter((entry) => entry && !PLACEHOLDER.test(entry))
    .map((entry, n) => ({
      slug: `3pp:${row.slug}:${n}`,
      archetype: name,
      feature: `${name} (archetype)`,
      type: null,
      level: null,
      replaces: entry,
      replacesList: [entry],
      text: null,
    }));
  rows.push({
    slug: `3pp:${row.slug}:desc`,
    archetype: name,
    feature: name,
    type: null,
    level: 1,
    replaces: null,
    text: row.description ? row.description.replace(/<br\s*\/?>/gi, "\n") : null,
  });
  return rows;
}

// ---- base_class matching for the archetype union ----

const canonName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** "Rogue, Unchained" is ONE class (the unchained variant), not a comma list — rewrite it to
 * "Unchained Rogue" BEFORE the comma split so it can neither vanish nor false-match core Rogue. */
const preNormalizeBaseClass = (raw: string) =>
  raw.replace(/([^,;/<>]+?)\s*,\s*unchained(?=\s*($|<|[,;/]))/gi, (_, name: string) => `Unchained ${name.trim()}`);

/**
 * Split a compound `base_class` cell into cleaned display parts. The prod data separates multi-class values
 * with `<br>` ("Radiant<br>Radiant Retold"), "/" ("Barbarian/UC Barbarian"), ";" and "," — all handled.
 */
export function baseClassParts(raw: string | null | undefined): string[] {
  return preNormalizeBaseClass(String(raw ?? ""))
    .split(/<br\s*\/?>|[/;,]/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Every lowercase form a class name can appear under in the 3pp `base_class` data — unchained spellings
 * normalized in BOTH directions: "Rogue (Unchained)" (the PFcore compendium form) also matches
 * "Unchained Rogue" / "UC Rogue" / "U. Rogue" (all real prod spellings), and a class named "Unchained Rogue"
 * matches "Rogue (Unchained)". A plain core name ("Rogue") stays a single form, so whole-name equality
 * naturally REJECTS the unchained-only variants.
 */
export function classNameForms(className: string): Set<string> {
  const base = canonName(className);
  const forms = new Set([base]);
  const core =
    base.match(/^(.+?)\s*\(unchained\)$/)?.[1]?.trim() ?? base.match(/^(?:unchained|uc|u\.)\s+(.+)$/)?.[1]?.trim();
  if (core) {
    forms.add(`${core} (unchained)`);
    forms.add(`unchained ${core}`);
    forms.add(`uc ${core}`);
    forms.add(`u. ${core}`);
  }
  return forms;
}

/**
 * Whole-name `base_class` match: split the compound cell, compare each part against the class-name forms.
 * Substring matching is banned here — "Paladin" must not hit "Antipaladin", "Radiant" must not hit
 * "Radiant Retold", and core "Rogue" must not be offered "Unchained Rogue"-only archetypes.
 */
export function matchesBaseClass(baseClass: string | null | undefined, className: string): boolean {
  const forms = classNameForms(className);
  return baseClassParts(baseClass).some((p) => forms.has(canonName(p)));
}

/** "30 feet (land); 20 feet (climb)" → 30 (the leading land speed). Undefined when there's no number. */
export function parseLandSpeed(raw: string | null | undefined): number | undefined {
  const m = String(raw ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}
