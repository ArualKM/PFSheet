import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  applyClassPreset,
  getClassPreset,
  spellsPerDayTableFor,
  bonusSpellsForLevel,
  type SpellcasterEntry,
} from "@pathforge/schema";
import { computeCharacter } from "./compute";

describe("bonusSpellsForLevel", () => {
  it("matches the PF1e bonus-spell table", () => {
    expect(bonusSpellsForLevel(4, 1)).toBe(1); // 18 casting stat → 1 bonus L1
    expect(bonusSpellsForLevel(4, 4)).toBe(1);
    expect(bonusSpellsForLevel(4, 5)).toBe(0); // mod < spell level
    expect(bonusSpellsForLevel(5, 1)).toBe(2); // 20 casting stat → 2 bonus L1
    expect(bonusSpellsForLevel(0, 1)).toBe(0);
    expect(bonusSpellsForLevel(4, 0)).toBe(0); // never bonus orisons
  });
});

function withWizard(level: number, intScore: number) {
  const c = createDefaultCharacter();
  c.abilities.primary.int.score = intScore;
  const caster: SpellcasterEntry = {
    id: "w1",
    className: "Wizard",
    casterType: "spellbook",
    casterLevel: level,
    concentrationFormula: "",
    castingAbility: "int",
    conditionalModifiers: [],
    spellsPerDay: {},
    bonusSpells: {},
    saveDcFormula: "",
    autoSlots: true,
    spellsPerDayTable: spellsPerDayTableFor("wizard"),
  };
  c.spellcasting.casters.push(caster);
  return computeCharacter(c);
}

describe("computeSpellcasting", () => {
  it("derives auto slots = base table + ability bonus spells", () => {
    const sc = withWizard(5, 18).spellcasting[0]!; // int 18 → +4
    const l1 = sc.slots.find((s) => s.level === 1)!;
    expect(l1.base).toBe(3); // FULL_PREPARED[5][1]
    expect(l1.bonus).toBe(1); // +4 int → 1 bonus L1
    expect(l1.total).toBe(4);
    const l3 = sc.slots.find((s) => s.level === 3)!;
    expect(l3.base).toBe(1); // FULL_PREPARED[5][3]
    expect(l3.bonus).toBe(1);
    // No access above L3 at CL5 → those levels aren't listed.
    expect(sc.slots.find((s) => s.level === 4)).toBeUndefined();
  });

  it("computes save DC (10 + spell level + ability mod) and concentration (CL + mod)", () => {
    const sc = withWizard(5, 18).spellcasting[0]!; // +4 int
    expect(sc.slots.find((s) => s.level === 1)!.dc).toBe(15); // 10+1+4
    expect(sc.slots.find((s) => s.level === 3)!.dc).toBe(17); // 10+3+4
    expect(sc.concentration.value).toBe(9); // CL 5 + 4
  });

  it("uses the manual grid when autoSlots is off", () => {
    const c = createDefaultCharacter();
    const caster: SpellcasterEntry = {
      id: "s1",
      className: "Sorcerer",
      casterType: "spontaneous",
      casterLevel: 3,
      concentrationFormula: "",
      castingAbility: "cha",
      conditionalModifiers: [],
      spellsPerDay: { "1": { total: 4, used: 1 } },
      bonusSpells: {},
      saveDcFormula: "",
      autoSlots: false,
    };
    c.spellcasting.casters.push(caster);
    const l1 = computeCharacter(c).spellcasting[0]!.slots.find((s) => s.level === 1)!;
    expect(l1.base).toBe(4);
    expect(l1.total).toBe(4);
    expect(l1.used).toBe(1);
    expect(l1.remaining).toBe(3);
  });

  it("rolls up a compact summary", () => {
    const computed = withWizard(5, 18);
    expect(computed.summary.spells?.casterCount).toBe(1);
    expect(computed.summary.spells?.highestSpellLevel).toBe(3);
    expect(computed.summary.spells!.totalSlots).toBeGreaterThan(0);
  });

  it("derives sorcerer auto slots from the SORCERER table", () => {
    const c = createDefaultCharacter();
    c.abilities.primary.cha.score = 16; // +3
    const caster: SpellcasterEntry = {
      id: "s2",
      className: "Sorcerer",
      casterType: "spontaneous",
      casterLevel: 4,
      concentrationFormula: "",
      castingAbility: "cha",
      conditionalModifiers: [],
      spellsPerDay: {},
      bonusSpells: {},
      saveDcFormula: "",
      autoSlots: true,
      spellsPerDayTable: spellsPerDayTableFor("sorcerer"),
    };
    c.spellcasting.casters.push(caster);
    const sc = computeCharacter(c).spellcasting[0]!;
    expect(sc.slots.find((s) => s.level === 1)!.base).toBe(6); // SORCERER[4][1]
    expect(sc.slots.find((s) => s.level === 2)!.base).toBe(3); // SORCERER[4][2]
  });

  it("bard auto slots have no level-0 slot and use the verified table", () => {
    const c = createDefaultCharacter();
    c.abilities.primary.cha.score = 10; // +0 to isolate base values
    applyClassPreset(c, { preset: getClassPreset("bard")!, level: 5 });
    const sc = computeCharacter(c).spellcasting[0]!;
    expect(sc.slots.find((s) => s.level === 0)).toBeUndefined(); // bard cantrips are at-will
    expect(sc.slots.find((s) => s.level === 1)!.base).toBe(4); // BARD[5][1]
    expect(sc.slots.find((s) => s.level === 2)!.base).toBe(2);
  });

  it("indexes paladin by class level (CL = level-3) and grants bonus spells at a 0-base access level", () => {
    const c = createDefaultCharacter();
    c.abilities.primary.cha.score = 14; // +2
    applyClassPreset(c, { preset: getClassPreset("paladin")!, level: 4 });
    const sc = computeCharacter(c).spellcasting[0]!;
    expect(sc.casterLevel).toBe(1); // 4 - 3
    const l1 = sc.slots.find((s) => s.level === 1)!;
    expect(l1.base).toBe(0); // PALADIN_RANGER[4] = { 1: 0 }
    expect(l1.bonus).toBe(1); // +2 Cha → bonus L1 even at 0 base (access, not base>0)
    expect(l1.total).toBe(1);
  });

  it("does not list a 0-base access level when the caster has no ability bonus", () => {
    const c = createDefaultCharacter();
    c.abilities.primary.cha.score = 10; // +0
    applyClassPreset(c, { preset: getClassPreset("paladin")!, level: 4 });
    const sc = computeCharacter(c).spellcasting[0]!;
    expect(sc.slots.find((s) => s.level === 1)).toBeUndefined(); // total 0 → not castable
  });

  it("derives a prepared caster's per-level used from its prepared spells", () => {
    const c = createDefaultCharacter();
    applyClassPreset(c, { preset: getClassPreset("cleric")!, level: 5 });
    const caster = c.spellcasting.casters[0]!;
    c.spellcasting.preparedSpells.push(
      { id: "p1", name: "Bless", level: 1, casterId: caster.id, prepared: 1, used: 1, metamagicIds: [] },
      { id: "p2", name: "Shield of Faith", level: 1, casterId: caster.id, prepared: 1, used: 0, metamagicIds: [] },
    );
    const l1 = computeCharacter(c).spellcasting[0]!.slots.find((s) => s.level === 1)!;
    expect(l1.prepared).toBe(2);
    expect(l1.used).toBe(1); // sum of prepared.used, not the per-level slot
  });

  it("ignores leftover prepared spells on a spontaneous caster (no phantom prepared/used)", () => {
    const c = createDefaultCharacter();
    const caster: SpellcasterEntry = {
      id: "sorc1",
      className: "Sorcerer",
      casterType: "spontaneous",
      casterLevel: 5,
      concentrationFormula: "",
      castingAbility: "cha",
      conditionalModifiers: [],
      spellsPerDay: { "1": { total: 6, used: 2 } },
      bonusSpells: {},
      saveDcFormula: "",
      autoSlots: false,
    };
    c.spellcasting.casters.push(caster);
    // A prepared spell lingering from a prior prepared configuration, same casterId.
    c.spellcasting.preparedSpells.push({ id: "p1", name: "Bless", level: 1, casterId: "sorc1", prepared: 3, used: 2, metamagicIds: [] });
    const l1 = computeCharacter(c).spellcasting[0]!.slots.find((s) => s.level === 1)!;
    expect(l1.prepared).toBe(0); // spontaneous casters ignore the prepared loadout
    expect(l1.used).toBe(2); // from the level slot, not the leftover prepared spell
  });

  it("leaves non-casters without a spells summary", () => {
    expect(computeCharacter(createDefaultCharacter()).summary.spells).toBeUndefined();
  });
});
