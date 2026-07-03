import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { runImportPipeline } from "@pathforge/importers";
import { createDefaultCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";
import {
  parseClassLine,
  entryKeys,
  classifyHeader,
  mineNotesEntries,
  collectProbes,
  assembleClaims,
  probeTables,
  powDisciplineContext,
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

  it("psionic headers win over the generic powers→feature rule and the sphere talents rule", () => {
    expect(classifyHeader("PSIONIC POWERS")).toBe("psionic_power");
    expect(classifyHeader("##### Powers Known - Manifester Level 7 #####")).toBe("psionic_power");
    expect(classifyHeader("POWER POINTS")).toBe("psionic_power");
    expect(classifyHeader("MANIFESTING TALENTS")).toBe("psionic_power"); // manifest outranks sphere talents
    expect(classifyHeader("PSION CLASS FEATURES")).toBe("psionic_power");
    // Non-psionic powers stay feature; the higher rules still outrank psionic.
    expect(classifyHeader("MONK KI POWERS")).toBe("feature");
    expect(classifyHeader("MYTHIC PSIONICS")).toBe("mythic_ability");
    expect(classifyHeader("PSIONIC DRAWBACKS")).toBe("drawback");
  });

  it("'PSIONIC FEATS' sections classify as feat, not psionic_power (feat/power name collisions)", () => {
    // Standard Ultimate Psionics statblock vocabulary — entries beneath are FEATS (7 prod
    // feat/power exact-name collisions like Sidestep would otherwise auto-link to the power).
    expect(classifyHeader("PSIONIC FEATS")).toBe("feat");
    expect(classifyHeader("Psionic Feats:")).toBe("feat");
    expect(classifyHeader("##### Psionic Bonus Feats #####")).toBe("feat");
    // …while the power-section headers keep steering into the powers table.
    expect(classifyHeader("PSIONIC POWERS")).toBe("psionic_power");
    expect(classifyHeader("POWER POINTS")).toBe("psionic_power");
    expect(classifyHeader("Manifester Level 7")).toBe("psionic_power");
  });

  it("Path of War headers steer to pow_maneuver — below the drawback/mythic/psionic/sphere rules", () => {
    expect(classifyHeader("MANEUVERS KNOWN")).toBe("pow_maneuver");
    expect(classifyHeader("Maneuvers Readied:")).toBe("pow_maneuver");
    expect(classifyHeader("STANCES")).toBe("pow_maneuver");
    expect(classifyHeader("MARTIAL DISCIPLINES")).toBe("pow_maneuver");
    expect(classifyHeader("INITIATOR LEVEL")).toBe("pow_maneuver");
    expect(classifyHeader("PATH OF WAR")).toBe("pow_maneuver");
    // The higher rules still outrank pow (matching the psionic precedence chain).
    expect(classifyHeader("MARTIAL DRAWBACKS")).toBe("drawback");
    expect(classifyHeader("MYTHIC MANEUVERS")).toBe("mythic_ability");
    expect(classifyHeader("PSIONIC MANEUVERS")).toBe("psionic_power"); // psionic X stays psionic
    expect(classifyHeader("PSIONIC POWERS")).toBe("psionic_power"); // unchanged
    expect(classifyHeader("MONK KI POWERS")).toBe("feature"); // unchanged
    expect(classifyHeader("CASTING TALENTS")).toBe("sphere_talent"); // unchanged
    // "MARTIAL TALENTS" is Spheres of Might vocabulary (a real Anise divider) — sphere wins.
    expect(classifyHeader("################# MARTIAL TALENTS #################")).toBe("sphere_talent");
    // "INITIATIVE" is a stat header, never a maneuver section.
    expect(classifyHeader("INITIATIVE")).toBeNull();
  });

  it("'MARTIAL FEATS' / 'PATH OF WAR FEATS' sections classify as feat (carve-out, like psionic feats)", () => {
    expect(classifyHeader("MARTIAL FEATS")).toBe("feat");
    expect(classifyHeader("Path of War Feats:")).toBe("feat");
    expect(classifyHeader("##### Martial Bonus Feats #####")).toBe("feat");
    // …while the maneuver-section headers keep steering into the maneuvers table.
    expect(classifyHeader("MANEUVERS KNOWN")).toBe("pow_maneuver");
  });

  it("bare 'discipline'/'martial'/1pp vocabulary never classifies as pow — SoM + psionic + CMB carve-outs", () => {
    // "MARTIAL TRADITION" is core Spheres of Might vocabulary (every SoM practitioner has one;
    // it's literally in the Anise grounding fixture) — its talents steer into sphere_talents.
    expect(classifyHeader("################# MARTIAL TRADITION #################")).toBe("sphere_talent");
    expect(classifyHeader("Martial Traditions")).toBe("sphere_talent");
    // The CMB/CMD stat-block caption on ordinary 1pp sheets is deliberately unclassified.
    expect(classifyHeader("COMBAT MANEUVERS")).toBeNull();
    expect(classifyHeader("COMBAT MANEUVER BONUSES")).toBeNull();
    // A bare "Discipline" label (standard Ultimate Psionics power bookkeeping — "Discipline:
    // Telepathy") must NOT classify: prod has real psionic/maneuver name collisions (Expose
    // Weakness, Blinding Shot), and flipping a running psionic context would mislink them.
    expect(classifyHeader("Discipline")).toBeNull();
    expect(classifyHeader("SELF-DISCIPLINE")).toBeNull();
    // Bare "martial" 1pp vocabulary stays silent too.
    expect(classifyHeader("MARTIAL ARTS")).toBeNull();
    expect(classifyHeader("MARTIAL FLEXIBILITY")).toBeNull();
    // …while the real PoW phrases keep classifying.
    expect(classifyHeader("MARTIAL DISCIPLINES")).toBe("pow_maneuver");
    expect(classifyHeader("Martial Discipline: Broken Blade")).toBe("pow_maneuver");
  });

  it("Akashic headers steer to akashic_veil — below the drawback/mythic/psionic/sphere/pow rules", () => {
    expect(classifyHeader("VEILS")).toBe("akashic_veil");
    expect(classifyHeader("Veils Shaped:")).toBe("akashic_veil");
    expect(classifyHeader("##### VEILS KNOWN #####")).toBe("akashic_veil");
    expect(classifyHeader("CHAKRA BINDS")).toBe("akashic_veil");
    expect(classifyHeader("ESSENCE RECEPTACLES")).toBe("akashic_veil");
    expect(classifyHeader("VEILWEAVING")).toBe("akashic_veil");
    expect(classifyHeader("AKASHIC")).toBe("akashic_veil");
    // The higher rules still outrank akashic (matching the psionic/pow precedence chain).
    expect(classifyHeader("AKASHIC DRAWBACKS")).toBe("drawback");
    expect(classifyHeader("MYTHIC VEILS")).toBe("mythic_ability");
    expect(classifyHeader("PSIONIC VEILS")).toBe("psionic_power");
    expect(classifyHeader("MANEUVERS KNOWN")).toBe("pow_maneuver"); // unchanged
    expect(classifyHeader("CASTING TALENTS")).toBe("sphere_talent"); // unchanged
  });

  it("'AKASHIC FEATS' sections classify as feat (carve-out, like psionic/martial feats)", () => {
    expect(classifyHeader("AKASHIC FEATS")).toBe("feat");
    expect(classifyHeader("Akashic Feats:")).toBe("feat");
    expect(classifyHeader("##### Akashic Bonus Feats #####")).toBe("feat");
    // …while the veil-section headers keep steering into the veils table.
    expect(classifyHeader("VEILS SHAPED")).toBe("akashic_veil");
  });

  it("bare 'essence'/'chakra' never steers akashic; 'VEILED MOON' stays a PoW discipline", () => {
    // Bare "essence" is kineticist ("elemental essence") / psionic-crystal 1pp vocabulary.
    expect(classifyHeader("ESSENCE")).toBeNull();
    expect(classifyHeader("ELEMENTAL ESSENCE")).toBeNull();
    // Bare "chakra" risks real-world yoga notes — only "chakra bind(s)" steers.
    expect(classifyHeader("CHAKRA")).toBeNull();
    expect(classifyHeader("CHAKRA MEDITATION")).toBeNull();
    // \bveils?\b (word boundary) does not match "VEILED" — the PoW discipline-name divider
    // mechanism keeps winning for "Veiled Moon" groupings.
    expect(classifyHeader("VEILED MOON")).toBeNull();
    expect(classifyHeader("##### VEILED MOON #####")).toBeNull();
    expect(powDisciplineContext("##### VEILED MOON #####")).toBe("pow_maneuver");
    // …while the real akashic phrases keep classifying.
    expect(classifyHeader("CHAKRA BINDS")).toBe("akashic_veil");
    expect(classifyHeader("ESSENCE RECEPTACLES")).toBe("akashic_veil");
  });

  it("Oath headers steer to oath — below the drawback/mythic/psionic/sphere/pow/akashic rules", () => {
    expect(classifyHeader("OATHS")).toBe("oath");
    expect(classifyHeader("################# OATHS #################")).toBe("oath");
    expect(classifyHeader("OATH BOONS")).toBe("oath");
    expect(classifyHeader("Oath Boons:")).toBe("oath");
    expect(classifyHeader("Oath Points:")).toBe("oath");
    expect(classifyHeader("OATHS (9 points)")).toBe("oath"); // parenthetical asides stripped
    // The higher rules still outrank oath (matching the psionic/pow/akashic precedence chain).
    expect(classifyHeader("MYTHIC OATHS")).toBe("mythic_ability");
    expect(classifyHeader("OATH DRAWBACKS")).toBe("drawback");
  });

  it("'OATH FEATS' classifies as feat (carve-out); OATHBOW / Oathbound / numbered labels stay silent", () => {
    // The Bonus Feats oath boon grants REAL feats — an "OATH FEATS" section lists feats.
    expect(classifyHeader("OATH FEATS")).toBe("feat");
    expect(classifyHeader("Oath Bonus Feats:")).toBe("feat");
    // \boaths?\b never matches mid-word: the OATHBOW magic weapon, the Oathbound Paladin.
    expect(classifyHeader("OATHBOW")).toBeNull();
    expect(classifyHeader("Oathbound Paladin")).toBeNull();
    // A NUMBERED oath label is slot bookkeeping for feats granted VIA an oath ("Oath 2) Extra
    // Hex", "Oath 10: Implausible Deniability") — it must never flip a section to oath context.
    expect(classifyHeader("Oath 2")).toBeNull();
    expect(classifyHeader("Oath 10")).toBeNull();
    // …while the real section vocabulary keeps classifying.
    expect(classifyHeader("OATHS")).toBe("oath");
  });

  it("CORE paladin/antipaladin oath vocabulary is carved out ABOVE the oath rule", () => {
    // "Oath Spells" is the paladin/antipaladin spell list — steer it to spell, not oath.
    expect(classifyHeader("Oath Spells")).toBe("spell");
    expect(classifyHeader("Antipaladin Oath Spells")).toBe("spell");
    expect(classifyHeader("##### Oath Spells #####")).toBe("spell");
    // "Sacred Oath" / "Oath of <x>" are paladin class-feature headers, NOT 3pp oath sections.
    expect(classifyHeader("Sacred Oath")).toBe("feature");
    expect(classifyHeader("Oath of Vengeance")).toBe("feature");
    expect(classifyHeader("Oath of Vengeance Class Features")).toBe("feature");
    // …while the 3pp bookkeeping shapes STILL classify as oath (the Vehti/Anise fixtures rely on it).
    expect(classifyHeader("OATHS")).toBe("oath");
    expect(classifyHeader("################# OATHS #################")).toBe("oath");
    expect(classifyHeader("OATH BOONS")).toBe("oath");
    expect(classifyHeader("OATH POINTS")).toBe("oath");
  });

  it("a 'Spell Resistance' line under a 'Sacred Oath' header does NOT carry oath context", () => {
    // Prod oath_boon_compendium has rows literally named "Spell Resistance" / "Damage Reduction";
    // both are ALSO a real spell / class feature. Under a false "oath" context the line would
    // probe oath_boon_compendium first and auto-link there, mis-filing the real spell/feature.
    const mined = mineNotesEntries(
      ["## Sacred Oath", "- Spell Resistance", "- Damage Reduction"].join("\n"),
    );
    const sr = mined.entries.find((e) => e.text === "Spell Resistance");
    expect(sr).toBeTruthy();
    expect(sr!.context).not.toBe("oath"); // the header is a paladin class feature, not a 3pp oath
    // A real "OATHS" bookkeeping header still establishes oath context (fixtures rely on it).
    const oathMined = mineNotesEntries(["## OATHS", "Oath of Candor (1 Oath Point)"].join("\n"));
    expect(oathMined.entries.some((e) => e.context === "oath")).toBe(true);
  });

  it("context re-orders a probe's tables", () => {
    expect(probeTables({ kind: "spell", context: "sphere_talent" })[0]).toBe("sphere_talents");
    expect(probeTables({ kind: "trait", context: "mythic_ability" })[0]).toBe("mythic_path_ability_compendium");
    expect(probeTables({ kind: "spell", context: "psionic_power" })[0]).toBe("psionic_power_compendium");
    expect(probeTables({ kind: "feat", context: "pow_maneuver" })[0]).toBe("pow_maneuver_compendium");
    expect(probeTables({ kind: "feat", context: "akashic_veil" })[0]).toBe("akashic_veil_compendium");
    expect(probeTables({ kind: "trait", context: "oath" }).slice(0, 2)).toEqual(["oath_compendium", "oath_boon_compendium"]);
    expect(probeTables({ kind: "trait", context: "drawback" }).slice(0, 2)).toEqual([
      "drawback_compendium",
      "threepp_drawback_compendium",
    ]);
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

  it("a 'Discipline: X' label line never resets a running PSIONIC context to pow (UP bookkeeping)", () => {
    // Standard Ultimate Psionics layout: powers section, then per-power Discipline bookkeeping.
    // Prod has exactly these psionic-power/maneuver name collisions (Expose Weakness, Blinding
    // Shot) — flipping the context would auto-link them to the WRONG rules text.
    const mined = mineNotesEntries(
      "# Imported from Myth-Weavers\n\n## Notes field\nPSIONIC POWERS:\nDiscipline: Telepathy\n• Expose Weakness\n• Blinding Shot",
    );
    expect(mined.entries.map((m) => m.text)).toEqual(["Expose Weakness", "Blinding Shot"]);
    for (const e of mined.entries) expect(e.context).toBe("psionic_power");
  });

  it("PoW discipline-name dividers/captions keep (set) the pow context — the natural per-discipline grouping", () => {
    const mined = mineNotesEntries(
      "# Imported from Myth-Weavers\n\n## Notes field\n" +
        "MANEUVERS KNOWN:\n" +
        "################# BROKEN BLADE #################\n" +
        "• Steel Flurry Strike\n" +
        "VEILED MOON:\n" +
        "• Formless Dance\n" +
        "PRIMAL FURY\n" +
        "• Rending Claw Strike",
    );
    const byText = new Map(mined.entries.map((m) => [m.text, m.context]));
    expect(byText.get("Steel Flurry Strike")).toBe("pow_maneuver");
    expect(byText.get("Formless Dance")).toBe("pow_maneuver");
    expect(byText.get("Rending Claw Strike")).toBe("pow_maneuver");
    // The ALL-CAPS discipline caption is context, never a mined entry.
    expect(mined.entries.some((m) => /primal fury/i.test(m.text))).toBe(false);
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

    // Questions: gestalt + mythic + two unchained. NO psionics — Rogue/Monk + sphere/mythic
    // notes carry no manifester markers ("Time"/"Warp" spheres must not trip the detector).
    // NO path_of_war either — the sheet's "Stalker Talent" feats, "Deft Maneuvers" feat, and
    // Spheres "MARTIAL TRADITION"/"MARTIAL TALENTS" sections are NOT initiator markers (HARD
    // requirement: the Spheres grounding fixture stays silent).
    const kinds = report.questions.map((q) => q.kind);
    expect(kinds).toContain("gestalt");
    expect(kinds).toContain("mythic");
    expect(kinds.filter((k) => k === "unchained")).toHaveLength(2);
    expect(kinds).not.toContain("psionics");
    expect(kinds).not.toContain("path_of_war");
    // NO akashic either — the Spheres grounding fixture carries no veil/essence markers (HARD
    // requirement: the detector stays silent, mirroring path_of_war).
    expect(kinds).not.toContain("akashic");
    expect(report.probes.some((p) => p.context === "akashic_veil")).toBe(false);
    // The oaths detector DOES fire — Anise's own __txt_text1/__txt_text2 carry the same
    // "################# OATHS #################" / "OATH BOONS" sections Vehti has (Forbidden
    // Knowledge, Oath of Candor, Oath of Loyalty [Betoros] — the owner's campaign uses the 3pp
    // oath system on BOTH grounding fixtures). The fixture is the ground truth: a sheet with a
    // literal OATHS section should be asked about the Oaths module.
    expect(kinds).toContain("oaths");
    expect(report.probes.some((p) => p.context === "oath")).toBe(true);
    expect(report.questions.find((q) => q.kind === "unchained")?.defaultAnswer).toBe(true); // UC prefix
  });
});

describe("psionics detector — the deferred detector is live", () => {
  it("asks the psionics question for a manifester class line", () => {
    const c = createDefaultCharacter();
    c.identity.classes = [{ id: "cls1", name: "Psion 7", level: 7 }];
    const q = collectProbes(c).questions.find((x) => x.kind === "psionics");
    expect(q).toBeTruthy();
    expect(q!.defaultAnswer).toBe(true);
    // Gestalt manifester sides count too.
    const g = createDefaultCharacter();
    g.identity.classes = [{ id: "cls1", name: "Fighter 5 || Psychic Warrior 5", level: 5 }];
    expect(collectProbes(g).questions.some((x) => x.kind === "psionics")).toBe(true);
  });

  it("asks on power-point bookkeeping in the notes dump", () => {
    const c = createDefaultCharacter();
    c.notes.player = "# Imported from Myth-Weavers\n\n## Notes field\nPower Points: 37\nManifester Level: 7";
    expect(collectProbes(c).questions.some((x) => x.kind === "psionics")).toBe(true);
    const pp = createDefaultCharacter();
    pp.notes.player = "# Imported from Myth-Weavers\n\n## Notes field\n21 PP/day base";
    expect(collectProbes(pp).questions.some((x) => x.kind === "psionics")).toBe(true);
    const perDay = createDefaultCharacter();
    perDay.notes.player = "# Imported from Myth-Weavers\n\n## Notes field\n21 pp per day";
    expect(collectProbes(perDay).questions.some((x) => x.kind === "psionics")).toBe(true);
  });

  it("asks on a literal 'PSIONIC POWERS' notes section (no PP/ML bookkeeping needed)", () => {
    // An Elan Fighter with Wild Talent: a powers section without any "Power Points:" text is
    // the strongest psionics signal — the word itself is the marker.
    const c = createDefaultCharacter();
    c.identity.classes = [{ id: "cls1", name: "Fighter 5", level: 5 }];
    c.notes.player = "# Imported from Myth-Weavers\n\n## Notes field\n## PSIONIC POWERS\n• Mind Thrust";
    expect(collectProbes(c).questions.some((x) => x.kind === "psionics")).toBe(true);
    const lower = createDefaultCharacter();
    lower.notes.player = "# Imported from Myth-Weavers\n\n## Notes field\nHas a minor psionic knack.";
    expect(collectProbes(lower).questions.some((x) => x.kind === "psionics")).toBe(true);
  });

  it("stays quiet when the module is already enabled, and on non-psionic sheets", () => {
    const on = createDefaultCharacter();
    on.identity.classes = [{ id: "cls1", name: "Psychic Warrior 5", level: 5 }];
    on.rules.modules.push({ key: "psionics", enabled: true, settings: {} });
    expect(collectProbes(on).questions.some((x) => x.kind === "psionics")).toBe(false);

    const plain = createDefaultCharacter();
    plain.identity.classes = [{ id: "cls1", name: "Fighter 5", level: 5 }];
    // Platinum-piece ledgers ("32 pp") must not trip the PP marker without a "/day".
    plain.notes.player = "# Imported from Myth-Weavers\n\n## Notes field\nCoins: 32 pp, 14 gp";
    expect(collectProbes(plain).questions.some((x) => x.kind === "psionics")).toBe(false);

    // Same-line day-WORDS ("today", "payday", "Sunday") must not satisfy the /day qualifier.
    const ledger = createDefaultCharacter();
    ledger.identity.classes = [{ id: "cls1", name: "Fighter 5", level: 5 }];
    ledger.notes.player =
      "# Imported from Myth-Weavers\n\n## Notes field\nParty split: 12 pp each today\nSpent 3 pp on payday drinks Sunday";
    expect(collectProbes(ledger).questions.some((x) => x.kind === "psionics")).toBe(false);
  });

  it("asks when the module entry is present but disabled (adapter-flagged)", () => {
    const c = createDefaultCharacter();
    c.rules.modules.push({ key: "psionics", enabled: false, settings: {} });
    expect(collectProbes(c).questions.some((x) => x.kind === "psionics")).toBe(true);
  });
});

describe("Path of War detector — the psionics detector's exact mirror", () => {
  it("asks the path_of_war question for an initiator class line", () => {
    const c = createDefaultCharacter();
    c.identity.classes = [{ id: "cls1", name: "Warlord 8", level: 8 }];
    const q = collectProbes(c).questions.find((x) => x.kind === "path_of_war");
    expect(q).toBeTruthy();
    expect(q!.defaultAnswer).toBe(true);
    expect(q!.text).toContain("Path of War");
    // Gestalt initiator sides count too.
    const g = createDefaultCharacter();
    g.identity.classes = [{ id: "cls1", name: "Fighter 5 || Stalker 5", level: 5 }];
    expect(collectProbes(g).questions.some((x) => x.kind === "path_of_war")).toBe(true);
  });

  it("asks on maneuver bookkeeping in the notes dump", () => {
    const mk = (notes: string) => {
      const c = createDefaultCharacter();
      c.notes.player = `# Imported from Myth-Weavers\n\n## Notes field\n${notes}`;
      return collectProbes(c).questions.some((x) => x.kind === "path_of_war");
    };
    expect(mk("Maneuvers Known: 12")).toBe(true);
    expect(mk("Maneuvers Readied: 7")).toBe(true);
    expect(mk("Stances Known: 4")).toBe(true);
    expect(mk("Initiator Level 7")).toBe(true);
    expect(mk("Uses the Path of War rules.")).toBe(true);
    expect(mk("MARTIAL DISCIPLINES: Broken Blade, Primal Fury")).toBe(true);
  });

  it("stays quiet when the module is already enabled, and on non-initiator sheets", () => {
    const on = createDefaultCharacter();
    on.identity.classes = [{ id: "cls1", name: "Warder 5", level: 5 }];
    on.rules.modules.push({ key: "path_of_war", enabled: true, settings: {} });
    expect(collectProbes(on).questions.some((x) => x.kind === "path_of_war")).toBe(false);

    // The Spheres/1pp vocabulary the grounding fixtures actually carry must NOT fire: the feat
    // "Deft Maneuvers", "Stalker Talent" prose, a "MARTIAL TRADITION" section, "+2 initiative".
    const quiet = createDefaultCharacter();
    quiet.identity.classes = [{ id: "cls1", name: "Fighter 5", level: 5 }];
    quiet.notes.player =
      "# Imported from Myth-Weavers\n\n## Notes field\n" +
      "################# MARTIAL TRADITION #################\n" +
      "Equipment: Critical Genius (Unarmed Strike), Unarmed Training (discipline)\n" +
      "Feat 9. Stalker Talent: Critical Virtuoso\n" +
      "Rogue 1: Deft Maneuvers\n" +
      "• Reactionary (Combat): +2 initiative\n" +
      "He held his stance in the doorway.";
    expect(collectProbes(quiet).questions.some((x) => x.kind === "path_of_war")).toBe(false);

    // An archetype can't trip the class regex (base names only).
    const arch = createDefaultCharacter();
    arch.identity.classes = [{ id: "cls1", name: "Fighter (Warlord's Legacy) 5", level: 5 }];
    expect(collectProbes(arch).questions.some((x) => x.kind === "path_of_war")).toBe(false);
  });

  it("initiator names inside OTHER multi-word class names never fire — full baseName equality", () => {
    const ask = (classes: string[]) => {
      const c = createDefaultCharacter();
      c.identity.classes = classes.map((name, i) => ({ id: `cls${i}`, name, level: 0 }));
      return collectProbes(c).questions.some((x) => x.kind === "path_of_war");
    };
    // "Mystic Theurge" is a classic 1pp Wizard/Cleric prestige class — a substring test would
    // enable the PoW module on a pure-1pp sheet via the click-through default-Yes question.
    expect(ask(["Wizard 3 / Cleric 3 / Mystic Theurge 4"])).toBe(false);
    expect(ask(["Stalker Vigilante 6"])).toBe(false);
    // …while the real initiator classes still fire, alone or in a multiclass line.
    expect(ask(["Mystic 5"])).toBe(true);
    expect(ask(["Fighter 5 / Warlord 3"])).toBe(true);
  });

  it("asks when the module entry is present but disabled (adapter-flagged)", () => {
    const c = createDefaultCharacter();
    c.rules.modules.push({ key: "path_of_war", enabled: false, settings: {} });
    expect(collectProbes(c).questions.some((x) => x.kind === "path_of_war")).toBe(true);
  });
});

describe("Akashic detector — the Path of War detector's exact mirror", () => {
  it("asks the akashic question for a veilweaver class line", () => {
    const c = createDefaultCharacter();
    c.identity.classes = [{ id: "cls1", name: "Vizier 7", level: 7 }];
    const q = collectProbes(c).questions.find((x) => x.kind === "akashic");
    expect(q).toBeTruthy();
    expect(q!.defaultAnswer).toBe(true);
    expect(q!.text).toContain("Akashic");
    // Multiclass and gestalt veilweaver sides count too.
    const m = createDefaultCharacter();
    m.identity.classes = [{ id: "cls1", name: "Daevic 3 / Fighter 2", level: 5 }];
    expect(collectProbes(m).questions.some((x) => x.kind === "akashic")).toBe(true);
    const g = createDefaultCharacter();
    g.identity.classes = [{ id: "cls1", name: "Fighter 5 || Guru 5", level: 5 }];
    expect(collectProbes(g).questions.some((x) => x.kind === "akashic")).toBe(true);
  });

  it("asks on veil bookkeeping in the notes dump", () => {
    const mk = (notes: string) => {
      const c = createDefaultCharacter();
      c.notes.player = `# Imported from Myth-Weavers\n\n## Notes field\n${notes}`;
      return collectProbes(c).questions.some((x) => x.kind === "akashic");
    };
    expect(mk("Veils Shaped: 3")).toBe(true);
    expect(mk("Veils Known: 5")).toBe(true);
    expect(mk("Chakra Binds: Hands, Belt")).toBe(true);
    expect(mk("Essence Receptacles: 2")).toBe(true);
    expect(mk("Uses the Akashic Mysteries rules.")).toBe(true);
    expect(mk("Veilweaving ability: Int")).toBe(true);
    // A bare "VEILS" section header on its own line is the strongest marker.
    expect(mk("VEILS:\n• Gorgon Mask")).toBe(true);
    expect(mk("################# VEILS #################\n• Gorgon Mask")).toBe(true);
  });

  it("stays quiet when the module is already enabled, and on non-veilweaver sheets", () => {
    const on = createDefaultCharacter();
    on.identity.classes = [{ id: "cls1", name: "Guru 5", level: 5 }];
    on.rules.modules.push({ key: "akashic", enabled: true, settings: {} });
    expect(collectProbes(on).questions.some((x) => x.kind === "akashic")).toBe(false);

    // Mid-prose "veils", bare "essence"/"chakra", and a PoW "RADIANT DAWN" discipline divider
    // must NOT fire — mirrors the tight POW_NOTES_RE discipline.
    const quiet = createDefaultCharacter();
    quiet.identity.classes = [{ id: "cls1", name: "Fighter 5", level: 5 }];
    quiet.notes.player =
      "# Imported from Myth-Weavers\n\n## Notes field\n" +
      "################# RADIANT DAWN #################\n" +
      "• Ray of Light Strike\n" +
      "She wears seven veils to the masquerade.\n" +
      "Elemental essence infuses her blade.\n" +
      "Morning chakra meditation keeps her calm.";
    const report = collectProbes(quiet);
    expect(report.questions.some((x) => x.kind === "akashic")).toBe(false);
    expect(report.probes.some((p) => p.context === "akashic_veil")).toBe(false);

    // An archetype can't trip the class check (base names only).
    const arch = createDefaultCharacter();
    arch.identity.classes = [{ id: "cls1", name: "Fighter (Vizier's Bodyguard) 5", level: 5 }];
    expect(collectProbes(arch).questions.some((x) => x.kind === "akashic")).toBe(false);
  });

  it("veilweaver names inside OTHER multi-word class names never fire — full baseName equality", () => {
    const ask = (classes: string[]) => {
      const c = createDefaultCharacter();
      c.identity.classes = classes.map((name, i) => ({ id: `cls${i}`, name, level: 0 }));
      return collectProbes(c).questions.some((x) => x.kind === "akashic");
    };
    // "Radiant Dawn" is a PoW discipline, not the Radiant class; "Guru Kandari" and the spaced
    // "Storm Bound" don't equal a listed junction name.
    expect(ask(["Radiant Dawn 5"])).toBe(false);
    expect(ask(["Guru Kandari 6"])).toBe(false);
    expect(ask(["Storm Bound 4"])).toBe(false);
    // …while the real veilweaver classes still fire, alone or in a multiclass line.
    expect(ask(["Radiant 5"])).toBe(true);
    expect(ask(["Fighter 5 / Rajah 3"])).toBe(true);
  });

  it("asks when the module entry is present but disabled (adapter-flagged)", () => {
    const c = createDefaultCharacter();
    c.rules.modules.push({ key: "akashic", enabled: false, settings: {} });
    expect(collectProbes(c).questions.some((x) => x.kind === "akashic")).toBe(true);
  });
});

describe("Oaths detector — the akashic detector's mirror, minus the class marker", () => {
  const mk = (notes: string) => {
    const c = createDefaultCharacter();
    c.notes.player = `# Imported from Myth-Weavers\n\n## Notes field\n${notes}`;
    return collectProbes(c).questions.some((x) => x.kind === "oaths");
  };

  it("asks on oath bookkeeping in the notes dump", () => {
    expect(mk("Forbidden Knowledge (4 Oath Points)")).toBe(true);
    expect(mk("Oath Points: 9")).toBe(true);
    expect(mk("Oath Boons: Immortality, Bonus Feats")).toBe(true);
    // A bare "OATHS" section header on its own line is the strongest marker.
    expect(mk("OATHS:\nOath of Candor (1 Oath Point)")).toBe(true);
    expect(mk("################# OATHS #################\nOath of Candor (1 Oath Point)")).toBe(true);
  });

  it("stays quiet on mid-prose oaths, the OATHBOW, and numbered slot labels", () => {
    // Oaths are class-agnostic — there is deliberately NO class marker, so the notes shapes
    // must stay TIGHT: sworn-oath prose, the magic weapon, and "Oath N)" feat-slot bookkeeping
    // (feats granted VIA an oath) never enable the module.
    expect(mk("She swore an oath of vengeance before the court.")).toBe(false);
    expect(mk("Loyal to her oath of silence and her order.")).toBe(false);
    expect(mk("Weapons: +2 Oathbow, cold iron dagger")).toBe(false);
    expect(mk("Oath 10: Implausible Deniability")).toBe(false);
    expect(mk("Oathbound Paladin (archetype)")).toBe(false);
  });

  it("stays quiet when the module is already enabled", () => {
    const on = createDefaultCharacter();
    on.notes.player = "# Imported from Myth-Weavers\n\n## Notes field\nOATHS:\nOath of Candor (1 Oath Point)";
    on.rules.modules.push({ key: "oaths", enabled: true, settings: {} });
    expect(collectProbes(on).questions.some((x) => x.kind === "oaths")).toBe(false);
  });

  it("asks when the module entry is present but disabled (adapter-flagged)", () => {
    const c = createDefaultCharacter();
    c.rules.modules.push({ key: "oaths", enabled: false, settings: {} });
    expect(collectProbes(c).questions.some((x) => x.kind === "oaths")).toBe(true);
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
