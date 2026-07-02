import { describe, it, expect } from "vitest";
import { createDefaultCharacter, isGestalt, type PathForgeCharacterV1 } from "@pathforge/schema";
import { applyImportResolutions, type ClaimAnswers } from "@/lib/character/import-apply";
import type { ImportClaim, ImportQuestion } from "@/lib/character/import-claims";

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

  it("applies question answers with zero claims (mythic 'No' clears the variant)", async () => {
    const sheet = createDefaultCharacter();
    sheet.rules.variants.mythic = true;
    const q: ImportQuestion = { id: "q-m", kind: "mythic", text: "keep mythic?", defaultAnswer: true };
    await applyImportResolutions(fakeSb({}), sheet, [], [q], { questions: { "q-m": false } });
    expect(sheet.rules.variants.mythic).toBeUndefined();
  });
});
