import { describe, it, expect } from "vitest";
import { createDefaultCharacter, type EquipmentItem } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function armor(over: Partial<EquipmentItem>): EquipmentItem {
  return {
    id: "a1",
    name: "Armor",
    category: "armor",
    quantity: 1,
    weight: 0,
    equipped: true,
    automation: [],
    modifiers: [],
    identified: true,
    ...over,
  } as EquipmentItem;
}

describe("armor → AC + ACP", () => {
  it("equipped armor adds its AC bonus; unequipped doesn't", () => {
    const c = createDefaultCharacter({ name: "X" });
    const before = computeCharacter(c).summary.ac;
    c.inventory.armorAndShields.push(armor({ armorBonus: 5 }));
    expect(computeCharacter(c).summary.ac - before).toBe(5);
    c.inventory.armorAndShields[0]!.equipped = false;
    expect(computeCharacter(c).summary.ac).toBe(before);
  });

  it("armor + shield stack; two armors keep the highest", () => {
    const c = createDefaultCharacter({ name: "X" });
    const before = computeCharacter(c).summary.ac;
    c.inventory.armorAndShields.push(
      armor({ id: "bp", name: "Breastplate", category: "armor", armorBonus: 6 }),
      armor({ id: "sh", name: "Heavy Shield", category: "shield", armorBonus: 2 }),
      armor({ id: "cs", name: "Chain Shirt", category: "armor", armorBonus: 4 }),
    );
    // armor 6 (best of 6/4) + shield 2 = +8
    expect(computeCharacter(c).summary.ac - before).toBe(8);
  });

  it("equipped ACP penalizes ACP-affected skills, not others", () => {
    const c = createDefaultCharacter({ name: "X" });
    const climbBefore = computeCharacter(c).skills.climb?.value ?? 0;
    const percBefore = computeCharacter(c).skills.perception?.value ?? 0;
    c.inventory.armorAndShields.push(armor({ armorBonus: 6, armorCheckPenalty: 5 }));
    const after = computeCharacter(c);
    expect((after.skills.climb?.value ?? 0) - climbBefore).toBe(-5);
    expect((after.skills.perception?.value ?? 0) - percBefore).toBe(0);
  });

  it("ACP applies even when a skill's stored formula predates @{armorCheckPenalty} (legacy sheets)", () => {
    const c = createDefaultCharacter({ name: "X" });
    // Simulate a pre-ACP sheet: every skill row stores the old formula with no @{armorCheckPenalty}.
    for (const s of c.skills.list) {
      s.formula = "@{ranks} + @{abilityMod} + @{classSkillBonus} + @{misc}";
    }
    const climbBefore = computeCharacter(c).skills.climb?.value ?? 0;
    c.inventory.armorAndShields.push(armor({ armorCheckPenalty: 5 }));
    expect((computeCharacter(c).skills.climb?.value ?? 0) - climbBefore).toBe(-5);
  });

  it("a negative ACP magnitude still subtracts (never inverts to a bonus)", () => {
    const c = createDefaultCharacter({ name: "X" });
    const climbBefore = computeCharacter(c).skills.climb?.value ?? 0;
    c.inventory.armorAndShields.push(armor({ armorCheckPenalty: -3 }));
    expect((computeCharacter(c).skills.climb?.value ?? 0) - climbBefore).toBe(-3);
  });

  it("the armorCheckPenaltyApplies=false toggle suppresses ACP", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.skills.settings.armorCheckPenaltyApplies = false;
    const climbBefore = computeCharacter(c).skills.climb?.value ?? 0;
    c.inventory.armorAndShields.push(armor({ armorCheckPenalty: 5 }));
    expect((computeCharacter(c).skills.climb?.value ?? 0) - climbBefore).toBe(0);
  });
});

describe("Max Dex cap", () => {
  it("caps the Dex bonus to AC and touch at the lowest equipped maxDexBonus", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.dex.score = 18; // +4
    const before = computeCharacter(c);
    c.inventory.armorAndShields.push(armor({ armorBonus: 9, maxDexBonus: 1 }));
    const after = computeCharacter(c);
    // +9 armor, but Dex capped 4→1 (−3) → net +6 to AC
    expect(after.summary.ac - before.summary.ac).toBe(6);
    // touch carries Dex but no armor → just the −3 cap
    expect(after.summary.touch - before.summary.touch).toBe(-3);
  });

  it("never caps a Dex bonus already within the limit, nor a Dex penalty", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.dex.score = 8; // −1 (a penalty, never capped)
    const before = computeCharacter(c);
    c.inventory.armorAndShields.push(armor({ armorBonus: 4, maxDexBonus: 1 }));
    const after = computeCharacter(c);
    expect(after.summary.ac - before.summary.ac).toBe(4); // just the armor
  });
});
