import { describe, it, expect } from "vitest";
import {
  createDefaultCharacter,
  familiarBaseBody,
  familiarStrengthBonus,
  familiarArchetypeAlters,
  type FamiliarBenefit,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import {
  applyFamiliarBaseBody,
  parseMasterBenefit,
  buildFamiliarBenefit,
  familiarBenefitsEqual,
} from "@/lib/character/companion-sync";

/* -------------------------------------------------------------------------- */
/* Familiar base bodies                                                        */
/* -------------------------------------------------------------------------- */

describe("familiar base bodies", () => {
  it("applies a real creature body to a familiar (cat: Tiny, low Str, natural attacks)", () => {
    const c = createDefaultCharacter({ name: "Whiskers" });
    applyFamiliarBaseBody(c, "cat");
    expect(c.identity.size).toBe("tiny");
    expect(c.abilities.primary.str.score).toBe(3);
    expect(c.abilities.primary.dex.score).toBe(15);
    expect(c.abilities.primary.int.score).toBe(2);
    expect(c.combat.speed.base).toContain("climb");
    expect(c.combat.attacks.map((a) => a.name)).toContain("bite");
    expect(c.features.list.some((f) => f.name === "Special qualities")).toBe(true);
  });

  it("falls back to a generic Tiny body for an unmapped familiar slug", () => {
    const body = familiarBaseBody("some-obscure-improved-familiar");
    expect(body.size).toBe("tiny");
    expect(body.abilityScores.dex).toBeGreaterThan(body.abilityScores.str);
  });

  it("the seeded low Int lets the master-level Int table apply correctly (raise-to works)", () => {
    const c = createDefaultCharacter({ name: "Whiskers" });
    applyFamiliarBaseBody(c, "cat"); // Int 2
    c.companion = {
      type: "familiar",
      syncEnabled: true,
      master: { characterId: "m", name: "M", level: 7, bab: 5, hpMax: 40, saves: { fortitude: 3, reflex: 3, will: 5 }, skillRanks: {} },
    };
    // familiarIntelligence(7) === 9, base 2 → raised to 9 (would have been stuck at 10 without a base body).
    expect(computeCharacter(c).abilities.int?.effectiveScore).toBe(9);
  });
});

/* -------------------------------------------------------------------------- */
/* Master-benefit parsing (familiar_compendium.granted_ability → effects)      */
/* -------------------------------------------------------------------------- */

describe("parseMasterBenefit", () => {
  it("parses a skill bonus and strips the source citation", () => {
    const r = parseMasterBenefit("Master gains a +3 bonus on Stealth checks | Animal Archive pg. 10, PRPG Core Rulebook pg. 82");
    expect(r.effects).toEqual([{ target: "skill.stealth", value: 3, note: undefined }]);
    expect(r.rawText).toBe("Master gains a +3 bonus on Stealth checks");
  });

  it("parses save, initiative, and hit-point benefits", () => {
    expect(parseMasterBenefit("Master gains a +2 bonus on Reflex saves | x").effects[0]).toMatchObject({ target: "save.reflex", value: 2 });
    expect(parseMasterBenefit("Master gains 3 hit points | x").effects[0]).toMatchObject({ target: "hp", value: 3 });
    const init = parseMasterBenefit("Master gains a +4 bonus on initiative checks (if familiar is within 1 mile) | x");
    expect(init.effects[0]).toMatchObject({ target: "init", value: 4 });
    expect(init.effects[0]!.note).toContain("within 1 mile");
  });

  it("maps a multi-word skill phrase and keeps the situational condition as a note", () => {
    const r = parseMasterBenefit("Master gains a +3 bonus on sight-based and opposed Perception checks in bright light | x");
    expect(r.effects[0]).toMatchObject({ target: "skill.perception", value: 3 });
    expect(r.effects[0]!.note).toContain("bright light");
  });

  it("preserves unparseable prose as rawText (never discards)", () => {
    const r = parseMasterBenefit("Master gains some strange narrative benefit | x");
    expect(r.effects).toHaveLength(0);
    expect(r.rawText).toBe("Master gains some strange narrative benefit");
  });

  it("parses the 'a +N hit points' phrasing (chicken/cockroach/lamprey)", () => {
    expect(parseMasterBenefit("Master gains a +3 hit points | x").effects[0]).toMatchObject({ target: "hp", value: 3 });
  });

  it("marks a conditional 'saves against disease' benefit as situational (noted)", () => {
    const r = parseMasterBenefit("Master gains a +3 bonus on Fortitude saves against disease (witch only) | x");
    expect(r.effects[0]).toMatchObject({ target: "save.fortitude", value: 3 });
    expect(r.effects[0]!.note).toBeTruthy();
    expect(r.effects[0]!.note).toContain("against disease");
  });
});

/* -------------------------------------------------------------------------- */
/* buildFamiliarBenefit (familiar sheet → master-facing benefit)               */
/* -------------------------------------------------------------------------- */

function linkedFamiliar(masterLevel: number, archetype?: string): PathForgeCharacterV1 {
  const c = createDefaultCharacter({ name: "Whiskers" });
  c.companion = {
    type: "familiar",
    syncEnabled: true,
    archetype,
    master: { characterId: "m", name: "M", level: masterLevel, bab: 5, hpMax: 40, saves: { fortitude: 3, reflex: 3, will: 5 }, skillRanks: {} },
    masterBenefit: { effects: [{ target: "skill.stealth", value: 3 }] },
  };
  return c;
}

describe("buildFamiliarBenefit", () => {
  it("builds the master benefit (Alertness + the specific bonus) from a linked familiar", () => {
    const b = buildFamiliarBenefit(linkedFamiliar(5), "fam1");
    expect(b).not.toBeNull();
    expect(b!.characterId).toBe("fam1");
    expect(b!.grantsAlertness).toBe(true);
    expect(b!.effects[0]).toMatchObject({ target: "skill.stealth", value: 3 });
  });

  it("returns null for an unlinked familiar or a non-familiar", () => {
    const unlinked = linkedFamiliar(5);
    unlinked.companion!.syncEnabled = false;
    expect(buildFamiliarBenefit(unlinked)).toBeNull();
    expect(buildFamiliarBenefit(createDefaultCharacter({ name: "Not a familiar" }))).toBeNull();
  });

  it("honors archetypes that keep Alertness for the familiar (grantsAlertness false)", () => {
    // Decoy replaces standard Alertness with its own archetype ability.
    expect(buildFamiliarBenefit(linkedFamiliar(5, "Decoy"))!.grantsAlertness).toBe(false);
  });

  it("falls back to parsing the stored 'Master benefit' feature when no structured benefit exists", () => {
    const c = linkedFamiliar(5);
    c.companion!.masterBenefit = undefined;
    c.features.list.push({ id: "f1", name: "Master benefit", category: "racial_trait", description: "Master gains a +2 bonus on Fortitude saves", automation: [] });
    const b = buildFamiliarBenefit(c, "fam1");
    expect(b!.effects[0]).toMatchObject({ target: "save.fortitude", value: 2 });
  });

  it("ignores an improved familiar's requirement text stored as a 'Master benefit' feature", () => {
    const c = linkedFamiliar(7);
    c.companion!.masterBenefit = undefined;
    // Improved familiars store alignment/requirement here, not a benefit.
    c.features.list.push({ id: "f1", name: "Master benefit", category: "racial_trait", description: "Lawful evil", automation: [] });
    const b = buildFamiliarBenefit(c, "fam1");
    expect(b!.effects).toHaveLength(0);
    expect(b!.rawText).toBeUndefined();
    expect(b!.grantsAlertness).toBe(true); // improved familiars still grant the master Alertness
  });

  it("familiarBenefitsEqual ignores syncedAt timestamps and array order", () => {
    const a: FamiliarBenefit[] = [{ name: "W", masterLevel: 5, grantsAlertness: true, effects: [{ target: "skill.stealth", value: 3 }], syncedAt: "t1" }];
    const b: FamiliarBenefit[] = [{ name: "W", masterLevel: 5, grantsAlertness: true, effects: [{ target: "skill.stealth", value: 3 }], syncedAt: "t2" }];
    expect(familiarBenefitsEqual(a, b)).toBe(true);
    expect(familiarBenefitsEqual(a, [])).toBe(false);

    const x: FamiliarBenefit[] = [
      { characterId: "id-a", name: "A", masterLevel: 5, grantsAlertness: true, effects: [] },
      { characterId: "id-b", name: "B", masterLevel: 5, grantsAlertness: true, effects: [] },
    ];
    expect(familiarBenefitsEqual(x, [x[1]!, x[0]!])).toBe(true); // reordered → still equal
  });
});

/* -------------------------------------------------------------------------- */
/* Engine: the MASTER gains its familiars' benefits                            */
/* -------------------------------------------------------------------------- */

function masterWith(familiars: FamiliarBenefit[]): PathForgeCharacterV1 {
  const m = createDefaultCharacter({ name: "Elandra" });
  m.familiars = familiars;
  return m;
}

describe("engine — master gains the familiar's benefit", () => {
  it("applies Alertness (+2 Perception / +2 Sense Motive) and the specific skill bonus", () => {
    const out = computeCharacter(masterWith([{ name: "Whiskers", masterLevel: 5, grantsAlertness: true, effects: [{ target: "skill.stealth", value: 3 }] }]));
    expect(out.skills.perception!.value).toBe(2);
    expect(out.skills.sense_motive!.value).toBe(2);
    expect(out.skills.stealth!.value).toBe(3);
    expect(out.summary.masterFamiliars).toHaveLength(1);
  });

  it("applies save, initiative, and hit-point benefits to the master", () => {
    const out = computeCharacter(
      masterWith([
        { name: "Rat", masterLevel: 3, grantsAlertness: false, effects: [{ target: "save.fortitude", value: 2 }] },
        { name: "Scorpion", masterLevel: 3, grantsAlertness: false, effects: [{ target: "init", value: 4 }] },
        { name: "Toad", masterLevel: 3, grantsAlertness: false, effects: [{ target: "hp", value: 3 }] },
      ]),
    );
    expect(out.summary.fortitude).toBe(2);
    expect(out.summary.initiative).toBe(4);
    expect(out.summary.hp.max).toBe(3);
  });

  it("does not fold a situational (noted) effect into the base total", () => {
    const out = computeCharacter(
      masterWith([{ name: "Giant Flea", masterLevel: 5, grantsAlertness: false, effects: [{ target: "save.fortitude", value: 3, note: "against disease" }] }]),
    );
    expect(out.summary.fortitude).toBe(0); // situational → shown on the card, not applied to the base
    expect(out.summary.masterFamiliars![0]!.effects[0]!.note).toBe("against disease");
  });

  it("two familiars do not double-stack Alertness", () => {
    const out = computeCharacter(
      masterWith([
        { name: "Cat", masterLevel: 5, grantsAlertness: true, effects: [] },
        { name: "Owl", masterLevel: 5, grantsAlertness: true, effects: [] },
      ]),
    );
    expect(out.skills.perception!.value).toBe(2); // not 4
  });

  it("a character with no familiars has no masterFamiliars roll-up", () => {
    expect(computeCharacter(createDefaultCharacter({ name: "Solo" })).summary.masterFamiliars).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Mauler's Increased Strength                                                  */
/* -------------------------------------------------------------------------- */

describe("Mauler Increased Strength", () => {
  it("familiarStrengthBonus follows +1 at L3, +1 per 2 levels after", () => {
    const mauler = familiarArchetypeAlters("Mauler");
    expect(familiarStrengthBonus(2, mauler)).toBe(0);
    expect(familiarStrengthBonus(3, mauler)).toBe(1);
    expect(familiarStrengthBonus(5, mauler)).toBe(2);
    expect(familiarStrengthBonus(11, mauler)).toBe(5);
    // A non-Mauler archetype has no strength progression.
    expect(familiarStrengthBonus(11, familiarArchetypeAlters("Sage"))).toBe(0);
  });

  it("a Mauler familiar's Strength rises in the engine", () => {
    const c = createDefaultCharacter({ name: "Brute" }); // Str 10 default
    c.companion = {
      type: "familiar",
      syncEnabled: true,
      archetype: "Mauler",
      master: { characterId: "m", name: "M", level: 5, bab: 2, hpMax: 20, saves: { fortitude: 1, reflex: 1, will: 1 }, skillRanks: {} },
    };
    expect(computeCharacter(c).abilities.str?.effectiveScore).toBe(12); // 10 + Mauler +2 at master L5
  });
});

/* -------------------------------------------------------------------------- */
/* View-model gating                                                           */
/* -------------------------------------------------------------------------- */

describe("view-model — familiarBenefits", () => {
  const master = masterWith([{ name: "Whiskers", masterLevel: 5, grantsAlertness: true, effects: [{ target: "skill.stealth", value: 3 }] }]);

  it("owner sees the familiar's name; a public viewer sees the benefit but not the name", () => {
    const computed = computeCharacter(master);
    const owner = buildCharacterViewModel(master, computed, "owner");
    expect(owner.familiarBenefits).toHaveLength(1);
    expect(owner.familiarBenefits![0]!.name).toBe("Whiskers");

    const anon = buildCharacterViewModel(master, computed, "anonymous");
    expect(anon.familiarBenefits![0]!.name).toBe("Familiar");
    expect(anon.familiarBenefits![0]!.effects[0]!.value).toBe(3);
  });

  it("is hidden when the companion section is set owner-only", () => {
    const hidden = { ...master, privacy: { ...master.privacy, sections: { companion: "owner_only" as const } } };
    expect(buildCharacterViewModel(hidden, computeCharacter(hidden), "anonymous").familiarBenefits).toBeNull();
  });
});
