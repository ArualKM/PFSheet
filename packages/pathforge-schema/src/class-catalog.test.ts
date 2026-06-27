import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "./factory";
import { parseCharacter } from "./validate";
import {
  CLASS_CATALOG,
  getClassPreset,
  babForLevel,
  saveBaseForLevel,
  skillRanksForLevel,
  applyClassPreset,
  recomputeClassDerived,
} from "./class-catalog";

const fighter = getClassPreset("fighter")!;
const rogue = getClassPreset("rogue")!;
const wizard = getClassPreset("wizard")!;
const paladin = getClassPreset("paladin")!;
const cleric = getClassPreset("cleric")!;

describe("class progression helpers", () => {
  it("computes BAB by progression", () => {
    expect(babForLevel("full", 5)).toBe(5);
    expect(babForLevel("three_quarter", 4)).toBe(3);
    expect(babForLevel("three_quarter", 2)).toBe(1);
    expect(babForLevel("half", 5)).toBe(2);
  });

  it("computes save bases by progression", () => {
    expect(saveBaseForLevel("good", 1)).toBe(2);
    expect(saveBaseForLevel("good", 4)).toBe(4);
    expect(saveBaseForLevel("poor", 3)).toBe(1);
    expect(saveBaseForLevel("poor", 2)).toBe(0);
  });

  it("computes skill-rank budget with an Int floor of 1/level", () => {
    expect(skillRanksForLevel(6, 1, 3)).toBe(21);
    expect(skillRanksForLevel(2, -1, 5)).toBe(5); // max(1, 2-1)=1 → 5
    expect(skillRanksForLevel(2, -3, 4)).toBe(4); // max(1, -1)=1 → 4
  });

  it("ships the 11 core classes", () => {
    expect(CLASS_CATALOG).toHaveLength(11);
  });
});

describe("applyClassPreset", () => {
  it("fills a single class's derived stats + class skills", () => {
    const c = createDefaultCharacter();
    const report = applyClassPreset(c, { preset: fighter, level: 1 });
    expect(c.identity.classes).toHaveLength(1);
    expect(c.identity.totalLevel).toBe(1);
    expect(c.combat.bab.total).toBe(1);
    expect(c.defenses.savingThrows.fortitude.base).toBe(2);
    expect(c.defenses.savingThrows.reflex.base).toBe(0);
    expect(c.defenses.savingThrows.will.base).toBe(0);
    expect(c.skills.list.find((s) => s.key === "climb")?.classSkill).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it("sums BAB + saves across a multiclass build (Fighter 4 / Rogue 2)", () => {
    const c = createDefaultCharacter();
    applyClassPreset(c, { preset: fighter, level: 4 });
    applyClassPreset(c, { preset: rogue, level: 2 });
    expect(c.identity.totalLevel).toBe(6);
    expect(c.combat.bab.total).toBe(5); // full(4)=4 + three_quarter(2)=1
    expect(c.defenses.savingThrows.fortitude.base).toBe(4); // good(4)=4 + poor(2)=0
    expect(c.defenses.savingThrows.reflex.base).toBe(4); // poor(4)=1 + good(2)=3
    expect(c.defenses.savingThrows.will.base).toBe(1); // poor(4)=1 + poor(2)=0
  });

  it("is idempotent on re-apply (no double-count)", () => {
    const c = createDefaultCharacter();
    applyClassPreset(c, { preset: fighter, level: 4 });
    applyClassPreset(c, { preset: fighter, level: 4 });
    expect(c.identity.classes).toHaveLength(1);
    expect(c.combat.bab.total).toBe(4);
  });

  it("unions class skills without clobbering user-marked skills or ranks", () => {
    const c = createDefaultCharacter();
    const stealth = c.skills.list.find((s) => s.key === "stealth")!;
    stealth.classSkill = true; // user marked stealth (NOT a fighter class skill)
    const climb = c.skills.list.find((s) => s.key === "climb")!;
    climb.ranks = 3; // user put ranks in climb
    applyClassPreset(c, { preset: fighter, level: 1 });
    expect(c.skills.list.find((s) => s.key === "stealth")?.classSkill).toBe(true); // preserved
    expect(c.skills.list.find((s) => s.key === "climb")?.ranks).toBe(3); // ranks untouched
    expect(c.skills.list.find((s) => s.key === "climb")?.classSkill).toBe(true); // marked
  });

  it("respects the HP method (manual leaves HP; average/max compute)", () => {
    const manual = createDefaultCharacter();
    applyClassPreset(manual, { preset: fighter, level: 2, hpMethod: "manual" });
    expect(manual.health.maxHp).toBe(0); // untouched

    const avg = createDefaultCharacter();
    applyClassPreset(avg, { preset: fighter, level: 2, hpMethod: "average" });
    expect(avg.health.maxHp).toBe(16); // 10 (max at 1st) + 6 (d10 half+1)

    const max = createDefaultCharacter();
    applyClassPreset(max, { preset: fighter, level: 2, hpMethod: "max" });
    expect(max.health.maxHp).toBe(20); // 10 + 10
  });

  it("adds a caster entry with the right caster level (full vs paladin minus-three)", () => {
    const w = createDefaultCharacter();
    applyClassPreset(w, { preset: wizard, level: 5 });
    const wc = w.spellcasting.casters.find((c) => c.className === "Wizard");
    expect(wc?.casterType).toBe("spellbook");
    expect(wc?.castingAbility).toBe("int");
    expect(wc?.casterLevel).toBe(5);

    const p = createDefaultCharacter();
    applyClassPreset(p, { preset: paladin, level: 5 });
    expect(p.spellcasting.casters.find((c) => c.className === "Paladin")?.casterLevel).toBe(2); // 5-3
  });

  it("produces a valid sheet that round-trips through parseCharacter", () => {
    const c = createDefaultCharacter();
    applyClassPreset(c, { preset: wizard, level: 3 });
    const parsed = parseCharacter(JSON.parse(JSON.stringify(c)));
    expect(parsed.identity.classes[0]?.presetKey).toBe("wizard");
    expect(parsed.combat.bab.total).toBe(1); // half(3)=1
  });

  it("creates rows for repeatable class skills (craft/profession) a fresh sheet lacks", () => {
    const c = createDefaultCharacter();
    expect(c.skills.list.find((s) => s.key === "craft")).toBeUndefined();
    applyClassPreset(c, { preset: fighter, level: 1 });
    expect(c.skills.list.find((s) => s.key === "craft")?.classSkill).toBe(true);
    expect(c.skills.list.find((s) => s.key === "profession")?.classSkill).toBe(true);
  });

  it("contributes no base saves for a level-0 class", () => {
    const c = createDefaultCharacter();
    applyClassPreset(c, { preset: fighter, level: 0 });
    expect(c.defenses.savingThrows.fortitude.base).toBe(0);
  });

  it("resyncs caster level on recompute after a level change", () => {
    const c = createDefaultCharacter();
    applyClassPreset(c, { preset: wizard, level: 3 });
    c.identity.classes[0]!.level = 7; // simulate the inline Level edit
    recomputeClassDerived(c, { hpMethod: "manual" });
    expect(c.combat.bab.total).toBe(3); // half(7)=3
    expect(c.spellcasting.casters.find((x) => x.className === "Wizard")?.casterLevel).toBe(7);
  });

  it("adopts a matching custom class row instead of duplicating it", () => {
    const c = createDefaultCharacter();
    c.identity.classes.push({ id: "custom1", name: "Fighter", level: 2 });
    applyClassPreset(c, { preset: fighter, level: 3 });
    expect(c.identity.classes.filter((x) => x.name === "Fighter")).toHaveLength(1);
    expect(c.identity.classes[0]?.presetKey).toBe("fighter");
    expect(c.identity.classes[0]?.level).toBe(3);
  });

  it("does not duplicate a caster after the user renames it", () => {
    const c = createDefaultCharacter();
    applyClassPreset(c, { preset: cleric, level: 1 });
    const caster = c.spellcasting.casters.find((x) => x.presetKey === "cleric")!;
    caster.className = "Cleric of Sarenrae"; // user rename
    applyClassPreset(c, { preset: cleric, level: 3 }); // level up
    expect(c.spellcasting.casters.filter((x) => x.presetKey === "cleric")).toHaveLength(1);
    expect(c.spellcasting.casters.find((x) => x.presetKey === "cleric")?.casterLevel).toBe(3);
  });
});
