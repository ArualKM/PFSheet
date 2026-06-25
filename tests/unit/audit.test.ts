import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { auditCharacter } from "@/lib/character/audit";

function audit(mutate: (c: ReturnType<typeof createDefaultCharacter>) => void) {
  const c = createDefaultCharacter({ name: "Audit Target" });
  mutate(c);
  return auditCharacter(c, computeCharacter(c));
}

describe("auditCharacter", () => {
  it("a level-consistent character raises no math warnings", () => {
    const report = audit((c) => {
      c.identity.classes.push({ id: "c1", name: "Fighter", level: 3 });
      c.identity.totalLevel = 3;
      c.health.maxHp = 24;
    });
    expect(report.warnings.filter((w) => w.severity === "warning")).toHaveLength(0);
  });

  it("flags a total-level vs class-level mismatch", () => {
    const report = audit((c) => {
      c.identity.classes.push({ id: "c1", name: "Fighter", level: 5 });
      c.identity.totalLevel = 3;
    });
    expect(report.warnings.some((w) => w.id === "level-mismatch")).toBe(true);
  });

  it("flags a skill ranked above the character level", () => {
    const report = audit((c) => {
      c.identity.classes.push({ id: "c1", name: "Rogue", level: 3 });
      c.identity.totalLevel = 3;
      c.skills.list[0]!.ranks = 5;
    });
    expect(report.warnings.some((w) => w.id.startsWith("skill-overrank-"))).toBe(true);
  });

  it("lists custom buffs as custom content", () => {
    const report = audit((c) => {
      c.buffs.active.push({ id: "b1", name: "Homebrew Boon", enabled: true, category: "custom", effects: [] });
    });
    expect(report.customContent.some((x) => x.kind === "Buff" && x.name === "Homebrew Boon")).toBe(true);
    expect(report.activeBuffs.some((b) => b.name === "Homebrew Boon" && b.custom)).toBe(true);
  });

  it("reports a 3pp/custom-sourced feat and surfaces GM-flagged entries", () => {
    const report = audit((c) => {
      c.feats.list.push({
        id: "f1",
        name: "Psionic Talent",
        source: { module: "psionics" },
        tags: [],
        automation: [],
        gmStatus: "flagged",
      });
    });
    expect(report.customContent.some((x) => x.kind === "Feat" && x.name === "Psionic Talent")).toBe(true);
    expect(report.flaggedEntries.some((x) => x.name === "Psionic Talent")).toBe(true);
  });

  it("reports enabled optional rule modules", () => {
    const report = audit((c) => {
      c.rules.variants.mythic = true;
    });
    expect(report.modules.some((m) => m.key === "mythic")).toBe(true);
  });
});

describe("auditCharacter privacy gating", () => {
  it("hides feats from a GM when the owner restricts the section", () => {
    const c = createDefaultCharacter({ name: "Secretive" });
    c.feats.list.push({
      id: "f1",
      name: "Secret Feat",
      source: { custom: true },
      tags: [],
      automation: [],
      gmStatus: "flagged",
    });
    c.privacy.sections.feats = "owner_only";
    const report = auditCharacter(c, computeCharacter(c), "gm");
    expect(report.customContent.some((x) => x.name === "Secret Feat")).toBe(false);
    expect(report.flaggedEntries.some((x) => x.name === "Secret Feat")).toBe(false);
    expect(report.hiddenSections).toContain("Feats");
  });

  it("hides formula overrides + notes from a GM when formulaDetails is owner-only", () => {
    const c = createDefaultCharacter({ name: "Secretive" });
    c.formulas.overrides["defenses.armorClass.total"] = {
      targetPath: "defenses.armorClass.total",
      formula: "10 + 99",
      enabled: true,
      note: "houserule",
    };
    c.privacy.sections.formulaDetails = "owner_only";
    const report = auditCharacter(c, computeCharacter(c), "gm");
    expect(report.formulaOverrides).toHaveLength(0);
    expect(report.customFormulaCount).toBe(0);
    expect(report.hiddenSections).toContain("Formula details");
  });

  it("an owner viewer sees everything regardless of section privacy", () => {
    const c = createDefaultCharacter({ name: "Secretive" });
    c.feats.list.push({ id: "f1", name: "Secret Feat", source: { custom: true }, tags: [], automation: [] });
    c.privacy.sections.feats = "owner_only";
    const report = auditCharacter(c, computeCharacter(c), "owner");
    expect(report.customContent.some((x) => x.name === "Secret Feat")).toBe(true);
    expect(report.hiddenSections).toHaveLength(0);
  });
});
