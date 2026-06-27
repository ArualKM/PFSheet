/**
 * @pathforge/rules-pf1e — the PathForge formula & rules engine.
 *
 * Safe (no-eval) formula language, bonus stacking, dependency graph, and the
 * character computation layer that turns a canonical sheet into computed stats
 * with full math breakdowns. Pure and UI-free so it can be reused server-side,
 * client-side, and in future native apps.
 */

// Formula language
export type { Node } from "./formula/ast";
export { tokenize, FormulaSyntaxError } from "./formula/tokenizer";
export type { Token, TokenType } from "./formula/tokenizer";
export { parse } from "./formula/parser";
export { evaluate } from "./formula/evaluator";
export type { Resolver, ResolvedRef, EvaluationResult } from "./formula/evaluator";
export { FORMULA_FUNCTIONS, SPECIAL_FUNCTIONS, isKnownFunction } from "./formula/functions";
export { collectReferences, extractDependencies } from "./formula/references";

// Bonus stacking
export { applyStacking } from "./stacking";
export type { StackInput, StackEntry, StackResult } from "./stacking";

// Dependency graph
export { buildDependencyGraph, topologicalSort } from "./graph";
export type { FormulaNode, DependencyGraph, TopoResult } from "./graph";

// Sizes
export { getSizeModifiers } from "./sizes";
export type { SizeModifiers } from "./sizes";

// Conditions
export { CONDITION_EFFECTS, STANDARD_CONDITIONS, conditionEffects } from "./conditions";
export type { ConditionEffect } from "./conditions";

// Character computation
export {
  abilityModifier,
  computeAbilities,
  buildModifierIndex,
  CharacterResolver,
  computeCharacter,
} from "./compute";
export type {
  AbilityComputation,
  ModifierIndex,
  ComputedValue,
  ComputedTerm,
  ComputedCharacter,
  ComputedAttack,
  ComputedSpellcasting,
  ComputedSpellSlots,
} from "./compute";

// Buff Center helpers
export { detectStackingConflicts, activeBuffDelta, previewBuffEffects } from "./buffs";
export type { StackingConflict, BuffDeltaRow } from "./buffs";

// Point-buy calculator helpers
export {
  POINT_BUY_COST,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
  pointBuyCost,
  pointBuySpent,
  pointBuyRemaining,
  composeAbilityScore,
} from "./point-buy";
