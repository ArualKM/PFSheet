import { describe, it, expect } from "vitest";
import { evaluatePrerequisite, evaluatePrerequisites, prereqSummary, type PrereqContext } from "./prerequisites";

const ctx: PrereqContext = {
  featNames: new Set(["power attack", "dodge"]),
  featureNames: new Set(["ferocity"]),
  abilityScores: { str: 15, dex: 12, con: 14, int: 10, wis: 13, cha: 8 },
  bab: 6,
  totalLevel: 7,
  casterLevel: 5,
  skillRanks: { acrobatics: 4, climb: 2, intimidate: 3 },
};

const ev = (reqType: string, reqValue: string) => evaluatePrerequisite({ reqType, reqValue }, ctx);

describe("prerequisite evaluation", () => {
  it("feat: matches owned feats + features (with suffix stripping)", () => {
    expect(ev("feat", "Power Attack").status).toBe("met");
    expect(ev("feat", "Ferocity racial trait").status).toBe("met"); // strips " racial trait"
    expect(ev("feat", "Combat Expertise").status).toBe("unmet");
  });

  it("ability: compares the score threshold", () => {
    expect(ev("ability", "Str 13").status).toBe("met"); // have 15
    expect(ev("ability", "Dex 15").status).toBe("unmet"); // have 12
    expect(ev("ability", "Int 13").status).toBe("unmet"); // have 10
  });

  it("skill: compares total ranks (parenthetical stripped)", () => {
    expect(ev("skill", "Acrobatics 3 ranks").status).toBe("met"); // 4
    expect(ev("skill", "Climb 5 ranks").status).toBe("unmet"); // 2
    expect(ev("skill", "Acrobatics 11 ranks").status).toBe("unmet");
  });

  it("bab: met / unmet, and 'or' alternatives are manual", () => {
    expect(ev("bab", "base attack bonus +6").status).toBe("met"); // bab 6
    expect(ev("bab", "base attack bonus +8").status).toBe("unmet");
    expect(ev("bab", "base attack bonus +10 or monk level 10th").status).toBe("manual"); // unmet by BAB but has an alt
  });

  it("level + caster_level: parse the ordinal", () => {
    expect(ev("level", "character level 7th").status).toBe("met"); // level 7
    expect(ev("level", "6th-level fighter").status).toBe("met"); // ≥6
    expect(ev("level", "character level 9th").status).toBe("unmet");
    expect(ev("caster_level", "caster level 5th").status).toBe("met");
    expect(ev("caster_level", "caster level 9th").status).toBe("unmet");
  });

  it("other (race / membership / GM text) is surfaced as manual", () => {
    expect(ev("other", "dwarf").status).toBe("manual");
    expect(ev("other", "member of a Mammoth Lord’s following").status).toBe("manual");
  });

  it("summary rolls up; allMet ignores manual but not unmet", () => {
    const checks = evaluatePrerequisites(
      [
        { reqType: "ability", reqValue: "Str 13" }, // met
        { reqType: "other", reqValue: "dwarf" }, // manual
        { reqType: "feat", reqValue: "Combat Expertise" }, // unmet
      ],
      ctx,
    );
    const s = prereqSummary(checks);
    expect(s).toEqual({ met: 1, unmet: 1, manual: 1, allMet: false });
    expect(prereqSummary(checks.filter((c) => c.status !== "unmet")).allMet).toBe(true);
  });
});
