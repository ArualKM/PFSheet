import type { AutomationEffect, BonusType, PathForgeCharacterV1 } from "@pathforge/schema";
import { buildModifierIndex, computeCharacter } from "./compute";
import { applyStacking, type StackEntry, type StackInput } from "./stacking";

/* -------------------------------------------------------------------------- */
/* Stacking conflict detection                                                */
/* -------------------------------------------------------------------------- */

const DOMAIN_LABELS: Record<string, string> = {
  ac: "AC",
  cmd: "CMD",
  "save.fortitude": "Fortitude",
  "save.reflex": "Reflex",
  "save.will": "Will",
  init: "Initiative",
  speed: "Speed",
  "attack.all": "Attack",
  "attack.melee": "Melee attack",
  "attack.ranged": "Ranged attack",
  "attack.cmb": "CMB",
};

function domainLabel(domain: string): string {
  if (DOMAIN_LABELS[domain]) return DOMAIN_LABELS[domain];
  const skill = /^skill\.(.+)$/.exec(domain);
  if (skill) return `${skill[1]} skill`;
  const ability = /^ability\.([a-z]+)$/.exec(domain);
  if (ability) return ability[1]!.toUpperCase();
  return domain;
}

const fmt = (v: number): string => `${v >= 0 ? "+" : ""}${v}`;

export type StackingConflict = {
  domain: string;
  bonusType: BonusType;
  winner: { label: string; value: number } | null;
  suppressed: { label: string; value: number }[];
  message: string;
};

/**
 * Find buff bonuses that are suppressed by the stacking rules — e.g. two morale
 * bonuses to attack where only the highest applies. Only reports buckets where a
 * buff is involved (the Buff Center surfaces these as warnings).
 */
export function detectStackingConflicts(character: PathForgeCharacterV1): StackingConflict[] {
  const index = buildModifierIndex(character);
  const out: StackingConflict[] = [];
  // A suppressed bonus shared across several merged buckets (e.g. an `attack.all`
  // entry reported under melee/ranged/cmb) is only surfaced once.
  const seen = new Set<string>();

  const collect = (domainKey: string, mods: StackInput[]): void => {
    if (!mods.some((m) => (m.source ?? "").startsWith("Buff:"))) return;
    const { entries } = applyStacking(mods);
    const suppressed = entries.filter((e) => !e.included && (e.reason ?? "").startsWith("Superseded"));
    if (suppressed.length === 0) return;
    const kept = entries.filter((e) => e.included);

    const byType = new Map<BonusType, StackEntry[]>();
    for (const s of suppressed) {
      const dedupeKey = `${s.id}|${s.bonusType ?? "untyped"}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const t = (s.bonusType ?? "untyped") as BonusType;
      const arr = byType.get(t);
      if (arr) arr.push(s);
      else byType.set(t, [s]);
    }

    for (const [bonusType, items] of byType) {
      if (items.length === 0) continue;
      const winner = kept.find((k) => (k.bonusType ?? "untyped") === bonusType) ?? null;
      const names = items.map((i) => i.label).join(", ");
      const verb = items.length > 1 ? "are" : "is";
      const winTxt = winner ? ` ${winner.label} (${fmt(winner.value)}) applies.` : "";
      out.push({
        domain: domainLabel(domainKey),
        bonusType,
        winner: winner ? { label: winner.label, value: winner.value } : null,
        suppressed: items.map((i) => ({ label: i.label, value: i.value })),
        message: `${names} ${verb} suppressed on ${domainLabel(domainKey)} — ${bonusType} bonuses don't stack.${winTxt}`,
      });
    }
  };

  // Attack family. First catch conflicts among general "attack" (all-attacks)
  // bonuses; then conflicts between `attack.all` and a specific attack type —
  // mirroring how the resolver merges `attack.all` into each specific bucket.
  const attackAll = index.get("attack.all") ?? [];
  collect("attack.all", attackAll);
  for (const sub of ["attack.melee", "attack.ranged", "attack.cmb"] as const) {
    collect(sub, [...(index.get(sub) ?? []), ...attackAll]);
  }

  // Every other domain stacks within its own bucket.
  for (const [domain, mods] of index) {
    if (domain.startsWith("attack.")) continue;
    collect(domain, mods);
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Affected-values preview                                                    */
/* -------------------------------------------------------------------------- */

export type BuffDeltaRow = { label: string; before: number; after: number; delta: number };

type Computed = ReturnType<typeof computeCharacter>;

/**
 * The scalar stats the preview diffs. Reads the FULL computed result, not just `summary`, so the
 * affected-value preview covers every target the Buff Center menu can set — including the attack
 * sub-domains (Melee/Ranged/CMB live on `attackBonuses`, not `summary`) and Max HP. Without these a
 * buff like Bless/Haste (attack) or Toughness (hp) would show an empty delta and the misleading
 * "No net change" card even though the engine applies it. Skills are diffed separately (collapsing).
 */
function summaryValues(computed: Computed): Record<string, number> {
  const { summary, attackBonuses } = computed;
  const out: Record<string, number> = {
    AC: summary.ac,
    Touch: summary.touch,
    "Flat-footed": summary.flatFooted,
    CMD: summary.cmd,
    "Melee attack": attackBonuses.melee.value,
    "Ranged attack": attackBonuses.ranged.value,
    CMB: attackBonuses.cmb.value,
    Fortitude: summary.fortitude,
    Reflex: summary.reflex,
    Will: summary.will,
    Initiative: summary.initiative,
    Speed: summary.speed.total,
    "Max HP": summary.hp.max,
  };
  for (const [k, v] of Object.entries(summary.abilityMods)) out[`${k.toUpperCase()} mod`] = v;
  return out;
}

function diffSummaries(before: Record<string, number>, after: Record<string, number>): BuffDeltaRow[] {
  const rows: BuffDeltaRow[] = [];
  for (const label of Object.keys(after)) {
    const b = before[label] ?? 0;
    const a = after[label] ?? 0;
    if (a !== b) rows.push({ label, before: b, after: a, delta: a - b });
  }
  return rows;
}

const skillTotals = (computed: Computed): Record<string, number> =>
  Object.fromEntries(Object.entries(computed.skills).map(([key, cv]) => [key, cv.value]));

function prettySkill(key: string): string {
  return `${key.replace(/[:_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())} skill`;
}

/**
 * Per-skill deltas, kept out of {@link summaryValues} so an `All skills` buff (which shifts every one
 * of the ~35 skills by the same amount) collapses to a single "All skills" row instead of flooding the
 * preview. A single-skill or few-skill buff lists each affected skill by name.
 */
function skillDeltaRows(before: Record<string, number>, after: Record<string, number>): BuffDeltaRow[] {
  const changed = Object.keys(after)
    .map((key) => ({ key, before: before[key] ?? 0, after: after[key] ?? 0 }))
    .filter((c) => c.after !== c.before);
  if (changed.length === 0) return [];
  const deltas = new Set(changed.map((c) => c.after - c.before));
  if (changed.length > 2 && deltas.size === 1) {
    // Uniform shift across many skills → one summary row. before/after are nominal (skills have
    // different bases); only `delta` is meaningful and it is what the UI renders.
    const delta = changed[0]!.after - changed[0]!.before;
    return [{ label: "All skills", before: 0, after: delta, delta }];
  }
  return changed.map((c) => ({ label: prettySkill(c.key), before: c.before, after: c.after, delta: c.after - c.before }));
}

function buffDelta(before: Computed, after: Computed): BuffDeltaRow[] {
  return [
    ...diffSummaries(summaryValues(before), summaryValues(after)),
    ...skillDeltaRows(skillTotals(before), skillTotals(after)),
  ];
}

/** The net stat change an already-active buff contributes (enabled vs disabled). */
export function activeBuffDelta(character: PathForgeCharacterV1, buffId: string): BuffDeltaRow[] {
  const withEnabled = (enabled: boolean): PathForgeCharacterV1 => ({
    ...character,
    buffs: {
      ...character.buffs,
      active: character.buffs.active.map((b) => (b.id === buffId ? { ...b, enabled } : b)),
    },
  });
  return buffDelta(computeCharacter(withEnabled(false)), computeCharacter(withEnabled(true)));
}

/** Preview the marginal effect of adding a set of effects on top of current buffs. */
export function previewBuffEffects(
  character: PathForgeCharacterV1,
  effects: AutomationEffect[],
  name = "Preview",
): BuffDeltaRow[] {
  const augmented: PathForgeCharacterV1 = {
    ...character,
    buffs: {
      ...character.buffs,
      active: [...character.buffs.active, { id: "__preview__", name, enabled: true, effects }],
    },
  };
  return buffDelta(computeCharacter(character), computeCharacter(augmented));
}
