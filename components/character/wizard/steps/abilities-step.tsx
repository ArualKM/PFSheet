"use client";

import { useEffect, useState } from "react";
import { ABILITY_KEYS, resolveClassPreset, type AbilityKey, type PointBuyState } from "@pathforge/schema";
import { composeAbilityScore, pointBuyCost, pointBuyRemaining, pointBuySpent } from "@pathforge/rules-pf1e";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NumberField } from "../../editor/fields";
import { Segmented } from "../../editor/picker-shell";
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

/** Point-buy budget presets (PF1e "point buy systems" table naming) + the bounds for Custom. */
const BUDGET_PRESETS: { value: number; label: string }[] = [
  { value: 10, label: "Low" },
  { value: 15, label: "Standard" },
  { value: 20, label: "High" },
  { value: 25, label: "Epic" },
];
const CUSTOM_BUDGET_MIN = 5;
const CUSTOM_BUDGET_MAX = 60;

const RECOMMENDED_ARRAY = [15, 14, 13, 12, 10, 8];
/** Secondary bias order once the class's key ability has claimed the top score — a generic,
 * defensible default (Con/Dex matter for every build), not a per-class optimizer. */
const SECONDARY_PRIORITY: AbilityKey[] = ["con", "dex", "wis", "int", "cha", "str"];

/** Mirrors `character-editor.tsx`'s `makeDefaultPointBuy` (not imported from there — that file is
 * ~5,400 lines and must never be pulled into the wizard bundle), with the wizard-order fix: the
 * Race step runs BEFORE this one and `applyRace` bakes racial mods directly into `score` (recording
 * them on `identity.raceApplied.abilityMods`), so the seed must split score into
 * pre-racial allocation + `racial[key]` — seeding racial at 0 made every later recompose
 * (`composeAbilityScore(base, racial, 0)`) silently ERASE the racial mods (a confirmed review
 * finding: a Dwarf's +2 Con vanished on the first field edit). Draft-shaped param so it can run
 * inside `ed.update`'s mutator. */
function makeDefaultPointBuy(draft: CharacterEditorApi["draft"]): PointBuyState {
  const allocations: Record<string, number> = {};
  const racial: Record<string, number> = {};
  const raceMods = draft.identity.raceApplied?.abilityMods ?? {};
  for (const key of ABILITY_KEYS) {
    const cur = draft.abilities.primary[key]?.score ?? 10;
    const mod = raceMods[key] ?? 0;
    racial[key] = mod;
    allocations[key] = Math.min(18, Math.max(7, cur - mod));
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
  // Guarded step-entry effect (§4.3: "on step entry ... if not already set"): seed point-buy ONLY
  // when the character has never had a point-buy block at all. A block that EXISTS but is disabled
  // means the player deliberately switched to manual scores (possibly hand-typing rolled/homebrew
  // values in the full editor) — force-re-enabling it here would surface STALE allocations and the
  // next edit would silently overwrite their real scores (a confirmed review finding). Manual mode
  // renders below with an explicit opt-in instead.
  useEffect(() => {
    if (ed.draft.abilities.pointBuy) return;
    ed.update((c) => {
      if (!c.abilities.pointBuy) c.abilities.pointBuy = makeDefaultPointBuy(c);
    });
    // Deliberately run once on mount only — see the guard above for why re-running is safe but
    // unnecessary (a fresh `ed` identity every render would otherwise refire this every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pb = ed.draft.abilities.pointBuy;
  const pointBuyOn = pb?.enabled ?? false;
  const keyAbility = keyAbilityFor(ed);

  // Local UI-only flag: whether the "Custom" segment is showing. STICKY (a review finding): it
  // initializes true when the sheet ARRIVES with a non-preset budget, and flips true via
  // adjust-state-during-render if the budget ever goes non-preset without an explicit segment
  // click — otherwise editing the custom field's value down THROUGH a preset number (22 → 20)
  // would unmount the focused field mid-keystroke and silently light up the preset button.
  const budget = pb?.budget ?? 15;
  const isPresetBudget = BUDGET_PRESETS.some((p) => p.value === budget);
  const [customBudgetMode, setCustomBudgetMode] = useState(!isPresetBudget);
  if (!customBudgetMode && !isPresetBudget) setCustomBudgetMode(true);
  const budgetSegmentValue = customBudgetMode ? "custom" : String(budget);

  // Never touches `allocations` — only `pb.budget` (and seeds the block first if it doesn't exist
  // yet, same guard every other setter here uses).
  const setBudget = (v: number) =>
    ed.update((c) => {
      if (!c.abilities.pointBuy) c.abilities.pointBuy = makeDefaultPointBuy(c);
      const p = c.abilities.pointBuy;
      p.budget = Math.min(CUSTOM_BUDGET_MAX, Math.max(CUSTOM_BUDGET_MIN, v));
    });
  const onBudgetSegmentChange = (v: string) => {
    if (v === "custom") {
      setCustomBudgetMode(true);
      return;
    }
    setCustomBudgetMode(false);
    setBudget(Number(v));
  };

  const setAllocation = (key: AbilityKey, raw: number) =>
    ed.update((c) => {
      if (!c.abilities.pointBuy) c.abilities.pointBuy = makeDefaultPointBuy(c);
      const p = c.abilities.pointBuy;
      const v = Math.min(p.maxScore, Math.max(p.minScore, raw));
      p.allocations[key] = v;
      const rac = p.racial[key] ?? 0;
      c.abilities.primary[key].score = composeAbilityScore(v, rac, 0);
      c.abilities.primary[key].pointBuyBase = v;
    });

  // Manual mode: write the score directly — the same shape as the full editor's plain
  // AbilitiesEditor field (score only; no allocations/pointBuyBase provenance).
  const setScoreDirect = (key: AbilityKey, v: number) =>
    ed.update((c) => {
      c.abilities.primary[key].score = v;
    });

  // Explicit opt-in back INTO point buy from manual mode: reseed the whole block from the CURRENT
  // scores (+ raceApplied mods), discarding any stale pre-manual allocations.
  const enablePointBuy = () =>
    ed.update((c) => {
      c.abilities.pointBuy = makeDefaultPointBuy(c);
    });

  // "sets the six baseScores in ONE ed.update" — a single mutation writing all six allocations +
  // composed scores together, not six separate calls.
  const applyRecommended = () => {
    const assignment = recommendedAssignment(keyAbility);
    ed.update((c) => {
      if (!c.abilities.pointBuy) c.abilities.pointBuy = makeDefaultPointBuy(c);
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
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Set your ability scores</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Ability scores govern nearly every roll your character makes. Point Buy spends a shared
          budget across all six — raising one costs more the higher it already is.
        </p>
      </div>

      {pointBuyOn && pb ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Budget</span>
            <Segmented
              value={budgetSegmentValue}
              onChange={onBudgetSegmentChange}
              ariaLabel="Point-buy budget preset"
              options={[
                ...BUDGET_PRESETS.map((p) => ({ value: String(p.value), label: `${p.label} (${p.value})` })),
                { value: "custom", label: "Custom" },
              ]}
            />
            {budgetSegmentValue === "custom" && (
              <NumberField
                label="Custom budget"
                value={budget}
                min={CUSTOM_BUDGET_MIN}
                max={CUSTOM_BUDGET_MAX}
                onChange={setBudget}
                className="w-32"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-sunken/60 px-3 py-2 text-sm" aria-live="polite">
            <span className="text-muted-foreground">
              Spent <span className="tnum font-semibold text-foreground">{spent}</span> / {pb.budget}
            </span>
            <Badge variant={over ? "danger" : remaining === 0 ? "success" : "gold"}>{remaining} remaining</Badge>
            <Button type="button" size="sm" variant="secondary" className="ml-auto min-h-9" onClick={applyRecommended}>
              Use a recommended array
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-sunken/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Point Buy is off for this character — scores are set directly (rolled or homebrew values
            stay exactly as typed).
          </span>
          <Button type="button" size="sm" variant="secondary" className="ml-auto min-h-9" onClick={enablePointBuy}>
            Use Point Buy instead
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {ABILITY_KEYS.map((key) => (
          <div key={key} className="rounded-lg border border-border p-3">
            {key === keyAbility && (
              <div className="mb-1 flex justify-end">
                <Badge variant="gold">Key</Badge>
              </div>
            )}
            {/* The ability NAME is the field's label — six inputs all labeled "Score" gave every
                field the same accessible name (a confirmed review finding). */}
            <NumberField
              label={ABILITY_NAMES[key]}
              value={
                pointBuyOn
                  ? (pb?.allocations[key] ?? 10)
                  : (ed.draft.abilities.primary[key]?.score ?? 10)
              }
              min={pointBuyOn ? (pb?.minScore ?? 7) : 0}
              max={pointBuyOn ? (pb?.maxScore ?? 18) : undefined}
              onChange={(v) => (pointBuyOn ? setAllocation(key, v) : setScoreDirect(key, v))}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">{ABILITY_HELP[key]}</p>
          </div>
        ))}
      </div>

      {pointBuyOn && over && (
        <p className="text-xs text-danger">
          {!allValid ? "Some scores are outside the point-buy range." : "Over budget — lower a score before moving on."}
        </p>
      )}
      {/* A nudge, not a gate — canAdvanceAbilities only blocks going OVER budget; most tables expect
          every point spent, so an amber (not red) hint calls it out without stopping Next. */}
      {pointBuyOn && !over && remaining > 0 && (
        <p className="text-xs font-medium text-warning" aria-live="polite">
          You still have {remaining} point{remaining === 1 ? "" : "s"} to spend — most tables expect all
          points used.
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
