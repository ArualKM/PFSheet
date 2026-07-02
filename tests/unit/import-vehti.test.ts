import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { runImportPipeline } from "@pathforge/importers";
import type { PathForgeCharacterV1 } from "@pathforge/schema";
import {
  collectProbes,
  assembleClaims,
  entryKeys,
  splitEntryText,
  mineNotesEntries,
  type ProbeCandidates,
  type ClaimProbe,
} from "@/lib/character/import-claims";

/**
 * The owner's SECOND grounding fixture (docs/Vehti.json): a plain gestalt Shaman || Druid
 * (Reincarnated) Being of Ib. It exposed the text shapes the first cut missed — "LVL 1)
 * Toughness - +3 HP" prefixes + dash descriptions, "Name: description" racial traits,
 * "Nature Bond -> HERBALISM: …" arrows, semicolon/comma multi-entry lines, "===" dividers,
 * drawbacks in the flaws text area, and the adapter's slot ORDER (the "#### RACIAL TRAITS ####"
 * divider must precede the entries it labels).
 */

const FIXTURE = resolve(__dirname, "../../docs/Vehti.json");

async function vehti(): Promise<PathForgeCharacterV1> {
  const text = readFileSync(FIXTURE, "utf8");
  const result = await runImportPipeline({ text });
  expect(result).toBeTruthy();
  return result!.draft.character as PathForgeCharacterV1;
}

describe("entryKeys — Vehti's real slot shapes", () => {
  it("strips label prefixes and dash/colon/arrow descriptions down to the entry name", () => {
    expect(entryKeys("LVL 1) Toughness - +3 HP")).toContain("Toughness");
    expect(entryKeys("Flaw) Spell Focus (Conjuration) - prereq for Augment; +1 DC conjuration")).toContain("Spell Focus");
    expect(entryKeys("Flaw) Spell Focus (Conjuration) - prereq for Augment; +1 DC conjuration")).toContain(
      "Spell Focus (Conjuration)",
    );
    expect(entryKeys("MD) Lightning Reflexes - +2 Reflex")).toContain("Lightning Reflexes");
    expect(entryKeys("BG) Scribe Scroll - the archivist who writes her own scrolls")).toContain("Scribe Scroll");
    expect(entryKeys("Oath 2) Extra Hex - Fortune (give an ally/self a reroll, 1/round)")).toContain("Extra Hex");
    expect(entryKeys("Aquatic: breathe water; no Swim checks; Swim always class skill")).toContain("Aquatic");
    expect(entryKeys("Nature Bond -> HERBALISM: brew herbal concoctions (druid-spell potions); free/day = Wis mod = 6")).toContain(
      "Nature Bond",
    );
    expect(entryKeys("Hex -> Benefit of Wisdom: use WIS in place of INT on all Int-based skill checks  <<< keystone")).toContain("Hex");
    // Arrow lines also offer the post-half ability name.
    expect(entryKeys("Spirit (Lore) -> Monstrous Insight (Su): ID a creature")).toEqual(
      expect.arrayContaining(["Spirit", "Monstrous Insight"]),
    );
    // The search query (last key) is the most-stripped NAME half, not the description.
    const tk = entryKeys("LVL 1) Toughness - +3 HP");
    expect(tk[tk.length - 1]).toBe("Toughness");
  });

  it("splitEntryText keeps the rules text as detail", () => {
    expect(splitEntryText("Voiceless: cannot speak/take verbal actions; ALL verbal spell components -> thought components")).toEqual({
      name: "Voiceless",
      detail: "cannot speak/take verbal actions; ALL verbal spell components -> thought components",
    });
    expect(splitEntryText("LVL 1) Toughness - +3 HP")).toEqual({ name: "Toughness", detail: "+3 HP" });
  });
});

describe("collectProbes on the Vehti fixture", () => {
  it("orders slots numerically so typed dividers give their sections context", async () => {
    const c = await vehti();
    const report = collectProbes(c);
    const probeFor = (needle: string) => report.probes.find((p) => p.sourceText.includes(needle));

    // Racial traits sit under the "#### RACIAL TRAITS - Being of Ib ####" divider.
    expect(probeFor("Voiceless")?.context).toBe("racial_trait");
    expect(probeFor("Aquatic")?.context).toBe("racial_trait");
    expect(probeFor("Amorphous")?.context).toBe("racial_trait");
    // Entries under the class-name dividers ("#### SHAMAN ####") carry feature context.
    expect(probeFor("Spirit Magic (spontaneous)")?.context).toBe("feature");
    expect(probeFor("Nature Bond")?.context).toBe("feature");
    // Plain feats under the FEATS divider carry no steering context.
    expect(probeFor("Toughness")?.context).toBeUndefined();
  });

  it("emits line-item sub-probes for multi-entry lines with spell levels", async () => {
    const c = await vehti();
    const report = collectProbes(c);
    const spellParts = report.probes.filter((p) => p.partOf && p.kind === "spell");
    const names = spellParts.map((p) => p.sourceText);
    expect(names).toEqual(
      expect.arrayContaining(["Create Water", "Detect Magic", "Guidance", "Stabilize", "Barkskin", "Flaming Sphere"]),
    );
    expect(spellParts.find((p) => p.sourceText === "Create Water")?.level).toBe(0);
    expect(spellParts.find((p) => p.sourceText === "Barkskin")?.level).toBe(2);
    // "Spirit Magic (spontaneous): Identify (1st), Tongues (2nd)" — per-item levels.
    expect(spellParts.find((p) => p.sourceText === "Identify (1st)")?.level).toBe(1);
    expect(spellParts.find((p) => p.sourceText === "Tongues (2nd)")?.level).toBe(2);
    // Semicolon feature lists split too.
    const featParts = report.probes.filter((p) => p.partOf && p.kind === "feat").map((p) => p.sourceText);
    expect(featParts).toEqual(
      expect.arrayContaining(["Nature Sense (+2 Kn Nature & Survival)", "Wild Empathy (1d20+1)", "Druidic"]),
    );
    // Arrow lines are single entries, and description halves never become items.
    expect(featParts.some((t) => /->|→/.test(t))).toBe(false);
    // "===" section rows are dividers, not entries.
    expect(report.probes.some((p) => p.sourceText.includes("=== DRUID"))).toBe(false);
  });

  it("mines the drawbacks out of the flaws text area with drawback context", async () => {
    const c = await vehti();
    const mined = mineNotesEntries(c.notes.player ?? "");
    const umbral = mined.entries.find((m) => m.text.includes("Umbral Unmasking"));
    expect(umbral?.text).toBe("Umbral Unmasking");
    expect(umbral?.context).toBe("drawback");
    const sentimental = mined.entries.find((m) => m.text.startsWith("Sentimental"));
    expect(sentimental?.context).toBe("drawback");
    // The real traits mine with trait context.
    expect(mined.entries.find((m) => m.text.startsWith("Reactionary"))?.context).toBe("trait");
  });

  it("gestalt class line parses with tracks + the Reincarnated archetype", async () => {
    const c = await vehti();
    const report = collectProbes(c);
    const classes = report.probes.filter((p) => p.kind === "class");
    expect(classes).toHaveLength(2);
    expect(classes[0]).toMatchObject({ track: "a", level: 3 });
    expect(classes[1]).toMatchObject({ track: "b", level: 3 });
    expect(report.probes.some((p) => p.kind === "archetype" && p.sourceText === "Reincarnated")).toBe(true);
  });

  it("never fires the psionics detector (Shaman||Druid; 'Spirit Magic' and hex text aren't PP markers)", async () => {
    const c = await vehti();
    const report = collectProbes(c);
    expect(report.questions.some((q) => q.kind === "psionics")).toBe(false);
    expect(report.probes.some((p) => p.context === "psionic_power")).toBe(false);
  });

  it("never fires the Path of War detector ('+2 initiative' traits aren't initiator markers)", async () => {
    const c = await vehti();
    const report = collectProbes(c);
    expect(report.questions.some((q) => q.kind === "path_of_war")).toBe(false);
    expect(report.probes.some((p) => p.context === "pow_maneuver")).toBe(false);
  });

  it("never fires the Akashic detector (Shaman||Druid carries no veil/essence markers)", async () => {
    const c = await vehti();
    const report = collectProbes(c);
    expect(report.questions.some((q) => q.kind === "akashic")).toBe(false);
    expect(report.probes.some((p) => p.context === "akashic_veil")).toBe(false);
  });
});

describe("assembleClaims — Vehti feats link once the keys are right", () => {
  it("an exact feat hit on the dash-description slot auto-links high", async () => {
    const c = await vehti();
    const report = collectProbes(c);
    const toughness = report.probes.find((p) => p.sourceText.includes("Toughness"))!;
    const voiceless = report.probes.find((p) => p.sourceText.startsWith("Voiceless"))!;
    const hits: ProbeCandidates = {
      [toughness.id]: [{ table: "feat_compendium", slug: "toughness", name: "Toughness", match: "exact" }],
    };
    const { claims } = assembleClaims(report, hits);
    const tc = claims.find((cl) => cl.id === toughness.id)!;
    expect(tc.confidence).toBe("high");
    expect(tc.resolution).toMatchObject({ mode: "linked", slug: "toughness" });
    // Context rides onto the claim for the commit-time re-file.
    const vc = claims.find((cl) => cl.id === voiceless.id)!;
    expect(vc.context).toBe("racial_trait");
    expect(vc.resolution.mode).toBe("generic");
  });
});

describe("probe hygiene", () => {
  it("keeps sub-probe fan-out bounded", async () => {
    const c = await vehti();
    const report = collectProbes(c);
    expect(report.probes.length).toBeLessThan(120);
    const parts = report.probes.filter((p) => p.partOf);
    expect(parts.every((p) => p.mined)).toBe(true);
  });
});

describe("part sub-probes are additive-safe", () => {
  it("junk parts default skipped (mined semantics)", async () => {
    const c = await vehti();
    const report = collectProbes(c);
    const druidic = report.probes.find((p) => p.partOf && p.sourceText === "Druidic") as ClaimProbe;
    expect(druidic).toBeTruthy();
    const { claims } = assembleClaims(report, {});
    expect(claims.find((cl) => cl.id === druidic.id)?.resolution.mode).toBe("skipped");
  });
});
