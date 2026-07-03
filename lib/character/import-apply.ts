import {
  isGestalt,
  gestaltLevel,
  parseVeilSlots,
  parseOathPoints,
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
  brToNewlines,
  disciplineParts,
  extractPpCost,
  matchesManifesterClass,
  parseJunctionLevel,
} from "./psionic-powers";
import {
  isDivider,
  normalizeKey,
  pickClassCandidate,
  entryKeys,
  splitTopLevel,
  splitEntryText,
  stripSlotPrefix,
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

/* Track A's `character.oaths` block (packages/pathforge-schema `oathsBlockSchema`) — the shape
 * is PINNED here so the import apply ships independently of the schema landing order (3pp
 * Phase 6 runs as parallel tracks). Once the schema exports the block, the intersection cast
 * below stays type-compatible; a shape drift fails typecheck loudly instead of corrupting
 * sheet_data. */
type ImportOathEntry = {
  id: string;
  name: string;
  compendiumId?: string;
  /** Oath-point value (int ≥ 1); a non-numeric cost ("see text") parses to 1 + raw into notes. */
  points: number;
  oathText?: string;
  defiancePenalty?: string;
  atonement?: string;
  notes?: string;
  custom?: boolean;
};
type ImportOathBoon = {
  id: string;
  name: string;
  compendiumId?: string;
  cost: number;
  boonType?: string;
  description?: string;
  notes?: string;
  custom?: boolean;
};
type ImportOathsBlock = {
  oaths: ImportOathEntry[];
  boons: ImportOathBoon[];
  bonusPoints: number;
  notes?: string;
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
  // Psionics: YES enables the module (linked powers then re-file into character.psionics);
  // NO changes nothing — linked powers fall back to plain features (mythic-mirror, never drop).
  const psionicsQ = questions.find((q) => q.kind === "psionics");
  if (psionicsQ && answerOf(psionicsQ)) {
    const existing = sheet.rules.modules.find((m) => m.key === "psionics");
    if (!existing?.enabled) {
      if (existing) existing.enabled = true;
      else sheet.rules.modules.push({ key: "psionics", enabled: true, settings: {} });
      applied.push("Psionics module enabled");
    }
  }
  // Path of War: YES enables the module (linked maneuvers then re-file into character.pathOfWar);
  // NO changes nothing — linked maneuvers fall back to plain features (psionics-mirror, never drop).
  const powQ = questions.find((q) => q.kind === "path_of_war");
  if (powQ && answerOf(powQ)) {
    const existing = sheet.rules.modules.find((m) => m.key === "path_of_war");
    if (!existing?.enabled) {
      if (existing) existing.enabled = true;
      else sheet.rules.modules.push({ key: "path_of_war", enabled: true, settings: {} });
      applied.push("Path of War module enabled");
    }
  }
  // Akashic: YES enables the module (linked veils then re-file into character.akashic);
  // NO changes nothing — linked veils fall back to plain features (pow-mirror, never drop).
  const akashicQ = questions.find((q) => q.kind === "akashic");
  if (akashicQ && answerOf(akashicQ)) {
    const existing = sheet.rules.modules.find((m) => m.key === "akashic");
    if (!existing?.enabled) {
      if (existing) existing.enabled = true;
      else sheet.rules.modules.push({ key: "akashic", enabled: true, settings: {} });
      applied.push("Akashic module enabled");
    }
  }
  // Oaths: YES enables the module (linked oaths/boons then re-file into character.oaths);
  // NO changes nothing — linked oaths fall back to plain features (akashic-mirror, never drop).
  const oathsQ = questions.find((q) => q.kind === "oaths");
  if (oathsQ && answerOf(oathsQ)) {
    const existing = sheet.rules.modules.find((m) => m.key === "oaths");
    if (!existing?.enabled) {
      if (existing) existing.enabled = true;
      else sheet.rules.modules.push({ key: "oaths", enabled: true, settings: {} });
      applied.push("Oaths module enabled");
    }
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
        const abilityMods = parseAbilityMods(trait?.ability_modifiers);
        // Imported ability scores are EFFECTIVE totals — the racial modifier is already baked in.
        // applyRace would `score += v` and double-count, so pre-seed identity.raceApplied with the
        // SAME mods: applyRace's revert step then subtracts exactly what its apply step re-adds
        // (net zero on the scores) while still recording the linked race + size/speed/traits and
        // leaving raceApplied correct for a later race switch via the picker.
        sheet.identity.raceApplied = {
          name: S(row.name),
          compendiumId: S(row.slug),
          abilityMods,
        };
        applyRace(sheet, {
          race: { name: S(row.name), compendiumId: S(row.slug) },
          abilityMods,
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
    // Name equality only counts as a duplicate when the existing entry is unlinked (an as-written
    // entry being superseded) or links the SAME row — a different compendiumId is a genuinely
    // distinct entry whose name merely collides (hyphen-sibling pairs exist in the data).
    const dup = (list: { compendiumId?: string; name: string }[]) =>
      list.some(
        (e) =>
          e.compendiumId === S(row.slug) ||
          (normalizeKey(e.name) === normalizeKey(S(row.name)) && !e.compendiumId),
      );
    if (!dup(sheet.feats.list)) {
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
    const dupTrait = sheet.traits.list.some(
      (t) =>
        t.compendiumId === S(row.slug) ||
        (normalizeKey(t.name) === normalizeKey(S(row.name)) && !t.compendiumId),
    );
    if (!dupTrait) {
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

  /** Psionics module ON (adapter-flagged or the question answered YES above) → a real
   * powersKnown entry; OFF → the power stays visible as a plain feature, mirroring
   * addMythicAbility (never silently drop a linked row). Cached text goes through the picker's
   * pure normalizers (brToNewlines/disciplineParts/extractPpCost) so both add-paths persist the
   * SAME plain-text shape — the compendium's rich-text cells carry literal "<br>" separators. */
  const addPsionicPower = async (c: ImportClaim, row: Record<string, unknown>): Promise<void> => {
    const name = S(row.name);
    const cid = `3pp:${S(row.slug)}`;
    if (sheet.rules.modules.some((m) => m.key === "psionics" && m.enabled)) {
      if (!sheet.psionics) sheet.psionics = { classes: [], powersKnown: [] };
      const psi = sheet.psionics;
      if (!psi.powersKnown.some((p) => p.compendiumId === cid || (normalizeKey(p.name) === normalizeKey(name) && !p.compendiumId))) {
        // The compendium row has no universal level (per-class levels live in the junction) —
        // the probe's slot level wins when it carried one. Otherwise consult the junction:
        // lowest level among the sheet's own manifester classes, else the lowest level ANY
        // class gets it, else 1 (mined-notes powers never carry a slot level, so without this
        // every imported power would land at level 1).
        let lvl = Math.trunc(Number(c.level));
        if (!(Number.isFinite(lvl) && lvl >= 0)) {
          const { data: jr } = await sb
            .from("psionic_power_class_level")
            .select("class,level")
            .eq("power", name);
          let mine: number | undefined;
          let any: number | undefined;
          for (const j of (jr ?? []) as { class: string; level: string | null }[]) {
            const parsed = parseJunctionLevel(j.level);
            if (parsed == null) continue;
            if (any == null || parsed < any) any = parsed;
            const isMine = psi.classes.some((cl) => matchesManifesterClass(j.class, cl.className));
            if (isMine && (mine == null || parsed < mine)) mine = parsed;
          }
          lvl = mine ?? any ?? 1;
        }
        // power_points is text — only a BARE integer is a trustworthy universal cost
        // (per-class variants like "3 (dread), 5 (psion/wilder)" must not cache a wrong number).
        const ppCost = extractPpCost(S(row.power_points));
        psi.powersKnown.push({
          id: `import_${c.id}`,
          name,
          level: Math.max(0, Math.min(9, lvl)),
          discipline: disciplineParts(S(row.discipline)).join("; ") || undefined,
          descriptors: brToNewlines(S(row.descriptors)),
          ...(ppCost != null ? { ppCost } : {}),
          targetAreaEffect: brToNewlines(S(row.target_area_effect)),
          augment: brToNewlines(S(row.augment)),
          description: brToNewlines(S(row.description)),
          special: brToNewlines(S(row.special)),
          compendiumId: cid,
        });
      }
    } else if (!sheet.features.list.some((f) => f.compendiumId === cid || (normalizeKey(f.name) === normalizeKey(name) && !f.compendiumId))) {
      sheet.features.list.push({
        id: `import_${c.id}`,
        name,
        category: "special_ability",
        compendiumId: cid,
        description: brToNewlines(S(row.description)),
        automation: [],
      });
    }
  };

  /** Path of War module ON (adapter-flagged or the question answered YES above) → a real
   * character.pathOfWar maneuver entry; OFF → the maneuver stays visible as a plain feature,
   * mirroring addPsionicPower (never silently drop a linked row). Cached text goes through
   * brToNewlines so both add-paths persist plain text — the compendium's rich-text cells carry
   * literal "<br>" separators. */
  const addPowManeuver = (c: ImportClaim, row: Record<string, unknown>): void => {
    const name = S(row.name);
    const cid = `3pp:${S(row.slug)}`;
    if (sheet.rules.modules.some((m) => m.key === "path_of_war" && m.enabled)) {
      if (!sheet.pathOfWar) sheet.pathOfWar = { initiators: [], maneuvers: [] };
      const pow = sheet.pathOfWar;
      if (!pow.maneuvers.some((m) => m.compendiumId === cid || (normalizeKey(m.name) === normalizeKey(name) && !m.compendiumId))) {
        // `level` is text ("1"–"9"); the schema requires an int 1–9 — parse + clamp, default 1.
        const parsed = Math.trunc(Number(S(row.level).trim()));
        const level = Number.isFinite(parsed) && parsed >= 1 ? Math.min(9, parsed) : 1;
        pow.maneuvers.push({
          id: `import_${c.id}`,
          compendiumId: cid,
          name,
          level,
          discipline: S(row.discipline) || undefined,
          entryKind: /stance/i.test(S(row.category)) ? "stance" : "maneuver",
          maneuverType: S(row.type) || undefined,
          initiationAction: brToNewlines(S(row.initiation_action)),
          range: brToNewlines(S(row.range)),
          target: brToNewlines(S(row.target)),
          duration: brToNewlines(S(row.duration)),
          savingThrow: brToNewlines(S(row.saving_throw)),
          prerequisites: brToNewlines(S(row.prerequisite)),
          description: brToNewlines(S(row.description)),
          readied: false,
          expended: false,
          granted: false,
          stanceActive: false,
          automation: [],
          ...(S(row.source) ? { source: { book: S(row.source) } } : {}),
        });
      }
    } else if (!sheet.features.list.some((f) => f.compendiumId === cid || (normalizeKey(f.name) === normalizeKey(name) && !f.compendiumId))) {
      sheet.features.list.push({
        id: `import_${c.id}`,
        name,
        category: "special_ability",
        compendiumId: cid,
        description: brToNewlines(S(row.description)),
        automation: [],
      });
    }
  };

  /** Akashic module ON (adapter-flagged or the question answered YES above) → a real
   * character.akashic veilsKnown entry; OFF → the veil stays visible as a plain feature,
   * mirroring addPowManeuver (never silently drop a linked row). Cached text goes through
   * brToNewlines so both add-paths persist plain text — the compendium's rich-text cells carry
   * literal "<br>" separators. */
  const addAkashicVeil = (c: ImportClaim, row: Record<string, unknown>): void => {
    const name = S(row.name);
    const cid = `3pp:${S(row.slug)}`;
    if (sheet.rules.modules.some((m) => m.key === "akashic" && m.enabled)) {
      if (!sheet.akashic) {
        sheet.akashic = { classes: [], veilsKnown: [], shaped: [], otherReceptacles: [], temporaryEssence: 0 };
      }
      const aka = sheet.akashic;
      if (!aka.veilsKnown.some((v) => v.compendiumId === cid || (normalizeKey(v.name) === normalizeKey(name) && !v.compendiumId))) {
        aka.veilsKnown.push({
          id: `import_${c.id}`,
          compendiumId: cid,
          name,
          slots: parseVeilSlots(S(row.slot)),
          descriptors: brToNewlines(S(row.descriptors)),
          effect: brToNewlines(S(row.effect)),
          bindEffect: brToNewlines(S(row.bind_effect)),
          ...(S(row.source) ? { source: S(row.source) } : {}),
        });
      }
    } else if (!sheet.features.list.some((f) => f.compendiumId === cid || (normalizeKey(f.name) === normalizeKey(name) && !f.compendiumId))) {
      sheet.features.list.push({
        id: `import_${c.id}`,
        name,
        category: "special_ability",
        compendiumId: cid,
        description: brToNewlines(S(row.effect)),
        automation: [],
      });
    }
  };

  /** The sheet with Track A's optional `character.oaths` block (shape pinned above). */
  const oathsHost = sheet as PathForgeCharacterV1 & { oaths?: ImportOathsBlock };
  /** `oath_points` / `oath_point_cost` are text ("0"–"10" or "see text"). Delegate to the schema's
   * canonical parseOathPoints so the import add-path and the editor's boon picker agree on real
   * compendium data — a bare non-negative integer (incl. "0", e.g. the genuinely free "On Pain of
   * Death" boon) is trusted as-is; anything else ("see text") defaults to 1 with the raw cell noted. */
  const parseOathCost = (raw: string): { value: number; note?: string } => {
    const { points, raw: cell } = parseOathPoints(raw);
    return { value: points, ...(cell ? { note: `Oath point cost: ${cell}` } : {}) };
  };

  /** Oaths module ON (adapter-flagged or the question answered YES above) → a real
   * character.oaths entry with the row's cached rules text; OFF → the oath stays visible as a
   * plain feature, mirroring addAkashicVeil (never silently drop a linked row). Cached text
   * goes through brToNewlines so both add-paths persist plain text — the compendium's
   * rich-text cells carry literal "<br>" separators. */
  const addOath = (c: ImportClaim, row: Record<string, unknown>): void => {
    const name = S(row.name);
    const cid = `3pp:${S(row.slug)}`;
    if (sheet.rules.modules.some((m) => m.key === "oaths" && m.enabled)) {
      if (!oathsHost.oaths) oathsHost.oaths = { oaths: [], boons: [], bonusPoints: 0 };
      const blk = oathsHost.oaths;
      if (!blk.oaths.some((o) => o.compendiumId === cid || (normalizeKey(o.name) === normalizeKey(name) && !o.compendiumId))) {
        const cost = parseOathCost(S(row.oath_points));
        blk.oaths.push({
          id: `import_${c.id}`,
          compendiumId: cid,
          name,
          points: cost.value,
          oathText: brToNewlines(S(row.oath)),
          defiancePenalty: brToNewlines(S(row.defiance_penalty)),
          atonement: brToNewlines(S(row.atonement)),
          ...(cost.note ? { notes: cost.note } : {}),
        });
      }
    } else if (!sheet.features.list.some((f) => f.compendiumId === cid || (normalizeKey(f.name) === normalizeKey(name) && !f.compendiumId))) {
      sheet.features.list.push({
        id: `import_${c.id}`,
        name,
        category: "special_ability",
        compendiumId: cid,
        description: brToNewlines(S(row.oath)),
        automation: [],
      });
    }
  };

  /** An oath BOON (the reward side of the point budget) — module ON → character.oaths.boons;
   * OFF → a plain feature, exactly like addOath. */
  const addOathBoon = (c: ImportClaim, row: Record<string, unknown>): void => {
    const name = S(row.name);
    const cid = `3pp:${S(row.slug)}`;
    if (sheet.rules.modules.some((m) => m.key === "oaths" && m.enabled)) {
      if (!oathsHost.oaths) oathsHost.oaths = { oaths: [], boons: [], bonusPoints: 0 };
      const blk = oathsHost.oaths;
      if (!blk.boons.some((b) => b.compendiumId === cid || (normalizeKey(b.name) === normalizeKey(name) && !b.compendiumId))) {
        const cost = parseOathCost(S(row.oath_point_cost));
        blk.boons.push({
          id: `import_${c.id}`,
          compendiumId: cid,
          name,
          cost: cost.value,
          boonType: S(row.type) || undefined,
          description: brToNewlines(S(row.description)),
          ...(cost.note ? { notes: cost.note } : {}),
        });
      }
    } else if (!sheet.features.list.some((f) => f.compendiumId === cid || (normalizeKey(f.name) === normalizeKey(name) && !f.compendiumId))) {
      sheet.features.list.push({
        id: `import_${c.id}`,
        name,
        category: "special_ability",
        compendiumId: cid,
        description: brToNewlines(S(row.description)),
        automation: [],
      });
    }
  };

  /** A 3pp Drawbacks & Flaws row files into traits.list either way — the same bucket the 1pp
   * drawback path uses, so DRAWBACKS & FLAWS sections link fine whether or not the
   * flaws_drawbacks module is on (no module question; the module gates engine/editor depth,
   * not the link). The type tag comes from the row's category ("flaw" → "flaw",
   * "major_drawback" → "drawback") — accurate documentation on the entry, and enabling the
   * module later needs no re-import because the compendiumId is already linked. */
  const addThreeppDrawback = (c: ImportClaim, row: Record<string, unknown>): void => {
    const name = S(row.name);
    const cid = `3pp:${S(row.slug)}`;
    if (sheet.traits.list.some((t) => t.compendiumId === cid || (normalizeKey(t.name) === normalizeKey(name) && !t.compendiumId))) {
      return;
    }
    const effect = brToNewlines(S(row.effect));
    const bonus = brToNewlines(S(row.bonus_granted));
    sheet.traits.list.push({
      id: `import_${c.id}`,
      name,
      type: S(row.category) === "flaw" ? "flaw" : "drawback",
      compendiumId: cid,
      description: [effect, bonus ? `Bonus granted: ${bonus}` : undefined].filter(Boolean).join("\n\n") || undefined,
      automation: [],
    });
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

  /** The source slot often carries a rules note or choice beyond the row's own name — keep it
   * visible on the created entry (never-discard). */
  const appendImportNote = (target: { description?: string } | undefined, c: ImportClaim, rowName: string): void => {
    if (!target) return;
    const src = splitEntryText(c.sourceText);
    if (!src.detail && normalizeKey(src.name) === normalizeKey(rowName)) return;
    const note = `Imported: ${c.sourceText.trim()}`;
    if (!target.description?.includes(note)) {
      target.description = [target.description, note].filter(Boolean).join("\n\n");
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
      // The source text may carry a CHOICE or rules note beyond the feature's own name
      // ("Finesse Training (Ex) (Cestus)", "Hex -> Benefit of Wisdom: …") — keep it visible.
      const src = splitEntryText(c.sourceText);
      const feat = S(row.feature);
      const withType = row.type ? `${feat} (${S(row.type)})` : feat;
      if (src.detail || (normalizeKey(src.name) !== normalizeKey(feat) && normalizeKey(src.name) !== normalizeKey(withType))) {
        const target = sheet.features.list.find((f) => f.compendiumId === S(row.slug));
        const note = `Imported: ${c.sourceText.trim()}`;
        if (target && !target.description?.includes(note)) {
          target.description = [target.description, note].filter(Boolean).join("\n\n");
        }
      }
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
      appendImportNote(sheet.traits.list.find((t) => t.compendiumId === S(row.slug)), c, S(row.name));
      applied.push(`${link.table === "drawback_compendium" ? "Drawback" : "Trait"}: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    if (link.table === "sphere_talents") {
      const res = await addSphereTalent(c, link.slug);
      if (res.ok) applied.push(`Sphere talent: ${res.name}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return res.ok;
    }
    if (link.table === "psionic_power_compendium") {
      const { data: row } = await sb
        .from("psionic_power_compendium")
        .select("slug,name,discipline,descriptors,power_points,target_area_effect,augment,description,special")
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      await addPsionicPower(c, row);
      applied.push(`Psionic power: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    if (link.table === "pow_maneuver_compendium") {
      const { data: row } = await sb
        .from("pow_maneuver_compendium")
        .select("slug,name,discipline,level,category,type,initiation_action,range,target,duration,saving_throw,prerequisite,description,source")
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      addPowManeuver(c, row);
      applied.push(
        `${/stance/i.test(S(row.category)) ? "Stance" : "Maneuver"}: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`,
      );
      return true;
    }
    if (link.table === "akashic_veil_compendium") {
      const { data: row } = await sb
        .from("akashic_veil_compendium")
        .select("slug,name,slot,descriptors,effect,bind_effect,source")
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      addAkashicVeil(c, row);
      applied.push(`Veil: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    if (link.table === "oath_compendium") {
      const { data: row } = await sb
        .from("oath_compendium")
        .select("slug,name,oath_points,oath,defiance_penalty,atonement")
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      addOath(c, row);
      applied.push(`Oath: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    if (link.table === "oath_boon_compendium") {
      const { data: row } = await sb
        .from("oath_boon_compendium")
        .select("slug,name,oath_point_cost,type,description")
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      addOathBoon(c, row);
      applied.push(`Oath boon: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`);
      return true;
    }
    if (link.table === "threepp_drawback_compendium") {
      const { data: row } = await sb
        .from("threepp_drawback_compendium")
        .select("slug,name,category,effect,bonus_granted")
        .eq("slug", link.slug)
        .maybeSingle();
      if (!row) return false;
      addThreeppDrawback(c, row);
      appendImportNote(sheet.traits.list.find((t) => t.compendiumId === `3pp:${S(row.slug)}`), c, S(row.name));
      applied.push(
        `${S(row.category) === "flaw" ? "Flaw" : "Drawback"}: ${S(row.name)}${c.mined ? ` (found in ${c.sourceLabel})` : ""}`,
      );
      return true;
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
      appendImportNote(sheet.features.list.find((f) => f.compendiumId === S(row.slug)), c, S(row.trait_name));
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
        const original = entry.name;
        // Keep a player-typed choice qualifier ("Spell Focus (Conjuration)" stays whole), and
        // preserve the rest of the slot text ("… - +1 DC conjuration") in notes — no loss.
        const half = splitEntryText(original).name;
        entry.name =
          normalizeKey(half).startsWith(normalizeKey(S(row.name))) && half.length > S(row.name).length
            ? half
            : S(row.name);
        if (normalizeKey(original) !== normalizeKey(entry.name) && !entry.notes) {
          entry.notes = `Imported: ${original}`;
        }
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
  // Part claims whose LINK targets spell_compendium are included regardless of which slot kind
  // they came from (a spell typed into a feat slot's list still becomes a spell entry).
  const spellClaims = claims.filter((c) => c.sourceKind === "spell");
  const spellLinks = claims
    .filter((c) => c.sourceKind === "spell" || c.partOf)
    .map((c) => ({ c, link: linkedSlug(c, resolved(c, answers)) }))
    .filter((x) => x.link?.table === "spell_compendium");
  /** Part-claim ids whose linked row was ACTUALLY applied — slot removal requires all of them,
   * so a failed batch/lookup can never delete a slot with nothing added in its place. */
  const appliedParts = new Set<string>();
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
        if (!row) continue;
        // A LINE ITEM of a multi-spell slot ("0: Create Water, Detect Magic, …") ADDS a proper
        // spell entry; the slot itself is removed below once every item linked.
        if (c.partOf) {
          if (!sheet.spellcasting.knownSpells.some((s) => s.compendiumId === S(row.id))) {
            const lvl = Math.trunc(Number(c.level));
            sheet.spellcasting.knownSpells.push({
              id: `import_${c.id}`,
              name: S(row.name),
              level: Number.isFinite(lvl) ? Math.max(0, Math.min(9, lvl)) : 0,
              compendiumId: S(row.id),
              school: S(row.school) || undefined,
              subschool: S(row.subschool) || undefined,
              descriptor: S(row.descriptor) || undefined,
              castingTime: S(row.casting_time) || undefined,
              components: S(row.components) || undefined,
              range: S(row.range) || undefined,
              duration: S(row.duration) || undefined,
              savingThrow: S(row.saving_throw) || undefined,
              spellResistance: S(row.spell_resistance) || undefined,
              description: S(row.description) || undefined,
            });
          }
          appliedParts.add(c.id);
          applied.push(`Spell: ${S(row.name)} (from a multi-spell line)`);
          continue;
        }
        const entry = sheet.spellcasting.knownSpells.find((s) => s.id === c.draftEntryId);
        if (!entry) continue;
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
  // spell slot — field misuse is the norm) move to the right list. Line items are handled in
  // their own loop below.
  for (const c of spellClaims) {
    if (c.partOf) continue;
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

  // ── Multi-entry slot line items ─────────────────────────────────────────────
  // Linked items were extracted above (spells) or re-file here (feats / features / traits /
  // talents). A slot whose EVERY line item linked carries no information of its own anymore —
  // it's removed and recorded, like the structured-feature echoes below.
  const partClaims = claims.filter((c) => c.partOf);
  for (const c of partClaims) {
    const link = linkedSlug(c, resolved(c, answers));
    if (!link || link.table === "spell_compendium") continue;
    try {
      if (await refileLinked(c, link)) appliedParts.add(c.id);
      else warnings.push(`Couldn't add "${c.sourceText}" from ${c.sourceLabel}.`);
    } catch {
      warnings.push(`Couldn't add "${c.sourceText}" from ${c.sourceLabel}.`);
    }
  }
  const coveredSlotNames: string[] = [];
  if (partClaims.length) {
    const bySlot = new Map<string, ImportClaim[]>();
    for (const c of partClaims) {
      const list = bySlot.get(c.partOf!) ?? [];
      list.push(c);
      bySlot.set(c.partOf!, list);
    }
    for (const [slotId, parts] of bySlot) {
      // Every item must have ACTUALLY applied (not merely resolved linked — a failed batch must
      // never delete a slot with nothing added in its place).
      if (!parts.every((p) => appliedParts.has(p.id))) continue;
      // Guard-filtered items ("Darkvision 60 ft") never became claims — the linked items must
      // account for EVERY split part, or the slot still carries information of its own.
      if (parts.length !== (parts[0]!.partCount ?? parts.length)) continue;
      // The player's explicit "keep as written" on the SLOT itself wins over item extraction.
      const wholeClaim = claims.find((c) => c.draftEntryId === slotId && !c.partOf);
      if (wholeClaim && answers.resolutions?.[wholeClaim.id]?.mode === "generic") continue;
      const entry =
        sheet.feats.list.find((f) => f.id === slotId) ??
        sheet.spellcasting.knownSpells.find((s) => s.id === slotId);
      if (!entry) continue; // already re-filed/removed by the whole-slot claim
      // A slot the whole-slot claim linked IN PLACE is a real entry now — never remove it.
      if ((entry as { compendiumId?: string }).compendiumId) continue;
      sheet.feats.list = sheet.feats.list.filter((f) => f.id !== slotId);
      sheet.spellcasting.knownSpells = sheet.spellcasting.knownSpells.filter((s) => s.id !== slotId);
      coveredSlotNames.push(entry.name);
    }
    if (coveredSlotNames.length) {
      applied.push(
        `Extracted ${coveredSlotNames.length} multi-entry line${coveredSlotNames.length === 1 ? "" : "s"} into linked entries`,
      );
    }
  }

  // ── Context re-file: section-labeled as-written entries ────────────────────
  // An entry under a "RACIAL TRAITS" / class-features header belongs in features even without a
  // compendium row ("Voiceless: cannot speak…" → a racial_trait feature carrying its rules text).
  {
    const ctxOf = new Map<string, "racial_trait" | "feature">();
    for (const c of claims) {
      if (!c.draftEntryId || c.mined || c.partOf || c.sourceKind !== "feat") continue;
      if (resolved(c, answers).mode !== "generic") continue;
      if (c.context === "racial_trait" || c.context === "feature") ctxOf.set(c.draftEntryId, c.context);
    }
    let moved = 0;
    if (ctxOf.size) {
      const nameish = (p: string) => {
        const t = p.trim();
        return t.length >= 3 && t.length <= 48 && /^[A-Z\d]/.test(t) && !/->|→|=>|\s=\s/.test(t);
      };
      sheet.feats.list = sheet.feats.list.filter((f) => {
        const ctx = ctxOf.get(f.id);
        if (!ctx) return true;
        const { name: half, detail } = splitEntryText(f.name);
        // "Lotus Style: Bloom, Purity of Body" is a COMPOUND name, not a name + description —
        // when the post-colon half is itself a list of name-ish items, splitting would collapse
        // distinct entries onto the shared prefix. Keep the full text as the name instead.
        const detailParts = detail ? splitTopLevel(detail, /[;,]/) : [];
        const compound = detailParts.length >= 2 && detailParts.every(nameish);
        const name = compound ? stripSlotPrefix(f.name) : half;
        if (!name || name.length < 3 || name.length > 80) return true;
        const existing = sheet.features.list.find((x) => normalizeKey(x.name) === normalizeKey(name));
        // Merge only into a compendium-LINKED feature (a granted row absorbing its choice note) —
        // a name collision with another as-written feature is a distinct entry, kept distinct.
        if (existing?.compendiumId) {
          const note = `Imported: ${f.name}`;
          if (detail && !existing.description?.includes(note)) {
            existing.description = [existing.description, note].filter(Boolean).join("\n\n");
          }
        } else {
          sheet.features.list.push({
            id: `import_ctx_${f.id}`,
            name,
            category: ctx === "racial_trait" ? "racial_trait" : "class_feature",
            ...(!compound && detail ? { description: detail } : {}),
            automation: [],
          });
        }
        moved++;
        return false;
      });
    }
    if (moved) {
      applied.push(`Re-filed ${moved} section-labeled entr${moved === 1 ? "y" : "ies"} into features`);
    }
  }

  // ── Structured-feature echoes ───────────────────────────────────────────────
  // The class builder just granted structured features; a leftover NAME-ONLY slot whose text is
  // NOTHING BUT features now on the sheet ("Sneak attack (1/3/5/…/19)", "1. Trapfinding,
  // 2. Evasion (Ex)") is a duplicate — the structured row wins (§ commit semantics: no dupes,
  // no loss). Partial matches (any un-covered name, e.g. a 3pp archetype feature) keep the slot;
  // an entry carrying its own data (type/benefit/notes/automation) is never an echo; a player's
  // EXPLICIT resolution always wins (an explicit keep-as-written stays, and a LINKED claim whose
  // apply failed keeps its "kept as written" promise). CHOICE qualifiers ("Hex (Evil Eye)",
  // "(Cestus)") are preserved onto the matching feature so the pick stays visible on the sheet.
  const echoRemovedNames: string[] = [];
  if (linkedClassClaims.length > 0) {
    type FeatureRowRef = PathForgeCharacterV1["features"]["list"][number];
    const grantedByName = new Map<string, FeatureRowRef>();
    for (const f of sheet.features.list) {
      for (const key of [normalizeKey(f.name), normalizeKey(f.name.replace(/\s*\([^)]*\)\s*$/, ""))]) {
        if (key && !grantedByName.has(key)) grantedByName.set(key, f);
      }
    }
    const exempt = new Set<string>();
    for (const c of claims) {
      if (!c.draftEntryId) continue;
      if (answers.resolutions?.[c.id]?.mode === "generic" || resolved(c, answers).mode === "linked") {
        exempt.add(c.draftEntryId);
      }
    }
    // What entryKeys stripped between two successive keys: a type marker "(Ex)/(Su)/(Sp)" or a
    // numeric progression "(1/3/5/…)" is bookkeeping; anything wordy is a player CHOICE.
    const TYPE_STRIP = /^[([]\s*(?:ex|su|sp)\s*[)\]]$/i;
    const NUMERIC_STRIP = /^[([][\d\s/,.+·-]*[)\]]$/;
    const partCover = (part: string): { feature: FeatureRowRef; choice?: string } | null => {
      const keys = entryKeys(part);
      if (!keys.length) return null;
      const full = grantedByName.get(normalizeKey(keys[0]!));
      if (full) return { feature: full };
      let cur = keys[0]!;
      let choice = false;
      for (let i = 1; i < keys.length; i++) {
        const next = keys[i]!;
        const stripped = cur.slice(next.length).trim();
        if (!TYPE_STRIP.test(stripped) && !NUMERIC_STRIP.test(stripped)) choice = true;
        const hit = grantedByName.get(normalizeKey(next));
        if (hit) return { feature: hit, ...(choice ? { choice: part.trim() } : {}) };
        cur = next;
      }
      return null;
    };

    const removedNames: string[] = [];
    const keep: typeof sheet.feats.list = [];
    for (const f of sheet.feats.list) {
      const bare =
        !f.compendiumId &&
        !f.type &&
        !f.benefit &&
        !f.special &&
        !f.notes &&
        f.automation.length === 0 &&
        !exempt.has(f.id) &&
        !isDivider(f.name);
      const parts = bare ? splitTopLevel(f.name, /,/) : [];
      const covers = parts.length ? parts.map(partCover) : [];
      if (!covers.length || covers.some((c) => !c)) {
        keep.push(f);
        continue;
      }
      for (const c of covers) {
        if (c?.choice) {
          const note = `Imported: ${c.choice}`;
          if (!c.feature.description?.includes(note)) {
            c.feature.description = [c.feature.description, note].filter(Boolean).join("\n\n");
          }
        }
      }
      removedNames.push(f.name);
    }
    if (removedNames.length) {
      sheet.feats.list = keep;
      echoRemovedNames.push(...removedNames);
      applied.push(
        `Removed ${removedNames.length} slot entr${removedNames.length === 1 ? "y" : "ies"} duplicating structured features`,
      );
    }
  }
  // Everything removed as covered (echo slots + fully-extracted multi-entry lines) is preserved.
  {
    const allCovered = [...coveredSlotNames, ...echoRemovedNames];
    if (allCovered.length) {
      const prior = (sheet.metadata.unmapped as Record<string, unknown> | undefined)?.covered_by_features;
      const priorList = Array.isArray(prior) ? prior.filter((x): x is string => typeof x === "string") : [];
      sheet.metadata.unmapped = {
        ...(sheet.metadata.unmapped ?? {}),
        covered_by_features: [...priorList, ...allCovered.filter((t) => !priorList.includes(t))],
      };
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
