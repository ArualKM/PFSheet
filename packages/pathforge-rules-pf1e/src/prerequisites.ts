// PF1e feat / prestige prerequisite evaluation. Pure: it takes the normalized `feat_prerequisite` rows
// (req_type / req_value, verbatim from the compendium) + a small context built from the character, and
// reports each requirement as met / unmet / manual. It NEVER hard-blocks a pick — the picker flags unmet
// prereqs (and honors a "force take" / "ignore prerequisites" setting); some requirements (race, group
// membership, GM-arbitrated text) can't be auto-checked and are surfaced as "manual" for the player to judge.

export type CompendiumPrereq = { reqType: string; reqValue: string };

/** What the evaluator checks against — built by the picker from the character + computed values. */
export type PrereqContext = {
  /** Lowercased names of feats AND features the character already has (feats often require other feats). */
  featNames: Set<string>;
  featureNames: Set<string>;
  /** Effective ability scores, keyed by lowercase abbrev (str/dex/con/int/wis/cha). */
  abilityScores: Record<string, number>;
  bab: number;
  totalLevel: number;
  /** Highest caster level across the character's casters (0 if non-caster). */
  casterLevel: number;
  /** Total ranks per skill, keyed by lowercase skill label (parenthetical specialization stripped). */
  skillRanks: Record<string, number>;
};

export type PrereqStatus = "met" | "unmet" | "manual";
export type PrereqCheck = CompendiumPrereq & { status: PrereqStatus; note?: string };

const ABILITY = /^(str|dex|con|int|wis|cha)\s+(\d+)/i;
const SKILL = /^(.+?)\s+(\d+)\s+ranks?/i;

const firstInt = (s: string): number | null => {
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};
const stripFeatSuffix = (s: string) => s.replace(/\s+(racial trait|feat|class feature)$/i, "").trim();

/** Evaluate one prerequisite row against the character context. */
export function evaluatePrerequisite(req: CompendiumPrereq, ctx: PrereqContext): PrereqCheck {
  const v = (req.reqValue ?? "").trim();
  const lower = v.toLowerCase();

  switch (req.reqType) {
    case "feat": {
      const has =
        ctx.featNames.has(lower) ||
        ctx.featureNames.has(lower) ||
        ctx.featNames.has(stripFeatSuffix(lower)) ||
        ctx.featureNames.has(stripFeatSuffix(lower));
      return { ...req, status: has ? "met" : "unmet" };
    }
    case "ability": {
      const m = ABILITY.exec(v);
      if (!m) return { ...req, status: "manual" };
      const have = ctx.abilityScores[m[1]!.toLowerCase()] ?? 0;
      const need = parseInt(m[2]!, 10);
      return { ...req, status: have >= need ? "met" : "unmet", note: `you have ${have}` };
    }
    case "bab": {
      const need = firstInt(v);
      if (need == null) return { ...req, status: "manual" };
      if (ctx.bab >= need) return { ...req, status: "met", note: `BAB +${ctx.bab}` };
      // "+10 or monk level 10th" style alternatives can't be fully judged here → manual.
      return { ...req, status: / or /i.test(v) ? "manual" : "unmet", note: `BAB +${ctx.bab}` };
    }
    case "skill": {
      const m = v.match(SKILL);
      if (!m) return { ...req, status: "manual" };
      const name = m[1]!.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, "");
      const need = parseInt(m[2]!, 10);
      const have = ctx.skillRanks[name] ?? 0;
      return { ...req, status: have >= need ? "met" : "unmet", note: `${have} rank${have === 1 ? "" : "s"}` };
    }
    case "level": {
      const need = firstInt(v);
      if (need == null) return { ...req, status: "manual" };
      return { ...req, status: ctx.totalLevel >= need ? "met" : "unmet", note: `level ${ctx.totalLevel}` };
    }
    case "caster_level": {
      const need = firstInt(v);
      if (need == null) return { ...req, status: "manual" };
      return { ...req, status: ctx.casterLevel >= need ? "met" : "unmet", note: `CL ${ctx.casterLevel}` };
    }
    default:
      return { ...req, status: "manual" };
  }
}

export function evaluatePrerequisites(reqs: CompendiumPrereq[], ctx: PrereqContext): PrereqCheck[] {
  return reqs.map((r) => evaluatePrerequisite(r, ctx));
}

/** Roll-up for the picker: how many are met / unmet / manual, and whether nothing is outright unmet. */
export function prereqSummary(checks: PrereqCheck[]): { met: number; unmet: number; manual: number; allMet: boolean } {
  const unmet = checks.filter((c) => c.status === "unmet").length;
  const manual = checks.filter((c) => c.status === "manual").length;
  const met = checks.filter((c) => c.status === "met").length;
  return { met, unmet, manual, allMet: unmet === 0 };
}
