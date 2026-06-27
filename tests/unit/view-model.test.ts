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
