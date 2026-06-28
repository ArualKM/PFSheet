import { z } from "zod";
import { sourceRefSchema } from "./common";

/** §18 Spheres of Power / Might / Guile (Drop Dead Studios). A point/focus-based modular system:
 * spherecasting classes give a caster level (by High/Mid/Low progression), a spell-point pool, and
 * Magic Skill Bonus/Defense; characters pick spheres and talents (the discrete options → the
 * sphere_* compendium + a later picker). Gated by isModuleKeyEnabled(c, "spheres_of_power" | …). */

export const SPHERE_CASTER_TYPES = ["high", "mid", "low"] as const;
export type SphereCasterType = (typeof SPHERE_CASTER_TYPES)[number];

export const sphereCasterClassSchema = z.object({
  id: z.string(),
  className: z.string().default(""),
  /** Which Spheres system this class advances. Magic → caster level/spell points/MSB; Combat →
   * combat talents (Spheres of Might); Skill → skill talents (Spheres of Guile). */
  system: z.enum(["Magic", "Combat", "Skill"]).default("Magic"),
  /** Progression rate — High/Mid/Low for casters; the same rates are Expert/Adept/Proficient (Might)
   * and 1/Level, 3/4, 1/2 (Guile). All three resolve to full / ⌊3L/4⌋ / ⌊L/2⌋. */
  casterType: z.enum(SPHERE_CASTER_TYPES).default("high"),
  classLevel: z.number().int().min(0).default(0),
  /** Casting ability for spell points + save DC (int/wis/cha) — Magic only. */
  castingAbility: z.string().default("int"),
});
export type SphereCasterClass = z.infer<typeof sphereCasterClassSchema>;

export const sphereChoiceSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  system: z.enum(["Magic", "Combat", "Skill"]).default("Magic"),
  notes: z.string().optional(),
  /** Links to a sphere_compendium row (pick cache). */
  compendiumId: z.string().optional(),
});
export type SphereChoice = z.infer<typeof sphereChoiceSchema>;

export const sphereTalentRefSchema = z.object({
  id: z.string(),
  sphereName: z.string().default(""),
  talentName: z.string().default(""),
  /** Base / Advanced / Legendary, when known. */
  category: z.string().optional(),
  /** Which Spheres system this talent belongs to (Magic/Combat/Skill). Optional and back-compatible:
   * when absent it's inferred from the talent's sphere via talentSystem(); set explicitly when the
   * talent is picked from a system-scoped tab. */
  system: z.enum(["Magic", "Combat", "Skill"]).optional(),
  notes: z.string().optional(),
  /** Links to a sphere_talents row (pick cache). */
  compendiumId: z.string().optional(),
  source: sourceRefSchema.optional(),
});
export type SphereTalentRef = z.infer<typeof sphereTalentRefSchema>;

export type SphereSystem = "Magic" | "Combat" | "Skill";

/** A talent's system: its explicit tag if set, else inferred from its sphere's system, else Magic.
 * Keeps grouping correct for talents saved before the `system` field existed (no migration needed). */
export function talentSystem(
  talent: Pick<SphereTalentRef, "system" | "sphereName">,
  spheres: Array<Pick<SphereChoice, "name" | "system">>,
): SphereSystem {
  if (talent.system) return talent.system;
  const sph = spheres.find((s) => s.name === talent.sphereName);
  return (sph?.system as SphereSystem) ?? "Magic";
}

export const spheresBlockSchema = z.object({
  casterClasses: z.array(sphereCasterClassSchema).default([]),
  spheres: z.array(sphereChoiceSchema).default([]),
  talents: z.array(sphereTalentRefSchema).default([]),
  tradition: z.string().optional(),
  /** True when the tradition was assembled by the player (name + hand-picked drawbacks/boons/talents)
   * rather than applied from a compendium preset — drives the "Custom" framing in the editor. */
  traditionCustom: z.boolean().optional(),
  drawbacks: z.array(z.string()).default([]),
  boons: z.array(z.string()).default([]),
  /** Provenance: the drawback/boon lines the CURRENT tradition contributed, so switching traditions
   * removes the old grants instead of stacking them (manually-added entries are left alone). */
  traditionGrants: z
    .object({ drawbacks: z.array(z.string()), boons: z.array(z.string()) })
    .optional(),
  /** Current spell points; the maximum is derived (Σ class level + casting ability mod + bonus). */
  spellPointsCurrent: z.number().int().optional(),
  bonusSpellPoints: z.number().int().default(0),
  /** Spheres of Might: martial focus is a binary resource (expended to fuel some talents). */
  martialFocus: z.boolean().optional(),
  notes: z.string().optional(),
});
export type SpheresBlock = z.infer<typeof spheresBlockSchema>;

/** Caster level contribution per the Spheres "Table: Caster Level": High = level, Mid = ⌊3·level/4⌋,
 * Low = ⌊level/2⌋ (verified against the imported table for L1–20). */
export function sphereCasterLevel(casterType: SphereCasterType, classLevel: number): number {
  const lvl = Math.max(0, Math.floor(classLevel || 0));
  if (casterType === "high") return lvl;
  if (casterType === "mid") return Math.floor((lvl * 3) / 4);
  return Math.floor(lvl / 2);
}

/** Set a character's tradition and apply its granted drawbacks/boons (as editable lines), REPLACING
 * the previous tradition's grants via `traditionGrants` provenance so A→B doesn't stack. Manually-added
 * drawbacks/boons (not in the prior grants) are preserved. Mutates the block in place. */
export function applyTraditionGrants(
  block: Pick<SpheresBlock, "drawbacks" | "boons" | "tradition" | "traditionGrants">,
  tradition: { name: string; drawbacks: string[]; boons: string[] },
): void {
  const prev = block.traditionGrants;
  if (prev) {
    block.drawbacks = block.drawbacks.filter((d) => !prev.drawbacks.includes(d));
    block.boons = block.boons.filter((b) => !prev.boons.includes(b));
  }
  block.tradition = tradition.name;
  for (const d of tradition.drawbacks) if (!block.drawbacks.includes(d)) block.drawbacks.push(d);
  for (const b of tradition.boons) if (!block.boons.includes(b)) block.boons.push(b);
  block.traditionGrants = { drawbacks: [...tradition.drawbacks], boons: [...tradition.boons] };
}
