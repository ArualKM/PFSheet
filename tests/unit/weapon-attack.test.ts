import { describe, it, expect } from "vitest";
import { createDefaultCharacter, type EquipmentItem } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function weapon(over: Partial<EquipmentItem>): EquipmentItem {
  return {
    id: "w1",
    name: "Longsword",
    category: "weapon",
    quantity: 1,
    weight: 0,
    equipped: true,
    automation: [],
    modifiers: [],
    identified: true,
    ...over,
  } as EquipmentItem;
}

describe("weapon → attack", () => {
  it("an equipped weapon generates an attack: BAB + Str + size + enhancement, damage incl. Str", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.str.score = 16; // +3
    c.combat.bab.total = 6;
    c.inventory.weapons.push(
      weapon({
        weapon: {
          ranged: false,
          attackAbility: "str",
          damageAbility: "str",
          handed: "one",
          enhancement: 1,
          damageDice: "1d8",
        },
      }),
    );
    const atk = computeCharacter(c).attacks.find((a) => a.id === "pf:weapon:w1");
    expect(atk).toBeTruthy();
    expect(atk!.attackBonus).toBe(10); // 6 BAB + 3 Str + 0 size + 1 enh
    expect(atk!.damage).toBe("1d8+4"); // 1d8 + 3 Str + 1 enh
  });

  it("two-handed grip adds 1.5× Str to damage (rounded down)", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.str.score = 16; // +3
    c.inventory.weapons.push(
      weapon({
        name: "Greatsword",
        weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "two", enhancement: 0, damageDice: "2d6" },
      }),
    );
    const atk = computeCharacter(c).attacks.find((a) => a.id === "pf:weapon:w1");
    expect(atk!.damage).toBe("2d6+4"); // floor(3 × 1.5) = 4
  });

  it("a ranged weapon uses Dex to attack and no ability to damage", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.dex.score = 18; // +4
    c.abilities.primary.str.score = 8; // −1
    c.combat.bab.total = 5;
    c.inventory.weapons.push(
      weapon({
        name: "Longbow",
        weapon: { ranged: true, attackAbility: "dex", damageAbility: "none", handed: "two", enhancement: 0, damageDice: "1d8" },
      }),
    );
    const atk = computeCharacter(c).attacks.find((a) => a.id === "pf:weapon:w1");
    expect(atk!.attackType).toBe("ranged");
    expect(atk!.attackBonus).toBe(9); // 5 BAB + 4 Dex
    expect(atk!.damage).toBe("1d8"); // no ability to damage
  });

  it("an unequipped weapon generates no attack", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.inventory.weapons.push(
      weapon({
        equipped: false,
        weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0, damageDice: "1d8" },
      }),
    );
    expect(computeCharacter(c).attacks.find((a) => a.id === "pf:weapon:w1")).toBeFalsy();
  });

  it("a generated weapon id can't collide with a free-form manual attack id", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.combat.attacks.push({
      id: "weapon-w1", // would have collided with the old "weapon-<id>" scheme
      name: "Manual strike",
      attackType: "melee",
      attackFormula: "@{combat.bab.total}",
      conditionalModifiers: [],
      enabled: true,
      showInCombat: true,
    });
    c.inventory.weapons.push(
      weapon({ weapon: { ranged: false, attackAbility: "str", damageAbility: "str", handed: "one", enhancement: 0, damageDice: "1d8" } }),
    );
    const ids = computeCharacter(c).attacks.map((a) => a.id);
    expect(ids).toContain("weapon-w1"); // manual survives
    expect(ids).toContain("pf:weapon:w1"); // weapon is namespaced
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
  });
});
