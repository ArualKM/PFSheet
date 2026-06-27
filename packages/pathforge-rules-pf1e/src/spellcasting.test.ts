import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
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

  it("leaves non-casters without a spells summary", () => {
    expect(computeCharacter(createDefaultCharacter()).summary.spells).toBeUndefined();
  });
});
