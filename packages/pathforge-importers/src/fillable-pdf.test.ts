import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { safeParseCharacter } from "@pathforge/schema";
import { runImportPipeline, fillablePdfAdapter } from "./index";

async function makePdf(fields: Record<string, string>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();
  let y = 760;
  for (const [name, value] of Object.entries(fields)) {
    const tf = form.createTextField(name);
    tf.setText(value);
    tf.addToPage(page, { x: 40, y, width: 200, height: 16 });
    y -= 20;
  }
  return doc.save();
}

describe("fillable-pdf adapter", () => {
  it("extracts AcroForm fields and maps the common ones (lossless on the rest)", async () => {
    const bytes = await makePdf({
      CharacterName: "Pdf Hero",
      Race: "Dwarf",
      STR: "16",
      DEX: "12",
      CON: "14",
      INT: "10",
      WIS: "13",
      CHA: "8",
      HP: "28",
      BAB: "3",
      Fort: "5",
      Ref: "2",
      Will: "4",
      Speed: "20",
      AcrobaticsRanks: "5",
      HomebrewField: "keep me",
    });

    const out = await runImportPipeline({ bytes, filename: "sheet.pdf" });
    expect(out?.sourceType).toBe("fillable_pdf");
    const c = out!.draft.character;

    expect(c.identity?.name).toBe("Pdf Hero");
    expect(c.identity?.race).toBe("Dwarf");
    expect(c.abilities?.primary.str.score).toBe(16);
    expect(c.abilities?.primary.cha.score).toBe(8);
    expect(c.health?.maxHp).toBe(28);
    expect(c.combat?.bab.total).toBe(3);
    // Saves imported as fixed totals (formula pinned, base left 0).
    expect(c.defenses?.savingThrows.fortitude.base).toBe(0);
    expect(c.defenses?.savingThrows.fortitude.formula).toBe("5");
    expect(c.combat?.speed.base).toBe("20 ft");
    expect(c.skills?.list.find((sk) => sk.key === "acrobatics")?.ranks).toBe(5);

    // Lossless: unknown field preserved.
    expect(c.metadata?.unmapped["HomebrewField"]).toBe("keep me");
    expect(safeParseCharacter(c).ok).toBe(true);
    expect(out!.draft.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["pdf_best_effort", "unmapped_preserved"]),
    );
  });

  it("detects a PDF by magic bytes and handles a form-less PDF without crashing", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const res = await fillablePdfAdapter.detect({ bytes });
    expect(res.matched).toBe(true);
    const out = await runImportPipeline({ bytes });
    expect(out?.draft.warnings.some((w) => w.code === "no_fields")).toBe(true);
  });
});
