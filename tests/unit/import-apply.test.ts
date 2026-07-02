import { describe, it, expect } from "vitest";
import { akashicBlockSchema, createDefaultCharacter, isGestalt, pathOfWarBlockSchema, type PathForgeCharacterV1 } from "@pathforge/schema";
import { applyImportResolutions, type ClaimAnswers } from "@/lib/character/import-apply";
import { assembleClaims, type ClaimProbe, type ImportClaim, type ImportQuestion } from "@/lib/character/import-claims";
import { resolveProbeCandidates } from "@/lib/character/import-candidates";

/**
 * Commit-time apply tests against a fake Supabase client — the review-found failure modes:
 * gestalt track preservation on the ERROR path (the totalLevel=40 bug), skipped classes
 * preserved under metadata.unmapped, spell-slot re-filing, the unchained answer actually
 * changing which class row applies, unvalidated class levels, and the skip-record merge.
 */

type Row = Record<string, unknown>;

/** Minimal thenable PostgREST builder over in-memory tables. */
function fakeSb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const filters: ((r: Row) => boolean)[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        limit: () => builder,
        ilike: () => builder,
        eq: (col: string, v: unknown) => {
          filters.push((r) => String(r[col]) === String(v));
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          const set = new Set(vals.map(String));
          filters.push((r) => set.has(String(r[col])));
          return builder;
        },
        maybeSingle: async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
          Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(resolve),
      };
      return builder;
    },
    rpc: async () => ({ data: [], error: null }),
  };
}

function classClaim(over: Partial<ImportClaim>): ImportClaim {
  return {
    id: "c-class",
    kind: "class",
    sourceKind: "class",
    sourceText: "Rogue 20",
    sourceLabel: "Class line",
    matchKey: "Rogue",
    candidates: [],
    confidence: "high",
    resolution: { mode: "generic" },
    level: 20,
    draftEntryId: "cls1",
    ...over,
  };
}

function gestaltSheet(): PathForgeCharacterV1 {
  const sheet = createDefaultCharacter();
  sheet.identity.classes = [{ id: "cls1", name: "UCRogue 20 || UCMonk 20", level: 20 }];
  sheet.identity.totalLevel = 20;
  return sheet;
}

const GESTALT_Q: ImportQuestion = { id: "q-g", kind: "gestalt", text: "gestalt?", defaultAnswer: true };

describe("applyImportResolutions — classes", () => {
  it("keeps the gestalt track on the class-apply ERROR path (totalLevel stays 20, not 40)", async () => {
    const sheet = gestaltSheet();
    const claims: ImportClaim[] = [
      classClaim({
        id: "c-rogue",
        sourceText: "UCRogue",
        track: "a",
        resolution: { mode: "linked", table: "class_compendium", slug: "rogue-unchained" },
        candidates: [{ table: "class_compendium", slug: "rogue-unchained", name: "Rogue (Unchained)", match: "exact" }],
      }),
      classClaim({
        id: "c-monk",
        sourceText: "UCMonk",
        track: "b",
        resolution: { mode: "linked", table: "class_compendium", slug: "monk-unchained" },
        candidates: [{ table: "class_compendium", slug: "monk-unchained", name: "Monk (Unchained)", match: "exact" }],
      }),
    ];
    // Empty class_compendium → BOTH applies fail → both take the catch fallback.
    const report = await applyImportResolutions(fakeSb({}), sheet, claims, [GESTALT_Q], {});
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(isGestalt(sheet)).toBe(true);
    const tracks = sheet.identity.classes.map((c) => c.track);
    expect(tracks).toContain("b"); // the second fallback keeps its track
    expect(sheet.identity.totalLevel).toBe(20); // NOT 40
  });

  it("preserves a skipped class segment under metadata.unmapped (and merges with prior skips)", async () => {
    const sheet = gestaltSheet();
    sheet.metadata.unmapped = { verification_skipped: ["Old Entry"] };
    const claims: ImportClaim[] = [
      classClaim({
        id: "c-rogue",
        sourceText: "UCRogue",
        track: "a",
        resolution: { mode: "linked", table: "class_compendium", slug: "rogue-unchained" },
        candidates: [{ table: "class_compendium", slug: "rogue-unchained", name: "Rogue (Unchained)", match: "exact" }],
      }),
      classClaim({ id: "c-monk", sourceText: "UCMonk", track: "b", resolution: { mode: "skipped" } }),
    ];
    await applyImportResolutions(fakeSb({}), sheet, claims, [GESTALT_Q], {});
    const skipped = (sheet.metadata.unmapped as { verification_skipped?: string[] }).verification_skipped ?? [];
    expect(skipped).toContain("Old Entry"); // merge, never overwrite
    expect(skipped.some((s) => s.includes("UCMonk"))).toBe(true);
    // The skipped segment is NOT a class row anymore, but it isn't silently gone either.
    expect(sheet.identity.classes.some((c) => /monk/i.test(c.name))).toBe(false);
  });

  it("consumes the core-vs-Unchained answer — 'Core' applies the core row", async () => {
    const sheet = createDefaultCharacter();
    sheet.identity.classes = [{ id: "cls1", name: "UCRogue 20", level: 20 }];
    sheet.identity.totalLevel = 20;
    const q: ImportQuestion = { id: "q-uc", kind: "unchained", className: "Rogue", text: "which?", defaultAnswer: true };
    const claims: ImportClaim[] = [
      classClaim({
        id: "c-rogue",
        sourceText: "UCRogue",
        unchainedQuestionId: "q-uc",
        resolution: { mode: "linked", table: "class_compendium", slug: "rogue-unchained" },
        candidates: [
          { table: "class_compendium", slug: "rogue-unchained", name: "Rogue (Unchained)", match: "exact" },
          { table: "class_compendium", slug: "rogue", name: "Rogue", match: "exact" },
        ],
      }),
    ];
    const sb = fakeSb({
      // Only the CORE row exists — the apply succeeds only if the answer re-picked it.
      class_compendium: [{ slug: "rogue", name: "Rogue", hit_die: "d8", class_skills: "", skill_points_per_level: "8", role: "", source: "CRB" }],
    });
    const answers: ClaimAnswers = { questions: { "q-uc": false } };
    const report = await applyImportResolutions(sb, sheet, claims, [q], answers);
    expect(report.applied.some((a) => a.startsWith("Class: Rogue 20"))).toBe(true);
    expect(sheet.identity.classes.some((c) => c.name === "Rogue")).toBe(true);
  });

  it("never lets a hostile classLevels value poison the sheet (NaN → fallback level)", async () => {
    const sheet = gestaltSheet();
    const claims: ImportClaim[] = [
      classClaim({
        id: "c-rogue",
        sourceText: "UCRogue",
        level: 12,
        resolution: { mode: "linked", table: "class_compendium", slug: "rogue-unchained" },
        candidates: [{ table: "class_compendium", slug: "rogue-unchained", name: "Rogue (Unchained)", match: "exact" }],
      }),
    ];
    const answers: ClaimAnswers = { classLevels: { "c-rogue": "abc" as unknown as number } };
    await applyImportResolutions(fakeSb({}), sheet, claims, [], answers);
    const row = sheet.identity.classes.find((c) => c.id === "import_c-rogue")!;
    expect(row.level).toBe(12); // claim.level fallback, never NaN
    expect(Number.isFinite(sheet.identity.totalLevel)).toBe(true);
  });
});

describe("applyImportResolutions — re-filing across slots", () => {
  it("moves a feat typed into a spell slot to the feat list", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "Weapon Finesse", level: 0 }];
    const claims: ImportClaim[] = [
      {
        id: "c-sp",
        kind: "feat",
        sourceKind: "spell",
        sourceText: "Weapon Finesse",
        sourceLabel: "Spells field",
        matchKey: "Weapon Finesse",
        candidates: [{ table: "feat_compendium", slug: "weapon-finesse", name: "Weapon Finesse", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "feat_compendium", slug: "weapon-finesse" },
        draftEntryId: "sp1",
      },
    ];
    const sb = fakeSb({
      feat_compendium: [{ slug: "weapon-finesse", name: "Weapon Finesse", types: "Combat", benefit: "Use Dex on attack rolls." }],
    });
    const report = await applyImportResolutions(sb, sheet, claims, [], {});
    expect(sheet.spellcasting.knownSpells).toHaveLength(0);
    const feat = sheet.feats.list.find((f) => f.name === "Weapon Finesse");
    expect(feat?.compendiumId).toBe("weapon-finesse");
    expect(report.applied.some((a) => a.includes("Weapon Finesse"))).toBe(true);
  });

  it("adds a mined sphere talent to character.spheres and enables the right module", async () => {
    const sheet = createDefaultCharacter();
    const claims: ImportClaim[] = [
      {
        id: "c-tal",
        kind: "sphere_talent",
        sourceKind: "trait",
        sourceText: "Pouncing Teleport",
        sourceLabel: "Notes field",
        matchKey: "Pouncing Teleport",
        candidates: [{ table: "sphere_talents", slug: "tal-1", name: "Pouncing Teleport", group: "Warp", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "sphere_talents", slug: "tal-1" },
        mined: true,
      },
    ];
    const sb = fakeSb({
      sphere_talents: [{ id: "tal-1", talent_name: "Pouncing Teleport", sphere_name: "Warp", talent_category: "Base" }],
      sphere_compendium: [{ name: "Warp", system: "Magic" }],
    });
    await applyImportResolutions(sb, sheet, claims, [], {});
    expect(sheet.spheres?.talents.some((t) => t.talentName === "Pouncing Teleport" && t.compendiumId === "tal-1")).toBe(true);
    expect(sheet.spheres?.spheres.some((s) => s.name === "Warp" && s.system === "Magic")).toBe(true);
    expect(sheet.rules.modules.some((m) => m.key === "spheres_of_power" && m.enabled)).toBe(true);
  });

  it("adds a mined mythic ability to mythic.pathAbilities when the module is on — and as a feature when off", async () => {
    const sb = fakeSb({
      mythic_path_ability_compendium: [
        { slug: "beyond-morality", name: "Beyond Morality", path: "Universal", type: "Su", description: "You have no alignment." },
      ],
    });
    const claim: ImportClaim = {
      id: "c-my",
      kind: "mythic_ability",
      sourceKind: "trait",
      sourceText: "Beyond Morality",
      sourceLabel: "Notes field",
      matchKey: "Beyond Morality",
      candidates: [{ table: "mythic_path_ability_compendium", slug: "beyond-morality", name: "Beyond Morality", match: "exact" }],
      confidence: "high",
      resolution: { mode: "linked", table: "mythic_path_ability_compendium", slug: "beyond-morality" },
      mined: true,
    };

    const mythicOn = createDefaultCharacter();
    mythicOn.rules.variants.mythic = true;
    await applyImportResolutions(sb, mythicOn, [claim], [], {});
    expect(mythicOn.mythic?.pathAbilities.some((a) => a.name === "Beyond Morality" && a.category === "universal")).toBe(true);

    const mythicOff = createDefaultCharacter();
    await applyImportResolutions(sb, mythicOff, [claim], [], {});
    expect(mythicOff.mythic?.pathAbilities?.length ?? 0).toBe(0);
    expect(mythicOff.features.list.some((f) => f.name === "Beyond Morality")).toBe(true);
  });

  it("links a parsed trait IN PLACE (no duplicate when the qualifier differs)", async () => {
    const sheet = createDefaultCharacter();
    sheet.traits.list = [{ id: "t1", name: "Fate's Favored (faith)", automation: [] }];
    const claims: ImportClaim[] = [
      {
        id: "c-t",
        kind: "trait",
        sourceKind: "trait",
        sourceText: "Fate's Favored (faith)",
        sourceLabel: "Traits",
        matchKey: "Fate's Favored",
        candidates: [{ table: "trait_compendium", slug: "fates-favored", name: "Fate's Favored", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "trait_compendium", slug: "fates-favored" },
        draftEntryId: "t1",
      },
    ];
    const sb = fakeSb({
      trait_compendium: [{ slug: "fates-favored", name: "Fate's Favored", type: "Faith", description: "Luck bonuses +1." }],
    });
    await applyImportResolutions(sb, sheet, claims, [], {});
    expect(sheet.traits.list).toHaveLength(1);
    expect(sheet.traits.list[0]).toMatchObject({ id: "t1", name: "Fate's Favored", compendiumId: "fates-favored" });
  });

  it("re-files section-labeled as-written entries into features (racial traits captured)", async () => {
    const sheet = createDefaultCharacter();
    sheet.feats.list = [
      { id: "f1", name: "Voiceless: cannot speak/take verbal actions", tags: [], automation: [] },
    ];
    const claims: ImportClaim[] = [
      {
        id: "c-v",
        kind: "feat",
        sourceKind: "feat",
        sourceText: "Voiceless: cannot speak/take verbal actions",
        sourceLabel: "Feat slot",
        matchKey: "Voiceless",
        candidates: [],
        confidence: "low",
        resolution: { mode: "generic" },
        draftEntryId: "f1",
        context: "racial_trait",
      },
    ];
    await applyImportResolutions(fakeSb({}), sheet, claims, [], {});
    expect(sheet.feats.list).toHaveLength(0);
    const feature = sheet.features.list.find((f) => f.name === "Voiceless")!;
    expect(feature.category).toBe("racial_trait");
    expect(feature.description).toContain("cannot speak");
  });

  it("extracts a fully-linked multi-spell line into proper spell entries and removes the slot", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "0: Create Water, Detect Magic", level: 0 }];
    const u1 = "11111111-1111-4111-8111-111111111111";
    const u2 = "22222222-2222-4222-8222-222222222222";
    const part = (id: string, text: string, slug: string): ImportClaim => ({
      id,
      kind: "spell",
      sourceKind: "spell",
      sourceText: text,
      sourceLabel: "Spells field · line item",
      matchKey: text,
      candidates: [{ table: "spell_compendium", slug, name: text, match: "exact" }],
      confidence: "high",
      resolution: { mode: "linked", table: "spell_compendium", slug },
      mined: true,
      partOf: "sp1",
      level: 0,
    });
    const sb = fakeSb({
      spell_compendium: [
        { id: u1, name: "Create Water", school: "conjuration" },
        { id: u2, name: "Detect Magic", school: "divination" },
      ],
    });
    await applyImportResolutions(sb, sheet, [part("c1", "Create Water", u1), part("c2", "Detect Magic", u2)], [], {});
    const names = sheet.spellcasting.knownSpells.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["Create Water", "Detect Magic"]));
    expect(names).not.toContain("0: Create Water, Detect Magic"); // the slot is covered, removed
    expect(sheet.spellcasting.knownSpells.every((s) => s.level === 0 && s.compendiumId)).toBe(true);
    const covered = (sheet.metadata.unmapped as { covered_by_features?: string[] }).covered_by_features ?? [];
    expect(covered).toContain("0: Create Water, Detect Magic");
  });

  it("psionics YES → module enabled + a spell-slot power re-files into psionics.powersKnown", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "Energy Ray - 1 PP", level: 1 }];
    const q: ImportQuestion = { id: "q-psi", kind: "psionics", text: "enable psionics?", defaultAnswer: true };
    const claims: ImportClaim[] = [
      {
        id: "c-pow",
        kind: "psionic_power",
        sourceKind: "spell",
        sourceText: "Energy Ray - 1 PP",
        sourceLabel: "Spells field",
        matchKey: "Energy Ray",
        candidates: [{ table: "psionic_power_compendium", slug: "energy-ray", name: "Energy Ray", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "psionic_power_compendium", slug: "energy-ray" },
        draftEntryId: "sp1",
        level: 1,
      },
    ];
    const sb = fakeSb({
      psionic_power_compendium: [
        {
          slug: "energy-ray",
          name: "Energy Ray",
          discipline: "Psychokinesis",
          power_points: "1",
          augment: "For every additional power point you spend…",
          description: "You create a ray of energy.",
        },
      ],
    });
    const report = await applyImportResolutions(sb, sheet, claims, [q], { questions: { "q-psi": true } });
    expect(sheet.rules.modules.some((m) => m.key === "psionics" && m.enabled)).toBe(true);
    const power = sheet.psionics?.powersKnown.find((p) => p.name === "Energy Ray");
    expect(power).toMatchObject({ compendiumId: "3pp:energy-ray", discipline: "Psychokinesis", ppCost: 1, level: 1 });
    expect(sheet.spellcasting.knownSpells).toHaveLength(0); // the misfiled spell slot moved
    expect(report.applied.some((a) => a.includes("Psionics module enabled"))).toBe(true);
    expect(report.applied.some((a) => a.includes("Psionic power: Energy Ray"))).toBe(true);
  });

  it("psionics NO → module stays off and the power falls back to a features entry (never dropped)", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "Energy Ray", level: 1 }];
    const q: ImportQuestion = { id: "q-psi", kind: "psionics", text: "enable psionics?", defaultAnswer: true };
    const claims: ImportClaim[] = [
      {
        id: "c-pow",
        kind: "psionic_power",
        sourceKind: "spell",
        sourceText: "Energy Ray",
        sourceLabel: "Spells field",
        matchKey: "Energy Ray",
        candidates: [{ table: "psionic_power_compendium", slug: "energy-ray", name: "Energy Ray", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "psionic_power_compendium", slug: "energy-ray" },
        draftEntryId: "sp1",
        level: 1,
      },
    ];
    const sb = fakeSb({
      psionic_power_compendium: [
        { slug: "energy-ray", name: "Energy Ray", discipline: "Psychokinesis", power_points: "1", description: "You create a ray of energy." },
      ],
    });
    await applyImportResolutions(sb, sheet, claims, [q], { questions: { "q-psi": false } });
    expect(sheet.rules.modules.some((m) => m.key === "psionics" && m.enabled)).toBe(false);
    expect(sheet.psionics?.powersKnown.length ?? 0).toBe(0);
    const feature = sheet.features.list.find((f) => f.name === "Energy Ray");
    expect(feature).toMatchObject({ category: "special_ability", compendiumId: "3pp:energy-ray" });
    expect(sheet.spellcasting.knownSpells).toHaveLength(0); // moved, not duplicated or dropped
  });

  it("path_of_war YES → module enabled + maneuvers re-file into pathOfWar with stance detection", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "Steel Flurry Strike", level: 1 }];
    const q: ImportQuestion = { id: "q-pow", kind: "path_of_war", text: "enable Path of War?", defaultAnswer: true };
    const claim = (id: string, slug: string, name: string, over: Partial<ImportClaim> = {}): ImportClaim => ({
      id,
      kind: "pow_maneuver",
      sourceKind: "spell",
      sourceText: name,
      sourceLabel: "Spells field",
      matchKey: name,
      candidates: [{ table: "pow_maneuver_compendium", slug, name, match: "exact" }],
      confidence: "high",
      resolution: { mode: "linked", table: "pow_maneuver_compendium", slug },
      ...over,
    });
    const sb = fakeSb({
      pow_maneuver_compendium: [
        {
          slug: "steel-flurry-strike",
          name: "Steel Flurry Strike",
          discipline: "Mithral Current",
          level: "1",
          category: "Maneuver",
          type: "Strike",
          initiation_action: "1 standard action",
          range: "Melee attack",
          target: "One creature",
          duration: "Instant",
          saving_throw: "None",
          prerequisite: "1 Mithral Current maneuver",
          description: "Make an attack.<br><br>It flows like quicksilver.",
          source: "Path of War Expanded",
        },
        {
          slug: "child-of-shadows",
          name: "Child of Shadows",
          discipline: "Veiled Moon",
          level: "not a number", // hostile/blank level text must clamp to 1, never NaN
          category: "Stance",
          type: "Stance",
          description: "You blur.",
          source: "Path of War",
        },
      ],
    });
    const claims = [
      claim("c-m", "steel-flurry-strike", "Steel Flurry Strike", { draftEntryId: "sp1" }),
      claim("c-s", "child-of-shadows", "Child of Shadows", { mined: true, sourceLabel: "Notes field" }),
    ];
    const report = await applyImportResolutions(sb, sheet, claims, [q], { questions: { "q-pow": true } });
    expect(sheet.rules.modules.some((m) => m.key === "path_of_war" && m.enabled)).toBe(true);
    const strike = sheet.pathOfWar?.maneuvers.find((m) => m.name === "Steel Flurry Strike");
    expect(strike).toMatchObject({
      compendiumId: "3pp:steel-flurry-strike",
      level: 1,
      discipline: "Mithral Current",
      entryKind: "maneuver",
      maneuverType: "Strike",
      initiationAction: "1 standard action",
      savingThrow: "None",
      prerequisites: "1 Mithral Current maneuver",
    });
    // "<br>" rich text → the same plain-text shape the psionics path caches.
    expect(strike!.description).toBe("Make an attack.\n\nIt flows like quicksilver.");
    expect(JSON.stringify(strike)).not.toContain("<br>");
    const stance = sheet.pathOfWar?.maneuvers.find((m) => m.name === "Child of Shadows");
    expect(stance).toMatchObject({ entryKind: "stance", level: 1 }); // category + level clamp
    // The constructed block satisfies the Track-A schema.
    const parsed = pathOfWarBlockSchema.safeParse(sheet.pathOfWar);
    expect(parsed.success).toBe(true);
    expect(sheet.spellcasting.knownSpells).toHaveLength(0); // the misfiled spell slot moved
    expect(report.applied.some((a) => a.includes("Path of War module enabled"))).toBe(true);
    expect(report.applied.some((a) => a.includes("Maneuver: Steel Flurry Strike"))).toBe(true);
    expect(report.applied.some((a) => a.includes("Stance: Child of Shadows"))).toBe(true);
  });

  it("path_of_war NO → module stays off and the maneuver falls back to a features entry (never dropped)", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "Steel Flurry Strike", level: 1 }];
    const q: ImportQuestion = { id: "q-pow", kind: "path_of_war", text: "enable Path of War?", defaultAnswer: true };
    const claims: ImportClaim[] = [
      {
        id: "c-m",
        kind: "pow_maneuver",
        sourceKind: "spell",
        sourceText: "Steel Flurry Strike",
        sourceLabel: "Spells field",
        matchKey: "Steel Flurry Strike",
        candidates: [{ table: "pow_maneuver_compendium", slug: "steel-flurry-strike", name: "Steel Flurry Strike", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "pow_maneuver_compendium", slug: "steel-flurry-strike" },
        draftEntryId: "sp1",
      },
    ];
    const sb = fakeSb({
      pow_maneuver_compendium: [
        {
          slug: "steel-flurry-strike",
          name: "Steel Flurry Strike",
          discipline: "Mithral Current",
          level: "1",
          category: "Maneuver",
          type: "Strike",
          description: "Make an attack.<br>It flows.",
          source: "Path of War Expanded",
        },
      ],
    });
    await applyImportResolutions(sb, sheet, claims, [q], { questions: { "q-pow": false } });
    expect(sheet.rules.modules.some((m) => m.key === "path_of_war" && m.enabled)).toBe(false);
    expect(sheet.pathOfWar?.maneuvers.length ?? 0).toBe(0);
    const feature = sheet.features.list.find((f) => f.name === "Steel Flurry Strike");
    expect(feature).toMatchObject({ category: "special_ability", compendiumId: "3pp:steel-flurry-strike" });
    expect(feature!.description).toBe("Make an attack.\nIt flows.");
    expect(sheet.spellcasting.knownSpells).toHaveLength(0); // moved, not duplicated or dropped
  });

  it("akashic YES → module enabled + veils re-file into akashic.veilsKnown with parsed slots", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "Gorgon Mask", level: 1 }];
    const q: ImportQuestion = { id: "q-aka", kind: "akashic", text: "enable Akashic?", defaultAnswer: true };
    const claim = (id: string, slug: string, name: string, over: Partial<ImportClaim> = {}): ImportClaim => ({
      id,
      kind: "akashic_veil",
      sourceKind: "spell",
      sourceText: name,
      sourceLabel: "Spells field",
      matchKey: name,
      candidates: [{ table: "akashic_veil_compendium", slug, name, match: "exact" }],
      confidence: "high",
      resolution: { mode: "linked", table: "akashic_veil_compendium", slug },
      ...over,
    });
    const sb = fakeSb({
      akashic_veil_compendium: [
        {
          slug: "gorgon-mask",
          name: "Gorgon Mask",
          slot: "Head, Neck",
          descriptors: "Transmutation",
          effect: "Your gaze slows enemies.<br><br>They may be staggered.",
          bind_effect: "Bind: the gaze can petrify.",
          source: "Akashic Mysteries",
        },
        {
          slug: "storm-gauntlets",
          name: "Storm Gauntlets",
          slot: "Hands",
          effect: "Lightning wreathes your fists.",
          source: "Akashic Mysteries",
        },
      ],
    });
    const claims = [
      claim("c-v", "gorgon-mask", "Gorgon Mask", { draftEntryId: "sp1" }),
      claim("c-v2", "storm-gauntlets", "Storm Gauntlets", { mined: true, sourceLabel: "Notes field" }),
    ];
    const report = await applyImportResolutions(sb, sheet, claims, [q], { questions: { "q-aka": true } });
    expect(sheet.rules.modules.some((m) => m.key === "akashic" && m.enabled)).toBe(true);
    const mask = sheet.akashic?.veilsKnown.find((v) => v.name === "Gorgon Mask");
    expect(mask).toMatchObject({
      compendiumId: "3pp:gorgon-mask",
      slots: ["Head", "Neck"], // the comma slot cell parsed via parseVeilSlots
      descriptors: "Transmutation",
      bindEffect: "Bind: the gaze can petrify.",
      source: "Akashic Mysteries",
    });
    // "<br>" rich text → the same plain-text shape the psionics/pow paths cache.
    expect(mask!.effect).toBe("Your gaze slows enemies.\n\nThey may be staggered.");
    expect(JSON.stringify(mask)).not.toContain("<br>");
    expect(sheet.akashic?.veilsKnown.find((v) => v.name === "Storm Gauntlets")?.slots).toEqual(["Hands"]);
    // The constructed block satisfies the Track-A schema.
    const parsed = akashicBlockSchema.safeParse(sheet.akashic);
    expect(parsed.success).toBe(true);
    expect(sheet.spellcasting.knownSpells).toHaveLength(0); // the misfiled spell slot moved
    expect(report.applied.some((a) => a.includes("Akashic module enabled"))).toBe(true);
    expect(report.applied.some((a) => a.includes("Veil: Gorgon Mask"))).toBe(true);
    expect(report.applied.some((a) => a.includes("Veil: Storm Gauntlets (found in Notes field)"))).toBe(true);
  });

  it("akashic NO → module stays off and the veil falls back to a features entry (never dropped)", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "Gorgon Mask", level: 1 }];
    const q: ImportQuestion = { id: "q-aka", kind: "akashic", text: "enable Akashic?", defaultAnswer: true };
    const claims: ImportClaim[] = [
      {
        id: "c-v",
        kind: "akashic_veil",
        sourceKind: "spell",
        sourceText: "Gorgon Mask",
        sourceLabel: "Spells field",
        matchKey: "Gorgon Mask",
        candidates: [{ table: "akashic_veil_compendium", slug: "gorgon-mask", name: "Gorgon Mask", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "akashic_veil_compendium", slug: "gorgon-mask" },
        draftEntryId: "sp1",
      },
    ];
    const sb = fakeSb({
      akashic_veil_compendium: [
        {
          slug: "gorgon-mask",
          name: "Gorgon Mask",
          slot: "Head",
          effect: "Your gaze slows enemies.<br>They stagger.",
          source: "Akashic Mysteries",
        },
      ],
    });
    await applyImportResolutions(sb, sheet, claims, [q], { questions: { "q-aka": false } });
    expect(sheet.rules.modules.some((m) => m.key === "akashic" && m.enabled)).toBe(false);
    expect(sheet.akashic?.veilsKnown.length ?? 0).toBe(0);
    const feature = sheet.features.list.find((f) => f.name === "Gorgon Mask");
    expect(feature).toMatchObject({ category: "special_ability", compendiumId: "3pp:gorgon-mask" });
    expect(feature!.description).toBe("Your gaze slows enemies.\nThey stagger.");
    expect(sheet.spellcasting.knownSpells).toHaveLength(0); // moved, not duplicated or dropped
  });

  it("normalizes '<br>' compendium text, refuses variant PP costs, and reads the junction level", async () => {
    const sheet = createDefaultCharacter();
    sheet.rules.modules.push({ key: "psionics", enabled: true, settings: {} });
    sheet.psionics = {
      classes: [
        { id: "pc1", className: "Psion", manifesterLevel: 7, keyAbility: "int", basePowerPoints: 35, discipline: "generalist" },
      ],
      powersKnown: [],
    };
    const claims: ImportClaim[] = [
      {
        id: "c-pow",
        kind: "psionic_power",
        sourceKind: "trait", // mined notes entries arrive as trait-sourced claims
        sourceText: "Energy Missile",
        sourceLabel: "Notes field",
        matchKey: "Energy Missile",
        candidates: [{ table: "psionic_power_compendium", slug: "energy-missile", name: "Energy Missile", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "psionic_power_compendium", slug: "energy-missile" },
        mined: true,
        // NO level — mined powers never carry a slot level; the junction supplies the real one.
      },
    ];
    const sb = fakeSb({
      psionic_power_compendium: [
        {
          slug: "energy-missile",
          name: "Energy Missile",
          discipline: "Psychokinesis<br>Clairsentience",
          power_points: "3 (dread), 5 (psion/wilder)",
          target_area_effect: "Area: 20-ft.-radius spread",
          description: "Two or more creatures.<br><br>You unleash missiles of energy.",
          augment: "For every 2 additional power points…<br>Also this.",
          special: "Kineticists may learn this power<br>as a 2nd-level power.",
        },
      ],
      psionic_power_class_level: [
        { power: "Energy Missile", class: "Psion/Wilder", level: "2" },
        { power: "Energy Missile", class: "Dread", level: "1" },
      ],
    });
    await applyImportResolutions(sb, sheet, claims, [], {});
    const power = sheet.psionics!.powersKnown.find((p) => p.name === "Energy Missile")!;
    expect(power).toBeTruthy();
    // "<br>" rich text → the same plain-text shape the picker caches.
    expect(power.discipline).toBe("Psychokinesis; Clairsentience");
    expect(power.description).toBe("Two or more creatures.\n\nYou unleash missiles of energy.");
    expect(power.augment).toBe("For every 2 additional power points…\nAlso this.");
    expect(power.special).toBe("Kineticists may learn this power\nas a 2nd-level power.");
    expect(power.targetAreaEffect).toBe("Area: 20-ft.-radius spread");
    expect(JSON.stringify(power)).not.toContain("<br>");
    // Per-class-variant PP text must never cache the (possibly wrong) leading number.
    expect(power.ppCost).toBeUndefined();
    // The junction level, preferring the sheet's own manifester class (Psion → 2), NOT the
    // global minimum (Dread → 1) and NOT the level-1 default.
    expect(power.level).toBe(2);
  });

  it("junction level falls back to the lowest ANY-class level, then to 1", async () => {
    const claim = (id: string, slug: string, name: string): ImportClaim => ({
      id,
      kind: "psionic_power",
      sourceKind: "trait",
      sourceText: name,
      sourceLabel: "Notes field",
      matchKey: name,
      candidates: [{ table: "psionic_power_compendium", slug, name, match: "exact" }],
      confidence: "high",
      resolution: { mode: "linked", table: "psionic_power_compendium", slug },
      mined: true,
    });
    const sheet = createDefaultCharacter();
    sheet.rules.modules.push({ key: "psionics", enabled: true, settings: {} });
    // No manifester classes on the sheet → no "mine" preference is possible.
    const sb = fakeSb({
      psionic_power_compendium: [
        { slug: "psychic-crush", name: "Psychic Crush", discipline: "Telepathy", power_points: "9" },
        { slug: "mystery-power", name: "Mystery Power", discipline: "Telepathy", power_points: "1" },
      ],
      psionic_power_class_level: [
        { power: "Psychic Crush", class: "Psion/Wilder", level: "5" },
        { power: "Psychic Crush", class: "Tactician", level: "6" },
        // Mystery Power has NO junction rows at all.
      ],
    });
    await applyImportResolutions(
      sb,
      sheet,
      [claim("c1", "psychic-crush", "Psychic Crush"), claim("c2", "mystery-power", "Mystery Power")],
      [],
      {},
    );
    const crush = sheet.psionics!.powersKnown.find((p) => p.name === "Psychic Crush")!;
    expect(crush.level).toBe(5); // lowest across all classes
    expect(crush.ppCost).toBe(9); // bare integer still caches
    const mystery = sheet.psionics!.powersKnown.find((p) => p.name === "Mystery Power")!;
    expect(mystery.level).toBe(1); // no junction data → the schema default
  });

  it("module-off features fallback normalizes '<br>' descriptions too", async () => {
    const sheet = createDefaultCharacter();
    const claims: ImportClaim[] = [
      {
        id: "c-pow",
        kind: "psionic_power",
        sourceKind: "trait",
        sourceText: "Mind Thrust",
        sourceLabel: "Notes field",
        matchKey: "Mind Thrust",
        candidates: [{ table: "psionic_power_compendium", slug: "mind-thrust", name: "Mind Thrust", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "psionic_power_compendium", slug: "mind-thrust" },
        mined: true,
      },
    ];
    const sb = fakeSb({
      psionic_power_compendium: [
        { slug: "mind-thrust", name: "Mind Thrust", discipline: "Telepathy", power_points: "1", description: "A massive assault.<br>It hurts." },
      ],
    });
    await applyImportResolutions(sb, sheet, claims, [], {});
    const feature = sheet.features.list.find((f) => f.name === "Mind Thrust")!;
    expect(feature.description).toBe("A massive assault.\nIt hurts.");
  });

  it("applies question answers with zero claims (mythic 'No' clears the variant)", async () => {
    const sheet = createDefaultCharacter();
    sheet.rules.variants.mythic = true;
    const q: ImportQuestion = { id: "q-m", kind: "mythic", text: "keep mythic?", defaultAnswer: true };
    await applyImportResolutions(fakeSb({}), sheet, [], [q], { questions: { "q-m": false } });
    expect(sheet.rules.variants.mythic).toBeUndefined();
  });
});

describe("hyphen folding — 'Two Weapon Fighting' vs the book's 'Two-Weapon Fighting'", () => {
  it("promotes the ranked-search hit to an exact auto-link", async () => {
    const probe: ClaimProbe = {
      id: "p1",
      kind: "feat",
      sourceText: "Oath 2:Two Weapon Fighting",
      sourceLabel: "Feat slot",
      keys: ["Two Weapon Fighting"],
    };
    const sb = {
      ...fakeSb({}),
      rpc: async () => ({
        data: [{ slug: "two-weapon-fighting", name: "Two-Weapon Fighting", types: "Combat", source: "CRB" }],
        error: null,
      }),
    };
    const out = await resolveProbeCandidates(sb, [probe]);
    expect(out.p1![0]).toMatchObject({ match: "exact", name: "Two-Weapon Fighting" });
    const { claims } = assembleClaims({ probes: [probe], questions: [] }, out);
    expect(claims[0]!.confidence).toBe("high");
    expect(claims[0]!.resolution).toMatchObject({ mode: "linked", slug: "two-weapon-fighting" });
  });

  it("rescues the row via the punctuation-insensitive probe when the ranked search misses it", async () => {
    const probe: ClaimProbe = {
      id: "p1",
      kind: "feat",
      sourceText: "Anti 7: Improved Two Weapon Fighting",
      sourceLabel: "Feat slot",
      keys: ["Improved Two Weapon Fighting"],
    };
    // The RPC returns only text-mention noise (the real prod behavior); the wildcard ilike
    // fallback must find the true row and promote it on normalized equality.
    const sb = {
      ...fakeSb({
        feat_compendium: [
          { slug: "improved-two-weapon-fighting", name: "Improved Two-Weapon Fighting", types: "Combat", source: "CRB" },
        ],
      }),
      rpc: async () => ({
        data: [{ slug: "two-weapon-grace", name: "Two-Weapon Grace", types: "Combat", source: "ACG" }],
        error: null,
      }),
    };
    const out = await resolveProbeCandidates(sb, [probe]);
    const exact = out.p1!.find((c) => c.match === "exact");
    expect(exact).toMatchObject({ name: "Improved Two-Weapon Fighting", slug: "improved-two-weapon-fighting" });
    const { claims } = assembleClaims({ probes: [probe], questions: [] }, out);
    expect(claims[0]!.resolution).toMatchObject({ mode: "linked", slug: "improved-two-weapon-fighting" });
  });
});

describe("class-grant echo dedup", () => {
  it("drops slots that only repeat granted features; partial matches and explicit keeps survive", async () => {
    const sheet = createDefaultCharacter();
    sheet.identity.classes = [{ id: "cls1", name: "UCRogue 20", level: 20 }];
    sheet.identity.totalLevel = 20;
    sheet.feats.list = [
      { id: "f1", name: "Sneak attack (1/3/5/7/9/11/13/15/17/19)", tags: [], automation: [] },
      { id: "f2", name: "1. Trapfinding, 2. Evasion (Ex)", tags: [], automation: [] },
      // Steal Time is a 3pp archetype feature — NOT granted → the slot must survive.
      { id: "f3", name: "8. Improved Uncanny Dodge, 10. Steal Time (Su)", tags: [], automation: [] },
      // The player explicitly clicked "Keep as written" on this one.
      { id: "f4", name: "Trapfinding", tags: [], automation: [] },
    ];
    const claims: ImportClaim[] = [
      classClaim({
        id: "c-rogue",
        sourceText: "UCRogue",
        level: 20,
        resolution: { mode: "linked", table: "class_compendium", slug: "rogue-unchained" },
        candidates: [{ table: "class_compendium", slug: "rogue-unchained", name: "Rogue (Unchained)", match: "exact" }],
      }),
      {
        id: "c-f4",
        kind: "feat",
        sourceKind: "feat",
        sourceText: "Trapfinding",
        sourceLabel: "Feat slot",
        matchKey: "Trapfinding",
        candidates: [],
        confidence: "low",
        resolution: { mode: "generic" },
        draftEntryId: "f4",
      },
    ];
    const sb = fakeSb({
      class_compendium: [
        { slug: "rogue-unchained", name: "Rogue (Unchained)", hit_die: "d8", class_skills: "", skill_points_per_level: "8", role: "", source: "PU" },
      ],
      class_feature_compendium: [
        { slug: "ru-sneak", feature: "Sneak Attack", class: "Rogue (Unchained)", level: 1, type: "Ex", description: "", category: "Main" },
        { slug: "ru-trap", feature: "Trapfinding", class: "Rogue (Unchained)", level: 1, type: null, description: "", category: "Main" },
        { slug: "ru-evasion", feature: "Evasion", class: "Rogue (Unchained)", level: 2, type: "Ex", description: "", category: "Main" },
        { slug: "ru-iud", feature: "Improved Uncanny Dodge", class: "Rogue (Unchained)", level: 8, type: "Ex", description: "", category: "Main" },
      ],
    });
    const answers: ClaimAnswers = { resolutions: { "c-f4": { mode: "generic" } } };
    const report = await applyImportResolutions(sb, sheet, claims, [], answers);
    const names = sheet.feats.list.map((f) => f.name);
    expect(names).not.toContain("Sneak attack (1/3/5/7/9/11/13/15/17/19)");
    expect(names).not.toContain("1. Trapfinding, 2. Evasion (Ex)");
    expect(names).toContain("8. Improved Uncanny Dodge, 10. Steal Time (Su)");
    expect(names).toContain("Trapfinding");
    const covered = (sheet.metadata.unmapped as { covered_by_features?: string[] }).covered_by_features ?? [];
    expect(covered).toHaveLength(2);
    // The granted rows exist as structured features (the "granted row wins" half of the contract).
    expect(sheet.features.list.some((f) => f.name.startsWith("Sneak Attack"))).toBe(true);
    expect(report.applied.some((a) => a.includes("duplicating structured features"))).toBe(true);
  });

  it("preserves CHOICE qualifiers onto the granted feature instead of losing them (Hex picks)", async () => {
    const sheet = createDefaultCharacter();
    sheet.identity.classes = [{ id: "cls1", name: "Witch 8", level: 8 }];
    sheet.identity.totalLevel = 8;
    sheet.feats.list = [{ id: "f1", name: "Hex (Evil Eye), Hex (Slumber)", tags: [], automation: [] }];
    const claims: ImportClaim[] = [
      classClaim({
        id: "c-witch",
        sourceText: "Witch",
        level: 8,
        resolution: { mode: "linked", table: "class_compendium", slug: "witch" },
        candidates: [{ table: "class_compendium", slug: "witch", name: "Witch", match: "exact" }],
      }),
    ];
    const sb = fakeSb({
      class_compendium: [
        { slug: "witch", name: "Witch", hit_die: "d6", class_skills: "", skill_points_per_level: "2", role: "", source: "APG" },
      ],
      class_feature_compendium: [
        { slug: "witch-hex", feature: "Hex", class: "Witch", level: 1, type: "Su", description: "A witch learns hexes.", category: "Main" },
      ],
    });
    await applyImportResolutions(sb, sheet, claims, [], {});
    // The echo slot is removed, but the CHOICES survive on the granted Hex feature.
    expect(sheet.feats.list.map((f) => f.name)).not.toContain("Hex (Evil Eye), Hex (Slumber)");
    const hex = sheet.features.list.find((f) => f.name.startsWith("Hex"))!;
    expect(hex.description).toContain("Hex (Evil Eye)");
    expect(hex.description).toContain("Hex (Slumber)");
  });

  it("never echo-deletes an entry whose claim resolved LINKED but failed to apply, nor data-carrying entries", async () => {
    const sheet = createDefaultCharacter();
    sheet.identity.classes = [{ id: "cls1", name: "Monk 8", level: 8 }];
    sheet.identity.totalLevel = 8;
    sheet.feats.list = [
      // Explicitly linked in Verify; the (empty) feat_compendium makes the link fail at commit.
      { id: "f1", name: "Stunning Fist", tags: [], automation: [] },
      // Carries its own data — not a bare echo even though the name matches a grant.
      { id: "f2", name: "Evasion", type: "Class Feature", tags: [], automation: [] },
    ];
    const claims: ImportClaim[] = [
      classClaim({
        id: "c-monk",
        sourceText: "Monk",
        level: 8,
        resolution: { mode: "linked", table: "class_compendium", slug: "monk" },
        candidates: [{ table: "class_compendium", slug: "monk", name: "Monk", match: "exact" }],
      }),
      {
        id: "c-f1",
        kind: "feat",
        sourceKind: "feat",
        sourceText: "Stunning Fist",
        sourceLabel: "Feat slot",
        matchKey: "Stunning Fist",
        candidates: [{ table: "feat_compendium", slug: "stunning-fist", name: "Stunning Fist", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "feat_compendium", slug: "stunning-fist" },
        draftEntryId: "f1",
      },
    ];
    const sb = fakeSb({
      class_compendium: [
        { slug: "monk", name: "Monk", hit_die: "d8", class_skills: "", skill_points_per_level: "4", role: "", source: "CRB" },
      ],
      class_feature_compendium: [
        { slug: "monk-sf", feature: "Stunning Fist", class: "Monk", level: 1, type: "Ex", description: "", category: "Main" },
        { slug: "monk-evasion", feature: "Evasion", class: "Monk", level: 2, type: "Ex", description: "", category: "Main" },
      ],
      // feat_compendium intentionally EMPTY → the explicit link fails, entry stays unlinked.
    });
    await applyImportResolutions(sb, sheet, claims, [], {});
    const names = sheet.feats.list.map((f) => f.name);
    expect(names).toContain("Stunning Fist"); // linked-but-failed → kept as written, not echo-deleted
    expect(names).toContain("Evasion"); // data-carrying entry → never an echo
  });

  it("hyphen-sibling traits with DIFFERENT compendium rows both fit on the sheet", async () => {
    const sheet = createDefaultCharacter();
    sheet.traits.list = [
      { id: "t1", name: "Thrill Seeker", compendiumId: "thrill-seeker-campaign", automation: [] },
    ];
    const claims: ImportClaim[] = [
      {
        id: "c-t",
        kind: "trait",
        sourceKind: "trait",
        sourceText: "Thrill-Seeker",
        sourceLabel: "Notes field",
        matchKey: "Thrill-Seeker",
        candidates: [{ table: "trait_compendium", slug: "thrill-seeker-religion", name: "Thrill-Seeker", match: "exact" }],
        confidence: "high",
        resolution: { mode: "linked", table: "trait_compendium", slug: "thrill-seeker-religion" },
        mined: true,
      },
    ];
    const sb = fakeSb({
      trait_compendium: [{ slug: "thrill-seeker-religion", name: "Thrill-Seeker", type: "Religion", description: "" }],
    });
    await applyImportResolutions(sb, sheet, claims, [], {});
    // The folded names collide, but the compendium ids differ — both are real, distinct traits.
    expect(sheet.traits.list).toHaveLength(2);
  });
});

describe("review findings — Vehti pass hardening", () => {
  it("never removes a multi-spell slot when the batch failed to apply its items", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "0: Create Water, Detect Magic", level: 0 }];
    const u1 = "11111111-1111-4111-8111-111111111111";
    const part = (id: string, text: string): ImportClaim => ({
      id,
      kind: "spell",
      sourceKind: "spell",
      sourceText: text,
      sourceLabel: "Spells field · line item",
      matchKey: text,
      candidates: [{ table: "spell_compendium", slug: u1, name: text, match: "exact" }],
      confidence: "high",
      resolution: { mode: "linked", table: "spell_compendium", slug: u1 },
      mined: true,
      partOf: "sp1",
      partCount: 2,
      level: 0,
    });
    // spell_compendium EMPTY → the batch returns no rows → nothing applied → slot must survive.
    await applyImportResolutions(fakeSb({}), sheet, [part("c1", "Create Water"), part("c2", "Detect Magic")], [], {});
    expect(sheet.spellcasting.knownSpells.map((s) => s.name)).toContain("0: Create Water, Detect Magic");
  });

  it("an explicit 'Keep as written' on the slot wins over item extraction", async () => {
    const sheet = createDefaultCharacter();
    sheet.spellcasting.knownSpells = [{ id: "sp1", name: "0: Create Water, Detect Magic", level: 0 }];
    const u1 = "11111111-1111-4111-8111-111111111111";
    const u2 = "22222222-2222-4222-8222-222222222222";
    const part = (id: string, text: string, slug: string): ImportClaim => ({
      id,
      kind: "spell",
      sourceKind: "spell",
      sourceText: text,
      sourceLabel: "Spells field · line item",
      matchKey: text,
      candidates: [{ table: "spell_compendium", slug, name: text, match: "exact" }],
      confidence: "high",
      resolution: { mode: "linked", table: "spell_compendium", slug },
      mined: true,
      partOf: "sp1",
      partCount: 2,
      level: 0,
    });
    const whole: ImportClaim = {
      id: "c-slot",
      kind: "spell",
      sourceKind: "spell",
      sourceText: "0: Create Water, Detect Magic",
      sourceLabel: "Spells field",
      matchKey: "Create Water",
      candidates: [],
      confidence: "low",
      resolution: { mode: "generic" },
      draftEntryId: "sp1",
    };
    const sb = fakeSb({
      spell_compendium: [
        { id: u1, name: "Create Water", school: "conjuration" },
        { id: u2, name: "Detect Magic", school: "divination" },
      ],
    });
    const answers: ClaimAnswers = { resolutions: { "c-slot": { mode: "generic" } } }; // explicit keep
    await applyImportResolutions(sb, sheet, [whole, part("c1", "Create Water", u1), part("c2", "Detect Magic", u2)], [], answers);
    expect(sheet.spellcasting.knownSpells.map((s) => s.name)).toContain("0: Create Water, Detect Magic");
  });

  it("compound 'Name: A, B' entries re-file as DISTINCT features, not merged onto the shared prefix", async () => {
    const sheet = createDefaultCharacter();
    sheet.feats.list = [
      { id: "f1", name: "5. Lotus Style: Bloom, Purity of Body", tags: [], automation: [] },
      { id: "f2", name: "9. Lotus Style: Branch, Improved Evasion", tags: [], automation: [] },
    ];
    const claim = (id: string, text: string, entryId: string): ImportClaim => ({
      id,
      kind: "feat",
      sourceKind: "feat",
      sourceText: text,
      sourceLabel: "Feat slot",
      matchKey: text,
      candidates: [],
      confidence: "low",
      resolution: { mode: "generic" },
      draftEntryId: entryId,
      context: "feature",
    });
    await applyImportResolutions(
      fakeSb({}),
      sheet,
      [claim("c1", "5. Lotus Style: Bloom, Purity of Body", "f1"), claim("c2", "9. Lotus Style: Branch, Improved Evasion", "f2")],
      [],
      {},
    );
    const names = sheet.features.list.map((f) => f.name);
    expect(names).toContain("Lotus Style: Bloom, Purity of Body");
    expect(names).toContain("Lotus Style: Branch, Improved Evasion");
    expect(names).not.toContain("Lotus Style"); // never collapsed onto the shared prefix
  });
});

describe("group-owned single exacts don't cross owners", () => {
  const probeReport = () => ({
    probes: [
      { id: "p-race", kind: "race" as const, sourceText: "Being of Ib (-4 Str/-2 Con/+4 Wis)", sourceLabel: "Race", keys: ["Being of Ib"] },
      {
        id: "p-llv",
        kind: "feat" as const,
        sourceText: "Low-Light Vision",
        sourceLabel: "Feat slot · line item",
        keys: ["Low-Light Vision"],
        context: "racial_trait" as const,
        mined: true,
        partOf: "f9",
        partCount: 3,
      },
    ],
    questions: [],
  });

  it("demotes a single-exact alt racial trait belonging to ANOTHER race", async () => {
    const { assembleClaims: assemble } = await import("@/lib/character/import-claims");
    const { claims } = assemble(probeReport(), {
      "p-llv": [
        { table: "alternate_racial_trait_compendium", slug: "dwarves-llv", name: "Low-Light Vision", group: "Dwarves", match: "exact" },
      ],
    });
    const llv = claims.find((c) => c.id === "p-llv")!;
    expect(llv.resolution.mode).toBe("skipped"); // mined default — the Dwarves row is offered, not applied
    expect(llv.confidence).toBe("medium");
    expect(llv.candidates).toHaveLength(1);
  });

  it("still links when the row belongs to the sheet's own race (plural fold)", async () => {
    const { assembleClaims: assemble } = await import("@/lib/character/import-claims");
    const { claims } = assemble(probeReport(), {
      "p-llv": [
        { table: "alternate_racial_trait_compendium", slug: "ib-voiceless", name: "Low-Light Vision", group: "Beings of Ib", match: "exact" },
      ],
    });
    expect(claims.find((c) => c.id === "p-llv")!.resolution.mode).toBe("linked");
  });
});

describe("strict-before-folded promotion", () => {
  it("promotes only the punctuation-faithful sibling when both hyphen variants come back", async () => {
    const probe: ClaimProbe = {
      id: "p1",
      kind: "trait",
      sourceText: "natural born leader",
      sourceLabel: "Notes field",
      keys: ["natural born leader"],
      mined: true,
    };
    const sb = {
      ...fakeSb({}),
      rpc: async () => ({
        data: [
          { slug: "natural-born-leader-campaign", name: "Natural Born Leader", type: "Campaign", category: "", source: "HR" },
          { slug: "natural-born-leader-social", name: "Natural-Born Leader", type: "Social", category: "", source: "UC" },
        ],
        error: null,
      }),
    };
    const out = await resolveProbeCandidates(sb, [probe]);
    const exacts = out.p1!.filter((c) => c.match === "exact");
    expect(exacts).toHaveLength(1);
    expect(exacts[0]!.name).toBe("Natural Born Leader"); // the typed punctuation wins alone
  });
});
