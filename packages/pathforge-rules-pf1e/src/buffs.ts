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

/** Rows keyed by a STABLE namespaced id (stat:/ability:/skill:<key>) so a skill whose display
 * label matches a stat row ("AC") or another skill's label (two Perform specialties) can never
 * merge with it; the human label rides along for the delta rows. */
type SummaryEntry = { label: string; value: number };

function summaryValues(
  computed: ReturnType<typeof computeCharacter>,
  character: PathForgeCharacterV1,
): Record<string, SummaryEntry> {
  const summary = computed.summary;
  const out: Record<string, SummaryEntry> = {
    "stat:ac": { label: "AC", value: summary.ac },
    "stat:touch": { label: "Touch", value: summary.touch },
    "stat:flatfooted": { label: "Flat-footed", value: summary.flatFooted },
    "stat:cmd": { label: "CMD", value: summary.cmd },
    "stat:fortitude": { label: "Fortitude", value: summary.fortitude },
    "stat:reflex": { label: "Reflex", value: summary.reflex },
    "stat:will": { label: "Will", value: summary.will },
    "stat:initiative": { label: "Initiative", value: summary.initiative },
    "stat:speed": { label: "Speed", value: summary.speed.total },
  };
  for (const [k, v] of Object.entries(summary.abilityMods)) {
    out[`ability:${k}`] = { label: `${k.toUpperCase()} mod`, value: v };
  }
  // Per-skill totals so skill-targeted effects (skill.<key>, skill.<ability>.all, skill.all)
  // surface in the delta preview. diffSummaries only reports CHANGED values, so unaffected
  // skills never clutter the list.
  const skillLabels = new Map(
    character.skills.list.map((s) => [s.key, s.specialty ? `${s.label} (${s.specialty})` : s.label]),
  );
  for (const [key, cv] of Object.entries(computed.skills)) {
    out[`skill:${key}`] = { label: skillLabels.get(key) ?? key, value: cv.value };
  }
  return out;
}

function diffSummaries(
  before: Record<string, SummaryEntry>,
  after: Record<string, SummaryEntry>,
): BuffDeltaRow[] {
  const rows: BuffDeltaRow[] = [];
  for (const [key, entry] of Object.entries(after)) {
    const b = before[key]?.value ?? 0;
    if (entry.value !== b) rows.push({ label: entry.label, before: b, after: entry.value, delta: entry.value - b });
  }
  return rows;
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
  const off = summaryValues(computeCharacter(withEnabled(false)), character);
  const on = summaryValues(computeCharacter(withEnabled(true)), character);
  return diffSummaries(off, on);
}

/** Preview the marginal effect of adding a set of effects on top of current buffs. */
export function previewBuffEffects(
  character: PathForgeCharacterV1,
  effects: AutomationEffect[],
  name = "Preview",
): BuffDeltaRow[] {
  const base = summaryValues(computeCharacter(character), character);
  const augmented: PathForgeCharacterV1 = {
    ...character,
    buffs: {
      ...character.buffs,
      active: [...character.buffs.active, { id: "__preview__", name, enabled: true, effects }],
    },
  };
  const withBuff = summaryValues(computeCharacter(augmented), augmented);
  return diffSummaries(base, withBuff);
}
