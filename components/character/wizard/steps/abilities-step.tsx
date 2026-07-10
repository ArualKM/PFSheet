"use client";

import { useEffect } from "react";
import { ABILITY_KEYS, resolveClassPreset, type AbilityKey, type PointBuyState } from "@pathforge/schema";
import { composeAbilityScore, pointBuyCost, pointBuyRemaining, pointBuySpent } from "@pathforge/rules-pf1e";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NumberField } from "../../editor/fields";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const ABILITY_HELP: Record<AbilityKey, string> = {
  str: "Melee attack and damage, and how much you can carry.",
  dex: "Armor Class, Reflex saves, ranged attacks, and initiative.",
  con: "Hit points and Fortitude saves — never a bad place to invest.",
  int: "Skill points per level, plus Knowledge and Craft checks.",
  wis: "Will saves and Perception.",
  cha: "Social skills, and spellcasting for some classes.",
};

const RECOMMENDED_ARRAY = [15, 14, 13, 12, 10, 8];
/** Secondary bias order once the class's key ability has claimed the top score — a generic,
 * defensible default (Con/Dex matter for every build), not a per-class optimizer. */
const SECONDARY_PRIORITY: AbilityKey[] = ["con", "dex", "wis", "int", "cha", "str"];

/** Mirrors `character-editor.tsx`'s `makeDefaultPointBuy` (not imported from there — that file is
 * ~5,400 lines and must never be pulled into the wizard bundle): seed allocations from the
 * character's current scores (pre-racial, clamped 7-18), racial at 0. */
function makeDefaultPointBuy(ed: CharacterEditorApi): PointBuyState {
  const allocations: Record<string, number> = {};
  const racial: Record<string, number> = {};
  for (const key of ABILITY_KEYS) {
    const cur = ed.draft.abilities.primary[key]?.score ?? 10;
    allocations[key] = Math.min(18, Math.max(7, cur));
    racial[key] = 0;
  }
  return { enabled: true, done: false, budget: 15, system: "standard", minScore: 7, maxScore: 18, allocations, racial };
}

/** The chosen class's key ability, if a class with a resolvable preset has been picked yet —
 * casters bias to their casting stat (`ClassPreset.caster.castingAbility`); non-casters (Fighter,
 * Rogue, Monk, Barbarian…) have no such field, so fall back to Strength, a reasonable default for a
 * martial build. No class chosen yet → also Strength. */
function keyAbilityFor(ed: CharacterEditorApi): AbilityKey {
  for (const cl of ed.draft.identity.classes) {
    const preset = resolveClassPreset(cl);
    if (preset) return preset.caster?.castingAbility ?? "str";
  }
  return "str";
}

function recommendedAssignment(keyAbility: AbilityKey): Record<AbilityKey, number> {
  const order = [keyAbility, ...SECONDARY_PRIORITY.filter((k) => k !== keyAbility)];
  const out = {} as Record<AbilityKey, number>;
  order.forEach((key, i) => {
    out[key] = RECOMMENDED_ARRAY[i]!;
  });
  return out;
}

function allocationsOf(pb: PointBuyState | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of ABILITY_KEYS) out[key] = pb?.allocations[key] ?? 10;
  return out;
}

/**
 * §4.3 "abilities-step.tsx" — a compact, wizard-native point-buy panel. NOT a re-export of
 * `character-editor.tsx`'s `AbilitiesEditor`/`PointBuyPanel` (per the task brief, that file can't be
 * imported into the wizard bundle) — this mirrors `PointBuyPanel.apply()`'s exact update semantics
 * (`allocations[key]` + `composeAbilityScore` + `pointBuyBase` provenance) so the full editor's
 * Abilities tab sees identical, self-consistent state after handoff. Unlike the full panel's
 * separate "Apply" step, each field commits immediately (allocation + composed score together) —
 * simpler for a first-time, linear flow.
 */
export function AbilitiesStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  // Guarded step-entry effect (§4.3: "on step entry ... if not already set"). The wizard shell
  // remounts each step's panel on navigation, so this runs once per visit to this step — but it
  // NEVER resets an already-enabled block, so a Back-then-forward revisit keeps whatever the player
  // already allocated.
  useEffect(() => {
    if (ed.draft.abilities.pointBuy?.enabled) return;
    ed.update((c) => {
      if (c.abilities.pointBuy) c.abilities.pointBuy.enabled = true;
      else c.abilities.pointBuy = makeDefaultPointBuy(ed);
    });
    // Deliberately run once on mount only — see the guard above for why re-running is safe but
    // unnecessary (a fresh `ed` identity every render would otherwise refire this every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pb = ed.draft.abilities.pointBuy;
  const keyAbility = keyAbilityFor(ed);

  const setAllocation = (key: AbilityKey, raw: number) =>
    ed.update((c) => {
      if (!c.abilities.pointBuy) c.abilities.pointBuy = makeDefaultPointBuy(ed);
      const p = c.abilities.pointBuy;
      const v = Math.min(p.maxScore, Math.max(p.minScore, raw));
      p.allocations[key] = v;
      const rac = p.racial[key] ?? 0;
      c.abilities.primary[key].score = composeAbilityScore(v, rac, 0);
      c.abilities.primary[key].pointBuyBase = v;
    });

  // "sets the six baseScores in ONE ed.update" — a single mutation writing all six allocations +
  // composed scores together, not six separate calls.
  const applyRecommended = () => {
    const assignment = recommendedAssignment(keyAbility);
    ed.update((c) => {
      if (!c.abilities.pointBuy) c.abilities.pointBuy = makeDefaultPointBuy(ed);
      const p = c.abilities.pointBuy;
      for (const key of ABILITY_KEYS) {
        const base = assignment[key]!;
        const rac = p.racial[key] ?? 0;
        p.allocations[key] = base;
        c.abilities.primary[key].score = composeAbilityScore(base, rac, 0);
        c.abilities.primary[key].pointBuyBase = base;
      }
    });
  };

  const allocations = allocationsOf(pb);
  const spent = pointBuySpent(allocations);
  const remaining = pb ? pointBuyRemaining(pb.budget, allocations) : 0;
  const allValid = ABILITY_KEYS.every((key) => pointBuyCost(allocations[key]!) !== null);
  const over = remaining < 0 || !allValid;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-rune">Step 4</p>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Set your ability scores</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Ability scores govern nearly every roll your character makes. Point Buy spends a shared
          budget across all six — raising one costs more the higher it already is.
        </p>
      </div>

      {pb && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-sunken/60 px-3 py-2 text-sm" aria-live="polite">
          <span className="text-muted-foreground">
            Spent <span className="tnum font-semibold text-foreground">{spent}</span> / {pb.budget}
          </span>
          <Badge variant={over ? "danger" : remaining === 0 ? "success" : "gold"}>{remaining} remaining</Badge>
          <Button type="button" size="sm" variant="secondary" className="ml-auto min-h-9" onClick={applyRecommended}>
            Use a recommended array
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {ABILITY_KEYS.map((key) => (
          <div key={key} className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{ABILITY_NAMES[key]}</span>
              {key === keyAbility && <Badge variant="gold">Key</Badge>}
            </div>
            <NumberField
              label="Score"
              value={pb?.allocations[key] ?? ed.draft.abilities.primary[key]?.score ?? 10}
              min={pb?.minScore ?? 7}
              max={pb?.maxScore ?? 18}
              onChange={(v) => setAllocation(key, v)}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">{ABILITY_HELP[key]}</p>
          </div>
        ))}
      </div>

      {over && (
        <p className="text-xs text-danger">
          {!allValid ? "Some scores are outside the point-buy range." : "Over budget — lower a score before moving on."}
        </p>
      )}
    </div>
  );
}

/** Mirrors `PointBuyPanel`'s own "over budget" computation exactly (fails closed on an out-of-table
 * score, not just a negative remainder) — reusing `pointBuyCost`/`pointBuyRemaining` from the rules
 * engine rather than reimplementing the cost math. Point Buy disabled → nothing to gate on. */
export function canAdvanceAbilities(ed: CharacterEditorApi): boolean {
  const pb = ed.draft.abilities.pointBuy;
  if (!pb?.enabled) return true;
  const allocations = allocationsOf(pb);
  const remaining = pointBuyRemaining(pb.budget, allocations);
  const allValid = ABILITY_KEYS.every((key) => pointBuyCost(allocations[key]!) !== null);
  return remaining >= 0 && allValid;
}
