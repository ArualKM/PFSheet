import { BONUS_TYPES, type AutomationEffect, type AutomationOperation, type BonusType } from "@pathforge/schema";
import { classifyTarget } from "./compute";

/**
 * Map a compendium effect seed (a `feat_effect` / `feature_effect` row, authored in our `target · op ·
 * value_or_formula · bonus_type` DSL) onto an editable {@link AutomationEffect} the engine consumes.
 *
 * The bridge does three things the raw seed can't:
 *  1. **Normalize abbreviated targets** to the engine's vocabulary — the seeds say `saves.fort`/`saves.ref`
 *     but {@link classifyTarget} matches on the substrings `fortitude`/`reflex`, so the abbreviations would
 *     silently no-op.
 *  2. **Refuse targets the base engine can't apply** — there is no damage domain, so `damage.*` would
 *     misroute to `attack.*`; such effects are recorded with a `condition` (which excludes them from base
 *     totals) instead of applied wrongly.
 *  3. **Keep choice / toggle / situational effects inactive** — Weapon Focus (chosen weapon), Power Attack
 *     (toggle), Point-Blank Shot (within 30 ft) etc. carry a `condition` so they're recorded on the sheet
 *     and visible in the editor, but don't inflate the character's base numbers until the player resolves
 *     the choice. Only clean, unconditional effects (Toughness, Dodge, Iron Will, …) auto-compute on apply.
 */
export type CompendiumEffectSeed = {
  target: string;
  op: string;
  valueOrFormula: string;
  bonusType?: string | null;
  notes?: string | null;
};

/** Abbreviated save targets → the form `classifyTarget` recognizes (it substring-matches the full name). */
const SAVE_ALIASES: Record<string, string> = {
  "saves.fort": "saves.fortitude",
  "save.fort": "save.fortitude",
  "saves.ref": "saves.reflex",
  "save.ref": "save.reflex",
};

/** Notes that signal a choice-based / toggled / situational effect → recorded but not auto-applied. Kept
 * tight on purpose: "per"/"scales" appear in benign descriptions ("+1 per HD", "scales with level") that
 * the formula already handles, and `toggle` already catches the real toggle feats (Power Attack etc.). */
const CONDITIONAL_RE = /\b(toggle|chosen|choose|select|within|range|vs\.?|only|when|while|situational|conditional)\b/i;

const OPERATIONS = new Set<AutomationOperation>(["add", "subtract", "set", "multiply", "append", "toggle", "note"]);

const FORMULA_FUNCS = new Set(["max", "min", "floor", "ceil", "abs", "round", "sqrt"]);
const ABILITY_ABBR = new Set(["str", "dex", "con", "int", "wis", "cha"]);

/**
 * Bridge the seed-author's formula convention onto our evaluator's DSL. The seeds wrap the WHOLE
 * expression in braces — `@{max(3, level)}`, `@{floor(level/3)}` — and abbreviate ability paths
 * (`@{wis.mod}`); our evaluator wants `@{}` around PATHS only (`max(3, @{level})`) and fully-qualified
 * ability paths (`@{abilities.wis.mod}`). Mis-formed formulas otherwise resolve to 0 and silently no-op
 * (the bug the integration test caught). Plain numbers / dice / text (no `@{`) pass through untouched.
 */
export function normalizeFormula(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s.includes("@{")) return s;
  // 1) Unwrap a single, fully-wrapping @{ … } that is actually an expression (has a function/operator).
  //    The [^{}] guard means a multi-path formula like "@{level} + @{str.mod}" is NOT mistaken for one.
  const whole = s.match(/^@\{([^{}]+)\}$/);
  if (whole && /[(),+\-*/]/.test(whole[1]!)) s = whole[1]!;
  // 2) Wrap bare path identifiers (skip function names + anything already inside @{ … }).
  s = s.replace(/@\{[^}]*\}|[A-Za-z_][A-Za-z0-9_.]*/g, (tok) => {
    if (tok.startsWith("@{")) return tok;
    if (FORMULA_FUNCS.has(tok.toLowerCase())) return tok;
    return `@{${tok}}`;
  });
  // 3) Expand abbreviated ability paths: @{wis.mod} → @{abilities.wis.mod}.
  s = s.replace(/@\{([a-z]{3})\.(mod|score)\}/gi, (m, ab: string, prop: string) =>
    ABILITY_ABBR.has(ab.toLowerCase()) ? `@{abilities.${ab.toLowerCase()}.${prop.toLowerCase()}}` : m,
  );
  return s;
}

/** Canonicalize a seed target onto the engine's vocabulary (currently: expand abbreviated save names). */
export function normalizeEffectTarget(raw: string): string {
  const t = raw.trim().toLowerCase();
  return SAVE_ALIASES[t] ?? raw.trim();
}

/** True when the base engine can apply this target unconditionally (it classifies + has a real domain). */
function isAutoApplicable(target: string): boolean {
  if (/^damage\b/i.test(target.trim())) return false; // no damage domain — would misroute to attack.*
  return classifyTarget(target) !== null;
}

/** A finite plain number wins; anything else (a `@{…}` formula, "3d6", "") becomes a normalized string. */
function parseValue(raw: string): number | string {
  const trimmed = (raw ?? "").trim();
  const n = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(n)) return n;
  return normalizeFormula(trimmed);
}

/** Map a single seed → an AutomationEffect with the given stable id. */
export function seedToAutomationEffect(seed: CompendiumEffectSeed, id: string): AutomationEffect {
  const target = normalizeEffectTarget(seed.target);
  const operation = OPERATIONS.has(seed.op as AutomationOperation) ? (seed.op as AutomationOperation) : "add";
  const bonusType =
    seed.bonusType && (BONUS_TYPES as readonly string[]).includes(seed.bonusType)
      ? (seed.bonusType as BonusType)
      : ("untyped" as BonusType);
  const notes = (seed.notes ?? "").trim();
  const conditional = !isAutoApplicable(target) || CONDITIONAL_RE.test(notes);
  return {
    id,
    target,
    operation,
    value: parseValue(seed.valueOrFormula),
    bonusType,
    ...(conditional ? { condition: notes || "Conditional — see the feat text" } : {}),
  };
}

/** Map a feat/feature's seed rows → automation effects (ids prefixed so they're unique within the entry). */
export function seedsToAutomationEffects(seeds: CompendiumEffectSeed[], idPrefix = "fx"): AutomationEffect[] {
  return seeds.map((s, i) => seedToAutomationEffect(s, `${idPrefix}-fx-${i}`));
}
