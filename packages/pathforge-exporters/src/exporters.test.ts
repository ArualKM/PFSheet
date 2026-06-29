import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { runExport } from "./index";

describe("exporters", () => {
  it("pathforge_json wraps the full character with provenance", async () => {
    const c = createDefaultCharacter({ name: "Export Me" });
    c.identity.classes.push({ id: "c1", name: "Fighter", level: 3 });
    c.identity.totalLevel = 3;
    const res = await runExport("pathforge_json", {
      character: c,
      exportedAt: "2026-01-01T00:00:00Z",
      characterId: "abc",
    });
    expect(res?.contentType).toBe("application/json");
    expect(res?.filename).toContain("export-me");
    const parsed = JSON.parse(res!.text!);
    expect(parsed.character.identity.name).toBe("Export Me");
    expect(parsed.characterSchemaVersion).toBe("pathforge-character-v1");
    expect(parsed.characterId).toBe("abc");
  });

  it("foundry export produces a pf1 actor with provenance flags + items", async () => {
    const c = createDefaultCharacter({ name: "Fvtt Me" });
    c.abilities.primary.str.score = 16;
    c.identity.classes.push({ id: "c1", name: "Wizard", level: 5 });
    c.skills.list[0]!.ranks = 4;
    c.skills.list[0]!.classSkill = true;
    const res = await runExport("foundry_pf1_actor_json", {
      character: c,
      computedSummary: { hp: { max: 30, current: 30 } },
      characterId: "xyz",
      exportedAt: "t",
    });
    const actor = JSON.parse(res!.text!);
    expect(actor.type).toBe("character");
    expect(actor.system.abilities.str.value).toBe(16);
    expect(actor.system.attributes.hp.max).toBe(30);
    expect(actor.system.skills.acr).toMatchObject({ rank: 4, cs: true });
    expect(actor.flags.pathforge.source).toBe("PathForge");
    expect(actor.flags.pathforge.characterId).toBe("xyz");
    expect(actor.items.some((i: { type: string; name: string }) => i.type === "class" && i.name === "Wizard")).toBe(true);
    expect(res!.warnings.length).toBeGreaterThan(0);
  });

  it("returns null for an unimplemented (planned) export type", async () => {
    const c = createDefaultCharacter({ name: "X" });
    // printable_pdf_* are now implemented; discord_embed_json is still planned.
    expect(await runExport("discord_embed_json", { character: c })).toBeNull();
  });
});
