import { describe, it, expect } from "vitest";
import { applyStacking, type StackInput } from "./stacking";

const m = (id: string, value: number, bonusType?: StackInput["bonusType"], extra?: Partial<StackInput>): StackInput => ({
  id,
  label: id,
  value,
  bonusType,
  ...extra,
});

const includedTotal = (mods: StackInput[]) => applyStacking(mods).total;

describe("applyStacking", () => {
  it("keeps the highest of same typed bonuses", () => {
    const r = applyStacking([m("a", 2, "enhancement"), m("b", 4, "enhancement")]);
    expect(r.total).toBe(4);
    expect(r.entries.filter((e) => e.included)).toHaveLength(1);
  });

  it("stacks bonuses of different types", () => {
    expect(includedTotal([m("a", 2, "armor"), m("b", 1, "deflection")])).toBe(3);
  });

  it("stacks dodge bonuses", () => {
    expect(includedTotal([m("a", 1, "dodge"), m("b", 1, "dodge")])).toBe(2);
  });

  it("stacks untyped bonuses", () => {
    expect(includedTotal([m("a", 2, "untyped"), m("b", 3, "untyped")])).toBe(5);
  });

  it("stacks untyped by default when bonusType omitted", () => {
    expect(includedTotal([m("a", 2), m("b", 3)])).toBe(5);
  });

  it("dedupes stacking bonuses that share a stacking group", () => {
    const r = applyStacking([
      m("a", 1, "dodge", { stackingGroup: "fight_defensively" }),
      m("b", 2, "dodge", { stackingGroup: "fight_defensively" }),
    ]);
    expect(r.total).toBe(2);
  });

  it("stacks penalties", () => {
    expect(includedTotal([m("a", -2, "penalty"), m("b", -1, "penalty")])).toBe(-3);
  });

  it("excludes disabled modifiers", () => {
    const r = applyStacking([m("a", 5, "competence", { enabled: false }), m("b", 2, "competence")]);
    expect(r.total).toBe(2);
    expect(r.entries.find((e) => e.id === "a")?.included).toBe(false);
  });

  it("keeps the highest bonus AND the largest penalty within a mixed-sign stacking group, order-independently", () => {
    const bonus = m("a", 3, "competence", { stackingGroup: "g1" });
    const penalty = m("b", -5, "competence", { stackingGroup: "g1" });
    expect(applyStacking([bonus, penalty]).total).toBe(-2);
    expect(applyStacking([penalty, bonus]).total).toBe(-2); // same data, reversed order
  });
});
