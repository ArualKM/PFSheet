"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  X,
  Star,
  Loader2,
  Cloud,
  CloudOff,
  Undo2,
  Plus,
  Trash2,
  ExternalLink,
  Sigma,
  Calculator,
  ChevronDown,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
// Thematic sheet/section icons use the game-icons pack (themed CSS-mask glyphs); the chrome above
// (chevrons, plus, loaders, math affordances, panel toggles) stays on lucide.
import {
  User,
  Shield,
  Swords,
  Sparkles,
  Target,
  Wand2,
  Backpack,
  Zap,
  ScrollText,
  Settings,
} from "@/components/ui/game-icons";
import {
  ABILITY_KEYS,
  OPTIONAL_RULE_MODULES,
  isRuleEnabled,
  isModuleKeyEnabled,
  isModuleComingSoon,
  isBackgroundSkill,
  maxHeroPoints,
  HONOR_CODES,
  HONOR_EVENTS,
  honorBaseline,
  COMBAT_TRICKS,
  isGestalt,
  gestaltLevel,
  MYTHIC_PATHS,
  maxMythicPower,
  mythicSurgeDie,
  PSIONIC_DISCIPLINES,
  bonusPowerPoints,
  parsePsionicPowers,
  recomputeClassDerived,
  computeMaxHpFromLevels,
  type PathForgeCharacterV1,
  type AbilityKey,
  type ModifierEntry,
  type OptionalRuleModule,
  type RuleModuleGroup,
  type PointBuyState,
  type HeroPointsBlock,
  type HonorBlock,
  type StaminaBlock,
  type MythicBlock,
  type PsionicsBlock,
  type SpheresBlock,
  type SphereSystem,
  type SphereGrantTarget,
  SPHERE_CASTER_TYPES,
  talentSystem,
  grantSystem,
  systemTradition,
  setSystemTraditionFields,
  type MilestoneLevelingBlock,
  type MilestoneDifficulty,
  MILESTONE_DIFFICULTIES,
  MILESTONE_MAX_JOB_LEVEL,
  milestoneJobReward,
  type PrivacyLevel,
} from "@pathforge/schema";
import { composeAbilityScore, pointBuyCost, pointBuySpent, STANDARD_CONDITIONS } from "@pathforge/rules-pf1e";
import type { ComputedValue } from "@pathforge/rules-pf1e";
import { useCharacterEditor, type SaveStatus } from "./use-character-editor";
import { ConflictResolver } from "./conflict-resolver";
import { PortraitImage } from "../portrait-image";
import { NumberField, TextField, TextAreaField, SelectField } from "./fields";
import { BuffCenter } from "./buff-center";
import { CombatEditor, SpeedEditor } from "./combat-editor";
import { InventoryEditor } from "./inventory-editor";
import { SpellcastingEditor } from "./spellcasting-editor";
import { SpherePicker, type SpherePickerMode } from "./sphere-picker";
import { ClassPresetPicker } from "./class-preset-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatModifier } from "@/lib/utils";
import { COMMON_LANGUAGES, languageBudget } from "@/lib/character/languages";
import { effectiveLevel } from "@/lib/character/view-model";

const AC_COMPONENTS = [
  { key: "armor", label: "Armor", bonusType: "armor" },
  { key: "shield", label: "Shield", bonusType: "shield" },
  { key: "natural", label: "Natural armor", bonusType: "natural_armor" },
  { key: "deflection", label: "Deflection", bonusType: "deflection" },
  { key: "dodge", label: "Dodge", bonusType: "dodge" },
  { key: "misc", label: "Misc (untyped)", bonusType: "untyped" },
] as const;

const FEATURE_CATEGORIES = [
  "racial_trait",
  "class_feature",
  "archetype_feature",
  "special_ability",
  "defensive_feature",
  "offensive_feature",
  "misc",
] as const;

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

type SheetSection = {
  key: string;
  label: string;
  icon: typeof User;
  items: Array<{ key: string; label: string; render: () => ReactNode }>;
};

export function CharacterEditor({
  characterId,
  initial,
  initialVersion,
}: {
  characterId: string;
  initial: PathForgeCharacterV1;
  initialVersion: number;
}) {
  const ed = useCharacterEditor(characterId, initial, initialVersion);
  const [advanced, setAdvanced] = useState(false);
  const [activeSection, setActiveSection] = useState("core");
  const [activeSub, setActiveSub] = useState("details");

  // Restore the last-open section/sub on mount (client-only; per character). Done in an
  // effect, not lazy init, to avoid an SSR/client hydration mismatch.
  const navKey = `pf-editor-nav:${characterId}`;
  /* eslint-disable react-hooks/set-state-in-effect -- one-time client restore; lazy init would cause an SSR hydration mismatch */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(navKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { section?: string; sub?: string };
      if (saved.section) setActiveSection(saved.section);
      if (saved.sub) setActiveSub(saved.sub);
    } catch {
      // ignore unreadable/absent storage
    }
  }, [navKey]);
  /* eslint-enable react-hooks/set-state-in-effect */
  // Skip the first persist so the initial default state can't clobber the saved nav
  // before the restore effect's update commits; persist on every change after.
  const skipInitialPersist = useRef(true);
  useEffect(() => {
    if (skipInitialPersist.current) {
      skipInitialPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(navKey, JSON.stringify({ section: activeSection, sub: activeSub }));
    } catch {
      // ignore quota/unavailable
    }
  }, [navKey, activeSection, activeSub]);

  // Section rail collapse (md+): icons-only by default, hover/focus overlay-expands; pin to lock open.
  const sectionsPinKey = "pf-sidebar-pinned:editor-sections";
  const [sectionsPinned, setSectionsPinned] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- one-time client restore; lazy init would cause an SSR hydration mismatch */
  useEffect(() => {
    try {
      setSectionsPinned(localStorage.getItem(sectionsPinKey) === "1");
    } catch {
      // ignore unreadable/absent storage
    }
  }, [sectionsPinKey]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const toggleSectionsPin = () =>
    setSectionsPinned((p) => {
      const next = !p;
      try {
        localStorage.setItem(sectionsPinKey, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });

  // §6 grouped sections (left "Sheet Sections" sidebar). The sub-editors are
  // unchanged; this only reorganizes navigation. Optional rulesets (Sanity,
  // Psionics, Hero Points, 3pp, …) get their toggles under Settings in a later pass.
  // Optional-rules systems (§18) reveal their editor here once their module is enabled in Settings.
  const optionalSystemItems: SheetSection["items"] = [];
  if (isModuleKeyEnabled(ed.draft, "hero_points")) {
    optionalSystemItems.push({ key: "hero_points", label: "Hero Points", render: () => <HeroPointsEditor ed={ed} /> });
  }
  if (isModuleKeyEnabled(ed.draft, "honor")) {
    optionalSystemItems.push({ key: "honor", label: "Honor", render: () => <HonorEditor ed={ed} /> });
  }
  if (isModuleKeyEnabled(ed.draft, "stamina")) {
    optionalSystemItems.push({ key: "stamina", label: "Stamina", render: () => <StaminaEditor ed={ed} /> });
  }
  if (isModuleKeyEnabled(ed.draft, "mythic")) {
    optionalSystemItems.push({ key: "mythic", label: "Mythic", render: () => <MythicEditor ed={ed} /> });
  }
  if (isModuleKeyEnabled(ed.draft, "psionics")) {
    optionalSystemItems.push({ key: "psionics", label: "Psionics", render: () => <PsionicsEditor ed={ed} /> });
  }
  if (
    isModuleKeyEnabled(ed.draft, "spheres_of_power") ||
    isModuleKeyEnabled(ed.draft, "spheres_of_might") ||
    isModuleKeyEnabled(ed.draft, "spheres_of_guile")
  ) {
    optionalSystemItems.push({ key: "spheres", label: "Spheres", render: () => <SpheresEditor ed={ed} /> });
  }
  if (isModuleKeyEnabled(ed.draft, "milestone_leveling")) {
    optionalSystemItems.push({
      key: "milestone_leveling",
      label: "Milestones",
      render: () => <MilestoneLevelingEditor ed={ed} />,
    });
  }

  const sections: SheetSection[] = [
    {
      key: "core",
      label: "Core",
      icon: User,
      items: [
        { key: "details", label: "Character details", render: () => <IdentityEditor ed={ed} /> },
        { key: "abilities", label: "Ability scores", render: () => <AbilitiesEditor ed={ed} advanced={advanced} /> },
        { key: "languages", label: "Languages", render: () => <LanguagesEditor ed={ed} /> },
        { key: "speed", label: "Speed", render: () => <SpeedEditor ed={ed} /> },
        { key: "health", label: "Health & wounds", render: () => <HealthEditor ed={ed} /> },
      ],
    },
    {
      key: "defenses",
      label: "Defenses",
      icon: Shield,
      items: [
        { key: "saves", label: "Saving throws", render: () => <SavesEditor ed={ed} /> },
        { key: "ac", label: "Armor class", render: () => <ACEditor ed={ed} /> },
      ],
    },
    {
      key: "attacks",
      label: "Attacks",
      icon: Swords,
      items: [{ key: "combat", label: "Attacks", render: () => <CombatEditor ed={ed} /> }],
    },
    {
      key: "abilities",
      label: "Abilities",
      icon: Sparkles,
      items: [{ key: "feats", label: "Feats & features", render: () => <FeatsEditor ed={ed} /> }],
    },
    {
      key: "skills",
      label: "Skills",
      icon: Target,
      items: [{ key: "skills", label: "Skills", render: () => <SkillsEditor ed={ed} /> }],
    },
    {
      key: "spells",
      label: "Spells",
      icon: Wand2,
      items: [{ key: "spells", label: "Spellcasting", render: () => <SpellcastingEditor ed={ed} /> }],
    },
    {
      key: "equipment",
      label: "Equipment",
      icon: Backpack,
      items: [{ key: "inventory", label: "Inventory & wealth", render: () => <InventoryEditor ed={ed} /> }],
    },
    {
      key: "buffs",
      label: "Buffs",
      icon: Zap,
      items: [{ key: "buffs", label: "Buff center", render: () => <BuffCenter ed={ed} /> }],
    },
    {
      key: "story",
      label: "Story",
      icon: ScrollText,
      items: [{ key: "profile", label: "Profile & backstory", render: () => <ProfileEditor ed={ed} /> }],
    },
    ...(optionalSystemItems.length > 0
      ? [{ key: "optional", label: "Optional", icon: Sparkles, items: optionalSystemItems }]
      : []),
    {
      key: "settings",
      label: "Settings",
      icon: Settings,
      items: [{ key: "settings", label: "Sheet settings", render: () => <SettingsEditor ed={ed} /> }],
    },
  ];

  const section = sections.find((s) => s.key === activeSection) ?? sections[0]!;
  const sub = section.items.find((i) => i.key === activeSub) ?? section.items[0]!;
  // Label the panel by the RESOLVED sub/section (always present + visible at every
  // breakpoint), not the raw stored key which may be stale or in a hidden rail.
  const panelLabelId = section.items.length > 1 ? `subtab-${sub.key}` : `panel-heading-${section.key}`;

  // Roving-tabindex arrow-key movement for the two tablists.
  const onSectionKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const n = sections.length;
    let next = idx;
    if (e.key === "ArrowDown") next = (idx + 1) % n;
    else if (e.key === "ArrowUp") next = (idx - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    const s = sections[next]!;
    setActiveSection(s.key);
    setActiveSub(s.items[0]!.key);
    document.getElementById(`section-tab-${s.key}`)?.focus();
  };

  const onSubKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const items = section.items;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    const i = items[next]!;
    setActiveSub(i.key);
    document.getElementById(`subtab-${i.key}`)?.focus();
  };

  return (
    <div
      className={cn(
        "grid gap-4",
        sectionsPinned ? "md:grid-cols-[13rem_minmax(0,1fr)]" : "md:grid-cols-[3rem_minmax(0,1fr)]",
      )}
    >
      {/* Section rail — md+ only (the < md picker is a bottom sheet). Collapsed to icons-only;
          hover/keyboard-focus overlay-expands; pin to lock open. Keeps the tablist + roving-tabindex
          a11y intact. */}
      <div className="hidden md:block">
        <div
          className={cn(
            "group/sections sticky top-20 z-30 flex flex-col self-start overflow-hidden rounded-lg border border-border bg-surface transition-[width] duration-200",
            sectionsPinned
              ? "w-52"
              : "w-12 hover:w-52 focus-within:w-52 hover:shadow-2xl focus-within:shadow-2xl",
          )}
        >
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label="Sheet sections"
            className="flex flex-col gap-1 p-1"
          >
            {sections.map((s, idx) => {
              const Icon = s.icon;
              // Compare to the RESOLVED section so a stale stored key can't leave the rail
              // with no selected tab (which would make every tab tabIndex=-1, unreachable).
              const active = s.key === section.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  id={`section-tab-${s.key}`}
                  title={s.label}
                  aria-selected={active}
                  aria-controls="editor-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => {
                    setActiveSection(s.key);
                    setActiveSub(s.items[0]!.key);
                  }}
                  onKeyDown={(e) => onSectionKeyDown(e, idx)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold",
                    active ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">{s.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={toggleSectionsPin}
            aria-pressed={sectionsPinned}
            aria-label={sectionsPinned ? "Unpin section rail" : "Pin section rail open"}
            className="m-1 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border-t border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
          >
            {sectionsPinned ? (
              <PanelLeftClose className="size-4 shrink-0" />
            ) : (
              <PanelLeftOpen className="size-4 shrink-0" />
            )}
            <span>{sectionsPinned ? "Unpin" : "Pin open"}</span>
          </button>
        </div>
      </div>

      <div className="min-w-0">
        {/* Mobile section picker (< md) — a bottom sheet listing all sections. */}
        <div className="mb-3 md:hidden">
          <SectionSheet
            sections={sections}
            activeKey={activeSection}
            onSelect={(sKey, subKey) => {
              setActiveSection(sKey);
              setActiveSub(subKey);
            }}
          />
        </div>

        {/* Live values — sticky top bar (all breakpoints), expands inline to the full preview. */}
        <LivePreviewBar ed={ed} characterId={characterId} advanced={advanced} />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {section.items.length > 1 ? (
            <div role="tablist" aria-label={`${section.label} panels`} className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
              {section.items.map((i, idx) => (
                <button
                  key={i.key}
                  type="button"
                  role="tab"
                  id={`subtab-${i.key}`}
                  aria-selected={i.key === sub.key}
                  aria-controls="editor-panel"
                  tabIndex={i.key === sub.key ? 0 : -1}
                  onClick={() => setActiveSub(i.key)}
                  onKeyDown={(e) => onSubKeyDown(e, idx)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold",
                    i.key === sub.key
                      ? "bg-surface-raised text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {i.label}
                </button>
              ))}
            </div>
          ) : (
            <h2 id={`panel-heading-${section.key}`} className="px-1 text-sm font-semibold text-foreground">
              {section.items[0]!.label}
            </h2>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              aria-pressed={advanced}
              title="Toggle Simple / Advanced mode"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                advanced
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Sigma className="size-3.5" /> {advanced ? "Advanced" : "Simple"}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={ed.undo}
              disabled={!ed.canUndo || ed.status === "conflict"}
              title="Undo last change"
            >
              <Undo2 className="size-4" /> Undo
            </Button>
            <SaveStatusBadge status={ed.status} error={ed.error} />
          </div>
        </div>

        {ed.conflict && (
          <div className="mb-3">
            <ConflictResolver
              merged={ed.conflict.merged}
              conflicts={ed.conflict.conflicts}
              serverSheet={ed.conflict.serverSheet}
              onResolve={ed.resolveConflict}
            />
          </div>
        )}

        <Card>
          <CardContent
            id="editor-panel"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby={panelLabelId}
            className="p-5"
          >
            {/* While a conflict is open, lock the fields so an edit can't race the resolution
                (which is keyed to the snapshot shown in the banner). Resolve first, then edit. */}
            <fieldset
              disabled={ed.status === "conflict"}
              className={cn("m-0 min-w-0 border-0 p-0", ed.status === "conflict" && "opacity-60")}
            >
              {sub.render()}
            </fieldset>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Mobile (< md) section picker: a button showing the active section that opens a
 *  bottom-sheet list of all sections (replaces the desktop vertical rail). */
function SectionSheet({
  sections,
  activeKey,
  onSelect,
}: {
  sections: SheetSection[];
  activeKey: string;
  onSelect: (sectionKey: string, subKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = sections.find((s) => s.key === activeKey) ?? sections[0]!;
  const ActiveIcon = active.icon;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="tap-target flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium"
        >
          <ActiveIcon className="size-4 text-gold" />
          <span className="text-foreground">{active.label}</span>
          <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-3 focus:outline-none md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Dialog.Title className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sheet sections
          </Dialog.Title>
          <div className="mt-1 space-y-1">
            {sections.map((s) => {
              const Icon = s.icon;
              const isActive = s.key === activeKey;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    onSelect(s.key, s.items[0]!.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "tap-target flex w-full items-center gap-3 rounded-lg px-3 text-left text-sm",
                    isActive ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", isActive ? "text-gold" : "")} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Live values top bar (all breakpoints): a sticky collapsed stat row that expands inline to the full
 *  LivePreview — the "edit a field, watch the math" loop, now across the top so the editor gets full
 *  column width (replaces the old lg right-hand sidebar). */
function LivePreviewBar({ ed, characterId, advanced }: { ed: EditorApi; characterId: string; advanced: boolean }) {
  const [open, setOpen] = useState(false);
  const s = ed.computed.summary;
  return (
    <div className="sticky top-20 z-20 mb-3 rounded-lg border border-border bg-surface/95 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="editor-live-preview"
        className="tap-target flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs"
      >
        <span className="tnum font-semibold text-foreground">
          HP {s.hp.current}/{s.hp.max}
        </span>
        <span className="tnum text-muted-foreground">AC {s.ac}</span>
        <span className="tnum text-muted-foreground">Init {formatModifier(s.initiative)}</span>
        <span className="tnum text-muted-foreground">
          F {formatModifier(s.fortitude)} · R {formatModifier(s.reflex)} · W {formatModifier(s.will)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-rune">
          {open ? "Hide" : "Live values"}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {/* Always render the region so aria-controls resolves; only mount the (heavier)
          preview when expanded. */}
      <div
        id="editor-live-preview"
        hidden={!open}
        className="max-h-[70dvh] overflow-y-auto border-t border-border p-2"
      >
        {open && <LivePreview ed={ed} characterId={characterId} advanced={advanced} />}
      </div>
    </div>
  );
}

const RULE_GROUPS: { key: RuleModuleGroup; label: string }[] = [
  { key: "paizo", label: "Paizo optional rules" },
  { key: "subsystem", label: "Subsystems & tracking" },
  { key: "thirdparty", label: "Third-party content" },
];

function HeroPointsEditor({ ed }: { ed: EditorApi }) {
  const hp = ed.draft.heroPoints;
  const max = maxHeroPoints(hp ?? {});
  const current = Math.min(hp?.current ?? 1, max);

  const ensure = (mut: (h: HeroPointsBlock) => void) =>
    ed.update((c) => {
      if (!c.heroPoints) c.heroPoints = { current: 1, bonusMax: 0, log: [] };
      mut(c.heroPoints);
    });
  const adjust = (delta: number, kind: HeroPointsBlock["log"][number]["kind"], reason: string) =>
    ensure((h) => {
      const m = maxHeroPoints(h);
      const next = Math.max(0, Math.min(m, h.current + delta));
      if (next === h.current) return;
      h.current = next;
      h.log = [{ id: newId("hp"), delta, kind, reason }, ...(h.log ?? [])].slice(0, 20);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Hero points don&apos;t renew on rest — spend them for a +8 bonus, a reroll, an extra action, or to
        cheat death. Max {max}.
      </p>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={current <= 0} onClick={() => adjust(-1, "special", "Spent a hero point")}>
          − Spend
        </Button>
        <span className="tnum text-2xl font-semibold text-gold">
          {current}
          <span className="text-base text-muted-foreground">/{max}</span>
        </span>
        <Button size="sm" variant="outline" disabled={current >= max} onClick={() => adjust(1, "award", "Awarded a hero point")}>
          + Award
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex h-9 items-center gap-1.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={!!hp?.heroesFortune}
            onChange={(e) => ensure((h) => (h.heroesFortune = e.target.checked || undefined))}
          />
          Hero&apos;s Fortune feat (+1 max)
        </label>
        <NumberField
          label="Other bonus to max"
          value={hp?.bonusMax ?? 0}
          min={0}
          onChange={(v) => ensure((h) => (h.bonusMax = v))}
          className="w-32"
        />
      </div>
      {hp?.log && hp.log.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</h4>
          <ul className="space-y-0.5 text-sm">
            {hp.log.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-baseline gap-2">
                <span className={e.delta >= 0 ? "tnum text-gold" : "tnum text-danger"}>
                  {e.delta >= 0 ? `+${e.delta}` : e.delta}
                </span>
                <span className="text-muted-foreground">{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HonorEditor({ ed }: { ed: EditorApi }) {
  const honor = ed.draft.honor;
  const computed = ed.computed.summary.honor;
  const baseline = honorBaseline(ed.draft);

  const ensure = (mut: (h: HonorBlock) => void) =>
    ed.update((c) => {
      if (!c.honor) c.honor = { code: "general", events: [] };
      mut(c.honor);
    });
  const addEvent = (delta: number, reason: string) =>
    ensure((h) => {
      h.events = [{ id: newId("honor"), delta, reason }, ...(h.events ?? [])].slice(0, 50);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Honor runs 0–100, starting at your Charisma score + level ({baseline}). At 0 you are dishonored:
        −2 on Will saves and Charisma-based skills.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <span className="block text-sm font-medium text-foreground">Score</span>
          <span
            className={cn(
              "text-2xl font-semibold",
              computed?.dishonored ? "text-danger" : "text-gold",
            )}
          >
            {computed?.score ?? baseline}
            <span className="ml-2 text-sm text-muted-foreground">{computed?.tier ?? "—"}</span>
          </span>
        </div>
        <SelectField
          label="Honor code"
          value={honor?.code ?? "general"}
          onChange={(v) => ensure((h) => (h.code = v as HonorBlock["code"]))}
          options={HONOR_CODES.map((c) => ({ value: c, label: c[0]!.toUpperCase() + c.slice(1) }))}
          className="w-40"
        />
        <NumberField
          label="Baseline override"
          value={honor?.baselineOverride ?? baseline}
          onChange={(v) => ensure((h) => (h.baselineOverride = v === baseline ? undefined : v))}
          className="w-32"
        />
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record an event</h4>
        <div className="flex flex-wrap gap-1.5">
          {HONOR_EVENTS.map((e) => (
            <button
              key={e.label}
              type="button"
              onClick={() => addEvent(e.delta, e.label)}
              className="tap-target rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-gold/50"
            >
              {e.label} {e.delta >= 0 ? `+${e.delta}` : e.delta}
            </button>
          ))}
        </div>
      </div>

      {honor?.events && honor.events.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h4>
          <ul className="space-y-0.5 text-sm">
            {honor.events.slice(0, 8).map((e, i) => (
              <li key={e.id} className="flex items-baseline gap-2">
                <span className={e.delta >= 0 ? "tnum text-gold" : "tnum text-danger"}>
                  {e.delta >= 0 ? `+${e.delta}` : e.delta}
                </span>
                <span className="flex-1 text-muted-foreground">{e.reason}</span>
                <button
                  type="button"
                  aria-label="Remove event"
                  onClick={() => ed.update((c) => void c.honor?.events.splice(i, 1))}
                  className="tap-target -my-1 -mr-1 inline-flex size-6 items-center justify-center rounded text-xs text-muted-foreground hover:text-danger"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StaminaEditor({ ed }: { ed: EditorApi }) {
  const stamina = ed.draft.stamina;
  const max = ed.computed.summary.stamina?.max ?? 0;
  const current = Math.min(stamina?.current ?? 0, max);
  const featNames = new Set(ed.draft.feats.list.map((f) => f.name.toLowerCase()));
  const tricks = COMBAT_TRICKS.filter((t) => featNames.has(t.feat.toLowerCase()));

  const ensure = (mut: (s: StaminaBlock) => void) =>
    ed.update((c) => {
      if (!c.stamina) c.stamina = { current: 0, bonusMax: 0 };
      mut(c.stamina);
    });
  const spend = (delta: number) => ensure((s) => (s.current = Math.max(0, Math.min(max, s.current + delta))));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Stamina pool = base attack bonus + Con modifier + bonus ({max}). Spend it to power combat tricks
        tied to your combat feats; it refreshes fully on a rest and partially after a full attack.
      </p>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={current <= 0} onClick={() => spend(-1)}>
          − Spend
        </Button>
        <span className="tnum text-2xl font-semibold text-rune">
          {current}
          <span className="text-base text-muted-foreground">/{max}</span>
        </span>
        <Button size="sm" variant="outline" disabled={current >= max} onClick={() => spend(1)}>
          + Regain
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ensure((s) => (s.current = max))}>
          Rest
        </Button>
      </div>
      <NumberField
        label="Bonus to max"
        value={stamina?.bonusMax ?? 0}
        min={0}
        onChange={(v) => ensure((s) => (s.bonusMax = v))}
        className="w-32"
      />
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Combat tricks</h4>
        {tricks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No combat feats with a known stamina trick yet. Add combat feats on the Feats tab.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tricks.map((t) => (
              <li key={t.feat}>
                <span className="font-medium text-foreground">{t.feat}</span>{" "}
                <span className="text-xs text-muted-foreground">({t.cost} stamina)</span> — {t.effect}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MythicEditor({ ed }: { ed: EditorApi }) {
  const mythic = ed.draft.mythic;
  const tier = mythic?.tier ?? 0;
  const max = maxMythicPower(tier);
  const current = Math.min(mythic?.mythicPowerCurrent ?? max, max);

  const ensure = (mut: (m: MythicBlock) => void) =>
    ed.update((c) => {
      if (!c.mythic) c.mythic = { tier: 0, path: "none", abilityBoosts: [], pathAbilities: [] };
      mut(c.mythic);
    });
  const spendPower = (delta: number) =>
    ensure((m) => {
      m.mythicPowerCurrent = Math.max(0, Math.min(maxMythicPower(m.tier), current + delta));
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mythic layers a tier track on your class levels. Spend mythic power on the Surge ({mythicSurgeDie(tier) || "—"})
        and path abilities. Amazing Initiative adds +tier to initiative at tier 2+.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <NumberField
          label="Tier"
          value={tier}
          min={0}
          onChange={(v) => ensure((m) => (m.tier = Math.max(0, Math.min(10, v))))}
          className="w-20"
        />
        <SelectField
          label="Path"
          value={mythic?.path ?? "none"}
          onChange={(v) => ensure((m) => (m.path = v as MythicBlock["path"]))}
          options={MYTHIC_PATHS.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))}
          className="w-36"
        />
        <div className="pb-1 text-sm text-muted-foreground">
          +½ tier ={" "}
          <span className="font-semibold text-foreground">+{Math.floor(tier / 2)}</span> effective level
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">Mythic power</span>
        <Button size="sm" variant="outline" disabled={current <= 0} onClick={() => spendPower(-1)}>
          − Spend
        </Button>
        <span className="tnum text-xl font-semibold text-gold">
          {current}
          <span className="text-sm text-muted-foreground">/{max}</span>
        </span>
        <Button size="sm" variant="outline" disabled={current >= max} onClick={() => spendPower(1)}>
          +
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ensure((m) => (m.mythicPowerCurrent = maxMythicPower(m.tier)))}>
          Rest
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Path abilities, mythic feats, and tier ability-score boosts get their own editor + a searchable
        compendium in a later pass.
      </p>
    </div>
  );
}

/** Per-system card metadata for the Spheres editor (icon + accent text token). */
const SYSTEM_CARDS: { sys: SphereSystem; label: string; Icon: typeof Sparkles; text: string }[] = [
  { sys: "Magic", label: "Power", Icon: Sparkles, text: "text-rune" },
  { sys: "Combat", label: "Might", Icon: Swords, text: "text-gold" },
  { sys: "Skill", label: "Guile", Icon: Target, text: "text-success" },
];

/** Sub-lists longer than this start collapsed, so a giant talent list doesn't bury the rest of the card. */
const SPHERE_SUBSECTION_COLLAPSE_AT = 6;

/** A collapsible sub-section inside a Spheres system card (count badge + chevron + Add). Keeps its own
 * open state so the player can fold away big lists; large lists default collapsed to conserve space. */
function SphereSubsection({
  title,
  count,
  accent,
  addLabel,
  onAdd,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  accent?: string;
  addLabel: string;
  onAdd: () => void;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-border/60">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
        >
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <span className={cn("text-xs font-semibold uppercase tracking-wide", accent ?? "text-muted-foreground")}>
            {title}
          </span>
          <span className="rounded-full bg-surface-raised px-1.5 text-[10px] font-medium text-muted-foreground">{count}</span>
        </button>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={onAdd}>
          <Plus className="size-3.5" /> {addLabel}
        </Button>
      </div>
      {open && <div className="space-y-1.5 border-t border-border/50 p-2">{children}</div>}
    </div>
  );
}

/** A compact removable chip (the redesigned Spheres editor's spheres/talents/drawbacks/boons). The body
 * is an optional click target (open a grant's target/note editor, toggle a talent's bonus flag); the
 * trailing × removes it. `tone` = the border/bg/text classes; `note` renders the "→ …" annotation. */
function SphereChip({
  label,
  note,
  tone,
  title,
  leading,
  onClick,
  onRemove,
}: {
  label: string;
  note?: string;
  tone: string;
  title?: string;
  leading?: ReactNode;
  onClick?: () => void;
  onRemove: () => void;
}) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs", tone)}>
      {leading}
      <button
        type="button"
        onClick={onClick}
        title={title}
        disabled={!onClick}
        className={cn("min-w-0 truncate text-left", onClick && "hover:underline")}
      >
        {label}
        {note ? <span className="opacity-75"> → {note}</span> : null}
      </button>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="-mr-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** A small "add by name" inline input — manual entry alongside the compendium Browse, for the chip lists. */
function AddByName({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [v, setV] = useState("");
  const commit = () => {
    const name = v.trim();
    if (name) onAdd(name);
    setV("");
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
      placeholder={placeholder}
      className="h-7 w-32 rounded-full border border-dashed border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground"
    />
  );
}

/** Decode a "kind:id" target select value (e.g. "sphere:sph_x") back into a grant target, or undefined. */
function decodeGrantTarget(v: string): SphereGrantTarget | undefined {
  if (!v) return undefined;
  const [kind, ...rest] = v.split(":");
  const id = rest.join(":");
  if ((kind === "sphere" || kind === "talent") && id) return { kind, id };
  return undefined;
}

function SpheresEditor({ ed }: { ed: EditorApi }) {
  const sp = ed.draft.spheres;
  const summary = ed.computed.summary.spheres;
  const max = summary?.spellPoints.max ?? 0;
  const current = Math.min(sp?.spellPointsCurrent ?? max, max);

  const ensure = (mut: (s: SpheresBlock) => void) =>
    ed.update((c) => {
      if (!c.spheres) {
        c.spheres = { casterClasses: [], spheres: [], talents: [], drawbacks: [], boons: [], bonusSpellPoints: 0 };
      }
      mut(c.spheres);
    });
  const spendSP = (delta: number) =>
    ensure((s) => (s.spellPointsCurrent = Math.max(0, Math.min(max, current + delta))));
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<SpherePickerMode>("talents");
  // Which drawback/boon chip's target+note editor is open (one at a time), keyed by system+kind+name.
  const [editingGrant, setEditingGrant] = useState<string | null>(null);
  const setGrantNote = (kind: "drawback" | "boon", name: string, note: string) =>
    ensure((s) => {
      const key = kind === "drawback" ? "drawbackMeta" : "boonMeta";
      const meta = { ...(s[key] ?? {}) };
      meta[name] = { ...(meta[name] ?? {}), note: note || undefined };
      s[key] = meta;
    });
  // "" = unscoped (traditions/drawbacks/boons in the shared Tradition card); a system scopes the
  // picker to that system's card. The picker renders inline under whichever entry point opened it.
  const [pickerScope, setPickerScope] = useState<SphereSystem | "">("");
  const openPicker = (m: SpherePickerMode, scope: SphereSystem | "" = "") => {
    setPickerMode(m);
    setPickerScope(scope);
    setShowPicker(true);
  };
  const renderPicker = (scope: SphereSystem | "") =>
    showPicker && pickerScope === scope ? (
      <div className="mt-3">
        <SpherePicker
          ed={ed}
          mode={pickerMode}
          onModeChange={setPickerMode}
          system={scope || undefined}
          onClose={() => setShowPicker(false)}
        />
      </div>
    ) : null;
  const power = isModuleKeyEnabled(ed.draft, "spheres_of_power");
  const might = isModuleKeyEnabled(ed.draft, "spheres_of_might");
  const guile = isModuleKeyEnabled(ed.draft, "spheres_of_guile");
  const systemEnabled = (sys: SphereSystem) => (sys === "Magic" ? power : sys === "Combat" ? might : guile);
  // Show a card for any system that's enabled OR already holds data, so existing spheres/talents/classes
  // can never be hidden + orphaned just because their module isn't toggled on.
  const hasSystemData = (sys: SphereSystem) =>
    (sp?.casterClasses ?? []).some((c) => (c.system ?? "Magic") === sys) ||
    (sp?.spheres ?? []).some((x) => x.system === sys) ||
    (sp?.talents ?? []).some((t) => talentSystem(t, sp?.spheres ?? []) === sys) ||
    (sp?.drawbacks ?? []).some((d) => grantSystem(d, sp?.drawbackMeta) === sys) ||
    (sp?.boons ?? []).some((b) => grantSystem(b, sp?.boonMeta) === sys);
  // Set/clear a drawback's or boon's target sphere/talent (the "applies here" flag).
  const setGrantTarget = (kind: "drawback" | "boon", name: string, target: SphereGrantTarget | undefined) =>
    ensure((s) => {
      const key = kind === "drawback" ? "drawbackMeta" : "boonMeta";
      const meta = { ...(s[key] ?? {}) };
      meta[name] = { ...(meta[name] ?? {}), appliesTo: target };
      s[key] = meta;
    });
  // When a sphere/talent is deleted, clear any drawback/boon flag that pointed at it (stale target).
  const clearTargetsTo = (s: SpheresBlock, id: string) => {
    for (const meta of [s.drawbackMeta, s.boonMeta]) {
      if (!meta) continue;
      for (const k of Object.keys(meta)) {
        if (meta[k]?.appliesTo?.id === id) meta[k] = { ...meta[k], appliesTo: undefined };
      }
    }
  };

  // Stat tiles for ONE system — each card shows only its own (Power: CL/SP/MSB/MSD/DC; Might: combat
  // talents; Guile: skill talents).
  const sub = (n: ReactNode) => <span className="text-base font-normal text-muted-foreground">{n}</span>;
  const tilesFor = (sys: SphereSystem): { label: string; value: ReactNode }[] => {
    if (!summary) return [];
    if (sys === "Magic")
      return [
        { label: "Caster level", value: summary.casterLevel },
        { label: "Spell points", value: (<>{current}{sub(<>/{max}</>)}</>) },
        { label: "MSB / MSD", value: (<>+{summary.magicSkillBonus}{sub(<> / {summary.magicSkillDefense}</>)}</>) },
        { label: "Save DC", value: summary.saveDc },
      ];
    if (sys === "Combat")
      return [{ label: "Combat talents", value: (<>{summary.combatTalentsSpent}{sub(<>/{summary.combatTalentsKnown}</>)}</>) }];
    return [{ label: "Skill talents", value: (<>{summary.skillTalentsSpent}{sub(<>/{summary.skillTalentsKnown}</>)}</>) }];
  };
  const setSystemTradition = (sys: SphereSystem, fields: { name?: string; custom?: boolean }) =>
    ensure((s) => setSystemTraditionFields(s, sys, fields));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="size-4 text-rune" /> Spheres
        </span>
        {[
          { on: power, Icon: Sparkles, label: "Power", tone: "border-rune/40 bg-rune/15" },
          { on: might, Icon: Swords, label: "Might", tone: "border-gold/40 bg-gold/15" },
          { on: guile, Icon: Target, label: "Guile", tone: "border-success/35 bg-success/10" },
        ].map(({ on, Icon, label, tone }) => (
          <span
            key={label}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${
              on ? `${tone} text-foreground` : "border-border text-muted-foreground"
            }`}
          >
            <Icon className="size-3.5" /> {label}
          </span>
        ))}
      </div>

      {/* One card per enabled system — its own stat tiles, tradition, practitioner classes, spheres,
          talents, drawbacks + boons, with a system-scoped compendium picker. */}
      {SYSTEM_CARDS.filter((d) => systemEnabled(d.sys) || hasSystemData(d.sys)).map((d) => {
        const classes = (sp?.casterClasses ?? [])
          .map((cc, i) => ({ cc, i }))
          .filter(({ cc }) => (cc.system ?? "Magic") === d.sys);
        const spheresOf = (sp?.spheres ?? []).map((x, i) => ({ x, i })).filter(({ x }) => x.system === d.sys);
        const talentsOf = (sp?.talents ?? [])
          .map((t, i) => ({ t, i }))
          .filter(({ t }) => talentSystem(t, sp?.spheres ?? []) === d.sys);
        const regularTalentsOf = talentsOf.filter(({ t }) => !t.bonus);
        const bonusTalentsOf = talentsOf.filter(({ t }) => t.bonus);
        const drawbacksOf = (sp?.drawbacks ?? [])
          .map((name, i) => ({ name, i }))
          .filter(({ name }) => grantSystem(name, sp?.drawbackMeta) === d.sys);
        const boonsOf = (sp?.boons ?? [])
          .map((name, i) => ({ name, i }))
          .filter(({ name }) => grantSystem(name, sp?.boonMeta) === d.sys);
        // "Affects" options for the per-grant target picker: this system's spheres + talents.
        const targetOptions = [
          { value: "", label: "Whole tradition" },
          ...spheresOf.filter(({ x }) => x.name).map(({ x }) => ({ value: `sphere:${x.id}`, label: `Sphere: ${x.name}` })),
          ...talentsOf.filter(({ t }) => t.talentName).map(({ t }) => ({ value: `talent:${t.id}`, label: `Talent: ${t.talentName}` })),
        ];
        const Icon = d.Icon;
        const trad = sp ? systemTradition(sp, d.sys) : undefined;
        const cardTiles = tilesFor(d.sys);
        return (
          <section key={d.sys} className="rounded-xl border border-border p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", d.text)}>
                <Icon className="size-4" /> {d.label}
              </h3>
              <Button size="sm" variant="ghost" onClick={() => openPicker("talents", d.sys)}>
                <Plus className="size-4" /> Browse {d.label}
              </Button>
            </div>

            {/* This system's stat tiles */}
            {cardTiles.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {cardTiles.map((t) => (
                  <div key={t.label} className="rounded-lg border border-border bg-surface-raised p-2.5">
                    <div className="text-[11px] text-muted-foreground">{t.label}</div>
                    <div className="tnum text-xl font-semibold text-foreground">{t.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Spell-point control (Power) */}
            {d.sys === "Magic" && power && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5 text-sm">
                <Zap className="size-4 text-rune" />
                <span className="font-medium text-foreground">Spell points</span>
                <Button size="sm" variant="outline" disabled={current <= 0} onClick={() => spendSP(-1)}>
                  − Spend
                </Button>
                <span className="tnum text-lg font-semibold text-rune">
                  {current}
                  <span className="text-sm text-muted-foreground">/{max}</span>
                </span>
                <Button size="sm" variant="outline" disabled={current >= max} onClick={() => spendSP(1)}>
                  +
                </Button>
                <Button size="sm" variant="ghost" onClick={() => ensure((s) => (s.spellPointsCurrent = max))}>
                  Rest
                </Button>
                <div className="w-full sm:ml-auto sm:w-auto">
                  <NumberField
                    label="Bonus SP"
                    value={sp?.bonusSpellPoints ?? 0}
                    onChange={(v) => ensure((s) => (s.bonusSpellPoints = v))}
                    className="w-24"
                  />
                </div>
              </div>
            )}

            {/* Martial focus (Might) */}
            {d.sys === "Combat" && might && (
              <label className="mb-3 flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--pf-gold)]"
                  checked={!!sp?.martialFocus}
                  onChange={(e) => ensure((s) => (s.martialFocus = e.target.checked || undefined))}
                />
                <Swords className="size-4 text-gold" /> Martial focus — currently focused
              </label>
            )}

            {/* Tradition (this system) — prominent card: name + custom + Browse presets, then drawback /
                boon / bonus-talent chips. Click a drawback/boon chip to set its target + note. */}
            <section className="mb-3 rounded-xl border border-rune/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                  <ScrollText className="size-4 text-rune" /> Tradition
                  {trad?.name && (
                    <span className="truncate text-sm font-medium text-rune">
                      — {trad.custom ? `Custom: ${trad.name}` : trad.name}
                    </span>
                  )}
                </span>
                <Button size="sm" variant="ghost" onClick={() => openPicker("traditions", d.sys)}>
                  <Plus className="size-3.5" /> Browse presets
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap items-end gap-3">
                <TextField
                  label="Tradition name"
                  value={trad?.name ?? ""}
                  onChange={(v) => setSystemTradition(d.sys, { name: v })}
                  className="min-w-[10rem] flex-1"
                />
                <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--pf-gold)]"
                    checked={!!trad?.custom}
                    onChange={(e) => setSystemTradition(d.sys, { custom: e.target.checked })}
                  />
                  Custom build
                </label>
              </div>

              {/* Drawbacks */}
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <CircleAlert className="size-3.5 text-danger" /> Drawbacks
                </span>
                {drawbacksOf.map(({ name, i }) => (
                  <SphereChip
                    key={name}
                    label={name}
                    note={sp?.drawbackMeta?.[name]?.note}
                    tone="border-danger/30 bg-danger/10 text-foreground"
                    title="Set target / note"
                    onClick={() =>
                      setEditingGrant(editingGrant === `${d.sys}:drawback:${name}` ? null : `${d.sys}:drawback:${name}`)
                    }
                    onRemove={() =>
                      ensure((s) => {
                        s.drawbacks.splice(i, 1);
                        if (s.drawbackMeta && !s.drawbacks.includes(name)) delete s.drawbackMeta[name];
                      })
                    }
                  />
                ))}
                <button type="button" onClick={() => openPicker("drawbacks", d.sys)} className="text-xs text-rune hover:underline">
                  + Browse
                </button>
                <AddByName
                  placeholder="+ name"
                  onAdd={(name) =>
                    ensure((s) => {
                      if (!s.drawbacks.includes(name)) s.drawbacks.push(name);
                      const m = { ...(s.drawbackMeta ?? {}) };
                      m[name] = { ...m[name], system: d.sys };
                      s.drawbackMeta = m;
                    })
                  }
                />
              </div>

              {/* Boons */}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5 text-success" /> Boons
                </span>
                {boonsOf.map(({ name, i }) => (
                  <SphereChip
                    key={name}
                    label={name}
                    note={sp?.boonMeta?.[name]?.note}
                    tone="border-success/35 bg-success/10 text-foreground"
                    title="Set target / note"
                    onClick={() =>
                      setEditingGrant(editingGrant === `${d.sys}:boon:${name}` ? null : `${d.sys}:boon:${name}`)
                    }
                    onRemove={() =>
                      ensure((s) => {
                        s.boons.splice(i, 1);
                        if (s.boonMeta && !s.boons.includes(name)) delete s.boonMeta[name];
                      })
                    }
                  />
                ))}
                <button type="button" onClick={() => openPicker("boons", d.sys)} className="text-xs text-rune hover:underline">
                  + Browse
                </button>
                <AddByName
                  placeholder="+ name"
                  onAdd={(name) =>
                    ensure((s) => {
                      if (!s.boons.includes(name)) s.boons.push(name);
                      const m = { ...(s.boonMeta ?? {}) };
                      m[name] = { ...m[name], system: d.sys };
                      s.boonMeta = m;
                    })
                  }
                />
              </div>

              {/* Bonus talents (free; from drawbacks/tradition) */}
              {bonusTalentsOf.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Bonus talents</span>
                  {bonusTalentsOf.map(({ t: tal, i }) => (
                    <SphereChip
                      key={tal.id}
                      label={tal.talentName || "(unnamed)"}
                      tone="border-rune/40 bg-rune/15 text-foreground"
                      leading={
                        <button
                          type="button"
                          aria-label="Unmark bonus"
                          title="Make a normal talent"
                          onClick={() => ensure((s) => { const t = s.talents[i]; if (t) t.bonus = undefined; })}
                          className="shrink-0 text-rune"
                        >
                          <Star className="size-3 fill-current" />
                        </button>
                      }
                      onRemove={() => ensure((s) => { clearTargetsTo(s, tal.id); s.talents.splice(i, 1); })}
                    />
                  ))}
                </div>
              )}

              {/* Inline editor for the clicked drawback/boon chip (target + note) */}
              {[
                ...drawbacksOf.map((x) => ({ ...x, kind: "drawback" as const })),
                ...boonsOf.map((x) => ({ ...x, kind: "boon" as const })),
              ]
                .filter(({ kind, name }) => editingGrant === `${d.sys}:${kind}:${name}`)
                .map(({ kind, name }) => {
                  const meta = kind === "drawback" ? sp?.drawbackMeta?.[name] : sp?.boonMeta?.[name];
                  const t = meta?.appliesTo;
                  return (
                    <div
                      key={`${kind}:${name}`}
                      className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-raised p-2"
                    >
                      <SelectField
                        label={`"${name}" affects`}
                        value={t ? `${t.kind}:${t.id}` : ""}
                        onChange={(v) => setGrantTarget(kind, name, decodeGrantTarget(v))}
                        options={targetOptions}
                        className="w-full sm:w-44"
                      />
                      <TextField
                        label="Note (e.g. +1 talent)"
                        value={meta?.note ?? ""}
                        onChange={(v) => setGrantNote(kind, name, v)}
                        className="min-w-[8rem] flex-1"
                      />
                      <Button size="sm" variant="ghost" onClick={() => setEditingGrant(null)}>
                        Done
                      </Button>
                    </div>
                  );
                })}
            </section>

            {renderPicker(d.sys)}

            <div className="mt-1 space-y-3">
              {/* Practitioner classes */}
              <SphereSubsection
                title="Practitioner classes"
                count={classes.length}
                addLabel="Class"
                defaultOpen={classes.length <= SPHERE_SUBSECTION_COLLAPSE_AT}
                onAdd={() =>
                  ensure((s) =>
                    s.casterClasses.push({
                      id: newId("sphcl"),
                      className: "",
                      system: d.sys,
                      casterType: "high",
                      classLevel: 1,
                      castingAbility: "int",
                    }),
                  )
                }
              >
                {classes.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
                {classes.map(({ cc, i }) => (
                    <div key={cc.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
                      <TextField
                        label="Class"
                        value={cc.className}
                        onChange={(v) => ensure((s) => { const t = s.casterClasses[i]; if (t) t.className = v; })}
                        className="min-w-[8rem] flex-1"
                      />
                      <SelectField
                        label="System"
                        value={cc.system ?? "Magic"}
                        onChange={(v) => ensure((s) => { const t = s.casterClasses[i]; if (t) t.system = v as SpheresBlock["casterClasses"][number]["system"]; })}
                        options={[
                          { value: "Magic", label: "Magic" },
                          { value: "Combat", label: "Combat" },
                          { value: "Skill", label: "Skill" },
                        ]}
                        className="w-24"
                      />
                      <SelectField
                        label="Type"
                        value={cc.casterType}
                        onChange={(v) => ensure((s) => { const t = s.casterClasses[i]; if (t) t.casterType = v as SpheresBlock["casterClasses"][number]["casterType"]; })}
                        options={SPHERE_CASTER_TYPES.map((t) => ({ value: t, label: t[0]!.toUpperCase() + t.slice(1) }))}
                        className="w-24"
                      />
                      <NumberField
                        label="Level"
                        value={cc.classLevel}
                        min={0}
                        onChange={(v) => ensure((s) => { const t = s.casterClasses[i]; if (t) t.classLevel = v; })}
                        className="w-16"
                      />
                      {(cc.system ?? "Magic") === "Magic" && (
                        <SelectField
                          label="Ability"
                          value={cc.castingAbility}
                          onChange={(v) => ensure((s) => { const t = s.casterClasses[i]; if (t) t.castingAbility = v; })}
                          options={[
                            { value: "int", label: "INT" },
                            { value: "wis", label: "WIS" },
                            { value: "cha", label: "CHA" },
                          ]}
                          className="w-20"
                        />
                      )}
                      <Button variant="ghost" size="icon" aria-label="Remove class" onClick={() => ensure((s) => s.casterClasses.splice(i, 1))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
              </SphereSubsection>

              {/* Spheres — chips */}
              <SphereSubsection
                title="Spheres"
                count={spheresOf.length}
                addLabel="Browse"
                defaultOpen={spheresOf.length <= SPHERE_SUBSECTION_COLLAPSE_AT}
                onAdd={() => openPicker("spheres", d.sys)}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {spheresOf.length === 0 && <span className="text-xs text-muted-foreground">None yet.</span>}
                  {spheresOf.map(({ x, i }) => (
                    <SphereChip
                      key={x.id}
                      label={x.name || "(unnamed)"}
                      tone="border-border bg-surface-raised text-foreground"
                      onRemove={() => ensure((s) => { clearTargetsTo(s, x.id); s.spheres.splice(i, 1); })}
                    />
                  ))}
                  <AddByName
                    placeholder="+ sphere"
                    onAdd={(name) => ensure((s) => s.spheres.push({ id: newId("sph"), name, system: d.sys }))}
                  />
                </div>
              </SphereSubsection>

              {/* Talents — chips. The ★ marks a talent as a bonus (free) talent → it moves to the
                  Tradition card's "Bonus talents" row and stops counting against the budget. */}
              <SphereSubsection
                title="Talents"
                count={regularTalentsOf.length}
                addLabel="Browse"
                defaultOpen={regularTalentsOf.length <= SPHERE_SUBSECTION_COLLAPSE_AT}
                onAdd={() => openPicker("talents", d.sys)}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {regularTalentsOf.length === 0 && <span className="text-xs text-muted-foreground">None yet.</span>}
                  {regularTalentsOf.map(({ t: tal, i }) => (
                    <SphereChip
                      key={tal.id}
                      label={tal.talentName || "(unnamed)"}
                      tone="border-border bg-surface-raised text-foreground"
                      leading={
                        <button
                          type="button"
                          aria-label="Mark as a bonus talent"
                          title="Mark as a bonus (free) talent"
                          onClick={() => ensure((s) => { const t = s.talents[i]; if (t) t.bonus = true; })}
                          className="shrink-0 text-muted-foreground hover:text-rune"
                        >
                          <Star className="size-3" />
                        </button>
                      }
                      onRemove={() => ensure((s) => { clearTargetsTo(s, tal.id); s.talents.splice(i, 1); })}
                    />
                  ))}
                  <AddByName
                    placeholder="+ talent"
                    onAdd={(name) =>
                      ensure((s) => s.talents.push({ id: newId("tal"), sphereName: "", talentName: name, system: d.sys }))
                    }
                  />
                </div>
              </SphereSubsection>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PsionicsEditor({ ed }: { ed: EditorApi }) {
  const ps = ed.draft.psionics;
  const summary = ed.computed.summary.psionics;
  const max = summary?.powerPoints.max ?? 0;
  const current = Math.min(ps?.powerPointsCurrent ?? max, max);
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");

  const ensure = (mut: (p: PsionicsBlock) => void) =>
    ed.update((c) => {
      if (!c.psionics) c.psionics = { classes: [], powersKnown: [] };
      mut(c.psionics);
    });
  const importPowers = () => {
    const { powers, warnings } = parsePsionicPowers(pasteText);
    if (powers.length === 0) {
      setPasteMsg(warnings[0] ?? "Nothing parsed.");
      return;
    }
    ensure((p) => {
      for (const pw of powers) p.powersKnown.push({ ...pw, id: newId("pow") });
    });
    setPasteText("");
    setPasteMsg(`Added ${powers.length} power${powers.length === 1 ? "" : "s"}.${warnings.length ? ` (${warnings.length} note${warnings.length === 1 ? "" : "s"})` : ""}`);
  };
  const spendPP = (delta: number) => ensure((p) => (p.powerPointsCurrent = Math.max(0, Math.min(max, current + delta))));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        A power-point pool spent on powers known. You can never spend more PP on one manifestation than
        your manifester level ({summary?.maxPowerCost ?? 0}).
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <span className="text-sm font-medium text-foreground">Power points</span>
        <Button size="sm" variant="outline" disabled={current <= 0} onClick={() => spendPP(-1)}>
          − Spend
        </Button>
        <span className="tnum text-xl font-semibold text-rune">
          {current}
          <span className="text-base text-muted-foreground">/{max}</span>
        </span>
        <Button size="sm" variant="outline" disabled={current >= max} onClick={() => spendPP(1)}>
          +
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ensure((p) => (p.powerPointsCurrent = max))}>
          Rest
        </Button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={!!ps?.psionicFocus}
            onChange={(e) => ensure((p) => (p.psionicFocus = e.target.checked || undefined))}
          />
          Psionically focused
        </label>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Psionic classes</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              ensure((p) =>
                p.classes.push({
                  id: newId("psi"),
                  className: "Psion",
                  manifesterLevel: 1,
                  keyAbility: "int",
                  basePowerPoints: 0,
                  discipline: "generalist",
                }),
              )
            }
          >
            <Plus className="size-4" /> Class
          </Button>
        </div>
        {(ps?.classes.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No psionic classes yet.</p>}
        <div className="space-y-2">
          {ps?.classes.map((cl, i) => {
            const keyMod = ed.computed.abilities[cl.keyAbility]?.modifier ?? 0;
            return (
              <div key={cl.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
                <TextField
                  label="Class"
                  value={cl.className}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.className = v; })}
                  className="min-w-[8rem] flex-1"
                />
                <NumberField
                  label="ML"
                  value={cl.manifesterLevel}
                  min={0}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.manifesterLevel = v; })}
                  className="w-16"
                />
                <SelectField
                  label="Key"
                  value={cl.keyAbility}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.keyAbility = v; })}
                  options={[
                    { value: "int", label: "INT" },
                    { value: "wis", label: "WIS" },
                    { value: "cha", label: "CHA" },
                  ]}
                  className="w-20"
                />
                <NumberField
                  label="Base PP"
                  value={cl.basePowerPoints}
                  min={0}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.basePowerPoints = v; })}
                  className="w-20"
                />
                <SelectField
                  label="Discipline"
                  value={cl.discipline}
                  onChange={(v) => ensure((p) => { const t = p.classes[i]; if (t) t.discipline = v as PsionicsBlock["classes"][number]["discipline"]; })}
                  options={PSIONIC_DISCIPLINES.map((d) => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) }))}
                  className="w-36"
                />
                <span className="pb-2 text-xs text-muted-foreground">+{bonusPowerPoints(keyMod, cl.manifesterLevel)} PP</span>
                <Button variant="ghost" size="icon" aria-label="Remove class" onClick={() => ensure((p) => p.classes.splice(i, 1))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Powers known ({ps?.powersKnown.length ?? 0})</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => ensure((p) => p.powersKnown.push({ id: newId("pow"), name: "New power", level: 1 }))}
          >
            <Plus className="size-4" /> Power
          </Button>
        </div>
        <div className="space-y-1.5">
          {ps?.powersKnown
            .slice()
            .map((pw, i) => (
              <div key={pw.id} className="flex flex-wrap items-end gap-2 rounded-md border border-border/70 p-1.5">
                <TextField
                  label="Power"
                  value={pw.name}
                  onChange={(v) => ensure((p) => { const t = p.powersKnown[i]; if (t) t.name = v; })}
                  className="min-w-[10rem] flex-1"
                />
                <NumberField
                  label="Lvl"
                  value={pw.level}
                  min={0}
                  onChange={(v) => ensure((p) => { const t = p.powersKnown[i]; if (t) t.level = v; })}
                  className="w-14"
                />
                <NumberField
                  label="PP"
                  value={pw.ppCost ?? 0}
                  min={0}
                  onChange={(v) => ensure((p) => { const t = p.powersKnown[i]; if (t) t.ppCost = v || undefined; })}
                  className="w-14"
                />
                <Button variant="ghost" size="icon" aria-label="Remove power" onClick={() => ensure((p) => p.powersKnown.splice(i, 1))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
        </div>
        <div className="mt-3 rounded-lg border border-border/60 p-2">
          <p className="mb-1 text-xs font-medium text-foreground">Paste powers to import</p>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Paste one or more power statblocks (blank line between them). Name, level, discipline, PP, and
            augment are read automatically; the full text is kept so nothing is lost. A searchable
            compendium lands in a later pass.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Energy Ray\nDiscipline psychokinesis; Level psion/wilder 1\nPower Points 1\nYou project a ray…"}
            rows={4}
            className="w-full rounded-md border border-border bg-background p-2 text-xs text-foreground"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={!pasteText.trim()} onClick={importPowers}>
              Parse &amp; add
            </Button>
            {pasteMsg && <span className="text-xs text-muted-foreground">{pasteMsg}</span>}
          </div>
        </div>
      </section>
    </div>
  );
}

function MilestoneLevelingEditor({ ed }: { ed: EditorApi }) {
  const ml = ed.draft.milestoneLeveling;
  const summary = ed.computed.summary.milestoneLeveling;
  const charLevel = Math.max(1, ed.draft.identity.totalLevel || 1);
  const [jobLevel, setJobLevel] = useState(charLevel);

  const ensure = (mut: (m: MilestoneLevelingBlock) => void) =>
    ed.update((c) => {
      if (!c.milestoneLeveling) c.milestoneLeveling = { current: 0, log: [] };
      mut(c.milestoneLeveling);
    });
  const earnJob = (difficulty: MilestoneDifficulty) => {
    const value = milestoneJobReward(jobLevel, difficulty);
    ensure((m) => {
      m.current = Math.max(0, m.current + value);
      m.log = [{ id: newId("job"), jobLevel, difficulty, value }, ...(m.log ?? [])].slice(0, 30);
    });
  };
  const undoJob = (id: string) =>
    ensure((m) => {
      const entry = (m.log ?? []).find((e) => e.id === id);
      if (!entry) return;
      m.current = Math.max(0, m.current - entry.value);
      m.log = (m.log ?? []).filter((e) => e.id !== id);
    });

  const current = summary?.current ?? 0;
  const log = ml?.log ?? [];
  const pct = summary
    ? Math.min(100, summary.span > 0 ? (summary.intoLevel / summary.span) * 100 : 100)
    : 0;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Replaces XP. Milestones are <strong>cumulative</strong> — finish jobs to earn them, and level up
        (bump your class level on the Identity tab) when your running total reaches the next threshold.
        Your level is read from your class level; the tables below come from the campaign rules.
      </p>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold text-foreground">Level {summary?.level ?? charLevel}</span>
          {summary?.atCap ? (
            <span className="text-sm text-muted-foreground">Max level</span>
          ) : summary && summary.span === 0 ? (
            <span className="text-sm text-muted-foreground">Levels freely (no milestones required yet)</span>
          ) : summary?.readyToLevel ? (
            <span className="text-sm font-semibold text-success">Ready to level up!</span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {summary?.remaining ?? 0} to level {summary?.nextLevel ?? charLevel + 1}
            </span>
          )}
        </div>
        {!summary?.atCap && (summary?.span ?? 0) > 0 && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-rune" style={{ width: `${pct}%` }} />
            </div>
            <div className="tnum text-xs text-muted-foreground">
              {current}/{summary?.nextThreshold ?? 0} cumulative milestones
            </div>
          </>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
          <p className="text-sm font-medium text-foreground">Complete a job</p>
          <NumberField
            label="Job level"
            value={jobLevel}
            min={1}
            max={MILESTONE_MAX_JOB_LEVEL}
            onChange={(v) => setJobLevel(Math.max(1, Math.min(MILESTONE_MAX_JOB_LEVEL, v)))}
            className="w-28"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MILESTONE_DIFFICULTIES.map((d) => {
            const value = milestoneJobReward(jobLevel, d);
            return (
              <Button
                key={d}
                size="sm"
                variant="secondary"
                disabled={value <= 0}
                onClick={() => earnJob(d)}
                className="flex-col items-start py-2 capitalize"
              >
                <span>{d}</span>
                <span className="text-xs text-muted-foreground">+{value}</span>
              </Button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Job rewards scale by job level (defaults to your level); jobs below level 3 are worth 0.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <NumberField
          label="Milestones (manual)"
          value={ml?.current ?? 0}
          min={0}
          onChange={(v) => ensure((m) => (m.current = Math.max(0, v)))}
          className="w-44"
        />
        <span className="pb-2 text-xs text-muted-foreground">Adjust the total directly if needed.</span>
      </div>

      {log.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Recent jobs</p>
          <div className="space-y-1">
            {log.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1 text-sm"
              >
                <span className="capitalize text-foreground">
                  {e.difficulty} job{" "}
                  <span className="text-muted-foreground">(lvl {e.jobLevel})</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tnum text-muted-foreground">+{e.value}</span>
                  <Button variant="ghost" size="sm" onClick={() => undoJob(e.id)}>
                    Undo
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Sections whose visibility actually gates the read view (in render order). */
const PRIVACY_EDIT_SECTIONS: Array<{ key: string; label: string }> = [
  { key: "portrait", label: "Portrait" },
  { key: "abilities", label: "Ability scores" },
  { key: "attacks", label: "Attacks" },
  { key: "skills", label: "Skills" },
  { key: "feats", label: "Feats" },
  { key: "features", label: "Features & traits" },
  { key: "buffs", label: "Active buffs" },
  { key: "spells", label: "Spellcasting" },
  { key: "spheres", label: "Spheres" },
  { key: "inventory", label: "Inventory" },
  { key: "wealth", label: "Wealth" },
  { key: "backstory", label: "Background & profile" },
  { key: "formulaDetails", label: "Show math (formulas)" },
];

const PRIVACY_LEVEL_OPTIONS: Array<{ value: PrivacyLevel; label: string }> = [
  { value: "public", label: "Public" },
  { value: "party", label: "Party" },
  { value: "gm_only", label: "GM only" },
  { value: "owner_only", label: "Private (just me)" },
];

/** Collapse the wider PrivacyLevel set into the four the picker offers, so the select never goes blank. */
function privacyDisplayLevel(l: PrivacyLevel): PrivacyLevel {
  if (l === "campaign") return "party";
  if (l === "private" || l === "custom") return "owner_only";
  return l;
}

function SettingsEditor({ ed }: { ed: EditorApi }) {
  const toggleRule = (mod: OptionalRuleModule, on: boolean) =>
    ed.update((c) => {
      if (mod.variantKey) {
        c.rules.variants[mod.variantKey] = on || undefined;
        // Fractional changes the BAB/save math — recompute so the toggle takes effect immediately.
        if (mod.variantKey === "fractionalBabSaves") recomputeClassDerived(c, { hpMethod: "manual" });
        return;
      }
      const arr = c.rules.modules;
      const idx = arr.findIndex((m) => m.key === mod.key);
      if (on) {
        if (idx < 0) arr.push({ key: mod.key, enabled: true, settings: {} });
        else {
          const m = arr[idx];
          if (m) m.enabled = true;
        }
      } else if (idx >= 0) {
        arr.splice(idx, 1);
      }
      // Gestalt changes BAB/saves/HP and the character level — recompute so the toggle takes effect.
      if (mod.key === "gestalt") {
        c.identity.totalLevel = isGestalt(c) ? gestaltLevel(c) : c.identity.classes.reduce((s, x) => s + x.level, 0);
        recomputeClassDerived(c, { hpMethod: "manual" });
      }
    });

  const enabledCount = OPTIONAL_RULE_MODULES.filter((m) => isRuleEnabled(ed.draft, m)).length;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Privacy &amp; sharing</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Who can see each section on shared / public views — you always see everything. Inventory and
          Wealth default to <strong>Party</strong>, so they&rsquo;re hidden on a public share until you
          set them to Public here.
        </p>
        <div className="mt-3 space-y-1.5">
          {PRIVACY_EDIT_SECTIONS.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">{s.label}</span>
              <select
                value={privacyDisplayLevel(effectiveLevel(ed.draft, s.key))}
                onChange={(e) =>
                  ed.update((c) => {
                    c.privacy.sections[s.key] = e.target.value as PrivacyLevel;
                  })
                }
                aria-label={`${s.label} visibility`}
                className="h-11 rounded-lg border border-border bg-background px-2 text-sm text-foreground md:h-10"
              >
                {PRIVACY_LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground">Optional rules &amp; 3pp</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Switch on the optional rulesets and third-party systems this character uses. Enabling a module flags the
          sheet for it; its fields and calculations appear as each module ships.
          {enabledCount > 0 ? ` ${enabledCount} enabled.` : ""}
        </p>
      </div>

      {RULE_GROUPS.map((g) => (
        <section key={g.key}>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPTIONAL_RULE_MODULES.filter((m) => m.group === g.key).map((mod) => {
              const on = isRuleEnabled(ed.draft, mod);
              const comingSoon = isModuleComingSoon(mod.key);
              // Coming-soon systems can't be newly enabled (the toggle would do nothing), but an
              // already-on one stays toggle-able so it can be turned back off.
              const locked = comingSoon && !on;
              return (
                <label
                  key={mod.key}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-3 transition-colors",
                    locked
                      ? "cursor-not-allowed border-border opacity-60"
                      : "cursor-pointer",
                    !locked && on ? "border-gold/40 bg-gold/5" : "",
                    !locked && !on ? "border-border hover:border-border/80" : "",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={(e) => toggleRule(mod, e.target.checked)}
                    aria-label={mod.name}
                    className="mt-0.5 size-4 accent-[var(--pf-gold)] disabled:cursor-not-allowed"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{mod.name}</span>
                      {comingSoon && (
                        <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Coming soon
                        </span>
                      )}
                      {mod.publisher && (
                        <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {mod.publisher}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{mod.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        The overall share link &amp; visibility (private / unlisted / public) and theme live on the
        character overview.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Editors                                                                    */
/* -------------------------------------------------------------------------- */

type EditorApi = ReturnType<typeof useCharacterEditor>;

function LanguagesEditor({ ed }: { ed: EditorApi }) {
  const known = ed.draft.languages.known;
  const budget = languageBudget(ed.draft, ed.computed);
  const [input, setInput] = useState("");

  const has = (lang: string) => known.some((l) => l.toLowerCase() === lang.trim().toLowerCase());
  const add = (lang: string) => {
    const v = lang.trim();
    if (!v || has(v)) {
      setInput("");
      return;
    }
    ed.update((d) => {
      d.languages.known.push(v);
    });
    setInput("");
  };
  const remove = (lang: string) =>
    ed.update((d) => {
      d.languages.known = d.languages.known.filter((l) => l !== lang);
    });

  const available = COMMON_LANGUAGES.filter((l) => !has(l));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Languages</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Bonus languages available: <span className="font-semibold text-foreground">{budget.total}</span>{" "}
          <span className="text-xs">
            ({formatModifier(budget.intBonus)} Int mod + {budget.linguisticsRanks} Linguistics rank
            {budget.linguisticsRanks === 1 ? "" : "s"})
          </span>
          {" — "}beyond your racial / starting languages.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {known.length === 0 && <span className="text-sm text-muted-foreground">No languages added yet.</span>}
        {known.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1 text-sm text-foreground"
          >
            {l}
            <button
              type="button"
              onClick={() => remove(l)}
              aria-label={`Remove ${l}`}
              className="tap-target -my-1 -mr-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="pf-language-add">Add a language</Label>
          <Input
            id="pf-language-add"
            value={input}
            list="pf-language-options"
            placeholder="e.g. Draconic, or a custom language"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(input);
              }
            }}
          />
          <datalist id="pf-language-options">
            {available.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <Button type="button" size="sm" onClick={() => add(input)} disabled={!input.trim()}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {available.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Common languages
          </div>
          <div className="flex flex-wrap gap-1.5">
            {available.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => add(l)}
                className="tap-target rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-rune hover:text-foreground"
              >
                + {l}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const PF_SIZES = [
  "Fine",
  "Diminutive",
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
  "Colossal",
];

type ClassEntry = PathForgeCharacterV1["identity"]["classes"][number];

/** One class row, collapsed to Class · Level · HD · (Track) with the rest (archetype, future per-class
 * fields) behind a chevron — keeps the row compact + reasonable on mobile. */
function ClassRow({ ed, cl, i }: { ed: EditorApi; cl: ClassEntry; i: number }) {
  const [open, setOpen] = useState(false);
  const gestalt = isGestalt(ed.draft);
  const set = (mut: (t: ClassEntry, c: PathForgeCharacterV1) => void) =>
    ed.update((c) => {
      const t = c.identity.classes[i];
      if (t) mut(t, c);
    });
  const syncLevel = (c: PathForgeCharacterV1) => {
    c.identity.totalLevel = isGestalt(c) ? gestaltLevel(c) : c.identity.classes.reduce((s, x) => s + x.level, 0);
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-end gap-2 p-2">
        <TextField
          label="Class"
          value={cl.name}
          onChange={(v) => set((t) => (t.name = v))}
          className="min-w-[7rem] flex-1"
        />
        <NumberField
          label="Level"
          value={cl.level}
          min={0}
          onChange={(v) =>
            set((t, c) => {
              t.level = v;
              syncLevel(c);
              if (t.presetKey) recomputeClassDerived(c, { hpMethod: "manual" });
            })
          }
          className="w-16"
        />
        <SelectField
          label="Hit Die"
          value={cl.hitDie ?? ""}
          onChange={(v) => set((t) => (t.hitDie = v || undefined))}
          options={[
            { value: "", label: "—" },
            { value: "d6", label: "d6" },
            { value: "d8", label: "d8" },
            { value: "d10", label: "d10" },
            { value: "d12", label: "d12" },
          ]}
          className="w-20"
        />
        {gestalt && (
          <SelectField
            label="Track"
            value={cl.track ?? "a"}
            onChange={(v) =>
              set((t, c) => {
                t.track = v as "a" | "b";
                c.identity.totalLevel = gestaltLevel(c);
                if (t.presetKey) recomputeClassDerived(c, { hpMethod: "manual" });
              })
            }
            options={[
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ]}
            className="w-16"
          />
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} more details for ${cl.name}`}
          className="flex h-10 items-center rounded-md px-1.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${cl.name}`}
          onClick={() =>
            ed.update((c) => {
              const removed = c.identity.classes[i];
              c.identity.classes.splice(i, 1);
              syncLevel(c);
              if (removed?.presetKey || c.identity.classes.some((x) => x.presetKey)) {
                recomputeClassDerived(c, { hpMethod: "manual" });
              }
            })
          }
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {open && (
        <div className="border-t border-border/50 p-2">
          <TextField
            label="Archetype"
            value={cl.archetype ?? ""}
            onChange={(v) => set((t) => (t.archetype = v || undefined))}
            className="w-full max-w-sm"
          />
        </div>
      )}
    </div>
  );
}

function IdentityEditor({ ed }: { ed: EditorApi }) {
  const id = ed.draft.identity;
  const prog = ed.draft.progression;
  const [showCatalog, setShowCatalog] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const hasPresetClass = id.classes.some((c) => c.presetKey);

  // Size is a controlled <select> over the 9 canonical sizes (matched case-insensitively, so
  // the engine's getSizeModifiers always resolves) — a typo'd legacy value is kept as an option.
  const matchedSize = PF_SIZES.find((s) => s.toLowerCase() === (id.size ?? "medium").toLowerCase());
  const identitySizeValue = matchedSize ?? id.size ?? "Medium";
  const identitySizeOptions = (matchedSize || !id.size ? PF_SIZES : [id.size, ...PF_SIZES]).map((s) => ({
    value: s,
    label: s,
  }));
  const [fav, setFav] = useState("");

  const addFavored = () => {
    const v = fav.trim();
    if (!v) return;
    ed.update((c) => {
      if (!c.progression.favoredClasses.includes(v)) c.progression.favoredClasses.push(v);
    });
    setFav("");
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Name" value={id.name} onChange={(v) => ed.update((c) => (c.identity.name = v))} />
        <TextField label="Player" value={id.playerName ?? ""} onChange={(v) => ed.update((c) => (c.identity.playerName = v || undefined))} />
        <TextField label="Race" value={id.race ?? ""} onChange={(v) => ed.update((c) => (c.identity.race = v || undefined))} />
        <TextField label="Alignment" value={id.alignment ?? ""} onChange={(v) => ed.update((c) => (c.identity.alignment = v || undefined))} placeholder="LG, N, CE…" />
        <SelectField label="Size" value={identitySizeValue} onChange={(v) => ed.update((c) => (c.identity.size = v))} options={identitySizeOptions} />
        <TextField label="Deity" value={id.deity ?? ""} onChange={(v) => ed.update((c) => (c.identity.deity = v || undefined))} />
        <TextField label="Homeland" value={id.homeland ?? ""} onChange={(v) => ed.update((c) => (c.identity.homeland = v || undefined))} />
        <TextField label="Ethnicity" value={id.ethnicity ?? ""} onChange={(v) => ed.update((c) => (c.identity.ethnicity = v || undefined))} />
        <TextField label="Gender" value={id.gender ?? ""} onChange={(v) => ed.update((c) => (c.identity.gender = v || undefined))} />
        <TextField label="Age" value={id.age ?? ""} onChange={(v) => ed.update((c) => (c.identity.age = v || undefined))} />
        <TextField label="Height" value={id.height ?? ""} onChange={(v) => ed.update((c) => (c.identity.height = v || undefined))} />
        <TextField label="Weight" value={id.weight ?? ""} onChange={(v) => ed.update((c) => (c.identity.weight = v || undefined))} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Classes</h3>
          <div className="flex items-center gap-1.5">
            {hasPresetClass && (
              <Button
                size="sm"
                variant="ghost"
                title="Re-sum BAB and saves from your classes"
                onClick={() => ed.update((c) => { recomputeClassDerived(c, { hpMethod: "manual" }); })}
              >
                Recompute
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setShowCatalog((v) => !v)}>
              <Sparkles className="size-4" /> From catalog
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                ed.update((c) => {
                  c.identity.classes.push({ id: newId("class"), name: "Class", level: 1 });
                  c.identity.totalLevel = isGestalt(c)
                    ? gestaltLevel(c)
                    : c.identity.classes.reduce((s, cl) => s + cl.level, 0);
                })
              }
            >
              <Plus className="size-4" /> Custom
            </Button>
          </div>
        </div>
        {showCatalog && (
          <div className="mb-3">
            <ClassPresetPicker
              ed={ed}
              onApplied={(r) => {
                setShowCatalog(false);
                setApplyMsg(r.wrote.join("; "));
              }}
            />
          </div>
        )}
        <div className="space-y-2">
          {id.classes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No classes yet. Add a class to set your level and hit dice.
            </p>
          )}
          {id.classes.map((cl, i) => (
            <ClassRow key={cl.id} ed={ed} cl={cl} i={i} />
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Total level: <span className="font-semibold text-foreground">{id.totalLevel}</span>
        </p>
        {applyMsg && <p className="mt-1 text-[11px] text-success">Applied — {applyMsg}.</p>}
      </div>

      <NumberField
        label="Base attack bonus (BAB)"
        value={typeof ed.draft.combat.bab.total === "number" ? ed.draft.combat.bab.total : 0}
        min={0}
        onChange={(v) => ed.update((c) => (c.combat.bab.total = v))}
        hint="Drives melee/ranged attack and CMB/CMD."
        className="max-w-xs"
      />

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Advancement</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label="Current XP"
            value={prog.currentXp ?? 0}
            min={0}
            onChange={(v) => ed.update((c) => (c.progression.currentXp = v || undefined))}
          />
          <NumberField
            label="Next level XP"
            value={prog.nextLevelXp ?? 0}
            min={0}
            onChange={(v) => ed.update((c) => (c.progression.nextLevelXp = v || undefined))}
          />
          <div className="space-y-1">
            <span className="block text-sm font-medium leading-none text-foreground">XP track</span>
            <select
              value={prog.xpTrack ?? "medium"}
              aria-label="XP track"
              onChange={(e) =>
                ed.update((c) => (c.progression.xpTrack = e.target.value as "slow" | "medium" | "fast" | "custom"))
              }
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            >
              {["slow", "medium", "fast", "custom"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <span className="mb-1 block text-sm font-medium text-foreground">Favored classes</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {prog.favoredClasses.length === 0 && <span className="text-sm text-muted-foreground">None.</span>}
            {prog.favoredClasses.map((fc, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-foreground">
                {fc}
                <button
                  type="button"
                  aria-label={`Remove ${fc}`}
                  onClick={() => ed.update((c) => c.progression.favoredClasses.splice(i, 1))}
                  className="tap-target -my-1.5 -mr-1.5 inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-danger"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex max-w-sm gap-2">
            <input
              value={fav}
              placeholder="Class name…"
              aria-label="Add favored class"
              onChange={(e) => setFav(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFavored();
                }
              }}
              className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10"
            />
            <Button size="sm" variant="secondary" onClick={addFavored}>
              Add
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

const ABILITY_ADJUSTS = [
  { key: "enhancement", label: "Enh" },
  { key: "inherent", label: "Inherent" },
  { key: "tempAdjust", label: "Temp" },
  { key: "damage", label: "Damage" },
  { key: "penalty", label: "Penalty" },
  { key: "drain", label: "Drain" },
] as const;

function makeDefaultPointBuy(ed: EditorApi): PointBuyState {
  // Seed the panel from the current scores as pre-racial values (racial 0). We never
  // try to auto-decompose an existing score into base + racial — see S1 open questions.
  const allocations: Record<string, number> = {};
  const racial: Record<string, number> = {};
  for (const key of ABILITY_KEYS) {
    const cur = ed.draft.abilities.primary[key]?.score ?? 10;
    allocations[key] = Math.min(18, Math.max(7, cur));
    racial[key] = 0;
  }
  return {
    enabled: true,
    done: false,
    budget: 15,
    system: "standard",
    minScore: 7,
    maxScore: 18,
    allocations,
    racial,
  };
}

function PointBuyPanel({ ed, advanced }: { ed: EditorApi; advanced: boolean }) {
  const pb = ed.draft.abilities.pointBuy;

  if (!pb?.enabled) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-surface-raised/30 px-4 py-3">
        <div className="min-w-0 text-sm">
          <span className="font-medium text-foreground">Point Buy calculator</span>
          <p className="text-xs text-muted-foreground">
            Allocate a budget across abilities instead of typing scores by hand.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            ed.update((c) => {
              // Re-enable a previously-configured block in place (preserves the saved
              // allocations / racial split / budget); only seed a fresh block when none exists.
              if (c.abilities.pointBuy) c.abilities.pointBuy.enabled = true;
              else c.abilities.pointBuy = makeDefaultPointBuy(ed);
            })
          }
        >
          <Calculator className="size-4" /> Use Point Buy
        </Button>
      </div>
    );
  }

  const coreAlloc: Record<string, number> = {};
  for (const key of ABILITY_KEYS) coreAlloc[key] = pb.allocations[key] ?? 10;
  const spent = pointBuySpent(coreAlloc);
  const remaining = pb.budget - spent;
  // Fail closed: a score with no defined point-buy cost (e.g. a variant maxScore > 18)
  // must block Apply rather than silently count as 0 in the spend total.
  const allValid = ABILITY_KEYS.every((key) => pointBuyCost(pb.allocations[key] ?? 10) !== null);
  const over = remaining < 0 || !allValid;

  if (pb.done) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised/30 px-4 py-3">
        <span className="text-sm text-muted-foreground">
          Point buy: <span className="text-foreground">{pb.budget} pts</span> · {remaining} remaining
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => ed.update((c) => { if (c.abilities.pointBuy) c.abilities.pointBuy.done = false; })}
        >
          Reopen
        </Button>
      </div>
    );
  }

  const apply = () =>
    ed.update((c) => {
      const p = c.abilities.pointBuy;
      if (!p) return;
      for (const key of ABILITY_KEYS) {
        const base = p.allocations[key] ?? 10;
        const rac = p.racial[key] ?? 0;
        c.abilities.primary[key].score = composeAbilityScore(base, rac, 0);
        c.abilities.primary[key].pointBuyBase = base;
      }
    });

  const markDone = () =>
    ed.update((c) => {
      const p = c.abilities.pointBuy;
      if (!p) return;
      for (const key of ABILITY_KEYS) {
        const base = p.allocations[key] ?? 10;
        const rac = p.racial[key] ?? 0;
        c.abilities.primary[key].score = composeAbilityScore(base, rac, 0);
        c.abilities.primary[key].pointBuyBase = base;
      }
      p.done = true;
    });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-raised/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="size-4 text-gold" />
          <span className="text-sm font-semibold text-foreground">Point Buy</span>
        </div>
        <div className="flex items-center gap-1.5">
          {[15, 20, 25].map((b) => (
            <Button
              key={b}
              size="sm"
              variant={pb.budget === b ? "default" : "outline"}
              onClick={() => ed.update((c) => { if (c.abilities.pointBuy) c.abilities.pointBuy.budget = b; })}
            >
              {b}
            </Button>
          ))}
          <div className="w-20">
            <NumberField
              label="Budget"
              value={pb.budget}
              min={0}
              onChange={(v) => ed.update((c) => { if (c.abilities.pointBuy) c.abilities.pointBuy.budget = Math.max(0, v); })}
            />
          </div>
        </div>
      </div>

      <div aria-live="polite" className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          Spent <span className="tnum text-foreground">{spent}</span> / {pb.budget}
        </span>
        <Badge variant={over ? "danger" : remaining === 0 ? "success" : "gold"}>{remaining} remaining</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {ABILITY_KEYS.map((key) => {
          const base = pb.allocations[key] ?? 10;
          const rac = pb.racial[key] ?? 0;
          const cost = pointBuyCost(base);
          return (
            <div key={key} className="rounded-md border border-border/70 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{ABILITY_NAMES[key]}</span>
                <span className="text-[11px] text-muted-foreground">cost {cost ?? "—"}</span>
              </div>
              <NumberField
                label="Pre-racial"
                value={base}
                min={pb.minScore}
                max={pb.maxScore}
                onChange={(v) =>
                  ed.update((c) => {
                    if (c.abilities.pointBuy)
                      c.abilities.pointBuy.allocations[key] = Math.min(pb.maxScore, Math.max(pb.minScore, v));
                  })
                }
              />
              {advanced && (
                <div className="mt-1.5">
                  <NumberField
                    label="Racial / other"
                    value={rac}
                    onChange={(v) => ed.update((c) => { if (c.abilities.pointBuy) c.abilities.pointBuy.racial[key] = v; })}
                  />
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                = <span className="tnum text-foreground">{composeAbilityScore(base, rac, 0)}</span> total
              </p>
            </div>
          );
        })}
      </div>

      {advanced ? (
        <p className="text-[11px] text-muted-foreground">
          Pre-racial values are seeded from your current scores. If a score already includes a racial
          bonus, lower the pre-racial value before adding the racial here, or it will count twice.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Switch to Advanced (top toggle) to enter racial modifiers per ability.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={apply} disabled={over}>
          Apply
        </Button>
        <Button size="sm" variant="secondary" onClick={markDone} disabled={over}>
          Mark as done
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            ed.update((c) => {
              // Non-destructive: keep the saved block so it can be re-enabled later, but
              // clear the now-stale point-buy provenance (the user edits score.score directly now).
              if (c.abilities.pointBuy) c.abilities.pointBuy.enabled = false;
              for (const key of ABILITY_KEYS) c.abilities.primary[key].pointBuyBase = undefined;
            })
          }
        >
          Switch to manual
        </Button>
      </div>
      {over && (
        <p className="text-xs text-danger">
          {!allValid
            ? "Some scores have no point-buy cost defined — adjust them before applying."
            : "Over budget — reduce some scores before applying."}
        </p>
      )}
    </div>
  );
}

function AbilitiesEditor({ ed, advanced }: { ed: EditorApi; advanced: boolean }) {
  const pbEnabled = ed.draft.abilities.pointBuy?.enabled ?? false;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter each ability score; modifiers update live and flow into AC, saves, attacks, and skills.
        {advanced && " Advanced: enhancement/inherent stack by type (highest wins); damage, penalty, and drain reduce the effective score."}
      </p>
      <PointBuyPanel ed={ed} advanced={advanced} />
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {ABILITY_KEYS.map((key) => {
          const score = ed.draft.abilities.primary[key];
          const comp = ed.computed.abilities[key];
          const mod = comp?.modifier ?? 0;
          return (
            <div key={key} className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{ABILITY_NAMES[key]}</span>
                <Badge variant="gold">{formatModifier(mod)}</Badge>
              </div>
              {pbEnabled ? (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Score</span>
                  <div className="flex items-center gap-2">
                    <span className="tnum text-lg font-semibold text-foreground">{score?.score ?? 10}</span>
                    <Badge variant="outline" className="text-[10px]">
                      point buy
                    </Badge>
                  </div>
                </div>
              ) : (
                <NumberField
                  label="Score"
                  value={score?.score ?? 10}
                  min={0}
                  onChange={(v) =>
                    ed.update((c) => {
                      c.abilities.primary[key].score = v;
                    })
                  }
                />
              )}
              {advanced && (
                <>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {ABILITY_ADJUSTS.map((f) => (
                      <NumberField
                        key={f.key}
                        label={f.label}
                        value={score?.[f.key] ?? 0}
                        onChange={(v) =>
                          ed.update((c) => {
                            c.abilities.primary[key][f.key] = v || undefined;
                          })
                        }
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Effective:{" "}
                    <span className="tnum text-foreground">{comp?.effectiveScore ?? score?.score ?? 10}</span>
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function newModId(): string {
  return `mod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function ModifierRows({
  title,
  valueLabel,
  labelPlaceholder,
  entries,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  valueLabel: string;
  labelPlaceholder: string;
  entries: ModifierEntry[];
  onAdd: () => void;
  onChange: (i: number, patch: Partial<ModifierEntry>) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button size="sm" variant="ghost" onClick={onAdd}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      {entries.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={e.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
            <NumberField
              label={valueLabel}
              value={typeof e.value === "number" ? e.value : Number(e.value) || 0}
              min={0}
              onChange={(v) => onChange(i, { value: v })}
              className="w-24"
            />
            <TextField
              label="Type / bypass"
              value={e.label}
              placeholder={labelPlaceholder}
              onChange={(v) => onChange(i, { label: v })}
              className="flex-1"
            />
            <Button variant="ghost" size="icon" aria-label="Remove entry" onClick={() => onRemove(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function HealthEditor({ ed }: { ed: EditorApi }) {
  const h = ed.draft.health;
  const maxHp = typeof h.maxHp === "number" ? h.maxHp : 0;
  const sr = typeof ed.draft.defenses.spellResistance === "number" ? ed.draft.defenses.spellResistance : 0;
  const [cond, setCond] = useState("");
  const [imm, setImm] = useState("");

  const addCondition = () => {
    const v = cond.trim();
    if (!v) return;
    ed.update((c) => {
      if (!c.health.conditions.some((x) => x.toLowerCase() === v.toLowerCase())) c.health.conditions.push(v);
    });
    setCond("");
  };
  const addImmunity = () => {
    const v = imm.trim();
    if (!v) return;
    ed.update((c) => {
      if (!c.health.immunities.includes(v)) c.health.immunities.push(v);
    });
    setImm("");
  };

  const cds = ed.draft.defenses.conditionalDefenses;
  type CondTarget = (typeof cds)[number]["target"];
  const addCondDef = () =>
    ed.update((c) => c.defenses.conditionalDefenses.push({ id: newId("cd"), target: "saves", bonus: 2, condition: "" }));
  const updateCondDef = (i: number, patch: Partial<(typeof cds)[number]>) =>
    ed.update((c) => {
      const cd = c.defenses.conditionalDefenses[i];
      if (cd) Object.assign(cd, patch);
    });
  const removeCondDef = (i: number) => ed.update((c) => c.defenses.conditionalDefenses.splice(i, 1));

  const wv = ed.computed.summary.woundsVigor;
  const ensureWv = (mut: (w: NonNullable<EditorApi["draft"]["health"]["woundsVigor"]>) => void) =>
    ed.update((c) => {
      if (!c.health.woundsVigor) c.health.woundsVigor = { tempVigor: 0 };
      mut(c.health.woundsVigor);
    });
  const adjVigor = (delta: number) =>
    wv &&
    ensureWv((w) => {
      w.currentVigor = Math.max(0, Math.min(wv.vigor.max, (w.currentVigor ?? wv.vigor.current) + delta));
    });
  const adjWound = (delta: number) =>
    wv &&
    ensureWv((w) => {
      w.currentWounds = Math.max(0, Math.min(wv.wound.max, (w.currentWounds ?? wv.wound.current) + delta));
    });

  const [hpDelta, setHpDelta] = useState(5);
  const [hpMethod, setHpMethod] = useState<"average" | "max">("average");
  // Gestalt HP uses the better track's pool, never both tracks summed (matches recomputeClassDerived).
  const hpFromLevels = (() => {
    if (isGestalt(ed.draft)) {
      const all = ed.draft.identity.classes;
      const a = computeMaxHpFromLevels(ed.draft, hpMethod, all.filter((c) => c.track !== "b"));
      const b = computeMaxHpFromLevels(ed.draft, hpMethod, all.filter((c) => c.track === "b"));
      return a.total >= b.total ? a : b;
    }
    return computeMaxHpFromLevels(ed.draft, hpMethod);
  })();
  const applyComputedHp = () =>
    ed.update((c) => {
      c.health.maxHp = hpFromLevels.total;
      if (c.health.currentHp === 0) c.health.currentHp = hpFromLevels.total;
    });
  const hpMax = ed.computed.summary.hp.max;
  const hpState = ed.computed.summary.hp.status;
  const damage = (amount: number) => ed.update((c) => (c.health.currentHp -= amount));
  const heal = (amount: number) =>
    ed.update((c) => {
      // Healing restores hp (up to max) and removes an equal amount of nonlethal damage.
      c.health.currentHp = Math.min(hpMax, c.health.currentHp + amount);
      c.health.nonlethalDamage = Math.max(0, c.health.nonlethalDamage - amount);
    });
  const nonlethalHit = (amount: number) =>
    ed.update((c) => (c.health.nonlethalDamage = Math.max(0, c.health.nonlethalDamage + amount)));

  return (
    <div className="space-y-6">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <NumberField label="Max HP" value={maxHp} min={0} onChange={(v) => ed.update((c) => (c.health.maxHp = v))} />
        <NumberField label="Current HP" value={h.currentHp} onChange={(v) => ed.update((c) => (c.health.currentHp = v))} />
        <NumberField label="Temp HP" value={h.tempHp} min={0} onChange={(v) => ed.update((c) => (c.health.tempHp = v))} />
        <NumberField label="Nonlethal" value={h.nonlethalDamage} min={0} onChange={(v) => ed.update((c) => (c.health.nonlethalDamage = v))} />
        <NumberField
          label="Negative levels"
          value={h.negativeLevels}
          min={0}
          onChange={(v) => ed.update((c) => (c.health.negativeLevels = v))}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
        <NumberField label="Quick adjust" value={hpDelta} min={0} onChange={setHpDelta} className="w-28" />
        <Button size="sm" variant="outline" onClick={() => damage(hpDelta)}>
          − Damage
        </Button>
        <Button size="sm" variant="outline" onClick={() => heal(hpDelta)}>
          + Heal
        </Button>
        <Button size="sm" variant="ghost" onClick={() => nonlethalHit(hpDelta)}>
          Nonlethal
        </Button>
        {hpState !== "ok" && (
          <span className="ml-auto text-sm font-semibold uppercase tracking-wide text-danger">{hpState}</span>
        )}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Compute HP from levels</h3>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="Method"
            value={hpMethod}
            onChange={(v) => setHpMethod(v as "average" | "max")}
            options={[
              { value: "average", label: "Average" },
              { value: "max", label: "Max" },
            ]}
            className="w-28"
          />
          <NumberField
            label="Favored-class HP"
            value={ed.draft.health.favoredClassHpBonus}
            min={0}
            onChange={(v) => ed.update((c) => (c.health.favoredClassHpBonus = v))}
            className="w-32"
          />
          <div className="pb-1.5 text-sm text-muted-foreground">
            ={" "}
            <span className="font-semibold text-foreground">{hpFromLevels.total} HP</span>{" "}
            <span className="text-xs">
              (HD {hpFromLevels.hd}
              {hpFromLevels.con ? ` · Con ${hpFromLevels.con >= 0 ? "+" : ""}${hpFromLevels.con}` : ""}
              {hpFromLevels.fcb ? ` · FCB +${hpFromLevels.fcb}` : ""})
            </span>
          </div>
          <Button size="sm" variant="secondary" onClick={applyComputedHp} disabled={hpFromLevels.levels === 0}>
            Apply to Max HP
          </Button>
        </div>
        {hpFromLevels.levels === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">Add class levels on the Identity tab to compute HP.</p>
        )}
      </section>

      {wv && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Wounds &amp; Vigor</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Vigor (stamina/luck) absorbs damage first; wounds are real harm. At ≤ {wv.wound.threshold} wounds
            you&apos;re staggered; 0 wounds is dead. Unset maxes derive from your Hit Dice (no Con) and Con score.
          </p>
          <div className="grid max-w-lg gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-rune">Vigor</span>
                <span className="tnum text-sm text-foreground">
                  {wv.vigor.current}/{wv.vigor.max}
                </span>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" disabled={wv.vigor.current <= 0} onClick={() => adjVigor(-1)}>
                  −
                </Button>
                <Button size="sm" variant="outline" disabled={wv.vigor.current >= wv.vigor.max} onClick={() => adjVigor(1)}>
                  +
                </Button>
                <Button size="sm" variant="ghost" onClick={() => ensureWv((w) => (w.currentVigor = wv.vigor.max))}>
                  Full
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className={cn("text-sm font-medium", wv.status !== "ok" ? "text-danger" : "text-danger")}>
                  Wounds {wv.status !== "ok" && <span className="uppercase">· {wv.status}</span>}
                </span>
                <span className="tnum text-sm text-foreground">
                  {wv.wound.current}/{wv.wound.max}
                </span>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" disabled={wv.wound.current <= 0} onClick={() => adjWound(-1)}>
                  −
                </Button>
                <Button size="sm" variant="outline" disabled={wv.wound.current >= wv.wound.max} onClick={() => adjWound(1)}>
                  +
                </Button>
                <Button size="sm" variant="ghost" onClick={() => ensureWv((w) => (w.currentWounds = wv.wound.max))}>
                  Full
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Conditions</h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {h.conditions.length === 0 && <span className="text-sm text-muted-foreground">None.</span>}
          {h.conditions.map((label, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-foreground">
              {label}
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => ed.update((c) => c.health.conditions.splice(i, 1))}
                className="text-muted-foreground hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex max-w-sm gap-2">
          <input
            value={cond}
            placeholder="Shaken, Fatigued, Prone…"
            aria-label="Add condition"
            onChange={(e) => setCond(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCondition();
              }
            }}
            className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <Button size="sm" variant="secondary" onClick={addCondition}>
            Add
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STANDARD_CONDITIONS.filter(
            (s) => !h.conditions.some((x) => x.toLowerCase() === s.toLowerCase()),
          ).map((s) => (
            <button
              key={s}
              type="button"
              title="Applies its standard PF1e effect to your stats"
              onClick={() => ed.update((c) => c.health.conditions.push(s))}
              className="tap-target rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-rune hover:text-foreground"
            >
              + {s}
            </button>
          ))}
        </div>
      </section>

      <ModifierRows
        title="Damage reduction"
        valueLabel="DR"
        labelPlaceholder="magic, silver, cold iron…"
        entries={h.damageReduction}
        onAdd={() => ed.update((c) => c.health.damageReduction.push({ id: newModId(), label: "", value: 0, enabled: true }))}
        onChange={(i, patch) =>
          ed.update((c) => {
            const e = c.health.damageReduction[i];
            if (e) Object.assign(e, patch);
          })
        }
        onRemove={(i) => ed.update((c) => c.health.damageReduction.splice(i, 1))}
      />
      <ModifierRows
        title="Energy resistance"
        valueLabel="Resist"
        labelPlaceholder="fire, cold, acid…"
        entries={h.energyResistance}
        onAdd={() => ed.update((c) => c.health.energyResistance.push({ id: newModId(), label: "", value: 0, enabled: true }))}
        onChange={(i, patch) =>
          ed.update((c) => {
            const e = c.health.energyResistance[i];
            if (e) Object.assign(e, patch);
          })
        }
        onRemove={(i) => ed.update((c) => c.health.energyResistance.splice(i, 1))}
      />

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Spell resistance &amp; immunities</h3>
        <div className="mb-3 max-w-[12rem]">
          <NumberField
            label="Spell resistance (SR)"
            value={sr}
            min={0}
            onChange={(v) => ed.update((c) => (c.defenses.spellResistance = v || undefined))}
          />
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {h.immunities.length === 0 && <span className="text-sm text-muted-foreground">No immunities.</span>}
          {h.immunities.map((label, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs text-foreground"
            >
              {label}
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => ed.update((c) => c.health.immunities.splice(i, 1))}
                className="text-muted-foreground hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex max-w-sm gap-2">
          <input
            value={imm}
            placeholder="poison, fear, disease, mind-affecting…"
            aria-label="Add immunity"
            onChange={(e) => setImm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addImmunity();
              }
            }}
            className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <Button size="sm" variant="secondary" onClick={addImmunity}>
            Add
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Conditional defenses</h3>
          <Button size="sm" variant="ghost" onClick={addCondDef}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Situational bonuses (e.g. +2 vs fear, +4 vs poison, +2 vs spells). Recorded for reference —
          not folded into base AC/save totals.
        </p>
        <div className="space-y-2">
          {cds.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
          {cds.map((cd, i) => (
            <div key={cd.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
              <NumberField
                label="Bonus"
                value={cd.bonus}
                onChange={(v) => updateCondDef(i, { bonus: v })}
                className="w-20"
              />
              <SelectField
                label="To"
                value={cd.target}
                onChange={(v) => updateCondDef(i, { target: v as CondTarget })}
                options={[
                  { value: "saves", label: "All saves" },
                  { value: "fortitude", label: "Fort" },
                  { value: "reflex", label: "Reflex" },
                  { value: "will", label: "Will" },
                  { value: "ac", label: "AC" },
                  { value: "touch", label: "Touch AC" },
                  { value: "all", label: "All" },
                ]}
              />
              <TextField
                label="Condition"
                value={cd.condition}
                placeholder="vs fear"
                onChange={(v) => updateCondDef(i, { condition: v })}
                className="min-w-[10rem] flex-1"
              />
              <Button variant="ghost" size="icon" aria-label="Remove conditional defense" onClick={() => removeCondDef(i)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SavesEditor({ ed }: { ed: EditorApi }) {
  const s = ed.draft.defenses.savingThrows;
  const total = ed.computed.saves;
  const rows: Array<{ key: "fortitude" | "reflex" | "will"; label: string }> = [
    { key: "fortitude", label: "Fortitude" },
    { key: "reflex", label: "Reflex" },
    { key: "will", label: "Will" },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Enter the class base save; the ability modifier is added automatically.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{r.label}</span>
              <Badge variant="rune">{formatModifier(total[r.key].value)}</Badge>
            </div>
            <NumberField
              label="Base"
              value={s[r.key].base}
              onChange={(v) =>
                ed.update((c) => {
                  c.defenses.savingThrows[r.key].base = v;
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-2 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tnum text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ACEditor({ ed }: { ed: EditorApi }) {
  const mods = ed.draft.defenses.armorClass.conditionalModifiers;
  const getVal = (key: string): number => {
    const m = mods.find((x) => x.id === `ac_${key}`);
    if (!m) return 0;
    return typeof m.value === "number" ? m.value : Number(m.value) || 0;
  };
  const setVal = (comp: (typeof AC_COMPONENTS)[number], v: number) =>
    ed.update((c) => {
      const arr = c.defenses.armorClass.conditionalModifiers;
      const idx = arr.findIndex((x) => x.id === `ac_${comp.key}`);
      if (v === 0) {
        if (idx >= 0) arr.splice(idx, 1);
      } else if (idx >= 0) {
        const t = arr[idx];
        if (t) t.value = v;
      } else {
        arr.push({
          id: `ac_${comp.key}`,
          label: comp.label,
          value: v,
          bonusType: comp.bonusType,
          enabled: true,
        });
      }
    });

  const ac = ed.computed.armorClass;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter your AC component bonuses. Dexterity, size, and base attack bonus are applied
        automatically; touch and flat-footed are derived.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {AC_COMPONENTS.map((comp) => (
          <NumberField
            key={comp.key}
            label={comp.label}
            value={getVal(comp.key)}
            onChange={(v) => setVal(comp, v)}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="AC" value={ac.total.value} />
        <MiniStat label="Touch" value={ac.touch.value} />
        <MiniStat label="Flat-footed" value={ac.flatFooted.value} />
        <MiniStat label="CMD" value={ac.cmd.value} />
      </div>
    </div>
  );
}

const REPEATABLE_SKILL_BASES = [
  { value: "craft", label: "Craft", ability: "int", trainedOnly: false, background: true },
  { value: "perform", label: "Perform", ability: "cha", trainedOnly: false, background: true },
  { value: "profession", label: "Profession", ability: "wis", trainedOnly: true, background: true },
  { value: "artistry", label: "Artistry", ability: "int", trainedOnly: true, background: true },
  { value: "lore", label: "Lore", ability: "int", trainedOnly: true, background: true },
] as const;
const SKILL_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

function skillDisplayLabel(s: { label: string; specialty?: string }): string {
  return s.specialty ? `${s.label} (${s.specialty})` : s.label;
}

function SkillsEditor({ ed }: { ed: EditorApi }) {
  const skills = ed.draft.skills.list;
  const totalLevel = ed.draft.identity.totalLevel ?? 0;
  const ranksSpent = skills.reduce((sum, s) => sum + (s.ranks ?? 0), 0);
  const bgEnabled = isModuleKeyEnabled(ed.draft, "background_skills");
  const bgBudget = ed.computed.summary.backgroundSkills;
  const setBgRanks = (i: number, val: number) =>
    ed.update((c) => {
      const t = c.skills.list[i];
      if (t) t.backgroundRanks = val > 0 ? val : undefined;
    });

  const [addType, setAddType] = useState<string>("custom");
  const [addName, setAddName] = useState("");
  const [addAbility, setAddAbility] = useState<string>("int");

  const manualMiscId = (id: string) => `${id}-manual-misc`;
  const miscValue = (s: (typeof skills)[number]) => {
    const m = s.misc.find((x) => x.id === manualMiscId(s.id));
    return typeof m?.value === "number" ? m.value : 0;
  };
  const setMisc = (i: number, val: number) =>
    ed.update((c) => {
      const t = c.skills.list[i];
      if (!t) return;
      const mid = manualMiscId(t.id);
      t.misc = t.misc.filter((x) => x.id !== mid);
      if (val !== 0) t.misc.push({ id: mid, label: "Misc", value: val, enabled: true });
    });
  // Named handlers shared by the desktop table + the mobile card list below.
  const setRanks = (i: number, n: number) =>
    ed.update((c) => {
      const t = c.skills.list[i];
      if (t) t.ranks = n;
    });
  const setClassSkill = (i: number, v: boolean) =>
    ed.update((c) => {
      const t = c.skills.list[i];
      if (t) t.classSkill = v;
    });
  const setAbility = (i: number, v: string) =>
    ed.update((c) => {
      const t = c.skills.list[i];
      if (t) t.ability = v;
    });
  const removeSkill = (i: number) => ed.update((c) => void c.skills.list.splice(i, 1));
  const intOr0 = (v: string) => {
    const n = v === "" ? 0 : Math.trunc(Number(v));
    return Number.isNaN(n) ? null : n;
  };

  const addSkill = () => {
    const name = addName.trim();
    ed.update((c) => {
      if (addType === "custom") {
        if (!name) return;
        c.skills.list.push({
          id: newId("skill"),
          key: newId("custom"),
          label: name,
          ability: addAbility,
          ranks: 0,
          misc: [],
          conditional: [],
          custom: true,
        });
        return;
      }
      const base = REPEATABLE_SKILL_BASES.find((b) => b.value === addType);
      if (!base) return;
      c.skills.list.push({
        id: newId("skill"),
        key: newId(base.value),
        label: base.label,
        ability: base.ability,
        ranks: 0,
        misc: [],
        conditional: [],
        custom: true,
        trainedOnly: base.trainedOnly,
        background: base.background,
        specialty: name || undefined,
      });
    });
    setAddName("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Ranks (max {totalLevel}/skill) + class-skill (+3 when trained). Totals update live.
        </p>
        <span className="text-xs text-muted-foreground">
          Ranks spent: <span className="tnum font-semibold text-foreground">{ranksSpent}</span>
          {bgBudget && (
            <span className="ml-3">
              Background:{" "}
              <span
                className={cn(
                  "tnum font-semibold",
                  bgBudget.spent > bgBudget.budget ? "text-danger" : "text-foreground",
                )}
              >
                {bgBudget.spent}/{bgBudget.budget}
              </span>
            </span>
          )}
        </span>
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-surface-raised text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Skill</th>
              <th className="px-2 py-2 font-semibold">Ability</th>
              <th className="px-2 py-2 font-semibold">Class</th>
              <th className="w-16 px-2 py-2 font-semibold">{bgEnabled ? "Adv" : "Ranks"}</th>
              {bgEnabled && <th className="w-16 px-2 py-2 font-semibold">BG</th>}
              <th className="w-16 px-2 py-2 font-semibold">Misc</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
              <th className="w-8 px-2 py-2" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {skills.map((s, i) => {
              const total = ed.computed.skills[s.key]?.value ?? 0;
              const over = s.ranks + (s.backgroundRanks ?? 0) > totalLevel;
              return (
                <tr key={s.id} className="border-t border-border/50">
                  <td className="px-3 py-1.5 text-foreground">
                    {skillDisplayLabel(s)}
                    {s.trainedOnly && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(trained)</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center text-[11px] uppercase text-muted-foreground">
                    {s.custom ? (
                      <select
                        value={s.ability}
                        aria-label={`${skillDisplayLabel(s)} ability`}
                        onChange={(e) =>
                          ed.update((c) => {
                            const t = c.skills.list[i];
                            if (t) t.ability = e.target.value;
                          })
                        }
                        className="rounded border border-border bg-background px-1 py-0.5 text-[11px] uppercase"
                      >
                        {SKILL_ABILITIES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    ) : (
                      s.ability
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={!!s.classSkill}
                      aria-label={`${skillDisplayLabel(s)} is a class skill`}
                      onChange={(e) =>
                        ed.update((c) => {
                          const t = c.skills.list[i];
                          if (t) t.classSkill = e.target.checked;
                        })
                      }
                      className="size-4 accent-[var(--pf-gold)]"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      value={s.ranks}
                      aria-label={`${skillDisplayLabel(s)} ranks`}
                      title={over ? `Ranks exceed character level (${totalLevel})` : undefined}
                      onChange={(e) => {
                        const n = e.target.value === "" ? 0 : Math.trunc(Number(e.target.value));
                        if (!Number.isNaN(n))
                          ed.update((c) => {
                            const t = c.skills.list[i];
                            if (t) t.ranks = n;
                          });
                      }}
                      className={cn(
                        "tnum h-8 w-14 rounded-md border bg-background px-2 text-sm",
                        over ? "border-danger text-danger" : "border-border",
                      )}
                    />
                  </td>
                  {bgEnabled && (
                    <td className="px-2 py-1.5">
                      {isBackgroundSkill(s) ? (
                        <input
                          type="number"
                          min={0}
                          value={s.backgroundRanks ?? 0}
                          aria-label={`${skillDisplayLabel(s)} background ranks`}
                          onChange={(e) => {
                            const n = e.target.value === "" ? 0 : Math.trunc(Number(e.target.value));
                            if (!Number.isNaN(n)) setBgRanks(i, n);
                          }}
                          className="tnum h-8 w-14 rounded-md border border-rune/40 bg-background px-2 text-sm"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={miscValue(s)}
                      aria-label={`${skillDisplayLabel(s)} misc bonus`}
                      onChange={(e) => {
                        const n = e.target.value === "" ? 0 : Math.trunc(Number(e.target.value));
                        if (!Number.isNaN(n)) setMisc(i, n);
                      }}
                      className="tnum h-8 w-14 rounded-md border border-border bg-background px-2 text-sm"
                    />
                  </td>
                  <td className="tnum px-3 py-1.5 text-right font-semibold text-rune">
                    {formatModifier(total)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {s.custom && (
                      <button
                        type="button"
                        onClick={() => ed.update((c) => void c.skills.list.splice(i, 1))}
                        aria-label={`Remove ${skillDisplayLabel(s)}`}
                        className="tap-target inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: a card per skill so nothing forces horizontal scroll. */}
      <div className="space-y-2 md:hidden">
        {skills.map((s, i) => {
          const total = ed.computed.skills[s.key]?.value ?? 0;
          const over = s.ranks + (s.backgroundRanks ?? 0) > totalLevel;
          return (
            <div key={s.id} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-foreground">
                  {skillDisplayLabel(s)}
                  {s.trainedOnly && <span className="ml-1 text-[10px] text-muted-foreground">(trained)</span>}
                </span>
                <span className="tnum shrink-0 font-semibold text-rune">{formatModifier(total)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={!!s.classSkill}
                    aria-label={`${skillDisplayLabel(s)} is a class skill`}
                    onChange={(e) => setClassSkill(i, e.target.checked)}
                    className="size-4 accent-[var(--pf-gold)]"
                  />
                  Class
                </label>
                {s.custom && (
                  <label className="text-[10px] uppercase text-muted-foreground">
                    Ability
                    <select
                      value={s.ability}
                      aria-label={`${skillDisplayLabel(s)} ability`}
                      onChange={(e) => setAbility(i, e.target.value)}
                      className="ml-1 h-10 rounded border border-border bg-background px-1 text-[11px] uppercase text-foreground"
                    >
                      {SKILL_ABILITIES.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-[10px] uppercase text-muted-foreground">
                  {bgEnabled ? "Adv" : "Ranks"}
                  <input
                    type="number"
                    min={0}
                    value={s.ranks}
                    aria-label={`${skillDisplayLabel(s)} ranks`}
                    title={over ? `Ranks exceed character level (${totalLevel})` : undefined}
                    onChange={(e) => {
                      const n = intOr0(e.target.value);
                      if (n !== null) setRanks(i, n);
                    }}
                    className={cn(
                      "tnum mt-0.5 block h-10 w-16 rounded-md border bg-background px-2 text-sm",
                      over ? "border-danger text-danger" : "border-border",
                    )}
                  />
                </label>
                {bgEnabled && isBackgroundSkill(s) && (
                  <label className="text-[10px] uppercase text-muted-foreground">
                    BG
                    <input
                      type="number"
                      min={0}
                      value={s.backgroundRanks ?? 0}
                      aria-label={`${skillDisplayLabel(s)} background ranks`}
                      onChange={(e) => {
                        const n = intOr0(e.target.value);
                        if (n !== null) setBgRanks(i, n);
                      }}
                      className="tnum mt-0.5 block h-10 w-16 rounded-md border border-rune/40 bg-background px-2 text-sm"
                    />
                  </label>
                )}
                <label className="text-[10px] uppercase text-muted-foreground">
                  Misc
                  <input
                    type="number"
                    value={miscValue(s)}
                    aria-label={`${skillDisplayLabel(s)} misc bonus`}
                    onChange={(e) => {
                      const n = intOr0(e.target.value);
                      if (n !== null) setMisc(i, n);
                    }}
                    className="tnum mt-0.5 block h-10 w-16 rounded-md border border-border bg-background px-2 text-sm"
                  />
                </label>
                {s.custom && (
                  <button
                    type="button"
                    onClick={() => removeSkill(i)}
                    aria-label={`Remove ${skillDisplayLabel(s)}`}
                    className="tap-target ml-auto inline-flex size-10 items-center justify-center rounded text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-dashed border-border p-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add a skill
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={addType}
            onChange={(e) => setAddType(e.target.value)}
            aria-label="Skill type to add"
            className="h-10 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="custom">Custom skill</option>
            {REPEATABLE_SKILL_BASES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
            placeholder={addType === "custom" ? "Skill name" : "Specialty (e.g. alchemy)"}
            aria-label={addType === "custom" ? "Custom skill name" : "Specialty"}
            className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
          />
          {addType === "custom" && (
            <select
              value={addAbility}
              onChange={(e) => setAddAbility(e.target.value)}
              aria-label="Custom skill ability"
              className="h-10 rounded-md border border-border bg-background px-2 text-sm uppercase"
            >
              {SKILL_ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
          <Button
            type="button"
            size="sm"
            onClick={addSkill}
            disabled={addType === "custom" && !addName.trim()}
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeatsEditor({ ed }: { ed: EditorApi }) {
  const feats = ed.draft.feats.list;
  const features = ed.draft.features.list;

  const featureMax = (f: (typeof features)[number]) => (typeof f.uses?.max === "number" ? f.uses.max : 0);
  const featureRemaining = (f: (typeof features)[number]) => f.uses?.current ?? featureMax(f);
  const setFeatureMax = (i: number, max: number) =>
    ed.update((c) => {
      const t = c.features.list[i];
      if (!t) return;
      if (max <= 0) {
        t.uses = undefined;
        return;
      }
      const prevMax = typeof t.uses?.max === "number" ? t.uses.max : 0;
      t.uses = {
        id: t.uses?.id ?? newId("use"),
        label: t.uses?.label,
        per: t.uses?.per ?? "day",
        notes: t.uses?.notes,
        max,
        // Keep remaining sensible: clamp to the new max, and top up when the cap grows.
        current: t.uses?.current == null ? max : Math.min(max, t.uses.current + Math.max(0, max - prevMax)),
      };
    });
  const setFeaturePer = (i: number, per: string) =>
    ed.update((c) => {
      const u = c.features.list[i]?.uses;
      if (u) u.per = per as NonNullable<typeof u.per>;
    });
  const spendFeatureUse = (i: number, delta: number) =>
    ed.update((c) => {
      const t = c.features.list[i];
      if (!t?.uses) return;
      const max = typeof t.uses.max === "number" ? t.uses.max : 0;
      const cur = t.uses.current ?? max;
      t.uses.current = Math.max(0, Math.min(max, cur - delta));
    });
  const resetFeature = (i: number) =>
    ed.update((c) => {
      const u = c.features.list[i]?.uses;
      if (u) u.current = typeof u.max === "number" ? u.max : 0;
    });

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Feats</h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              ed.update((c) =>
                c.feats.list.push({
                  id: newId("feat"),
                  name: "New Feat",
                  tags: [],
                  automation: [],
                }),
              )
            }
          >
            <Plus className="size-4" /> Add feat
          </Button>
        </div>
        {feats.length === 0 && <p className="text-sm text-muted-foreground">No feats yet.</p>}
        <div className="space-y-2">
          {feats.map((f, i) => (
            <div key={f.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
              <TextField
                label="Name"
                value={f.name}
                onChange={(v) =>
                  ed.update((c) => {
                    const t = c.feats.list[i];
                    if (t) t.name = v;
                  })
                }
                className="flex-1"
              />
              <TextField
                label="Type"
                value={f.type ?? ""}
                placeholder="Combat, General…"
                onChange={(v) =>
                  ed.update((c) => {
                    const t = c.feats.list[i];
                    if (t) t.type = v;
                  })
                }
                className="w-36"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove feat"
                onClick={() => ed.update((c) => c.feats.list.splice(i, 1))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Features &amp; abilities</h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              ed.update((c) =>
                c.features.list.push({
                  id: newId("feature"),
                  name: "New Feature",
                  category: "class_feature",
                  automation: [],
                }),
              )
            }
          >
            <Plus className="size-4" /> Add feature
          </Button>
        </div>
        {features.length === 0 && (
          <p className="text-sm text-muted-foreground">No racial traits or class features yet.</p>
        )}
        <div className="space-y-2">
          {features.map((f, i) => (
            <div key={f.id} className="space-y-2 rounded-lg border border-border p-2">
              <div className="flex items-end gap-2">
                <TextField
                  label="Name"
                  value={f.name}
                  onChange={(v) =>
                    ed.update((c) => {
                      const t = c.features.list[i];
                      if (t) t.name = v;
                    })
                  }
                  className="flex-1"
                />
                <div className="w-44 space-y-1">
                  <span className="block text-sm font-medium leading-none text-foreground">Category</span>
                  <select
                    value={f.category}
                    aria-label="Feature category"
                    onChange={(e) =>
                      ed.update((c) => {
                        const t = c.features.list[i];
                        if (t) t.category = e.target.value as (typeof FEATURE_CATEGORIES)[number];
                      })
                    }
                    className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {FEATURE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove feature"
                  onClick={() => ed.update((c) => c.features.list.splice(i, 1))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {/* Daily-use tracker — for domain/bloodline/revelation powers (e.g. "Touch of Law 7/day"). */}
              <div className="flex flex-wrap items-end gap-2 border-t border-border/40 pt-2">
                <NumberField
                  label="Uses"
                  value={featureMax(f)}
                  min={0}
                  onChange={(v) => setFeatureMax(i, v)}
                  className="w-20"
                />
                <SelectField
                  label="Per"
                  value={f.uses?.per ?? "day"}
                  onChange={(v) => setFeaturePer(i, v)}
                  options={[
                    { value: "day", label: "/ day" },
                    { value: "encounter", label: "/ encounter" },
                    { value: "hour", label: "/ hour" },
                    { value: "minute", label: "/ minute" },
                    { value: "round", label: "/ round" },
                    { value: "rest", label: "/ rest" },
                  ]}
                  className="w-32"
                />
                {featureMax(f) > 0 && (
                  <div className="flex items-center gap-1.5 pb-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={featureRemaining(f) <= 0}
                      aria-label={`Use ${f.name}`}
                      onClick={() => spendFeatureUse(i, 1)}
                    >
                      Use
                    </Button>
                    <span className="tnum text-sm text-muted-foreground">
                      {featureRemaining(f)}/{featureMax(f)} left
                    </span>
                    <Button size="sm" variant="ghost" aria-label={`Restore ${f.name}`} onClick={() => spendFeatureUse(i, -1)}>
                      +
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => resetFeature(i)}>
                      Reset
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Traits &amp; drawbacks</h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              ed.update((c) =>
                c.traits.list.push({
                  id: newId("trait"),
                  name: "New Trait",
                  automation: [],
                }),
              )
            }
          >
            <Plus className="size-4" /> Add trait
          </Button>
        </div>
        {ed.draft.traits.list.length === 0 && (
          <p className="text-sm text-muted-foreground">No traits yet (most characters take two).</p>
        )}
        <div className="space-y-2">
          {ed.draft.traits.list.map((t, i) => (
            <div key={t.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
              <TextField
                label="Name"
                value={t.name}
                onChange={(v) =>
                  ed.update((c) => {
                    const e = c.traits.list[i];
                    if (e) e.name = v;
                  })
                }
                className="flex-1"
              />
              <TextField
                label="Type"
                value={t.type ?? ""}
                placeholder="Combat, Social, Faith…"
                onChange={(v) =>
                  ed.update((c) => {
                    const e = c.traits.list[i];
                    if (e) e.type = v || undefined;
                  })
                }
                className="w-40"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove trait"
                onClick={() => ed.update((c) => c.traits.list.splice(i, 1))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfileEditor({ ed }: { ed: EditorApi }) {
  const p = ed.draft.profile;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-raised">
          <PortraitImage src={p.portraitUrl} alt="Portrait preview" fallback={ed.draft.identity.name.charAt(0) || "?"} />
        </div>
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <TextField label="Portrait URL" value={p.portraitUrl ?? ""} onChange={(v) => ed.update((c) => (c.profile.portraitUrl = v || undefined))} />
          <TextField label="Token URL" value={p.tokenUrl ?? ""} onChange={(v) => ed.update((c) => (c.profile.tokenUrl = v || undefined))} />
        </div>
      </div>
      <TextField label="Quote" value={p.quote ?? ""} onChange={(v) => ed.update((c) => (c.profile.quote = v || undefined))} />
      <TextAreaField
        label="Appearance"
        value={p.appearance.description ?? ""}
        rows={3}
        onChange={(v) => ed.update((c) => (c.profile.appearance.description = v || undefined))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextAreaField label="Personality" value={p.personality.description ?? ""} rows={3} onChange={(v) => ed.update((c) => (c.profile.personality.description = v || undefined))} />
        <TextAreaField label="Ideals & flaws" value={p.personality.ideals ?? ""} rows={3} onChange={(v) => ed.update((c) => (c.profile.personality.ideals = v || undefined))} />
      </div>
      <TextAreaField label="Backstory" value={p.backstory ?? ""} rows={6} onChange={(v) => ed.update((c) => (c.profile.backstory = v || undefined))} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Allies" value={p.allies ?? ""} onChange={(v) => ed.update((c) => (c.profile.allies = v || undefined))} />
        <TextField label="Foes" value={p.foes ?? ""} onChange={(v) => ed.update((c) => (c.profile.foes = v || undefined))} />
        <TextField label="Affiliations" value={p.affiliations ?? ""} onChange={(v) => ed.update((c) => (c.profile.affiliations = v || undefined))} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Live preview + status                                                      */
/* -------------------------------------------------------------------------- */

function LivePreview({
  ed,
  characterId,
  advanced,
}: {
  ed: EditorApi;
  characterId: string;
  advanced: boolean;
}) {
  const [showMath, setShowMath] = useState(false);
  const s = ed.computed.summary;
  const cells: Array<{ label: string; value: string | number }> = [
    { label: "AC", value: s.ac },
    { label: "Touch", value: s.touch },
    { label: "Flat", value: s.flatFooted },
    { label: "CMD", value: s.cmd },
    { label: "HP", value: `${s.hp.current}/${s.hp.max}` },
    { label: "Init", value: formatModifier(s.initiative) },
    { label: "Speed", value: `${s.speed.total} ft` },
    { label: "Fort", value: formatModifier(s.fortitude) },
    { label: "Reflex", value: formatModifier(s.reflex) },
    { label: "Will", value: formatModifier(s.will) },
  ];
  const breakdowns: Array<{ label: string; cv: ComputedValue }> = [
    { label: "Armor Class", cv: ed.computed.armorClass.total },
    { label: "Touch AC", cv: ed.computed.armorClass.touch },
    { label: "CMD", cv: ed.computed.armorClass.cmd },
    { label: "Fortitude", cv: ed.computed.saves.fortitude },
    { label: "Reflex", cv: ed.computed.saves.reflex },
    { label: "Will", cv: ed.computed.saves.will },
    { label: "Initiative", cv: ed.computed.initiative },
  ];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Live values
          </h2>
          <Link
            href={`/characters/${characterId}`}
            className="inline-flex items-center gap-1 text-xs text-rune hover:underline"
          >
            Overview <ExternalLink className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {cells.map((c) => (
            <div key={c.label} className="rounded-lg border border-border bg-surface-raised p-2 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {c.label}
              </div>
              <div className="tnum text-base font-semibold text-foreground">{c.value}</div>
            </div>
          ))}
        </div>

        {advanced && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center"
              onClick={() => setShowMath((v) => !v)}
            >
              <Sigma className="size-4" /> {showMath ? "Hide math" : "Show math"}
            </Button>
            {showMath && (
              <div className="mt-2 space-y-2">
                {breakdowns.map((b) => (
                  <FormulaBreakdown key={b.label} label={b.label} cv={b.cv} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FormulaBreakdown({ label, cv }: { label: string; cv: ComputedValue }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="tnum text-sm font-semibold text-gold">{cv.value}</span>
      </div>
      <code className="mt-1 block break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
        {cv.formula}
      </code>
      {cv.terms.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {cv.terms.map((t, i) => (
            <li key={i} className="flex items-center justify-between text-xs">
              <span className="truncate font-mono text-muted-foreground">{`@{${t.ref}}`}</span>
              <span className="tnum ml-2 shrink-0 text-foreground">{t.value}</span>
            </li>
          ))}
        </ul>
      )}
      {cv.warnings.length > 0 && (
        <p className="mt-2 text-[11px] text-warning">{cv.warnings.join("; ")}</p>
      )}
      {cv.errors.length > 0 && <p className="mt-2 text-[11px] text-danger">{cv.errors.join("; ")}</p>}
    </div>
  );
}

const STATUS_META: Record<SaveStatus, { label: string; icon: typeof Check; className: string }> = {
  saved: { label: "Saved", icon: Check, className: "text-success" },
  unsaved: { label: "Unsaved", icon: Cloud, className: "text-muted-foreground" },
  saving: { label: "Saving…", icon: Loader2, className: "text-rune" },
  error: { label: "Save failed", icon: CircleAlert, className: "text-danger" },
  conflict: { label: "Edit conflict", icon: CircleAlert, className: "text-gold" },
  offline: { label: "Offline — will sync", icon: CloudOff, className: "text-muted-foreground" },
};

function SaveStatusBadge({ status, error }: { status: SaveStatus; error: string | null }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.className)}
      title={error ?? undefined}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("size-3.5", status === "saving" && "animate-spin")} />
      {meta.label}
    </span>
  );
}
