import type { PathForgeCharacterV1, ViewerContext, PrivacyLevel } from "@pathforge/schema";
import { ABILITY_KEYS } from "@pathforge/schema";
import type { ComputedCharacter } from "@pathforge/rules-pf1e";

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
  formulaDetails: "public",
  backstory: "public",
  inventory: "party",
  wealth: "party",
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
  backstory: "Backstory & profile",
  inventory: "Inventory",
  wealth: "Wealth",
  journal: "Campaign journal",
  privateNotes: "Private notes",
  gmSecrets: "GM secrets",
};

export type CharacterViewModel = {
  viewer: ViewerContext;
  isOwnerView: boolean;
  canSeeMath: boolean;
  header: {
    name: string;
    classLine: string;
    totalLevel: number;
    race?: string;
    alignment?: string;
    size?: string;
    quote?: string;
    portraitUrl?: string;
    visibility: string;
  };
  vitals: {
    hp: { current: number; max: number; temp: number };
    ac: { total: number; touch: number; flatFooted: number };
    cmd: number;
    initiative: number;
    speed: string;
    saves: { fortitude: number; reflex: number; will: number };
  };
  abilities: Array<{ key: string; label: string; score: number; modifier: number }>;
  buffs: Array<{ name: string; enabled: boolean; remainingRounds?: number; category?: string }> | null;
  attacks: Array<{ name: string; attackBonus: number; damage?: string; attackType: string }> | null;
  skills: Array<{ key: string; label: string; total: number; ranks: number }> | null;
  feats: Array<{ name: string; type?: string }> | null;
  features: Array<{ name: string; category: string }> | null;
  spellcasting: {
    casters: Array<{ className: string; casterLevel: number; castingAbility: string }>;
    knownCount: number;
    preparedCount: number;
  } | null;
  profile: {
    backstory?: string;
    appearance?: string;
    personality?: string;
    allies?: string;
    foes?: string;
  } | null;
  /** Human-readable labels of sections hidden from this viewer. */
  hiddenSections: string[];
};

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

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

  const abilities = ABILITY_KEYS.map((key) => {
    const a = computed.abilities[key];
    return {
      key,
      label: character.abilities.primary[key]?.label ?? key.toUpperCase(),
      score: a?.effectiveScore ?? 10,
      modifier: a?.modifier ?? 0,
    };
  });

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
      label: s.label,
      total: computed.skills[s.key]?.value ?? 0,
      ranks: s.ranks,
    })),
  );

  const spellcasting =
    character.spellcasting.casters.length > 0
      ? gate("spells", {
          casters: character.spellcasting.casters.map((c) => ({
            className: c.className,
            casterLevel: num(c.casterLevel),
            castingAbility: c.castingAbility,
          })),
          knownCount: character.spellcasting.knownSpells.length,
          preparedCount: character.spellcasting.preparedSpells.length,
        })
      : null;

  const profile = gate("backstory", {
    backstory: character.profile.backstory,
    appearance: character.profile.appearance.description,
    personality: character.profile.personality.description,
    allies: character.profile.allies,
    foes: character.profile.foes,
  });

  return {
    viewer,
    isOwnerView,
    canSeeMath: visible(character, "formulaDetails", viewer),
    header: {
      name: character.identity.name,
      classLine,
      totalLevel: character.identity.totalLevel,
      race: character.identity.race,
      alignment: character.identity.alignment,
      size: character.identity.size,
      quote: character.profile.quote,
      portraitUrl: visible(character, "portrait", viewer)
        ? character.profile.portraitUrl
        : undefined,
      visibility: visibilityLabel,
    },
    vitals: {
      hp: computed.summary.hp,
      ac: {
        total: computed.summary.ac,
        touch: computed.summary.touch,
        flatFooted: computed.summary.flatFooted,
      },
      cmd: computed.summary.cmd,
      initiative: computed.summary.initiative,
      speed: character.combat.speed.base,
      saves: {
        fortitude: computed.summary.fortitude,
        reflex: computed.summary.reflex,
        will: computed.summary.will,
      },
    },
    abilities,
    buffs,
    attacks: gate(
      "attacks",
      computed.attacks.map((a) => ({
        name: a.name,
        attackBonus: a.attackBonus,
        damage: a.damage,
        attackType: a.attackType,
      })),
    ),
    skills,
    feats: gate(
      "feats",
      character.feats.list.map((f) => ({ name: f.name, type: f.type })),
    ),
    features: gate(
      "features",
      character.features.list.map((f) => ({ name: f.name, category: f.category })),
    ),
    spellcasting,
    profile,
    hiddenSections: [...hidden],
  };
}
