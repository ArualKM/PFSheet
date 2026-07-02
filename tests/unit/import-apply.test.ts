import { describe, it, expect } from "vitest";
import { createDefaultCharacter, isGestalt, type PathForgeCharacterV1 } from "@pathforge/schema";
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
