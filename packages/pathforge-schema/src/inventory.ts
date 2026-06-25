import { z } from "zod";
import { automationEffectSchema, modifierEntrySchema, sourceRefSchema } from "./common";

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
  containerId: z.string().optional(),
  description: z.string().optional(),
  /** Effects this item applies while equipped/active. */
  automation: z.array(automationEffectSchema).default([]),
  modifiers: z.array(modifierEntrySchema).default([]),
  identified: z.boolean().optional().default(true),
  source: sourceRefSchema.optional(),
  notes: z.string().optional(),
});
export type EquipmentItem = z.infer<typeof equipmentItemSchema>;

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
