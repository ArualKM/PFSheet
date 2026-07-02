import { describe, it, expect } from "vitest";
import { compendiumRowToPreset, createDefaultCharacter } from "@pathforge/schema";
import { applyArchetype, applyCompendiumClass, parseAbilityMods, archetypeReplaces } from "@pathforge/rules-pf1e";
import {
  normalizeProgression,
  threeppClassRowToInput,
  threeppFeaturesFromProgression,
  threeppArchetypeFeatureRows,
  baseClassParts,
  classNameForms,
  matchesBaseClass,
  parseLandSpeed,
  type ThreeppClassRow,
  type ThreeppArchetypeRow,
} from "@/lib/character/threepp-class-adapter";

/**
 * Phase 2b-B — the 3pp → PFcore-builder adapter. The fixture mirrors the real `threepp_class_compendium`
 * shape (a Path of War Stalker-like row): same header-row progression format as PFcore `class_progression`,
 * extra system columns after "Special", d8 / 6 + Int, features only named in the Special column.
 */

const STALKER_PROG = [
  ["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special", "Maneuvers Known", "Maneuvers Readied", "Stances Known"],
  ["1st", "+0", "+0", "+2", "+2", "Combat insight, ki pool, maneuvers, stalker arts¹", "7", "4", "1"],
  ["2nd", "+1", "+0", "+3", "+3", "—", "8", "4", "2"],
  ["3rd", "+2", "+1", "+3", "+3", "Stalker art", "9", "5", "2"],
  ["4th", "+3", "+1", "+4", "+4", "Ki pool (increased)", "10", "5", "2"],
  ["20th", "+15/+10/+5", "+6", "+12", "+12", "Stalker art, deadly strike", "25", "12", "5"],
];

const STALKER_ROW: ThreeppClassRow = {
  slug: "stalker",
  name: "Stalker",
  class_type: "base",
  system: "path_of_war",
  alignment: "Any",
  hit_die: "d8",
  skill_points: "6 + Int modifier",
  bab: "",
  fort: "",
  ref: "",
  will: "",
  class_features: "Combat Insight (Ex), Ki Pool (Su), Stalker Arts (Ex)",
  progression_json: STALKER_PROG,
  description: "A martial adept…",
  source: "Path of War",
  url: null,
};

/**
 * Real prod rows from `threepp_class_compendium` (vizier-akashic) — the Miraheze scraper's OBJECT format:
 * an array of per-level objects whose keys are the header labels (jsonb alphabetizes them, so original
 * column order is lost). 73 of 129 prod progressions have this shape.
 */
const vz = (
  level: string,
  bab: string,
  fort: string,
  ref: string,
  will: string,
  special: string,
  essence: string,
  veils: string,
) => ({
  Level: level,
  Veils: veils,
  Essence: essence,
  Special: special,
  "Ref Save": ref,
  "Fort Save": fort,
  "Will Save": will,
  "Base Attack Bonus": bab,
});
const VIZIER_PROG = [
  vz("1st", "+0", "+2", "+0", "+2", "Eldritch insight, mystic attunement", "1", "2"),
  vz("2nd", "+1", "+3", "+0", "+3", "Chakra bind (Hands)", "2", "3"),
  vz("3rd", "+1", "+3", "+1", "+3", "Improved essence capacity +1, veilshifting", "3", "3"),
  vz("12th", "+6/+1", "+8", "+4", "+8", "Chakra bind (Headband)", "14", "7"),
  vz("20th", "+10/+5", "+12", "+6", "+12", "Chakra bind (Body), chakra rebirth", "30", "11"),
];

const VIZIER_ROW: ThreeppClassRow = {
  slug: "vizier-akashic",
  name: "Vizier",
  class_type: "base",
  system: "akashic",
  alignment: "Any",
  hit_die: "d6",
  skill_points: "4 + Int modifier",
  bab: "",
  fort: "",
  ref: "",
  will: "",
  class_features: null,
  progression_json: VIZIER_PROG,
  description: "A veilweaver…",
  source: "Akashic Mysteries",
  url: null,
};

describe("normalizeProgression", () => {
  it("converts the object format to a header-row 2D array with canonical column order", () => {
    const norm = normalizeProgression(VIZIER_PROG) as unknown[][];
    expect(Array.isArray(norm)).toBe(true);
    // Canonical columns first (Level/BAB/saves/Special), then the system columns alphabetically.
    expect(norm[0]).toEqual(["Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Special", "Essence", "Veils"]);
    expect(norm[1]).toEqual(["1st", "+0", "+2", "+0", "+2", "Eldritch insight, mystic attunement", "1", "2"]);
    expect(norm).toHaveLength(VIZIER_PROG.length + 1);
  });

  it("real vizier rows yield a sane preset — half BAB, good Fort/Will, poor Ref, no caster, no warnings", () => {
    const { preset, warnings } = compendiumRowToPreset(threeppClassRowToInput(VIZIER_ROW));
    expect(warnings).toEqual([]);
    expect(preset.bab).toBe("half"); // +10/+5 at L20
    expect(preset.saves).toEqual({ fortitude: "good", reflex: "poor", will: "good" });
    expect(preset.caster).toBeUndefined(); // Essence/Veils are NOT spell-level columns
    expect(preset.hitDie).toBe(6);
  });

  it("synthesizes Special-column features from an object-format progression", () => {
    const rows = threeppFeaturesFromProgression(VIZIER_PROG, "vizier-akashic");
    expect(rows.filter((r) => r.level === 1).map((r) => r.feature)).toEqual(["Eldritch insight", "mystic attunement"]);
    expect(rows.find((r) => r.feature === "Chakra bind (Hands)")?.level).toBe(2);
    expect(rows.filter((r) => r.level === 20).map((r) => r.feature)).toEqual(["Chakra bind (Body)", "chakra rebirth"]);
  });

  it("handles plain-digit levels + 'Reflex Save' key drift (servant-shaped rows)", () => {
    const prog = [
      { Level: "1", "Base Attack Bonus": "+0", "Fort Save": "+2", "Reflex Save": "+0", "Will Save": "+2", Special: "Constellations, path", Essence: "2" },
      { Level: "20", "Base Attack Bonus": "+15/+10/+5", "Fort Save": "+12", "Reflex Save": "+6", "Will Save": "+12", Special: "—", Essence: "40" },
    ];
    const { preset, warnings } = compendiumRowToPreset(threeppClassRowToInput({ ...VIZIER_ROW, progression_json: prog }));
    expect(warnings).toEqual([]);
    expect(preset.bab).toBe("three_quarter");
    expect(preset.saves).toEqual({ fortitude: "good", reflex: "poor", will: "good" });
    const feats = threeppFeaturesFromProgression(prog, "servant-akashic");
    expect(feats.map((f) => [f.feature, f.level])).toEqual([
      ["Constellations", 1],
      ["path", 1],
    ]); // "—" placeholder at L20 skipped; digit levels became ordinals so rows parse at all
  });

  it("handles 'Class Level' + 'Class Features' key drift (eclipse/soulforge-shaped rows)", () => {
    const prog = [
      { "Class Level": "1", "Base Attack Bonus": "+0", "Fort Save": "+2", "Reflex Save": "+2", "Will Save": "+0", "Class Features": "Darkvision, occultation", Essence: "1", Veils: "1" },
      { "Class Level": "10", "Base Attack Bonus": "+7/+2", "Fort Save": "+7", "Reflex Save": "+7", "Will Save": "+3", "Class Features": "Umbral form", Essence: "16", Veils: "6" },
    ];
    const { preset, warnings } = compendiumRowToPreset(threeppClassRowToInput({ ...VIZIER_ROW, progression_json: prog }));
    expect(warnings).toEqual([]);
    expect(preset.bab).toBe("three_quarter");
    expect(preset.saves).toEqual({ fortitude: "good", reflex: "good", will: "poor" });
    const feats = threeppFeaturesFromProgression(prog, "eclipse-akashic");
    expect(feats.map((f) => f.feature)).toEqual(["Darkvision", "occultation", "Umbral form"]);
  });

  it("passes header-row arrays and null through unchanged (idempotent on both formats)", () => {
    expect(normalizeProgression(STALKER_PROG)).toBe(STALKER_PROG); // the array format is untouched
    expect(normalizeProgression(null)).toBeNull();
    expect(normalizeProgression(undefined)).toBeUndefined();
    const once = normalizeProgression(VIZIER_PROG);
    expect(normalizeProgression(once)).toBe(once); // normalizing a normalized table is the identity
  });

  it("null progression falls back to ½ BAB / poor saves with a warning, and Apply still works", () => {
    const row = { ...VIZIER_ROW, slug: "rajah-path-of-war", name: "Rajah", progression_json: null };
    const { preset, warnings } = compendiumRowToPreset(threeppClassRowToInput(row));
    expect(preset.bab).toBe("half");
    expect(preset.saves).toEqual({ fortitude: "poor", reflex: "poor", will: "poor" });
    expect(warnings.length).toBeGreaterThan(0);
    expect(threeppFeaturesFromProgression(null, "rajah-path-of-war")).toEqual([]);
    const c = createDefaultCharacter();
    const res = applyCompendiumClass(c, { input: threeppClassRowToInput(row), level: 5, features: [] });
    expect(c.identity.classes.find((cl) => cl.compendiumId === "3pp:rajah-path-of-war")?.level).toBe(5);
    expect(res.featuresAdded).toEqual([]);
  });
});

describe("threeppClassRowToInput", () => {
  it("maps the 3pp row onto CompendiumClassInput (3pp: key, hit die, skill points, empty class skills)", () => {
    const input = threeppClassRowToInput(STALKER_ROW);
    expect(input.key).toBe("3pp:stalker");
    expect(input.name).toBe("Stalker");
    expect(input.hitDie).toBe(8);
    expect(input.skillRanksPerLevel).toBe(6);
    expect(input.classSkillKeys).toEqual([]);
    expect(input.progression).toBe(STALKER_PROG);
  });

  it("the input feeds compendiumRowToPreset unchanged — ¾ BAB, poor Fort / good Ref+Will, NO spurious caster", () => {
    const { preset, warnings } = compendiumRowToPreset(threeppClassRowToInput(STALKER_ROW));
    expect(warnings).toEqual([]);
    expect(preset.bab).toBe("three_quarter"); // +15 at L20
    expect(preset.saves).toEqual({ fortitude: "poor", reflex: "good", will: "good" });
    // Maneuvers Known/Readied/Stances columns are NOT spell-level columns → no caster inferred.
    expect(preset.caster).toBeUndefined();
  });
});

describe("threeppFeaturesFromProgression", () => {
  const rows = threeppFeaturesFromProgression(STALKER_PROG, "stalker");

  it("synthesizes one name-only row per Special entry per level (comma split, footnotes stripped, — skipped)", () => {
    const l1 = rows.filter((r) => r.level === 1).map((r) => r.feature);
    expect(l1).toEqual(["Combat insight", "ki pool", "maneuvers", "stalker arts"]); // ¹ stripped
    expect(rows.filter((r) => r.level === 2)).toHaveLength(0); // "—" placeholder
    expect(rows.find((r) => r.feature === "Stalker art")?.level).toBe(3);
    expect(rows.find((r) => r.feature === "Combat insight")).toMatchObject({
      id: "3pp:stalker:combat-insight",
      type: null,
      description: null,
    });
  });

  it("a feature repeated at later levels keeps the same slug, so applying grants it exactly once", () => {
    // "Stalker art" appears at L3 and again at L20 → same id, two rows.
    expect(rows.filter((r) => r.id === "3pp:stalker:stalker-art").map((r) => r.level)).toEqual([3, 20]);
    const c = createDefaultCharacter();
    const res = applyCompendiumClass(c, { input: threeppClassRowToInput(STALKER_ROW), level: 20, features: rows });
    expect(res.featuresAdded.filter((f) => f === "Stalker art")).toHaveLength(1);
    expect(c.features.list.filter((f) => f.name === "Stalker art")).toHaveLength(1);
  });

  it("applyCompendiumClass grants only the features at or below the chosen level", () => {
    const c = createDefaultCharacter();
    const res = applyCompendiumClass(c, { input: threeppClassRowToInput(STALKER_ROW), level: 3, features: rows });
    expect(res.featuresAdded).toEqual(["Combat insight", "ki pool", "maneuvers", "stalker arts", "Stalker art"]);
    expect(c.features.list.some((f) => f.name === "Ki pool (increased)")).toBe(false); // L4
    const row = c.identity.classes.find((cl) => cl.compendiumId === "3pp:stalker");
    expect(row?.level).toBe(3);
  });
});

describe("threeppArchetypeFeatureRows", () => {
  const ARCH: ThreeppArchetypeRow = {
    slug: "abyss-wielder",
    name: "Abyss Wielder",
    base_class: "Antipaladin",
    system: "akashic",
    altered_features: "Wielder of the Abyss (Su), Aura of Corruption (Su)",
    description: "Long prose about the archetype…",
    source: "Akashic Realms",
  };

  it("one level-less replaces row per altered feature (type tag stripped) + one level-1 description grant", () => {
    const rows = threeppArchetypeFeatureRows(ARCH);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      slug: "3pp:abyss-wielder:0",
      archetype: "Abyss Wielder",
      feature: "Abyss Wielder (archetype)",
      level: null,
      replaces: "Wielder of the Abyss",
      text: null,
    });
    expect(rows[1]?.replaces).toBe("Aura of Corruption");
    expect(rows[2]).toMatchObject({
      slug: "3pp:abyss-wielder:desc",
      feature: "Abyss Wielder",
      level: 1,
      replaces: null,
      text: "Long prose about the archetype…",
    });
    expect(archetypeReplaces(rows)).toEqual(["wielder of the abyss", "aura of corruption"]);
  });

  it("empty altered_features still yields the description grant row", () => {
    const rows = threeppArchetypeFeatureRows({ ...ARCH, altered_features: null });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe("3pp:abyss-wielder:desc");
  });

  it('a single altered feature containing " and " survives intact — replacesList beats parseReplaces fragmenting', () => {
    // Real prod entries: "Up Close and Personal (Ex)" (Gunfighter→Gunslinger), "Compulsions and Goals (Ex)".
    const rows = threeppArchetypeFeatureRows({ ...ARCH, altered_features: "Up Close and Personal (Ex), Grit (Ex)" });
    expect(rows[0]?.replacesList).toEqual(["Up Close and Personal"]);
    expect(archetypeReplaces(rows)).toEqual(["up close and personal", "grit"]); // NOT ["up close", "personal", …]
  });

  it("normalizes <br> markup in the granted description to newlines (nothing else persists raw HTML)", () => {
    const rows = threeppArchetypeFeatureRows({
      ...ARCH,
      description: "…not a veilweaving class.<br><br>Limited Pool: The sphere radiant…<br />End.",
    });
    expect(rows.at(-1)?.text).toBe("…not a veilweaving class.\n\nLimited Pool: The sphere radiant…\nEnd.");
  });

  it("applyArchetype on a 3pp class: removes the altered standard feature, grants the archetype once, conflicts block", () => {
    const c = createDefaultCharacter();
    const features = threeppFeaturesFromProgression(STALKER_PROG, "stalker");
    applyCompendiumClass(c, { input: threeppClassRowToInput(STALKER_ROW), level: 3, features });
    const classId = c.identity.classes.find((cl) => cl.compendiumId === "3pp:stalker")!.id;

    // The archetype alters "Ki Pool (Su)" — matches the granted name-only feature "ki pool" via base-name compare.
    const arch: ThreeppArchetypeRow = {
      slug: "shadow-hand",
      name: "Shadow Hand",
      base_class: "Stalker",
      system: "path_of_war",
      altered_features: "Ki Pool (Su)",
      description: "Shadowy prose…",
      source: "Path of War",
    };
    const res = applyArchetype(c, {
      classId,
      archetype: { name: "Shadow Hand", compendiumId: "3pp:shadow-hand" },
      features: threeppArchetypeFeatureRows(arch),
    });
    expect(res.conflicts).toEqual([]);
    expect(res.replaced).toEqual(["ki pool"]);
    expect(res.added).toEqual(["Shadow Hand"]);
    expect(c.features.list.some((f) => f.name === "ki pool")).toBe(false);
    expect(c.features.list.some((f) => f.compendiumId === "3pp:shadow-hand:desc")).toBe(true);

    // A second archetype altering the same feature is a hard conflict (mutates nothing).
    const rival: ThreeppArchetypeRow = { ...arch, slug: "rival", name: "Rival" };
    const res2 = applyArchetype(c, {
      classId,
      archetype: { name: "Rival", compendiumId: "3pp:rival" },
      features: threeppArchetypeFeatureRows(rival),
    });
    expect(res2.conflicts).toEqual(["ki pool"]);
    expect(res2.added).toEqual([]);
  });
});

describe("base_class whole-name matching (archetype union)", () => {
  it("rejects substring collisions — Antipaladin is not Paladin, Radiant Retold is not Radiant", () => {
    expect(matchesBaseClass("Antipaladin", "Paladin")).toBe(false);
    expect(matchesBaseClass("Antipaladin<br>Paladin", "Paladin")).toBe(true); // real prod compound row
    expect(matchesBaseClass("Paladin/Antipaladin", "Antipaladin")).toBe(true);
    expect(matchesBaseClass("Radiant Retold", "Radiant")).toBe(false);
    expect(matchesBaseClass("Radiant<br>Radiant Retold", "Radiant")).toBe(true);
    expect(matchesBaseClass("Radiant Retold", "Radiant Retold")).toBe(true);
  });

  it("accepts every unchained spelling for the PFcore '(Unchained)' class name", () => {
    for (const data of [
      "Unchained Rogue",
      "Rogue/Unchained Rogue",
      "Rogue/UC Rogue",
      "Rogue/U. Rogue", // real prod spelling
      "Rogue, Unchained", // ", Unchained" is ONE class, pre-normalized before the comma split
      "Rogue<br>Unchained Rogue",
    ]) {
      expect(matchesBaseClass(data, "Rogue (Unchained)"), data).toBe(true);
    }
    // …and the reverse direction: a class named "Unchained Monk" matches the paren form.
    expect(matchesBaseClass("Monk (Unchained)", "Unchained Monk")).toBe(true);
    expect(matchesBaseClass("Monk/Unchained Monk", "Unchained Monk")).toBe(true);
  });

  it("REJECTS unchained-only rows for the plain core class (whole-name equality)", () => {
    expect(matchesBaseClass("Unchained Rogue", "Rogue")).toBe(false);
    expect(matchesBaseClass("Rogue, Unchained", "Rogue")).toBe(false);
    expect(matchesBaseClass("UC Barbarian", "Barbarian")).toBe(false);
    // …but a compound row naming BOTH matches the core class via its own part.
    expect(matchesBaseClass("Barbarian<br>Unchained Barbarian", "Barbarian")).toBe(true);
    expect(matchesBaseClass("Barbarian/UC Barbarian", "Barbarian")).toBe(true);
  });

  it("baseClassParts splits on <br> / '/' / ';' / ',' and cleans for display", () => {
    expect(baseClassParts("Rogue<br>Unchained Rogue<br>Ninja<br>Investigator")).toEqual([
      "Rogue",
      "Unchained Rogue",
      "Ninja",
      "Investigator",
    ]);
    expect(baseClassParts("Barbarian/UC Barbarian")).toEqual(["Barbarian", "UC Barbarian"]);
    expect(baseClassParts("Rogue, Unchained")).toEqual(["Unchained Rogue"]);
    expect(baseClassParts(null)).toEqual([]);
  });

  it("classNameForms expands unchained forms both directions and keeps plain names single", () => {
    expect([...classNameForms("Rogue (Unchained)")].sort()).toEqual(
      ["rogue (unchained)", "u. rogue", "uc rogue", "unchained rogue"].sort(),
    );
    expect([...classNameForms("Unchained Monk")].sort()).toEqual(
      ["monk (unchained)", "u. monk", "uc monk", "unchained monk"].sort(),
    );
    expect([...classNameForms("Fighter")]).toEqual(["fighter"]);
  });
});

describe("3pp race helpers", () => {
  it("parseAbilityMods handles the 3pp dataset's FULL ability names (regression pin for the race union)", () => {
    // Real threepp_race_compendium shapes:
    expect(parseAbilityMods("+2 Dexterity, -2 Intelligence, +2 Wisdom")).toEqual({ dex: 2, int: -2, wis: 2 });
    expect(parseAbilityMods("+2 Constitution, See Racial Traits")).toEqual({ con: 2 });
    expect(parseAbilityMods("+2 racial bonus to one ability score")).toEqual({}); // flexible → player assigns
  });

  it("parseLandSpeed takes the leading land number from compound speed strings", () => {
    expect(parseLandSpeed("30 feet (land); 20 feet (climb)")).toBe(30);
    expect(parseLandSpeed("30 feet (land)")).toBe(30);
    expect(parseLandSpeed("20 ft.")).toBe(20);
    expect(parseLandSpeed("")).toBeUndefined();
    expect(parseLandSpeed(null)).toBeUndefined();
  });
});
