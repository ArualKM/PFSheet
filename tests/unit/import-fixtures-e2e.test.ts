import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { runImportPipeline } from "@pathforge/importers";
import type { PathForgeCharacterV1 } from "@pathforge/schema";
import {
  collectProbes,
  classifyHeader,
  powDisciplineContext,
  type ClaimKind,
  type ImportQuestion,
} from "@/lib/character/import-claims";

/**
 * 3pp Phase 8 — the CONSOLIDATED import-detector coexistence sweep
 * (docs/3PP_MASTER_PLAN.md §"Phase 8"). Phases 3–7 each shipped its own detector
 * (psionic_power / sphere_talent / pow_maneuver / akashic_veil / oath / +threepp drawback) with
 * its own per-fixture regression tests. This file is the ONE place that locks the WHOLE
 * cross-system picture so a future detector tweak that steals another system's vocabulary — or
 * fires a module question on a fixture that doesn't use that system — fails loudly here.
 *
 * Two locks:
 *   1. The full classifyHeader PRECEDENCE MATRIX over every ambiguous cross-system header, in one
 *      table (each row asserts the winning kind, or null / a PoW-discipline fallback).
 *   2. A single END-TO-END assertion per real fixture (Vehti + Anise) that runs collectProbes and
 *      pins the complete module-question picture + which systems steer probe context — grounded in
 *      each fixture's ACTUAL content (verified against the raw JSON), not a hopeful guess.
 */

/* --------------------------------------------------------------------------- */
/* 1. classifyHeader precedence matrix — every ambiguous cross-system header    */
/* --------------------------------------------------------------------------- */

describe("classifyHeader — the full 3pp precedence matrix (coexistence lock)", () => {
  // header → the kind it MUST resolve to. `null` = deliberately unclassified (steers nothing).
  // These are the exact headers the Phase 8 audit enumerated as the cross-system ambiguities; the
  // single matrix keeps every rule's carve-out honest against the others.
  const MATRIX: Array<[string, ClaimKind | null]> = [
    ["PSIONIC POWERS", "psionic_power"],
    ["MARTIAL DISCIPLINES", "pow_maneuver"],
    ["MARTIAL TALENTS", "sphere_talent"], // Spheres of Might vocabulary (a real Anise divider)
    ["MARTIAL TRADITION", "sphere_talent"], // every SoM practitioner has one
    ["CASTING TALENTS", "sphere_talent"],
    ["VEILED MOON", null], // a PoW discipline NAME — classifyHeader clears, powDisciplineContext catches (below)
    ["MYTHIC VEILS", "mythic_ability"], // mythic outranks akashic
    ["OATH DRAWBACKS", "drawback"], // drawback outranks oath
    ["AKASHIC FEATS", "feat"], // *FEATS carve-out outranks the veil rule
    ["OATH SPELLS", "spell"], // paladin/antipaladin spell list, NOT a 3pp oath section
    ["SACRED OATH", "feature"], // paladin class-feature header, NOT a 3pp oath section
    ["ESSENCE", null], // bare "essence" is kineticist/psionic 1pp vocabulary
    ["CHAKRA", null], // bare "chakra" risks yoga notes — only "chakra bind(s)" steers
    ["STANCES", "pow_maneuver"],
    ["Combat Maneuvers", null], // the CMB/CMD stat-block caption on ordinary 1pp sheets
    ["OATH BOONS", "oath"],
    ["OATH POINTS", "oath"],
    ["SPHERES OF POWER", "sphere_talent"], // the SoP section header steers into sphere talents
    ["VEILWEAVING", "akashic_veil"],
  ];

  it("routes every ambiguous cross-system header to the RIGHT kind (or null)", () => {
    for (const [header, expected] of MATRIX) {
      expect({ header, kind: classifyHeader(header) }).toEqual({ header, kind: expected });
    }
  });

  it("the two null headers that are really PoW-discipline groupings fall through to powDisciplineContext", () => {
    // "VEILED MOON" is keyword-less to classifyHeader (so a veil line under it never flips to
    // akashic) — the discipline-name mechanism keeps it steering maneuvers instead.
    expect(classifyHeader("VEILED MOON")).toBeNull();
    expect(powDisciplineContext("VEILED MOON")).toBe("pow_maneuver");
    expect(powDisciplineContext("##### VEILED MOON #####")).toBe("pow_maneuver");
    // …while a genuinely-unclassified caption ("ESSENCE", "Combat Maneuvers") is a discipline for
    // neither path — it steers nothing at all.
    expect(powDisciplineContext("ESSENCE")).toBeNull();
    expect(powDisciplineContext("Combat Maneuvers")).toBeNull();
  });

  it("each 3pp *FEATS section wins BEFORE its system's main rule (no vocabulary theft)", () => {
    // The carve-out order is the whole point of coexistence: a mined FEAT under a system's feats
    // header must reach feat_compendium, not be stolen by that system's power/maneuver/veil table
    // (prod has real feat/power, feat/maneuver, feat/veil name collisions).
    expect(classifyHeader("PSIONIC FEATS")).toBe("feat");
    expect(classifyHeader("MARTIAL FEATS")).toBe("feat");
    expect(classifyHeader("PATH OF WAR FEATS")).toBe("feat");
    expect(classifyHeader("AKASHIC FEATS")).toBe("feat");
    expect(classifyHeader("OATH FEATS")).toBe("feat");
    // …and each system's own section header still steers into its own table.
    expect(classifyHeader("PSIONIC POWERS")).toBe("psionic_power");
    expect(classifyHeader("MANEUVERS KNOWN")).toBe("pow_maneuver");
    expect(classifyHeader("VEILS SHAPED")).toBe("akashic_veil");
    expect(classifyHeader("OATHS")).toBe("oath");
  });
});

/* --------------------------------------------------------------------------- */
/* 2. End-to-end fixture assertions — the whole multi-system picture per sheet  */
/* --------------------------------------------------------------------------- */

async function loadFixture(file: string): Promise<PathForgeCharacterV1> {
  const text = readFileSync(resolve(__dirname, "../../docs", file), "utf8");
  const result = await runImportPipeline({ text });
  expect(result).toBeTruthy();
  return result!.draft.character as PathForgeCharacterV1;
}

/** The complete detector fingerprint of a fixture: which module questions fire + which 3pp
 * systems steer any probe context. One object per fixture → one assertion that can't drift. */
function detectorFingerprint(report: ReturnType<typeof collectProbes>) {
  const questionKinds = new Set(report.questions.map((q: ImportQuestion) => q.kind));
  const has = (k: ImportQuestion["kind"]) => questionKinds.has(k);
  const anyContext = (k: ClaimKind) => report.probes.some((p) => p.context === k);
  return {
    questions: {
      gestalt: has("gestalt"),
      mythic: has("mythic"),
      psionics: has("psionics"),
      path_of_war: has("path_of_war"),
      akashic: has("akashic"),
      oaths: has("oaths"),
    },
    context: {
      psionic_power: anyContext("psionic_power"),
      pow_maneuver: anyContext("pow_maneuver"),
      akashic_veil: anyContext("akashic_veil"),
      oath: anyContext("oath"),
      drawback: anyContext("drawback"),
      sphere_talent: anyContext("sphere_talent"),
    },
  };
}

describe("Vehti fixture — the WHOLE detector picture in one assertion", () => {
  it("fires ONLY gestalt + oaths (+ drawback context); every other 3pp detector stays silent", async () => {
    // Ground truth (verified against docs/Vehti.json): a gestalt Shaman || Druid (Reincarnated)
    // Being of Ib whose notes carry OATHS + OATH BOONS + DRAWBACKS & FLAABS sections. It has NO
    // psionic / maneuver / veil / essence / chakra markers and NO Mythic variant. "Spirit Magic"
    // is a Shaman class feature (spontaneous divine), NOT a psionics marker.
    const c = await loadFixture("Vehti.json");
    const report = collectProbes(c);
    expect(detectorFingerprint(report)).toEqual({
      questions: {
        gestalt: true,
        mythic: false,
        psionics: false,
        path_of_war: false,
        akashic: false,
        oaths: true,
      },
      context: {
        psionic_power: false,
        pow_maneuver: false,
        akashic_veil: false,
        oath: true, // OATHS / OATH BOONS sections steer their entries
        drawback: true, // DRAWBACKS & FLAWS sections steer Umbral Unmasking / Noncombatant / …
        sphere_talent: false, // Vehti is not a Spheres character
      },
    });
  });

  it("its oath + drawback probes actually reach the right 3pp tables (not just the questions)", async () => {
    const c = await loadFixture("Vehti.json");
    const report = collectProbes(c);
    const oathProbe = report.probes.find((p) => p.sourceText.startsWith("Forbidden Knowledge"));
    expect(oathProbe?.context).toBe("oath");
    const drawbackProbe = report.probes.find((p) => p.sourceText === "Umbral Unmasking");
    expect(drawbackProbe?.context).toBe("drawback");
    // Two independent 3pp systems coexist on ONE sheet — the fingerprint above already locks that
    // neither steals the other's vocabulary, this proves both still resolve their own entries.
  });
});

describe("Anise fixture — the WHOLE detector picture in one assertion", () => {
  it("fires gestalt + mythic + oaths (+ oath/sphere context); psionics/PoW/akashic stay silent", async () => {
    // Ground truth (verified against docs/ASOS_Redux_1_Anise.json): a gestalt UCRogue || UCMonk
    // that IS Mythic and DOES use the 3pp oath system (its __txt fields carry the same OATHS /
    // OATH BOONS / Oath Points sections Vehti has). It is a Spheres character (MARTIAL TRADITION /
    // MARTIAL TALENTS / CASTING TALENTS dividers → sphere_talent context), and the single
    // "Maneuver" mention + those "MARTIAL *" dividers are Spheres-of-Might vocabulary, NOT Path of
    // War — so the PoW detector MUST stay quiet (the hard Spheres-fixture requirement).
    const c = await loadFixture("ASOS_Redux_1_Anise.json");
    const report = collectProbes(c);
    expect(detectorFingerprint(report)).toEqual({
      questions: {
        gestalt: true,
        mythic: true,
        psionics: false,
        path_of_war: false,
        akashic: false,
        oaths: true,
      },
      context: {
        psionic_power: false,
        pow_maneuver: false,
        akashic_veil: false,
        oath: true, // OATHS / OATH BOONS sections (Forbidden Knowledge, Oath of Candor, …)
        drawback: true, // a DRAWBACKS/FLAWS section mines Mythic Vulnerability / Hatred / Phobia / …
        sphere_talent: true, // MARTIAL TRADITION / MARTIAL TALENTS / CASTING TALENTS dividers
      },
    });
  });

  it("its Spheres dividers steer sphere_talent — the SoM vocabulary never trips Path of War", async () => {
    const c = await loadFixture("ASOS_Redux_1_Anise.json");
    const report = collectProbes(c);
    // At least one probe sits under a Spheres divider…
    expect(report.probes.some((p) => p.context === "sphere_talent")).toBe(true);
    // …and NOT ONE probe was steered into maneuvers (the coexistence guarantee for this fixture).
    expect(report.probes.some((p) => p.context === "pow_maneuver")).toBe(false);
    expect(report.questions.some((q) => q.kind === "path_of_war")).toBe(false);
  });
});
