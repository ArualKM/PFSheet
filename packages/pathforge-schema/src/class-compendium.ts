import type { AbilityKey, BabProgression, CasterType, ClassPreset, SaveProgression } from "./common";

/**
 * Adapter: a PFcore `class_compendium` + `class_progression` row → a {@link ClassPreset} the existing
 * `recomputeClassDerived` consumes verbatim. Phase 4 reuses 100% of the class math (BAB/saves/HP/caster,
 * fractional + gestalt) by feeding it a synthetic preset; it never re-implements the math.
 *
 * `class_progression.json_data` is a raw 2D array (a header row + 20 level rows). The columns drift between
 * classes (some have a leading section-header row, varying spell columns), so we LOCATE columns by header
 * label and INFER the progression enums from the numbers (L1 + the top level) rather than trusting labels.
 */
export type ParsedProgression = {
  bab: BabProgression;
  saves: { fortitude: SaveProgression; reflex: SaveProgression; will: SaveProgression };
  /** Present when the table has populated spell columns. */
  caster?: { clProgression: "full" | "minus_three" };
  warnings: string[];
};

const ORDINAL = /^\s*(\d+)(st|nd|rd|th)\b/i;

function firstInt(cell: unknown): number | null {
  const m = String(cell ?? "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** BAB at the top level reveals the curve: ~1×level = full, ~0.75 = three_quarter, ~0.5 = half. */
function babProgFromTop(topBab: number, topLevel: number): BabProgression {
  const r = topLevel > 0 ? topBab / topLevel : 0;
  if (r >= 0.9) return "full";
  if (r >= 0.7) return "three_quarter";
  return "half";
}

/** good = ⌊L/2⌋+2 (so +2 at L1), poor = ⌊L/3⌋ (so +0 at L1). Prefer the unambiguous L1 value. */
function saveProg(l1: number | null, top: number | null, topLevel: number): SaveProgression {
  if (l1 != null) return l1 >= 2 ? "good" : "poor";
  if (top != null && topLevel > 0) {
    const good = Math.floor(topLevel / 2) + 2;
    const poor = Math.floor(topLevel / 3);
    return Math.abs(top - good) <= Math.abs(top - poor) ? "good" : "poor";
  }
  return "poor";
}

export function parseProgression(jsonData: unknown): ParsedProgression {
  const warnings: string[] = [];
  const rows: unknown[][] = Array.isArray(jsonData) ? (jsonData as unknown[][]).filter(Array.isArray) : [];

  // The column-header row carries both "Level" and a "Base Attack Bonus"/"BAB" column.
  const headerIdx = rows.findIndex(
    (r) => r.some((c) => /^level$/i.test(String(c).trim())) && r.some((c) => /base attack|^bab$/i.test(String(c).trim())),
  );
  const header = headerIdx >= 0 ? rows[headerIdx]!.map((c) => String(c ?? "").trim().toLowerCase()) : [];
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const levelI = col(/^level$/);
  const babI = col(/base attack|^bab$/);
  const fortI = col(/fort/);
  const refI = col(/ref/);
  const willI = col(/will/);
  const specialI = col(/special/);
  // Spell columns sit after "Special" and are labelled by spell level (0, 1st … 9th).
  const spellCols = header
    .map((h, i) => ({ h, i }))
    .filter((x) => specialI >= 0 && x.i > specialI && /^(0|\d+(st|nd|rd|th))$/.test(x.h))
    .map((x) => x.i);

  const lvlOf = (r: unknown[]) => firstInt(r[levelI]) ?? 0;
  const data = rows.filter((r) => ORDINAL.test(String(r[levelI] ?? "")));

  if (data.length === 0 || babI < 0) {
    warnings.push("class_progression: could not locate the level/BAB columns; defaulting to half/poor.");
    return { bab: "half", saves: { fortitude: "poor", reflex: "poor", will: "poor" }, warnings };
  }

  const top = data.reduce((a, b) => (lvlOf(b) > lvlOf(a) ? b : a), data[0]!);
  const topLevel = lvlOf(top);
  const l1 = data.find((r) => lvlOf(r) === 1);

  const bab = babProgFromTop(firstInt(top[babI]) ?? 0, topLevel || 20);
  const saveAt = (i: number): SaveProgression =>
    i < 0 ? (warnings.push("missing save column"), "poor") : saveProg(l1 ? firstInt(l1[i]) : null, firstInt(top[i]), topLevel);
  const saves = { fortitude: saveAt(fortI), reflex: saveAt(refI), will: saveAt(willI) };

  let caster: ParsedProgression["caster"];
  if (spellCols.length > 0) {
    const firstSpellLevel = data
      .filter((r) => spellCols.some((ci) => (firstInt(r[ci]) ?? 0) > 0))
      .map(lvlOf)
      .sort((a, b) => a - b)[0];
    // Spells starting at 4th level is the paladin/ranger −3 partial-caster shape; otherwise full.
    caster = { clProgression: firstSpellLevel != null && firstSpellLevel >= 4 ? "minus_three" : "full" };
  }

  return { bab, saves, caster, warnings };
}

/** The non-progression inputs taken from the `class_compendium` row (parsed by the caller/RPC layer). */
export type CompendiumClassInput = {
  key: string;
  name: string;
  hitDie: 6 | 8 | 10 | 12;
  skillRanksPerLevel: number;
  classSkillKeys: string[];
  castingAbility?: AbilityKey;
  casterType?: CasterType;
  /** Raw `class_progression.json_data`. */
  progression: unknown;
};

/** Assemble a full {@link ClassPreset} from a compendium class row + its parsed progression. */
export function compendiumRowToPreset(input: CompendiumClassInput): { preset: ClassPreset; warnings: string[] } {
  const p = parseProgression(input.progression);
  const caster = p.caster
    ? {
        casterType: input.casterType ?? "prepared",
        castingAbility: input.castingAbility ?? "int",
        clProgression: p.caster.clProgression,
      }
    : undefined;
  return {
    preset: {
      key: input.key,
      name: input.name,
      hitDie: input.hitDie,
      bab: p.bab,
      saves: p.saves,
      skillRanksPerLevel: input.skillRanksPerLevel,
      classSkillKeys: input.classSkillKeys,
      caster,
    },
    warnings: p.warnings,
  };
}
