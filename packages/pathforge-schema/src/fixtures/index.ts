import { createDefaultCharacter } from "../factory";
import type { PathForgeCharacterV1 } from "../character";

/**
 * Minimal, fictional sample character used by tests and Storybook-style previews.
 * Richer seed characters (Kael Viren, Seraphina Dawnmantle, etc.) live in the
 * Supabase seed and are generated against this same schema.
 */
export function sampleFighter(): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: "Brakka Stonejaw", playerName: "Sample" });

  c.identity.race = "Dwarf";
  c.identity.alignment = "LG";
  c.identity.size = "Medium";
  c.identity.classes = [
    { id: "class_fighter", name: "Fighter", level: 6, hitDie: "d10", favoredClass: true },
  ];
  c.identity.totalLevel = 6;

  c.abilities.primary.str = { key: "str", label: "Strength", score: 18, baseScore: 16 };
  c.abilities.primary.con = { key: "con", label: "Constitution", score: 16, baseScore: 14 };
  c.abilities.primary.dex = { key: "dex", label: "Dexterity", score: 12, baseScore: 12 };

  c.combat.bab = { total: 6, progression: "full" };
  c.defenses.savingThrows.fortitude.base = 5;
  c.defenses.savingThrows.reflex.base = 2;
  c.defenses.savingThrows.will.base = 2;

  c.health.maxHp = 58;
  c.health.currentHp = 58;

  return c;
}

export const SAMPLE_CHARACTERS = {
  fighter: sampleFighter,
} as const;
