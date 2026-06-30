import { describe, it, expect } from "vitest";
import { createDefaultCharacter, CLASS_CATALOG } from "@pathforge/schema";
import { computeCharacter } from "./compute";
import { grantClassFeatures, applyCompendiumClass, type CompendiumFeatureRow } from "./class-builder";

const FIGHTER_FEATURES: CompendiumFeatureRow[] = [
  { id: "f-bonusfeat-1", feature: "Bonus Feat", level: 1, type: "Ex" },
  { id: "f-bravery-2", feature: "Bravery", level: 2, type: "Ex", description: "+1 vs fear" },
  { id: "f-armortraining-3", feature: "Armor Training 1", level: 3, type: "Ex" },
  { id: "f-weaponmastery-20", feature: "Weapon Mastery", level: 20, type: "Ex" },
];

describe("grantClassFeatures", () => {
  it("grants only features in (fromLevel, toLevel], once, deduped by compendiumId", () => {
    const c = createDefaultCharacter();
    const added = grantClassFeatures(c, { features: FIGHTER_FEATURES, toLevel: 3 });
    expect(added).toEqual(["Bonus Feat", "Bravery", "Armor Training 1"]); // not L20
    expect(c.features.list).toHaveLength(3);
    // re-grant the same range → no-op (idempotent)
    const again = grantClassFeatures(c, { features: FIGHTER_FEATURES, toLevel: 3 });
    expect(again).toEqual([]);
    expect(c.features.list).toHaveLength(3);
    // level up 3→20 grants only the newly reached level's feature
    const up = grantClassFeatures(c, { features: FIGHTER_FEATURES, fromLevel: 3, toLevel: 20 });
    expect(up).toEqual(["Weapon Mastery"]);
    expect(c.features.list).toHaveLength(4);
    expect(c.features.list.find((f) => f.compendiumId === "f-bravery-2")?.level).toBe(2);
  });

  it("pre-fills automation from feature_effect seeds (clean effect computes; conditional stays gated)", () => {
    const c = createDefaultCharacter();
    grantClassFeatures(c, {
      toLevel: 1,
      features: [
        // a clean unconditional speed bonus (Barbarian Fast Movement) — should auto-apply
        { id: "fe-fast", feature: "Fast Movement", level: 1, effects: [{ target: "speed", op: "add", valueOrFormula: "10", bonusType: "untyped", notes: "" }] },
        // a situational one (Trap Sense vs traps) — recorded but condition-gated
        { id: "fe-trap", feature: "Trap Sense", level: 1, effects: [{ target: "saves.ref", op: "add", valueOrFormula: "@{floor(level/3)}", bonusType: "untyped", notes: "vs traps" }] },
      ],
    });
    const fast = c.features.list.find((f) => f.compendiumId === "fe-fast")!;
    expect(fast.automation[0]?.condition).toBeUndefined();
    expect(fast.automation[0]?.target).toBe("speed");
    const trap = c.features.list.find((f) => f.compendiumId === "fe-trap")!;
    expect(trap.automation[0]?.condition).toBeTruthy(); // "vs traps" → gated
  });
});

describe("applyCompendiumClass", () => {
  const fighterInput = () => {
    const f = CLASS_CATALOG.find((x) => x.key === "fighter")!;
    // a minimal real-ish progression (L1 + L20 is enough for the parser)
    return {
      key: "pfcore:fighter",
      name: "Fighter",
      hitDie: f.hitDie,
      skillRanksPerLevel: f.skillRanksPerLevel,
      classSkillKeys: f.classSkillKeys,
      progression: [
        ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special"],
        ["1st", "+1", "+2", "+0", "+0", "Bonus feat"],
        ["20th", "+20/+15/+10/+5", "+12", "+6", "+6", "Weapon mastery"],
      ] as unknown,
    };
  };

  it("applies BAB/saves/HP via the cached preset and grants features (no manual-class warning)", () => {
    const c = createDefaultCharacter();
    const res = applyCompendiumClass(c, {
      input: fighterInput(),
      level: 5,
      hpMethod: "average",
      features: FIGHTER_FEATURES,
    });
    // the row carries the cached preset + compendiumId
    const row = c.identity.classes.find((x) => x.compendiumId === "pfcore:fighter")!;
    expect(row.compendiumPreset?.bab).toBe("full");
    expect(row.level).toBe(5);
    // no "class without a preset" warning — the row resolved to the cached preset
    expect(res.warnings.join(" ")).not.toMatch(/without a preset/i);
    // derived math via the engine — full BAB at L5 = +5, good Fort = ⌊5/2⌋+2 = 4
    const comp = computeCharacter(c);
    expect(c.combat.bab.total).toBe(5);
    expect(c.defenses.savingThrows.fortitude.base).toBe(4);
    expect(c.defenses.savingThrows.reflex.base).toBe(1);
    // features for L1..5 granted (the L20 one excluded)
    expect(res.featuresAdded).toEqual(["Bonus Feat", "Bravery", "Armor Training 1"]);
    expect(comp.summary.totalLevel).toBe(5);
  });

  it("is idempotent on re-apply (no duplicate class row or features)", () => {
    const c = createDefaultCharacter();
    applyCompendiumClass(c, { input: fighterInput(), level: 5, hpMethod: "average", features: FIGHTER_FEATURES });
    applyCompendiumClass(c, { input: fighterInput(), level: 5, hpMethod: "average", features: FIGHTER_FEATURES });
    expect(c.identity.classes.filter((x) => x.compendiumId === "pfcore:fighter")).toHaveLength(1);
    expect(c.features.list.filter((f) => f.category === "class_feature")).toHaveLength(3);
  });
});
