import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { safeParseCharacter } from "@pathforge/schema";
import { runImportPipeline } from "./index";

// Real Myth-Weavers exports committed under docs/ (read from the repo root cwd).
function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), "docs", name), "utf8"));
}

describe("Myth-Weavers import — real docs fixtures", () => {
  it("imports the fleshed-out Anise sheet: core stats mapped, everything preserved", async () => {
    const json = loadFixture("ASOS_Redux_1_Anise.json");
    const out = await runImportPipeline({ json, filename: "ASOS_Redux_1_Anise.json" });
    expect(out).toBeTruthy();
    const c = out!.draft.character;

    expect(c.identity?.name).toBe("Anise Mínervudóttir");
    expect(c.identity?.totalLevel).toBe(20);
    expect(c.rules?.variants.mythic).toBe(true); // detected from "20/MT10"
    expect(c.abilities?.primary.cha.score).toBe(74);

    const bluff = c.skills?.list.find((s) => s.key === "bluff");
    expect(bluff?.ranks).toBe(20);
    expect(bluff?.classSkill).toBe(true);

    // Repeatable specialty skill synthesized (was being dropped).
    const perform = c.skills?.list.find((s) => s.key === "perform");
    expect(perform?.ranks).toBe(20);
    expect(perform?.specialty).toBe("dance");

    // Saves: formula pinned to the total so the ability mod isn't double-counted.
    expect(c.defenses?.savingThrows.fortitude.base).toBe(47);
    expect(c.defenses?.savingThrows.fortitude.formula).toBe("47");

    // Lossless: the gold ledger + mythic build land in notes; Campaign + CMD in unmapped;
    // the shield's magic properties + an item's slot survive on the items.
    expect(c.notes?.player).toContain("QUEST"); // __txt_Cash ledger
    expect(c.notes?.player).toContain("Mythic"); // __txt_Notes mythic build
    expect(c.metadata?.unmapped["Campaign"]).toBe("ASOS");
    expect(c.metadata?.unmapped["CMD"]).toBe("37");
    expect(c.inventory?.armorAndShields.find((i) => i.name.includes("Buckler"))?.notes).toContain(
      "Greater Fortifying",
    );
    expect(c.inventory?.gear.find((g) => g.name.includes("Amulet of Bones"))?.notes).toContain("Neck");

    // The draft validates against the canonical schema.
    expect(safeParseCharacter(c).ok).toBe(true);

    expect(out!.draft.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["mythic_detected", "unmapped_preserved", "text_preserved"]),
    );
  });

  it("imports the template sheet without crashing and drops placeholders", async () => {
    const json = loadFixture("Mythweavers Exported Sheet.json");
    const out = await runImportPipeline({ json });
    expect(out).toBeTruthy();
    const c = out!.draft.character;

    // Template placeholders must not be ingested as real data.
    expect(c.languages?.known).not.toContain("Language");
    expect(c.inventory?.gear.some((g) => g.name === "Item")).toBe(false);
    expect(safeParseCharacter(c).ok).toBe(true);
  });
});
