import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { isModuleKeyEnabled } from "@pathforge/schema";
import { evaluate, type Resolver } from "./formula/evaluator";
import type { ComputedValue } from "./compute";

/**
 * Akashic Magic (Dreamscarred Press) — the veilweaving math pass. Computes the shared essence pool
 * (Σ class pools + temporary, INVESTED not spent), the per-receptacle capacity cap by character
 * level, per-shaped-veil save DCs (attributed to the class that shaped the veil), bind-validity and
 * slot-collision warnings. Emitted as `summary.akashic` from computeCharacter when the `akashic`
 * module is enabled.
 *
 * NOTE: shaped-veil modifier ingestion does NOT live here — an enabled shaped veil's `automation[]`
 * is ingested in `buildModifierIndex` (compute.ts) alongside buffs/stances, with
 * `@{essenceInvested}` injected as a per-veil resolver local so essence-scaling bonuses land in the
 * ac/attack/save/skill buckets BEFORE the resolvers read them.
 */

/** Structural slice of compute.ts's abilities map (avoids an import cycle with compute.ts). */
type AbilityLookup = Record<string, { modifier: number }>;

/** A resolver with the per-row local overlay (CharacterResolver satisfies this structurally). */
export type AkashicResolver = Resolver & { local: Record<string, number> };

export type AkashicClassSummary = {
  id: string;
  name: string;
  level: number;
  veilweavingAbility: string;
  /** The veilweaving ability modifier — the per-class DC input. */
  veilweavingMod: number;
  essenceMax?: number;
  veilsShapedMax?: number;
  /** Additive per-receptacle capacity bonus ("Improved essence capacity +N" class features). */
  capacityBonus?: number;
  unlockedBinds: string[];
};

export type AkashicShapedSummary = {
  id: string;
  /** → the veilsKnown ref this loadout row shapes. */
  veilId: string;
  name: string;
  slot: string;
  essenceInvested: number;
  bound: boolean;
  /** False when bound to a chakra the attributed class hasn't unlocked (warned, never blocked). */
  bindValid: boolean;
  /** This veil's capacity: the character-level cap + the attributed class's capacityBonus + the
   * shaped row's own capacityBonus ("Improved essence capacity" is a standard class feature). */
  effectiveCap: number;
  /** True when essenceInvested exceeds this veil's effective capacity cap. */
  overCapacity: boolean;
  enabled: boolean;
  /** Save DC with terms (Show Math) — honors a custom saveDcFormula. */
  dc: ComputedValue;
};

export type AkashicSummary = {
  essence: {
    total: number;
    invested: number;
    /** total − invested; negative = over-invested (also warned). */
    available: number;
    temporary: number;
    /** BASE max essence in ONE receptacle at this character level (1/2/3/4) — a shaped veil's
     * real limit is its `effectiveCap` (this + class/receptacle capacityBonus). */
    capacityCap: number;
  };
  classes: AkashicClassSummary[];
  shaped: AkashicShapedSummary[];
  veilsKnownCount: number;
  warnings: string[];
};

/** Essence capacity per single receptacle by CHARACTER level: 1 (L1-5), 2 (L6-11), 3 (L12-17), 4 (L18+). */
export function akashicCapacityCap(characterLevel: number): number {
  const lvl = Math.floor(characterLevel || 0);
  if (lvl >= 18) return 4;
  if (lvl >= 12) return 3;
  if (lvl >= 6) return 2;
  return 1;
}

/**
 * The shared essence pool: total = Σ class essenceMax + temporary; invested = Σ enabled shaped +
 * other receptacles. Pure derivation shared by computeAkashic and the resolver paths
 * `@{akashic.essence.total|invested|available}` (registered module-gated in CharacterResolver).
 */
export function akashicEssencePool(character: Pick<PathForgeCharacterV1, "akashic">): {
  total: number;
  invested: number;
  available: number;
  temporary: number;
} {
  const ak = character.akashic;
  if (!ak) return { total: 0, invested: 0, available: 0, temporary: 0 };
  const temporary = Math.floor(ak.temporaryEssence || 0);
  const total = ak.classes.reduce((sum, c) => sum + Math.max(0, c.essenceMax ?? 0), 0) + temporary;
  const invested =
    ak.shaped.reduce((sum, s) => sum + (s.enabled !== false ? Math.max(0, s.essenceInvested) : 0), 0) +
    ak.otherReceptacles.reduce((sum, r) => sum + Math.max(0, r.essenceInvested), 0);
  return { total, invested, available: total - invested, temporary };
}

const DEFAULT_DC_FORMULA = "10 + @{essenceInvested} + @{veilweavingMod}";

const normSlot = (s: string) => (s ?? "").trim().toLowerCase();

/** Singular/plural-tolerant slot key for BIND comparisons only (never mutates stored data): the
 * prod progressions say "Chakra bind (Belts)" while every veil slot is singular "Belt", so a
 * trailing "s" is stripped from BOTH sides — "belts"↔"belt" match, and inherently-plural slots
 * ("hands"↔"hands" → "hand"↔"hand") keep matching themselves. */
const bindKey = (s: string) => {
  const n = normSlot(s);
  return n.endsWith("s") ? n.slice(0, -1) : n;
};

export function computeAkashic(
  character: PathForgeCharacterV1,
  abilities: AbilityLookup,
  resolver: AkashicResolver,
): AkashicSummary | undefined {
  if (!isModuleKeyEnabled(character, "akashic")) return undefined;
  const ak = character.akashic;
  if (!ak) return undefined;

  const characterLevel = Math.max(0, Math.floor(character.identity.totalLevel || 0));
  const capacityCap = akashicCapacityCap(characterLevel);
  const pool = akashicEssencePool(character);
  const warnings: string[] = [];
  if (pool.available < 0) {
    warnings.push(`Over-invested: ${pool.invested} essence invested exceeds the ${pool.total}-point pool.`);
  }

  const classes: AkashicClassSummary[] = ak.classes.map((c) => ({
    id: c.id,
    name: c.className,
    level: c.classLevel,
    veilweavingAbility: c.veilweavingAbility,
    veilweavingMod: abilities[c.veilweavingAbility]?.modifier ?? 0,
    essenceMax: c.essenceMax,
    veilsShapedMax: c.veilsShapedMax,
    capacityBonus: c.capacityBonus,
    unlockedBinds: c.unlockedBinds,
  }));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const fallbackClass = classes[0];
  const veilById = new Map(ak.veilsKnown.map((v) => [v.id, v]));

  // Save DC — @{essenceInvested} and @{veilweavingMod} are injected as resolver LOCALS, exactly
  // like PoW's @{maneuverLevel}. @{essenceInvested} is always THIS veil's investment. Terms are
  // resolved while the locals are still set (Show Math), then the overlay is cleared so no stale
  // local leaks into later formula evaluations.
  const dcFor = (formula: string | undefined, essenceInvested: number, veilweavingMod: number): ComputedValue => {
    resolver.local = { essenceInvested, veilweavingMod };
    const f = formula?.trim() ? formula : DEFAULT_DC_FORMULA;
    const r = evaluate(f, resolver);
    const terms = r.dependencies.map((ref) => ({ ref, value: resolver.resolve(ref).value }));
    resolver.local = {};
    return {
      value: Number.isFinite(r.value) ? r.value : 0,
      formula: f,
      dependencies: r.dependencies,
      terms,
      warnings: r.warnings,
      errors: r.errors,
    };
  };

  // One veil per chakra slot: track ENABLED shaped veils by normalized slot for collision warnings
  // (multi-slot veils already chose ONE slot at shape time — exact normalized-string equality).
  const slotOccupants = new Map<string, string[]>();

  const shaped: AkashicShapedSummary[] = ak.shaped.map((s) => {
    const ref = veilById.get(s.veilId);
    const name = ref?.name || "Unnamed veil";
    const owner = (s.classId ? classById.get(s.classId) : undefined) ?? fallbackClass;
    const invested = Math.max(0, s.essenceInvested);
    const enabled = s.enabled !== false;
    // Effective per-veil cap = the character-level band + the attributed class's "Improved essence
    // capacity" bonus + this receptacle's own bonus (all warn-only — never blocked).
    const effectiveCap = capacityCap + Math.max(0, owner?.capacityBonus ?? 0) + Math.max(0, s.capacityBonus ?? 0);
    const overCapacity = invested > effectiveCap;
    const unlocked = (owner?.unlockedBinds ?? []).map(bindKey);
    const bindValid = !s.bound || unlocked.includes(bindKey(s.slot));
    if (enabled) {
      if (overCapacity) {
        warnings.push(`${name}: ${invested} essence invested exceeds the capacity cap (${effectiveCap}).`);
      }
      if (!bindValid) {
        warnings.push(
          `${name}: bound to ${s.slot.trim() || "an empty slot"}, but ${owner?.name || "its class"} has not unlocked that chakra bind.`,
        );
      }
      const slotKey = normSlot(s.slot);
      if (slotKey) {
        const list = slotOccupants.get(slotKey);
        if (list) list.push(name);
        else slotOccupants.set(slotKey, [name]);
      }
    }
    return {
      id: s.id,
      veilId: s.veilId,
      name,
      slot: s.slot,
      essenceInvested: invested,
      bound: s.bound,
      bindValid,
      effectiveCap,
      overCapacity,
      enabled,
      dc: dcFor(s.saveDcFormula, invested, owner?.veilweavingMod ?? 0),
    };
  });

  for (const [slot, names] of slotOccupants) {
    if (names.length > 1) {
      warnings.push(`Chakra slot collision: ${names.join(" and ")} both occupy ${slot}.`);
    }
  }

  return {
    essence: { ...pool, capacityCap },
    classes,
    shaped,
    veilsKnownCount: ak.veilsKnown.length,
    warnings,
  };
}
