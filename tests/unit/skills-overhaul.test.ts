import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter, previewBuffEffects, classifyTarget } from "@pathforge/rules-pf1e";

function base() {
  const c = createDefaultCharacter({ name: "X" });
  c.identity.totalLevel = 4;
  c.abilities.primary.str.score = 18; // +4
  c.abilities.primary.dex.score = 12; // +1
  c.abilities.primary.int.score = 16; // +3
  return c;
}

describe("skill ability override", () => {
  it("Acrobatics keyed to Str uses the Str modifier", () => {
    const c = base();
    const acro = c.skills.list.find((s) => s.key === "acrobatics")!;
    const before = computeCharacter(c).skills.acrobatics!.value; // dex +1
    acro.abilityOverride = "str";
    const after = computeCharacter(c).skills.acrobatics!.value; // str +4
    expect(after - before).toBe(3);
  });

  it("an empty override falls back to the default ability", () => {
    const c = base();
    const acro = c.skills.list.find((s) => s.key === "acrobatics")!;
    acro.abilityOverride = "";
    expect(computeCharacter(c).skills.acrobatics!.value).toBe(1);
  });
});

describe("ability-group skill buff targets", () => {
  it("classifyTarget maps skill.<ability>.all to its own bucket (not a skill named 'str')", () => {
    expect(classifyTarget("skill.str.all")).toBe("skill.str.all");
    expect(classifyTarget("skills.dex.all")).toBe("skill.dex.all");
    expect(classifyTarget("skill.acrobatics")).toBe("skill.acrobatics");
    expect(classifyTarget("skill.all")).toBe("skill.all");
  });

  it("a skill.str.all buff boosts Str-based skills only", () => {
    const c = base();
    c.buffs.active.push({
      id: "b1",
      name: "Bull's focus",
      enabled: true,
      effects: [{ id: "e1", target: "skill.str.all", operation: "add", value: 2, bonusType: "competence" }],
    });
    const out = computeCharacter(c);
    expect(out.skills.climb!.value).toBe(4 + 2); // str-based
    expect(out.skills.acrobatics!.value).toBe(1); // dex-based, untouched
  });

  it("the group follows an ability OVERRIDE (Str-keyed Acrobatics joins skill.str.all)", () => {
    const c = base();
    c.skills.list.find((s) => s.key === "acrobatics")!.abilityOverride = "str";
    c.buffs.active.push({
      id: "b1",
      name: "Bull's focus",
      enabled: true,
      effects: [{ id: "e1", target: "skill.str.all", operation: "add", value: 2, bonusType: "competence" }],
    });
    const out = computeCharacter(c);
    expect(out.skills.acrobatics!.value).toBe(4 + 2);
  });

  it("an individual skill target only hits that skill", () => {
    const c = base();
    c.buffs.active.push({
      id: "b1",
      name: "Cat's grace of one skill",
      enabled: true,
      effects: [{ id: "e1", target: "skill.stealth", operation: "add", value: 5, bonusType: "competence" }],
    });
    const out = computeCharacter(c);
    expect(out.skills.stealth!.value).toBe(1 + 5);
    expect(out.skills.acrobatics!.value).toBe(1);
  });
});

describe("ƒx skill misc evaluates against the CURRENT row's scope (stale-local regression)", () => {
  it("a misc formula of @{ranks} always doubles the row's own ranks, wherever the skill sits", () => {
    const c = base();
    const appraise = c.skills.list.find((s) => s.key === "appraise")!;
    appraise.ranks = 7;
    const bluff = c.skills.list.find((s) => s.key === "bluff")!;
    bluff.ranks = 2;
    bluff.misc.push({ id: "m1", label: "Echo ranks", value: "@{ranks}", enabled: true });
    // Bluff is cha-based (+0 here): 2 ranks + misc(@{ranks}=2) = 4, NOT 9 (2 + Appraise's 7).
    expect(computeCharacter(c).skills.bluff!.value).toBe(4);
  });

  it("the FIRST skill in the list gets its own ranks too (not 0 from an empty overlay)", () => {
    const c = base();
    const first = c.skills.list[0]!;
    first.ranks = 5;
    first.abilityOverride = "con"; // con +0 so the total isolates ranks+misc
    first.classSkill = false;
    first.misc.push({ id: "m1", label: "Echo ranks", value: "@{ranks}", enabled: true });
    expect(computeCharacter(c).skills[first.key]!.value).toBe(10);
  });

  it("@{misc} inside a misc formula resolves to 0 (no self-reference), not a stale total", () => {
    const c = base();
    const bluff = c.skills.list.find((s) => s.key === "bluff")!;
    bluff.misc.push({ id: "m1", label: "Self ref", value: "@{misc} + 3", enabled: true });
    expect(computeCharacter(c).skills.bluff!.value).toBe(3);
  });
});

describe("direct save/AC ƒx modifiers see the FULL resolver (buffed abilities)", () => {
  it("a Fortitude misc formula of @{abilities.str.mod} includes an active Str buff", () => {
    const c = base(); // str 18 → +4
    c.buffs.active.push({
      id: "b1",
      name: "Bull's Strength",
      enabled: true,
      effects: [{ id: "e1", target: "abilities.str", operation: "add", value: 4, bonusType: "enhancement" }],
    });
    c.defenses.savingThrows.fortitude.misc.push({
      id: "m1",
      label: "Str to Fort",
      value: "@{abilities.str.mod}",
      enabled: true,
    });
    // str 18 + 4 enhancement = 22 → +6; fort = base 0 + con 0 + 6
    expect(computeCharacter(c).summary.fortitude).toBe(6);
  });

  it("an AC modifier formula referencing @{ac.armor} sees equipped armor", () => {
    const c = base();
    c.inventory.armorAndShields.push({
      id: "arm1",
      name: "Chain shirt",
      category: "armor",
      equipped: true,
      armorBonus: 4,
      modifiers: [],
      automation: [],
    } as never);
    c.defenses.armorClass.conditionalModifiers.push({
      id: "acm1",
      label: "Echo armor",
      value: "@{ac.armor}",
      bonusType: "insight",
      enabled: true,
    });
    // 10 + dex 1 + armor 4 + insight(=4) = 19
    expect(computeCharacter(c).summary.ac).toBe(19);
  });
});

describe("classifyTarget anchors namespaced targets before fuzzy matching", () => {
  it("a generated skill key containing 'cmb' still routes to the skill, not CMB", () => {
    expect(classifyTarget("skill.craft_mcmbx1")).toBe("skill.craft_mcmbx1");
    expect(classifyTarget("skill.willpower_lore")).toBe("skill.willpower_lore");
    expect(classifyTarget("abilities.willfulness")).toBe("ability.willfulness");
  });

  it("free-typed stat targets still classify via the fuzzy fallback", () => {
    expect(classifyTarget("cmb")).toBe("attack.cmb");
    expect(classifyTarget("fortitude save")).toBe("save.fortitude");
    expect(classifyTarget("defenses.armorClass")).toBe("ac");
  });
});

describe("buff preview includes per-skill deltas", () => {
  it("previewBuffEffects reports the affected skills by display label", () => {
    const c = base();
    const rows = previewBuffEffects(c, [
      { id: "e1", target: "skill.str.all", operation: "add", value: 2, bonusType: "competence" },
    ]);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Climb");
    expect(labels).toContain("Swim");
    expect(labels).not.toContain("Acrobatics");
    const climb = rows.find((r) => r.label === "Climb")!;
    expect(climb.delta).toBe(2);
  });
});
