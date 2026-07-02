import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { runImportPipeline } from "@pathforge/importers";
import type { PathForgeCharacterV1 } from "@pathforge/schema";
import {
  parseClassLine,
  entryKeys,
  classifyHeader,
  mineNotesEntries,
  collectProbes,
  assembleClaims,
  probeTables,
  type ProbeCandidates,
} from "@/lib/character/import-claims";

const FIXTURE = resolve(__dirname, "../../docs/ASOS_Redux_1_Anise.json");

async function aniseCharacter(): Promise<PathForgeCharacterV1> {
  const text = readFileSync(FIXTURE, "utf8");
  const result = await runImportPipeline({ text });
  expect(result).toBeTruthy();
  return result!.draft.character as PathForgeCharacterV1;
}

describe("parseClassLine", () => {
  it("parses the owner's real gestalt unchained line with archetypes", () => {
    const p = parseClassLine("UCRogue (Time Thief/Talent Thief) || UCMonk (Drifting Lotus)");
    expect(p.gestalt).toBe(true);
    expect(p.segments).toHaveLength(2);
    expect(p.segments[0]).toMatchObject({
      baseName: "Rogue",
      unchainedHint: true,
      unchainedCapable: true,
      archetypes: ["Time Thief", "Talent Thief"],
    });
    expect(p.segments[1]).toMatchObject({ baseName: "Monk", unchainedHint: true, archetypes: ["Drifting Lotus"] });
  });

  it("parses multiclass with per-segment levels", () => {
    const p = parseClassLine("Skald 7 / Dragon Disciple 3");
    expect(p.gestalt).toBe(false);
    expect(p.segments).toHaveLength(2);
    expect(p.segments[0]).toMatchObject({ baseName: "Skald", level: 7, unchainedCapable: false });
    expect(p.segments[1]).toMatchObject({ baseName: "Dragon Disciple", level: 3 });
  });

  it("understands the other unchained spellings", () => {
    expect(parseClassLine("Unchained Barbarian 5").segments[0]).toMatchObject({
      baseName: "Barbarian",
      unchainedHint: true,
      level: 5,
    });
    expect(parseClassLine("Summoner (Unchained) 4").segments[0]).toMatchObject({
      baseName: "Summoner",
      unchainedHint: true,
      archetypes: [],
      level: 4,
    });
    // A bare capable class is still flagged capable, without the hint.
    expect(parseClassLine("Rogue 3").segments[0]).toMatchObject({
      baseName: "Rogue",
      unchainedHint: false,
      unchainedCapable: true,
    });
  });

  it("does not split archetype lists as multiclass", () => {
    const p = parseClassLine("Rogue (Acrobat/Burglar) 6");
    expect(p.segments).toHaveLength(1);
    expect(p.segments[0]!.archetypes).toEqual(["Acrobat", "Burglar"]);
  });

  it("re-splits a multiclassed gestalt track and tags every segment's track", () => {
    const p = parseClassLine("Fighter 5/Wizard 5 || Rogue 10");
    expect(p.gestalt).toBe(true);
    expect(p.segments).toHaveLength(3);
    expect(p.segments[0]).toMatchObject({ baseName: "Fighter", level: 5, track: "a" });
    expect(p.segments[1]).toMatchObject({ baseName: "Wizard", level: 5, track: "a" });
    expect(p.segments[2]).toMatchObject({ baseName: "Rogue", level: 10, track: "b" });
    // The simple gestalt line still tags tracks.
    const simple = parseClassLine("UCRogue || UCMonk");
    expect(simple.segments.map((s) => s.track)).toEqual(["a", "b"]);
  });
});

describe("classifyHeader — sheet organization as matching signal", () => {
  it("classifies the fixtures' real headers", () => {
    expect(classifyHeader("##### Rogue Class Features #####")).toBe("feature");
    expect(classifyHeader("#### Feats ####")).toBe("feat");
    expect(classifyHeader("################# WARP SPHERE [Monk] #################")).toBe("sphere_talent");
    expect(classifyHeader("CASTING TALENTS")).toBe("sphere_talent");
    expect(classifyHeader("################# MYTHIC #################")).toBe("mythic_ability");
    expect(classifyHeader("RACE TRAITS:")).toBe("racial_trait");
    expect(classifyHeader("CHARACTER TRAITS:")).toBe("trait");
    expect(classifyHeader("Mythic Drawbacks")).toBe("drawback");
    expect(classifyHeader("MONK KI POWERS")).toBe("feature");
    expect(classifyHeader("Spells Known")).toBe("spell");
    expect(classifyHeader("####################")).toBeNull();
  });

  it("context re-orders a probe's tables", () => {
    expect(probeTables({ kind: "spell", context: "sphere_talent" })[0]).toBe("sphere_talents");
    expect(probeTables({ kind: "trait", context: "mythic_ability" })[0]).toBe("mythic_path_ability_compendium");
    expect(probeTables({ kind: "feat" })[0]).toBe("feat_compendium");
  });
});

describe("entryKeys — slot bookkeeping stripping", () => {
  it("strips the fixtures' real prefixes and qualifiers (source casing kept)", () => {
    expect(entryKeys("Rogue 9. Improved Critical (Close)")).toContain("Improved Critical");
    expect(entryKeys("9th:  Extra Rogue Talent (In Description)")).toContain("Extra Rogue Talent");
    expect(entryKeys("Oath 10: Implausible Deniability")[0]).toBe("Implausible Deniability");
    expect(entryKeys("1[Monk]. Pouncing Teleport")[0]).toBe("Pouncing Teleport");
    expect(entryKeys("2[Monk]. Mass Teleport [mass]")).toContain("Mass Teleport");
    expect(entryKeys("• Fate's Favored")[0]).toBe("Fate's Favored");
  });

  it("returns nothing for dividers/empties", () => {
    expect(entryKeys("   ")).toEqual([]);
  });
});

describe("mineNotesEntries", () => {
  const dump = `# Imported from Myth-Weavers

## Traits field
CHARACTER TRAITS:
Background: Child of Time [Planar Infusion (Conduit) [Time], Knowledge (Planes)]
• FCB(Multitalented): +3 0/6 of a new rogue talent.
• Fate's Favored
• Magical Knack (Talent Thief)

RACE TRAITS:
Entropic Hope
Once per day, after a natural roll of 1 on a d20 roll, a sidhier may reroll and use the second result. At 10th level, sidhier can use this ability twice per day.

## Notes field
################# MYTHIC #################
Mythic Tier: 10 (0 Trial)
Total Points: 9
Magic Type: Divine
Mythic Qualities
• Beyond Morality
`;

  it("mines bulleted / short entries and skips prose + dividers + captions", () => {
    const mined = mineNotesEntries(dump);
    const texts = mined.entries.map((m) => m.text);
    expect(mined.truncated).toBe(false);
    expect(texts).toContain("Fate's Favored");
    expect(texts).toContain("Magical Knack (Talent Thief)");
    expect(texts).toContain("Child of Time [Planar Infusion (Conduit) [Time], Knowledge (Planes)]");
    // The race-trait PROSE paragraph is not an entry.
    expect(texts.join(" | ")).not.toContain("Once per day");
    // Dividers and captions skipped.
    expect(texts.join(" | ")).not.toContain("#####");
    expect(texts.join(" | ")).not.toContain("CHARACTER TRAITS");
    // Section labels ride along.
    expect(mined.entries.find((m) => m.text === "Fate's Favored")?.sourceLabel).toBe("Traits field");
  });

  it("filters bookkeeping junk, never mines the dump title, and tracks header context", () => {
    const mined = mineNotesEntries(dump);
    const texts = mined.entries.map((m) => m.text);
    // Key-value stat lines and bare category headers don't consume the budget.
    expect(texts.join(" | ")).not.toContain("Mythic Tier");
    expect(texts.join(" | ")).not.toContain("Total Points");
    expect(texts.join(" | ")).not.toContain("Magic Type");
    expect(texts.join(" | ")).not.toContain("Mythic Qualities");
    // No hash-prefixed line is ever an entry (the adapter's "# Imported from …" title).
    expect(texts.every((t) => !t.startsWith("#"))).toBe(true);
    // Context: entries under the MYTHIC divider are tagged mythic; RACE TRAITS caption → racial.
    expect(mined.entries.find((m) => m.text === "Beyond Morality")?.context).toBe("mythic_ability");
    expect(mined.entries.find((m) => m.text === "Entropic Hope")?.context).toBe("racial_trait");
    // The character-traits caption context rides onto the bulleted traits.
    expect(mined.entries.find((m) => m.text === "Fate's Favored")?.context).toBe("trait");
  });

  it("reports truncation instead of silently dropping entries past the cap", () => {
    const big = ["## Feats field", ...Array.from({ length: 90 }, (_, i) => `• Totally Real Feat ${i}`)].join("\n");
    const mined = mineNotesEntries(`# Imported from Myth-Weavers\n${big}`);
    expect(mined.entries.length).toBe(80);
    expect(mined.truncated).toBe(true);
  });
});

describe("collectProbes on the real Anise fixture", () => {
  it("produces class/archetype/race/feat/spell/mined probes + the three question kinds", async () => {
    const c = await aniseCharacter();
    const report = collectProbes(c);
    const byKind = (k: string) => report.probes.filter((p) => p.kind === k);

    // Class line: 2 gestalt segments with both unchained keys first.
    const classes = byKind("class");
    expect(classes).toHaveLength(2);
    expect(classes[0]!.keys[0]).toBe("Rogue (Unchained)");
    expect(classes[0]!.keys).toContain("Rogue");
    expect(classes[0]!.level).toBe(20); // gestalt → full level each

    // Archetypes reference their class probe.
    const archs = byKind("archetype");
    expect(archs.map((a) => a.sourceText)).toEqual(
      expect.arrayContaining(["Time Thief", "Talent Thief", "Drifting Lotus"]),
    );
    expect(archs[0]!.parentClassProbeId).toBe(classes[0]!.id);

    // Race probe with the paren ability-mods stripped as a fallback key.
    const race = byKind("race");
    expect(race).toHaveLength(1);
    expect(race[0]!.keys).toContain("Sidhier");

    // Feat probes exist and dividers were skipped.
    const feats = byKind("feat");
    expect(feats.length).toBeGreaterThan(20);
    expect(feats.every((f) => !f.sourceText.includes("####"))).toBe(true);

    // Spell probes for the sphere-slot leftovers.
    expect(byKind("spell").length).toBeGreaterThan(0);

    // Mined probes from the notes dump include the real traits.
    const mined = report.probes.filter((p) => p.mined);
    expect(mined.map((m) => m.sourceText)).toEqual(expect.arrayContaining(["Fate's Favored"]));

    // Questions: gestalt + mythic + two unchained.
    const kinds = report.questions.map((q) => q.kind);
    expect(kinds).toContain("gestalt");
    expect(kinds).toContain("mythic");
    expect(kinds.filter((k) => k === "unchained")).toHaveLength(2);
    expect(report.questions.find((q) => q.kind === "unchained")?.defaultAnswer).toBe(true); // UC prefix
  });
});

describe("assembleClaims", () => {
  it("links exact primary matches, re-files cross-table exacts, and keeps search-only generic", async () => {
    const c = await aniseCharacter();
    const report = collectProbes(c);
    const featProbe = report.probes.find((p) => p.kind === "feat" && p.keys.includes("Improved Critical"))!;
    const featureProbe = report.probes.find((p) => p.kind === "feat" && /trapfinding/i.test(p.sourceText));
    const minedProbe = report.probes.find((p) => p.mined && p.sourceText === "Fate's Favored")!;
    const classProbe = report.probes.find((p) => p.kind === "class")!;

    const hits: ProbeCandidates = {
      [featProbe.id]: [
        { table: "feat_compendium", slug: "improved-critical", name: "Improved Critical", match: "exact" },
      ],
      [minedProbe.id]: [
        { table: "trait_compendium", slug: "fates-favored", name: "Fate's Favored", match: "exact" },
      ],
      [classProbe.id]: [
        { table: "class_compendium", slug: "rogue-unchained", name: "Rogue (Unchained)", match: "exact" },
        { table: "class_compendium", slug: "rogue", name: "Rogue", match: "exact" },
      ],
    };
    if (featureProbe) {
      hits[featureProbe.id] = [
        { table: "class_feature_compendium", slug: "rogue-trapfinding", name: "Trapfinding", match: "exact" },
      ];
    }

    const { claims } = assembleClaims(report, hits);
    const featClaim = claims.find((cl) => cl.id === featProbe.id)!;
    expect(featClaim.confidence).toBe("high");
    expect(featClaim.resolution).toMatchObject({ mode: "linked", table: "feat_compendium", slug: "improved-critical" });

    const minedClaim = claims.find((cl) => cl.id === minedProbe.id)!;
    expect(minedClaim.kind).toBe("trait");
    expect(minedClaim.resolution.mode).toBe("linked");

    if (featureProbe) {
      const refiled = claims.find((cl) => cl.id === featureProbe.id)!;
      expect(refiled.kind).toBe("feature"); // re-filed off the feat slot
      expect(refiled.sourceKind).toBe("feat");
    }

    // The unchained question defaults YES (UC prefix) → the unchained row is pre-picked, and the
    // claim remembers which question steers it.
    const classClaim = claims.find((cl) => cl.id === classProbe.id)!;
    expect(classClaim.resolution).toMatchObject({ mode: "linked", table: "class_compendium", slug: "rogue-unchained" });
    expect(classClaim.unchainedQuestionId).toBeTruthy();
    expect(classClaim.track).toBe("a");

    // A probe with no hits: parsed entries default generic, mined default skipped.
    const noHitParsed = claims.find((cl) => !cl.mined && cl.candidates.length === 0 && cl.sourceKind === "feat");
    expect(noHitParsed?.resolution.mode).toBe("generic");
    const noHitMined = claims.find((cl) => cl.mined && cl.candidates.length === 0);
    expect(noHitMined?.resolution.mode).toBe("skipped");
  });

  it("same-name rows in one table: the linked class's row wins; no class match → ambiguous selector", async () => {
    const c = await aniseCharacter();
    const report = collectProbes(c);
    const classProbe = report.probes.find((p) => p.kind === "class")!;
    const featProbe = report.probes.find((p) => p.kind === "feat")!;

    const evasion = (cls: string) => ({
      table: "class_feature_compendium",
      slug: `${cls.toLowerCase().replace(/[^a-z]+/g, "-")}-evasion`,
      name: "Evasion",
      group: cls,
      match: "exact" as const,
    });
    const hits: ProbeCandidates = {
      [classProbe.id]: [
        { table: "class_compendium", slug: "rogue-unchained", name: "Rogue (Unchained)", match: "exact" },
        { table: "class_compendium", slug: "rogue", name: "Rogue", match: "exact" },
      ],
      [featProbe.id]: [evasion("Ranger"), evasion("Rogue (Unchained)"), evasion("Monk")],
    };
    const { claims } = assembleClaims(report, hits);
    const featClaim = claims.find((cl) => cl.id === featProbe.id)!;
    // The linked class (Rogue Unchained) owns one of the 3 same-name rows → it auto-links.
    expect(featClaim.confidence).toBe("high");
    expect(featClaim.resolution).toMatchObject({ mode: "linked", slug: evasion("Rogue (Unchained)").slug });

    // Without a matching class link, the same tie is AMBIGUOUS: no auto-link, all candidates kept.
    const hitsNoClass: ProbeCandidates = { [featProbe.id]: [evasion("Ranger"), evasion("Monk")] };
    const { claims: claims2 } = assembleClaims(report, hitsNoClass);
    const ambiguousClaim = claims2.find((cl) => cl.id === featProbe.id)!;
    expect(ambiguousClaim.resolution.mode).toBe("generic");
    expect(ambiguousClaim.confidence).toBe("medium");
    expect(ambiguousClaim.ambiguous).toBe(true);
    expect(ambiguousClaim.candidates).toHaveLength(2);
  });

  it("mined cross-table ties are ambiguous, but header context breaks them", async () => {
    const c = await aniseCharacter();
    const report = collectProbes(c);
    const mined = report.probes.filter((p) => p.mined);
    const plain = mined.find((p) => !p.context)!;
    const mythicMined = mined.find((p) => p.context === "mythic_ability");

    const tie = (probeId: string): ProbeCandidates[string] => [
      { table: "trait_compendium", slug: "x-trait", name: report.probes.find((p) => p.id === probeId)!.keys[0]!, match: "exact" },
      { table: "feat_compendium", slug: "x-feat", name: report.probes.find((p) => p.id === probeId)!.keys[0]!, match: "exact" },
    ];
    const { claims } = assembleClaims(report, { [plain.id]: tie(plain.id) });
    const plainClaim = claims.find((cl) => cl.id === plain.id)!;
    expect(plainClaim.ambiguous).toBe(true);
    expect(plainClaim.resolution.mode).toBe("skipped"); // mined stays safe until the player picks

    if (mythicMined) {
      const hits: ProbeCandidates = {
        [mythicMined.id]: [
          { table: "mythic_path_ability_compendium", slug: "m-1", name: mythicMined.keys[0]!, match: "exact" },
          { table: "feat_compendium", slug: "f-1", name: mythicMined.keys[0]!, match: "exact" },
        ],
      };
      const { claims: claims2 } = assembleClaims(report, hits);
      const steered = claims2.find((cl) => cl.id === mythicMined.id)!;
      // The MYTHIC header context picks the mythic table over the feat tie.
      expect(steered.resolution).toMatchObject({ mode: "linked", table: "mythic_path_ability_compendium" });
      expect(steered.kind).toBe("mythic_ability");
    }
  });
});
