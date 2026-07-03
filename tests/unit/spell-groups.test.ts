import { describe, it, expect } from "vitest";
import { groupSpellsByLevel, spellLevelLabel } from "@/lib/character/spell-groups";

describe("groupSpellsByLevel — spell-list grouping", () => {
  it("groups ascending by level, names sorted within a group", () => {
    const groups = groupSpellsByLevel([
      { name: "Magic Missile", level: 1 },
      { name: "Burning Hands", level: 1 },
      { name: "Fireball", level: 3 },
      { name: "Detect Magic", level: 0 },
    ]);
    expect(groups.map((g) => g.level)).toEqual([0, 1, 3]);
    expect(groups[1]!.spells.map((s) => s.name)).toEqual(["Burning Hands", "Magic Missile"]);
  });

  it("coerces a non-finite level to 0", () => {
    const groups = groupSpellsByLevel([{ name: "Weird", level: Number.NaN }]);
    expect(groups.map((g) => g.level)).toEqual([0]);
  });
});

describe("spellLevelLabel", () => {
  it("labels level 0 as Cantrips and others as Level N", () => {
    expect(spellLevelLabel(0)).toBe("Cantrips");
    expect(spellLevelLabel(3)).toBe("Level 3");
  });
});
