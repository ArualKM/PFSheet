import { describe, it, expect } from "vitest";
import { evaluate, type Resolver } from "./evaluator";
import { parse } from "./parser";
import { extractDependencies } from "./references";

const refs: Record<string, number> = {
  "abilities.dex.mod": 3,
  "abilities.str.mod": 4,
  "combat.bab.total": 6,
};

const resolver: Resolver = {
  resolve: (path) => (path in refs ? { found: true, value: refs[path]! } : { found: false, value: 0 }),
  has: (path) => path in refs,
};

const val = (f: string) => evaluate(f, resolver);

describe("arithmetic + precedence", () => {
  it("respects operator precedence", () => {
    expect(val("2 + 3 * 4").value).toBe(14);
    expect(val("(2 + 3) * 4").value).toBe(20);
    expect(val("10 - 2 - 3").value).toBe(5);
  });

  it("handles unary minus", () => {
    expect(val("-5 + 2").value).toBe(-3);
    expect(val("3 * -2").value).toBe(-6);
  });

  it("resolves references", () => {
    expect(val("10 + @{abilities.dex.mod}").value).toBe(13);
    expect(val("@{combat.bab.total} + @{abilities.str.mod}").value).toBe(10);
  });
});

describe("functions", () => {
  it("floor/ceil/round/abs", () => {
    expect(val("floor(7 / 2)").value).toBe(3);
    expect(val("ceil(7 / 2)").value).toBe(4);
    expect(val("round(7 / 2)").value).toBe(4);
    expect(val("abs(0 - 9)").value).toBe(9);
  });
  it("min/max/clamp/sum", () => {
    expect(val("min(3, 5, 1)").value).toBe(1);
    expect(val("max(3, 5, 1)").value).toBe(5);
    expect(val("clamp(12, 0, 10)").value).toBe(10);
    expect(val("clamp(-3, 0, 10)").value).toBe(0);
    expect(val("sum(1, 2, 3, 4)").value).toBe(10);
  });
  it("if + comparisons", () => {
    expect(val("if(@{abilities.dex.mod} > 0, 1, 0)").value).toBe(1);
    expect(val("if(1 == 2, 10, 20)").value).toBe(20);
  });
  it("exists()", () => {
    expect(val("exists(@{abilities.dex.mod})").value).toBe(1);
    expect(val("exists(@{not.a.real.path})").value).toBe(0);
  });
});

describe("error handling (never throws)", () => {
  it("reports division by zero", () => {
    const r = val("5 / 0");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.value).toBe(0);
  });
  it("warns on unknown reference", () => {
    const r = val("1 + @{does.not.exist}");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.value).toBe(1);
  });
  it("errors on unknown function", () => {
    const r = val("nope(1, 2)");
    expect(r.errors.some((e) => /Unknown function/.test(e))).toBe(true);
  });
  it("captures syntax errors", () => {
    expect(val("2 +").errors.length).toBeGreaterThan(0);
    expect(val("(1 + 2").errors.length).toBeGreaterThan(0);
  });
});

describe("security — no code execution", () => {
  it("rejects bare identifiers (no variables)", () => {
    expect(val("constructor").errors.length).toBeGreaterThan(0);
    expect(val("process").errors.length).toBeGreaterThan(0);
  });
  it("rejects property access syntax outside references", () => {
    // '.' is only legal inside @{...}; here it is an illegal character.
    expect(() => parse("globalThis.foo")).toThrow();
  });
  it("does not expose Math or any host function by name", () => {
    expect(val("Math(1)").errors.some((e) => /Unknown function/.test(e))).toBe(true);
  });

  it("rejects Object.prototype keys called as functions (allow-list escape)", () => {
    for (const name of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "isPrototypeOf",
      "propertyIsEnumerable",
      "toLocaleString",
      "__proto__",
    ]) {
      const r = val(`${name}(1)`);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(typeof r.value).toBe("number");
      expect(r.value).toBe(0);
    }
  });
});

describe("DoS hardening", () => {
  it("rejects formulas over the maximum length", () => {
    const r = val("1+".repeat(3000) + "1"); // > 4000 chars
    expect(r.errors.some((e) => /maximum length/i.test(e))).toBe(true);
    expect(r.value).toBe(0);
  });

  it("rejects pathologically deep nesting instead of overflowing the stack", () => {
    const deep = "(".repeat(500) + "1" + ")".repeat(500);
    const r = val(deep);
    expect(r.errors.some((e) => /nested too deeply/i.test(e))).toBe(true);
  });

  it("rejects deeply stacked unary operators", () => {
    const r = val("-".repeat(500) + "1");
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("dependency extraction", () => {
  it("collects references in order, de-duplicated", () => {
    expect(extractDependencies("@{a.b} + @{c.d} + @{a.b}")).toEqual(["a.b", "c.d"]);
  });
  it("returns [] for syntactically invalid formulas", () => {
    expect(extractDependencies("@{a} +")).toEqual([]);
  });
});
