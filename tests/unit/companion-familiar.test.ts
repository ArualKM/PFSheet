import { describe, it, expect } from "vitest";
import { createDefaultCharacter, familiarGrantedAbilities, familiarIntelligence, familiarNaturalArmor } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { masterCacheEquals } from "@/lib/character/companion-sync";

function familiar(masterLevel: number) {
  const c = createDefaultCharacter({ name: "Whiskers" });
  c.abilities.primary.dex.score = 17; // +3
  c.abilities.primary.int.score = 2;
  c.companion = {
    type: "familiar",
    syncEnabled: true,
    master: {
      characterId: "m1",
      name: "Elandra",
      level: masterLevel,
      bab: 5,
      hpMax: 61,
      saves: { fortitude: 3, reflex: 3, will: 7 },
      skillRanks: { perception: 8 },
    },
  };
  return c;
}

describe("familiar master link (CRB familiar basics)", () => {
  it("hp max is half the master's, rounded down", () => {
    const out = computeCharacter(familiar(10));
    expect(out.summary.hp.max).toBe(30); // floor(61/2)
  });

  it("attack bonuses use the master's BAB", () => {
    const c = familiar(10);
    const out = computeCharacter(c);
    // melee = bab + str mod (str 10 → +0)
    expect(out.attackBonuses.melee.value).toBe(5);
  });

  it("saves use the better of own base or the master's, with OWN ability mods", () => {
    const c = familiar(10);
    c.defenses.savingThrows.fortitude.base = 2; // own familiar base Fort +2 < master 3
    c.defenses.savingThrows.reflex.base = 2; // own +2 < master 3
    c.defenses.savingThrows.will.base = 0; // own 0 < master 7
    const out = computeCharacter(c);
    expect(out.summary.fortitude).toBe(3); // master base 3 + con 0
    expect(out.summary.reflex).toBe(3 + 3); // master base 3 + own dex +3
    expect(out.summary.will).toBe(7); // master base 7 + wis 0
  });

  it("keeps the familiar's own base save when it is better", () => {
    const c = familiar(1);
    c.companion!.master!.saves = { fortitude: 0, reflex: 0, will: 2 };
    c.defenses.savingThrows.fortitude.base = 2;
    const out = computeCharacter(c);
    expect(out.summary.fortitude).toBe(2);
  });

  it("natural armor adjustment reaches AC and flat-footed but never touch", () => {
    const c = familiar(10); // adj +5
    const out = computeCharacter(c);
    // AC = 10 + dex 3 + NA 5; touch = 10 + dex 3; flat-footed = 10 + NA 5
    expect(out.summary.ac).toBe(18);
    expect(out.summary.touch).toBe(13);
    expect(out.summary.flatFooted).toBe(15);
  });

  it("Intelligence rises to the master-level table value", () => {
    const out = computeCharacter(familiar(7)); // table: 9
    expect(out.abilities.int?.effectiveScore).toBe(9);
    expect(familiarIntelligence(1)).toBe(6);
    expect(familiarIntelligence(20)).toBe(15);
  });

  it("skills use the better of own or master ranks (own ability mods)", () => {
    const c = familiar(10); // master perception ranks 8
    const perception = c.skills.list.find((s) => s.key === "perception")!;
    perception.ranks = 2;
    perception.classSkill = false;
    const out = computeCharacter(c);
    expect(out.skills.perception!.value).toBe(8); // max(2, 8) + wis 0
  });

  it("summary.companion reports the roll-up (SR at master 11+)", () => {
    const out = computeCharacter(familiar(11)).summary.companion!;
    expect(out.type).toBe("familiar");
    expect(out.synced).toBe(true);
    expect(out.spellResistance).toBe(16);
    expect(out.naturalArmorAdj).toBe(6);
    expect(out.grantedAbilities.map((a) => a.name)).toContain("Spell Resistance");
    expect(out.grantedAbilities.map((a) => a.name)).not.toContain("Scry on Familiar"); // level 13
  });

  it("sync disabled leaves the sheet's own math untouched", () => {
    const c = familiar(10);
    c.companion!.syncEnabled = false;
    c.health.maxHp = 7;
    const out = computeCharacter(c);
    expect(out.summary.hp.max).toBe(7);
    expect(out.attackBonuses.melee.value).toBe(0);
  });
});

describe("familiar archetypes modify granted abilities", () => {
  it("standard progression gates by master level", () => {
    const names = familiarGrantedAbilities(5).map((a) => a.name);
    expect(names).toContain("Alertness");
    expect(names).toContain("Deliver Touch Spells");
    expect(names).toContain("Speak with Master");
    expect(names).not.toContain("Speak with Animals of Its Kind"); // level 7
  });

  it("the Decoy archetype swaps Alertness + the speak abilities for its own", () => {
    const abilities = familiarGrantedAbilities(11, "Decoy");
    const names = abilities.map((a) => a.name.toLowerCase());
    expect(names).not.toContain("alertness");
    expect(names.some((n) => n.includes("deceitful"))).toBe(true);
    expect(names.some((n) => n.includes("mockingbird"))).toBe(true);
    expect(names).not.toContain("speak with master");
    // Unreplaced standards remain
    expect(names).toContain("improved evasion");
  });

  it("archetype abilities respect their own master-level gates", () => {
    const atL1 = familiarGrantedAbilities(1, "Decoy").map((a) => a.name.toLowerCase());
    expect(atL1.some((n) => n.includes("mockingbird"))).toBe(false); // level 5 gate
    // Alertness is replaced by a level-1 archetype ability, so it's gone even at L1
    expect(atL1).not.toContain("alertness");
  });

  it("natural armor table matches the CRB progression", () => {
    expect(familiarNaturalArmor(1)).toBe(1);
    expect(familiarNaturalArmor(2)).toBe(1);
    expect(familiarNaturalArmor(3)).toBe(2);
    expect(familiarNaturalArmor(20)).toBe(10);
  });

  it("a replaced standard ability is NEVER granted, even before its replacement's level", () => {
    // Animal Exemplar's L7 wild empathy replaces deliver touch spells (L3): at master L3-6 the
    // familiar must NOT show Deliver Touch Spells (PF archetype semantics).
    const names = familiarGrantedAbilities(3, "Animal Exemplar").map((a) => a.name.toLowerCase());
    expect(names.join(" | ")).not.toContain("deliver touch spells");
  });
});

describe("archetype numeric alters", () => {
  it("Sage: Int = 5 + master level (uncapped), natural armor as if half level, no master skill ranks", () => {
    const c = familiar(8);
    c.companion!.archetype = "Sage";
    const perception = c.skills.list.find((s) => s.key === "perception")!;
    perception.ranks = 1;
    perception.classSkill = false;
    const out = computeCharacter(c);
    expect(out.abilities.int?.effectiveScore).toBe(13); // 5 + 8, not the table's 9
    // NA as if master level 4 → +2 (standard L8 would be +4): AC = 10 + dex 3 + 2
    expect(out.summary.ac).toBe(15);
    // Master has 8 perception ranks, but the Sage traded rank-sharing away.
    expect(out.skills.perception!.value).toBe(1);
  });

  it("Sage at L20 exceeds the standard Int cap", () => {
    const c = familiar(20);
    c.companion!.archetype = "Sage";
    expect(computeCharacter(c).abilities.int?.effectiveScore).toBe(25);
  });

  it("Ambassador/Mauler: Int never rises with level", () => {
    for (const arch of ["Ambassador", "Mauler"]) {
      const c = familiar(10);
      c.companion!.archetype = arch;
      expect(computeCharacter(c).abilities.int?.effectiveScore).toBe(2);
    }
  });

  it("Protector: HP equals the master's at master 11+, standard half below", () => {
    const at11 = familiar(11);
    at11.companion!.master!.hpMax = 100;
    at11.companion!.archetype = "Protector";
    expect(computeCharacter(at11).summary.hp.max).toBe(100);

    const at8 = familiar(8);
    at8.companion!.master!.hpMax = 100;
    at8.companion!.archetype = "Protector";
    expect(computeCharacter(at8).summary.hp.max).toBe(50);
  });

  it("Figment: HP is a quarter of the master's", () => {
    const c = familiar(5);
    c.companion!.master!.hpMax = 61;
    c.companion!.archetype = "Figment";
    expect(computeCharacter(c).summary.hp.max).toBe(15);
  });

  it("an archetype that traded Spell Resistance away suppresses the SR number", () => {
    const c = familiar(12);
    c.companion!.archetype = "Mauler";
    const out = computeCharacter(c).summary.companion!;
    expect(out.spellResistance).toBeUndefined();
    expect(out.grantedAbilities.map((a) => a.name)).not.toContain("Spell Resistance");
    // …while a standard familiar at the same level keeps it.
    const std = familiar(12);
    expect(computeCharacter(std).summary.companion!.spellResistance).toBe(17);
  });
});

describe("effective BAB single source", () => {
  it("summary.bab, weapon attacks, and @{combat.bab.total} refs all use the master's BAB", () => {
    const c = familiar(10); // master bab 5
    c.inventory.weapons.push({
      id: "w1",
      name: "Tiny dagger",
      category: "weapon",
      equipped: true,
      weapon: {
        ranged: false,
        attackAbility: "str",
        damageAbility: "str",
        handed: "one",
        enhancement: 0,
        damageDice: "1d2",
      },
      modifiers: [],
      automation: [],
    } as never);
    const out = computeCharacter(c);
    expect(out.summary.bab).toBe(5);
    expect(out.attackBonuses.melee.value).toBe(5); // bab 5 + str 0
    const dagger = out.attacks.find((a) => a.name.includes("dagger"));
    expect(dagger?.attackBonus).toBe(5);
  });

  it("a non-companion keeps its own stored BAB in summary.bab", () => {
    const c = createDefaultCharacter({ name: "Y" });
    c.combat.bab.total = 3;
    expect(computeCharacter(c).summary.bab).toBe(3);
  });
});

describe("view-model + sync guards", () => {
  it("vm.companion is §15-gated (hideable) and hides the master's identity from non-owners", () => {
    const c = familiar(9);
    const computed = computeCharacter(c);
    const anon = buildCharacterViewModel(c, computed, "anonymous");
    expect(anon.companion).not.toBeNull();
    expect(anon.companion!.master?.name).toBeUndefined();
    expect(anon.companion!.master?.characterId).toBeUndefined();
    expect(anon.companion!.master?.level).toBe(9);

    const owner = buildCharacterViewModel(c, computed, "owner");
    expect(owner.companion!.master?.name).toBe("Elandra");

    c.privacy.sections.companion = "owner_only";
    const hidden = buildCharacterViewModel(c, computeCharacter(c), "anonymous");
    expect(hidden.companion).toBeNull();
  });

  it("masterCacheEquals is insensitive to jsonb key reordering in skillRanks", () => {
    const c = familiar(10);
    const cache = c.companion!.master!;
    const reordered = {
      ...cache,
      syncedAt: "different-time",
      skillRanks: Object.fromEntries(Object.entries({ stealth: 3, perception: 8 })),
    };
    const original = { ...cache, skillRanks: { perception: 8, stealth: 3 } };
    expect(masterCacheEquals(original, reordered)).toBe(true);
  });
});
