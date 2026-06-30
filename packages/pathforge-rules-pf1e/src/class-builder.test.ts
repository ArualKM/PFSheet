import { describe, it, expect } from "vitest";
import { createDefaultCharacter, CLASS_CATALOG } from "@pathforge/schema";
import { computeCharacter } from "./compute";
import {
  grantClassFeatures,
  applyCompendiumClass,
  applyArchetype,
  unapplyArchetype,
  parseReplaces,
  type CompendiumFeatureRow,
  type ArchetypeFeatureRow,
} from "./class-builder";

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

  it("re-applying a class with an applied archetype keeps the replaced feature excluded", () => {
    const c = createDefaultCharacter();
    applyCompendiumClass(c, { input: fighterInput(), level: 5, hpMethod: "average", features: FIGHTER_FEATURES });
    const classId = c.identity.classes.find((x) => x.compendiumId === "pfcore:fighter")!.id;
    applyArchetype(c, {
      classId,
      archetype: { name: "Mutation Warrior", compendiumId: "mw-fighter" },
      features: [{ slug: "af-mw", archetype: "Mutation Warrior", feature: "Mutagen", level: 2, replaces: "bravery" }],
    });
    expect(c.features.list.map((f) => f.name)).not.toContain("Bravery (Ex)"); // removed by the archetype
    applyCompendiumClass(c, { input: fighterInput(), level: 5, hpMethod: "average", features: FIGHTER_FEATURES });
    expect(c.features.list.filter((f) => f.name === "Bravery (Ex)")).toHaveLength(0); // not re-granted
  });
});

const ROGUE_FEATURES: CompendiumFeatureRow[] = [
  { id: "rf-trapfinding-1", feature: "Trapfinding", level: 1, type: "Ex" },
  { id: "rf-sneak-1", feature: "Sneak Attack", level: 1, type: "Ex" },
  { id: "rf-trapsense-3", feature: "Trap Sense", level: 3, type: "Ex" },
];
const ACROBAT: ArchetypeFeatureRow[] = [
  { slug: "af-acrobat-expert", archetype: "Acrobat", feature: "Expert Acrobat", level: 1, type: "Ex", replaces: "trapfinding" },
  { slug: "af-acrobat-second", archetype: "Acrobat", feature: "Second Chance", level: 3, type: "Ex", replaces: "trap sense" },
  { slug: "af-acrobat-note", archetype: "Acrobat", feature: "Rogue Talents", level: null, replaces: "" }, // note-only
];
const rogue5 = () => {
  const c = createDefaultCharacter();
  c.identity.classes = [{ id: "rogue1", name: "Rogue", level: 5 }];
  grantClassFeatures(c, { features: ROGUE_FEATURES, toLevel: 5 });
  return c;
};

describe("archetypes (Phase 5)", () => {
  it("parseReplaces splits on comma / semicolon / and", () => {
    expect(parseReplaces("trapfinding, trap sense")).toEqual(["trapfinding", "trap sense"]);
    expect(parseReplaces("uncanny dodge and improved uncanny dodge")).toEqual(["uncanny dodge", "improved uncanny dodge"]);
    expect(parseReplaces("")).toEqual([]);
  });

  it("applies an archetype: removes replaced features, grants archetype features, records replaces", () => {
    const c = rogue5();
    const res = applyArchetype(c, { classId: "rogue1", archetype: { name: "Acrobat", compendiumId: "acrobat-rogue" }, features: ACROBAT });
    expect(res.conflicts).toEqual([]);
    expect(res.replaced.sort()).toEqual(["Trap Sense (Ex)", "Trapfinding (Ex)"]);
    expect(res.added).toEqual(["Expert Acrobat", "Second Chance"]); // the note-only row is skipped
    const names = c.features.list.map((f) => f.name);
    expect(names).not.toContain("Trapfinding (Ex)");
    expect(names).toContain("Expert Acrobat (Ex)");
    expect(names).toContain("Sneak Attack (Ex)"); // not replaced → kept
    expect([...(c.identity.classes[0]!.archetypes?.[0]?.replaces ?? [])].sort()).toEqual(["trap sense", "trapfinding"]);
  });

  it("blocks a second archetype that replaces an already-replaced feature (nothing mutates)", () => {
    const c = rogue5();
    applyArchetype(c, { classId: "rogue1", archetype: { name: "Acrobat", compendiumId: "acrobat-rogue" }, features: ACROBAT });
    const before = c.features.list.length;
    const conflicting: ArchetypeFeatureRow[] = [{ slug: "af-x", archetype: "X", feature: "Y", level: 1, replaces: "trapfinding" }];
    const res = applyArchetype(c, { classId: "rogue1", archetype: { name: "X", compendiumId: "x-rogue" }, features: conflicting });
    expect(res.conflicts).toEqual(["trapfinding"]);
    expect(c.features.list).toHaveLength(before);
    expect(c.identity.classes[0]!.archetypes).toHaveLength(1);
  });

  it("stacks a compatible archetype that replaces a different feature", () => {
    const c = rogue5();
    applyArchetype(c, { classId: "rogue1", archetype: { name: "Acrobat", compendiumId: "acrobat-rogue" }, features: ACROBAT });
    const compatible: ArchetypeFeatureRow[] = [{ slug: "af-z", archetype: "Z", feature: "Zfeat", level: 1, replaces: "sneak attack" }];
    const res = applyArchetype(c, { classId: "rogue1", archetype: { name: "Z", compendiumId: "z-rogue" }, features: compatible });
    expect(res.conflicts).toEqual([]);
    expect(c.identity.classes[0]!.archetypes).toHaveLength(2);
    expect(c.features.list.map((f) => f.name)).not.toContain("Sneak Attack (Ex)");
  });

  it("level-up excludes archetype-replaced features (no re-grant)", () => {
    const c = createDefaultCharacter();
    c.identity.classes = [{ id: "rogue1", name: "Rogue", level: 1 }];
    grantClassFeatures(c, { features: ROGUE_FEATURES, toLevel: 1 });
    applyArchetype(c, { classId: "rogue1", archetype: { name: "Acrobat", compendiumId: "acrobat-rogue" }, features: ACROBAT });
    grantClassFeatures(c, { features: ROGUE_FEATURES, fromLevel: 1, toLevel: 5, exclude: ["trapfinding", "trap sense"] });
    expect(c.features.list.map((f) => f.name)).not.toContain("Trap Sense (Ex)");
  });

  it("unapplyArchetype removes the record + its features and reports the standards to restore", () => {
    const c = rogue5();
    applyArchetype(c, { classId: "rogue1", archetype: { name: "Acrobat", compendiumId: "acrobat-rogue" }, features: ACROBAT });
    expect(c.features.list.map((f) => f.name)).toContain("Expert Acrobat (Ex)");

    const res = unapplyArchetype(c, { classId: "rogue1", archetype: { name: "Acrobat", compendiumId: "acrobat-rogue" } });
    // The archetype's own granted features are gone…
    const names = c.features.list.map((f) => f.name);
    expect(names).not.toContain("Expert Acrobat (Ex)");
    expect(names).not.toContain("Second Chance (Ex)");
    // …the record is gone…
    expect(c.identity.classes[0]!.archetypes).toHaveLength(0);
    // …and it reports the standard features the caller should restore.
    expect([...res.restore].sort()).toEqual(["trap sense", "trapfinding"]);
  });

  it("unapplyArchetype only reports standards NOT still replaced by a remaining archetype", () => {
    const c = rogue5();
    applyArchetype(c, { classId: "rogue1", archetype: { name: "Acrobat", compendiumId: "acrobat-rogue" }, features: ACROBAT });
    const sneak: ArchetypeFeatureRow[] = [{ slug: "af-z", archetype: "Z", feature: "Zfeat", level: 1, replaces: "sneak attack" }];
    applyArchetype(c, { classId: "rogue1", archetype: { name: "Z", compendiumId: "z-rogue" }, features: sneak });

    // Removing Z restores only "sneak attack"; Acrobat's trapfinding/trap sense stay replaced.
    const res = unapplyArchetype(c, { classId: "rogue1", archetype: { name: "Z", compendiumId: "z-rogue" } });
    expect(res.restore).toEqual(["sneak attack"]);
    expect(c.identity.classes[0]!.archetypes).toHaveLength(1);
  });

  it("unapplyArchetype is a no-op for an archetype that isn't applied", () => {
    const c = rogue5();
    const res = unapplyArchetype(c, { classId: "rogue1", archetype: { name: "Nope", compendiumId: "nope" } });
    expect(res).toEqual({ removedFeatures: [], restore: [] });
  });
});
