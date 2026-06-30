import type { PathForgeCharacterV1 } from "@pathforge/schema";

/**
 * Phase 7 — races. Applying a race sets its ability modifiers (added to the base score the engine reads),
 * size and speed, and grants its standard racial traits as one feature (the dataset gives them as prose, not
 * discrete rows). Re-applying a different race first reverts the prior one via `identity.raceApplied`.
 */

const ABILITY_BY_NAME: Record<string, string> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

/**
 * "+2 Constitution, +2 Wisdom, −2 Charisma" → { con: 2, wis: 2, cha: -2 }. The dataset's minus sign is often a
 * mangled replacement char (U+FFFD), so any sign that isn't "+" (incl. a missing/garbled one before a named
 * penalty) is treated as negative — except a bare number with no sign, which is positive. Flexible bonuses
 * ("+2 to one ability of your choice") have no ability name and are skipped (the player assigns them).
 */
export function parseAbilityMods(raw: string | null | undefined): Record<string, number> {
  const mods: Record<string, number> = {};
  // Sign class built via RegExp so the unicode minus (U+2212) + the dataset's mangled minus (U+FFFD) are
  // explicit escapes, not literal source chars: + / - / − / �.
  // Negative ability mods in the dataset use a dash that may be a hyphen, figure/en/em-dash, true minus, or a
  // mangled replacement char — match them all (built via RegExp so the escapes are explicit, not source chars).
  // The sign is REQUIRED so a stray "1 Strength" in prose can't be misread as a +1 mod (real mods are signed).
  const re = new RegExp(
    "([+\\u2012\\u2013\\u2014\\u2212\\uFFFD-])\\s*(\\d+)\\s*(strength|dexterity|constitution|intelligence|wisdom|charisma)",
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(raw ?? ""))) !== null) {
    const key = ABILITY_BY_NAME[m[3]!.toLowerCase()];
    if (!key) continue;
    const sign = m[1] === "+" || m[1] === undefined ? 1 : -1;
    mods[key] = sign * parseInt(m[2]!, 10);
  }
  return mods;
}

export type RaceApplyResult = { abilityMods: Record<string, number>; size?: string; speed?: number; reverted?: string };

export function applyRace(
  character: PathForgeCharacterV1,
  opts: {
    race: { name: string; compendiumId?: string };
    abilityMods: Record<string, number>;
    size?: string;
    speed?: number;
    standardTraits?: string;
  },
): RaceApplyResult {
  const prim = character.abilities.primary as unknown as Record<string, { score: number } | undefined>;

  // 1. Revert the previously-applied race (undo its score deltas + remove its traits feature).
  const prev = character.identity.raceApplied;
  let reverted: string | undefined;
  if (prev) {
    for (const [k, v] of Object.entries(prev.abilityMods)) {
      const a = prim[k];
      if (a) a.score -= v;
    }
    if (prev.traitFeatureId) character.features.list = character.features.list.filter((f) => f.id !== prev.traitFeatureId);
    reverted = prev.name;
  }

  // 2. Apply the new race's ability modifiers to the base score the engine reads.
  const applied: Record<string, number> = {};
  for (const [k, v] of Object.entries(opts.abilityMods)) {
    const a = prim[k];
    if (a) {
      a.score += v;
      applied[k] = v;
    }
  }

  // 3. Size + speed.
  if (opts.size) character.identity.size = opts.size;
  if (opts.speed != null && Number.isFinite(opts.speed)) character.combat.speed.base = `${opts.speed} ft`;

  // 4. Standard traits → one feature (prose).
  let traitFeatureId: string | undefined;
  if (opts.standardTraits && opts.standardTraits.trim()) {
    traitFeatureId = `racetraits_${opts.race.compendiumId ?? opts.race.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    character.features.list = character.features.list.filter((f) => f.id !== traitFeatureId);
    character.features.list.push({
      id: traitFeatureId,
      name: `${opts.race.name} racial traits`,
      category: "racial_trait",
      description: opts.standardTraits.replace(/<br>/g, "\n"),
      automation: [],
    });
  }

  character.identity.race = opts.race.name;
  character.identity.raceApplied = {
    name: opts.race.name,
    compendiumId: opts.race.compendiumId,
    abilityMods: applied,
    traitFeatureId,
  };
  return { abilityMods: applied, size: opts.size, speed: opts.speed, reverted };
}
