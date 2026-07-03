import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter, abilityModifier } from "./compute";

describe("abilityModifier", () => {
  it("matches PF1e ability modifier math", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(18)).toBe(4);
    expect(abilityModifier(7)).toBe(-2);
    expect(abilityModifier(9)).toBe(-1);
  });
});

describe("computeCharacter — default character", () => {
  const c = createDefaultCharacter();
  const computed = computeCharacter(c);

  it("computes base AC of 10 / 10 / 10", () => {
    expect(computed.armorClass.total.value).toBe(10);
    expect(computed.armorClass.touch.value).toBe(10);
    expect(computed.armorClass.flatFooted.value).toBe(10);
    expect(computed.armorClass.cmd.value).toBe(10);
  });

  it("computes zero saves and initiative for a blank sheet", () => {
    expect(computed.saves.fortitude.value).toBe(0);
    expect(computed.saves.reflex.value).toBe(0);
    expect(computed.saves.will.value).toBe(0);
    expect(computed.initiative.value).toBe(0);
  });

  it("produces no formula errors for the default sheet", () => {
    expect(computed.armorClass.total.errors).toEqual([]);
    expect(computed.saves.will.errors).toEqual([]);
  });
});

describe("summary.saveMisc + flat-save rebuild invariant", () => {
  it("resolves the save misc bucket even under a flat formula, so a rebuild preserves the total", () => {
    const c = createDefaultCharacter();
    c.abilities.primary.con.score = 12; // Con mod +1
    c.defenses.savingThrows.fortitude.misc = [
      { id: "res", label: "Cloak", value: 2, bonusType: "resistance", enabled: true },
    ];
    // A flat imported total ignores @{saves.fortitude.misc} entirely.
    c.defenses.savingThrows.fortitude.formula = "5";
    const computed = computeCharacter(c);
    expect(computed.saves.fortitude.value).toBe(5); // flat formula wins
    expect(computed.summary.saveMisc.fortitude).toBe(2); // bucket still resolved

    // The editor's rebuild seeds base = flatTotal − abilityMod − miscBucket, then restores the
    // default formula (which re-adds ability + misc). The total must stay 5, NOT double-count to 7.
    const abilityMod = computed.abilities.con!.modifier;
    const rebuiltBase = computed.saves.fortitude.value - abilityMod - computed.summary.saveMisc.fortitude;
    const c2 = createDefaultCharacter();
    c2.abilities.primary.con.score = 12;
    c2.defenses.savingThrows.fortitude.misc = c.defenses.savingThrows.fortitude.misc;
    c2.defenses.savingThrows.fortitude.base = rebuiltBase; // default formula already references base+con.mod+misc
    expect(computeCharacter(c2).saves.fortitude.value).toBe(5);
  });
});

describe("computeCharacter — ability + save math", () => {
  it("flows ability modifiers into AC and saves", () => {
    const c = createDefaultCharacter();
    c.abilities.primary.dex = { key: "dex", label: "Dexterity", score: 14, baseScore: 14 };
    c.abilities.primary.con = { key: "con", label: "Constitution", score: 16, baseScore: 16 };
    c.defenses.savingThrows.fortitude.base = 4;
    const computed = computeCharacter(c);
    expect(computed.abilities.dex?.modifier).toBe(2);
    expect(computed.armorClass.total.value).toBe(12); // 10 + dex(2)
    expect(computed.armorClass.flatFooted.value).toBe(10); // no dex when flat-footed
    expect(computed.saves.fortitude.value).toBe(7); // base 4 + con(3)
  });
});

describe("computeCharacter — per-stat modifiers + inspector terms", () => {
  it("applies an armor bonus entered directly on the AC stat (and respects touch/flat-footed)", () => {
    const c = createDefaultCharacter();
    c.defenses.armorClass.conditionalModifiers = [
      { id: "ac_armor", label: "Armor", value: 6, bonusType: "armor", enabled: true },
    ];
    const computed = computeCharacter(c);
    expect(computed.armorClass.total.value).toBe(16); // 10 + armor 6
    expect(computed.armorClass.flatFooted.value).toBe(16); // armor applies when flat-footed
    expect(computed.armorClass.touch.value).toBe(10); // armor never applies to touch AC
  });

  it("applies a typed misc bonus entered on a saving throw", () => {
    const c = createDefaultCharacter();
    c.defenses.savingThrows.will.misc = [
      { id: "cloak", label: "Cloak of Resistance", value: 2, bonusType: "resistance", enabled: true },
    ];
    expect(computeCharacter(c).saves.will.value).toBe(2);
  });

  it("exposes resolved reference terms for the formula inspector", () => {
    const computed = computeCharacter(createDefaultCharacter());
    const terms = computed.armorClass.total.terms;
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.find((t) => t.ref === "ac.armor")).toBeTruthy();
    expect(terms.every((t) => typeof t.value === "number")).toBe(true);
  });
});

describe("computeCharacter — resolver hardening", () => {
  it("does not resolve Object.prototype keys as references", () => {
    const c = createDefaultCharacter();
    c.defenses.armorClass.formulas.total = "10 + @{__proto__} + @{constructor} + @{toString}";
    const computed = computeCharacter(c);
    expect(typeof computed.armorClass.total.value).toBe("number");
    expect(Number.isFinite(computed.armorClass.total.value)).toBe(true);
    expect(computed.armorClass.total.value).toBe(10); // prototype refs resolve to 0
  });
});

describe("computeCharacter — Haste-style buff", () => {
  it("applies +1 dodge AC, +1 reflex, +1 attack, but not to flat-footed AC", () => {
    const c = createDefaultCharacter();
    c.abilities.primary.dex = { key: "dex", label: "Dexterity", score: 14, baseScore: 14 };
    c.buffs.active = [
      {
        id: "buff_haste",
        name: "Haste",
        enabled: true,
        effects: [
          { id: "h1", target: "defenses.armorClass.total", operation: "add", value: 1, bonusType: "dodge" },
          { id: "h2", target: "defenses.savingThrows.reflex", operation: "add", value: 1 },
          { id: "h3", target: "combat.attack.melee", operation: "add", value: 1 },
        ],
      },
    ];
    const computed = computeCharacter(c);
    expect(computed.armorClass.total.value).toBe(13); // 10 + dex 2 + dodge 1
    expect(computed.armorClass.touch.value).toBe(13); // touch keeps dex + dodge
    expect(computed.armorClass.flatFooted.value).toBe(10); // dodge + dex dropped
    expect(computed.saves.reflex.value).toBe(3); // dex 2 + 1
    expect(computed.attackBonuses.melee.value).toBe(1);
  });
});

describe("computeCharacter — equipped-item automation", () => {
  // A synthetic multi-effect item: two automation effects on distinct engine domains (AC + a save)
  // so we prove automation reaches MORE than the AC path — a regression where only AC consumed
  // item automation would still pass an AC-only assertion.
  const charmOfBonuses = (equipped: boolean) => {
    const c = createDefaultCharacter();
    c.inventory.potionsScrollsMagicItems.push({
      id: "charm_bonuses",
      name: "Charm of Bonuses (test)",
      category: "magic_item",
      quantity: 1,
      equipped,
      automation: [
        {
          id: "charm_ac",
          target: "defenses.armorClass",
          operation: "add",
          value: 2,
          bonusType: "deflection",
        },
        {
          id: "charm_will",
          target: "saves.will",
          operation: "add",
          value: 2,
          bonusType: "resistance",
        },
      ],
      modifiers: [],
      identified: true,
    });
    return c;
  };

  it("applies an equipped item's automation to the computed values", () => {
    const computed = computeCharacter(charmOfBonuses(true));
    expect(computed.armorClass.total.value).toBe(12); // 10 + deflection 2
    expect(computed.armorClass.touch.value).toBe(12); // deflection applies to touch
    expect(computed.saves.will.value).toBe(2); // automation also flows to a non-AC domain
  });

  it("ignores an unequipped item's automation", () => {
    const computed = computeCharacter(charmOfBonuses(false));
    expect(computed.armorClass.total.value).toBe(10); // unequipped → no AC bonus
    expect(computed.saves.will.value).toBe(0); // unequipped → no save bonus
  });
});
