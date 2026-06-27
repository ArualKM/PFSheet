import type { PathForgeCharacterV1, ViewerContext, PrivacyLevel, SpellRef } from "@pathforge/schema";
import { ABILITY_KEYS } from "@pathforge/schema";
import type { ComputedCharacter } from "@pathforge/rules-pf1e";
import { languageBudget, type LanguageBudget } from "./languages";

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
    cmb: number;
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
  /** Known languages + the PF1e bonus-language budget. Always visible (not a private section). */
  languages: { known: string[]; budget: LanguageBudget };
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
    counts: { known: number; prepared: number; spellbook: number };
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
      label: s.specialty ? `${s.label} (${s.specialty})` : s.label,
      total: computed.skills[s.key]?.value ?? 0,
      ranks: s.ranks,
    })),
  );

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
            ? sp.preparedSpells.map((p) => ({ ...toSpellView(p), used: p.used, prepared: p.prepared, casterId: p.casterId }))
            : null,
          known: sp.knownSpells.map((k) => ({ ...toSpellView(k), casterId: k.casterId })),
          spellbook: sp.spellbook.length ? sp.spellbook.map((b) => toSpellView(b)) : null,
          counts: {
            known: sp.knownSpells.length,
            prepared: sp.preparedSpells.length,
            spellbook: sp.spellbook.length,
          },
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
      cmb: computed.attackBonuses.cmb.value,
      cmd: computed.summary.cmd,
      initiative: computed.summary.initiative,
      speed: character.combat.speed.base,
      saves: {
        fortitude: computed.summary.fortitude,
        reflex: computed.summary.reflex,
        will: computed.summary.will,
      },
    },
    // Gate abilities like every other content section — owners marking the abilities
    // section private must not have ability scores leak through the public API.
    abilities: gate("abilities", abilities) ?? [],
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
    languages: {
      known: character.languages.known,
      budget: languageBudget(character, computed),
    },
    spellcasting,
    profile,
    hiddenSections: [...hidden],
  };
}
