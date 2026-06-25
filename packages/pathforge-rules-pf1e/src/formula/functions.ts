/**
 * Allowlisted formula functions. `if` and `exists` are NOT here — they need
 * lazy / AST-level handling and are implemented directly in the evaluator.
 *
 * Every function is a pure numeric operation. There is no way to reference any
 * function outside this table.
 */
export type FormulaFunction = {
  /** Minimum arg count. */
  minArgs: number;
  /** Maximum arg count, or null for variadic. */
  maxArgs: number | null;
  apply: (args: number[]) => number;
};

export const FORMULA_FUNCTIONS: Record<string, FormulaFunction> = {
  floor: { minArgs: 1, maxArgs: 1, apply: (a) => Math.floor(a[0]!) },
  ceil: { minArgs: 1, maxArgs: 1, apply: (a) => Math.ceil(a[0]!) },
  round: { minArgs: 1, maxArgs: 1, apply: (a) => Math.round(a[0]!) },
  abs: { minArgs: 1, maxArgs: 1, apply: (a) => Math.abs(a[0]!) },
  min: { minArgs: 1, maxArgs: null, apply: (a) => Math.min(...a) },
  max: { minArgs: 1, maxArgs: null, apply: (a) => Math.max(...a) },
  sum: { minArgs: 0, maxArgs: null, apply: (a) => a.reduce((s, x) => s + x, 0) },
  clamp: {
    minArgs: 3,
    maxArgs: 3,
    apply: (a) => Math.min(Math.max(a[0]!, a[1]!), a[2]!),
  },
};

/** Functions handled specially by the evaluator (lazy / AST-aware). */
export const SPECIAL_FUNCTIONS = new Set(["if", "exists"]);

export function isKnownFunction(name: string): boolean {
  return name in FORMULA_FUNCTIONS || SPECIAL_FUNCTIONS.has(name);
}
