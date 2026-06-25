import { extractDependencies } from "./formula/references";

/**
 * §8.5 Formula dependency graph.
 *
 * Builds a graph of computed target paths from their formulas, detects circular
 * dependencies, and produces a topological evaluation order. References to leaf
 * data (e.g. raw ability scores) that are not themselves computed nodes are
 * ignored for ordering purposes.
 */
export type FormulaNode = { path: string; formula: string };

export type DependencyGraph = {
  /** path -> set of computed paths it directly depends on */
  edges: Map<string, Set<string>>;
  nodes: Set<string>;
};

export function buildDependencyGraph(formulas: FormulaNode[]): DependencyGraph {
  const nodes = new Set(formulas.map((f) => f.path));
  const edges = new Map<string, Set<string>>();

  for (const { path, formula } of formulas) {
    const deps = extractDependencies(formula).filter((d) => nodes.has(d) && d !== path);
    edges.set(path, new Set(deps));
  }

  return { edges, nodes };
}

export type TopoResult = {
  /** Evaluation order (dependencies before dependents). Empty if cyclic. */
  order: string[];
  /** Each detected cycle as a list of paths. */
  cycles: string[][];
  hasCycle: boolean;
};

/**
 * Topological sort via DFS with explicit cycle detection. Reports every cycle
 * it can find so the formula inspector can flag the exact offending paths.
 */
export function topologicalSort(graph: DependencyGraph): TopoResult {
  const order: string[] = [];
  const cycles: string[][] = [];
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  for (const node of graph.nodes) color.set(node, WHITE);

  const visit = (node: string): void => {
    color.set(node, GRAY);
    stack.push(node);

    for (const dep of graph.edges.get(node) ?? []) {
      const c = color.get(dep) ?? WHITE;
      if (c === WHITE) {
        visit(dep);
      } else if (c === GRAY) {
        // Found a back-edge → extract the cycle from the current stack.
        const start = stack.indexOf(dep);
        if (start !== -1) cycles.push([...stack.slice(start), dep]);
      }
    }

    stack.pop();
    color.set(node, BLACK);
    order.push(node);
  };

  for (const node of graph.nodes) {
    if ((color.get(node) ?? WHITE) === WHITE) visit(node);
  }

  const hasCycle = cycles.length > 0;
  // Contract: `order` is a valid evaluation order, or empty when the graph is
  // cyclic (a cyclic graph has no topological order). Callers must check hasCycle.
  return { order: hasCycle ? [] : order, cycles, hasCycle };
}
