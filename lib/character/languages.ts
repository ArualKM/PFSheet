import type { PathForgeCharacterV1 } from "@pathforge/schema";
import type { ComputedCharacter } from "@pathforge/rules-pf1e";

/** Core PF1e languages (Core Rulebook) for quick-pick; players can still type custom/exotic ones. */
export const COMMON_LANGUAGES = [
  "Common",
  "Dwarven",
  "Elven",
  "Gnome",
  "Goblin",
  "Halfling",
  "Orc",
  "Draconic",
  "Sylvan",
  "Celestial",
  "Abyssal",
  "Infernal",
  "Aklo",
  "Aquan",
  "Auran",
  "Giant",
  "Ignan",
  "Terran",
  "Undercommon",
] as const;

export type LanguageBudget = {
  /** Bonus languages from a positive Intelligence modifier (chosen at 1st level). */
  intBonus: number;
  /** Additional languages — one per rank in Linguistics. */
  linguisticsRanks: number;
  /** Total bonus languages a character may learn beyond their racial/starting languages. */
  total: number;
};

/**
 * PF1e bonus-language budget: a character may learn bonus languages equal to their positive
 * Intelligence modifier (chosen at 1st level), plus one per rank in the Linguistics skill.
 * Racial/starting languages are separate, so this is guidance (how many bonus languages you're
 * entitled to), not a hard cap on the list.
 */
export function languageBudget(
  character: PathForgeCharacterV1,
  computed: ComputedCharacter,
): LanguageBudget {
  const intBonus = Math.max(0, computed.abilities.int?.modifier ?? 0);
  const linguisticsRanks =
    character.skills.list.find((s) => s.key === "linguistics")?.ranks ?? 0;
  return { intBonus, linguisticsRanks, total: intBonus + linguisticsRanks };
}
