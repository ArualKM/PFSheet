import { z } from "zod";
import { automationEffectSchema, sourceRefSchema } from "./common";

/** §18 Path of War (Dreamscarred Press) — a Tome-of-Battle-style martial initiator system: classes
 * learn discrete MANEUVERS (levels 1–9, drawn from 20 disciplines) plus persistent STANCES.
 * Initiator level (full initiating-class level + ½ other levels) gates the highest maneuver level;
 * save DC = 10 + maneuver level + initiation modifier. Gated by isModuleKeyEnabled(c, "path_of_war").
 * Maneuvers are the discrete options → the future pow_maneuver_compendium + picker. */

export const POW_RECOVERY_METHODS = [
  "warlord_gambit",
  "warder_defensive_focus",
  "stalker_full_round",
  "standard_action",
  "custom",
] as const;
export type PowRecoveryMethod = (typeof POW_RECOVERY_METHODS)[number];

/** Default initiation ability per initiating class (lowercased class name → ability key).
 * Warlord/Zealot key off CHA, Stalker/Mystic/Medic off WIS, Warder/Harbinger off INT. */
export const POW_INITIATION_DEFAULTS: Record<string, string> = {
  warlord: "cha",
  stalker: "wis",
  warder: "int",
  zealot: "cha",
  mystic: "wis",
  harbinger: "int",
  medic: "wis",
};

export const powInitiatorSchema = z.object({
  id: z.string(),
  className: z.string().default(""),
  /** Links a future PoW class-catalog preset (rename-proof, like spellcasterEntry.presetKey). */
  presetKey: z.string().optional(),
  classLevel: z.number().int().min(0).default(0),
  /** Initiation ability key ("cha"/"wis"/"int"/…). Blank → derived from the class name via
   * POW_INITIATION_DEFAULTS (see powInitiationAbility). */
  initiationAbility: z.string().default(""),
  /** Manual initiator-level formula override; blank = the engine derives it
   * (class level + ½ all other levels, capped at character level). */
  initiatorLevelFormula: z.string().optional(),
  maneuversKnownMax: z.number().int().min(0).optional(),
  maneuversReadiedMax: z.number().int().min(0).optional(),
  /** GRANTED is a separately-counted draw (round-start) layered on top of readied — its max must
   * never share the readied cap. */
  maneuversGrantedMax: z.number().int().min(0).optional(),
  stancesKnownMax: z.number().int().min(0).optional(),
  recoveryMethod: z.enum(POW_RECOVERY_METHODS).default("standard_action"),
  /** Discipline slugs this class grants access to (e.g. "broken_blade"). */
  disciplineKeys: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type PowInitiator = z.infer<typeof powInitiatorSchema>;

/** The effective initiation ability for an initiator: the explicit key when set, else the
 * per-class default (Warlord→cha, Stalker→wis, Warder→int, …), else "wis". */
export function powInitiationAbility(
  initiator: Pick<PowInitiator, "initiationAbility" | "className">,
): string {
  const explicit = (initiator.initiationAbility ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  return POW_INITIATION_DEFAULTS[(initiator.className ?? "").trim().toLowerCase()] ?? "wis";
}

/** A maneuver or stance (mirrors spellRef's cached-detail pattern — the picker caches the
 * compendium row's detail fields so the sheet renders with no DB round-trip). The
 * known/readied/granted/expended lifecycle is PER-ENTRY BOOLEANS, explicitly NOT a fungible
 * resource pool (S4 decision). */
export const powManeuverSchema = z.object({
  id: z.string(),
  /** Links a future pow_maneuver_compendium row (pick cache). */
  compendiumId: z.string().optional(),
  name: z.string().default(""),
  /** Maneuver level 1–9 (stances use the same scale). */
  level: z.number().int().min(1).max(9).default(1),
  discipline: z.string().optional(),
  /** Which initiator (PoW class) granted it — sole-initiator attributable, like a spell's casterId. */
  initiatorId: z.string().optional(),
  entryKind: z.enum(["maneuver", "stance"]).default("maneuver"),
  /** Strike / Boost / Counter / … (cached from the compendium at pick time). */
  maneuverType: z.string().optional(),
  initiationAction: z.string().optional(),
  range: z.string().optional(),
  target: z.string().optional(),
  duration: z.string().optional(),
  savingThrow: z.string().optional(),
  prerequisites: z.string().optional(),
  description: z.string().optional(),
  /** Custom save-DC formula; blank → the engine default "10 + @{maneuverLevel} + @{initiationMod}"
   * (both injected as resolver locals — @{maneuverLevel} is always THIS maneuver's level). */
  saveDcFormula: z.string().optional(),
  /** Wielding the discipline's favored weapon: +2 competence to this maneuver's save DC (S4 §266.3
   * — an off-by-default toggle, applied on top of the default OR a custom formula). */
  favoredWeaponBonus: z.boolean().optional(),
  // Lifecycle: KNOWN (in the list) → READIED (the prepared subset) → EXPENDED on initiation;
  // GRANTED is the separately-counted draw some classes use. stanceActive marks the active stance.
  readied: z.boolean().default(false),
  expended: z.boolean().default(false),
  granted: z.boolean().default(false),
  stanceActive: z.boolean().default(false),
  /** Automation effects (same shape as a feat's). The engine ingests these ONLY while the entry is
   * an ACTIVE STANCE (entryKind "stance" + stanceActive) — strikes/boosts are spendable,
   * per-initiation effects and are NEVER auto-applied to totals (S4 hard rule). */
  automation: z.array(automationEffectSchema).default([]),
  source: sourceRefSchema.optional(),
  notes: z.string().optional(),
});
export type PowManeuver = z.infer<typeof powManeuverSchema>;

export const pathOfWarBlockSchema = z.object({
  initiators: z.array(powInitiatorSchema).default([]),
  maneuvers: z.array(powManeuverSchema).default([]),
  notes: z.string().optional(),
});
export type PathOfWarBlock = z.infer<typeof pathOfWarBlockSchema>;
