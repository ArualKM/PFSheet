import {
  isGestalt,
  gestaltLevel,
  recomputeClassDerived,
  MYTHIC_PATHS,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import {
  applyCompendiumClass,
  applyArchetype,
  applyRace,
  parseAbilityMods,
  seedsToAutomationEffects,
  type ArchetypeFeatureRow,
} from "@pathforge/rules-pf1e";
import { buildClassInput, buildFeatureRows, casterDefaults, type ClassCompendiumRow } from "./class-compendium";
import {
  isDivider,
  normalizeKey,
  pickClassCandidate,
  KIND_TABLES,
  type ImportClaim,
  type ImportQuestion,
  type ClaimResolution,
} from "./import-claims";

/**
 * Commit-time application of verified import claims (docs/IMPORT_VERIFICATION_PLAN.md). Runs
 * server-side on the job's stored draft: the client sends only RESOLUTION OVERRIDES (which
 * candidate/mode per claim id, question answers, class levels) — the claims themselves are
 * re-read from the job row, so a tampered client can at most pick public compendium rows for
 * its own character.
 *
 * Order matters: race → classes (level-by-level features) → archetypes (replace) → feats/traits/
 * spells (link + re-file) → mined additions → module toggles + a final class-derived recompute.
 * Skipped entries are preserved under metadata.unmapped (never silently discarded).
 */

export type ClaimAnswers = {
  /** Claim id → the player's final resolution (defaults from the stored claim when absent). */
  resolutions?: Record<string, ClaimResolution>;
  /** Question id → answer (defaults to the stored defaultAnswer). */
  questions?: Record<string, boolean>;
  /** Class claim id → level to apply at (defaults to the stored claim.level). */
  classLevels?: Record<string, number>;
};

export type ApplyReport = {
  applied: string[];
  warnings: string[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const S = (v: unknown): string => (v == null ? "" : String(v));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client-supplied values are untrusted JSON — a non-numeric level must never become NaN in
 * sheet_data (JSON serializes NaN to null, bricking the character on its next parse). */
function clampLevel(v: unknown, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(20, n) : fallback;
}

function resolved(claim: ImportClaim, answers: ClaimAnswers): ClaimResolution {
  return answers.resolutions?.[claim.id] ?? claim.resolution;
}

/** The chosen candidate for a linked resolution — validated against the claim's own candidate list
 * plus the claim's kind tables, so an arbitrary client value can't point at an unrelated table. */
function linkedSlug(claim: ImportClaim, res: ClaimResolution): { table: string; slug: string } | null {
  if (res.mode !== "linked") return null;
  const cand = claim.candidates.find((c) => c.table === res.table && c.slug === res.slug);
  if (cand) return { table: cand.table, slug: cand.slug };
  // A search-corrected pick (from the Verify step's search box) won't be in candidates — accept
  // it only for tables this claim's source or current kind may target.
  const allowed = new Set([...(KIND_TABLES[claim.sourceKind] ?? []), ...(KIND_TABLES[claim.kind] ?? [])]);
  return res.table && res.slug && allowed.has(res.table) ? { table: res.table, slug: res.slug } : null;
}

export async function applyImportResolutions(
  sb: Sb,
  sheet: PathForgeCharacterV1,
  claims: ImportClaim[],
  questions: ImportQuestion[],
  answers: ClaimAnswers,
): Promise<ApplyReport> {
  const applied: string[] = [];
  const warnings: string[] = [];
  const unmappedSkipped: string[] = [];
  const answerOf = (q: ImportQuestion) => answers.questions?.[q.id] ?? q.defaultAnswer;

  // ── Questions: module toggles ───────────────────────────────────────────────
  const gestaltQ = questions.find((q) => q.kind === "gestalt");
  const wantGestalt = gestaltQ ? answerOf(gestaltQ) : false;
  const mythicQ = questions.find((q) => q.kind === "mythic");
  if (mythicQ && !answerOf(mythicQ)) {
    sheet.rules.variants.mythic = undefined;
    applied.push("Mythic module disabled per your answer");
  }

  // The core-vs-Unchained answers re-pick each class claim's candidate (an explicit per-claim
  // resolution from the player still wins — it lives in answers.resolutions and is read first).
  for (const q of questions.filter((x) => x.kind === "unchained")) {
    const want = answerOf(q);
    for (const claim of claims.filter((c) => c.kind === "class" && c.unchainedQuestionId === q.id)) {
      if (answers.resolutions?.[claim.id]) continue;
      const pick = pickClassCandidate(claim.candidates, want);
      if (pick) claim.resolution = { mode: "linked", table: pick.table, slug: pick.slug, name: pick.name };
    }
  }

  // ── Race ────────────────────────────────────────────────────────────────────
  const raceClaim = claims.find((c) => c.kind === "race");
  const raceLink = raceClaim ? linkedSlug(raceClaim, resolved(raceClaim, answers)) : null;
  if (raceClaim && raceLink) {
    try {
      const { data: row } = await sb.from("race_compendium").select("slug,name").eq("slug", raceLink.slug).maybeSingle();
      if (row) {
        const { data: trait } = await sb
          .from("race_trait_compendium")
          .select("ability_modifiers,size,speed,standard_traits")
          .eq("race", row.name)
          .maybeSingle();
        const speed = trait?.speed ? parseInt(String(trait.speed), 10) : undefined;
        applyRace(sheet, {
          race: { name: S(row.name), compendiumId: S(row.slug) },
          abilityMods: parseAbilityMods(trait?.ability_modifiers),
          size: trait?.size ? S(trait.size).toLowerCase() : undefined,
          speed: Number.isFinite(speed) ? speed : undefined,
          standardTraits: trait?.standard_traits ?? undefined,
        });
        applied.push(`Race: ${S(row.name)}`);
      }
    } catch {
      warnings.push(`Couldn't apply the race "${raceClaim.sourceText}" — it was kept as written.`);
    }
  }

  // ── Classes ─────────────────────────────────────────────────────────────────
  const classClaims = claims.filter((c) => c.kind === "class");
  const linkedClassClaims = classClaims.filter((c) => resolved(c, answers).mode === "linked");
  // Applied-class ids by claim id (archetype claims attach to these).
  const classIdByClaim = new Map<string, string>();
  const levelOf = (c: ImportClaim) =>
    answers.classLevels?.[c.id] != null ? clampLevel(answers.classLevels[c.id], c.level ?? 1) : clampLevel(c.level ?? 1, 1);
  /** True when this claim carried a REAL level (stated on the line or set by the player) — a
   * defaulted 1 from an unknown (0) level must not silently rewrite totalLevel. */
  const hasRealLevel = (c: ImportClaim) => {
    const raw = answers.classLevels?.[c.id];
    if (raw != null && Number.isFinite(Number(raw)) && Number(raw) >= 1) return true;
    return (c.level ?? 0) >= 1;
  };
  // "A || B": each side of the gestalt line is one track. Segments carry their parsed track
  // ("Fighter 5/Wizard 5 || Rogue 10" = Fighter+Wizard on a, Rogue on b); older stored claims
  // without one fall back to "first claim a, rest b".
  const trackOf = new Map(
    classClaims.map((c, i) => [c.id, wantGestalt ? (c.track ?? (i > 0 ? ("b" as const) : ("a" as const))) : undefined]),
  );

  if (linkedClassClaims.length > 0) {
    // Remove the adapter's raw class-line entries that the claims cover — the appliers add
    // structured rows in their place. Generic-resolved segments are re-added below.
    const coveredIds = new Set(classClaims.map((c) => c.draftEntryId).filter(Boolean) as string[]);
    sheet.identity.classes = sheet.identity.classes.filter((c) => !coveredIds.has(c.id));

    for (const claim of linkedClassClaims) {
      const link = linkedSlug(claim, resolved(claim, answers));
      const level = levelOf(claim);
      const trackB = trackOf.get(claim.id) === "b";
      if (!hasRealLevel(claim)) {
        warnings.push(`The class "${claim.sourceText}" had no level — it was applied at level 1; fix it in the editor.`);
      }
      try {
        if (!link) throw new Error("invalid resolution");
        const { data: row } = await sb
          .from("class_compendium")
          .select("slug,name,hit_die,class_skills,skill_points_per_level,role,source")
          .eq("slug", link.slug)
          .maybeSingle();
        if (!row) throw new Error("missing class row");
        const [{ data: prog }, { data: feats }] = await Promise.all([
          sb.from("class_progression").select("json_data").eq("class", row.name).maybeSingle(),
          sb
            .from("class_feature_compendium")
            .select("slug,feature,level,type,description")
            .eq("class", row.name)
            .eq("category", "Main"),
        ]);
        const featureNames = ((feats ?? []) as { feature: string }[]).map((f) => f.feature);
        const { data: fx } = featureNames.length
          ? await sb
              .from("feature_effect")
              .select("feature,target,op,value_or_formula,bonus_type,notes")
              .in("feature", featureNames)
          : { data: [] };
        const input = buildClassInput(row as ClassCompendiumRow, prog?.json_data ?? null, casterDefaults(S(row.name)));
        const result = applyCompendiumClass(sheet, {
          input,
          level,
          hpMethod: "manual",
          features: buildFeatureRows((feats ?? []) as never, (fx ?? []) as never),
        });
        warnings.push(...result.warnings);
        const appliedRow = sheet.identity.classes.find((c) => c.compendiumId === input.key);
        if (appliedRow) {
          classIdByClaim.set(claim.id, appliedRow.id);
          if (trackB) appliedRow.track = "b";
        }
        applied.push(`Class: ${S(row.name)} ${level}${result.featuresAdded.length ? ` (+${result.featuresAdded.length} features)` : ""}`);
      } catch {
        warnings.push(`Couldn't apply the class "${claim.sourceText}" — it was kept as written.`);
        // Keep the gestalt track on the fallback too, or gestaltLevel() sums both classes onto
        // one track (the totalLevel=40 bug, error-path edition).
        sheet.identity.classes.push({
          id: `import_${claim.id}`,
          name: claim.sourceText,
          level,
          ...(trackB ? { track: "b" as const } : {}),
        });
      }
    }
    // Generic class segments from the same line come back as plain entries (tracked, for gestalt);
    // skipped segments are preserved under metadata.unmapped like every other skip.
    for (const claim of classClaims) {
      const mode = resolved(claim, answers).mode;
      if (mode === "generic") {
        sheet.identity.classes.push({
          id: `import_${claim.id}`,
          name: claim.sourceText,
          level: levelOf(claim),
          ...(trackOf.get(claim.id) === "b" ? { track: "b" as const } : {}),
        });
      } else if (mode === "skipped") {
        unmappedSkipped.push(hasRealLevel(claim) ? `${claim.sourceText} (level ${levelOf(claim)})` : claim.sourceText);
      }
    }
  }

  // ── Archetypes (need their parent class applied) ───────────────────────────
  for (const claim of claims.filter((c) => c.kind === "archetype")) {
    const res = resolved(claim, answers);
    const link = linkedSlug(claim, res);
    if (!link) continue;
    const classId = claim.parentClassClaimId ? classIdByClaim.get(claim.parentClassClaimId) : undefined;
    if (!classId) {
      warnings.push(`Archetype "${claim.sourceText}" wasn't applied — its class wasn't linked.`);
      continue;
    }
    try {
      const { data: arch } = await sb.from("archetype_compendium").select("slug,name,class").eq("slug", link.slug).maybeSingle();
      if (!arch) throw new Error("missing archetype row");
      const { data: rows } = await sb
        .from("archetype_feature_compendium")
        .select("slug,archetype,class,feature,type,level,replaces,text")
        .eq("archetype", arch.name);
      const result = applyArchetype(sheet, {
        classId,
        archetype: { name: S(arch.name), compendiumId: S(arch.slug) },
        features: (rows ?? []) as ArchetypeFeatureRow[],
      });
      if (result.conflicts.length) {
        warnings.push(`Archetype "${S(arch.name)}" conflicts with another archetype over: ${result.conflicts.join(", ")}.`);
      } else {
        applied.push(`Archetype: ${S(arch.name)} (replaces ${result.replaced.length}, adds ${result.added.length})`);
      }
    } catch {
      warnings.push(`Couldn't apply the archetype "${claim.sourceText}".`);
    }
  }

  /* ── Shared re-file / add helpers ──────────────────────────────────────────
   * A linked row can land in feats, features, traits, sphere talents, mythic abilities, or
   * racial-trait features regardless of which slot the SOURCE put the text in. Each helper
   * dedups and returns true when the target list now holds the entry (the caller then removes
   * the source entry from its original slot). */

  const addFeatFromRow = (c: ImportClaim, row: Record<string, unknown>): boolean => {
    if (!sheet.feats.list.some((f) => f.compendiumId === S(row.slug) || normalizeKey(f.name) === normalizeKey(S(row.name)))) {
      sheet.feats.list.push({
        id: `import_${c.id}`,
        name: S(row.name),
        type: S(row.types) || undefined,
        compendiumId: S(row.slug),
        benefit: S(row.benefit) || undefined,
        tags: [],
        automation: [],
      });
    }
    return true;
  };

  const addFeatureFromRow = (c: ImportClaim, row: Record<string, unknown>): boolean => {
    const lvl = Number(row.level);
    if (!sheet.features.list.some((f) => f.compendiumId === S(row.slug))) {
      sheet.features.list.push({
        id: `import_${c.id}`,
        name: row.type ? `${S(row.feature)} (${S(row.type)})` : S(row.feature),
        category: "class_feature",
        compendiumId: S(row.slug),
        ...(Number.isFinite(lvl) && lvl >= 1 ? { level: lvl } : {}),
        description: S(row.description) || undefined,
        automation: [],
      });
    }
    return true;
  };

  const addTraitFromRow = (c: ImportClaim, table: string, row: Record<string, unknown>): boolean => {
    if (!sheet.traits.list.some((t) => t.compendiumId === S(row.slug) || normalizeKey(t.name) === normalizeKey(S(row.name)))) {
      sheet.traits.list.push({
        id: `import_${c.id}`,
        name: S(row.name),
        type: table === "drawback_compendium" ? "drawback" : S((row as { type?: unknown }).type) || undefined,
        compendiumId: S(row.slug),
        description: S(row.description) || undefined,
        automation: [],
      });
    }
    return true;
  };

  const addSphereTalent = async (c: ImportClaim, slug: string): Promise<{ ok: boolean; name?: string }> => {
    const { data: row } = await sb
      .from("sphere_talents")
      .select("id,talent_name,sphere_name,talent_category")
      .eq("id", slug)
      .maybeSingle();
    if (!row) return { ok: false };
    if (!sheet.spheres) {
      sheet.spheres = { casterClasses: [], spheres: [], talents: [], drawbacks: [], boons: [], bonusSpellPoints: 0 };
    }
    const sph = sheet.spheres;
    let system: "Magic" | "Combat" | "Skill" = "Magic";
    try {
      const { data: sphereRow } = await sb
        .from("sphere_compendium")
        .select("name,system")
        .eq("name", S(row.sphere_name))
        .maybeSingle();
      const sys = S(sphereRow?.system);
      if (sys === "Combat" || sys === "Skill") system = sys;
    } catch {
      // default Magic
    }
    if (!sph.talents.some((t) => t.compendiumId === S(row.id) || normalizeKey(t.talentName) === normalizeKey(S(row.talent_name)))) {
      sph.talents.push({
        id: `import_${c.id}`,
        compendiumId: S(row.id),
        sphereName: S(row.sphere_name),
        talentName: S(row.talent_name),
        category: S(row.talent_category) || undefined,
        system,
      });
    }
    if (S(row.sphere_name) && !sph.spheres.some((s) => normalizeKey(s.name) === normalizeKey(S(row.sphere_name)))) {
      sph.spheres.push({ id: `import_sphere_${c.id}`, name: S(row.sphere_name), system });
    }
    const moduleKey = system === "Combat" ? "spheres_of_might" : system === "Skill" ? "spheres_of_guile" : "spheres_of_power";
    const existing = sheet.rules.modules.find((m) => m.key === moduleKey);
    if (existing) existing.enabled = true;
    else sheet.rules.modules.push({ key: moduleKey, enabled: true, settings: {} });
    return { ok: true, name: S(row.talent_name) };
  };

  const MYTHIC_PATH_SET = new Set<string>(MYTHIC_PATHS);
  const addMythicAbility = (c: ImportClaim, row: Record<string, unknown>): void => {
    const name = S(row.name);
    if (sheet.rules.variants.mythic) {
      if (!sheet.mythic) sheet.mythic = { tier: 0, path: "none", abilityBoosts: [], pathAbilities: [] };
      const path = S(row.path).toLowerCase();
      if (!sheet.mythic.pathAbilities.some((a) => normalizeKey(a.name) === normalizeKey(name))) {
        sheet.mythic.pathAbilities.push({
          id: `import_${c.id}`,
          name,
          category: path === "universal" ? "universal" : "path",
          ...(MYTHIC_PATH_SET.has(path) ? { path: path as (typeof MYTHIC_PATHS)[number] } : {}),
          description: S(row.description) || undefined,
        });
      }
    } else {
      // Mythic module off (or answered No) — keep the ability visible as a plain feature.
      if (!sheet.features.list.some((f) => normalizeKey(f.name) === normalizeKey(name))) {
        sheet.features.list.push({
          id: `import_${c.id}`,
          name,
          category: "special_ability",
          compendiumId: S(row.slug),
          description: S(row.description) || undefined,
          automation: [],
        });
      }
    }
  };

  /** Add the linked row to whichever list its table implies. Returns true when the entry now
   * exists there (the caller removes the source entry from its original slot). */
  const refileLinked = async (c: ImportClaim, link: { table: string; slug: string }): Promise<boolean> => {
    if (link.table === "feat_compendium") {
      const { data: row } = await sb.from("feat_compendium").select("slug,name,types,benefit").eq("slug", link.slug).maybeSingle();
      if (!row) return false;
      addFeatFromRow(c, row);
      applied.push(`Feat: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    if (link.table === "class_feature_compendium") {
      const { data: row } = await sb
        .from("class_feature_compendium")
        .select("slug,feature,class,level,type,description")
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      addFeatureFromRow(c, row);
      applied.push(`Class feature: ${S(row.feature)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    if (link.table === "trait_compendium" || link.table === "drawback_compendium") {
      const { data: row } = await sb
        .from(link.table)
        .select("slug,name,description" + (link.table === "trait_compendium" ? ",type" : ""))
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      addTraitFromRow(c, link.table, row);
      applied.push(`${link.table === "drawback_compendium" ? "Drawback" : "Trait"}: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    if (link.table === "sphere_talents") {
      const res = await addSphereTalent(c, link.slug);
      if (res.ok) applied.push(`Sphere talent: ${res.name}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return res.ok;
    }
    if (link.table === "mythic_path_ability_compendium") {
      const { data: row } = await sb
        .from("mythic_path_ability_compendium")
        .select("slug,name,path,type,description")
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      addMythicAbility(c, row);
      applied.push(`Mythic ability: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    if (link.table === "alternate_racial_trait_compendium") {
      const { data: row } = await sb
        .from("alternate_racial_trait_compendium")
        .select("slug,trait_name,race,description")
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      if (!sheet.features.list.some((f) => f.compendiumId === S(row.slug) || normalizeKey(f.name) === normalizeKey(S(row.trait_name)))) {
        sheet.features.list.push({
          id: `import_${c.id}`,
          name: S(row.trait_name),
          category: "racial_trait",
          compendiumId: S(row.slug),
          description: S(row.description) || undefined,
          automation: [],
        });
      }
      applied.push(`Racial trait: ${S(row.trait_name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    return false;
  };

  // ── Feat-slot claims: link / re-file / skip ────────────────────────────────
  const featClaims = claims.filter((c) => c.sourceKind === "feat" && !c.mined);
  const featSlugs = featClaims
    .map((c) => ({ c, link: linkedSlug(c, resolved(c, answers)) }))
    .filter((x) => x.link?.table === "feat_compendium");
  const featRowsBySlug = new Map<string, Record<string, unknown>>();
  if (featSlugs.length) {
    try {
      const { data, error } = await sb
        .from("feat_compendium")
        .select("slug,name,types,prerequisites,benefit,normal,special,mythic")
        .in("slug", featSlugs.map((x) => x.link!.slug));
      if (error) throw new Error(S(error.message));
      for (const r of (data ?? []) as Record<string, unknown>[]) featRowsBySlug.set(S(r.slug), r);
      const names = [...featRowsBySlug.values()].map((r) => S(r.name));
      const { data: fx } = names.length
        ? await sb.from("feat_effect").select("feat,target,op,value_or_formula,bonus_type,notes").in("feat", names)
        : { data: [] };
      const fxByFeat = new Map<string, unknown[]>();
      for (const e of (fx ?? []) as { feat: string }[]) {
        const list = fxByFeat.get(e.feat) ?? [];
        list.push(e);
        fxByFeat.set(e.feat, list);
      }
      for (const { c, link } of featSlugs) {
        const row = featRowsBySlug.get(link!.slug);
        const entry = sheet.feats.list.find((f) => f.id === c.draftEntryId);
        if (!row || !entry) continue;
        entry.name = S(row.name);
        entry.compendiumId = S(row.slug);
        entry.type = S(row.types) || undefined;
        entry.prerequisites = S(row.prerequisites) || undefined;
        entry.benefit = S(row.benefit) || undefined;
        entry.normal = S(row.normal) || undefined;
        entry.special = S(row.special) || undefined;
        if (sheet.rules.variants.mythic && S(row.mythic)) entry.mythicBenefit = S(row.mythic);
        const seeds = (fxByFeat.get(S(row.name)) ?? []) as never[];
        if (entry.automation.length === 0 && seeds.length) {
          entry.automation = seedsToAutomationEffects(
            seeds.map((e: never) => {
              const s = e as { target: string; op: string; value_or_formula: string; bonus_type: string | null; notes: string | null };
              return { target: s.target, op: s.op, valueOrFormula: s.value_or_formula, bonusType: s.bonus_type, notes: s.notes };
            }),
            S(row.slug),
          );
        }
        applied.push(`Feat: ${S(row.name)}`);
      }
    } catch {
      warnings.push("Some feats couldn't be linked to the compendium — they were kept as written.");
    }
  }

  // Re-filed feat-slot claims (class features / traits / talents misfiled into feat slots) + skips.
  for (const c of featClaims) {
    const res = resolved(c, answers);
    const link = linkedSlug(c, res);
    if (res.mode === "skipped") {
      const entry = sheet.feats.list.find((f) => f.id === c.draftEntryId);
      if (entry) {
        sheet.feats.list = sheet.feats.list.filter((f) => f.id !== c.draftEntryId);
        unmappedSkipped.push(c.sourceText);
      }
      continue;
    }
    if (!link || link.table === "feat_compendium") continue;
    const entry = sheet.feats.list.find((f) => f.id === c.draftEntryId);
    if (!entry) continue;
    try {
      if (await refileLinked(c, link)) {
        sheet.feats.list = sheet.feats.list.filter((f) => f.id !== c.draftEntryId);
      }
    } catch {
      warnings.push(`Couldn't re-file "${c.sourceText}" — it stayed in the feat list.`);
    }
  }

  // ── Trait claims (parsed + mined) ──────────────────────────────────────────
  for (const c of claims.filter((cl) => cl.sourceKind === "trait")) {
    const res = resolved(c, answers);
    if (res.mode === "skipped") continue; // mined entries just stay in the notes
    const link = linkedSlug(c, res);
    try {
      if (link?.table === "trait_compendium" || link?.table === "drawback_compendium") {
        const { data: row } = await sb
          .from(link.table)
          .select("slug,name,description" + (link.table === "trait_compendium" ? ",type" : ""))
          .eq("slug", link.slug)
          .maybeSingle();
        if (!row) continue;
        // A PARSED trait entry links in place (keeps its id + slot); mined entries are additive.
        const entry = c.draftEntryId ? sheet.traits.list.find((t) => t.id === c.draftEntryId) : undefined;
        if (entry) {
          entry.name = S(row.name);
          entry.type = link.table === "drawback_compendium" ? "drawback" : S((row as { type?: unknown }).type) || undefined;
          entry.compendiumId = S(row.slug);
          entry.description = S(row.description) || undefined;
        } else {
          addTraitFromRow(c, link.table, row);
        }
        applied.push(`Trait: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      } else if (link) {
        if ((await refileLinked(c, link)) && c.draftEntryId) {
          sheet.traits.list = sheet.traits.list.filter((t) => t.id !== c.draftEntryId);
        }
      } else if (res.mode === "generic" && c.mined) {
        if (!sheet.traits.list.some((t) => normalizeKey(t.name) === normalizeKey(c.sourceText))) {
          sheet.traits.list.push({ id: `import_${c.id}`, name: c.sourceText, automation: [] });
          applied.push(`Trait (as written): ${c.sourceText}`);
        }
      }
    } catch {
      warnings.push(`Couldn't add "${c.sourceText}" from ${c.sourceLabel}.`);
    }
  }

  // ── Spell claims: cache detail / re-file ───────────────────────────────────
  const spellClaims = claims.filter((c) => c.sourceKind === "spell");
  const spellLinks = spellClaims
    .map((c) => ({ c, link: linkedSlug(c, resolved(c, answers)) }))
    .filter((x) => x.link?.table === "spell_compendium");
  // One malformed id would 22P02 the WHOLE batched .in() (PostgREST returns an error, not rows),
  // silently dropping every legitimate spell link — so ids must be UUID-shaped.
  const validSpellLinks = spellLinks.filter((x) => UUID_RE.test(x.link!.slug));
  if (validSpellLinks.length) {
    try {
      const { data, error } = await sb
        .from("spell_compendium")
        .select("id,name,school,subschool,descriptor,casting_time,components,range,duration,saving_throw,spell_resistance,description")
        .in("id", validSpellLinks.map((x) => x.link!.slug));
      if (error) throw new Error(S(error.message));
      const byId = new Map(((data ?? []) as Record<string, unknown>[]).map((r) => [S(r.id), r]));
      for (const { c, link } of validSpellLinks) {
        const row = byId.get(link!.slug);
        const entry = sheet.spellcasting.knownSpells.find((s) => s.id === c.draftEntryId);
        if (!row || !entry) continue;
        entry.name = S(row.name);
        entry.compendiumId = S(row.id);
        entry.school = S(row.school) || undefined;
        entry.subschool = S(row.subschool) || undefined;
        entry.descriptor = S(row.descriptor) || undefined;
        entry.castingTime = S(row.casting_time) || undefined;
        entry.components = S(row.components) || undefined;
        entry.range = S(row.range) || undefined;
        entry.duration = S(row.duration) || undefined;
        entry.savingThrow = S(row.saving_throw) || undefined;
        entry.spellResistance = S(row.spell_resistance) || undefined;
        entry.description = S(row.description) || undefined;
        applied.push(`Spell: ${S(row.name)}`);
      }
    } catch {
      warnings.push("Some spells couldn't be linked to the compendium.");
    }
  }
  // Spell-slot entries linked to ANOTHER table (a feat / talent / class feature typed into a
  // spell slot — field misuse is the norm) move to the right list.
  for (const c of spellClaims) {
    const res = resolved(c, answers);
    if (res.mode === "skipped") {
      sheet.spellcasting.knownSpells = sheet.spellcasting.knownSpells.filter((s) => s.id !== c.draftEntryId);
      unmappedSkipped.push(c.sourceText);
      continue;
    }
    const link = linkedSlug(c, res);
    if (!link || link.table === "spell_compendium") continue;
    try {
      if (await refileLinked(c, link)) {
        sheet.spellcasting.knownSpells = sheet.spellcasting.knownSpells.filter((s) => s.id !== c.draftEntryId);
      }
    } catch {
      warnings.push(`Couldn't re-file "${c.sourceText}" — it stayed in the spell list.`);
    }
  }

  // ── Divider rows are noise once verification ran — drop them ───────────────
  sheet.feats.list = sheet.feats.list.filter((f) => !isDivider(f.name));
  sheet.spellcasting.knownSpells = sheet.spellcasting.knownSpells.filter((s) => !isDivider(s.name));

  // ── Gestalt + final class-derived recompute ────────────────────────────────
  if (wantGestalt && !isGestalt(sheet)) {
    sheet.rules.modules.push({ key: "gestalt", enabled: true, settings: {} });
    applied.push("Gestalt module enabled");
  }
  if (linkedClassClaims.length > 0 || wantGestalt) {
    sheet.identity.totalLevel = isGestalt(sheet)
      ? gestaltLevel(sheet)
      : sheet.identity.classes.reduce((sum, c) => sum + c.level, 0);
    try {
      const rc = recomputeClassDerived(sheet, { hpMethod: "manual" });
      warnings.push(...rc.warnings);
    } catch {
      warnings.push("The class-derived recompute failed — check BAB/saves/HP.");
    }
  }

  if (unmappedSkipped.length) {
    // Merge with any prior list (a re-imported PathForge export carries its own skips) —
    // never overwrite preserved data.
    const prior = (sheet.metadata.unmapped as Record<string, unknown> | undefined)?.verification_skipped;
    const priorList = Array.isArray(prior) ? prior.filter((x): x is string => typeof x === "string") : [];
    sheet.metadata.unmapped = {
      ...(sheet.metadata.unmapped ?? {}),
      verification_skipped: [...priorList, ...unmappedSkipped.filter((t) => !priorList.includes(t))],
    };
  }

  return { applied, warnings };
}
