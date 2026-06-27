import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

describe("equipped item modifiers", () => {
  it("an equipped item bonus reaches the computed stat; unequipped does not", () => {
    const c = createDefaultCharacter({ name: "X" });
    const acBefore = computeCharacter(c).summary.ac;

    c.inventory.gear.push({
      id: "ring",
      name: "Ring of Protection +1",
      category: "magic_item",
      quantity: 1,
      weight: 0,
      equipped: true,
      automation: [],
      modifiers: [{ id: "m1", label: "Ring of Protection", value: 1, bonusType: "deflection", target: "ac", enabled: true }],
      identified: true,
    });

    expect(computeCharacter(c).summary.ac - acBefore).toBe(1);

    // Unequipping removes the bonus.
    c.inventory.gear[0]!.equipped = false;
    expect(computeCharacter(c).summary.ac).toBe(acBefore);
  });

  it("same-type bonuses don't stack; the highest wins", () => {
    const c = createDefaultCharacter({ name: "X" });
    const base = computeCharacter(c).summary.fortitude;
    const mk = (id: string, value: number) => ({
      id,
      name: `Cloak ${value}`,
      category: "magic_item" as const,
      quantity: 1,
      weight: 0,
      equipped: true,
      automation: [],
      modifiers: [{ id: `${id}-m`, label: "Cloak", value, bonusType: "resistance" as const, target: "fortitude", enabled: true }],
      identified: true,
    });
    c.inventory.gear.push(mk("c1", 1), mk("c2", 3));
    // Two resistance bonuses to Fort → only the +3 applies (typed bonuses don't stack).
    expect(computeCharacter(c).summary.fortitude - base).toBe(3);
  });
});
