import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { parseAbilityMods, applyRace } from "./race-builder";

describe("races (Phase 7)", () => {
  it("parseAbilityMods handles +/- (incl. the dataset's mangled minus U+FFFD) and skips flexible bonuses", () => {
    // The real dataset uses an en-dash (U+2013) for penalties; also cover the true minus (U+2212) + a hyphen.
    expect(parseAbilityMods("+2 Constitution, +2 Wisdom, –2 Charisma")).toEqual({ con: 2, wis: 2, cha: -2 });
    expect(parseAbilityMods("+2 Dexterity, +2 Intelligence, −2 Constitution")).toEqual({ dex: 2, int: 2, con: -2 });
    expect(parseAbilityMods("+2 Strength, -2 Intelligence")).toEqual({ str: 2, int: -2 });
    expect(parseAbilityMods("+2 to one ability score of your choice")).toEqual({}); // flexible → none
    expect(parseAbilityMods("")).toEqual({});
  });

  it("applyRace adds mods to the base score, sets size/speed, grants a traits feature", () => {
    const c = createDefaultCharacter();
    const con0 = c.abilities.primary.con.score;
    const cha0 = c.abilities.primary.cha.score;
    applyRace(c, {
      race: { name: "Dwarves", compendiumId: "dwarves" },
      abilityMods: { con: 2, wis: 2, cha: -2 },
      size: "Medium",
      speed: 20,
      standardTraits: "Slow and steady.<br>Darkvision.",
    });
    expect(c.abilities.primary.con.score).toBe(con0 + 2);
    expect(c.abilities.primary.cha.score).toBe(cha0 - 2);
    expect(c.identity.size).toBe("Medium");
    expect(c.combat.speed.base).toBe("20 ft");
    expect(c.identity.race).toBe("Dwarves");
    expect(c.features.list.some((f) => f.category === "racial_trait" && /Dwarves racial traits/.test(f.name))).toBe(true);
  });

  it("pre-seeding raceApplied with matching mods makes applyRace net-zero on scores (import: scores already include race)", () => {
    const c = createDefaultCharacter();
    const con0 = c.abilities.primary.con.score;
    const cha0 = c.abilities.primary.cha.score;
    const mods = { con: 2, wis: 2, cha: -2 };
    // An imported sheet's ability scores are EFFECTIVE totals (race already baked in). Seeding
    // raceApplied with the same mods makes applyRace's revert subtract exactly what its apply
    // re-adds — net zero — while still recording the linked race + size/speed/traits.
    c.identity.raceApplied = { name: "Dwarves", compendiumId: "dwarves", abilityMods: mods };
    applyRace(c, {
      race: { name: "Dwarves", compendiumId: "dwarves" },
      abilityMods: mods,
      size: "Medium",
      speed: 20,
      standardTraits: "Dwarf traits",
    });
    expect(c.abilities.primary.con.score).toBe(con0); // NOT con0 + 2 (would be a double-count)
    expect(c.abilities.primary.cha.score).toBe(cha0);
    expect(c.identity.race).toBe("Dwarves");
    expect(c.identity.raceApplied?.abilityMods).toEqual(mods);
    expect(c.identity.size).toBe("Medium");
    expect(c.features.list.some((f) => f.category === "racial_trait")).toBe(true);
  });

  it("re-applying a different race reverts the prior race's mods + traits (no stacking)", () => {
    const c = createDefaultCharacter();
    const con0 = c.abilities.primary.con.score;
    const dex0 = c.abilities.primary.dex.score;
    applyRace(c, { race: { name: "Dwarves", compendiumId: "dwarves" }, abilityMods: { con: 2, cha: -2 }, standardTraits: "Dwarf traits" });
    const res = applyRace(c, { race: { name: "Elves", compendiumId: "elves" }, abilityMods: { dex: 2, con: -2 }, standardTraits: "Elf traits" });
    expect(res.reverted).toBe("Dwarves");
    // Dwarf's +2 Con reverted, Elf's -2 Con applied → net con0 - 2
    expect(c.abilities.primary.con.score).toBe(con0 - 2);
    expect(c.abilities.primary.dex.score).toBe(dex0 + 2);
    expect(c.abilities.primary.cha.score).toBe(createDefaultCharacter().abilities.primary.cha.score); // Dwarf's -2 Cha reverted
    expect(c.features.list.filter((f) => f.category === "racial_trait")).toHaveLength(1); // only Elf's traits
    expect(c.identity.race).toBe("Elves");
  });
});
