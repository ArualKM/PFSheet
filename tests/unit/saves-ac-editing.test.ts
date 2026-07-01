import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";

function base() {
  const c = createDefaultCharacter({ name: "X" });
  c.identity.totalLevel = 6;
  c.abilities.primary.con.score = 14; // +2
  c.abilities.primary.dex.score = 12; // +1
  c.abilities.primary.wis.score = 10; // +0
  c.abilities.primary.cha.score = 18; // +4
  return c;
}

describe("save ability override (SaveEntry.abilityKey)", () => {
  it("Will keyed to Cha uses the Cha modifier instead of Wis", () => {
    const c = base();
    const before = computeCharacter(c);
    c.defenses.savingThrows.will.abilityKey = "cha";
    const after = computeCharacter(c);
    // Wis +0 → Cha +4
    expect(after.summary.will - before.summary.will).toBe(4);
  });

  it("an override equal to the default is a no-op", () => {
    const c = base();
    const before = computeCharacter(c);
    c.defenses.savingThrows.fortitude.abilityKey = "con";
    const after = computeCharacter(c);
    expect(after.summary.fortitude).toBe(before.summary.fortitude);
  });
});

describe("formula-valued modifier entries", () => {
  it("a save misc entry with a formula value scales off level", () => {
    const c = base();
    c.defenses.savingThrows.fortitude.misc.push({
      id: "m1",
      label: "Scaling resistance",
      value: "floor(@{level.total}/3)", // 6/3 = 2
      bonusType: "resistance",
      enabled: true,
    });
    const out = computeCharacter(c);
    // base 0 + con +2 + misc 2
    expect(out.summary.fortitude).toBe(4);
  });

  it("inline-roll [[...]] brackets are accepted as grouping", () => {
    const c = base();
    c.defenses.savingThrows.will.misc.push({
      id: "m2",
      label: "Inline roll style",
      value: "[[@{level.total}*2]]-[[@{level.total}]]", // 12 - 6 = 6
      enabled: true,
    });
    const out = computeCharacter(c);
    expect(out.summary.will).toBe(6);
  });

  it("an AC modifier entry with a formula value computes", () => {
    const c = base();
    c.defenses.armorClass.conditionalModifiers.push({
      id: "acm1",
      label: "Scaling deflection",
      value: "min(3, floor(@{level.total}/2))", // min(3, 3) = 3
      bonusType: "deflection",
      enabled: true,
    });
    const out = computeCharacter(c);
    // 10 + dex 1 + deflection 3
    expect(out.summary.ac).toBe(14);
  });

  it("a non-numeric junk string value is ignored rather than NaN-poisoning", () => {
    const c = base();
    c.defenses.savingThrows.reflex.misc.push({
      id: "m3",
      label: "Bad",
      value: "not a formula @@@",
      enabled: true,
    });
    const out = computeCharacter(c);
    expect(out.summary.reflex).toBe(1); // dex only
    expect(Number.isFinite(out.summary.reflex)).toBe(true);
  });

  it("a skill misc entry with a formula value computes", () => {
    const c = base();
    const skill = c.skills.list.find((s) => s.key === "perception");
    expect(skill).toBeDefined();
    skill!.misc.push({
      id: "sk1",
      label: "Scaling insight",
      value: "[[@{level.total}/2]]", // 3
      bonusType: "insight",
      enabled: true,
    });
    const out = computeCharacter(c);
    expect(out.skills.perception!.value).toBe(3); // wis +0, no ranks
  });
});
