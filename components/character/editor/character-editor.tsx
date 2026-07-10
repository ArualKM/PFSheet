"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  Search,
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
  Menu,
  ChevronsLeft,
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
  Heart,
  Handshake,
  Footprints,
} from "@/components/ui/game-icons";
import {
  ABILITY_KEYS,
  OPTIONAL_RULE_MODULES,
  isRuleEnabled,
  isModuleKeyEnabled,
  isModuleComingSoon,
  isBackgroundSkill,
  isGestalt,
  gestaltLevel,
  gestaltTracksCollapsed,
  gestaltTrackClassCounts,
  splitGestaltTracks,
  recomputeClassDerived,
  computeMaxHpFromLevels,
  resolveClassPreset,
  type ClassPreset,
  type CasterType,
  type PathForgeCharacterV1,
  type AbilityKey,
  type AutomationEffect,
  type ModifierEntry,
  type OptionalRuleModule,
  type RuleModuleGroup,
  type PointBuyState,
  COMPANION_TYPES,
  FAMILIAR_ARCHETYPES,
  type PrivacyLevel,
  DEFAULT_FORMULAS,
} from "@pathforge/schema";
import { composeAbilityScore, pointBuyCost, pointBuySpent, STANDARD_CONDITIONS, grantClassFeatures, unapplyArchetype } from "@pathforge/rules-pf1e";
import type { ComputedValue, CompendiumFeatureRow } from "@pathforge/rules-pf1e";
import { useCharacterEditor, type SaveStatus } from "./use-character-editor";
import { ConflictResolver } from "./conflict-resolver";
import { PortraitImage } from "../portrait-image";
import { NumberField, TextField, TextAreaField, SelectField } from "./fields";
import { BuffCenter } from "./buff-center";
import { CombatEditor, SpeedEditor } from "./combat-editor";
import { InventoryEditor } from "./inventory-editor";
import { SpellcastingEditor } from "./spellcasting-editor";
import { ClassCompendiumPicker } from "./class-compendium-picker";
import { ArchetypePicker } from "./archetype-picker";
import { RacePicker } from "./race-picker";
import { createClient } from "@/lib/supabase/client";
import { buildFeatureRows } from "@/lib/character/class-compendium";
import { threeppFeaturesFromProgression } from "@/lib/character/threepp-class-adapter";
import { AutomationEffectsEditor, AUTOMATION_TARGET_OPTIONS, skillTargetOptions } from "./automation-effects-editor";
import { ModifierListEditor } from "./modifier-list-editor";
import { StatChip, ThreeppSystemBadge } from "./picker-shell";
import { enabledThreeppSystems } from "@/lib/character/threepp";
import { EntryCard } from "./entry-card";
import { FeatPicker } from "./feat-picker";
import { PathOfWarEditor } from "./path-of-war-editor";
import { AkashicEditor } from "./akashic-editor";
import { OathsEditor } from "./oaths-editor";
import { BackgroundOccupationEditor } from "./background-occupation-editor";
import { DrawbackPicker } from "./drawback-picker";
import { EntryPicker } from "./entry-picker";
import { ClassOptionsPicker } from "./class-options-picker";
import { HeroPointsEditor } from "./hero-points-editor";
import { HonorEditor } from "./honor-editor";
import { StaminaEditor } from "./stamina-editor";
import { MythicEditor } from "./mythic-editor";
import { AbpEditor } from "./abp-editor";
import { SpheresEditor } from "./spheres-editor";
import { PsionicsEditor } from "./psionics-editor";
import { MilestoneLevelingEditor } from "./milestone-leveling-editor";
import { AnimatePresence, motion } from "motion/react";
import { useShouldAnimate } from "@/components/motion/use-should-animate";
import { pfDur, pfEase } from "@/components/motion/tokens";
import { EditorCanvas } from "./editor-canvas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatModifier } from "@/lib/utils";
import { COMMON_LANGUAGES, languageBudget } from "@/lib/character/languages";
import { CollapsibleGroup } from "../collapsible-group";
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

/** Modern (rail + tabbed panel) vs Classic (all-in-one continuous sheet) vs Companion (single-scroll
 *  simple sheet for a linked companion) edit layout. Persisted like the read view's SheetViewSwitch —
 *  a global default plus a per-character override — but under its own keys (the owner chose a
 *  standalone edit toggle, independent of `pf:sheetView*`). */
type EditLayout = "modern" | "classic" | "companion";
const EDIT_LAYOUT_GLOBAL = "pf:editLayout";
const editLayoutKey = (id: string) => `pf:editLayout:${id}`;

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

  // A companion (familiar / animal companion / eidolon / …) auto-defaults into the single-scroll
  // Companion Simple layout instead of Modern. Derived from the LIVE draft — identical to `initial`
  // on the very first render (the draft initializes synchronously from it, so no hydration mismatch)
  // but, unlike a frozen `initial` read, a companion `type` set mid-session (e.g. on an imported
  // sheet whose companion block arrived typeless) immediately offers the Companion layout.
  const isCompanionChar = Boolean(ed.draft.companion?.type);
  const editLayouts: EditLayout[] = isCompanionChar ? ["companion", "modern", "classic"] : ["modern", "classic"];

  // Modern ⇄ Classic ⇄ Companion edit layout (docs/CLASSIC_EDITOR_PLAN.md,
  // docs/S6_UX_OVERHAUL/01_COMPANION_SHEETS.md §2.2). Mirrors the read view's SheetViewSwitch
  // persistence contract: the per-character key wins on restore if it names an available layout;
  // the GLOBAL key is consulted only when this ISN'T a companion character — a global modern/classic
  // choice made while editing an unrelated PC must never beat the companion auto-default. Choosing
  // "companion" is deliberately NOT written to the global key for the same reason (meaningless, and
  // would pollute every other sheet's default); modern/classic still write both keys.
  const [editLayout, setEditLayoutState] = useState<EditLayout>(isCompanionChar ? "companion" : "modern");
  /* eslint-disable react-hooks/set-state-in-effect -- one-time client restore; lazy init would cause an SSR hydration mismatch */
  useEffect(() => {
    try {
      const perChar = localStorage.getItem(editLayoutKey(characterId));
      if (perChar && (editLayouts as string[]).includes(perChar)) {
        setEditLayoutState(perChar as EditLayout);
        return;
      }
      if (!isCompanionChar) {
        const global = localStorage.getItem(EDIT_LAYOUT_GLOBAL);
        if (global && (editLayouts as string[]).includes(global)) setEditLayoutState(global as EditLayout);
      }
    } catch {
      // ignore unreadable/absent storage
    }
    // Deps are the STABLE derivations (id + whether this is a companion character), not `editLayouts`
    // itself — it's a fresh array every render, and depending on it would re-run this restore on
    // every re-render and silently revert an explicit layout choice back to the stored value.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `editLayouts` is derived from `isCompanionChar` each render
  }, [characterId, isCompanionChar]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const setEditLayout = (next: EditLayout) => {
    setEditLayoutState(next);
    try {
      localStorage.setItem(editLayoutKey(characterId), next);
      if (next !== "companion") localStorage.setItem(EDIT_LAYOUT_GLOBAL, next);
    } catch {
      // ignore write failures
    }
    // The keyed layout wrappers remount on switch, which drops keyboard/SR focus to <body> —
    // land it on the incoming layout's container instead. Only for user-initiated switches
    // (the mount-restore path calls setEditLayoutState directly and must not steal focus).
    requestAnimationFrame(() => document.getElementById(`edit-layout-${next}`)?.focus());
  };

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
  if (isModuleKeyEnabled(ed.draft, "abp")) {
    optionalSystemItems.push({ key: "abp", label: "Prowess (ABP)", render: () => <AbpEditor ed={ed} /> });
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
  // Shown when enabled OR the block already has data (like the Spheres per-system cards), so
  // toggling the module off never strands existing maneuvers unreachable.
  if (
    isModuleKeyEnabled(ed.draft, "path_of_war") ||
    (ed.draft.pathOfWar?.initiators.length ?? 0) > 0 ||
    (ed.draft.pathOfWar?.maneuvers.length ?? 0) > 0
  ) {
    optionalSystemItems.push({ key: "path_of_war", label: "Path of War", render: () => <PathOfWarEditor ed={ed} /> });
  }
  if (
    isModuleKeyEnabled(ed.draft, "akashic") ||
    (ed.draft.akashic?.classes.length ?? 0) > 0 ||
    (ed.draft.akashic?.veilsKnown.length ?? 0) > 0 ||
    (ed.draft.akashic?.shaped.length ?? 0) > 0
  ) {
    optionalSystemItems.push({ key: "akashic", label: "Akashic", render: () => <AkashicEditor ed={ed} /> });
  }
  if (
    isModuleKeyEnabled(ed.draft, "oaths") ||
    (ed.draft.oaths?.oaths.length ?? 0) > 0 ||
    (ed.draft.oaths?.boons.length ?? 0) > 0
  ) {
    optionalSystemItems.push({ key: "oaths", label: "Oaths", render: () => <OathsEditor ed={ed} /> });
  }
  if (
    isModuleKeyEnabled(ed.draft, "backgrounds_occupations") ||
    !!ed.draft.backgroundOccupation?.background ||
    !!ed.draft.backgroundOccupation?.occupation
  ) {
    optionalSystemItems.push({
      key: "backgrounds_occupations",
      label: "Background & Occupation",
      render: () => <BackgroundOccupationEditor ed={ed} />,
    });
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
        ...(ed.draft.companion
          ? [{ key: "companion", label: "Companion link", render: () => <CompanionEditor ed={ed} /> }]
          : []),
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
      items: [
        { key: "optional_rules", label: "Optional rules & 3pp", render: () => <OptionalRulesEditor ed={ed} /> },
        { key: "privacy", label: "Privacy & sharing", render: () => <PrivacySharingEditor ed={ed} /> },
      ],
    },
  ];

  // ONE `ed`, three layouts (the load-bearing invariant): every layout renders the same sub-editors
  // fed the same hook instance — no layout may call useCharacterEditor itself.
  if (editLayout === "classic") {
    return (
      <div key="classic" id="edit-layout-classic" tabIndex={-1} className="pf-view-fade outline-none">
        <ClassicEditorLayout
          ed={ed}
          characterId={characterId}
          sections={sections}
          advanced={advanced}
          onToggleAdvanced={() => setAdvanced((v) => !v)}
          onSwitchLayout={setEditLayout}
          layouts={editLayouts}
        />
      </div>
    );
  }
  // A stale/foreign "companion" value (e.g. localStorage from before this character lost its
  // companion link) falls through to Modern rather than rendering a layout that has nothing to show.
  if (editLayout === "companion" && isCompanionChar) {
    return (
      <div key="companion" id="edit-layout-companion" tabIndex={-1} className="pf-view-fade outline-none">
        <CompanionSimpleLayout
          ed={ed}
          characterId={characterId}
          sections={sections}
          advanced={advanced}
          onToggleAdvanced={() => setAdvanced((v) => !v)}
          onSwitchLayout={setEditLayout}
          layouts={editLayouts}
        />
      </div>
    );
  }
  return (
    <div key="modern" id="edit-layout-modern" tabIndex={-1} className="pf-view-fade outline-none">
      <ModernEditorLayout
        ed={ed}
        characterId={characterId}
        sections={sections}
        advanced={advanced}
        onToggleAdvanced={() => setAdvanced((v) => !v)}
        onSwitchLayout={setEditLayout}
        layouts={editLayouts}
      />
    </div>
  );
}

type EditorLayoutProps = {
  ed: EditorApi;
  characterId: string;
  sections: SheetSection[];
  advanced: boolean;
  onToggleAdvanced: () => void;
  onSwitchLayout: (layout: EditLayout) => void;
  /** The layouts available for THIS character (2-way for a PC, 3-way for a companion) — threaded
   *  through to EditorControls so its pill only ever offers a layout that actually applies. */
  layouts: EditLayout[];
};

/** The modern editor layout — the existing section rail + sub-tabs + single panel, extracted
 *  mechanically from CharacterEditor. All tab-navigation state is modern-only, so it lives here. */
function ModernEditorLayout({ ed, characterId, sections, advanced, onToggleAdvanced, onSwitchLayout, layouts }: EditorLayoutProps) {
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

  // Section rail collapse (md+): "auto" icons-only + hover/focus overlay-expand; "open" pinned wide
  // (reflows the grid); "closed" pinned icons-only (no hover-expand).
  const sectionsModeKey = "pf-sidebar-mode:editor-sections";
  const [sectionsMode, setSectionsMode] = useState<"auto" | "open" | "closed">("auto");
  /* eslint-disable react-hooks/set-state-in-effect -- one-time client restore; lazy init would cause an SSR hydration mismatch */
  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(sectionsModeKey) ?? localStorage.getItem("pf-sidebar-pinned:editor-sections");
      if (raw === "open" || raw === "closed" || raw === "auto") setSectionsMode(raw);
      else if (raw === "1") setSectionsMode("open"); // migrate the old boolean-pin value
    } catch {
      // ignore unreadable/absent storage
    }
  }, [sectionsModeKey]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const chooseSectionsMode = (target: "auto" | "open" | "closed") =>
    setSectionsMode((m) => {
      const next = m === target ? "auto" : target;
      try {
        localStorage.setItem(sectionsModeKey, next);
      } catch {
        // ignore
      }
      return next;
    });
  // Hover tooltip for the force-collapsed ("closed") section rail — identifies each icon without expanding.
  const [sectionTip, setSectionTip] = useState<{ key: string; label: string; top: number; left: number } | null>(null);
  const showSectionTip = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, key: string, label: string) => {
    if (sectionsMode !== "closed") return;
    const r = e.currentTarget.getBoundingClientRect();
    const top = Math.min(Math.max(r.top + r.height / 2, 28), window.innerHeight - 28);
    setSectionTip({ key, label, top, left: r.right + 10 });
  };
  const hideSectionTip = () => setSectionTip(null);

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
        sectionsMode === "open" ? "md:grid-cols-[13rem_minmax(0,1fr)]" : "md:grid-cols-[3rem_minmax(0,1fr)]",
      )}
    >
      {/* Section rail — md+ only (the < md picker is a bottom sheet). Collapsed to icons-only;
          hover/keyboard-focus overlay-expands; pin to lock open. Keeps the tablist + roving-tabindex
          a11y intact. */}
      <div className="hidden md:block">
        <div
          className={cn(
            "group/sections sticky top-20 z-30 flex flex-col self-start overflow-hidden rounded-lg border border-border bg-surface transition-[width] duration-200 @container/sections",
            sectionsMode === "open"
              ? "w-52"
              : sectionsMode === "closed"
                ? "w-12"
                : "w-12 hover:w-52 focus-within:w-52 hover:shadow-2xl focus-within:shadow-2xl",
          )}
        >
          {/* `<<` keep-collapsed toggle — appears only while the rail is expanded (no empty bar when collapsed). */}
          <div className="hidden shrink-0 items-center justify-end border-b border-border px-1 py-1 @min-[8rem]/sections:flex">
            <button
              type="button"
              onClick={() => chooseSectionsMode("closed")}
              aria-pressed={sectionsMode === "closed"}
              aria-label="Keep section rail collapsed"
              title="Keep collapsed"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
            >
              <ChevronsLeft className="size-4" />
            </button>
          </div>
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
                  aria-label={s.label}
                  aria-selected={active}
                  aria-controls="editor-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => {
                    setActiveSection(s.key);
                    setActiveSub(s.items[0]!.key);
                  }}
                  onKeyDown={(e) => onSectionKeyDown(e, idx)}
                  aria-describedby={sectionTip?.key === s.key ? "pf-section-tooltip" : undefined}
                  onMouseEnter={(e) => showSectionTip(e, s.key, s.label)}
                  onMouseLeave={hideSectionTip}
                  onFocus={(e) => showSectionTip(e, s.key, s.label)}
                  onBlur={hideSectionTip}
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors @min-[8rem]/sections:justify-start",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold",
                    active ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="hidden whitespace-nowrap @min-[8rem]/sections:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => chooseSectionsMode("open")}
            aria-pressed={sectionsMode === "open"}
            aria-label={sectionsMode === "open" ? "Unpin section rail" : "Pin section rail open"}
            title={sectionsMode === "open" ? "Unpin" : "Pin open"}
            className="m-1 flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border-t border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold @min-[8rem]/sections:justify-start"
          >
            {sectionsMode === "open" ? (
              <PanelLeftClose className="size-4 shrink-0" />
            ) : (
              <PanelLeftOpen className="size-4 shrink-0" />
            )}
            <span className="hidden @min-[8rem]/sections:inline">{sectionsMode === "open" ? "Unpin" : "Pin open"}</span>
          </button>
        </div>
        {sectionTip &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              id="pf-section-tooltip"
              role="tooltip"
              style={{ position: "fixed", top: sectionTip.top, left: sectionTip.left, transform: "translateY(-50%)" }}
              className="pointer-events-none z-[100] whitespace-nowrap rounded-md border border-border bg-surface-raised px-3 py-2 text-xs font-semibold text-foreground shadow-2xl"
            >
              {sectionTip.label}
            </div>,
            document.body,
          )}
      </div>

      <div className="min-w-0">
        {/* Live values — sticky top bar (all breakpoints), expands inline to the full preview. On mobile its
            left holds the section hamburger (bottom sheet); the desktop left rail handles sections at md+. */}
        <LivePreviewBar
          ed={ed}
          characterId={characterId}
          advanced={advanced}
          sections={sections}
          activeSection={activeSection}
          activeSub={activeSub}
          onSelectSection={(sKey, subKey) => {
            setActiveSection(sKey);
            setActiveSub(subKey);
          }}
        />

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
          <EditorControls
            ed={ed}
            advanced={advanced}
            onToggleAdvanced={onToggleAdvanced}
            layout="modern"
            onSwitchLayout={onSwitchLayout}
            layouts={layouts}
          />
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

        {/* Stage 1 (S6 Pillar 2): the panel swap is now a Motion fade+rise entrance keyed on the
            active section/sub — same markup/a11y/conflict-lock as before, moved into EditorCanvas. */}
        <EditorCanvas ed={ed} panelKey={`${section.key}-${sub.key}`} panelLabelId={panelLabelId}>
          {sub.render()}
        </EditorCanvas>
      </div>
    </div>
  );
}

/** Right-aligned toolbar cluster shared by every layout — the layout pill, Simple/Advanced, Undo and
 *  the save-status badge. One definition so the layouts can't drift. The pill only ever offers the
 *  layouts the caller says are available for this character (`layouts` — 2-way for a PC, 3-way for a
 *  companion). It locks while a sync conflict is open (switching would remount the resolver and drop
 *  its in-progress choices). */
function EditorControls({
  ed,
  advanced,
  onToggleAdvanced,
  layout,
  onSwitchLayout,
  layouts,
}: {
  ed: EditorApi;
  advanced: boolean;
  onToggleAdvanced: () => void;
  layout: EditLayout;
  onSwitchLayout: (layout: EditLayout) => void;
  layouts: EditLayout[];
}) {
  const conflictOpen = ed.status === "conflict";
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div
        role="group"
        aria-label="Editor layout"
        className="inline-flex rounded-full border border-border bg-surface-sunken p-0.5"
      >
        {layouts.map((val) => (
          <button
            key={val}
            type="button"
            onClick={() => onSwitchLayout(val)}
            aria-pressed={layout === val}
            disabled={conflictOpen}
            title={conflictOpen ? "Resolve the sync conflict before switching layouts" : `Switch to the ${val} editor layout`}
            className={cn(
              "min-h-11 rounded-full px-3 text-xs font-semibold capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-7",
              layout === val ? "bg-gold text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {val}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onToggleAdvanced}
        aria-pressed={advanced}
        title="Toggle Simple / Advanced mode"
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors sm:min-h-0",
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
  );
}

/** Classic all-in-one layout — the editing twin of the classic READ sheet (`<ClassicSheet>`): every
 *  sub-editor on one scrolling "paper sheet" inside a single continuous frame, in the classic order,
 *  each zone a collapsible gold-icon header. A sticky chip jump-bar (desktop, scroll-spied) and the
 *  mobile section navigator scroll-and-expand instead of switching tabs. Renders the SAME `ed`-driven
 *  sub-editors from the SAME sections[] gating — there is no second editor state.
 *
 *  Classic order (mirrors ClassicSheet): Identity → Core Stats (2-col grid) → Defenses (2-col grid) →
 *  Attacks → Skills → Spellcasting → Optional Systems → Feats & Features → Buffs → Inventory & Wealth →
 *  Story → Companion → Settings (collapsed). */
function ClassicEditorLayout({ ed, characterId, sections, advanced, onToggleAdvanced, onSwitchLayout, layouts }: EditorLayoutProps) {
  const byKey = new Map(sections.map((s) => [s.key, s] as const));
  const coreItems = byKey.get("core")?.items ?? [];
  const identityItem = coreItems.find((i) => i.key === "details");
  const companionItem = coreItems.find((i) => i.key === "companion");
  const coreGrid = coreItems.filter((i) => i.key !== "details" && i.key !== "companion");
  const defensesSec = byKey.get("defenses");
  const optionalSec = byKey.get("optional");
  const settingsSec = byKey.get("settings");

  // Per-zone open/collapse; unset keys fall back to the zone's default.
  const [openZones, setOpenZones] = useState<Record<string, boolean>>({});
  // Jump target set by the chip bar / mobile navigator; the nonce lets repeat jumps re-fire the
  // scroll effect. Opening the containing zone happens in the same update — the effect scrolls
  // after the newly-revealed content has laid out.
  const [jump, setJump] = useState<{ anchor: string; n: number } | null>(null);

  // Live header accessories — a collapsed zone still tells you what's inside.
  const inv = ed.draft.inventory;
  const itemCount =
    inv.armorAndShields.length + inv.weapons.length + inv.potionsScrollsMagicItems.length + inv.gear.length + inv.otherItems.length;
  const featCount = ed.draft.feats.list.length + ed.draft.features.list.length;
  const attackCount = ed.draft.combat.attacks.length;
  const casterCount = ed.draft.spellcasting.casters.length;
  const buffCount = ed.draft.buffs.active.length;

  type ClassicZoneDef = {
    key: string;
    label: string;
    icon: typeof User;
    /** The sections[] key this zone came from — highlights the right row in the mobile navigator. */
    navSection: string;
    accessory?: string | undefined;
    defaultOpen: boolean;
    body: ReactNode;
  };

  const subAnchor = (section: string, item: string) => `classic-item-${section}-${item}`;
  // md offset = header 80 + stat row ~44 + chip rail ~38 + a classic (non-overlay) horizontal
  // scrollbar's ~17px — jumps must land clear of the sticky chrome even on Windows.
  const anchorCls = "scroll-mt-28 md:scroll-mt-48";

  const zones: ClassicZoneDef[] = [];
  if (identityItem) {
    zones.push({
      key: "identity",
      label: "Identity",
      icon: User,
      navSection: "core",
      defaultOpen: true,
      body: identityItem.render(),
    });
  }
  if (coreGrid.length > 0) {
    zones.push({
      key: "core",
      label: "Core Stats",
      icon: Heart,
      navSection: "core",
      defaultOpen: true,
      body: (
        // 2-col only at xl: the reused sub-editors size their internal grids by VIEWPORT breakpoints
        // (tuned for the modern near-full-width panel), so a half-width cell at lg would render e.g.
        // Health's five lg:grid-cols-5 number fields ~70px wide. Abilities + Health stay full-width
        // rows even at xl for the same reason; Languages + Speed pair up fine.
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {coreGrid.map((i) => (
            <ClassicCell
              key={i.key}
              id={subAnchor("core", i.key)}
              title={i.label}
              className={i.key === "abilities" || i.key === "health" ? "xl:col-span-2" : undefined}
            >
              {i.render()}
            </ClassicCell>
          ))}
        </div>
      ),
    });
  }
  if (defensesSec && defensesSec.items.length > 0) {
    zones.push({
      key: "defenses",
      label: "Defenses",
      icon: defensesSec.icon,
      navSection: "defenses",
      accessory: `AC ${ed.computed.summary.ac}`,
      defaultOpen: true,
      body: (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {defensesSec.items.map((i) => (
            <ClassicCell key={i.key} id={subAnchor("defenses", i.key)} title={i.label}>
              {i.render()}
            </ClassicCell>
          ))}
        </div>
      ),
    });
  }
  const single = (sectionKey: string, label: string, accessory?: string) => {
    const sec = byKey.get(sectionKey);
    if (!sec || sec.items.length === 0) return;
    zones.push({
      key: sectionKey,
      label,
      icon: sec.icon,
      navSection: sectionKey,
      accessory,
      defaultOpen: true,
      body: sec.items[0]!.render(),
    });
  };
  single("attacks", "Attacks", attackCount > 0 ? String(attackCount) : undefined);
  single("skills", "Skills");
  single("spells", "Spellcasting", casterCount > 0 ? `${casterCount} caster${casterCount === 1 ? "" : "s"}` : undefined);
  if (optionalSec && optionalSec.items.length > 0) {
    zones.push({
      key: "optional",
      label: "Optional Systems",
      icon: optionalSec.icon,
      navSection: "optional",
      accessory: String(optionalSec.items.length),
      defaultOpen: true,
      body: (
        <div className="space-y-3">
          {optionalSec.items.map((i) => {
            const anchor = subAnchor("optional", i.key);
            return (
              <div key={i.key} id={anchor} tabIndex={-1} className={anchorCls}>
                <CollapsibleGroup
                  title={i.label}
                  defaultOpen={optionalSec.items.length <= 2}
                  forceOpen={jump?.anchor === anchor}
                  titleClassName="text-sm normal-case tracking-normal text-foreground"
                >
                  <div className="p-1 sm:p-2">{i.render()}</div>
                </CollapsibleGroup>
              </div>
            );
          })}
        </div>
      ),
    });
  }
  single("abilities", "Feats & Features", featCount > 0 ? String(featCount) : undefined);
  single("buffs", "Buffs", buffCount > 0 ? String(buffCount) : undefined);
  single("equipment", "Inventory & Wealth", itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : undefined);
  single("story", "Story");
  if (companionItem) {
    zones.push({
      key: "companion",
      // "Companion Link", not "Companion" — the 3-way layout pill on a companion character already
      // has a button accessibly named "Companion"; two same-named buttons confuse SR element lists.
      label: "Companion Link",
      icon: Handshake,
      navSection: "core",
      defaultOpen: true,
      body: companionItem.render(),
    });
  }
  if (settingsSec && settingsSec.items.length > 0) {
    zones.push({
      key: "settings",
      label: "Settings",
      icon: settingsSec.icon,
      navSection: "settings",
      defaultOpen: false,
      body: (
        <div className="space-y-6">
          {settingsSec.items.map((i) => (
            <div key={i.key} id={subAnchor("settings", i.key)} tabIndex={-1} className={anchorCls}>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{i.label}</p>
              {i.render()}
            </div>
          ))}
        </div>
      ),
    });
  }

  // Map every (section, sub) the mobile navigator can select onto a classic zone + anchor.
  const jumpTargets = new Map<string, { zone: string; anchor: string }>();
  if (identityItem) jumpTargets.set("core/details", { zone: "identity", anchor: "classic-zone-identity" });
  for (const i of coreGrid) jumpTargets.set(`core/${i.key}`, { zone: "core", anchor: subAnchor("core", i.key) });
  if (companionItem) jumpTargets.set("core/companion", { zone: "companion", anchor: "classic-zone-companion" });
  for (const i of defensesSec?.items ?? []) jumpTargets.set(`defenses/${i.key}`, { zone: "defenses", anchor: subAnchor("defenses", i.key) });
  for (const key of ["attacks", "skills", "spells", "abilities", "buffs", "equipment", "story"]) {
    for (const i of byKey.get(key)?.items ?? []) jumpTargets.set(`${key}/${i.key}`, { zone: key, anchor: `classic-zone-${key}` });
  }
  for (const i of optionalSec?.items ?? []) jumpTargets.set(`optional/${i.key}`, { zone: "optional", anchor: subAnchor("optional", i.key) });
  for (const i of settingsSec?.items ?? []) jumpTargets.set(`settings/${i.key}`, { zone: "settings", anchor: subAnchor("settings", i.key) });

  const jumpTo = (zoneKey: string, anchor?: string) => {
    setOpenZones((p) => ({ ...p, [zoneKey]: true }));
    setJump((j) => ({ anchor: anchor ?? `classic-zone-${zoneKey}`, n: (j?.n ?? 0) + 1 }));
  };
  const onSelectSection = (sectionKey: string, subKey: string) => {
    const target =
      jumpTargets.get(`${sectionKey}/${subKey}`) ??
      [...jumpTargets.entries()].find(([k]) => k.startsWith(`${sectionKey}/`))?.[1];
    if (target) jumpTo(target.zone, target.anchor);
  };

  useEffect(() => {
    if (!jump) return;
    // Runs after the commit that opened the target zone (same setState batch), so the anchor is in
    // the DOM — scroll synchronously. Instant (not smooth): Chrome aborts long smooth scrollIntoView
    // animations when layout is invalidated mid-flight (the scroll-spy re-renders during the scroll),
    // leaving the jump stranded partway — verified in-browser. Instant also matches reduced motion.
    const el = document.getElementById(jump.anchor);
    if (el) {
      el.scrollIntoView?.({ behavior: "auto", block: "start" });
      // Move focus to the destination so keyboard/SR users actually arrive (the modern layout's
      // nav lands next to the tabpanel; scroll-only would leave them tabbing through hundreds of
      // fields). Zone anchors focus their header button; sub-anchors are tabIndex={-1} containers.
      const target = jump.anchor.startsWith("classic-zone-")
        ? el.querySelector<HTMLElement>(":scope > h2 button")
        : el;
      (target ?? el).focus?.({ preventScroll: true });
    }
    // Clear the consumed jump: keeps a CollapsibleGroup's forceOpen edge-triggered (a repeat jump
    // to the same anchor must be a fresh false→true transition to re-expand after a manual
    // collapse) and stops a stale anchor ghost-opening groups when a collapsed zone remounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot signal consumption: must clear AFTER the commit that opened the target (clearing in the click handler would need flushSync, which would scroll while the mobile navigator dialog still holds the body scroll-lock). Bounded: one extra render per jump, and the effect early-returns on null.
    setJump(null);
  }, [jump]);

  // Scroll-spy for the chip bar: the first zone (in sheet order) crossing the band just under the
  // sticky chrome is "current". Collapsed zones still spy correctly — their header row intersects.
  const [spyKey, setSpyKey] = useState("identity");
  const zoneKeys = zones.map((z) => z.key).join(",");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const keys = zoneKeys.split(",").filter(Boolean);
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = (e.target as HTMLElement).dataset.zoneKey;
          if (!key) continue;
          if (e.isIntersecting) visible.add(key);
          else visible.delete(key);
        }
        const current = keys.find((k) => visible.has(k));
        if (current) setSpyKey(current);
      },
      // Current = the first zone (in sheet order) crossing the line just under the sticky chrome.
      // The 194px top inset sits 2px BELOW the md landing offset (scroll-mt-48 = 192px) so after a
      // jump the target zone — not the sliver of the zone above it — is the one intersecting. No
      // bottom inset: taking the FIRST intersecting zone already ignores everything further down
      // (a fixed-percentage bottom band would invert on short landscape viewports).
      { rootMargin: "-194px 0px 0px 0px" },
    );
    for (const k of keys) {
      const el = document.getElementById(`classic-zone-${k}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [zoneKeys]);

  const spyZone = zones.find((z) => z.key === spyKey);
  return (
    <div>
      <LivePreviewBar
        ed={ed}
        characterId={characterId}
        advanced={advanced}
        sections={sections}
        activeSection={spyZone?.navSection ?? "core"}
        activeSub=""
        onSelectSection={onSelectSection}
        jumpNavigation
        secondRow={
          <ClassicJumpBar
            zones={zones.map((z) => ({ key: z.key, label: z.label, icon: z.icon }))}
            activeKey={spyKey}
            onJump={(k) => jumpTo(k)}
          />
        }
      />

      <div className="mb-4">
        <EditorControls
          ed={ed}
          advanced={advanced}
          onToggleAdvanced={onToggleAdvanced}
          layout="classic"
          onSwitchLayout={onSwitchLayout}
          layouts={layouts}
        />
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

      {/* During a conflict only EDITING locks (each zone body carries its own disabled fieldset);
          the zone headers stay live so navigation keeps parity with modern, whose rail/tabs/sheet
          all work while the panel fieldset is disabled. */}
      <div className="pf-stagger overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
        {zones.map((z, zi) => (
          <ClassicZone
            key={z.key}
            zoneKey={z.key}
            icon={z.icon}
            title={z.label}
            accessory={z.accessory}
            staggerIndex={zi}
            locked={ed.status === "conflict"}
            open={openZones[z.key] ?? z.defaultOpen}
            onToggle={() => setOpenZones((p) => ({ ...p, [z.key]: !(p[z.key] ?? z.defaultOpen) }))}
          >
            {z.body}
          </ClassicZone>
        ))}
      </div>
    </div>
  );
}

/** Companion Simple layout (docs/S6_UX_OVERHAUL/01_COMPANION_SHEETS.md §2.2) — a single continuous
 *  scroll for a linked companion (familiar / animal companion / eidolon / cohort / mount). The ~6
 *  things anyone tunes on a companion (the master link, base body, HP/AC/saves, attacks, identity)
 *  are up front and already open; everything else (skills, feats, spellcasting, inventory, buffs,
 *  story, optional systems, settings) sits collapsed below a "More" divider, reachable without
 *  leaving Simple — or via the "Advanced" escape hatch to the full Modern layout, in place, no
 *  navigation. Reuses `ClassicZone`/`ClassicCell` and every existing sub-editor from the SAME
 *  sections[] gating the other two layouts use — this is a different ARRANGEMENT of the same
 *  editors, not new state, new save logic, or a second `useCharacterEditor` call. */
function CompanionSimpleLayout({ ed, characterId, sections, advanced, onToggleAdvanced, onSwitchLayout, layouts }: EditorLayoutProps) {
  const byKey = new Map(sections.map((s) => [s.key, s] as const));
  const coreItems = byKey.get("core")?.items ?? [];
  const companionItem = coreItems.find((i) => i.key === "companion");
  const abilitiesItem = coreItems.find((i) => i.key === "abilities");
  const healthItem = coreItems.find((i) => i.key === "health");
  const detailsItem = coreItems.find((i) => i.key === "details");
  const remainingCoreItems = coreItems.filter(
    (i) => i.key !== "companion" && i.key !== "abilities" && i.key !== "health" && i.key !== "details",
  );
  const defensesSec = byKey.get("defenses");
  const attacksSec = byKey.get("attacks");
  const attacksItem = attacksSec?.items[0];
  const optionalSec = byKey.get("optional");
  const settingsSec = byKey.get("settings");

  const attackCount = ed.draft.combat.attacks.length;
  const featCount = ed.draft.feats.list.length + ed.draft.features.list.length;
  const casterCount = ed.draft.spellcasting.casters.length;
  const buffCount = ed.draft.buffs.active.length;
  const inv = ed.draft.inventory;
  const itemCount =
    inv.armorAndShields.length + inv.weapons.length + inv.potionsScrollsMagicItems.length + inv.gear.length + inv.otherItems.length;

  // Per-zone open/collapse, shared across BOTH zone stacks below (keys are unique across the two).
  const [openZones, setOpenZones] = useState<Record<string, boolean>>({});

  type SimpleZoneDef = {
    key: string;
    label: string;
    icon: typeof User;
    accessory?: string | undefined;
    defaultOpen: boolean;
    body: ReactNode;
  };

  // "Above the fold": the handful of things anyone actually tunes on a companion, all open by
  // default (Identity & Details is the exception — companions rarely touch race/class/portrait).
  const primaryZones: SimpleZoneDef[] = [];
  if (companionItem) {
    // "Companion Link", not "Companion": the layout pill button right above is already accessibly
    // named "Companion" — two same-named buttons with different actions confuse SR element lists
    // and voice control.
    primaryZones.push({ key: "companion", label: "Companion Link", icon: Handshake, defaultOpen: true, body: companionItem.render() });
  }
  if (abilitiesItem) {
    primaryZones.push({ key: "base_body", label: "Base Body", icon: Sparkles, defaultOpen: true, body: abilitiesItem.render() });
  }
  if (healthItem) {
    primaryZones.push({
      key: "health",
      label: "Health",
      icon: Heart,
      accessory: `HP ${ed.computed.summary.hp.current}/${ed.computed.summary.hp.max}`,
      defaultOpen: true,
      body: healthItem.render(),
    });
  }
  if (defensesSec && defensesSec.items.length > 0) {
    primaryZones.push({
      key: "defenses",
      label: "Defenses",
      icon: defensesSec.icon,
      accessory: `AC ${ed.computed.summary.ac}`,
      defaultOpen: true,
      body: (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {defensesSec.items.map((i) => (
            <ClassicCell key={i.key} id={`companion-defenses-${i.key}`} title={i.label}>
              {i.render()}
            </ClassicCell>
          ))}
        </div>
      ),
    });
  }
  if (attacksItem) {
    primaryZones.push({
      key: "attacks",
      label: "Attacks",
      icon: attacksSec?.icon ?? Swords,
      accessory: attackCount > 0 ? String(attackCount) : undefined,
      defaultOpen: true,
      body: attacksItem.render(),
    });
  }
  if (detailsItem) {
    primaryZones.push({
      key: "details",
      label: "Identity & Details",
      icon: User,
      defaultOpen: false,
      body: detailsItem.render(),
    });
  }

  // "More": everything Simple mode doesn't foreground — still one tap away, all collapsed.
  const secondaryZones: SimpleZoneDef[] = [];
  if (remainingCoreItems.length > 0) {
    secondaryZones.push({
      key: "movement_languages",
      label: "Movement & Languages",
      icon: Footprints,
      defaultOpen: false,
      body: (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {remainingCoreItems.map((i) => (
            <ClassicCell key={i.key} id={`companion-core-${i.key}`} title={i.label}>
              {i.render()}
            </ClassicCell>
          ))}
        </div>
      ),
    });
  }
  const singleSecondary = (sectionKey: string, label: string, accessory?: string) => {
    const sec = byKey.get(sectionKey);
    if (!sec || sec.items.length === 0) return;
    secondaryZones.push({ key: sectionKey, label, icon: sec.icon, accessory, defaultOpen: false, body: sec.items[0]!.render() });
  };
  singleSecondary("skills", "Skills");
  singleSecondary("abilities", "Feats & Features", featCount > 0 ? String(featCount) : undefined);
  singleSecondary("spells", "Spellcasting", casterCount > 0 ? `${casterCount} caster${casterCount === 1 ? "" : "s"}` : undefined);
  singleSecondary("equipment", "Inventory & Wealth", itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : undefined);
  singleSecondary("buffs", "Buffs", buffCount > 0 ? String(buffCount) : undefined);
  singleSecondary("story", "Story");
  if (optionalSec) {
    for (const item of optionalSec.items) {
      secondaryZones.push({
        key: `optional-${item.key}`,
        label: item.label,
        icon: optionalSec.icon,
        defaultOpen: false,
        body: item.render(),
      });
    }
  }
  if (settingsSec && settingsSec.items.length > 0) {
    secondaryZones.push({
      key: "settings",
      label: "Settings",
      icon: settingsSec.icon,
      defaultOpen: false,
      body: (
        // Stacked full-width like ClassicEditorLayout's settings zone — OptionalRulesEditor has its
        // own internal multi-column grid, and nesting it in a half-width xl cell cramps the module
        // cards into ~250px columns.
        <div className="space-y-6">
          {settingsSec.items.map((i) => (
            <div key={i.key}>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{i.label}</p>
              {i.render()}
            </div>
          ))}
        </div>
      ),
    });
  }

  const locked = ed.status === "conflict";
  const renderZone = (z: SimpleZoneDef, zi: number) => (
    <ClassicZone
      key={z.key}
      zoneKey={z.key}
      icon={z.icon}
      title={z.label}
      accessory={z.accessory}
      staggerIndex={zi}
      locked={locked}
      open={openZones[z.key] ?? z.defaultOpen}
      onToggle={() => setOpenZones((p) => ({ ...p, [z.key]: !(p[z.key] ?? z.defaultOpen) }))}
      animated
    >
      {z.body}
    </ClassicZone>
  );

  return (
    <div>
      <LivePreviewBar
        ed={ed}
        characterId={characterId}
        advanced={advanced}
        sections={sections}
        activeSection="core"
        activeSub=""
        onSelectSection={() => {}}
        hideSectionNav
      />

      <div className="mb-4">
        <EditorControls
          ed={ed}
          advanced={advanced}
          onToggleAdvanced={onToggleAdvanced}
          layout="companion"
          onSwitchLayout={onSwitchLayout}
          layouts={layouts}
        />
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

      {/* Same conflict lock as the layout pill: switching layouts remounts ConflictResolver and
          would silently drop its in-progress per-field choices. Button content is spans only —
          <button> permits phrasing content, not <div>/<p>. */}
      <button
        type="button"
        onClick={() => onSwitchLayout("modern")}
        disabled={locked}
        title={locked ? "Resolve the sync conflict before switching layouts" : undefined}
        className="mb-4 flex min-h-11 w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-rune disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        <span className="block">
          <span className="block text-sm font-semibold text-rune">Open the Advanced editor</span>
          <span className="block text-xs text-muted-foreground">Every section — spells, buffs, inventory, optional systems.</span>
        </span>
      </button>

      <div className="pf-stagger overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
        {primaryZones.map((z, zi) => renderZone(z, zi))}
      </div>

      {secondaryZones.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            More — everything else this sheet can do
          </p>
          <div className="pf-stagger overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            {secondaryZones.map((z, zi) => renderZone(z, primaryZones.length + zi))}
          </div>
        </>
      )}

      <div className="mt-6 flex flex-col items-center gap-1.5 text-center">
        <p className="text-xs text-muted-foreground">
          Need more? Feats, spells, buffs, and every optional system live in the full editor.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSwitchLayout("modern")}
          disabled={locked}
          title={locked ? "Resolve the sync conflict before switching layouts" : undefined}
        >
          Open the Advanced editor
        </Button>
      </div>
    </div>
  );
}

/** One collapsible section of the classic sheet — the editing twin of the read view's Zone header:
 *  gold icon + display-font title + a live summary accessory, the whole header a 44px toggle. */
function ClassicZone({
  zoneKey,
  icon: Icon,
  title,
  accessory,
  staggerIndex,
  locked,
  open,
  onToggle,
  animated,
  children,
}: {
  zoneKey: string;
  icon: typeof User;
  title: string;
  accessory?: string | undefined;
  /** Explicit pf-stagger index — the utility only auto-indexes the first 12 children, and a sheet
   *  with optional systems + a companion has 13 zones (the 13th would animate first, out of order). */
  staggerIndex: number;
  /** True while a sync conflict is open — locks the body's fields, NOT the header toggle. */
  locked: boolean;
  open: boolean;
  onToggle: () => void;
  /** Opt-in Motion expand/collapse (docs/S6_UX_OVERHAUL/ANIMATION_SYSTEM.md §3.1). Default false =
   *  byte-identical plain conditional render, unchanged from before Motion landed. Only
   *  CompanionSimpleLayout passes this — ClassicEditorLayout's zones stay untouched (per
   *  docs/S6_UX_OVERHAUL/02_MODERN_EDITOR.md). */
  animated?: boolean;
  children: ReactNode;
}) {
  const panelId = useId();
  const shouldAnimate = useShouldAnimate();
  const fieldsetClassName = cn("m-0 min-w-0 border-0 px-4 pb-6 pt-1 sm:px-5", locked && "opacity-60");
  return (
    <section
      id={`classic-zone-${zoneKey}`}
      data-zone-key={zoneKey}
      style={{ "--pf-i": staggerIndex } as CSSProperties}
      className="scroll-mt-28 border-t border-border first:border-t-0 md:scroll-mt-48"
    >
      <h2 className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-11 w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-surface-raised/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold sm:px-5"
        >
          <Icon className="size-4 shrink-0 text-gold" />
          <span className="min-w-0 truncate font-display text-lg text-foreground">{title}</span>
          {accessory && <span className="tnum ml-auto shrink-0 text-xs text-muted-foreground">{accessory}</span>}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
              !accessory && "ml-auto",
            )}
          />
        </button>
      </h2>
      {animated && shouldAnimate ? (
        // ENTER-only animation, deliberately: no `exit` prop, so AnimatePresence unmounts a closing
        // body synchronously — identical to the plain branch. An exit animation would keep the
        // fieldset mounted AND interactive for ~240ms with props FROZEN from its last open render
        // (AnimatePresence renders exiting children from a cached element, so `disabled={!open}`
        // can never reach it) — a Tab right after collapsing would land inside the shrinking zone
        // and could still mutate its fields. A safe exit needs owned focus management (Pillar 2).
        // AnimatePresence stays for `initial={false}` (zones open on first mount must not replay
        // the entrance).
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0, overflow: "hidden" }}
              animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
              transition={{ duration: pfDur, ease: pfEase }}
            >
              <fieldset id={panelId} disabled={locked} className={fieldsetClassName}>
                {children}
              </fieldset>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        open && (
          <fieldset id={panelId} disabled={locked} className={fieldsetClassName}>
            {children}
          </fieldset>
        )
      )}
    </section>
  );
}

/** A captioned cell inside a classic grid zone (Core Stats / Defenses). tabIndex −1 so a jump can
 *  move focus to it. */
function ClassicCell({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      id={id}
      tabIndex={-1}
      className={cn("min-w-0 scroll-mt-28 rounded-lg border border-border/60 p-3 sm:p-4 md:scroll-mt-48", className)}
    >
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Desktop jump nav for the classic layout: a horizontally scrollable chip rail rendered as the
 *  second row of the sticky Live Values bar; the scroll-spied current zone glows gold. On mobile the
 *  hamburger's full-screen navigator handles jumping, so this rail is md+ only. */
function ClassicJumpBar({
  zones,
  activeKey,
  onJump,
}: {
  zones: Array<{ key: string; label: string; icon: typeof User }>;
  activeKey: string;
  onJump: (zoneKey: string) => void;
}) {
  return (
    <nav
      aria-label="Jump to sheet section"
      // The rail overflows at common desktop widths; a classic (non-overlay) Windows scrollbar
      // would otherwise render 17px chunky chrome inside the sticky bar — keep it thin.
      className="hidden items-center gap-1 overflow-x-auto border-t border-border px-2 py-1.5 md:flex [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
    >
      {zones.map((z) => {
        const Icon = z.icon;
        const active = z.key === activeKey;
        return (
          <button
            key={z.key}
            type="button"
            onClick={() => onJump(z.key)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
              active ? "border-gold/40 bg-gold/10 text-gold" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            {z.label}
          </button>
        );
      })}
    </nav>
  );
}

/** Mobile (< md) section picker: a button showing the active section that opens a FULL-SCREEN
 *  navigator (replaces the old bottom-2/3 sheet). Every section is listed with its sub-panels,
 *  so any editor is one tap away; the active section + sub are highlighted. Radix Dialog gives
 *  the focus trap / Esc / scroll lock; safe-area insets are respected on notched phones. */
function SectionSheet({
  sections,
  activeKey,
  activeSubKey,
  onSelect,
  keepFocusAfterSelect = false,
}: {
  sections: SheetSection[];
  activeKey: string;
  activeSubKey: string;
  onSelect: (sectionKey: string, subKey: string) => void;
  /** Classic jump mode: suppress Radix's focus-return to the trigger after a selection so the jump
   *  effect's destination focus isn't clobbered (Esc/backdrop close still restores normally). */
  keepFocusAfterSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef(false);
  const active = sections.find((s) => s.key === activeKey) ?? sections[0]!;
  const go = (sectionKey: string, subKey: string) => {
    selectedRef.current = true;
    onSelect(sectionKey, subKey);
    setOpen(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={`Sheet sections — currently ${active.label}`}
          className="tap-target flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-sm font-medium"
        >
          <Menu className="size-4 shrink-0 text-gold" />
          <span className="max-w-[5.5rem] truncate text-foreground">{active.label}</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 md:hidden" />
        {/* Sized EXPLICITLY (w-full + 100dvh with an h-screen fallback) rather than inset-0: on
            real phones an overflowing page can widen the initial containing block, dragging an
            inset-anchored overlay past the screen edge (owner-reported — the ✕ was unreachable);
            and inset-0's bottom can sit under the dynamic browser toolbar. overflow-hidden clips
            any stray child overflow; the nav owns all scrolling. */}
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (keepFocusAfterSelect && selectedRef.current) e.preventDefault();
            selectedRef.current = false;
          }}
          className="pf-sheet-in fixed left-0 top-0 z-50 flex h-screen w-full max-w-[100vw] flex-col overflow-hidden bg-background focus:outline-none md:hidden"
          style={{
            height: "100dvh",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border py-1 pl-4 pr-1">
            <Dialog.Title className="text-sm font-semibold text-foreground">Sheet sections</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close section picker"
                className="tap-target inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>
          {/* overscroll-contain stops scroll chaining to the page; the big bottom padding keeps the
              last rows tappable above phone browser toolbars / the home indicator. */}
          <nav
            aria-label="Sheet sections"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
            style={{ paddingBottom: "max(4rem, env(safe-area-inset-bottom))" }}
          >
            <div className="space-y-0.5">
              {sections.map((s) => {
                const Icon = s.icon;
                const isActive = s.key === activeKey;
                const multi = s.items.length > 1;
                return (
                  <div key={s.key}>
                    {/* Classic passes activeSubKey="" (its spy tracks zones, not subs) — mark the
                        section header itself current then, so multi-item sections aren't left with
                        no current row at all. */}
                    <button
                      type="button"
                      onClick={() => go(s.key, s.items[0]!.key)}
                      aria-current={isActive && (!multi || activeSubKey === "") ? "true" : undefined}
                      className={cn(
                        "tap-target flex w-full min-w-0 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium",
                        isActive && (!multi || activeSubKey === "")
                          ? "bg-surface-raised text-foreground"
                          : "text-foreground hover:bg-surface-raised/60",
                      )}
                    >
                      <Icon className={cn("size-5 shrink-0", isActive ? "text-gold" : "text-muted-foreground")} />
                      <span className="truncate">{s.label}</span>
                    </button>
                    {multi && (
                      <div className="mb-1 ml-[1.4rem] border-l border-border pl-1.5">
                        {s.items.map((i) => {
                          const isSub = isActive && i.key === activeSubKey;
                          return (
                            <button
                              key={i.key}
                              type="button"
                              onClick={() => go(s.key, i.key)}
                              aria-current={isSub ? "true" : undefined}
                              className={cn(
                                "tap-target flex w-full min-w-0 items-center rounded-lg px-3 text-left text-sm",
                                isSub
                                  ? "bg-surface-raised font-medium text-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <span className="truncate">{i.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Live values top bar (all breakpoints): a sticky collapsed stat row that expands inline to the full
 *  LivePreview — the "edit a field, watch the math" loop, now across the top so the editor gets full
 *  column width (replaces the old lg right-hand sidebar). */
function LivePreviewBar({
  ed,
  characterId,
  advanced,
  sections,
  activeSection,
  activeSub,
  onSelectSection,
  secondRow,
  jumpNavigation = false,
  hideSectionNav = false,
}: {
  ed: EditorApi;
  characterId: string;
  advanced: boolean;
  sections: SheetSection[];
  activeSection: string;
  activeSub: string;
  onSelectSection: (sectionKey: string, subKey: string) => void;
  /** Optional extra sticky row under the stat row (the classic layout's jump-chip rail). */
  secondRow?: ReactNode;
  /** Classic mode: section selection SCROLLS the page instead of swapping a panel. Collapses the
   *  expanded preview on navigate (a jump would land hidden under the up-to-70dvh panel) and keeps
   *  focus off the navigator trigger so the jump effect's destination focus survives. */
  jumpNavigation?: boolean;
  /** Companion Simple layout: there's no section rail to navigate to (it's one continuous scroll),
   *  so the mobile hamburger has nothing useful to open — hide it. The stat row + expandable Live
   *  Values preview are unaffected. */
  hideSectionNav?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = ed.computed.summary;
  const handleSelect = (sectionKey: string, subKey: string) => {
    if (jumpNavigation) setOpen(false);
    onSelectSection(sectionKey, subKey);
  };
  return (
    <div className="sticky top-14 z-20 mb-3 rounded-lg border border-border bg-surface/95 backdrop-blur md:top-20">
      <div className="flex items-stretch">
        {/* Mobile section hamburger → full-screen navigator; the desktop left rail handles sections at md+. */}
        {!hideSectionNav && (
          <div className="flex shrink-0 items-center border-r border-border pl-1 pr-0.5 md:hidden">
            <SectionSheet
              sections={sections}
              activeKey={activeSection}
              activeSubKey={activeSub}
              onSelect={handleSelect}
              keepFocusAfterSelect={jumpNavigation}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="editor-live-preview"
          className="tap-target flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs"
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
      </div>
      {secondRow != null && (
        // Any click in the jump rail is navigation intent — collapse the expanded preview first so
        // the jump can't land underneath it.
        <div onClickCapture={jumpNavigation ? () => setOpen(false) : undefined}>{secondRow}</div>
      )}
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
  { key: "inventory", label: "Inventory" },
  { key: "wealth", label: "Wealth" },
  { key: "backstory", label: "Background & profile" },
];

// Optional-rules systems are privacy-gated like every core section. Their row appears when the system
// is enabled (its card can only surface then) OR the owner has already set a non-default level for it
// (so a setting is never trapped/unreachable after toggling the module off) — otherwise vanilla sheets
// stay uncluttered. Spheres has three sibling toggles. Keys must match DEFAULT_SECTION_PRIVACY /
// SECTION_LABELS in view-model.ts.
const OPTIONAL_PRIVACY_SECTIONS: Array<{ key: string; label: string; moduleKeys: string[] }> = [
  { key: "spheres", label: "Spheres", moduleKeys: ["spheres_of_power", "spheres_of_might", "spheres_of_guile"] },
  { key: "heroPoints", label: "Hero Points", moduleKeys: ["hero_points"] },
  { key: "honor", label: "Honor", moduleKeys: ["honor"] },
  { key: "stamina", label: "Stamina pool", moduleKeys: ["stamina"] },
  { key: "mythic", label: "Mythic", moduleKeys: ["mythic"] },
  { key: "psionics", label: "Psionics", moduleKeys: ["psionics"] },
  { key: "pathOfWar", label: "Path of War", moduleKeys: ["path_of_war"] },
  { key: "akashic", label: "Akashic", moduleKeys: ["akashic"] },
  { key: "oaths", label: "Oaths", moduleKeys: ["oaths"] },
  { key: "milestoneLeveling", label: "Milestone Leveling", moduleKeys: ["milestone_leveling"] },
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

/** Companion-link panel (shown only on companion sheets): type, familiar archetype, the master
 * link toggle, and a read-only view of the cached master stats + granted abilities. */
function CompanionEditor({ ed }: { ed: EditorApi }) {
  const comp = ed.draft.companion;
  const summary = ed.computed.summary.companion;
  if (!comp) return null;
  const isFamiliar = comp.type === "familiar";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This character is a linked companion. A familiar with the master link on computes HP (half the
        master&apos;s), BAB (the master&apos;s), saves (better of the two), skill ranks (better of the two),
        Intelligence, and natural armor from its master — refreshed automatically when the master saves.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Companion type"
          value={comp.type ?? "other"}
          onChange={(v) =>
            ed.update((c) => {
              if (!c.companion) return;
              c.companion.type = v as typeof comp.type;
              // The link + archetype are familiar-only; leaving them set on another type would
              // show a "linked" badge with no rules behind it and no control to turn it off.
              if (v !== "familiar") {
                c.companion.syncEnabled = false;
                c.companion.archetype = undefined;
              }
            })
          }
          options={COMPANION_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
          className="w-44 capitalize"
        />
        {isFamiliar && (
          <SelectField
            label="Archetype"
            value={comp.archetype ?? ""}
            onChange={(v) =>
              ed.update((c) => {
                if (c.companion) c.companion.archetype = v || undefined;
              })
            }
            options={[
              { value: "", label: "Standard familiar" },
              ...FAMILIAR_ARCHETYPES.map((a) => ({ value: a.name, label: a.name })),
            ]}
            className="w-48"
          />
        )}
        {isFamiliar && (
          <label className="flex h-11 items-center gap-1.5 text-sm text-foreground sm:h-10">
            <input
              type="checkbox"
              checked={comp.syncEnabled === true}
              onChange={(e) =>
                ed.update((c) => {
                  if (c.companion) c.companion.syncEnabled = e.target.checked;
                })
              }
              className="size-4 accent-[var(--pf-gold)]"
            />
            Link stats to master
          </label>
        )}
      </div>

      {comp.master && (
        <div className="rounded-lg border border-border bg-surface-raised p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Master
            </span>
            <span className="text-sm font-medium text-foreground">{comp.master.name ?? "—"}</span>
            <StatChip label="level" value={comp.master.level} />
            <StatChip label="bab" value={formatModifier(comp.master.bab)} />
            <StatChip label="hp" value={comp.master.hpMax} />
            <StatChip
              label="saves"
              value={`${formatModifier(comp.master.saves.fortitude)}/${formatModifier(comp.master.saves.reflex)}/${formatModifier(comp.master.saves.will)}`}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Cached {comp.master.syncedAt ? new Date(comp.master.syncedAt).toLocaleString() : "—"} — refreshes
            when the master saves or this sheet loads.
          </p>
        </div>
      )}

      {summary && summary.grantedAbilities.length > 0 && (
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Granted abilities (master level {comp.master?.level ?? 0}
            {comp.archetype ? ` · ${comp.archetype}` : ""})
          </span>
          {summary.grantedAbilities.map((a, i) => (
            <div key={i} className="rounded-md border border-border px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{a.name}</span>
                <StatChip label="L" value={a.level} />
                {a.fromArchetype && <StatChip value="archetype" tone="gold" />}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{a.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Settings → "Privacy & sharing" panel: per-section §15 visibility levels. */
function PrivacySharingEditor({ ed }: { ed: EditorApi }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Privacy &amp; sharing</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Who can see each section on shared / public views — you always see everything. Most sections
          are <strong>Public</strong> by default; set any to Party, GM-only, or Private here. Optional-rules
          systems appear below once you enable them.
        </p>
        <div className="mt-3 space-y-1.5">
          {[
            ...PRIVACY_EDIT_SECTIONS,
            ...OPTIONAL_PRIVACY_SECTIONS.filter(
              (s) =>
                s.moduleKeys.some((k) => isModuleKeyEnabled(ed.draft, k)) ||
                ed.draft.privacy.sections[s.key] !== undefined,
            ),
            // Companion sheets get a row for the companion-link section (never trapped: also shown
            // when a non-default level is already set).
            ...(ed.draft.companion || ed.draft.privacy.sections.companion !== undefined
              ? [{ key: "companion", label: "Companion link" }]
              : []),
            { key: "formulaDetails", label: "Show math (formulas)" },
          ].map((s) => (
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

      <p className="text-xs text-muted-foreground">
        The overall share link &amp; visibility (private / unlisted / public) and theme live on the
        character overview.
      </p>
    </div>
  );
}

/** Settings → "Optional rules & 3pp" panel: the module/variant toggles. */
function OptionalRulesEditor({ ed }: { ed: EditorApi }) {
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
        // Enabling gestalt on a normal multi-class character leaves every class on the default track A,
        // which would SUM both class lines (level 40, saves/BAB summed). Split them so the toggle lands
        // on correct best-of-A/B numbers by default — the dominant 2-class build gets the exact split.
        if (isGestalt(c) && gestaltTracksCollapsed(c)) splitGestaltTracks(c);
        c.identity.totalLevel = isGestalt(c) ? gestaltLevel(c) : c.identity.classes.reduce((s, x) => s + x.level, 0);
        recomputeClassDerived(c, { hpMethod: "manual" });
      }
    });

  const enabledCount = OPTIONAL_RULE_MODULES.filter((m) => isRuleEnabled(ed.draft, m)).length;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Optional rules &amp; 3pp</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Switch on the optional rulesets and third-party systems this character uses. Enabling a module flags the
          sheet for it; its fields and calculations appear as each module ships.
          {enabledCount > 0 ? ` ${enabledCount} enabled.` : ""}
        </p>
      </div>

      {/* If gestalt was enabled on an already-collapsed sheet (e.g. imported/older data), warn here too —
          the Classes section isn't mounted while the user is on this panel. */}
      <GestaltCollapseBanner ed={ed} />

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

// Per-class progression editor option lists (PF1e). These edit the row's cached preset so every class —
// compendium, catalog, OR hand-built custom — exposes the same knobs and feeds the same BAB/save/HP recompute.
const BAB_OPTIONS = [
  { value: "full", label: "Full" },
  { value: "three_quarter", label: "¾" },
  { value: "half", label: "½" },
];
const SAVE_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "poor", label: "Poor" },
];
const CASTER_TYPE_OPTIONS = [
  { value: "", label: "Non-caster" },
  { value: "prepared", label: "Prepared" },
  { value: "spontaneous", label: "Spontaneous" },
  { value: "spellbook", label: "Spellbook" },
];
const CL_PROGRESSION_OPTIONS = [
  { value: "full", label: "Full = level" },
  { value: "minus_three", label: "−3 (pal/ran)" },
];
const STD_HIT_DICE = ["d6", "d8", "d10", "d12"];
const BAB_LABEL: Record<string, string> = { full: "full BAB", three_quarter: "¾ BAB", half: "½ BAB" };
const SAVE_LABEL: Record<"fortitude" | "reflex" | "will", string> = { fortitude: "Fort", reflex: "Ref", will: "Will" };

function dieToNum(d: string | undefined): 6 | 8 | 10 | 12 {
  const n = parseInt(String(d ?? "").replace(/[^0-9]/g, ""), 10);
  return n === 6 || n === 8 || n === 10 || n === 12 ? n : 8;
}

/**
 * Warns when a gestalt character's classes aren't split across the two tracks, so BAB/saves/level/HP
 * are being SUMMED across both class lines instead of taking the best of A/B (see gestaltTracksCollapsed).
 * Rendered on every section that can trigger or expose the collapse (Classes, Health, Optional rules).
 * The "Split into A / B" button assigns classes to distinct tracks and re-derives — including Max HP,
 * but ONLY when the stored maxHp is a collapse-inflated auto value (so a hand-entered HP is never lost).
 */
function GestaltCollapseBanner({ ed }: { ed: EditorApi }) {
  if (!gestaltTracksCollapsed(ed.draft)) return null;
  const { a, b } = gestaltTrackClassCounts(ed.draft);
  const where = a === 0 ? "all on track B" : b === 0 ? "all on track A" : "stacked on one track";
  const split = () =>
    ed.update((c) => {
      // Heal an auto-computed Max HP too: if the stored maxHp equals the collapsed (all-on-one-track)
      // HP pool, it was applied from "Compute HP from levels" while collapsed — re-derive it against the
      // now-split tracks. A hand-entered maxHp (matching neither average nor max) is left untouched.
      const before = c.health.maxHp;
      const autoMethod: "average" | "max" | null =
        before === computeMaxHpFromLevels(c, "average", c.identity.classes).total
          ? "average"
          : before === computeMaxHpFromLevels(c, "max", c.identity.classes).total
            ? "max"
            : null;
      splitGestaltTracks(c);
      c.identity.totalLevel = gestaltLevel(c);
      recomputeClassDerived(c, { hpMethod: autoMethod ?? "manual" });
    });
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/50 bg-warning/10 p-2.5">
      <p className="min-w-0 flex-1 text-xs text-foreground">
        <strong>Gestalt tracks aren&apos;t split.</strong> Your class progressions are {where}, so BAB, saves,
        character level, and HP are being <em>summed</em> across both class lines instead of taking the best of
        tracks A&nbsp;/&nbsp;B. Put a class on the other track (each class row&apos;s <strong>Gestalt track</strong>{" "}
        selector), or split them automatically.
      </p>
      <Button size="sm" variant="outline" onClick={split}>
        Split into A / B
      </Button>
    </div>
  );
}

/**
 * One class row. The COLLAPSED state is a "beautiful default display": a compact name + level, then a chip
 * strip summarising every aspect the engine uses (level, HD, BAB, the three saves tinted good/poor, caster,
 * favored, archetypes). The chevron opens the full editor where every one of those aspects is adjustable —
 * BAB/saves/caster/HD edit the row's cached preset (so a custom class computes exactly like a compendium one),
 * plus a favored-class checkbox + FCB split and a per-class archetype manager scoped to THIS class.
 */
function ClassRow({ ed, cl, i }: { ed: EditorApi; cl: ClassEntry; i: number }) {
  const [open, setOpen] = useState(false);
  const [showArch, setShowArch] = useState(false);
  const gestalt = isGestalt(ed.draft);
  const supabase = useMemo(() => createClient(), []);

  const set = (mut: (t: ClassEntry, c: PathForgeCharacterV1) => void) =>
    ed.update((c) => {
      const t = c.identity.classes[i];
      if (t) mut(t, c);
    });
  const syncLevel = (c: PathForgeCharacterV1) => {
    c.identity.totalLevel = isGestalt(c) ? gestaltLevel(c) : c.identity.classes.reduce((s, x) => s + x.level, 0);
  };
  // health.favoredClassHpBonus is the SUM of every favored class's hp-FCB tally (the HP-from-levels math reads it).
  const syncFcbHp = (c: PathForgeCharacterV1) => {
    c.health.favoredClassHpBonus = c.identity.classes.reduce((s, x) => s + (x.favoredClassBonus?.hp ?? 0), 0);
  };
  // progression.favoredClasses (the read-sheet list) is DERIVED from the rows' favoredClass flags + current
  // resolved names — never keyed by mutable name — so a rename/remove/duplicate can't strand a stale entry.
  const syncFavoredClasses = (c: PathForgeCharacterV1) => {
    c.progression.favoredClasses = [
      ...new Set(
        c.identity.classes
          .filter((x) => x.favoredClass)
          .map((x) => (resolveClassPreset(x)?.name ?? x.name).trim())
          .filter(Boolean),
      ),
    ];
  };

  // The row's resolved progression preset (compendium > catalog), or undefined for a not-yet-configured custom
  // class. Editing any progression field clones it into the row's OWN compendiumPreset (a deep copy so we never
  // mutate the shared catalog object) — which `resolveClassPreset` then prefers — and re-sums BAB/saves.
  const preset = resolveClassPreset(cl);
  const editPreset = (mut: (p: ClassPreset) => void) =>
    set((t, c) => {
      if (!t.compendiumPreset) {
        const r = resolveClassPreset(t);
        t.compendiumPreset = r
          ? {
              ...r,
              key: `custom:${t.id}`,
              saves: { ...r.saves },
              caster: r.caster ? { ...r.caster } : undefined,
              classSkillKeys: [...r.classSkillKeys],
            }
          : {
              key: `custom:${t.id}`,
              name: t.name || "Class",
              hitDie: dieToNum(t.hitDie),
              bab: "three_quarter",
              saves: { fortitude: "poor", reflex: "poor", will: "poor" },
              skillRanksPerLevel: 2,
              classSkillKeys: [],
            };
      }
      mut(t.compendiumPreset);
      recomputeClassDerived(c, { hpMethod: "manual" });
    });

  // Fetch the feature rows a class grants. 3pp classes (compendiumId "3pp:<slug>") have NO
  // class_feature_compendium rows — their features are synthesized from the threepp progression's
  // "Special" column, so level-up regrants and archetype-removal restores must re-synthesize from the
  // same source the picker's apply used (otherwise they silently grant/restore nothing).
  const fetchFeatureRows = async (className: string, compendiumId: string | undefined): Promise<CompendiumFeatureRow[]> => {
    if (compendiumId?.startsWith("3pp:")) {
      const slug = compendiumId.slice("3pp:".length);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("threepp_class_compendium").select("slug,progression_json").eq("slug", slug).maybeSingle();
      return data ? threeppFeaturesFromProgression(data.progression_json, slug) : [];
    }
    const [{ data: feats }, { data: fx }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("class_feature_compendium").select("slug,feature,level,type,description").eq("class", className).eq("category", "Main"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("feature_effect").select("feature,target,op,value_or_formula,bonus_type,notes").eq("class", className),
    ]);
    return buildFeatureRows(feats ?? [], fx ?? []);
  };

  // Leveling a compendium class up grants the newly-reached levels' features (idempotent; level-down leaves
  // existing features in place per the builder's decision). classId + exclude are captured at click time and
  // the row is matched by id (not array index) so a concurrent class add/remove can't corrupt the grant.
  const regrantFeatures = async (
    className: string,
    classId: string,
    fromLevel: number,
    toLevel: number,
    exclude: string[],
    compendiumId: string | undefined,
  ) => {
    const rows = await fetchFeatureRows(className, compendiumId);
    ed.update((c) => {
      if (!c.identity.classes.some((r) => r.id === classId)) return; // the class was removed during the fetch
      grantClassFeatures(c, { features: rows, fromLevel, toLevel, exclude });
    });
  };

  // Restore specific standard class features (the ones an un-applied archetype had replaced) — re-fetches the
  // class's features and re-grants only the named ones, excluding anything a remaining archetype still replaces.
  const restoreStandardFeatures = async (
    className: string,
    classId: string,
    toLevel: number,
    restore: string[],
    compendiumId: string | undefined,
  ) => {
    const restoreSet = new Set(restore.map((s) => s.toLowerCase()));
    const rows = (await fetchFeatureRows(className, compendiumId)).filter((r) => restoreSet.has(r.feature.trim().toLowerCase()));
    if (!rows.length) return;
    ed.update((c) => {
      const r = c.identity.classes.find((x) => x.id === classId);
      if (!r) return;
      grantClassFeatures(c, { features: rows, fromLevel: 0, toLevel, exclude: (r.archetypes ?? []).flatMap((a) => a.replaces) });
    });
  };
  // Remove an applied archetype: drop it + its granted features (engine), then restore the standards it replaced.
  const removeArchetype = (a: { name: string; compendiumId?: string }) => {
    const className = cl.compendiumPreset?.name ?? cl.name;
    const classId = cl.id;
    const toLevel = cl.level;
    const compendiumId = cl.compendiumId;
    let restore: string[] = [];
    ed.update((c) => {
      restore = unapplyArchetype(c, { classId, archetype: a }).restore;
      if (c.identity.classes.some((x) => resolveClassPreset(x))) recomputeClassDerived(c, { hpMethod: "manual" });
    });
    if (restore.length && compendiumId) void restoreStandardFeatures(className, classId, toLevel, restore, compendiumId);
  };

  const displayName = preset?.name ?? cl.name;
  const fcb = cl.favoredClassBonus ?? { hp: 0, skill: 0 };
  const fcbRemaining = Math.max(0, cl.level - fcb.hp - fcb.skill);
  const archetypes = cl.archetypes ?? [];

  const toggleFavored = (on: boolean) =>
    set((t, c) => {
      t.favoredClass = on || undefined;
      if (!on) t.favoredClassBonus = undefined;
      syncFavoredClasses(c);
      syncFcbHp(c);
    });
  // The hp + skill tally is jointly clamped to the class level (each NumberField's `max` is only the native
  // attribute — it doesn't bound the committed value — so the real guard lives here).
  const setFcb = (hp: number, skill: number) =>
    set((t, c) => {
      const cap = Math.max(0, t.level);
      const h = Math.min(Math.max(0, hp), cap);
      const sk = Math.min(Math.max(0, skill), cap - h);
      t.favoredClassBonus = { hp: h, skill: sk };
      syncFcbHp(c);
    });

  return (
    <div className="rounded-lg border border-border">
      <div className="space-y-1.5 p-2">
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Class"
            value={cl.name}
            onChange={(v) =>
              set((t, c) => {
                t.name = v;
                // Keep a custom (hand-built) preset's display name in step with the field; compendium/catalog
                // presets keep their canonical name (archetype scoping + recompute rely on it).
                if (t.compendiumPreset?.key.startsWith("custom:")) t.compendiumPreset.name = v || "Class";
                if (t.favoredClass) syncFavoredClasses(c);
              })
            }
            className="min-w-0 flex-1 sm:max-w-[13rem]"
          />
          <NumberField
            label="Level"
            value={cl.level}
            min={0}
            onChange={(v) => {
              const oldLevel = cl.level;
              set((t, c) => {
                t.level = v;
                // Re-clamp the FCB tally to the new level so favoredClassHpBonus can't keep phantom HP.
                if (t.favoredClassBonus) {
                  t.favoredClassBonus.hp = Math.min(t.favoredClassBonus.hp, Math.max(0, v));
                  t.favoredClassBonus.skill = Math.min(t.favoredClassBonus.skill, Math.max(0, v - t.favoredClassBonus.hp));
                }
                syncLevel(c);
                syncFcbHp(c);
                if (resolveClassPreset(t)) recomputeClassDerived(c, { hpMethod: "manual" });
              });
              if (cl.compendiumId && v > oldLevel) {
                const exclude = (cl.archetypes ?? []).flatMap((a) => a.replaces);
                void regrantFeatures(cl.compendiumPreset?.name ?? cl.name, cl.id, oldLevel, v, exclude, cl.compendiumId);
              }
            }}
            className="w-16"
          />
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? `Done editing ${displayName} details` : `Edit ${displayName} details`}
              className="flex h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:h-10"
            >
              {open ? "Done" : "Edit"}
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${displayName}`}
              onClick={() =>
                ed.update((c) => {
                  c.identity.classes.splice(i, 1);
                  syncLevel(c);
                  syncFavoredClasses(c);
                  syncFcbHp(c);
                  if (c.identity.classes.some((x) => resolveClassPreset(x))) recomputeClassDerived(c, { hpMethod: "manual" });
                })
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Collapsed summary — the chip strip the engine reads. */}
        <div className="flex flex-wrap items-center gap-1">
          {cl.hitDie && <StatChip value={cl.hitDie} />}
          {preset ? (
            <>
              <StatChip value={BAB_LABEL[preset.bab] ?? preset.bab} />
              {(["fortitude", "reflex", "will"] as const).map((s) => (
                <StatChip key={s} label={SAVE_LABEL[s]} value={preset.saves[s]} tone={preset.saves[s] === "good" ? "good" : "poor"} />
              ))}
              {preset.caster && <StatChip tone="rune" value={preset.caster.casterType} />}
            </>
          ) : (
            <StatChip value="manual BAB / saves" />
          )}
          {gestalt && <StatChip value={`track ${(cl.track ?? "a").toUpperCase()}`} />}
          {cl.favoredClass && (
            <StatChip
              tone="gold"
              value={
                <span className="flex items-center gap-0.5">
                  <Star className="size-3 fill-current" /> favored
                </span>
              }
            />
          )}
          {archetypes.map((a) => (
            <StatChip key={a.compendiumId ?? a.name} tone="rune" value={a.name} />
          ))}
          {cl.archetype && <StatChip value={cl.archetype} />}
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border/50 p-2.5">
          {/* Progression — every stat the engine uses, adjustable. */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Progression</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <SelectField label="BAB" value={preset?.bab ?? "three_quarter"} onChange={(v) => editPreset((p) => (p.bab = v as ClassPreset["bab"]))} options={BAB_OPTIONS} />
              {(["fortitude", "reflex", "will"] as const).map((s) => (
                <SelectField
                  key={s}
                  label={SAVE_LABEL[s]}
                  value={preset?.saves[s] ?? "poor"}
                  onChange={(v) => editPreset((p) => (p.saves[s] = v as "good" | "poor"))}
                  options={SAVE_OPTIONS}
                />
              ))}
              <SelectField
                label="Hit Die"
                value={STD_HIT_DICE.includes(cl.hitDie ?? "") ? cl.hitDie! : cl.hitDie ? "custom" : ""}
                onChange={(v) =>
                  set((t) => {
                    if (v === "custom") t.hitDie = STD_HIT_DICE.includes(t.hitDie ?? "") || !t.hitDie ? "d20" : t.hitDie;
                    else t.hitDie = v || undefined;
                  })
                }
                options={[{ value: "", label: "—" }, ...STD_HIT_DICE.map((d) => ({ value: d, label: d })), { value: "custom", label: "Custom…" }]}
              />
              {cl.hitDie != null && !STD_HIT_DICE.includes(cl.hitDie) && (
                <TextField label="Custom die" value={cl.hitDie} onChange={(v) => set((t) => (t.hitDie = v || undefined))} placeholder="d20" />
              )}
              <SelectField
                label="Spellcasting"
                value={preset?.caster?.casterType ?? ""}
                onChange={(v) =>
                  editPreset((p) => {
                    if (!v) p.caster = undefined;
                    else p.caster = { casterType: v as CasterType, castingAbility: p.caster?.castingAbility ?? "int", clProgression: p.caster?.clProgression ?? "full" };
                  })
                }
                options={CASTER_TYPE_OPTIONS}
              />
              {preset?.caster && (
                <>
                  <SelectField
                    label="Casting ability"
                    value={preset.caster.castingAbility}
                    onChange={(v) => editPreset((p) => p.caster && (p.caster.castingAbility = v as AbilityKey))}
                    options={ABILITY_KEYS.map((a) => ({ value: a, label: a.toUpperCase() }))}
                  />
                  <SelectField
                    label="Caster level"
                    value={preset.caster.clProgression}
                    onChange={(v) => editPreset((p) => p.caster && (p.caster.clProgression = v as "full" | "minus_three"))}
                    options={CL_PROGRESSION_OPTIONS}
                  />
                </>
              )}
              {gestalt && (
                <SelectField
                  label="Gestalt track"
                  value={cl.track ?? "a"}
                  onChange={(v) =>
                    set((t, c) => {
                      t.track = v as "a" | "b";
                      c.identity.totalLevel = gestaltLevel(c);
                      if (resolveClassPreset(t)) recomputeClassDerived(c, { hpMethod: "manual" });
                    })
                  }
                  options={[
                    { value: "a", label: "A" },
                    { value: "b", label: "B" },
                  ]}
                />
              )}
            </div>
            {!preset && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">Set a progression to include this class in the BAB / save totals.</p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Hit Die &amp; Level feed Max HP — recompute it from the Health tab after changing them.
            </p>
          </div>

          {/* Favored class + FCB split. */}
          <div className="rounded-lg border border-border/60 bg-background/40 p-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={!!cl.favoredClass}
                onChange={(e) => toggleFavored(e.target.checked)}
                className="size-4 rounded border-border accent-gold"
              />
              <span className="font-medium">Favored class</span>
            </label>
            {cl.favoredClass && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <NumberField label="+1 HP ×" value={fcb.hp} min={0} max={cl.level} onChange={(v) => setFcb(v, fcb.skill)} className="w-20" />
                <NumberField label="+1 Skill ×" value={fcb.skill} min={0} max={cl.level} onChange={(v) => setFcb(fcb.hp, v)} className="w-20" />
                <p className="pb-2 text-[11px] text-muted-foreground">
                  {fcbRemaining} of {cl.level} unassigned. HP feeds computed Max HP; skill ranks are yours to spend in Skills.
                </p>
              </div>
            )}
          </div>

          {/* Per-class archetypes — scoped to THIS class, supports multiple (conflict-checked in the picker). */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Archetypes{archetypes.length > 0 ? ` (${archetypes.length})` : ""}
              </p>
              <Button size="sm" variant={showArch ? "default" : "secondary"} onClick={() => setShowArch((v) => !v)}>
                <Shield className="size-4" /> {showArch ? "Close" : "Add / manage"}
              </Button>
            </div>
            {archetypes.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {archetypes.map((a) => (
                  <span
                    key={a.compendiumId ?? a.name}
                    className="inline-flex items-center gap-1 rounded-md border border-rune/50 bg-rune/10 py-0.5 pl-1.5 pr-1 text-[11px]"
                  >
                    <span className="font-medium text-foreground">{a.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove archetype ${a.name}`}
                      onClick={() => removeArchetype(a)}
                      className="tap-target inline-flex size-4 items-center justify-center rounded text-muted-foreground hover:text-danger"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {showArch && (
              <div className="mt-2">
                <ArchetypePicker ed={ed} lockedClassId={cl.id} onClose={() => setShowArch(false)} />
              </div>
            )}
            <div className="mt-2">
              <TextField
                label="Archetype note (freeform)"
                value={cl.archetype ?? ""}
                onChange={(v) => set((t) => (t.archetype = v || undefined))}
                className="w-full max-w-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ABILITY_ABBR: Record<AbilityKey, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

/**
 * A consolidated "Race details" disclosure — the racial LENS on the sheet. Collapsed shows a chip summary of the
 * applied racial effects (race name, ability mods tinted +/−, size, speed); expanded lets you VIEW and SET them
 * by hand: ability-score adjustments (editing a mod adjusts that score by the delta, mirroring applyRace), size,
 * base speed + height. The standard-traits prose lives as a feature (edited under Features). Works whether the
 * race was applied from the compendium (raceApplied populated) or is hand-entered (raceApplied is created here).
 */
function RaceDetails({ ed }: { ed: EditorApi }) {
  const [open, setOpen] = useState(false);
  const id = ed.draft.identity;
  const mods = id.raceApplied?.abilityMods ?? {};
  // Read only the leading integer — match the engine's parseLeadingInt (compute.ts) so the chip, the field,
  // and the round-trip write all agree (a "30 ft. (20 in armor)" string must read 30, not "302020").
  const speedMatch = /-?\d+/.exec(String(ed.draft.combat.speed.base ?? ""));
  const speedNum = speedMatch ? parseInt(speedMatch[0], 10) : NaN;
  const pointBuyOn = !!ed.draft.abilities.pointBuy?.enabled;

  const matchedSize = PF_SIZES.find((s) => s.toLowerCase() === (id.size ?? "medium").toLowerCase());
  const sizeValue = matchedSize ?? id.size ?? "Medium";
  const sizeOptions = (matchedSize || !id.size ? PF_SIZES : [id.size, ...PF_SIZES]).map((s) => ({ value: s, label: s }));

  const setMod = (key: AbilityKey, next: number) =>
    ed.update((c) => {
      if (!c.identity.raceApplied) c.identity.raceApplied = { name: c.identity.race || "Custom race", abilityMods: {} };
      const ra = c.identity.raceApplied;
      const old = ra.abilityMods[key] ?? 0;
      const a = c.abilities.primary[key];
      if (a) a.score += next - old; // keep the score consistent with the recorded racial mod
      if (next === 0) delete ra.abilityMods[key];
      else ra.abilityMods[key] = next;
    });

  const nonzero = ABILITY_KEYS.filter((k) => (mods[k] ?? 0) !== 0);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} race details`}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 p-2 text-left"
      >
        <span className="text-sm font-medium text-foreground">Race details</span>
        {id.race && <StatChip value={id.race} />}
        {nonzero.map((k) => (
          <StatChip key={k} label={ABILITY_ABBR[k]} value={`${mods[k]! >= 0 ? "+" : ""}${mods[k]}`} tone={mods[k]! >= 0 ? "good" : "poor"} />
        ))}
        {id.size && <StatChip value={id.size} />}
        {Number.isFinite(speedNum) && <StatChip value={`${speedNum} ft`} />}
        <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/50 p-2.5">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ability adjustments</p>
            {pointBuyOn ? (
              // Point Buy owns the score (composeAbilityScore reads pointBuy.racial) — editing the score here would
              // be silently wiped on the next Point Buy recompute, so steer the user to that single channel.
              <p className="text-[11px] text-muted-foreground">
                Point Buy is active — set racial bonuses in the Abilities tab&apos;s Point Buy panel so the score stays in sync.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {ABILITY_KEYS.map((k) => (
                    <NumberField key={k} label={ABILITY_ABBR[k]} value={mods[k] ?? 0} onChange={(v) => setMod(k, v)} />
                  ))}
                </div>
                {id.raceApplied ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">Editing a racial mod adjusts that ability score by the difference.</p>
                ) : (
                  <p className="mt-1 text-[11px] text-warning">
                    Heads up: your ability scores may already include racial mods. Only set these if your scores are
                    pre-racial — or apply a race from Browse races to track them cleanly.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <SelectField label="Size" value={sizeValue} onChange={(v) => ed.update((c) => (c.identity.size = v))} options={sizeOptions} />
            <NumberField
              label="Base speed (ft)"
              value={Number.isFinite(speedNum) ? speedNum : 30}
              min={0}
              onChange={(v) => ed.update((c) => (c.combat.speed.base = `${v} ft`))}
            />
            <TextField label="Base height" value={id.height ?? ""} onChange={(v) => ed.update((c) => (c.identity.height = v || undefined))} />
          </div>
          {id.raceApplied?.traitFeatureId && (
            <p className="text-[11px] text-muted-foreground">
              Standard racial traits are stored as a feature — edit the prose under Abilities → Features &amp; abilities.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function IdentityEditor({ ed }: { ed: EditorApi }) {
  const id = ed.draft.identity;
  const prog = ed.draft.progression;
  const [showClassCompendium, setShowClassCompendium] = useState(false);
  const [showRaces, setShowRaces] = useState(false);
  const hasPresetClass = id.classes.some((c) => resolveClassPreset(c));
  // A race name is set (e.g. typed into the field or imported) but its ability modifiers were never
  // applied via the compendium (raceApplied absent or naming a different race) — so nothing reached
  // the ability scores. Prompt the user to apply it. RaceDetails also lets them enter mods by hand.
  const raceNeedsApply =
    !!id.race?.trim() &&
    (!id.raceApplied || (id.raceApplied.name ?? "").trim().toLowerCase() !== id.race.trim().toLowerCase());

  // Size is a controlled <select> over the 9 canonical sizes (matched case-insensitively, so
  // the engine's getSizeModifiers always resolves) — a typo'd legacy value is kept as an option.
  const matchedSize = PF_SIZES.find((s) => s.toLowerCase() === (id.size ?? "medium").toLowerCase());
  const identitySizeValue = matchedSize ?? id.size ?? "Medium";
  const identitySizeOptions = (matchedSize || !id.size ? PF_SIZES : [id.size, ...PF_SIZES]).map((s) => ({
    value: s,
    label: s,
  }));
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
        <Button size="sm" variant={showRaces ? "default" : "secondary"} onClick={() => setShowRaces((v) => !v)}>
          <Search className="size-4" /> Browse races
        </Button>
        {raceNeedsApply && !showRaces && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/5 p-2.5">
            <p className="min-w-0 flex-1 text-xs text-foreground">
              Ability modifiers for <strong>{id.race}</strong> aren&apos;t applied yet — typing a race name here
              is display-only. Apply its ability modifiers, size &amp; speed from the compendium.
            </p>
            <Button size="sm" variant="outline" onClick={() => setShowRaces(true)}>
              Apply race traits
            </Button>
          </div>
        )}
        {showRaces && (
          <div className="mt-2">
            <RacePicker ed={ed} onClose={() => setShowRaces(false)} initialQuery={id.race ?? undefined} />
          </div>
        )}
        <div className="mt-2">
          <RaceDetails ed={ed} />
        </div>
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
            <Button
              size="sm"
              variant={showClassCompendium ? "default" : "secondary"}
              onClick={() => setShowClassCompendium((v) => !v)}
            >
              <Search className="size-4" /> Browse classes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                ed.update((c) => {
                  // Under gestalt, drop the new class on the empty track so a 2-class build splits
                  // A/B by default (avoids the silent all-on-track-A sum). Per-row selector still wins.
                  const track =
                    isGestalt(c) && c.identity.classes.length > 0 && !c.identity.classes.some((x) => x.track === "b")
                      ? ("b" as const)
                      : undefined;
                  c.identity.classes.push({ id: newId("class"), name: "Class", level: 1, ...(track ? { track } : {}) });
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
        <p className="mb-2 text-[11px] text-muted-foreground">
          Browse base, core &amp; prestige classes from the compendium, or add a Custom class and dial in its
          progression by hand. Archetypes live inside each class below.
        </p>
        {showClassCompendium && (
          <div className="mb-3">
            <ClassCompendiumPicker ed={ed} onClose={() => setShowClassCompendium(false)} />
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
        <GestaltCollapseBanner ed={ed} />
        <p className="mt-2 text-sm text-muted-foreground">
          Total level: <span className="font-semibold text-foreground">{id.totalLevel}</span>
        </p>
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
              className="h-11 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground sm:h-10"
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
          {prog.favoredClasses.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              None yet — tick <span className="text-foreground">Favored class</span> on a class above to set its bonus.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {prog.favoredClasses.map((fc, idx) => (
                <Badge key={idx} variant="gold">
                  {fc}
                </Badge>
              ))}
            </div>
          )}
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

  // A master-linked familiar's max HP is derived (half the master's) — the stored field would
  // be a silent no-op, so show the derived value read-only instead.
  const familiarLinked =
    ed.draft.companion?.type === "familiar" && ed.computed.summary.companion?.synced === true;

  return (
    <div className="space-y-6">
      {familiarLinked && (
        <p className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-xs text-foreground">
          Max HP is <strong>half the master&apos;s</strong> ({hpMax}) while the master link is on — change
          it under <em>Companion link</em>.
        </p>
      )}
      <div className="grid max-w-3xl gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {familiarLinked ? (
          <div>
            <span className="mb-1 block text-[11px] text-muted-foreground">Max HP (linked)</span>
            <div className="tnum flex h-11 items-center rounded-lg border border-border bg-surface-raised px-3 text-sm font-semibold text-foreground sm:h-10">
              {hpMax}
            </div>
          </div>
        ) : (
          <NumberField label="Max HP" value={maxHp} min={0} onChange={(v) => ed.update((c) => (c.health.maxHp = v))} />
        )}
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
        {/* Under a collapsed gestalt, hpFromLevels sums both class lines (track b is empty) — block the
            apply and offer the split so a wrong Max HP can't be committed here. */}
        <GestaltCollapseBanner ed={ed} />
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
          {ed.draft.identity.classes.some((x) => x.favoredClassBonus) ? (
            // Per-class FCB is in use → it is the single source of truth; show the derived sum read-only so the
            // two controls can't clobber each other.
            <div className="space-y-1">
              <span className="block text-sm font-medium leading-none text-foreground">Favored-class HP</span>
              <div className="flex h-10 w-32 items-center gap-1 rounded-lg border border-border bg-surface-sunken px-3 text-sm">
                <span className="font-semibold tabular-nums text-foreground">{ed.draft.health.favoredClassHpBonus}</span>
                <span className="text-[11px] text-muted-foreground">· set per-class</span>
              </div>
            </div>
          ) : (
            <NumberField
              label="Favored-class HP"
              value={ed.draft.health.favoredClassHpBonus}
              min={0}
              onChange={(v) => ed.update((c) => (c.health.favoredClassHpBonus = v))}
              className="w-32"
            />
          )}
          <div className="pb-1.5 text-sm text-muted-foreground">
            ={" "}
            <span className="font-semibold text-foreground">{hpFromLevels.total} HP</span>{" "}
            <span className="text-xs">
              (HD {hpFromLevels.hd}
              {hpFromLevels.con ? ` · Con ${hpFromLevels.con >= 0 ? "+" : ""}${hpFromLevels.con}` : ""}
              {hpFromLevels.fcb ? ` · FCB +${hpFromLevels.fcb}` : ""})
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={applyComputedHp}
            disabled={hpFromLevels.levels === 0 || gestaltTracksCollapsed(ed.draft)}
          >
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
            className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground sm:h-10"
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
            className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground sm:h-10"
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

const SAVE_ROWS = [
  { key: "fortitude", label: "Fortitude", defaultAbility: "con" },
  { key: "reflex", label: "Reflex", defaultAbility: "dex" },
  { key: "will", label: "Will", defaultAbility: "wis" },
] as const;

function SavesEditor({ ed }: { ed: EditorApi }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Each save is class base + its key ability modifier + modifiers. Open a save to change its key
        ability (e.g. a Cha-to-Will feature) or add typed bonuses — a ƒx value like{" "}
        <code className="font-mono text-xs">[[@{"{"}level.total{"}"}/3]]</code> scales with the sheet.
      </p>
      {SAVE_ROWS.map((r) => (
        <SaveRow key={r.key} ed={ed} k={r.key} label={r.label} defaultAbility={r.defaultAbility} />
      ))}
    </div>
  );
}

function SaveRow({
  ed,
  k,
  label,
  defaultAbility,
}: {
  ed: EditorApi;
  k: "fortitude" | "reflex" | "will";
  label: string;
  defaultAbility: AbilityKey;
}) {
  const [open, setOpen] = useState(false);
  const entry = ed.draft.defenses.savingThrows[k];
  const cv = ed.computed.saves[k];
  const abilityKey = ((entry.abilityKey ?? "").trim().toLowerCase() || defaultAbility) as string;
  const overridden = abilityKey !== defaultAbility;
  const abilityMod = ed.computed.abilities[abilityKey]?.modifier ?? 0;
  // The resolved save "misc" bucket (misc entries, conditions, buffs, ABP). A flat formula never
  // reads it, so subtract it when rebuilding so the bucket isn't double-counted onto the total.
  const miscBucket = ed.computed.summary.saveMisc?.[k] ?? 0;
  const modCount = entry.misc.length + entry.conditionalModifiers.length;
  // An imported sheet may carry a FLAT save formula (e.g. "12") — base/ability/modifier edits
  // can't reach it, so the controls would silently no-op. Detect it and offer a rebuild.
  const formula = entry.formula ?? "0";
  const usesTerms =
    formula.includes(`@{saves.${k}.base}`) ||
    formula.includes(`@{abilities.${defaultAbility}.mod}`) ||
    formula.includes(`@{saves.${k}.misc}`);
  // The ability override binds by rewriting the DEFAULT ability ref in the stored formula — a
  // customized formula without that ref leaves the override inert.
  const overrideBinds = !overridden || formula.includes(`@{abilities.${defaultAbility}.mod}`);
  const rebuildFormula = () =>
    ed.update((c) => {
      const e = c.defenses.savingThrows[k];
      e.formula = `@{saves.${k}.base} + @{abilities.${defaultAbility}.mod} + @{saves.${k}.misc}`;
      // Preserve the current total exactly: base = flat total − ability mod − the misc bucket (which
      // the rebuilt formula re-adds via @{saves.k.misc}). Subtracting the bucket prevents an active
      // save contribution (a resistance item, ABP, a buff) from being double-counted on rebuild.
      e.base = cv.value - abilityMod - miscBucket;
    });
  // A master-linked familiar uses the BETTER of its own base or the master's — show the
  // effective base in the chip so the numbers visibly add up, and hint when the master's wins.
  const masterBase =
    ed.draft.companion?.type === "familiar" && ed.computed.summary.companion?.synced
      ? (ed.draft.companion.master?.saves[k] ?? null)
      : null;
  const masterApplies = masterBase !== null && masterBase > entry.base;
  const effectiveBase = masterApplies ? masterBase : entry.base;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {usesTerms ? (
            <>
              <StatChip
                label={masterApplies ? "base (master)" : "base"}
                value={formatModifier(effectiveBase)}
                tone={masterApplies ? "gold" : "neutral"}
              />
              <StatChip
                label={abilityKey.toUpperCase()}
                value={formatModifier(abilityMod)}
                tone={overridden ? "rune" : "neutral"}
              />
            </>
          ) : (
            <>
              <StatChip label="fixed" value={formatModifier(cv.value)} tone="gold" />
              <button
                type="button"
                onClick={rebuildFormula}
                aria-label={`Rebuild ${label} save formula so base and modifiers apply`}
                className="tap-target rounded-md border border-gold/40 px-2 py-0.5 text-[11px] font-medium text-gold hover:bg-gold/10"
              >
                Rebuild
              </button>
            </>
          )}
          {modCount > 0 && <StatChip label="mods" value={modCount} />}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Badge variant="rune">{formatModifier(cv.value)}</Badge>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? `Done editing ${label} save` : `Edit ${label} save`}
            className="flex h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:h-9"
          >
            {open ? "Done" : "Edit"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border/50 p-2.5">
          {!usesTerms && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/5 p-2.5">
              <p className="min-w-0 flex-1 text-xs text-foreground">
                This save was imported as a <strong>fixed total</strong> — the controls below won&apos;t
                change it until the formula is rebuilt (the current total is preserved as Base).
              </p>
              <Button size="sm" variant="outline" onClick={rebuildFormula}>
                Rebuild formula
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <NumberField
                label="Base (class progression)"
                value={entry.base}
                onChange={(v) =>
                  ed.update((c) => {
                    c.defenses.savingThrows[k].base = v;
                  })
                }
                className="w-40"
              />
              {masterApplies && (
                <p className="mt-1 max-w-[16rem] text-[11px] text-muted-foreground">
                  The master&apos;s base ({formatModifier(masterBase)}) applies while it is higher than
                  this one (familiar link).
                </p>
              )}
            </div>
            <div className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">Key ability</span>
              <select
                value={overridden ? abilityKey : ""}
                aria-label={`${label} key ability`}
                onChange={(e) =>
                  ed.update((c) => {
                    c.defenses.savingThrows[k].abilityKey = e.target.value || undefined;
                  })
                }
                className="h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground sm:h-9"
              >
                <option value="">Default ({ABILITY_NAMES[defaultAbility]})</option>
                {ABILITY_KEYS.filter((a) => a !== defaultAbility).map((a) => (
                  <option key={a} value={a}>
                    {ABILITY_NAMES[a]}
                  </option>
                ))}
              </select>
              {!overrideBinds && (
                <p className="max-w-[16rem] text-[11px] text-warning">
                  This save&apos;s custom formula doesn&apos;t reference {ABILITY_NAMES[defaultAbility]}, so
                  the override can&apos;t apply — rebuild the formula or edit it directly.
                </p>
              )}
            </div>
          </div>

          <ModifierListEditor
            entries={entry.misc}
            onChange={(next) =>
              ed.update((c) => {
                const e = c.defenses.savingThrows[k];
                // A flat imported save ignores @{saves.X.misc}, so a modifier added here would
                // silently no-op. Rebuild to the dynamic formula first (preserving the current
                // total as Base) so the modifier actually applies.
                if (!usesTerms) {
                  e.formula = `@{saves.${k}.base} + @{abilities.${defaultAbility}.mod} + @{saves.${k}.misc}`;
                  // Subtract the misc bucket resolved BEFORE this edit; `next` (with the just-added
                  // entry) then adds only the new delta on top of the preserved flat total.
                  e.base = cv.value - abilityMod - miscBucket;
                }
                e.misc = next;
              })
            }
            title="Modifiers"
            idPrefix={`save_${k}`}
            emptyHint="Resistance items, feats entered by hand, circumstance bonuses… Typed bonuses stack by PF1e rules."
          />

          {entry.conditionalModifiers.length > 0 && (
            <ModifierListEditor
              entries={entry.conditionalModifiers}
              onChange={(next) =>
                ed.update((c) => {
                  c.defenses.savingThrows[k].conditionalModifiers = next;
                })
              }
              title="Conditional modifiers (imported)"
              idPrefix={`save_${k}_cond`}
              addLabel="Add"
            />
          )}

          <FormulaBreakdown label={`${label} math`} cv={cv} />
        </div>
      )}
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

/** The fixed ids the 6 AC component inputs write into `conditionalModifiers`. */
const AC_COMPONENT_IDS = new Set(AC_COMPONENTS.map((c) => `ac_${c.key}`));

function ACEditor({ ed }: { ed: EditorApi }) {
  const [showMath, setShowMath] = useState(false);
  const mods = ed.draft.defenses.armorClass.conditionalModifiers;
  // A component box is driven by its canonical `ac_<key>` row. For the 5 TYPED components we also
  // adopt a single imported/hand modifier of the matching bonus type: importers push AC components
  // with generated ids (mw-mod-N / fvtt-mod-N), so without this they'd read 0 in the labeled boxes
  // and surface only under "Additional modifiers" (the reported "AC ignores the manual entry area").
  // The untyped "misc" box is NOT adopted into — multiple untyped mods there are legitimate.
  const adoptedEntry = (comp: (typeof AC_COMPONENTS)[number]): ModifierEntry | undefined => {
    const own = mods.find((x) => x.id === `ac_${comp.key}`);
    if (own) return own;
    if (comp.bonusType === "untyped") return undefined;
    // Only adopt a mod the ENGINE actually counts into @{ac.<type>}: modifierEntryToMod drops a mod
    // with a `condition` (conditional AC never feeds the base total) or `enabled === false`. Adopting
    // such a row into a box would show a value the AC total never applies (and re-keying it couldn't
    // clear the condition) — leave it in the Additional-modifiers list where its state is visible.
    const sameType = mods.filter(
      (m) =>
        !AC_COMPONENT_IDS.has(m.id) &&
        (m.bonusType ?? "untyped") === comp.bonusType &&
        typeof m.value === "number" &&
        !m.condition &&
        m.enabled !== false,
    );
    return sameType.length === 1 ? sameType[0] : undefined;
  };
  const adoptedIds = new Set(
    AC_COMPONENTS.map((comp) => adoptedEntry(comp))
      .filter((e): e is ModifierEntry => !!e && !AC_COMPONENT_IDS.has(e.id))
      .map((e) => e.id),
  );
  const getVal = (comp: (typeof AC_COMPONENTS)[number]): number => {
    const m = adoptedEntry(comp);
    if (!m) return 0;
    return typeof m.value === "number" ? m.value : Number(m.value) || 0;
  };
  const setVal = (comp: (typeof AC_COMPONENTS)[number], v: number) =>
    ed.update((c) => {
      const arr = c.defenses.armorClass.conditionalModifiers;
      const canId = `ac_${comp.key}`;
      const adopted = adoptedEntry(comp);
      const adoptId = adopted && !AC_COMPONENT_IDS.has(adopted.id) ? adopted.id : undefined;
      const idx = arr.findIndex((x) => x.id === canId || (adoptId != null && x.id === adoptId));
      if (v === 0) {
        if (idx >= 0) arr.splice(idx, 1);
      } else if (idx >= 0) {
        const t = arr[idx];
        if (t) {
          t.value = v;
          t.id = canId; // stabilize an adopted imported row onto the canonical id
          t.bonusType = comp.bonusType;
          if (!t.label) t.label = comp.label;
          t.enabled = true;
        }
      } else {
        arr.push({ id: canId, label: comp.label, value: v, bonusType: comp.bonusType, enabled: true });
      }
    });

  // Named / formula-valued modifiers beyond the 6 component boxes (rings, buffs entered by hand,
  // scaling class features). Kept in the same conditionalModifiers array under distinct ids —
  // minus any imported row adopted into a labeled box above.
  const extraMods = mods.filter((m) => !AC_COMPONENT_IDS.has(m.id) && !adoptedIds.has(m.id));
  const setExtraMods = (next: ModifierEntry[]) =>
    ed.update((c) => {
      const arr = c.defenses.armorClass.conditionalModifiers;
      c.defenses.armorClass.conditionalModifiers = [
        ...arr.filter((m) => AC_COMPONENT_IDS.has(m.id) || adoptedIds.has(m.id)),
        ...next,
      ];
    });

  // Imported / hand-edited flat AC total: if the total formula references none of the AC component
  // terms (a bare number, or an active override), the boxes + equipped armor silently no-op. Mirror
  // the Saves editor's "fixed total → rebuild" remedy so there's an in-UI recovery path.
  const acOverride = ed.draft.formulas.overrides["defenses.armorClass.total"];
  const acFlat =
    !ed.computed.armorClass.total.terms.some((t) => t.ref === "ac.armor" || t.ref === "ac.misc") ||
    (!!acOverride && acOverride.enabled !== false);
  const rebuildAcFormula = () =>
    ed.update((c) => {
      c.defenses.armorClass.formulas = { ...DEFAULT_FORMULAS.ac };
      if (c.formulas.overrides["defenses.armorClass.total"]) delete c.formulas.overrides["defenses.armorClass.total"];
    });

  // Equipped armor/shields feed AC + the Max Dex cap automatically — surface what the engine sees.
  const wornItems = [
    ...ed.draft.inventory.armorAndShields,
    ...ed.draft.inventory.weapons,
    ...ed.draft.inventory.potionsScrollsMagicItems,
    ...ed.draft.inventory.gear,
    ...ed.draft.inventory.otherItems,
  ].filter((i) => i.equipped && (typeof i.armorBonus === "number" || typeof i.maxDexBonus === "number"));
  const dexCaps = wornItems.filter((i) => typeof i.maxDexBonus === "number").map((i) => i.maxDexBonus as number);
  const maxDexCap = dexCaps.length > 0 ? Math.min(...dexCaps) : null;
  const maxDexPenalty = ed.computed.armorClass.total.terms.find((t) => t.ref === "ac.maxDexPenalty")?.value ?? 0;

  const ac = ed.computed.armorClass;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter your AC component bonuses. Dexterity, size, equipped armor, and base attack bonus are
        applied automatically; touch and flat-footed are derived.
      </p>
      {acFlat && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/5 p-2.5">
          <p className="min-w-0 flex-1 text-xs text-foreground">
            This character&apos;s AC is a <strong>fixed total</strong> (or overridden) — the component boxes,
            equipped armor, and modifiers below won&apos;t change it until the formula is rebuilt. Review the
            numbers after rebuilding.
          </p>
          <Button size="sm" variant="outline" onClick={rebuildAcFormula}>
            Rebuild AC formula
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {AC_COMPONENTS.map((comp) => (
          <NumberField
            key={comp.key}
            label={comp.label}
            value={getVal(comp)}
            onChange={(v) => setVal(comp, v)}
          />
        ))}
      </div>

      {wornItems.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-raised p-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Equipped armor
            </span>
            {maxDexCap !== null && <StatChip label="max dex" value={formatModifier(maxDexCap)} tone="gold" />}
            {maxDexPenalty < 0 && (
              <StatChip label="dex capped" value={formatModifier(maxDexPenalty)} tone="poor" />
            )}
          </div>
          <ul className="space-y-0.5">
            {wornItems.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-xs text-foreground">
                <span className="truncate">{i.name}</span>
                <span className="tnum shrink-0 text-muted-foreground">
                  {typeof i.armorBonus === "number" && i.armorBonus !== 0 ? `AC +${i.armorBonus}` : ""}
                  {typeof i.maxDexBonus === "number" ? ` · Max Dex +${i.maxDexBonus}` : ""}
                  {typeof i.armorCheckPenalty === "number" && i.armorCheckPenalty !== 0
                    ? ` · ACP ${-Math.abs(i.armorCheckPenalty)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            These come from equipped Inventory items — edit them in Equipment.
          </p>
        </div>
      )}

      <ModifierListEditor
        entries={extraMods}
        onChange={setExtraMods}
        title="Additional modifiers"
        idPrefix="acmod"
        emptyHint="Named or scaling AC bonuses beyond the six boxes above (e.g. a ring by name, or a ƒx value like [[@{level.total}/4]]). Typed bonuses stack by PF1e rules."
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="AC" value={ac.total.value} />
        <MiniStat label="Touch" value={ac.touch.value} />
        <MiniStat label="Flat-footed" value={ac.flatFooted.value} />
        <MiniStat label="CMD" value={ac.cmd.value} />
      </div>

      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowMath((v) => !v)}>
          <Sigma className="size-4" /> {showMath ? "Hide math" : "Show math"}
        </Button>
        {showMath && (
          <div className="mt-2 space-y-2">
            <FormulaBreakdown label="Armor Class" cv={ac.total} />
            <FormulaBreakdown label="Touch" cv={ac.touch} />
            <FormulaBreakdown label="Flat-footed" cv={ac.flatFooted} />
            <FormulaBreakdown label="CMD" cv={ac.cmd} />
          </div>
        )}
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
  const manualMisc = (s: (typeof skills)[number]) => s.misc.find((x) => x.id === manualMiscId(s.id));
  const miscValue = (s: (typeof skills)[number]) => {
    const m = manualMisc(s);
    return typeof m?.value === "number" ? m.value : 0;
  };
  // A string value is a ƒx formula (kept even while empty so the input doesn't flip modes
  // mid-typing — the engine safely ignores an unevaluable string); numeric 0 clears the entry.
  const setMisc = (i: number, val: number | string) =>
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
  // Custom skills edit their base ability; standard skills record an OVERRIDE (Str-based
  // Acrobatics etc.), cleared when re-picking the default so the sheet stays canonical.
  const setAbility = (i: number, v: string) =>
    ed.update((c) => {
      const t = c.skills.list[i];
      if (!t) return;
      if (t.custom) {
        if (v) t.ability = v;
      } else {
        t.abilityOverride = v && v !== t.ability ? v : undefined;
      }
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
                    <select
                      value={s.custom ? s.ability : (s.abilityOverride ?? "")}
                      aria-label={`${skillDisplayLabel(s)} key ability`}
                      title={
                        s.custom ? undefined : `Default ${s.ability.toUpperCase()} — pick another to override`
                      }
                      onChange={(e) => setAbility(i, e.target.value)}
                      className={cn(
                        "rounded border bg-background px-1 py-0.5 text-[11px] uppercase",
                        !s.custom && s.abilityOverride
                          ? "border-gold/50 font-semibold text-gold"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {!s.custom && <option value="">{s.ability}</option>}
                      {SKILL_ABILITIES.filter((a) => s.custom || a !== s.ability).map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
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
                    <div className="flex items-center gap-1">
                      {typeof manualMisc(s)?.value === "string" ? (
                        <input
                          type="text"
                          value={String(manualMisc(s)?.value ?? "")}
                          aria-label={`${skillDisplayLabel(s)} misc bonus formula`}
                          placeholder="[[@{level.total}/2]]"
                          onChange={(e) => setMisc(i, e.target.value)}
                          className="h-8 w-32 rounded-md border border-gold/40 bg-background px-2 font-mono text-xs"
                        />
                      ) : (
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
                      )}
                      <button
                        type="button"
                        aria-pressed={typeof manualMisc(s)?.value === "string"}
                        aria-label={`Toggle ${skillDisplayLabel(s)} misc formula`}
                        title="Use a formula value — e.g. [[@{level.total}*2]]+[[@{abilities.int.mod}]]"
                        onClick={() => setMisc(i, typeof manualMisc(s)?.value === "string" ? 0 : "@{level.total}")}
                        className={cn(
                          "h-8 shrink-0 rounded-md border px-1.5 text-[11px] font-medium transition-colors",
                          typeof manualMisc(s)?.value === "string"
                            ? "border-gold/40 bg-gold/10 text-gold"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        ƒx
                      </button>
                    </div>
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
                  {/* Mobile density: "(rt)" = requires training (the desktop table spells it out). */}
                  {s.trainedOnly && (
                    <span className="ml-1 text-[10px] text-muted-foreground" title="Requires training">
                      (rt)
                    </span>
                  )}
                </span>
                <span className="tnum shrink-0 font-semibold text-rune">{formatModifier(total)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
                <label className="flex items-center gap-1.5 text-xs text-foreground" title="Class skill">
                  <input
                    type="checkbox"
                    checked={!!s.classSkill}
                    aria-label={`${skillDisplayLabel(s)} is a class skill`}
                    onChange={(e) => setClassSkill(i, e.target.checked)}
                    className="size-4 accent-[var(--pf-gold)]"
                  />
                  cs
                </label>
                {/* No visible "Ability" caption on mobile — the select's value (DEX/STR/…) says it;
                    the aria-label keeps the accessible name. */}
                <select
                  value={s.custom ? s.ability : (s.abilityOverride ?? "")}
                  aria-label={`${skillDisplayLabel(s)} key ability`}
                  onChange={(e) => setAbility(i, e.target.value)}
                  className={cn(
                    "h-11 rounded border bg-background px-1 text-[11px] uppercase",
                    !s.custom && s.abilityOverride
                      ? "border-gold/50 font-semibold text-gold"
                      : "border-border text-foreground",
                  )}
                >
                  {!s.custom && <option value="">{s.ability}</option>}
                  {SKILL_ABILITIES.filter((a) => s.custom || a !== s.ability).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
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
                      className="tnum mt-0.5 block h-11 w-16 rounded-md border border-rune/40 bg-background px-2 text-sm"
                    />
                  </label>
                )}
                <label className="text-[10px] uppercase text-muted-foreground">
                  Misc
                  <span className="mt-0.5 flex items-center gap-1">
                    {typeof manualMisc(s)?.value === "string" ? (
                      <input
                        type="text"
                        value={String(manualMisc(s)?.value ?? "")}
                        aria-label={`${skillDisplayLabel(s)} misc bonus formula`}
                        placeholder="[[@{level.total}/2]]"
                        onChange={(e) => setMisc(i, e.target.value)}
                        className="block h-11 w-36 rounded-md border border-gold/40 bg-background px-2 font-mono text-xs"
                      />
                    ) : (
                      <input
                        type="number"
                        value={miscValue(s)}
                        aria-label={`${skillDisplayLabel(s)} misc bonus`}
                        onChange={(e) => {
                          const n = intOr0(e.target.value);
                          if (n !== null) setMisc(i, n);
                        }}
                        className="tnum block h-11 w-16 rounded-md border border-border bg-background px-2 text-sm"
                      />
                    )}
                    <button
                      type="button"
                      aria-pressed={typeof manualMisc(s)?.value === "string"}
                      aria-label={`Toggle ${skillDisplayLabel(s)} misc formula`}
                      title="Use a formula value — e.g. [[@{level.total}*2]]+[[@{abilities.int.mod}]]"
                      onClick={() => setMisc(i, typeof manualMisc(s)?.value === "string" ? 0 : "@{level.total}")}
                      className={cn(
                        "h-11 shrink-0 rounded-md border px-2 text-xs font-medium transition-colors",
                        typeof manualMisc(s)?.value === "string"
                          ? "border-gold/40 bg-gold/10 text-gold"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      ƒx
                    </button>
                  </span>
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
            className="h-11 rounded-md border border-border bg-background px-2 text-sm sm:h-10"
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
            className="h-11 flex-1 rounded-md border border-border bg-background px-3 text-sm sm:h-10"
          />
          {addType === "custom" && (
            <select
              value={addAbility}
              onChange={(e) => setAddAbility(e.target.value)}
              aria-label="Custom skill ability"
              className="h-11 rounded-md border border-border bg-background px-2 text-sm uppercase sm:h-10"
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

/** A human label for an automation effect, e.g. "Will +2" or "Attack ƒx" — for the collapsed chip strip.
 * `skillLabels` (target → display label, from skillTargetOptions) names specialty/custom skills whose
 * generated keys would otherwise render raw. */
function summarizeEffect(e: AutomationEffect, skillLabels?: Map<string, string>): string {
  const t = e.target.toLowerCase();
  const group = t.match(/^skills?\.(str|dex|con|int|wis|cha)\.all$/);
  const label =
    AUTOMATION_TARGET_OPTIONS.find((o) => o.target === e.target)?.label ??
    skillLabels?.get(e.target) ??
    (group?.[1]
      ? `${group[1].toUpperCase()} skills`
      : (t.match(/^skills?\.([a-z0-9_]+)/)?.[1]?.replace(/_/g, " ") ??
        e.target.split(".").pop() ??
        e.target));
  const sign = e.operation === "subtract" ? "−" : "+";
  return `${label} ${typeof e.value === "string" ? "ƒx" : `${sign}${e.value}`}`;
}

/** Up to 4 automation-effect chips (formula = gold, numeric = rune) + a "+N more" overflow chip; null when empty. */
function effectChips(effects: AutomationEffect[], skillLabels?: Map<string, string>): ReactNode {
  if (!effects.length) return null;
  const shown = effects.slice(0, 4);
  return (
    <>
      {shown.map((e) => (
        <StatChip
          key={e.id}
          tone={typeof e.value === "string" ? "gold" : "rune"}
          value={summarizeEffect(e, skillLabels)}
        />
      ))}
      {effects.length > shown.length && <StatChip value={`+${effects.length - shown.length} more`} />}
    </>
  );
}

/** target → display label for every skill-scoped target on this sheet (memo-free; cheap Map build). */
function skillLabelMap(c: PathForgeCharacterV1): Map<string, string> {
  return new Map(skillTargetOptions(c).map((o) => [o.target, o.label]));
}

function FeatsEditor({ ed }: { ed: EditorApi }) {
  const feats = ed.draft.feats.list;
  const features = ed.draft.features.list;
  const [featPickerOpen, setFeatPickerOpen] = useState(false);
  const [traitPickerOpen, setTraitPickerOpen] = useState(false);
  const [drawbackPickerOpen, setDrawbackPickerOpen] = useState(false);
  const [optionsPickerOpen, setOptionsPickerOpen] = useState(false);
  // The id of a just-added entry, so its EntryCard mounts already-open for editing (custom add = full editor).
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const addedTraitIds = new Set(ed.draft.traits.list.map((t) => t.compendiumId).filter(Boolean) as string[]);
  // 3pp gating (docs/3PP_MASTER_PLAN.md D1): third-party traits union into the picker ONLY when a
  // matching module is enabled — with none enabled, no secondary query fires at all.
  const threeppSystems = useMemo(() => enabledThreeppSystems(ed.draft), [ed.draft]);

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
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Feats</h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={featPickerOpen ? "default" : "secondary"} onClick={() => setFeatPickerOpen((o) => !o)}>
              <Search className="size-4" /> Browse
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = newId("feat");
                ed.update((c) => c.feats.list.push({ id, name: "New Feat", tags: [], automation: [] }));
                setOpenEntryId(id);
              }}
            >
              <Plus className="size-4" /> Add feat
            </Button>
          </div>
        </div>
        {featPickerOpen && (
          <div className="mb-3">
            <FeatPicker ed={ed} onClose={() => setFeatPickerOpen(false)} />
          </div>
        )}
        {feats.length === 0 && <p className="text-sm text-muted-foreground">No feats yet.</p>}
        <div className="space-y-2">
          {feats.map((f, i) => {
            const setFeat = (mut: (t: (typeof feats)[number]) => void) =>
              ed.update((c) => {
                const t = c.feats.list[i];
                if (t) mut(t);
              });
            const hasChips = !!(f.type || f.automation.length);
            return (
              <EntryCard
                key={f.id}
                name={f.name}
                onNameChange={(v) => setFeat((t) => (t.name = v))}
                onRemove={() => ed.update((c) => c.feats.list.splice(i, 1))}
                removeLabel={`Remove ${f.name}`}
                defaultOpen={f.id === openEntryId}
                chips={
                  hasChips ? (
                    <>
                      {f.type && <StatChip value={f.type} />}
                      {effectChips(f.automation, skillLabelMap(ed.draft))}
                    </>
                  ) : undefined
                }
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <TextField label="Type" value={f.type ?? ""} placeholder="Combat, General…" onChange={(v) => setFeat((t) => (t.type = v || undefined))} />
                  <TextField label="Prerequisites" value={f.prerequisites ?? ""} placeholder="e.g. Str 13, Power Attack" onChange={(v) => setFeat((t) => (t.prerequisites = v || undefined))} />
                </div>
                <TextAreaField label="Benefit" value={f.benefit ?? ""} rows={3} onChange={(v) => setFeat((t) => (t.benefit = v || undefined))} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <TextAreaField label="Special" rows={2} value={f.special ?? ""} onChange={(v) => setFeat((t) => (t.special = v || undefined))} />
                  <TextAreaField label="Normal" rows={2} value={f.normal ?? ""} onChange={(v) => setFeat((t) => (t.normal = v || undefined))} />
                </div>
                {(isModuleKeyEnabled(ed.draft, "mythic") || f.mythicBenefit) && (
                  <TextAreaField
                    label="Mythic benefit"
                    rows={2}
                    value={f.mythicBenefit ?? ""}
                    onChange={(v) => setFeat((t) => (t.mythicBenefit = v || undefined))}
                  />
                )}
                <TextField label="Notes" value={f.notes ?? ""} onChange={(v) => setFeat((t) => (t.notes = v || undefined))} />
                <AutomationEffectsEditor effects={f.automation} idPrefix="featfx" skillTargets={skillTargetOptions(ed.draft)} onChange={(next) => setFeat((t) => (t.automation = next))} />
              </EntryCard>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Features &amp; abilities</h3>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={optionsPickerOpen ? "default" : "secondary"}
              onClick={() => setOptionsPickerOpen((o) => !o)}
            >
              <Search className="size-4" /> Class options
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = newId("feature");
                ed.update((c) => c.features.list.push({ id, name: "New Feature", category: "class_feature", automation: [] }));
                setOpenEntryId(id);
              }}
            >
              <Plus className="size-4" /> Add feature
            </Button>
          </div>
        </div>
        {optionsPickerOpen && (
          <div className="mb-3">
            <ClassOptionsPicker ed={ed} onClose={() => setOptionsPickerOpen(false)} />
          </div>
        )}
        {features.length === 0 && (
          <p className="text-sm text-muted-foreground">No racial traits or class features yet.</p>
        )}
        <div className="space-y-2">
          {features.map((f, i) => {
            const setFeature = (mut: (t: (typeof features)[number]) => void) =>
              ed.update((c) => {
                const t = c.features.list[i];
                if (t) mut(t);
              });
            const usesMax = featureMax(f);
            return (
              <EntryCard
                key={f.id}
                name={f.name}
                onNameChange={(v) => setFeature((t) => (t.name = v))}
                onRemove={() => ed.update((c) => c.features.list.splice(i, 1))}
                removeLabel={`Remove ${f.name}`}
                defaultOpen={f.id === openEntryId}
                chips={
                  <>
                    <StatChip value={f.category.replace(/_/g, " ")} />
                    {usesMax > 0 && <StatChip tone="gold" value={`${featureRemaining(f)}/${usesMax} ${f.uses?.per ?? "day"}`} />}
                    {effectChips(f.automation, skillLabelMap(ed.draft))}
                  </>
                }
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <SelectField
                    label="Category"
                    value={f.category}
                    onChange={(v) => setFeature((t) => (t.category = v as (typeof FEATURE_CATEGORIES)[number]))}
                    options={FEATURE_CATEGORIES.map((cat) => ({ value: cat, label: cat.replace(/_/g, " ") }))}
                  />
                  <NumberField
                    label="Gained at level"
                    value={f.level ?? 0}
                    min={0}
                    onChange={(v) => setFeature((t) => (t.level = Number.isFinite(v) && v > 0 ? v : undefined))}
                  />
                </div>
                <TextAreaField label="Description" value={f.description ?? ""} rows={3} onChange={(v) => setFeature((t) => (t.description = v || undefined))} />

                {/* Daily-use tracker — for domain/bloodline/revelation powers (e.g. "Touch of Law 7/day"). */}
                <div className="flex flex-wrap items-end gap-2 border-t border-border/40 pt-2">
                  <NumberField label="Uses" value={usesMax} min={0} onChange={(v) => setFeatureMax(i, v)} className="w-20" />
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
                  {usesMax > 0 && (
                    <div className="flex items-center gap-1.5 pb-1.5">
                      <Button size="sm" variant="outline" disabled={featureRemaining(f) <= 0} aria-label={`Use ${f.name}`} onClick={() => spendFeatureUse(i, 1)}>
                        Use
                      </Button>
                      <span className="tnum text-sm text-muted-foreground">
                        {featureRemaining(f)}/{usesMax} left
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
                <AutomationEffectsEditor effects={f.automation} idPrefix="featurefx" skillTargets={skillTargetOptions(ed.draft)} onChange={(next) => setFeature((t) => (t.automation = next))} />
              </EntryCard>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Traits &amp; drawbacks</h3>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={traitPickerOpen ? "default" : "secondary"}
              onClick={() => setTraitPickerOpen((o) => !o)}
            >
              <Search className="size-4" /> Browse
            </Button>
            {isModuleKeyEnabled(ed.draft, "flaws_drawbacks") && (
              <Button
                size="sm"
                variant={drawbackPickerOpen ? "default" : "secondary"}
                onClick={() => setDrawbackPickerOpen((o) => !o)}
              >
                <Search className="size-4" /> Drawbacks &amp; flaws
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = newId("trait");
                ed.update((c) => c.traits.list.push({ id, name: "New Trait", automation: [] }));
                setOpenEntryId(id);
              }}
            >
              <Plus className="size-4" /> Add trait
            </Button>
          </div>
        </div>
        {drawbackPickerOpen && (
          <div className="mb-3">
            <DrawbackPicker ed={ed} onClose={() => setDrawbackPickerOpen(false)} />
          </div>
        )}
        {traitPickerOpen && (
          <div className="mb-3">
            <EntryPicker
              title="Trait compendium"
              rpc="search_trait_compendium"
              placeholder="Search traits — e.g. Reactionary, Magical Knack…"
              addedIds={addedTraitIds}
              onClose={() => setTraitPickerOpen(false)}
              renderMeta={(r) =>
                [r.category || r.type, r.requirements ? `req: ${String(r.requirements).replace(/<br>/g, " ")}` : null]
                  .filter(Boolean)
                  .map(String)
                  .join(" · ")
              }
              onAdd={(r) =>
                ed.update((c) => {
                  if (c.traits.list.some((t) => t.compendiumId === String(r.slug))) return;
                  c.traits.list.push({
                    id: newId("trait"),
                    name: String(r.name),
                    type: r.type ? String(r.type) : r.category ? String(r.category) : undefined,
                    compendiumId: String(r.slug),
                    description: r.description ? String(r.description).replace(/<br>/g, " ") : undefined,
                    automation: [],
                  });
                })
              }
              secondary={
                threeppSystems.length > 0
                  ? {
                      rpc: "search_threepp_trait_compendium",
                      label: "Third-party",
                      // Only enabled systems surface (rows tagged other/rune_magic never appear).
                      filter: (r) => typeof r.system === "string" && (threeppSystems as string[]).includes(r.system),
                      rowId: (r) => `3pp:${r.slug}`,
                      renderBadges: (r) => <ThreeppSystemBadge system={typeof r.system === "string" ? r.system : null} />,
                      renderMeta: (r) => [r.type, r.source].filter(Boolean).map(String).join(" · "),
                      onAdd: (r) =>
                        ed.update((c) => {
                          const cid = `3pp:${r.slug}`;
                          if (c.traits.list.some((t) => t.compendiumId === cid)) return;
                          c.traits.list.push({
                            id: newId("trait"),
                            name: String(r.name),
                            type: r.type ? String(r.type) : undefined,
                            compendiumId: cid,
                            description: r.description ? String(r.description).replace(/<br>/g, " ") : undefined,
                            automation: [],
                          });
                        }),
                    }
                  : undefined
              }
            />
          </div>
        )}
        {ed.draft.traits.list.length === 0 && (
          <p className="text-sm text-muted-foreground">No traits yet (most characters take two).</p>
        )}
        <div className="space-y-2">
          {ed.draft.traits.list.map((t, i) => {
            const setTrait = (mut: (e: (typeof ed.draft.traits.list)[number]) => void) =>
              ed.update((c) => {
                const e = c.traits.list[i];
                if (e) mut(e);
              });
            const hasChips = !!(t.type || t.automation.length);
            return (
              <EntryCard
                key={t.id}
                name={t.name}
                onNameChange={(v) => setTrait((e) => (e.name = v))}
                onRemove={() => ed.update((c) => c.traits.list.splice(i, 1))}
                removeLabel={`Remove ${t.name}`}
                defaultOpen={t.id === openEntryId}
                chips={
                  hasChips ? (
                    <>
                      {t.type && <StatChip value={t.type} />}
                      {effectChips(t.automation, skillLabelMap(ed.draft))}
                    </>
                  ) : undefined
                }
              >
                <TextField label="Type" value={t.type ?? ""} placeholder="Combat, Social, Faith, Drawback…" onChange={(v) => setTrait((e) => (e.type = v || undefined))} />
                <TextAreaField label="Description" value={t.description ?? ""} rows={3} onChange={(v) => setTrait((e) => (e.description = v || undefined))} />
                <AutomationEffectsEditor effects={t.automation} idPrefix="traitfx" skillTargets={skillTargetOptions(ed.draft)} onChange={(next) => setTrait((e) => (e.automation = next))} />
              </EntryCard>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProfileEditor({ ed }: { ed: EditorApi }) {
  const p = ed.draft.profile;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
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
