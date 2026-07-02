import { z } from "zod";
import { abilityKeySchema, automationEffectSchema, type AbilityKey } from "./common";

/** §18 Akashic Magic (Dreamscarred Press) — a veilweaving subsystem: a shared per-day ESSENCE pool
 * (Σ class pools + temporary) is INVESTED (not spent) into shaped VEILS occupying CHAKRA SLOTS;
 * per-receptacle capacity is capped by character level (1/2/3/4 at L1-5/6-11/12-17/18+); binding a
 * veil to an unlocked chakra strengthens it. Veil save DC = 10 + essence invested + the veilweaving
 * ability mod of the class that shaped it. Gated by isModuleKeyEnabled(c, "akashic"). Veils are the
 * discrete options → akashic_veil_compendium + picker. */

/** The canonical chakra slots in body order. Slot FIELDS stay free strings — the compendium carries
 * nonstandard slots ("Storm", "Interface", "Special") and comma multi-slot cells; never reject. */
export const KNOWN_CHAKRA_SLOTS = [
  "hands",
  "feet",
  "head",
  "headband",
  "neck",
  "wrists",
  "shoulders",
  "belt",
  "chest",
  "body",
  "ring",
  "blood",
] as const;
export type KnownChakraSlot = (typeof KNOWN_CHAKRA_SLOTS)[number];

/** Split a compendium slot cell ("Hands, Wrists" / "Storm") into trimmed slot names. */
export function parseVeilSlots(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Default veilweaving ability per class (lowercased class name → ability key). GROUNDED entries
 * only: Vizier→Int, Guru→Wis, Daevic→Cha (the S4 design's stated abilities). The prod
 * `threepp_class_compendium` descriptions are flavor text without ability statements (verified —
 * the Weaver even lets the player CHOOSE Int/Wis/Cha), so everything else falls back to "cha". */
export const AKASHIC_VEILWEAVING_DEFAULTS: Record<string, string> = {
  vizier: "int",
  guru: "wis",
  daevic: "cha",
};

/** The default veilweaving ability for a class name — a whole-word match so variants ("Vizier
 * Retold", "Guru (Philosophy)") still hit their base class; unknown/homebrew classes → "cha". */
export function akashicVeilweavingDefault(className: string): AbilityKey {
  for (const word of (className ?? "").toLowerCase().split(/[^a-z]+/)) {
    const hit = AKASHIC_VEILWEAVING_DEFAULTS[word];
    if (hit) return hit as AbilityKey;
  }
  return "cha";
}

export const akashicClassEntrySchema = z.object({
  id: z.string(),
  className: z.string().default(""),
  classLevel: z.number().int().min(0).default(0),
  /** The class's veilweaving ability — drives its veils' save DCs (Int=Vizier, Wis=Guru, …). */
  veilweavingAbility: abilityKeySchema.default("cha"),
  /** Cached CURRENT values at classLevel (the PoW-maxes pattern — seeded from the class's
   * progression columns at add/level time, NOT stored tables). */
  essenceMax: z.number().int().min(0).optional(),
  veilsShapedMax: z.number().int().min(0).optional(),
  /** Additive per-receptacle essence-capacity bonus from class features ("Improved essence
   * capacity +N" — most akashic classes carry it). Raises the character-level cap for veils this
   * class shaped; seeded from the progression's Special column, absent/0 = no bonus. */
  capacityBonus: z.number().int().min(0).optional(),
  /** Chakra binds this class has unlocked (slot names, free strings — nonstandard slots exist). */
  unlockedBinds: z.array(z.string()).default([]),
  /** Links a `threepp_class_compendium` row (rename-proof, like spellcasterEntry.presetKey). */
  compendiumId: z.string().optional(),
  notes: z.string().optional(),
});
export type AkashicClassEntry = z.infer<typeof akashicClassEntrySchema>;

/** A veil the character knows (mirrors spellRef/powManeuver's cached-detail pattern — the picker
 * caches the compendium row's fields so the sheet renders with no DB round-trip). ~395 supplement
 * rows are metadata-only BY DESIGN (empty effect) — render "Text in {source}", never fake rules. */
export const akashicVeilRefSchema = z.object({
  id: z.string(),
  /** Links an `akashic_veil_compendium` row (pick cache). */
  compendiumId: z.string().optional(),
  name: z.string().default(""),
  /** Slots this veil MAY be shaped into (free strings — "Storm"/"Interface"/"Special" exist). */
  slots: z.array(z.string()).default([]),
  descriptors: z.string().optional(),
  effect: z.string().optional(),
  bindEffect: z.string().optional(),
  /** Which class veil lists it came from (the `akashic_veil_class_list` junction). */
  classNames: z.array(z.string()).optional(),
  source: z.string().optional(),
  custom: z.boolean().optional(),
  notes: z.string().optional(),
});
export type AkashicVeilRef = z.infer<typeof akashicVeilRefSchema>;

/** A veil in today's shaped loadout: one chosen slot (multi-slot veils pick ONE at shape time),
 * invested essence, and the bind flag. Automation formula values may use `@{essenceInvested}` —
 * the engine injects it as a per-veil resolver local so bonuses scale with the live investment. */
export const shapedVeilSchema = z.object({
  id: z.string(),
  /** → akashicVeilRefSchema.id */
  veilId: z.string(),
  /** Which akashic class shaped it — save-DC attribution (blank → the first class). */
  classId: z.string().optional(),
  slot: z.string().default(""),
  essenceInvested: z.number().int().min(0).default(0),
  /** Additive capacity bonus for THIS receptacle only (feats/binds that raise one veil's cap). */
  capacityBonus: z.number().int().min(0).optional(),
  bound: z.boolean().default(false),
  enabled: z.boolean().default(true),
  automation: z.array(automationEffectSchema).default([]),
  /** Custom save-DC formula; blank → the engine default
   * "10 + @{essenceInvested} + @{veilweavingMod}" (both injected as resolver locals). */
  saveDcFormula: z.string().optional(),
});
export type ShapedVeil = z.infer<typeof shapedVeilSchema>;

/** A non-veil essence receptacle (feat / class feature / item) essence can be poured into. */
export const otherReceptacleSchema = z.object({
  id: z.string(),
  label: z.string().default(""),
  essenceInvested: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});
export type OtherReceptacle = z.infer<typeof otherReceptacleSchema>;

export const akashicBlockSchema = z.object({
  classes: z.array(akashicClassEntrySchema).default([]),
  veilsKnown: z.array(akashicVeilRefSchema).default([]),
  shaped: z.array(shapedVeilSchema).default([]),
  otherReceptacles: z.array(otherReceptacleSchema).default([]),
  /** Temporary essence (veilshifting, class capstones) added to the pool total. */
  temporaryEssence: z.number().int().default(0),
  notes: z.string().optional(),
});
export type AkashicBlock = z.infer<typeof akashicBlockSchema>;
