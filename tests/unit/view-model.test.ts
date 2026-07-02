import { describe, it, expect } from "vitest";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { buildCharacterViewModel, canSee } from "@/lib/character/view-model";

function build(viewer: Parameters<typeof buildCharacterViewModel>[2], mutate?: (c: ReturnType<typeof createDefaultCharacter>) => void) {
  const c = createDefaultCharacter({ name: "Seraphina Vale" });
  c.identity.race = "Aasimar";
  c.identity.classes = [{ id: "c1", name: "Paladin", level: 5 }];
  c.identity.totalLevel = 5;
  c.profile.backstory = "Raised in a sky temple.";
  mutate?.(c);
  return buildCharacterViewModel(c, computeCharacter(c), viewer);
}

describe("canSee", () => {
  it("encodes the privacy hierarchy", () => {
    expect(canSee("public", "anonymous")).toBe(true);
    expect(canSee("private", "anonymous")).toBe(false);
    expect(canSee("gm_only", "gm")).toBe(true);
    expect(canSee("gm_only", "campaign_player")).toBe(false);
    expect(canSee("owner_only", "gm")).toBe(false);
    expect(canSee("private", "owner")).toBe(true);
    expect(canSee("party", "party_viewer")).toBe(true);
    expect(canSee("campaign", "party_viewer")).toBe(false);
  });
});

describe("buildCharacterViewModel — public/anonymous never leaks private fields", () => {
  it("always exposes the mechanical core to anonymous viewers", () => {
    const vm = build("anonymous");
    expect(vm.vitals.ac.total).toBeGreaterThanOrEqual(10);
    expect(vm.abilities).toHaveLength(6);
    expect(vm.header.name).toBe("Seraphina Vale");
  });

  it("surfaces conditional defenses with formatted labels", () => {
    const vm = build("owner", (c) => {
      c.defenses.conditionalDefenses.push({ id: "cd1", target: "saves", bonus: 2, condition: "fear" });
      c.defenses.conditionalDefenses.push({ id: "cd2", target: "fortitude", bonus: 4, condition: "poison" });
    });
    expect(vm.defenses.conditional).toEqual([
      { label: "+2 saves", condition: "fear" },
      { label: "+4 Fort", condition: "poison" },
    ]);
  });

  it("omits blank conditional-defense rows", () => {
    const vm = build("owner", (c) => {
      c.defenses.conditionalDefenses.push({ id: "cd1", target: "saves", bonus: 0, condition: "" });
    });
    expect(vm.defenses.conditional).toHaveLength(0);
  });

  it("surfaces a feature's daily-use tracker (domain/bloodline powers)", () => {
    const vm = build("owner", (c) => {
      c.features.list.push({
        id: "f1",
        name: "Touch of Law",
        category: "class_feature",
        automation: [],
        uses: { id: "u1", max: 7, current: 5, per: "day" },
      });
      c.features.list.push({ id: "f2", name: "Aura of Law", category: "class_feature", automation: [] });
    });
    expect(vm.features?.find((f) => f.name === "Touch of Law")?.uses).toEqual({
      max: 7,
      remaining: 5,
      per: "day",
    });
    expect(vm.features?.find((f) => f.name === "Aura of Law")?.uses).toBeUndefined();
  });

  it("hides backstory from anonymous when the owner marks it private", () => {
    const vm = build("anonymous", (c) => {
      c.privacy.sections.backstory = "private";
    });
    expect(vm.profile).toBeNull();
    expect(vm.hiddenSections).toContain("Backstory & profile");
  });

  it("shows backstory to the owner regardless", () => {
    const vm = build("owner", (c) => {
      c.privacy.sections.backstory = "private";
    });
    expect(vm.profile?.backstory).toBe("Raised in a sky temple.");
  });

  it("gates buffs behind gm_only privacy", () => {
    const mutate = (c: ReturnType<typeof createDefaultCharacter>) => {
      c.buffs.active = [{ id: "b", name: "Haste", enabled: true, effects: [] }];
      c.privacy.sections.buffs = "gm_only";
    };
    expect(build("anonymous", mutate).buffs).toBeNull();
    expect(build("gm", mutate).buffs).toHaveLength(1);
    expect(build("anonymous", mutate).hiddenSections).toContain("Active buffs");
  });

  it("gates the spheres section behind privacy (was capability-only before Pass 3b)", () => {
    const withSpheres = (c: ReturnType<typeof createDefaultCharacter>) => {
      c.rules.modules.push({ key: "spheres_of_power", enabled: true, settings: {} });
      c.spheres = {
        casterClasses: [
          { id: "c1", className: "Incanter", system: "Magic", casterType: "high", classLevel: 5, castingAbility: "int" },
        ],
        spheres: [{ id: "s1", name: "Destruction", system: "Magic" }],
        talents: [],
        drawbacks: [],
        boons: [],
        bonusSpellPoints: 0,
      };
    };
    expect(build("anonymous", withSpheres).spheres).not.toBeNull(); // public by default
    const hidden = build("anonymous", (c) => {
      withSpheres(c);
      c.privacy.sections.spheres = "private";
    });
    expect(hidden.spheres).toBeNull();
    expect(hidden.hiddenSections).toContain("Spheres");
  });

  // Every optional-rules module that surfaces its own card must respect §15 like core sections —
  // otherwise enabling Mythic/Psionics/etc. would leak on a public share or the API (both built here).
  const OPTIONAL_SYSTEMS: Array<{
    key: "heroPoints" | "honor" | "stamina" | "mythic" | "psionics" | "pathOfWar" | "milestoneLeveling";
    label: string;
    setup: (c: ReturnType<typeof createDefaultCharacter>) => void;
  }> = [
    {
      key: "heroPoints",
      label: "Hero Points",
      setup: (c) => {
        c.rules.modules.push({ key: "hero_points", enabled: true, settings: {} });
        c.heroPoints = { current: 2, bonusMax: 0, log: [] };
      },
    },
    {
      key: "honor",
      label: "Honor",
      setup: (c) => {
        c.rules.modules.push({ key: "honor", enabled: true, settings: {} });
        c.honor = { code: "general", events: [] };
      },
    },
    {
      key: "stamina",
      label: "Stamina pool",
      setup: (c) => {
        c.rules.modules.push({ key: "stamina", enabled: true, settings: {} });
        c.stamina = { current: 5, bonusMax: 0 };
      },
    },
    {
      key: "mythic",
      label: "Mythic",
      setup: (c) => {
        c.rules.variants.mythic = true;
        c.mythic = { tier: 2, path: "champion", abilityBoosts: [], pathAbilities: [] };
      },
    },
    {
      key: "psionics",
      label: "Psionics",
      setup: (c) => {
        c.rules.modules.push({ key: "psionics", enabled: true, settings: {} });
        c.abilities.primary.int.score = 18;
        c.psionics = {
          classes: [
            { id: "p1", className: "Psion", manifesterLevel: 10, keyAbility: "int", basePowerPoints: 90, discipline: "telepathy" },
          ],
          powersKnown: [{ id: "pw1", name: "Energy Ray", level: 1 }],
        };
      },
    },
    {
      key: "pathOfWar",
      label: "Path of War",
      setup: (c) => {
        c.rules.modules.push({ key: "path_of_war", enabled: true, settings: {} });
        c.pathOfWar = {
          initiators: [
            { id: "i1", className: "Stalker", classLevel: 5, initiationAbility: "", recoveryMethod: "standard_action", disciplineKeys: [] },
          ],
          maneuvers: [],
        };
      },
    },
    {
      key: "milestoneLeveling",
      label: "Milestone Leveling",
      setup: (c) => {
        c.rules.modules.push({ key: "milestone_leveling", enabled: true, settings: {} });
        c.milestoneLeveling = { current: 0, log: [] };
      },
    },
  ];

  for (const sys of OPTIONAL_SYSTEMS) {
    it(`gates the ${sys.label} optional system behind §15 privacy`, () => {
      // Public by default — present for an anonymous viewer (no behavior change for existing shares).
      expect(build("anonymous", sys.setup)[sys.key]).not.toBeNull();
      // Marked private — null for anonymous, named on the share, but the owner still sees it.
      const lock = (c: ReturnType<typeof createDefaultCharacter>) => {
        sys.setup(c);
        c.privacy.sections[sys.key] = "private";
      };
      const hidden = build("anonymous", lock);
      expect(hidden[sys.key]).toBeNull();
      expect(hidden.hiddenSections).toContain(sys.label);
      expect(build("owner", lock)[sys.key]).not.toBeNull();
    });
  }

  // The power picker caches compendium detail onto powersKnown entries. Inside the psionics gate,
  // short mechanical meta (range/display/save/…) is viewer-safe like a spell's cached fields, but
  // the long rules text (description/augment/mythic) stays owner-only — as it always has.
  it("keeps psionic power rules text owner-only while exposing cached mechanical meta", () => {
    const mutate = (c: ReturnType<typeof createDefaultCharacter>) => {
      c.rules.modules.push({ key: "psionics", enabled: true, settings: {} });
      c.psionics = {
        classes: [
          { id: "p1", className: "Psion", manifesterLevel: 5, keyAbility: "int", basePowerPoints: 25, discipline: "telepathy" },
        ],
        powersKnown: [
          {
            id: "pw1",
            name: "Energy Ray",
            level: 1,
            ppCost: 1,
            discipline: "Psychokinesis",
            descriptors: "see text",
            display: "Auditory",
            manifestingTime: "1 standard action",
            range: "Close (25 ft. + 5 ft./2 levels)",
            targetAreaEffect: "Ray",
            duration: "Instantaneous",
            savingThrow: "None",
            powerResistance: "Yes",
            description: "You create a ray of energy…",
            augment: "For each additional power point…",
            special: "This power can be taken as a talent…",
            mythic: "The ray deals more damage…",
          },
        ],
      };
    };
    const anonPower = build("anonymous", mutate).psionics!.powers[0]!;
    expect(anonPower.range).toBe("Close (25 ft. + 5 ft./2 levels)");
    expect(anonPower.display).toBe("Auditory");
    expect(anonPower.ppCost).toBe(1);
    // Target/Area + descriptors are mechanical meta — viewer-safe like range/duration.
    expect(anonPower.targetAreaEffect).toBe("Ray");
    expect(anonPower.descriptors).toBe("see text");
    expect(anonPower.description).toBeUndefined();
    expect(anonPower.augment).toBeUndefined();
    expect(anonPower.special).toBeUndefined();
    expect(anonPower.mythic).toBeUndefined();
    const ownPower = build("owner", mutate).psionics!.powers[0]!;
    expect(ownPower.description).toBe("You create a ray of energy…");
    expect(ownPower.augment).toBe("For each additional power point…");
    expect(ownPower.special).toBe("This power can be taken as a talent…");
    expect(ownPower.mythic).toBe("The ray deals more damage…");
  });

  // Same tiering for Path of War maneuvers: mechanical meta (level/type/action/range/save/DC and the
  // readied/expended lifecycle) is viewer-safe within the gate; the 3pp rules text + notes are owner-only.
  it("keeps maneuver rules text owner-only while exposing cached mechanical meta", () => {
    const mutate = (c: ReturnType<typeof createDefaultCharacter>) => {
      c.rules.modules.push({ key: "path_of_war", enabled: true, settings: {} });
      c.abilities.primary.wis.score = 18; // +4 — Stalker keys off Wis
      c.pathOfWar = {
        initiators: [
          { id: "i1", className: "Stalker", classLevel: 5, initiationAbility: "", recoveryMethod: "standard_action", disciplineKeys: [] },
        ],
        maneuvers: [
          {
            id: "m1",
            name: "Steel Serpent Strike",
            level: 2,
            discipline: "Steel Serpent",
            entryKind: "maneuver",
            maneuverType: "Strike",
            initiationAction: "Standard action",
            range: "Melee attack",
            duration: "Instant",
            savingThrow: "Fortitude partial",
            prerequisites: "One Steel Serpent maneuver",
            description: "You strike a nerve cluster…",
            notes: "save for boss fights",
            readied: true,
            expended: false,
            granted: false,
            stanceActive: false,
            automation: [],
          },
        ],
      };
    };
    const anon = build("anonymous", mutate).pathOfWar!;
    expect(anon.initiators[0]!.initiatorLevel).toBe(5);
    expect(anon.readied).toBe(1);
    const anonM = anon.maneuvers[0]!;
    expect(anonM.maneuverType).toBe("Strike");
    expect(anonM.range).toBe("Melee attack");
    expect(anonM.savingThrow).toBe("Fortitude partial");
    expect(anonM.readied).toBe(true);
    expect(anonM.saveDc).toBe(16); // 10 + level 2 + Wis 4
    expect(anonM.description).toBeUndefined();
    expect(anonM.notes).toBeUndefined();
    const ownM = build("owner", mutate).pathOfWar!.maneuvers[0]!;
    expect(ownM.description).toBe("You strike a nerve cluster…");
    expect(ownM.notes).toBe("save for boss fights");
  });

  // Invariants for the systems deliberately NOT section-gated, so a future change can't silently
  // flip them: Wounds & Vigor is a dual-pool HP REPLACEMENT (same category as hp — always-public core
  // vitals), senses is a core trait (only its notes are owner-only), and advancement/XP is owner-only.
  it("does not section-gate Wounds & Vigor (it is core vitals, like hp)", () => {
    const vm = build("anonymous", (c) => {
      c.rules.variants.woundsVigor = true; // HP-replacement pool — stays visible like hp
    });
    expect(vm.vitals.woundsVigor).not.toBeNull();
  });

  it("shows senses to anonymous but keeps senses.notes owner-only", () => {
    const mutate = (c: ReturnType<typeof createDefaultCharacter>) => {
      c.senses.vision = ["Darkvision 60 ft"];
      c.senses.notes = "secret tremorsense quirk";
    };
    const anon = build("anonymous", mutate);
    expect(anon.senses.vision).toContain("Darkvision 60 ft");
    expect(anon.senses.notes).toBeUndefined();
    expect(build("owner", mutate).senses.notes).toBe("secret tremorsense quirk");
  });

  it("keeps advancement (XP) owner-only", () => {
    const mutate = (c: ReturnType<typeof createDefaultCharacter>) => {
      c.progression.currentXp = 1000;
    };
    expect(build("anonymous", mutate).advancement).toBeNull();
    expect(build("owner", mutate).advancement).not.toBeNull();
  });

  it("respects formulaDetails privacy for the show-math affordance", () => {
    const mutate = (c: ReturnType<typeof createDefaultCharacter>) => {
      c.privacy.sections.formulaDetails = "owner_only";
    };
    expect(build("anonymous", mutate).canSeeMath).toBe(false);
    expect(build("owner", mutate).canSeeMath).toBe(true);
  });

  it("never includes private notes or GM secrets in the model shape", () => {
    const vm = build("anonymous", (c) => {
      c.notes.secrets = "the relic is fake";
      c.notes.player = "remember to buy potions";
    });
    expect(JSON.stringify(vm)).not.toContain("the relic is fake");
    expect(JSON.stringify(vm)).not.toContain("remember to buy potions");
  });
});
