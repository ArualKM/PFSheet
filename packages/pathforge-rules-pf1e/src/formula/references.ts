import type { Node } from "./ast";
import { parse } from "./parser";

/** Collect every `@{path}` reference in an AST, de-duplicated, in first-seen order. */
export function collectReferences(node: Node): string[] {
  const seen = new Set<string>();
  const walk = (n: Node): void => {
    switch (n.type) {
      case "ref":
        seen.add(n.path);
        return;
      case "unary":
        walk(n.operand);
        return;
      case "binary":
        walk(n.left);
        walk(n.right);
        return;
      case "call":
        n.args.forEach(walk);
        return;
      case "number":
        return;
    }
  };
  walk(node);
  return [...seen];
}

/** Parse a formula and return its references. Returns [] on syntax error. */
export function extractDependencies(formula: string): string[] {
  try {
    return collectReferences(parse(formula));
  } catch {
    return [];
  }
}
