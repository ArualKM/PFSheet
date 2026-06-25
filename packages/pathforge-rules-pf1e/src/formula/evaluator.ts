import type { Node } from "./ast";
import { parse } from "./parser";
import { FORMULA_FUNCTIONS, SPECIAL_FUNCTIONS } from "./functions";
import { FormulaSyntaxError } from "./tokenizer";

/** Result of resolving a `@{path}` reference. */
export type ResolvedRef = { found: boolean; value: number };

/** A resolver maps reference paths to numeric values within a scope. */
export interface Resolver {
  resolve(path: string): ResolvedRef;
  has(path: string): boolean;
}

export type EvaluationResult = {
  value: number;
  dependencies: string[];
  errors: string[];
  warnings: string[];
};

type EvalContext = {
  resolver: Resolver;
  dependencies: Set<string>;
  errors: string[];
  warnings: string[];
};

const truthy = (n: number): boolean => n !== 0 && !Number.isNaN(n);

function evalNode(node: Node, ctx: EvalContext): number {
  switch (node.type) {
    case "number":
      return node.value;

    case "ref": {
      ctx.dependencies.add(node.path);
      const r = ctx.resolver.resolve(node.path);
      if (!r.found) {
        ctx.warnings.push(`Unknown reference: @{${node.path}} (treated as 0)`);
        return 0;
      }
      return r.value;
    }

    case "unary": {
      const v = evalNode(node.operand, ctx);
      if (node.op === "-") return -v;
      if (node.op === "+") return v;
      return truthy(v) ? 0 : 1; // "!"
    }

    case "binary":
      return evalBinary(node.op, node.left, node.right, ctx);

    case "call":
      return evalCall(node, ctx);
  }
}

function evalBinary(op: string, leftN: Node, rightN: Node, ctx: EvalContext): number {
  // Short-circuit logical operators.
  if (op === "&&") {
    const l = evalNode(leftN, ctx);
    if (!truthy(l)) return 0;
    return truthy(evalNode(rightN, ctx)) ? 1 : 0;
  }
  if (op === "||") {
    const l = evalNode(leftN, ctx);
    if (truthy(l)) return 1;
    return truthy(evalNode(rightN, ctx)) ? 1 : 0;
  }

  const l = evalNode(leftN, ctx);
  const r = evalNode(rightN, ctx);
  switch (op) {
    case "+":
      return l + r;
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      if (r === 0) {
        ctx.errors.push("Division by zero (treated as 0)");
        return 0;
      }
      return l / r;
    case "==":
      return l === r ? 1 : 0;
    case "!=":
      return l !== r ? 1 : 0;
    case "<":
      return l < r ? 1 : 0;
    case "<=":
      return l <= r ? 1 : 0;
    case ">":
      return l > r ? 1 : 0;
    case ">=":
      return l >= r ? 1 : 0;
    default:
      ctx.errors.push(`Unknown operator '${op}'`);
      return 0;
  }
}

function evalCall(node: { name: string; args: Node[] }, ctx: EvalContext): number {
  const { name, args } = node;

  // Special, AST-aware functions.
  if (name === "if") {
    if (args.length !== 3) {
      ctx.errors.push("if() expects 3 arguments: if(condition, then, else)");
      return 0;
    }
    return truthy(evalNode(args[0]!, ctx))
      ? evalNode(args[1]!, ctx)
      : evalNode(args[2]!, ctx);
  }

  if (name === "exists") {
    if (args.length !== 1) {
      ctx.errors.push("exists() expects 1 argument: exists(@{path})");
      return 0;
    }
    const arg = args[0]!;
    if (arg.type === "ref") {
      ctx.dependencies.add(arg.path);
      return ctx.resolver.has(arg.path) ? 1 : 0;
    }
    // Non-reference argument: evaluate and report whether it produced a value.
    const v = evalNode(arg, ctx);
    return Number.isFinite(v) ? 1 : 0;
  }

  // Own-property lookup only — never resolve inherited Object.prototype members
  // (constructor/toString/valueOf/…), which would otherwise escape the allow-list.
  const fn = Object.prototype.hasOwnProperty.call(FORMULA_FUNCTIONS, name)
    ? FORMULA_FUNCTIONS[name]
    : undefined;
  if (!fn) {
    if (SPECIAL_FUNCTIONS.has(name)) return 0; // unreachable, but defensive
    ctx.errors.push(`Unknown function '${name}'`);
    // Still evaluate args so their references are recorded as dependencies.
    args.forEach((a) => evalNode(a, ctx));
    return 0;
  }

  const values = args.map((a) => evalNode(a, ctx));
  if (values.length < fn.minArgs || (fn.maxArgs !== null && values.length > fn.maxArgs)) {
    const range = fn.maxArgs === null ? `${fn.minArgs}+` : `${fn.minArgs}-${fn.maxArgs}`;
    ctx.errors.push(`${name}() expects ${range} arguments, got ${values.length}`);
    return 0;
  }
  return fn.apply(values);
}

/**
 * Evaluate a formula string against a resolver. Never throws on evaluation
 * problems — syntax errors and runtime issues are returned in `errors`.
 */
export function evaluate(formula: string, resolver: Resolver): EvaluationResult {
  const ctx: EvalContext = {
    resolver,
    dependencies: new Set(),
    errors: [],
    warnings: [],
  };

  let value = 0;
  try {
    const ast = parse(formula);
    value = evalNode(ast, ctx);
    // Defense in depth: a formula result must always be a finite number. Anything
    // else (NaN, Infinity, or a non-number that slipped through) is treated as 0.
    if (typeof value !== "number" || !Number.isFinite(value)) {
      ctx.warnings.push("Formula did not produce a finite number (treated as 0)");
      value = 0;
    }
  } catch (err) {
    if (err instanceof FormulaSyntaxError) {
      ctx.errors.push(`Syntax error at position ${err.pos}: ${err.message}`);
    } else {
      ctx.errors.push(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return {
    value,
    dependencies: [...ctx.dependencies],
    errors: ctx.errors,
    warnings: ctx.warnings,
  };
}
