import { isModuleKeyEnabled, type PathForgeCharacterV1 } from "@pathforge/schema";

/**
 * The owner's 3pp gating rule (docs/3PP_MASTER_PLAN.md D1): third-party compendium rows appear
 * in CHARACTER-CONTEXT surfaces (editor pickers, import matching) ONLY when the character has
 * that system's module enabled. This maps enabled module keys → the `system` tags carried by
 * every threepp_* compendium row.
 *
 * `other` / `rune_magic` rows have no module and never surface in pickers (browse-only) —
 * a future misc-3pp toggle could open them.
 */
export type ThreeppSystem = "psionic" | "path_of_war" | "akashic" | "spheres";

const MODULE_TO_SYSTEM: [moduleKey: string, system: ThreeppSystem][] = [
  ["psionics", "psionic"],
  ["path_of_war", "path_of_war"],
  ["akashic", "akashic"],
  ["spheres_of_power", "spheres"],
  ["spheres_of_might", "spheres"],
  ["spheres_of_guile", "spheres"],
];

export function enabledThreeppSystems(character: PathForgeCharacterV1): ThreeppSystem[] {
  const out = new Set<ThreeppSystem>();
  for (const [key, system] of MODULE_TO_SYSTEM) {
    if (isModuleKeyEnabled(character, key)) out.add(system);
  }
  return [...out];
}

/** Human labels for source badges on gated picker rows. */
export const THREEPP_SYSTEM_LABEL: Record<ThreeppSystem, string> = {
  psionic: "Psionics",
  path_of_war: "Path of War",
  akashic: "Akashic",
  spheres: "Spheres",
};
