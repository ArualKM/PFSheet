"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  Loader2,
  Cloud,
  CloudOff,
  Undo2,
  Plus,
  Trash2,
  ExternalLink,
  Sigma,
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
  Calculator,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import {
  ABILITY_KEYS,
  OPTIONAL_RULE_MODULES,
  isRuleEnabled,
  recomputeClassDerived,
  type PathForgeCharacterV1,
  type AbilityKey,
  type ModifierEntry,
  type OptionalRuleModule,
  type RuleModuleGroup,
  type PointBuyState,
} from "@pathforge/schema";
import { composeAbilityScore, pointBuyCost, pointBuySpent } from "@pathforge/rules-pf1e";
import type { ComputedValue } from "@pathforge/rules-pf1e";
import { useCharacterEditor, type SaveStatus } from "./use-character-editor";
import { ConflictResolver } from "./conflict-resolver";
import { NumberField, TextField, TextAreaField } from "./fields";
import { BuffCenter } from "./buff-center";
import { CombatEditor } from "./combat-editor";
import { InventoryEditor } from "./inventory-editor";
import { SpellcastingEditor } from "./spellcasting-editor";
import { ClassPresetPicker } from "./class-preset-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatModifier } from "@/lib/utils";
import { COMMON_LANGUAGES, languageBudget } from "@/lib/character/languages";

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

  // §6 grouped sections (left "Sheet Sections" sidebar). The sub-editors are
  // unchanged; this only reorganizes navigation. Optional rulesets (Sanity,
  // Psionics, Hero Points, 3pp, …) get their toggles under Settings in a later pass.
  const sections: SheetSection[] = [
    {
      key: "core",
      label: "Core",
      icon: User,
      items: [
        { key: "details", label: "Character details", render: () => <IdentityEditor ed={ed} /> },
        { key: "abilities", label: "Ability scores", render: () => <AbilitiesEditor ed={ed} advanced={advanced} /> },
        { key: "languages", label: "Languages", render: () => <LanguagesEditor ed={ed} /> },
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
      items: [{ key: "combat", label: "Attacks & speed", render: () => <CombatEditor ed={ed} /> }],
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
    <div className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)] lg:grid-cols-[190px_minmax(0,1fr)_300px]">
      {/* Section rail — md+ only (the < md picker is a bottom sheet). Keeps the
          tablist + roving-tabindex a11y intact. */}
      <div className="hidden md:sticky md:top-20 md:block md:self-start">
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Sheet sections"
          className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-1"
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
                  active ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="whitespace-nowrap">{s.label}</span>
              </button>
            );
          })}
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

        {/* Mobile/tablet live-preview stat bar (< lg) — sticky, expands inline. */}
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

      <aside className="hidden h-fit lg:sticky lg:top-20 lg:block">
        <LivePreview ed={ed} characterId={characterId} advanced={advanced} />
      </aside>
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

/** Mobile/tablet (< lg) live-preview: a sticky collapsed stat bar that expands inline
 *  to the full LivePreview — the "edit a field, watch the math" loop at the table. */
function LivePreviewBar({ ed, characterId, advanced }: { ed: EditorApi; characterId: string; advanced: boolean }) {
  const [open, setOpen] = useState(false);
  const s = ed.computed.summary;
  return (
    <div className="sticky top-20 z-20 mb-3 rounded-lg border border-border bg-surface/95 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-live-preview"
        className="tap-target flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs"
      >
        <span className="tnum font-semibold text-foreground">
          HP {s.hp.current}/{s.hp.max}
        </span>
        <span className="tnum text-muted-foreground">AC {s.ac}</span>
        <span className="tnum text-muted-foreground">
          F {formatModifier(s.fortitude)} · R {formatModifier(s.reflex)} · W {formatModifier(s.will)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-rune">
          {open ? "Hide" : "Stats"}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {/* Always render the region so aria-controls resolves; only mount the (heavier)
          preview when expanded. */}
      <div id="mobile-live-preview" hidden={!open} className="border-t border-border p-2">
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

function SettingsEditor({ ed }: { ed: EditorApi }) {
  const toggleRule = (mod: OptionalRuleModule, on: boolean) =>
    ed.update((c) => {
      if (mod.variantKey) {
        c.rules.variants[mod.variantKey] = on || undefined;
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

      {RULE_GROUPS.map((g) => (
        <section key={g.key}>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPTIONAL_RULE_MODULES.filter((m) => m.group === g.key).map((mod) => {
              const on = isRuleEnabled(ed.draft, mod);
              return (
                <label
                  key={mod.key}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
                    on ? "border-gold/40 bg-gold/5" : "border-border hover:border-border/80",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => toggleRule(mod, e.target.checked)}
                    aria-label={mod.name}
                    className="mt-0.5 size-4 accent-[var(--pf-gold)]"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{mod.name}</span>
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
        Theme and privacy/share settings live on the character overview for now.
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

function IdentityEditor({ ed }: { ed: EditorApi }) {
  const id = ed.draft.identity;
  const prog = ed.draft.progression;
  const [showCatalog, setShowCatalog] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const hasPresetClass = id.classes.some((c) => c.presetKey);
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
        <TextField label="Size" value={id.size ?? ""} onChange={(v) => ed.update((c) => (c.identity.size = v || undefined))} placeholder="Medium" />
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
                  c.identity.totalLevel = c.identity.classes.reduce((s, cl) => s + cl.level, 0);
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
            <div key={cl.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
              <TextField
                label="Class"
                value={cl.name}
                onChange={(v) =>
                  ed.update((c) => {
                    const target = c.identity.classes[i];
                    if (target) target.name = v;
                  })
                }
                className="flex-1"
              />
              <TextField
                label="Archetype"
                value={cl.archetype ?? ""}
                onChange={(v) =>
                  ed.update((c) => {
                    const target = c.identity.classes[i];
                    if (target) target.archetype = v || undefined;
                  })
                }
                className="w-32"
              />
              <NumberField
                label="Level"
                value={cl.level}
                min={0}
                onChange={(v) =>
                  ed.update((c) => {
                    const target = c.identity.classes[i];
                    if (target) target.level = v;
                    c.identity.totalLevel = c.identity.classes.reduce((s, x) => s + x.level, 0);
                    // Keep preset-derived BAB/saves/caster level in sync when leveling.
                    if (target?.presetKey) recomputeClassDerived(c, { hpMethod: "manual" });
                  })
                }
                className="w-20"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove class"
                onClick={() =>
                  ed.update((c) => {
                    c.identity.classes.splice(i, 1);
                    c.identity.totalLevel = c.identity.classes.reduce((s, x) => s + x.level, 0);
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
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
                  className="text-muted-foreground hover:text-danger"
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
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
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
  const [cond, setCond] = useState("");

  const addCondition = () => {
    const v = cond.trim();
    if (!v) return;
    ed.update((c) => {
      if (!c.health.conditions.includes(v)) c.health.conditions.push(v);
    });
    setCond("");
  };

  return (
    <div className="space-y-6">
      <div className="grid max-w-xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Max HP" value={maxHp} min={0} onChange={(v) => ed.update((c) => (c.health.maxHp = v))} />
        <NumberField label="Current HP" value={h.currentHp} onChange={(v) => ed.update((c) => (c.health.currentHp = v))} />
        <NumberField label="Temp HP" value={h.tempHp} min={0} onChange={(v) => ed.update((c) => (c.health.tempHp = v))} />
        <NumberField label="Nonlethal" value={h.nonlethalDamage} min={0} onChange={(v) => ed.update((c) => (c.health.nonlethalDamage = v))} />
      </div>

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
  { value: "craft", label: "Craft", ability: "int", trainedOnly: false },
  { value: "perform", label: "Perform", ability: "cha", trainedOnly: false },
  { value: "profession", label: "Profession", ability: "wis", trainedOnly: true },
] as const;
const SKILL_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

function skillDisplayLabel(s: { label: string; specialty?: string }): string {
  return s.specialty ? `${s.label} (${s.specialty})` : s.label;
}

function SkillsEditor({ ed }: { ed: EditorApi }) {
  const skills = ed.draft.skills.list;
  const totalLevel = ed.draft.identity.totalLevel ?? 0;
  const ranksSpent = skills.reduce((sum, s) => sum + (s.ranks ?? 0), 0);

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
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-surface-raised text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Skill</th>
              <th className="px-2 py-2 font-semibold">Ability</th>
              <th className="px-2 py-2 font-semibold">Class</th>
              <th className="w-16 px-2 py-2 font-semibold">Ranks</th>
              <th className="w-16 px-2 py-2 font-semibold">Misc</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
              <th className="w-8 px-2 py-2" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {skills.map((s, i) => {
              const total = ed.computed.skills[s.key]?.value ?? 0;
              const over = s.ranks > totalLevel;
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
            <div key={f.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Portrait URL" value={p.portraitUrl ?? ""} onChange={(v) => ed.update((c) => (c.profile.portraitUrl = v || undefined))} />
        <TextField label="Token URL" value={p.tokenUrl ?? ""} onChange={(v) => ed.update((c) => (c.profile.tokenUrl = v || undefined))} />
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
