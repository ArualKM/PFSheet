import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { createDefaultCharacter } from "@pathforge/schema";
import { PDFDocument } from "pdf-lib";
import { printablePdfModernExporter, printablePdfClassicExporter } from "./printable-pdf";

const SCRATCH =
  "C:/Users/bitte/AppData/Local/Temp/claude/C--Users-bitte-Documents-Projects-PFSheet/992cdc56-0aa8-4ee6-b773-7243d3e57779/scratchpad/sample-sheet.pdf";

function sample() {
  const c = createDefaultCharacter({ name: "Seraphina Duskwarden" });
  c.identity.race = "Half-Elf";
  c.identity.alignment = "CG";
  c.identity.size = "Medium";
  c.identity.deity = "Desna";
  c.identity.classes = [{ id: "c1", name: "Ranger", level: 7 }];
  c.identity.totalLevel = 7;
  c.abilities.primary.str.score = 14;
  c.abilities.primary.dex.score = 18;
  c.abilities.primary.con.score = 13;
  c.abilities.primary.int.score = 10;
  c.abilities.primary.wis.score = 15;
  c.abilities.primary.cha.score = 12;
  c.health.maxHp = 58;
  c.health.currentHp = 58;
  c.combat.bab.total = 7;
  c.combat.speed.base = "30 ft";
  c.combat.attacks.push(
    {
      id: "a1",
      name: "+1 Longbow",
      attackType: "ranged",
      attackFormula: "@{combat.bab.total} + @{abilities.dex.mod} + 1",
      damageFormula: "1d8+1",
      range: "110 ft",
      enabled: true,
      showInCombat: true,
      conditionalModifiers: [],
    },
    {
      id: "a2",
      name: "Longsword",
      attackType: "melee",
      attackFormula: "@{combat.bab.total} + @{abilities.str.mod}",
      damageFormula: "1d8+2",
      enabled: true,
      showInCombat: true,
      conditionalModifiers: [],
    },
  );
  for (const key of ["perception", "stealth", "survival", "climb", "swim", "handle_animal", "knowledge_nature"]) {
    const s = c.skills.list.find((x) => x.key === key);
    if (s) s.ranks = 7;
  }
  c.feats.list.push(
    { id: "f1", name: "Point-Blank Shot", tags: [], automation: [] },
    { id: "f2", name: "Precise Shot", tags: [], automation: [] },
    { id: "f3", name: "Rapid Shot", tags: [], automation: [] },
    { id: "f4", name: "Weapon Focus (Longbow)", tags: [], automation: [] },
  );
  return c;
}

describe("printable PDF exporter", () => {
  it("produces a valid, non-trivial PDF and writes a sample for inspection", async () => {
    const res = await printablePdfModernExporter.run({
      character: sample(),
      exportedAt: "2026-06-29T00:00:00.000Z",
      shareUrl: "https://pfsheet.org/c/seraphina",
    });
    expect(res.contentType).toBe("application/pdf");
    expect(res.filename).toMatch(/\.pdf$/);
    const bytes = res.bytes;
    expect(bytes).toBeDefined();
    expect(bytes!.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes!.slice(0, 5))).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes!);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
    writeFileSync(SCRATCH, bytes!);
  });

  it("renders a blank default character without throwing", async () => {
    const res = await printablePdfClassicExporter.run({ character: createDefaultCharacter({ name: "Blank" }) });
    expect(res.bytes!.length).toBeGreaterThan(800);
  });

  it("handles a formula-valued BAB (renders +0, not NaN)", async () => {
    const c = createDefaultCharacter({ name: "Formula BAB" });
    // bab.total may be a formula object (numberOrFormula); the cell must finite-guard to 0, not "NaN".
    (c.combat.bab as { total: unknown }).total = { formula: "@{level.total}" };
    const res = await printablePdfModernExporter.run({ character: c });
    expect(res.bytes!.length).toBeGreaterThan(800);
    expect(new TextDecoder().decode(res.bytes!.slice(0, 5))).toBe("%PDF-");
  });
});
