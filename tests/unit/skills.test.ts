import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

describe("skills editor data paths", () => {
  it("a flat misc modifier adds to the computed skill total", () => {
    const c = createDefaultCharacter({ name: "X" });
    const perception = c.skills.list.find((s) => s.key === "perception");
    expect(perception).toBeTruthy();
    const before = computeCharacter(c).skills.perception?.value ?? 0;
    perception!.misc.push({ id: "m1", label: "Misc", value: 3, enabled: true });
    const after = computeCharacter(c).skills.perception?.value ?? 0;
    expect(after - before).toBe(3);
  });

  it("a custom (repeatable) skill with a specialty computes from its ability + ranks", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.abilities.primary.int.score = 14; // +2
    c.skills.list.push({
      id: "s-craft-alchemy",
      key: "craft-alchemy",
      label: "Craft",
      ability: "int",
      ranks: 5,
      misc: [],
      conditional: [],
      custom: true,
      classSkill: true,
      specialty: "alchemy",
    });
    const total = computeCharacter(c).skills["craft-alchemy"]?.value ?? 0;
    // 5 ranks + 2 Int + 3 class-skill = 10
    expect(total).toBe(10);
  });
});
