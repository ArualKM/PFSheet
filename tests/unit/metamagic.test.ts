import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { buildCharacterViewModel } from "@/lib/character/view-model";

function casterChar() {
  const c = createDefaultCharacter({ name: "Wiz" });
  c.spellcasting.casters.push({
    id: "cl1",
    className: "Wizard",
    casterType: "prepared",
    casterLevel: 9,
    concentrationFormula: "",
    castingAbility: "int",
    conditionalModifiers: [],
    spellsPerDay: { "3": { total: 2, used: 0 }, "5": { total: 1, used: 0 } },
    bonusSpells: {},
    saveDcFormula: "",
    autoSlots: false,
  });
  c.spellcasting.metamagic.push({ id: "mm_empower", name: "Empower Spell", levelAdjust: 2 });
  c.spellcasting.preparedSpells.push({
    id: "sp1",
    name: "Fireball",
    level: 3,
    casterId: "cl1",
    prepared: 1,
    used: 0,
    metamagicIds: [],
  });
  return c;
}

describe("metamagic", () => {
  it("an applied metamagic feat raises the prepared spell's effective slot level", () => {
    const c = casterChar();
    let caster = computeCharacter(c).spellcasting[0]!;
    expect(caster.slots.find((s) => s.level === 3)?.prepared).toBe(1);
    expect(caster.slots.find((s) => s.level === 5)?.prepared ?? 0).toBe(0);

    c.spellcasting.preparedSpells[0]!.metamagicIds = ["mm_empower"]; // Empower +2
    caster = computeCharacter(c).spellcasting[0]!;
    expect(caster.slots.find((s) => s.level === 3)?.prepared ?? 0).toBe(0);
    expect(caster.slots.find((s) => s.level === 5)?.prepared).toBe(1);
  });

  it("the view-model surfaces applied metamagic names + effective level", () => {
    const c = casterChar();
    c.spellcasting.preparedSpells[0]!.metamagicIds = ["mm_empower"];
    const vm = buildCharacterViewModel(c, computeCharacter(c), "owner");
    const prepared = vm.spellcasting?.prepared?.[0];
    expect(prepared?.metamagic).toEqual(["Empower Spell"]);
    expect(prepared?.effectiveLevel).toBe(5);
  });

  it("an unknown metamagic id contributes no level adjustment", () => {
    const c = casterChar();
    c.spellcasting.preparedSpells[0]!.metamagicIds = ["mm_nonexistent"];
    const caster = computeCharacter(c).spellcasting[0]!;
    expect(caster.slots.find((s) => s.level === 3)?.prepared).toBe(1); // stays at base level
  });
});
