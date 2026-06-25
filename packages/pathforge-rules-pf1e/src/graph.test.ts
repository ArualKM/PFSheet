import { describe, it, expect } from "vitest";
import { buildDependencyGraph, topologicalSort } from "./graph";

describe("dependency graph", () => {
  it("orders dependencies before dependents", () => {
    const graph = buildDependencyGraph([
      { path: "ac.total", formula: "10 + @{ac.armor} + @{ac.dodge}" },
      { path: "ac.armor", formula: "@{armor.base}" },
      { path: "ac.dodge", formula: "1" },
    ]);
    const { order, hasCycle } = topologicalSort(graph);
    expect(hasCycle).toBe(false);
    expect(order.indexOf("ac.armor")).toBeLessThan(order.indexOf("ac.total"));
    expect(order.indexOf("ac.dodge")).toBeLessThan(order.indexOf("ac.total"));
  });

  it("detects circular dependencies and returns an empty order", () => {
    const graph = buildDependencyGraph([
      { path: "a", formula: "@{b}" },
      { path: "b", formula: "@{c}" },
      { path: "c", formula: "@{a}" },
    ]);
    const { hasCycle, cycles, order } = topologicalSort(graph);
    expect(hasCycle).toBe(true);
    expect(cycles.length).toBeGreaterThan(0);
    expect(order).toEqual([]); // contract: empty order when cyclic
  });

  it("ignores references to non-computed leaf data", () => {
    const graph = buildDependencyGraph([{ path: "x", formula: "@{abilities.str.mod} + 1" }]);
    expect(graph.edges.get("x")?.size).toBe(0);
  });
});
