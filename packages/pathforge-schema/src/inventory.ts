import { z } from "zod";
import { automationEffectSchema, modifierEntrySchema, sourceRefSchema } from "./common";

/** The 13 core PF1e wondrous-item body slots. Free-string storage (KNOWN_CHAKRA_SLOTS precedent,
 * akashic.ts) — homebrew/imported slot names are never rejected; this list only drives the UI +
 * the known-slot grouping/label lookup. */
export const EQUIP_SLOT_KEYS = [
  "belt", "body", "chest", "eyes", "feet", "hands", "head", "headband",
  "neck", "shoulders", "wrist", "ring_left", "ring_right",
] as const;
export type EquipSlotKey = (typeof EQUIP_SLOT_KEYS)[number];
export const EQUIP_SLOT_LABELS: Record<string, string> = {
  belt: "Belt", body: "Body", chest: "Chest", eyes: "Eyes", feet: "Feet", hands: "Hands",
  head: "Head", headband: "Headband", neck: "Neck", shoulders: "Shoulders", wrist: "Wrist",
  ring_left: "Ring (left)", ring_right: "Ring (right)",
};

/** Tattoo sub-slots (Inner Sea Magic) — an INDEPENDENT second occupancy track, not a restriction on
 * the main list. Excludes armor/eyes/headband/shield per the owner's brief. */
export const TATTOO_SLOT_KEYS = [
  "belt", "body", "chest", "feet", "hands", "head", "neck", "shoulders",
  "wrist", "ring_left", "ring_right",
] as const;
export type TattooSlotKey = (typeof TATTOO_SLOT_KEYS)[number];

/** §6.11 Inventory and wealth */
export const equipmentItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z
    .enum(["weapon", "armor", "shield", "potion", "scroll", "wand", "magic_item", "gear", "other"])
    .default("gear"),
  quantity: z.number().min(0).default(1),
  weight: z.number().optional(),
  cost: z.string().optional(),
  equipped: z.boolean().optional().default(false),
  /** Armor/shield stats (PF1e). When equipped: armorBonus feeds AC (armor vs shield bonus by
   * category); armorCheckPenalty applies to ACP-affected skills; maxDexBonus caps Dex-to-AC. */
  armorBonus: z.number().int().optional(),
  maxDexBonus: z.number().int().optional(),
  armorCheckPenalty: z.number().int().optional(),
  /** Free string (light/medium/heavy/shield expected, homebrew-tolerant like equipSlot below) — not
   * fed to the engine today, just a descriptive/filter field alongside armorBonus. */
  armorType: z.string().optional(),
  /** Weapon stats (PF1e). When present + equipped, generates a computed attack: attack bonus =
   * BAB + ability + size + enhancement (+ broad attack mods); damage = dice + ability (×1.5 two-
   * handed, ×0.5 off-hand, none for ranged) + enhancement. */
  weapon: z
    .object({
      ranged: z.boolean().default(false),
      attackAbility: z.enum(["str", "dex"]).default("str"),
      damageDice: z.string().optional(),
      damageAbility: z.enum(["str", "dex", "none"]).default("str"),
      handed: z.enum(["one", "two", "off", "light"]).default("one"),
      enhancement: z.number().int().default(0),
      critRange: z.string().optional(),
      critMultiplier: z.string().optional(),
      damageType: z.string().optional(),
      range: z.string().optional(),
      /** PF1e fighter weapon group (free string — "Heavy Blades", "Bows", homebrew groups too). */
      weaponGroup: z.string().optional(),
    })
    .optional(),
  containerId: z.string().optional(),
  description: z.string().optional(),
  /** Track A: which of the 13 wondrous slots this item occupies when equipped. Free string — see
   * EQUIP_SLOT_KEYS for the known list; an unrecognized value still renders (as "Other"/unassigned in
   * the doll) rather than being rejected. Leave unset for slotless items (most potions/gear/many rings
   * that explicitly don't take the ring slot — rare but real). */
  equipSlot: z.string().optional(),
  /** Track B: the Inner Sea Magic tattoo sub-slot this item occupies, if it's a tattoo. Independent of
   * equipSlot — a belt-tattoo and a belt-slot wondrous item can be worn simultaneously. */
  tattooSlot: z.string().optional(),
  /** Track D: hands consumed when this is a non-weapon HELD item (staff/rod/wand-as-held). Weapons
   * already encode this via weapon.handed; this field exists for items with no `weapon` block. */
  heldSlot: z.enum(["one_hand", "two_hand"]).optional(),
  /** Wondrous-item statblock flavor (aura/CL/construction) — descriptive only, does not feed the
   * engine. A magic item's mechanical effect goes through `modifiers`/`automation` exactly like any
   * other item; this block only adds the text a Spellcraft check or Item Creation feat cares about. */
  wondrous: z
    .object({
      auraSchool: z.string().optional(),
      /** Free string, NOT an enum (review finding, reproduced): a strict enum here made a single
       * mis-cased "Faint" — the natural casing of every PF1e statblock — fail the ENTIRE character
       * parse on save/load/import. The canonical faint|moderate|strong|overwhelming set lives in
       * AURA_STRENGTHS below as a UI-level suggestion list, same tolerance as equipSlot above. */
      auraStrength: z.string().optional(),
      casterLevel: z.number().int().optional(),
      constructionRequirements: z.string().optional(),
      constructionCost: z.string().optional(),
    })
    .optional(),
  /** Effects this item applies while equipped/active. */
  automation: z.array(automationEffectSchema).default([]),
  modifiers: z.array(modifierEntrySchema).default([]),
  identified: z.boolean().optional().default(true),
  source: sourceRefSchema.optional(),
  notes: z.string().optional(),
  /** Links a compendium row this item was applied from (same linkage convention as
   * featEntry/traitEntry/spellRef.compendiumId) — populated once a future magic-item picker exists. */
  compendiumId: z.string().optional(),
});
export type EquipmentItem = z.infer<typeof equipmentItemSchema>;

/** The canonical PF1e aura strengths — a UI suggestion list for `wondrous.auraStrength` (which is
 * deliberately a free string in the schema; see the field comment). */
export const AURA_STRENGTHS = ["faint", "moderate", "strong", "overwhelming"] as const;

export const containerEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.string().optional(),
  reducesWeight: z.boolean().optional(),
  notes: z.string().optional(),
});
export type ContainerEntry = z.infer<typeof containerEntrySchema>;

export const inventoryBlockSchema = z.object({
  weapons: z.array(equipmentItemSchema).default([]),
  armorAndShields: z.array(equipmentItemSchema).default([]),
  potionsScrollsMagicItems: z.array(equipmentItemSchema).default([]),
  gear: z.array(equipmentItemSchema).default([]),
  otherItems: z.array(equipmentItemSchema).default([]),
  containers: z.array(containerEntrySchema).default([]),
  encumbrance: z
    .object({
      lightLoad: z.string().optional(),
      mediumLoad: z.string().optional(),
      heavyLoad: z.string().optional(),
      liftOverHead: z.string().optional(),
      liftOffGround: z.string().optional(),
      dragOrPush: z.string().optional(),
      formula: z.string().optional(),
    })
    .default({}),
  settings: z
    .object({
      /** Hands available for holding weapons/staves/rods. Default 2; raise for multi-armed creatures
       * (some monstrous PCs / templates), lower for one-handed builds. Warn-only, never blocks equipping. */
      handsAvailable: z.number().int().min(0).default(2),
    })
    .default({}),
});
export type InventoryBlock = z.infer<typeof inventoryBlockSchema>;

export const wealthBlockSchema = z.object({
  cp: z.number().default(0),
  sp: z.number().default(0),
  gp: z.number().default(0),
  pp: z.number().default(0),
  otherCurrencies: z.array(z.object({ label: z.string(), amount: z.number() })).default([]),
  valuables: z
    .array(z.object({ name: z.string(), value: z.string().optional(), notes: z.string().optional() }))
    .default([]),
  carriedStoredSplit: z
    .object({
      carried: z.record(z.string(), z.number()),
      stored: z.record(z.string(), z.number()),
    })
    .optional(),
});
export type WealthBlock = z.infer<typeof wealthBlockSchema>;
