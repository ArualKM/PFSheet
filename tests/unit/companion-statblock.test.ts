import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { applyCompanionStatblock, type FamiliarCompendiumRow } from "@/lib/character/companion-statblock";
import type { CompanionStatblockRow } from "@/lib/character/companion-sync";

/**
 * The unified, type-aware statblock apply that backs BOTH createCompanionAction (server, at
 * companion create) and the editor's <CompanionStatblockPicker> (client, re-picking a statblock on
 * an existing companion). See lib/character/companion-statblock.ts.
 */

const WOLF: CompanionStatblockRow = {
  slug: "wolf",
  name: "Wolf",
  size: "Medium",
  speed: "50 ft.",
  ac: "+2 natural armor",
  attack: "bite (1d6 plus trip)",
  ability_scores: "Str 13, Dex 15, Con 15, Int 2, Wis 12, Cha 6",
  special_qualities: "low-light vision, scent",
  advancement: "7th-Level Advancement: Size Large",
};

const BEAR: CompanionStatblockRow = {
  slug: "bear-black",
  name: "Black Bear",
  size: "Medium",
  speed: "40 ft., swim 20 ft.",
  ac: "+3 natural armor",
  attack: "2 claws (1d3 plus grab), bite (1d4)",
  ability_scores: "Str 15, Dex 15, Con 13, Int 2, Wis 12, Cha 6",
  special_qualities: "low-light vision, scent",
  advancement: "4th-Level Advancement: Size Large",
};

const CAT: FamiliarCompendiumRow = {
  slug: "cat",
  name: "Cat",
  granted_ability: "Master gains a +3 bonus on Stealth checks | Animal Archive pg. 10, PRPG Core Rulebook pg. 82",
};

const RAVEN: FamiliarCompendiumRow = {
  slug: "raven",
  name: "Raven",
  granted_ability: "Master gains a +3 bonus on Perception checks | PRPG Core Rulebook pg. 52",
};

const IMPROVED_FAMILIAR: FamiliarCompendiumRow = {
  slug: "improved-fake",
  name: "Improved Familiar",
  // Improved familiars store alignment/CL requirement here, NOT a benefit.
  granted_ability: "Lawful evil | 7th",
};

describe("applyCompanionStatblock — familiar row", () => {
  it("sets the base body, master benefit, compendiumId, and race — without touching unrelated fields", () => {
    const c = createDefaultCharacter({ name: "Whiskers" });
    c.identity.deity = "Pharasma"; // unrelated field the row is silent on — must survive
    c.identity.alignment = "N";

    applyCompanionStatblock(c, CAT, "familiar");

    expect(c.identity.race).toBe("Cat");
    expect(c.identity.deity).toBe("Pharasma");
    expect(c.identity.alignment).toBe("N");
    expect(c.identity.size).toBe("tiny"); // FAMILIAR_BASE_BODIES.cat
    expect(c.abilities.primary.str.score).toBe(3);
    expect(c.abilities.primary.dex.score).toBe(15);
    expect(c.combat.attacks.map((a) => a.name)).toContain("bite");

    expect(c.companion?.type).toBe("familiar");
    expect(c.companion?.compendiumId).toBe("cat");
    expect(c.companion?.masterBenefit?.effects).toEqual([{ target: "skill.stealth", value: 3, note: undefined }]);
    expect(c.features.list.some((f) => f.name === "Master benefit")).toBe(true);

    // Review fixes: the applied creature name is recorded independently of the editable
    // identity.race, and raceApplied is stamped (name-matching, zero PC-race ability mods) so
    // IdentityEditor's "race not applied" banner can't false-positive on statblock companions —
    // and a stale PC-race revert can't corrupt the statblock's wholesale-written scores.
    expect(c.companion?.statblockName).toBe("Cat");
    expect(c.identity.raceApplied).toEqual({ name: "Cat", abilityMods: {} });
  });

  it("an improved familiar (no 'master gains' text) gets a body but no master benefit", () => {
    const c = createDefaultCharacter({ name: "Grimalkin" });
    applyCompanionStatblock(c, IMPROVED_FAMILIAR, "familiar");
    expect(c.identity.race).toBe("Improved Familiar");
    expect(c.companion?.compendiumId).toBe("improved-fake");
    expect(c.companion?.masterBenefit).toBeUndefined();
    expect(c.features.list.some((f) => f.name === "Master benefit")).toBe(false);
  });
});

describe("applyCompanionStatblock — animal-companion row", () => {
  it("applies ability scores, size, speed, natural armor, and attacks from the statblock", () => {
    const c = createDefaultCharacter({ name: "Fang" });
    applyCompanionStatblock(c, WOLF, "animal_companion");

    expect(c.identity.race).toBe("Wolf");
    expect(c.identity.size).toBe("medium");
    expect(c.abilities.primary.str.score).toBe(13);
    expect(c.combat.speed.base).toBe("50 ft.");
    expect(c.defenses.armorClass.conditionalModifiers.find((m) => m.id === "ac_natural")?.value).toBe(2);
    expect(c.combat.attacks.map((a) => a.name)).toContain("bite");

    expect(c.companion?.type).toBe("animal_companion");
    expect(c.companion?.compendiumId).toBe("wolf");
    expect(c.companion?.masterBenefit).toBeUndefined();
  });

  it("mount uses the same animal-companion apply path", () => {
    const c = createDefaultCharacter({ name: "Steed" });
    applyCompanionStatblock(c, WOLF, "mount");
    expect(c.companion?.type).toBe("mount");
    expect(c.identity.race).toBe("Wolf");
  });

  it("preserves a manually-added attack and companion fields the row doesn't own (archetype/syncEnabled)", () => {
    const c = createDefaultCharacter({ name: "Fang" });
    c.combat.attacks.push({
      id: "atk_manual_1",
      name: "Improvised club",
      attackType: "melee",
      damageFormula: "1d4",
      enabled: true,
      conditionalModifiers: [],
      showInCombat: true,
    });
    c.companion = { type: "animal_companion", archetype: undefined, syncEnabled: false };

    applyCompanionStatblock(c, WOLF, "animal_companion");

    const names = c.combat.attacks.map((a) => a.name);
    expect(names).toContain("Improvised club");
    expect(names).toContain("bite");
    expect(c.companion?.syncEnabled).toBe(false); // carried forward, not clobbered
  });
});

describe("applyCompanionStatblock — re-apply a DIFFERENT statblock replaces the derived fields", () => {
  it("animal companion: a second, different creature swaps attacks/features rather than stacking them", () => {
    const c = createDefaultCharacter({ name: "Companion" });
    applyCompanionStatblock(c, WOLF, "animal_companion");
    expect(c.combat.attacks.map((a) => a.name)).toEqual(["bite"]);
    expect(c.combat.attacks[0]?.damageFormula).toBe("1d6 plus trip");
    expect(c.features.list.filter((f) => f.name === "Special qualities")).toHaveLength(1);

    applyCompanionStatblock(c, BEAR, "animal_companion");

    expect(c.identity.race).toBe("Black Bear");
    expect(c.abilities.primary.str.score).toBe(15); // the bear's Str, not the wolf's 13
    expect(c.defenses.armorClass.conditionalModifiers.find((m) => m.id === "ac_natural")?.value).toBe(3);
    // The wolf's bite is gone; only the bear's two attacks remain.
    expect(c.combat.attacks.map((a) => a.name).sort()).toEqual(["2 claws", "bite"]);
    expect(c.combat.attacks.some((a) => a.damageFormula === "1d6 plus trip")).toBe(false);
    // Exactly one set of statblock-derived features (not the wolf's + the bear's stacked).
    expect(c.features.list.filter((f) => f.name === "Special qualities")).toHaveLength(1);
    expect(c.features.list.filter((f) => f.name === "Advancement")).toHaveLength(1);
  });

  it("familiar: a second, different familiar replaces the master benefit — and a benefit-less pick clears it", () => {
    const c = createDefaultCharacter({ name: "Whiskers" });
    applyCompanionStatblock(c, CAT, "familiar");
    expect(c.companion?.masterBenefit?.effects[0]).toMatchObject({ target: "skill.stealth", value: 3 });

    applyCompanionStatblock(c, RAVEN, "familiar");
    expect(c.identity.race).toBe("Raven");
    expect(c.companion?.masterBenefit?.effects[0]).toMatchObject({ target: "skill.perception", value: 3 });
    // Only one "Master benefit" feature survives — the stale cat one was replaced, not stacked.
    expect(c.features.list.filter((f) => f.name === "Master benefit")).toHaveLength(1);

    applyCompanionStatblock(c, IMPROVED_FAMILIAR, "familiar");
    expect(c.identity.race).toBe("Improved Familiar");
    expect(c.companion?.masterBenefit).toBeUndefined(); // no "master gains" text → benefit cleared
    expect(c.features.list.some((f) => f.name === "Master benefit")).toBe(false);
  });
});
