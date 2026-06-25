import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { diffCharacters } from "@/lib/character/diff";

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

describe("diffCharacters", () => {
  it("an unchanged sheet reports no changes", () => {
    const c = createDefaultCharacter({ name: "Same" });
    const diff = diffCharacters(c, clone(c));
    expect(diff.hasChanges).toBe(false);
    expect(diff.values).toHaveLength(0);
    expect(diff.lists).toHaveLength(0);
  });

  it("detects identity and level changes as values", () => {
    const before = createDefaultCharacter({ name: "Before" });
    const after = clone(before);
    after.identity.name = "After";
    after.identity.totalLevel = 2;
    const diff = diffCharacters(before, after);
    expect(diff.hasChanges).toBe(true);
    expect(diff.values.find((v) => v.label === "Name")).toMatchObject({ before: "Before", after: "After" });
    expect(diff.values.find((v) => v.label === "Total level")).toMatchObject({ before: "0", after: "2" });
  });

  it("detects added and removed feats", () => {
    const before = createDefaultCharacter({ name: "X" });
    const after = clone(before);
    before.feats.list.push({ id: "f1", name: "Power Attack", tags: [], automation: [] });
    after.feats.list.push({ id: "f2", name: "Cleave", tags: [], automation: [] });
    const diff = diffCharacters(before, after);
    const feats = diff.lists.find((l) => l.label === "Feats");
    expect(feats?.added).toContain("Cleave");
    expect(feats?.removed).toContain("Power Attack");
  });

  it("detects added spells across known/prepared/spellbook", () => {
    const before = createDefaultCharacter({ name: "X" });
    const after = clone(before);
    after.spellcasting.knownSpells.push({ id: "s1", name: "Magic Missile", level: 1 });
    const diff = diffCharacters(before, after);
    const spells = diff.lists.find((l) => l.label === "Spells");
    expect(spells?.added).toContain("Magic Missile");
    expect(spells?.removed ?? []).toHaveLength(0);
  });

  it("detects an enabled rule module change", () => {
    const before = createDefaultCharacter({ name: "X" });
    const after = clone(before);
    after.rules.variants.mythic = true;
    const diff = diffCharacters(before, after);
    const modules = diff.lists.find((l) => l.label === "Rule modules");
    expect(modules?.added).toContain("Mythic Adventures");
  });

  it("detects a changed formula override expression as a value", () => {
    const before = createDefaultCharacter({ name: "X" });
    const after = clone(before);
    before.formulas.overrides["defenses.armorClass.total"] = {
      targetPath: "defenses.armorClass.total",
      formula: "10 + 1",
      enabled: true,
    };
    after.formulas.overrides["defenses.armorClass.total"] = {
      targetPath: "defenses.armorClass.total",
      formula: "10 + 5",
      enabled: true,
    };
    const diff = diffCharacters(before, after);
    expect(diff.values.find((v) => v.label.startsWith("Formula:"))).toMatchObject({
      before: "10 + 1",
      after: "10 + 5",
    });
  });

  it("hides changes in a section the GM viewer may not see", () => {
    const before = createDefaultCharacter({ name: "X" });
    const after = clone(before);
    after.feats.list.push({ id: "f1", name: "Secret Feat", tags: [], automation: [] });
    after.privacy.sections.feats = "owner_only";

    const gmDiff = diffCharacters(before, after, "gm");
    expect(gmDiff.lists.find((l) => l.label === "Feats")).toBeUndefined();

    const ownerDiff = diffCharacters(before, after, "owner");
    expect(ownerDiff.lists.find((l) => l.label === "Feats")?.added).toContain("Secret Feat");
  });
});
