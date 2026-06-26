import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { safeParseCharacter } from "@pathforge/schema";
import { runImportPipeline, foundryPf1ActorJsonAdapter } from "./index";

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), "docs", name), "utf8"));
}

describe("Foundry PF1e actor import — real docs fixtures", () => {
  it("imports the modern Fuko export: recomputes totals + detects modules", async () => {
    const json = loadFixture("fvtt-Actor-fuko-di-wulfe-PsAtczQW32fix2QG.json");
    const out = await runImportPipeline({ json, filename: "fuko.json" });
    expect(out?.sourceType).toBe("foundry_pf1_actor_json");
    const c = out!.draft.character;

    expect(c.identity?.name).toBe("Fuko Di Wulfe");
    expect(c.identity?.race).toBe("Aasimar");
    expect(c.identity?.size).toBe("Medium");
    expect(c.abilities?.primary.int.score).toBe(18);
    expect(c.abilities?.primary.str.score).toBe(7);

    // Recomputed-from-classes totals (modern export has none of these stored).
    expect(c.identity?.totalLevel).toBe(15); // base class 15; mythic excluded
    expect(c.combat?.bab.total).toBe(11); // 3/4 BAB × 15
    expect(c.defenses?.savingThrows.fortitude.base).toBe(9); // good save at L15
    expect(c.health?.maxHp).toBeGreaterThan(0);

    // Modules detected.
    expect(c.rules?.variants.mythic).toBe(true); // subType:"mythic" class
    expect(c.rules?.modules.some((m) => m.key === "spheres_of_power")).toBe(true); // flags.pf1-pow

    // Items → structured collections.
    expect(c.feats?.list.length).toBe(11);
    expect(c.spellcasting?.knownSpells.length).toBe(45);
    expect(c.buffs?.active.length).toBe(19);
    expect(c.combat?.attacks.length).toBe(6); // 2 weapon + 4 attack
    expect(c.spellcasting?.casters.length).toBeGreaterThanOrEqual(1);
    expect(c.spellcasting?.casters[0]?.castingAbility).toBe("int");

    // Skills incl. nested Craft specialties.
    expect(c.skills?.list.find((s) => s.key === "acrobatics")?.ranks).toBe(15);
    expect(c.skills?.list.some((s) => s.specialty === "Alchemy")).toBe(true);

    expect(c.languages?.known).toContain("giant");

    // Buff mechanical effects are translated (not dropped to []).
    expect(c.buffs?.active.some((b) => b.effects.length > 0)).toBe(true);
    // Weapon damage type preserved; senses preserved under unmapped.
    expect(c.combat?.attacks.some((a) => a.damageType === "slashing")).toBe(true);
    expect(c.metadata?.unmapped["traits.senses"]).toBeTruthy();

    expect(safeParseCharacter(c).ok).toBe(true);
    expect(out!.draft.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        "mythic_detected",
        "spheres_detected",
        "abilities_base",
        "modern_persisted",
        "buff_effects",
        "traits_preserved",
      ]),
    );
  });

  it("degrades gracefully on a malformed items[] (null element) instead of throwing", async () => {
    const out = await runImportPipeline({ json: { type: "character", system: {}, items: [null], _stats: { systemId: "pf1" } } });
    expect(out?.sourceType).toBe("foundry_pf1_actor_json");
    expect(safeParseCharacter(out!.draft.character).ok).toBe(true);
  });

  it("does not claim a non-pf1 (e.g. dnd5e) Foundry actor", async () => {
    const res = await foundryPf1ActorJsonAdapter.detect({ json: { type: "character", system: {}, items: [], _stats: { systemId: "dnd5e" } } });
    expect(res.matched).toBe(false);
  });

  it("imports the empty default sheet without crashing", async () => {
    const json = loadFixture("fvtt-Actor-player-character-(pc)-J7jE7hKsRjT5Gvu2.json");
    const out = await runImportPipeline({ json });
    expect(out?.sourceType).toBe("foundry_pf1_actor_json");
    const c = out!.draft.character;
    expect(c.identity?.name).toBe("Player Character (PC)");
    expect(c.identity?.totalLevel).toBe(0);
    expect(safeParseCharacter(c).ok).toBe(true);
  });

  it("detects the legacy data-key template shape too", async () => {
    const json = loadFixture("foundry-pf1-actor-PC-sample.json");
    const res = await foundryPf1ActorJsonAdapter.detect({ json });
    expect(res.matched).toBe(true);
    const out = await runImportPipeline({ json });
    expect(out?.sourceType).toBe("foundry_pf1_actor_json");
    expect(safeParseCharacter(out!.draft.character).ok).toBe(true);
  });
});
