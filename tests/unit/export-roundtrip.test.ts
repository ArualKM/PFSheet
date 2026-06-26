import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { runExport } from "@pathforge/exporters";
import { runImportPipeline } from "@pathforge/importers";

function summaryOf(c: ReturnType<typeof createDefaultCharacter>) {
  return computeCharacter(c).summary as unknown as Record<string, unknown>;
}

describe("export -> import round-trip", () => {
  it("PathForge JSON export re-imports to an equivalent character", async () => {
    const c = createDefaultCharacter({ name: "Round Trip", playerName: "P" });
    c.identity.classes.push({ id: "c1", name: "Rogue", level: 4 });
    c.identity.totalLevel = 4;
    c.abilities.primary.dex.score = 18;

    const ex = await runExport("pathforge_json", { character: c, computedSummary: summaryOf(c), exportedAt: "t", characterId: "id1" });
    const imp = await runImportPipeline({ text: ex!.text!, filename: ex!.filename });

    expect(imp?.sourceType).toBe("pathforge_json");
    expect(imp!.draft.character.identity?.name).toBe("Round Trip");
    expect(imp!.draft.character.identity?.totalLevel).toBe(4);
    expect(imp!.draft.character.abilities?.primary.dex.score).toBe(18);
  });

  it("Foundry export re-imports with recomputed level + abilities", async () => {
    const c = createDefaultCharacter({ name: "Fvtt Round" });
    c.identity.classes.push({ id: "c1", name: "Fighter", level: 6 });
    c.identity.totalLevel = 6;
    c.abilities.primary.str.score = 17;

    const ex = await runExport("foundry_pf1_actor_json", { character: c, computedSummary: summaryOf(c), characterId: "id2", exportedAt: "t" });
    const imp = await runImportPipeline({ text: ex!.text!, sourceType: "foundry_pf1_actor_json" });

    expect(imp?.sourceType).toBe("foundry_pf1_actor_json");
    expect(imp!.draft.character.identity?.name).toBe("Fvtt Round");
    expect(imp!.draft.character.abilities?.primary.str.score).toBe(17);
    expect(imp!.draft.character.identity?.totalLevel).toBe(6); // recomputed from class items
  });
});
