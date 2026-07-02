import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { isModuleKeyEnabled, powInitiationAbility } from "@pathforge/schema";
import { evaluate, type Resolver } from "./formula/evaluator";

/**
 * Path of War (Dreamscarred Press) — the initiator math pass. Computes per-initiator INITIATOR
 * LEVEL (full initiating-class level + ½ other levels, capped at character level), the IL→highest
 * maneuver level table, initiation modifiers, and per-maneuver save DCs. Emitted as
 * `summary.pathOfWar` from computeCharacter when the `path_of_war` module is enabled.
 *
 * NOTE: active-stance modifier ingestion does NOT live here — an active stance's `automation[]`
 * is ingested in `buildModifierIndex` (compute.ts) alongside buffs/feats, so stance bonuses land
 * in the ac/attack/save/skill buckets BEFORE the resolvers read them.
 */

/** Structural slice of compute.ts's abilities map (avoids an import cycle with compute.ts). */
type AbilityLookup = Record<string, { modifier: number }>;

/** A resolver with the per-row local overlay (CharacterResolver satisfies this structurally). */
export type PathOfWarResolver = Resolver & { local: Record<string, number> };

export type PathOfWarInitiatorSummary = {
  id: string;
  className: string;
  initiatorLevel: number;
  /** Highest maneuver level this initiator can learn (IL table). */
  maxManeuverLevel: number;
  /** The initiation ability modifier (explicit or per-class default). */
  initiationMod: number;
  /** Default save DC per maneuver level — index 0 = level 1 … index 8 = level 9. */
  dcByManeuverLevel: number[];
  /** Readied entries ATTRIBUTED to this initiator (initiatorId, else the first initiator) — pairs
   * with maneuversReadiedMax so "Readied X/Y" never mixes populations across initiators. */
  readiedCount: number;
  // Per-initiator maxes echoed for over/under-readied warnings in the UI.
  maneuversKnownMax?: number;
  maneuversReadiedMax?: number;
  maneuversGrantedMax?: number;
  stancesKnownMax?: number;
};

export type PathOfWarSummary = {
  initiators: PathOfWarInitiatorSummary[];
  /** Non-stance entries known. */
  maneuversKnown: number;
  stancesKnown: number;
  /** Entries currently readied / granted / expended (per-entry lifecycle booleans). */
  readied: number;
  granted: number;
  expended: number;
  activeStanceNames: string[];
  /** Highest maneuver level accessible across all initiators. */
  highestManeuverLevel: number;
  /** Per-maneuver save DC by entry id (honors a custom saveDcFormula). */
  maneuverDcs: Record<string, number>;
};

/** IL → highest maneuver level (PoW table: IL 1-2→1st, 3-4→2nd, … 15-16→8th, 17+→9th). */
export function highestManeuverLevelForIL(initiatorLevel: number): number {
  const il = Math.floor(initiatorLevel);
  if (il <= 0) return 0;
  return Math.min(9, Math.ceil(il / 2));
}

/**
 * Derived initiator level: full initiating-class level + ½ of all OTHER class levels
 * (never ½ of the same class), capped at character level. Bad data (classLevel above the
 * character level) clamps to the character level rather than exceeding it.
 */
export function deriveInitiatorLevel(classLevel: number, characterLevel: number): number {
  const lvl = Math.max(0, Math.floor(characterLevel || 0));
  const cls = Math.max(0, Math.floor(classLevel || 0));
  const il = cls + Math.floor(Math.max(0, lvl - cls) / 2);
  return Math.min(lvl, il);
}

/**
 * Highest initiator level across the character's initiators — the value behind the resolver paths
 * `@{pathOfWar.initiatorLevel}` / `@{initiatorLevel}`, so scaling STANCE automation formulas
 * (e.g. `floor(@{initiatorLevel}/4)`) resolve during buildModifierIndex. Pure derivation only
 * (classLevel + ½ other levels, capped; the feat-access ½-level fallback when no initiators) —
 * an initiator's `initiatorLevelFormula` override is deliberately IGNORED here: the resolver path
 * is read while evaluating OTHER formulas, and evaluating a formula inside the lookup could
 * recurse (`@{initiatorLevel}` inside the override itself). Shared with computePathOfWar via
 * {@link deriveInitiatorLevel}.
 */
export function highestInitiatorLevel(
  character: Pick<PathForgeCharacterV1, "identity" | "pathOfWar">,
): number {
  const pow = character.pathOfWar;
  const characterLevel = Math.max(0, Math.floor(character.identity.totalLevel || 0));
  if (!pow) return 0;
  if (pow.initiators.length === 0) {
    return pow.maneuvers.length > 0 ? Math.floor(characterLevel / 2) : 0;
  }
  return Math.max(...pow.initiators.map((i) => deriveInitiatorLevel(i.classLevel, characterLevel)));
}

const DEFAULT_DC_FORMULA = "10 + @{maneuverLevel} + @{initiationMod}";

export function computePathOfWar(
  character: PathForgeCharacterV1,
  abilities: AbilityLookup,
  resolver: PathOfWarResolver,
): PathOfWarSummary | undefined {
  if (!isModuleKeyEnabled(character, "path_of_war")) return undefined;
  const pow = character.pathOfWar;
  if (!pow) return undefined;

  const characterLevel = Math.max(0, Math.floor(character.identity.totalLevel || 0));

  // Save DC — @{maneuverLevel} and @{initiationMod} are injected as resolver LOCALS, exactly like
  // computeSpellcasting's @{spellLevel}. @{maneuverLevel} is always the MANEUVER's own level (1–9),
  // never the initiator level — the @{spellLevel} bug class. Locals are cleared after each eval so
  // no stale overlay leaks into later formula evaluations.
  const dcFor = (
    formula: string | undefined,
    maneuverLevel: number,
    initiationMod: number,
    favoredWeapon = false,
  ): number => {
    resolver.local = { maneuverLevel, initiationMod };
    const r = evaluate(formula?.trim() ? formula : DEFAULT_DC_FORMULA, resolver);
    resolver.local = {};
    const base = Number.isFinite(r.value) ? r.value : 0;
    // Favored-weapon +2 competence (S4 §266.3): an off-by-default per-maneuver toggle, applied on
    // top of the default OR a custom formula so flipping it never rewrites the user's override.
    return base + (favoredWeapon ? 2 : 0);
  };

  const initiators: PathOfWarInitiatorSummary[] = [];
  const initById = new Map<string, PathOfWarInitiatorSummary>();
  for (const init of pow.initiators) {
    let il: number;
    if (init.initiatorLevelFormula?.trim()) {
      // An explicit formula override wins outright (no derivation clamp — it is the override).
      const r = evaluate(init.initiatorLevelFormula, resolver);
      il = Number.isFinite(r.value) ? Math.floor(r.value) : 0;
    } else {
      il = deriveInitiatorLevel(init.classLevel, characterLevel);
    }
    const initiationMod = abilities[powInitiationAbility(init)]?.modifier ?? 0;
    const summary: PathOfWarInitiatorSummary = {
      id: init.id,
      className: init.className,
      initiatorLevel: il,
      maxManeuverLevel: highestManeuverLevelForIL(il),
      initiationMod,
      dcByManeuverLevel: Array.from({ length: 9 }, (_, i) => dcFor(undefined, i + 1, initiationMod)),
      readiedCount: 0,
      maneuversKnownMax: init.maneuversKnownMax,
      maneuversReadiedMax: init.maneuversReadiedMax,
      maneuversGrantedMax: init.maneuversGrantedMax,
      stancesKnownMax: init.stancesKnownMax,
    };
    initiators.push(summary);
    initById.set(init.id, summary);
  }

  // Feat-based initiators (Martial Training et al.) know maneuvers with NO PoW class levels:
  // IL = ½ character level. Surfaced as a derived pseudo-initiator so the sheet still gets an
  // IL + DC row. Wis is the common initiation ability for feat access — add a real initiator row
  // (blank className, explicit ability) to control it.
  if (initiators.length === 0 && pow.maneuvers.length > 0) {
    const il = Math.floor(characterLevel / 2);
    const initiationMod = abilities.wis?.modifier ?? 0;
    initiators.push({
      id: "pow-derived",
      className: "",
      initiatorLevel: il,
      maxManeuverLevel: highestManeuverLevelForIL(il),
      initiationMod,
      dcByManeuverLevel: Array.from({ length: 9 }, (_, i) => dcFor(undefined, i + 1, initiationMod)),
      readiedCount: 0,
    });
  }

  const fallbackInitiator = initiators[0];
  const maneuverDcs: Record<string, number> = {};
  let maneuversKnown = 0;
  let stancesKnown = 0;
  let readied = 0;
  let granted = 0;
  let expended = 0;
  const activeStanceNames: string[] = [];
  for (const m of pow.maneuvers) {
    if (m.entryKind === "stance") {
      stancesKnown++;
      if (m.stanceActive) activeStanceNames.push(m.name);
    } else {
      maneuversKnown++;
    }
    if (m.readied) readied++;
    if (m.granted) granted++;
    if (m.expended) expended++;
    const owner = (m.initiatorId ? initById.get(m.initiatorId) : undefined) ?? fallbackInitiator;
    if (m.readied && owner) owner.readiedCount++;
    maneuverDcs[m.id] = dcFor(m.saveDcFormula, m.level, owner?.initiationMod ?? 0, m.favoredWeaponBonus === true);
  }

  return {
    initiators,
    maneuversKnown,
    stancesKnown,
    readied,
    granted,
    expended,
    activeStanceNames,
    highestManeuverLevel: Math.max(0, ...initiators.map((i) => i.maxManeuverLevel)),
    maneuverDcs,
  };
}
