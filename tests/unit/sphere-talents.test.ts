import { describe, it, expect } from "vitest";
import { groupTalentsByCategory, talentTier } from "@/lib/character/sphere-talents";

describe("talentTier — category → bucket", () => {
  it("maps the three known categories", () => {
    expect(talentTier("Base Talent")).toBe("Base");
    expect(talentTier("Advanced Talent")).toBe("Advanced");
    expect(talentTier("Legendary Talent")).toBe("Legendary");
  });

  it("is case-insensitive and substring-tolerant", () => {
    expect(talentTier("advanced")).toBe("Advanced");
    expect(talentTier("LEGENDARY TALENT")).toBe("Legendary");
  });

  it("buckets missing/unknown categories as Other", () => {
    expect(talentTier(undefined)).toBe("Other");
    expect(talentTier(null)).toBe("Other");
    expect(talentTier("")).toBe("Other");
    expect(talentTier("Weird")).toBe("Other");
  });
});

describe("groupTalentsByCategory — read-view / editor tier grouping", () => {
  it("orders tiers Base → Advanced → Legendary → Other and sorts names within a tier", () => {
    const groups = groupTalentsByCategory([
      { name: "Zephyr", category: "Base Talent" },
      { name: "Aegis", category: "Base Talent" },
      { name: "Nova", category: "Legendary Talent" },
      { name: "Mist", category: "Advanced Talent" },
      { name: "Loose", category: undefined },
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Base", "Advanced", "Legendary", "Other"]);
    expect(groups[0]!.talents.map((t) => t.name)).toEqual(["Aegis", "Zephyr"]);
  });

  it("drops empty tiers", () => {
    const groups = groupTalentsByCategory([
      { name: "A", category: "Base Talent" },
      { name: "B", category: "Legendary Talent" },
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Base", "Legendary"]);
  });

  it("returns a single group when only one tier is present (flat passthrough)", () => {
    const groups = groupTalentsByCategory([
      { name: "B", category: "Base Talent" },
      { name: "A", category: "Base Talent" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.tier).toBe("Base");
    expect(groups[0]!.talents.map((t) => t.name)).toEqual(["A", "B"]);
  });

  it("buckets uncategorized talents into Other", () => {
    const groups = groupTalentsByCategory([{ name: "Loose" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.tier).toBe("Other");
  });

  it("handles an empty list", () => {
    expect(groupTalentsByCategory([])).toEqual([]);
  });
});
