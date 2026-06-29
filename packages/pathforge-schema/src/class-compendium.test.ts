import { describe, it, expect } from "vitest";
import { CLASS_CATALOG, recomputeClassDerived } from "./class-catalog";
import { parseProgression, compendiumRowToPreset } from "./class-compendium";
import { createDefaultCharacter } from "./factory";
import fixtures from "./class-compendium.fixtures.json";

// Real class_progression.json_data for the 11 core classes (extracted from the PFcore dataset), keyed by
// the class name the dataset uses (matches CLASS_CATALOG.name).
const PROG = fixtures as Record<string, unknown[][]>;

describe("parseProgression infers BAB / save / caster enums matching the hand-written CLASS_CATALOG", () => {
  for (const preset of CLASS_CATALOG) {
    it(`${preset.name}`, () => {
      const jd = PROG[preset.name];
      expect(jd, `missing fixture for ${preset.name}`).toBeDefined();
      const p = parseProgression(jd);
      expect(p.warnings).toEqual([]);
      expect(p.bab).toBe(preset.bab);
      expect(p.saves).toEqual(preset.saves);
      expect(Boolean(p.caster)).toBe(Boolean(preset.caster));
      if (preset.caster) expect(p.caster?.clProgression).toBe(preset.caster.clProgression);
    });
  }
});

describe("compendiumRowToPreset assembles a catalog-equivalent preset from a compendium row", () => {
  it("Wizard: half BAB, good Will, full spellbook caster — matches the hand-written preset", () => {
    const wiz = CLASS_CATALOG.find((c) => c.key === "wizard")!;
    const { preset, warnings } = compendiumRowToPreset({
      key: wiz.key,
      name: wiz.name,
      hitDie: wiz.hitDie,
      skillRanksPerLevel: wiz.skillRanksPerLevel,
      classSkillKeys: wiz.classSkillKeys,
      castingAbility: wiz.caster!.castingAbility,
      casterType: wiz.caster!.casterType,
      progression: PROG.Wizard,
    });
    expect(warnings).toEqual([]);
    expect(preset.bab).toBe("half");
    expect(preset.saves).toEqual({ fortitude: "poor", reflex: "poor", will: "good" });
    expect(preset.caster).toEqual({ casterType: "spellbook", castingAbility: "int", clProgression: "full" });
  });

  it("Paladin: the −3 partial-caster shape is inferred (spells start at 4th level)", () => {
    const pal = CLASS_CATALOG.find((c) => c.key === "paladin")!;
    const { preset } = compendiumRowToPreset({
      key: pal.key,
      name: pal.name,
      hitDie: pal.hitDie,
      skillRanksPerLevel: pal.skillRanksPerLevel,
      classSkillKeys: pal.classSkillKeys,
      castingAbility: pal.caster!.castingAbility,
      casterType: pal.caster!.casterType,
      progression: PROG.Paladin,
    });
    expect(preset.bab).toBe("full");
    expect(preset.caster?.clProgression).toBe("minus_three");
  });
});

describe("the cached compendium preset drives recomputeClassDerived identically to the catalog preset", () => {
  const derived = (c: ReturnType<typeof createDefaultCharacter>) => ({
    bab: c.combat.bab.total,
    fort: c.defenses.savingThrows.fortitude.base,
    ref: c.defenses.savingThrows.reflex.base,
    will: c.defenses.savingThrows.will.base,
    hp: c.health.maxHp,
  });

  // Same class + level, resolved two ways: via presetKey (catalog) vs via a cached compendium preset.
  for (const level of [1, 5, 11, 20]) {
    it(`Fighter L${level}: compendium row recomputes byte-identical BAB/saves/HP (no double-count)`, () => {
      const fighter = CLASS_CATALOG.find((x) => x.key === "fighter")!;
      const { preset } = compendiumRowToPreset({
        key: "pfcore:fighter",
        name: "Fighter",
        hitDie: fighter.hitDie,
        skillRanksPerLevel: fighter.skillRanksPerLevel,
        classSkillKeys: fighter.classSkillKeys,
        progression: PROG.Fighter,
      });

      const catalog = createDefaultCharacter();
      catalog.identity.classes = [{ id: "c1", name: "Fighter", level, hitDie: "d10", presetKey: "fighter" }];
      catalog.identity.totalLevel = level;
      recomputeClassDerived(catalog, { hpMethod: "average" });

      const compendium = createDefaultCharacter();
      compendium.identity.classes = [
        { id: "c1", name: "Fighter", level, hitDie: "d10", compendiumId: "pfcore:fighter", compendiumPreset: preset },
      ];
      compendium.identity.totalLevel = level;
      recomputeClassDerived(compendium, { hpMethod: "average" });

      expect(derived(compendium)).toEqual(derived(catalog));
    });
  }
});
