import { z } from "zod";

/** §18 optional subsystem — Stamina & Combat Tricks (Pathfinder Unchained). A martial character with
 * the Combat Stamina feat (or a class feature) gets a stamina pool = base attack bonus + Constitution
 * modifier, spent to power "combat tricks" attached to combat feats they already have. The pool
 * refreshes fully after a rest, and partially after a full-attack or a turn spent doing nothing else. */

export const staminaBlockSchema = z.object({
  current: z.number().int().min(0).default(0),
  /** Bonus to the maximum beyond BAB + Con (extra ranks, feats, class features). */
  bonusMax: z.number().int().default(0),
});
export type StaminaBlock = z.infer<typeof staminaBlockSchema>;

/** A small reference of common combat tricks (informational — the spend is declared, not auto-applied).
 * `featKey` matches against the character's combat feats by normalized name. */
export const COMBAT_TRICKS: { feat: string; cost: string; effect: string }[] = [
  { feat: "Power Attack", cost: "varies", effect: "Reduce the penalty by 1, or boost the damage bonus." },
  { feat: "Combat Expertise", cost: "varies", effect: "Increase the dodge AC bonus without the attack penalty." },
  { feat: "Cleave", cost: "2", effect: "Don't take the −2 AC penalty until your next turn." },
  { feat: "Vital Strike", cost: "5", effect: "Add your weapon's critical modifier to the extra dice." },
  { feat: "Dodge", cost: "2", effect: "Increase the dodge bonus to AC by 1 (max +3) until your next turn." },
  { feat: "Mobility", cost: "4", effect: "Avoid an attack of opportunity entirely while moving." },
  { feat: "Spring Attack", cost: "5", effect: "Move your speed again after the attack." },
  { feat: "Deadly Aim", cost: "varies", effect: "Reduce the penalty by 1, or boost the damage bonus." },
];
