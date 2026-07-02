import type { PathForgeCharacterV1, ViewerContext, PrivacyLevel, SpellRef, SphereSystem } from "@pathforge/schema";
import { ABILITY_KEYS, grantsTargeting, grantSystem, systemTradition, talentSystem } from "@pathforge/schema";
import type { ComputedCharacter } from "@pathforge/rules-pf1e";
import { languageBudget, type LanguageBudget } from "./languages";
import { iterativeAttackBonuses } from "./combat";

/**
 * §15 Privacy system. `buildCharacterViewModel` turns a canonical sheet + its
 * computed values into a presentation model filtered for a specific viewer.
 * Public/anonymous viewers never receive private notes, GM secrets, or any
 * section the owner has restricted — this is the single source of truth for what
 * each audience may see, used by both the owner overview and the public share.
 */

const ALL_CONTEXTS = [
  "owner",
  "editor",
  "gm",
  "campaign_player",
  "party_viewer",
  "public",
  "anonymous",
  "api",
  "discord_public",
] as const satisfies readonly ViewerContext[];

/** Which viewer contexts may see a section at each privacy level. */
const LEVEL_ALLOWED: Record<PrivacyLevel, ReadonlySet<ViewerContext>> = {
  public: new Set(ALL_CONTEXTS),
  party: new Set(["owner", "editor", "gm", "campaign_player", "party_viewer"]),
  campaign: new Set(["owner", "editor", "gm", "campaign_player"]),
  gm_only: new Set(["owner", "editor", "gm"]),
  owner_only: new Set(["owner", "editor"]),
  private: new Set(["owner", "editor"]),
  custom: new Set(["owner", "editor"]),
};

export function canSee(level: PrivacyLevel, viewer: ViewerContext): boolean {
  return LEVEL_ALLOWED[level].has(viewer);
}

/** Default privacy for each logical section when the sheet doesn't override it. */
const DEFAULT_SECTION_PRIVACY: Record<string, PrivacyLevel> = {
  portrait: "public",
  stats: "public",
  abilities: "public",
  saves: "public",
  skills: "public",
  attacks: "public",
  feats: "public",
  features: "public",
  buffs: "public",
  spells: "public",
  spheres: "public",
  // Optional-rules module sections — gated like every core section (§15) so they never leak on a
  // public share or the API. Default public (matches the owner's "most things public" stance, and
  // keeps existing shares unchanged); lock any down in the privacy editor.
  heroPoints: "public",
  honor: "public",
  stamina: "public",
  mythic: "public",
  psionics: "public",
  milestoneLeveling: "public",
  formulaDetails: "public",
  backstory: "public",
  // Public by default — a shared sheet is opt-in, so most owners want it all visible. Owners who want
  // their loot/gold hidden (e.g. in a campaign) can set these to Party/Private in the privacy editor.
  inventory: "public",
  wealth: "public",
  journal: "party",
  privateNotes: "owner_only",
  gmSecrets: "gm_only",
  auditHistory: "gm_only",
};

export function effectiveLevel(character: PathForgeCharacterV1, section: string): PrivacyLevel {
  return (
    character.privacy.sections[section] ??
    DEFAULT_SECTION_PRIVACY[section] ??
    character.privacy.defaultLevel
  );
}

function visible(character: PathForgeCharacterV1, section: string, viewer: ViewerContext): boolean {
  return canSee(effectiveLevel(character, section), viewer);
}

const SECTION_LABELS: Record<string, string> = {
  buffs: "Active buffs",
  spells: "Spellcasting",
  spheres: "Spheres",
  heroPoints: "Hero Points",
  honor: "Honor",
  stamina: "Stamina pool",
  mythic: "Mythic",
  psionics: "Psionics",
  milestoneLeveling: "Milestone Leveling",
  backstory: "Backstory & profile",
  inventory: "Inventory",
  wealth: "Wealth",
  journal: "Campaign journal",
  privateNotes: "Private notes",
  gmSecrets: "GM secrets",
};

/** A spell as shown on the sheet — detail cached from the compendium; `notes` is owner-only. */
export type SpellView = {
  name: string;
  level: number;
  school?: string;
  subschool?: string;
  descriptor?: string;
  castingTime?: string;
  components?: string;
  range?: string;
  area?: string;
  effect?: string;
  targets?: string;
  duration?: string;
  savingThrow?: string;
  spellResistance?: string;
  description?: string;
  notes?: string;
  /** Cast at will (known spells, e.g. a bloodline/SLA-style at-will). */
  atWill?: boolean;
  /** Applied metamagic feat names (prepared spells only). */
  metamagic?: string[];
  /** Slot level after metamagic, when it differs from the base level. */
  effectiveLevel?: number;
};

export type CharacterViewModel = {
  viewer: ViewerContext;
  isOwnerView: boolean;
  canSeeMath: boolean;
  header: {
    name: string;
    /** Real-world player name (PII) — owner/editor view only, never on public shares. */
    playerName?: string;
    classLine: string;
    /** Per-class breakdown for the header — name + level + the archetypes applied to that class (public; the
     * favored-class marker stays owner-only in `advancement`). */
    classes: Array<{ name: string; level: number; archetypes: string[] }>;
    totalLevel: number;
    race?: string;
    alignment?: string;
    size?: string;
    deity?: string;
    homeland?: string;
    ethnicity?: string;
    gender?: string;
    age?: string;
    height?: string;
    weight?: string;
    quote?: string;
    portraitUrl?: string;
    visibility: string;
  };
  vitals: {
    hp: {
      current: number;
      max: number;
      temp: number;
      nonlethal: number;
      negativeLevels: number;
      status: "ok" | "staggered" | "disabled" | "unconscious" | "dying" | "dead";
    };
    /** Wounds & Vigor dual pool (present + replaces hp display when the variant is enabled). */
    woundsVigor: {
      vigor: { current: number; max: number; temp: number };
      wound: { current: number; max: number; threshold: number };
      status: "ok" | "wounded" | "dead";
    } | null;
    ac: { total: number; touch: number; flatFooted: number };
    cmb: number;
    cmd: number;
    initiative: number;
    speed: string;
    /** Non-base movement modes (fly/swim/climb/burrow/with-armor/other), only the ones that are set. */
    movement: Array<{ mode: string; value: string }>;
    saves: { fortitude: number; reflex: number; will: number };
  };
  abilities: Array<{ key: string; label: string; score: number; modifier: number }>;
  /** Racial ability modifiers applied by the character's race (informational — already baked into the scores
   * above). Null when the abilities section is private; empty when no race is tracked. */
  racialMods: Array<{ key: string; value: number }> | null;
  buffs: Array<{ name: string; enabled: boolean; remainingRounds?: number; category?: string }> | null;
  attacks: Array<{
    name: string;
    attackBonus: number;
    damage?: string;
    damageType?: string;
    critRange?: string;
    critMultiplier?: string;
    range?: string;
    attackType: string;
  }> | null;
  /** Full-attack iterative routine (top bonus + each -5) for the general melee/ranged bonus. */
  fullAttack: { bab: number; melee: number[]; ranged: number[] };
  skills: Array<{ key: string; label: string; total: number; ranks: number }> | null;
  feats: Array<{
    name: string;
    type?: string;
    prerequisites?: string;
    benefit?: string;
    special?: string;
    normal?: string;
    /** The feat's mythic-version rules text (present on mythic characters). */
    mythicBenefit?: string;
    /** Owner-only tactical notes. */
    notes?: string;
  }> | null;
  features: Array<{
    name: string;
    category: string;
    description?: string;
    /** Class level the feature is gained at (per-level grouping). */
    level?: number;
    uses?: { max: number; remaining: number; per: string };
  }> | null;
  traits: Array<{ name: string; type?: string; description?: string }> | null;
  /** Known languages + the PF1e bonus-language budget. Always visible (not a private section). */
  languages: { known: string[]; budget: LanguageBudget };
  /** Defensive abilities — DR, energy resistance, immunities, SR, conditions, nonlethal. */
  defenses: {
    damageReduction: string[];
    energyResistance: string[];
    immunities: string[];
    spellResistance: number | null;
    conditions: string[];
    nonlethal: number;
    conditional: Array<{ label: string; condition: string }>;
  };
  /** Hero Points pool (count only; null unless the module is enabled). */
  heroPoints: { current: number; max: number } | null;
  /** Honor score + tier (null unless the module is enabled). */
  honor: { score: number; tier: string; dishonored: boolean } | null;
  /** Stamina pool (null unless the module is enabled). */
  stamina: { current: number; max: number } | null;
  /** Mythic roll-up (null unless the variant is enabled). */
  mythic: {
    tier: number;
    path: string;
    surgeDie: string;
    power: { current: number; max: number };
    abilityBoosts: number;
    pathAbilities: number;
    hardToKill: boolean;
    /** Tier-gated base abilities unlocked (Surge, Recuperation, …). */
    baseAbilities: { tier: number; name: string; note: string }[];
  } | null;
  /** Psionics roll-up (null unless the module is enabled). */
  psionics: {
    powerPoints: { current: number; max: number };
    manifesterLevel: number;
    powersKnown: number;
    focused: boolean;
    /** The actual powers-known list (was only a count before). */
    powers: Array<{ name: string; level: number; discipline?: string; ppCost?: number; augment?: string; description?: string }>;
  } | null;
  /** Spheres of Power/Might/Guile roll-up (null unless a spheres module is enabled). */
  spheres: {
    systems: { power: boolean; might: boolean; guile: boolean };
    combatSphereCount: number;
    skillSphereCount: number;
    combatTalentsKnown: number;
    combatTalentsSpent: number;
    skillTalentsKnown: number;
    skillTalentsSpent: number;
    casterLevel: number;
    spellPoints: { current: number; max: number };
    magicSkillBonus: number;
    magicSkillDefense: number;
    saveDc: number;
    sphereCount: number;
    talentCount: number;
    /** Primary (first set) tradition name; kept for compact summaries. */
    tradition: string;
    /** Per-system traditions (Power/Might/Guile) — only systems that have one set. */
    traditions: Array<{ system: SphereSystem; label: string; name: string }>;
    martialFocus: boolean;
    /** Chosen spheres + talents (build choices, shown like spells). `targetedBy` = names of the
     * drawbacks/boons flagged to that specific option (the "drawback applies here" note). */
    spheresList: Array<{ name: string; system: string; targetedBy: string[] }>;
    talentsList: Array<{
      sphere: string;
      name: string;
      category?: string;
      /** Resolved effective system (always set by buildCharacterViewModel via talentSystem). */
      system: string;
      compendiumId?: string;
      /** A bonus (free) talent — shown in the tradition area, not in its sphere group. */
      bonus: boolean;
      targetedBy: string[];
    }>;
    /** Drawbacks + boons per system, with the optional chip annotation. */
    grants: Array<{ kind: "drawback" | "boon"; name: string; system: string; note?: string }>;
  } | null;
  /** XP advancement (owner view only; null when milestone leveling replaces XP or nothing's set). */
  advancement: {
    currentXp?: number;
    nextLevelXp?: number;
    xpTrack?: string;
    favoredClasses: string[];
    /** Total favored-class bonus skill ranks taken across all classes (the +1-skill FCB choice). */
    favoredClassSkill: number;
  } | null;
  /** Senses — vision modes + special senses + perception. Always visible (informational). */
  senses: { vision: string[]; special: string[]; perception: number | null; notes?: string };
  /** Milestone-leveling tracker (null unless the module is enabled). Replaces XP. */
  milestoneLeveling: {
    current: number;
    level: number;
    nextLevel: number;
    currentThreshold: number;
    nextThreshold: number;
    intoLevel: number;
    span: number;
    remaining: number;
    readyToLevel: boolean;
    atCap: boolean;
  } | null;
  spellcasting: {
    casters: Array<{
      casterId: string;
      className: string;
      casterLevel: number;
      casterType: string;
      castingAbility: string;
      concentration: number;
      slots: Array<{ level: number; total: number; used: number; remaining: number; prepared: number; dc: number }>;
    }>;
    prepared: Array<SpellView & { used: number; prepared: number; casterId?: string }> | null;
    known: Array<SpellView & { casterId?: string }>;
    spellbook: SpellView[] | null;
    /** Spell-like abilities (name + uses/day; at-will when usesPerDay is null). */
    slas: Array<{ name: string; usesPerDay: number | null; used: number; casterLevel?: number; notes?: string }>;
    counts: { known: number; prepared: number; spellbook: number };
  } | null;
  profile: {
    backstory?: string;
    appearance?: string;
    personality?: string;
    allies?: string;
    foes?: string;
    affiliations?: string;
    family?: string;
    ideals?: string;
    likes?: string;
    dislikes?: string;
    flaws?: string;
    phobias?: string;
    uniqueTraits?: string;
    skin?: string;
    hair?: string;
    eyes?: string;
    distinguishingFeatures?: string;
  } | null;
  inventory: {
    items: Array<{
      name: string;
      quantity: number;
      equipped: boolean;
      category: string;
      armorBonus?: number;
      armorCheckPenalty?: number;
      /** Free-text item notes (location/attunement) — owner/editor view only. */
      notes?: string;
      cost?: string;
      weight?: number;
      weapon?: { damage?: string; damageType?: string; crit?: string; range?: string; enhancement?: number };
    }>;
    /** Total carried weight (Σ weight × quantity). */
    carriedWeight: number;
  } | null;
  wealth: { pp: number; gp: number; sp: number; cp: number; totalGp: number } | null;
  /** Human-readable labels of sections hidden from this viewer. */
  hiddenSections: string[];
};

export function buildCharacterViewModel(
  character: PathForgeCharacterV1,
  computed: ComputedCharacter,
  viewer: ViewerContext,
  visibilityLabel = "private",
): CharacterViewModel {
  const isOwnerView = viewer === "owner" || viewer === "editor";
  const hidden = new Set<string>();
  const gate = <T>(section: string, value: T): T | null => {
    if (visible(character, section, viewer)) return value;
    if (SECTION_LABELS[section]) hidden.add(SECTION_LABELS[section]);
    return null;
  };

  const classLine =
    character.identity.classes.map((c) => `${c.name} ${c.level}`).join(" / ") || "Unleveled";
  const classBreakdown = character.identity.classes.map((c) => ({
    name: c.name,
    level: c.level,
    // Structured archetypes (from the builder) + the legacy free-text archetype, deduped.
    archetypes: [
      ...new Set([
        ...(c.archetypes?.map((a) => a.name) ?? []),
        ...(c.archetype?.trim() ? [c.archetype.trim()] : []),
      ]),
    ],
  }));

  const abilities = ABILITY_KEYS.map((key) => {
    const a = computed.abilities[key];
    return {
      key,
      label: character.abilities.primary[key]?.label ?? key.toUpperCase(),
      score: a?.effectiveScore ?? 10,
      modifier: a?.modifier ?? 0,
    };
  });
  const raceMods = character.identity.raceApplied?.abilityMods;
  const racialMods = raceMods
    ? ABILITY_KEYS.filter((k) => (raceMods[k] ?? 0) !== 0).map((k) => ({ key: k as string, value: raceMods[k]! }))
    : [];

  const buffs = gate(
    "buffs",
    character.buffs.active
      // Non-owner viewers (public/party/GM share) only see live effects, not buffs
      // the character has toggled off.
      .filter((b) => isOwnerView || b.enabled)
      .map((b) => ({
        name: b.name,
        enabled: b.enabled,
        remainingRounds: b.remainingRounds,
        category: b.category,
      })),
  );

  const skills = gate(
    "skills",
    character.skills.list.map((s) => ({
      key: s.key,
      label: s.specialty ? `${s.label} (${s.specialty})` : s.label,
      total: computed.skills[s.key]?.value ?? 0,
      ranks: s.ranks + (s.backgroundRanks ?? 0), // effective ranks (adventuring + background)
    })),
  );

  // BAB is usually a stored number (class presets set it); a formula-valued BAB is rare and
  // simply yields no full-attack routine here rather than a misleading guess.
  const babRaw = character.combat.bab.total;
  const bab = typeof babRaw === "number" ? babRaw : 0;

  const toSpellView = (ref: SpellRef): SpellView => ({
    name: ref.name,
    level: ref.level,
    school: ref.school,
    subschool: ref.subschool,
    descriptor: ref.descriptor,
    castingTime: ref.castingTime,
    components: ref.components,
    range: ref.range,
    area: ref.area,
    effect: ref.effect,
    targets: ref.targets,
    duration: ref.duration,
    savingThrow: ref.savingThrow,
    spellResistance: ref.spellResistance,
    description: ref.description,
    // Per-spell tactical notes are owner-only (mirrors how buffs hide owner-only detail).
    notes: isOwnerView ? ref.notes : undefined,
  });

  const sp = character.spellcasting;
  const spellcasting =
    sp.casters.length > 0
      ? gate("spells", {
          casters: computed.spellcasting.map((sc) => ({
            casterId: sc.casterId,
            className: sc.className,
            casterLevel: sc.casterLevel,
            casterType: sc.casterType,
            castingAbility: sc.castingAbility,
            concentration: sc.concentration.value,
            slots: sc.slots.map((s) => ({
              level: s.level,
              total: s.total,
              used: s.used,
              remaining: s.remaining,
              prepared: s.prepared,
              dc: s.dc,
            })),
          })),
          prepared: sp.preparedSpells.length
            ? sp.preparedSpells.map((p) => {
                const ids = p.metamagicIds ?? [];
                const names = ids
                  .map((id) => sp.metamagic.find((m) => m.id === id)?.name)
                  .filter((n): n is string => !!n);
                const effLevel =
                  p.level + ids.reduce((s, id) => s + (sp.metamagic.find((m) => m.id === id)?.levelAdjust ?? 0), 0);
                return {
                  ...toSpellView(p),
                  used: p.used,
                  prepared: p.prepared,
                  casterId: p.casterId,
                  ...(names.length ? { metamagic: names, effectiveLevel: effLevel } : {}),
                };
              })
            : null,
          known: sp.knownSpells.map((k) => ({ ...toSpellView(k), casterId: k.casterId, atWill: k.atWill })),
          spellbook: sp.spellbook.length ? sp.spellbook.map((b) => toSpellView(b)) : null,
          slas: sp.spellLikeAbilities.map((s) => ({
            name: s.name,
            usesPerDay: typeof s.usesPerDay === "number" ? s.usesPerDay : null,
            casterLevel: s.casterLevel,
            notes: isOwnerView ? s.notes : undefined,
            used: s.used ?? 0,
          })),
          counts: {
            known: sp.knownSpells.length,
            prepared: sp.preparedSpells.length,
            spellbook: sp.spellbook.length,
          },
        })
      : null;

  const ap = character.profile.appearance;
  const pe = character.profile.personality;
  const profile = gate("backstory", {
    backstory: character.profile.backstory,
    appearance: ap.description,
    personality: pe.description,
    allies: character.profile.allies,
    foes: character.profile.foes,
    affiliations: character.profile.affiliations,
    family: character.profile.family,
    ideals: pe.ideals,
    likes: pe.likes,
    dislikes: pe.dislikes,
    flaws: pe.flaws,
    phobias: pe.phobias,
    uniqueTraits: pe.uniqueTraits,
    skin: ap.skin,
    hair: ap.hair,
    eyes: ap.eyes,
    distinguishingFeatures: ap.distinguishingFeatures,
  });

  const inventorySource = [
    ...character.inventory.weapons,
    ...character.inventory.armorAndShields,
    ...character.inventory.potionsScrollsMagicItems,
    ...character.inventory.gear,
    ...character.inventory.otherItems,
  ];
  const inventoryView = gate("inventory", {
    items: inventorySource.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      equipped: !!i.equipped,
      category: i.category,
      ...(typeof i.armorBonus === "number" ? { armorBonus: i.armorBonus } : {}),
      ...(typeof i.armorCheckPenalty === "number" ? { armorCheckPenalty: i.armorCheckPenalty } : {}),
      // Notes can hold location/attunement — owner-only, mirroring spell notes.
      ...(isOwnerView && i.notes ? { notes: i.notes } : {}),
      ...(i.cost ? { cost: i.cost } : {}),
      ...(typeof i.weight === "number" ? { weight: i.weight } : {}),
      ...(i.weapon
        ? {
            weapon: {
              damage: i.weapon.damageDice,
              damageType: i.weapon.damageType,
              crit: [i.weapon.critRange, i.weapon.critMultiplier].filter(Boolean).join("/") || undefined,
              range: i.weapon.range,
              enhancement: i.weapon.enhancement || undefined,
            },
          }
        : {}),
    })),
    carriedWeight: inventorySource.reduce(
      (s, i) => s + (typeof i.weight === "number" ? i.weight : 0) * (i.quantity ?? 1),
      0,
    ),
  });

  // Per-system traditions (only systems that actually have one set), for the read view.
  const SPHERE_SYSTEM_LABELS: Record<SphereSystem, string> = { Magic: "Power", Combat: "Might", Skill: "Guile" };
  const spheresTraditions = (["Magic", "Combat", "Skill"] as const)
    .map((sys) => ({ system: sys, label: SPHERE_SYSTEM_LABELS[sys], name: character.spheres ? (systemTradition(character.spheres, sys)?.name ?? "") : "" }))
    .filter((t) => t.name);

  return {
    viewer,
    isOwnerView,
    canSeeMath: visible(character, "formulaDetails", viewer),
    header: {
      name: character.identity.name,
      // PII: only the owner/editor sees the real player's name, never public/party/GM shares.
      playerName: isOwnerView ? character.identity.playerName : undefined,
      classLine,
      classes: classBreakdown,
      totalLevel: character.identity.totalLevel,
      race: character.identity.race,
      alignment: character.identity.alignment,
      size: character.identity.size,
      deity: character.identity.deity,
      homeland: character.identity.homeland,
      ethnicity: character.identity.ethnicity,
      gender: character.identity.gender,
      age: character.identity.age,
      height: character.identity.height,
      weight: character.identity.weight,
      quote: character.profile.quote,
      portraitUrl: visible(character, "portrait", viewer)
        ? character.profile.portraitUrl
        : undefined,
      visibility: visibilityLabel,
    },
    vitals: {
      hp: computed.summary.hp,
      woundsVigor: computed.summary.woundsVigor ?? null,
      ac: {
        total: computed.summary.ac,
        touch: computed.summary.touch,
        flatFooted: computed.summary.flatFooted,
      },
      cmb: computed.attackBonuses.cmb.value,
      cmd: computed.summary.cmd,
      initiative: computed.summary.initiative,
      speed: character.combat.speed.base,
      movement: (
        [
          ["With armor", character.combat.speed.withArmor],
          ["Fly", character.combat.speed.fly],
          ["Swim", character.combat.speed.swim],
          ["Climb", character.combat.speed.climb],
          ["Burrow", character.combat.speed.burrow],
          ["Other", character.combat.speed.other],
        ] as Array<[string, string | undefined]>
      )
        .filter((m) => Boolean(m[1]))
        .map((m) => ({ mode: m[0], value: m[1] as string })),
      saves: {
        fortitude: computed.summary.fortitude,
        reflex: computed.summary.reflex,
        will: computed.summary.will,
      },
    },
    // Gate abilities like every other content section — owners marking the abilities
    // section private must not have ability scores leak through the public API.
    abilities: gate("abilities", abilities) ?? [],
    racialMods: gate("abilities", racialMods),
    buffs,
    attacks: gate(
      "attacks",
      computed.attacks.map((a) => ({
        name: a.name,
        attackBonus: a.attackBonus,
        damage: a.damage,
        damageType: a.damageType,
        critRange: a.critRange,
        critMultiplier: a.critMultiplier,
        range: a.range,
        attackType: a.attackType,
      })),
    ),
    fullAttack: {
      bab,
      melee: iterativeAttackBonuses(computed.attackBonuses.melee.value, bab),
      ranged: iterativeAttackBonuses(computed.attackBonuses.ranged.value, bab),
    },
    skills,
    feats: gate(
      "feats",
      character.feats.list.map((f) => ({
        name: f.name,
        type: f.type,
        prerequisites: f.prerequisites,
        benefit: f.benefit,
        special: f.special,
        normal: f.normal,
        mythicBenefit: f.mythicBenefit,
        // Tactical notes are owner-only (mirrors spells/buffs).
        notes: isOwnerView ? f.notes : undefined,
      })),
    ),
    features: gate(
      "features",
      character.features.list.map((f) => {
        const max = typeof f.uses?.max === "number" ? f.uses.max : undefined;
        return {
          name: f.name,
          category: f.category,
          description: f.description,
          level: f.level,
          ...(max && max > 0
            ? { uses: { max, remaining: f.uses?.current ?? max, per: f.uses?.per ?? "day" } }
            : {}),
        };
      }),
    ),
    traits: gate(
      "features",
      character.traits.list.map((t) => ({ name: t.name, type: t.type, description: t.description })),
    ),
    languages: {
      known: character.languages.known,
      budget: languageBudget(character, computed),
    },
    defenses: {
      damageReduction: character.health.damageReduction
        .filter((m) => m.enabled !== false)
        .map((m) => `${m.value}${m.label ? `/${m.label}` : ""}`),
      energyResistance: character.health.energyResistance
        .filter((m) => m.enabled !== false)
        .map((m) => `${m.label || "Energy"} ${m.value}`),
      immunities: character.health.immunities,
      spellResistance:
        typeof character.defenses.spellResistance === "number" ? character.defenses.spellResistance : null,
      conditions: character.health.conditions,
      nonlethal: character.health.nonlethalDamage,
      conditional: character.defenses.conditionalDefenses
        .filter((cd) => cd.condition.trim() !== "" || cd.bonus !== 0)
        .map((cd) => {
          const tgt =
            ({ ac: "AC", touch: "touch AC", saves: "saves", fortitude: "Fort", reflex: "Ref", will: "Will", all: "all" } as Record<string, string>)[
              cd.target
            ] ?? cd.target;
          return { label: `${cd.bonus >= 0 ? "+" : ""}${cd.bonus} ${tgt}`, condition: cd.condition };
        }),
    },
    heroPoints: computed.summary.heroPoints ? gate("heroPoints", computed.summary.heroPoints) : null,
    honor: computed.summary.honor
      ? gate("honor", {
          score: computed.summary.honor.score,
          tier: computed.summary.honor.tier,
          dishonored: computed.summary.honor.dishonored,
        })
      : null,
    stamina: computed.summary.stamina ? gate("stamina", computed.summary.stamina) : null,
    mythic: computed.summary.mythic
      ? gate("mythic", {
          tier: computed.summary.mythic.tier,
          path: computed.summary.mythic.path,
          surgeDie: computed.summary.mythic.surgeDie,
          power: computed.summary.mythic.power,
          abilityBoosts: computed.summary.mythic.abilityBoosts,
          pathAbilities: computed.summary.mythic.pathAbilities,
          hardToKill: computed.summary.mythic.hardToKill,
          baseAbilities: computed.summary.mythic.baseAbilities,
        })
      : null,
    psionics: computed.summary.psionics
      ? gate("psionics", {
          powerPoints: computed.summary.psionics.powerPoints,
          manifesterLevel: computed.summary.psionics.manifesterLevel,
          powersKnown: computed.summary.psionics.powersKnown,
          focused: computed.summary.psionics.focused,
          powers: (character.psionics?.powersKnown ?? []).map((p) => ({
            name: p.name,
            level: p.level,
            discipline: p.discipline,
            ppCost: p.ppCost,
            augment: isOwnerView ? p.augment : undefined,
            description: isOwnerView ? p.description : undefined,
          })),
        })
      : null,
    spheres: computed.summary.spheres
      ? gate("spheres", {
          systems: computed.summary.spheres.systems,
          combatSphereCount: computed.summary.spheres.combatSphereCount,
          skillSphereCount: computed.summary.spheres.skillSphereCount,
          combatTalentsKnown: computed.summary.spheres.combatTalentsKnown,
          combatTalentsSpent: computed.summary.spheres.combatTalentsSpent,
          skillTalentsKnown: computed.summary.spheres.skillTalentsKnown,
          skillTalentsSpent: computed.summary.spheres.skillTalentsSpent,
          casterLevel: computed.summary.spheres.casterLevel,
          spellPoints: computed.summary.spheres.spellPoints,
          magicSkillBonus: computed.summary.spheres.magicSkillBonus,
          magicSkillDefense: computed.summary.spheres.magicSkillDefense,
          saveDc: computed.summary.spheres.saveDc,
          sphereCount: computed.summary.spheres.sphereCount,
          talentCount: computed.summary.spheres.talentCount,
          tradition: spheresTraditions[0]?.name ?? "",
          traditions: spheresTraditions,
          martialFocus: computed.summary.spheres.martialFocus,
          spheresList: (character.spheres?.spheres ?? []).map((s) => {
            const tg = grantsTargeting(character.spheres!, "sphere", s.id);
            return { name: s.name, system: s.system, targetedBy: [...tg.drawbacks, ...tg.boons] };
          }),
          talentsList: (character.spheres?.talents ?? []).map((t) => {
            const tg = grantsTargeting(character.spheres!, "talent", t.id);
            return {
              sphere: t.sphereName,
              name: t.talentName,
              category: t.category,
              // Resolved effective system (explicit tag, else inferred from the sphere) so the read view
              // can group talents under their subsystem.
              system: talentSystem(t, character.spheres?.spheres ?? []),
              compendiumId: t.compendiumId,
              bonus: !!t.bonus,
              targetedBy: [...tg.drawbacks, ...tg.boons],
            };
          }),
          grants: [
            ...(character.spheres?.drawbacks ?? []).map((name) => ({
              kind: "drawback" as const,
              name,
              system: grantSystem(name, character.spheres?.drawbackMeta),
              note: character.spheres?.drawbackMeta?.[name]?.note,
            })),
            ...(character.spheres?.boons ?? []).map((name) => ({
              kind: "boon" as const,
              name,
              system: grantSystem(name, character.spheres?.boonMeta),
              note: character.spheres?.boonMeta?.[name]?.note,
            })),
          ],
        })
      : null,
    advancement:
      isOwnerView &&
      !computed.summary.milestoneLeveling &&
      (character.progression.currentXp != null ||
        character.progression.nextLevelXp != null ||
        character.progression.favoredClasses.length > 0)
        ? {
            currentXp: character.progression.currentXp,
            nextLevelXp: character.progression.nextLevelXp,
            xpTrack: character.progression.xpTrack,
            favoredClasses: character.progression.favoredClasses,
            favoredClassSkill: character.identity.classes.reduce((s, c) => s + (c.favoredClassBonus?.skill ?? 0), 0),
          }
        : null,
    senses: {
      vision: character.senses.vision,
      special: character.senses.senses,
      perception: computed.skills["perception"]?.value ?? null,
      notes: isOwnerView ? character.senses.notes : undefined,
    },
    milestoneLeveling: computed.summary.milestoneLeveling
      ? gate("milestoneLeveling", computed.summary.milestoneLeveling)
      : null,
    spellcasting,
    profile,
    inventory: inventoryView,
    wealth: gate("wealth", {
      pp: character.wealth.pp,
      gp: character.wealth.gp,
      sp: character.wealth.sp,
      cp: character.wealth.cp,
      totalGp:
        Math.round(
          (character.wealth.pp * 10 +
            character.wealth.gp +
            character.wealth.sp / 10 +
            character.wealth.cp / 100) *
            100,
        ) / 100,
    }),
    hiddenSections: [...hidden],
  };
}
