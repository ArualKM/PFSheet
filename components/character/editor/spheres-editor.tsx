"use client";

import { useState, useRef, type ReactNode } from "react";
import { Plus, X, CircleAlert, Star, ChevronDown, Trash2 } from "lucide-react";
import { Sparkles, Swords, Target, Zap, ScrollText } from "@/components/ui/game-icons";
import {
  isModuleKeyEnabled,
  talentSystem,
  grantSystem,
  systemTradition,
  setSystemTraditionFields,
  SPHERE_CASTER_TYPES,
  type SpheresBlock,
  type SphereTalentRef,
  type SphereSystem,
  type SphereGrantTarget,
} from "@pathforge/schema";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField, TextField, SelectField } from "./fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { groupTalentsByCategory } from "@/lib/character/sphere-talents";
import { SpherePicker, type SpherePickerMode } from "./sphere-picker";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
      {onClick ? (
        <button type="button" onClick={onClick} title={title} className="min-w-0 truncate text-left hover:underline">
          {label}
          {note ? <span className="opacity-90"> → {note}</span> : null}
        </button>
      ) : (
        <span className="min-w-0 truncate">
          {label}
          {note ? <span className="opacity-90"> → {note}</span> : null}
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="-mr-1 shrink-0 rounded-full p-1 text-muted-foreground hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** A small "add by name" inline input — manual entry alongside the compendium Browse, for the chip lists. */
function AddByName({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [v, setV] = useState("");
  // A synchronous ref mirrors the value so commit() is race-free: after Enter clears it, a following
  // blur reads the empty ref (not a stale closure of `v`), so it never double-adds.
  const valueRef = useRef("");
  const commit = () => {
    const name = valueRef.current.trim();
    valueRef.current = "";
    setV("");
    if (name) onAdd(name);
  };
  return (
    <input
      value={v}
      onChange={(e) => {
        valueRef.current = e.target.value;
        setV(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
      placeholder={placeholder}
      className="h-11 w-full rounded-full border border-dashed border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground sm:h-7 sm:w-36"
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

export function SpheresEditor({ ed }: { ed: CharacterEditorApi }) {
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
                          aria-label={`${tal.talentName || "Talent"} is a bonus talent — make it a normal talent`}
                          title="Make a normal talent"
                          onClick={() => ensure((s) => { const t = s.talents[i]; if (t) t.bonus = undefined; })}
                          className="-ml-0.5 shrink-0 rounded-full p-0.5 text-rune"
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
                {(() => {
                  const chip = ({ t: tal, i }: { t: SphereTalentRef; i: number }) => (
                    <SphereChip
                      key={tal.id}
                      label={tal.talentName || "(unnamed)"}
                      tone="border-border bg-surface-raised text-foreground"
                      leading={
                        <button
                          type="button"
                          aria-label={`Mark ${tal.talentName || "talent"} as a bonus (free) talent`}
                          title="Mark as a bonus (free) talent"
                          onClick={() => ensure((s) => { const t = s.talents[i]; if (t) t.bonus = true; })}
                          className="-ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-rune"
                        >
                          <Star className="size-3" />
                        </button>
                      }
                      onRemove={() => ensure((s) => { clearTargetsTo(s, tal.id); s.talents.splice(i, 1); })}
                    />
                  );
                  const tiers = groupTalentsByCategory(
                    regularTalentsOf.map((p) => ({ name: p.t.talentName || "", category: p.t.category, pair: p })),
                  );
                  const addByName = (
                    <AddByName
                      placeholder="+ talent"
                      onAdd={(name) =>
                        ensure((s) => s.talents.push({ id: newId("tal"), sphereName: "", talentName: name, system: d.sys }))
                      }
                    />
                  );
                  if (regularTalentsOf.length === 0) {
                    return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">None yet.</span>
                        {addByName}
                      </div>
                    );
                  }
                  // Only show tier subheaders when the talents span more than one tier; otherwise flat.
                  if (tiers.length <= 1) {
                    return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {regularTalentsOf.map(chip)}
                        {addByName}
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {tiers.map((grp) => (
                        <div key={grp.tier}>
                          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {grp.tier}
                            <span className="rounded-full bg-surface-raised px-1.5 text-[10px] font-medium text-muted-foreground">
                              {grp.talents.length}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">{grp.talents.map((g) => chip(g.pair))}</div>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center gap-1.5">{addByName}</div>
                    </div>
                  );
                })()}
              </SphereSubsection>
            </div>
          </section>
        );
      })}
    </div>
  );
}
