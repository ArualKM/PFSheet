import { describe, it, expect } from "vitest";
import { createDefaultCharacter, isBackgroundSkill, DEFAULT_SKILLS } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function enabled() {
  const c = createDefaultCharacter({ name: "X" });
  c.rules.variants.backgroundSkills = true;
  c.identity.totalLevel = 5;
  return c;
}

describe("background skills", () => {
  it("flags the background set; Artistry + Lore exist in the catalog", () => {
    expect(DEFAULT_SKILLS.find((s) => s.key === "artistry")?.background).toBe(true);
    expect(DEFAULT_SKILLS.find((s) => s.key === "lore")?.background).toBe(true);
    expect(isBackgroundSkill({ key: "appraise" })).toBe(true);
    expect(isBackgroundSkill({ key: "perform" })).toBe(true);
    expect(isBackgroundSkill({ key: "stealth" })).toBe(false);
    // explicit flag wins over the key set
    expect(isBackgroundSkill({ key: "stealth", background: true })).toBe(true);
  });

  it("seeded background skills carry the flag; non-background don't", () => {
    const c = createDefaultCharacter({ name: "X" });
    expect(c.skills.list.find((s) => s.key === "appraise")?.background).toBe(true);
    expect(c.skills.list.find((s) => s.key === "perception")?.background).toBeFalsy();
  });

  it("background ranks add to the skill total", () => {
    const c = enabled();
    const before = computeCharacter(c).skills.appraise?.value ?? 0;
    c.skills.list.find((s) => s.key === "appraise")!.backgroundRanks = 3;
    expect((computeCharacter(c).skills.appraise?.value ?? 0) - before).toBe(3);
  });

  it("computes the background budget (2 × level) and spent", () => {
    const c = enabled(); // level 5 → budget 10
    c.skills.list.find((s) => s.key === "appraise")!.backgroundRanks = 4;
    c.skills.list.find((s) => s.key === "linguistics")!.backgroundRanks = 2;
    expect(computeCharacter(c).summary.backgroundSkills).toEqual({ budget: 10, spent: 6 });
  });

  it("no background summary unless the variant is enabled", () => {
    const c = createDefaultCharacter({ name: "X" });
    c.identity.totalLevel = 5;
    expect(computeCharacter(c).summary.backgroundSkills).toBeUndefined();
  });
});
