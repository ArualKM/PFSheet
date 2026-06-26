import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { runImportPipeline, mythweaversJsonAdapter, pathforgeJsonAdapter } from "./index";

const MW = {
  _meta_sheet_data_version: 1,
  Name: "Test Hero",
  Player: "GM",
  Race: "Elf",
  Class: "Fighter",
  Level: "5",
  Alignment: "LG",
  Str: "16",
  Dex: "14",
  Con: "13",
  Int: "10",
  Wis: "12",
  Cha: "8",
  Fort: "7",
  FortBase: "4",
  Reflex: "5",
  Will: "3",
  ACArmor: "6",
  ACShield: "2",
  ACNat: "1",
  ACMisc: "0",
  AC: "21",
  InitMisc: "2",
  RABBase: "5/0",
  HP: "45",
  HPWounds: "45",
  Speed: "30",
  Skill01: "Acrobatics",
  Skill01Ab: "Dex",
  Skill01CC: "1",
  Skill01Rank: "5",
  Skill01MiscMod: "2",
  Skill01Mod: "13",
  Skill49: "Int 7/lvl",
  Skill49Rank: "-140",
  Feat1: "##### Feats #####",
  Feat2: "Power Attack",
  Spell01: "Magic Missile",
  Gear01: "Backpack",
  Lang1: "Common",
  __txt_Notes: "################# MYTHIC #################\nTier 3",
  SomeWeirdField: "keepme",
};

describe("mythweavers-json adapter", () => {
  it("detects a Myth-Weavers object", async () => {
    const res = await mythweaversJsonAdapter.detect({ json: MW });
    expect(res.matched).toBe(true);
    expect(res.sourceType).toBe("mythweavers_json");
  });

  it("maps the unambiguous fields", async () => {
    const out = await runImportPipeline({ json: MW });
    const c = out!.draft.character;
    expect(c.identity?.name).toBe("Test Hero");
    expect(c.identity?.race).toBe("Elf");
    expect(c.identity?.totalLevel).toBe(5);
    expect(c.abilities?.primary.str.score).toBe(16);
    expect(c.health?.maxHp).toBe(45);
    expect(c.combat?.bab.total).toBe(5);
    // Saves imported as fixed totals — formula pinned (base left 0 to avoid double-count on rebuild).
    expect(c.defenses?.savingThrows.fortitude.base).toBe(0);
    expect(c.defenses?.savingThrows.fortitude.formula).toBe("7");
    // AC components became typed modifiers.
    const ac = c.defenses?.armorClass.conditionalModifiers ?? [];
    expect(ac.find((m) => m.bonusType === "armor")?.value).toBe(6);
    expect(ac.find((m) => m.bonusType === "shield")?.value).toBe(2);
    // A real skill mapped with ranks + class skill + misc.
    const acro = c.skills?.list.find((s) => s.key === "acrobatics");
    expect(acro?.ranks).toBe(5);
    expect(acro?.classSkill).toBe(true);
    expect(acro?.misc.length).toBe(1);
  });

  it("skips dividers and budget-tracker rows but imports real content", async () => {
    const out = await runImportPipeline({ json: MW });
    const c = out!.draft.character;
    // The "##### Feats #####" divider is dropped; the real feat is kept.
    expect(c.feats?.list.some((f) => f.name === "Power Attack")).toBe(true);
    expect(c.feats?.list.some((f) => f.name.includes("#####"))).toBe(false);
    // "Skill49: Int 7/lvl" (rank -140) is NOT imported as a skill.
    expect(c.spellcasting?.knownSpells.some((s) => s.name === "Magic Missile")).toBe(true);
    expect(c.languages?.known).toContain("Common");
  });

  it("never discards data — preserves unknown fields + text", async () => {
    const out = await runImportPipeline({ json: MW });
    const c = out!.draft.character;
    expect(c.metadata?.unmapped["SomeWeirdField"]).toBe("keepme");
    expect(c.metadata?.unmapped["Skill49"]).toBeTruthy(); // the budget row preserved
    expect(c.notes?.player).toContain("MYTHIC");
    expect(out!.draft.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["unmapped_preserved", "text_preserved", "saves_fixed", "abilities_effective"]),
    );
  });
});

describe("pathforge-json adapter", () => {
  it("round-trips a canonical character", async () => {
    const original = createDefaultCharacter({ name: "Round Trip" });
    const out = await runImportPipeline({ json: original });
    expect(out!.sourceType).toBe("pathforge_json");
    expect(out!.draft.character.identity?.name).toBe("Round Trip");
    expect(out!.validation.ok).toBe(true);
  });

  it("is selected by detect over Myth-Weavers for canonical input", async () => {
    const res = await pathforgeJsonAdapter.detect({ json: createDefaultCharacter({ name: "X" }) });
    expect(res.matched).toBe(true);
  });
});
