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
  /** A bonus (free) talent — granted by a drawback/tradition; shown separately and NOT counted against
   * the talents-known budget (excluded from combat/skill talents "spent"). */
  bonus: z.boolean().optional(),
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

/** A drawback/boon's system from its side-table meta (default Magic) — groups it into a system card. */
export function grantSystem(name: string, meta?: Record<string, SphereGrantMeta>): SphereSystem {
  return (meta?.[name]?.system as SphereSystem) ?? "Magic";
}

/** Names of the drawbacks + boons that specifically target one sphere/talent (by id) — for the
 * "drawback applies here" flag. Pure + returns plain string arrays (safe for the view-model / API). */
export function grantsTargeting(
  block: Pick<SpheresBlock, "drawbacks" | "boons" | "drawbackMeta" | "boonMeta">,
  kind: SphereGrantTarget["kind"],
  id: string,
): { drawbacks: string[]; boons: string[] } {
  const hits = (meta?: SphereGrantMeta) => meta?.appliesTo?.kind === kind && meta.appliesTo.id === id;
  return {
    drawbacks: block.drawbacks.filter((d) => hits(block.drawbackMeta?.[d])),
    boons: block.boons.filter((b) => hits(block.boonMeta?.[b])),
  };
}

/** A drawback/boon can apply to a specific sphere or talent (by its stable id) instead of the whole
 * tradition — surfaced as a "drawback applies here" flag on that option in the editor + read view. */
export const sphereGrantTargetSchema = z.object({
  kind: z.enum(["sphere", "talent"]),
  id: z.string(),
});
export type SphereGrantTarget = z.infer<typeof sphereGrantTargetSchema>;

/** Side-table metadata for one drawback/boon, keyed by its NAME. drawbacks/boons stay string[] (so the
 * 3-way merge + tradition-grant provenance are unchanged); this just layers optional grouping + targeting
 * on top. `system` sorts it into the right system card; `appliesTo` flags the sphere/talent it affects. */
export const sphereGrantMetaSchema = z.object({
  system: z.enum(["Magic", "Combat", "Skill"]).optional(),
  appliesTo: sphereGrantTargetSchema.optional(),
  /** Free-text annotation shown on the chip, e.g. "+1 talent" or "−2 vs fire" (the mockup's "→ …"). */
  note: z.string().optional(),
});
export type SphereGrantMeta = z.infer<typeof sphereGrantMetaSchema>;

/** One system's tradition (Spheres of Power has casting traditions; Might/Guile use the same slot for
 * their practice). `grants` is the provenance of the drawback/boon NAMES this tradition contributed, so
 * switching A→B replaces them. Per-system so a caster's casting tradition ≠ their martial practice. */
export const sphereTraditionEntrySchema = z.object({
  name: z.string().default(""),
  custom: z.boolean().optional(),
  grants: z.object({ drawbacks: z.array(z.string()), boons: z.array(z.string()) }).optional(),
});
export type SphereTraditionEntry = z.infer<typeof sphereTraditionEntrySchema>;

export const spheresBlockSchema = z.object({
  casterClasses: z.array(sphereCasterClassSchema).default([]),
  spheres: z.array(sphereChoiceSchema).default([]),
  talents: z.array(sphereTalentRefSchema).default([]),
  /** @deprecated legacy single (casting) tradition — read via systemTradition() as the Magic fallback
   * until migrated; new edits write `traditions` per system. Kept for back-compat with old sheets. */
  tradition: z.string().optional(),
  /** Per-system traditions (Magic/Combat/Skill). The source of truth going forward. */
  traditions: z.record(z.enum(["Magic", "Combat", "Skill"]), sphereTraditionEntrySchema).optional(),
  /** True when the (legacy Magic) tradition was hand-built rather than applied from a preset. */
  traditionCustom: z.boolean().optional(),
  drawbacks: z.array(z.string()).default([]),
  boons: z.array(z.string()).default([]),
  /** Per-name side-tables (see sphereGrantMetaSchema): grouping by system + per-option targeting. */
  drawbackMeta: z.record(z.string(), sphereGrantMetaSchema).optional(),
  boonMeta: z.record(z.string(), sphereGrantMetaSchema).optional(),
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

/** One system's tradition: the per-system entry if set, else (for Magic only) the legacy single-tradition
 * fields as a fallback so old sheets keep showing their casting tradition under Power. */
export function systemTradition(
  block: Pick<SpheresBlock, "traditions" | "tradition" | "traditionCustom" | "traditionGrants">,
  sys: SphereSystem,
): SphereTraditionEntry | undefined {
  const t = block.traditions?.[sys];
  if (t) return t;
  if (sys === "Magic" && block.tradition) {
    return { name: block.tradition, custom: block.traditionCustom, grants: block.traditionGrants };
  }
  return undefined;
}

/** Set ONE system's tradition + apply its granted drawbacks/boons (tagged to that system via the meta
 * side-table), REPLACING that system's prior grants so A→B doesn't stack. Other systems' traditions +
 * grants are untouched. Clears the legacy Magic fields so the per-system entry is authoritative. Mutates. */
export function applySystemTradition(
  block: SpheresBlock,
  sys: SphereSystem,
  tradition: { name: string; drawbacks: string[]; boons: string[] },
): void {
  const prev = systemTradition(block, sys)?.grants;
  if (prev) {
    block.drawbacks = block.drawbacks.filter((d) => !prev.drawbacks.includes(d));
    block.boons = block.boons.filter((b) => !prev.boons.includes(b));
    if (block.drawbackMeta) for (const d of prev.drawbacks) delete block.drawbackMeta[d];
    if (block.boonMeta) for (const b of prev.boons) delete block.boonMeta[b];
  }
  for (const d of tradition.drawbacks) if (!block.drawbacks.includes(d)) block.drawbacks.push(d);
  for (const b of tradition.boons) if (!block.boons.includes(b)) block.boons.push(b);
  // Tag each grant to this system — but don't STEAL a same-named grant already tagged to another
  // system (a shared name stays in the card that first claimed it).
  const dMeta = { ...(block.drawbackMeta ?? {}) };
  for (const d of tradition.drawbacks) if (!dMeta[d] || dMeta[d].system === sys) dMeta[d] = { ...dMeta[d], system: sys };
  block.drawbackMeta = dMeta;
  const bMeta = { ...(block.boonMeta ?? {}) };
  for (const b of tradition.boons) if (!bMeta[b] || bMeta[b].system === sys) bMeta[b] = { ...bMeta[b], system: sys };
  block.boonMeta = bMeta;
  block.traditions = {
    ...block.traditions,
    [sys]: { name: tradition.name, custom: false, grants: { drawbacks: [...tradition.drawbacks], boons: [...tradition.boons] } },
  };
  if (sys === "Magic") {
    block.tradition = undefined;
    block.traditionCustom = undefined;
    block.traditionGrants = undefined;
  }
}

/** Set a system's tradition name/custom flag without touching grants (manual edits in the editor). */
export function setSystemTraditionFields(
  block: SpheresBlock,
  sys: SphereSystem,
  fields: { name?: string; custom?: boolean },
): void {
  const hadEntry = !!block.traditions?.[sys];
  const cur = systemTradition(block, sys) ?? { name: "" };
  block.traditions = {
    ...block.traditions,
    [sys]: {
      ...cur,
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.custom !== undefined ? { custom: fields.custom } : {}),
    },
  };
  // Clear the legacy Magic fields only on the FIRST migration (when no per-system entry existed yet) —
  // `cur` has just carried their value into traditions.Magic. Clearing unconditionally could orphan a
  // legacy value the other side of a concurrent edit still holds.
  if (sys === "Magic" && !hadEntry) {
    block.tradition = undefined;
    block.traditionCustom = undefined;
    block.traditionGrants = undefined;
  }
}
