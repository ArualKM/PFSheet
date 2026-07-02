"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, RefreshCw } from "lucide-react";
import {
  POW_RECOVERY_METHODS,
  powInitiationAbility,
  type PathOfWarBlock,
  type PowManeuver,
  type PowRecoveryMethod,
} from "@pathforge/schema";
import { createClient } from "@/lib/supabase/client";
import {
  readPowProgressionMaxes,
  powRecoveryDefault,
  setActiveStance,
} from "@/lib/character/path-of-war-presets";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField, TextField, TextAreaField, SelectField } from "./fields";
import { AutomationEffectsEditor, skillTargetOptions } from "./automation-effects-editor";
import { EntryCard } from "./entry-card";
import { StatChip } from "./picker-shell";
import { ManeuverPicker } from "./maneuver-picker";
import { Button } from "@/components/ui/button";

/**
 * Path of War editor (3PP Phase 4 — docs/3PP_MASTER_PLAN.md): initiators (IL/DC math inputs) +
 * the maneuvers-known list with its readied/expended/granted/active-stance lifecycle. Lives in the
 * gated "Optional" section group; everything computes through `summary.pathOfWar` (the engine),
 * never locally. Maneuver rows are EntryCards (chips + expand-to-edit) with large tap targets for
 * the lifecycle toggles — the mobile-first standing rule.
 */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const RECOVERY_LABELS: Record<PowRecoveryMethod, string> = {
  warlord_gambit: "Gambit (Warlord)",
  warder_defensive_focus: "Defensive focus (Warder)",
  stalker_full_round: "Full-round action (Stalker)",
  standard_action: "Standard action (one maneuver)",
  custom: "Custom (see notes)",
};

const ABILITY_OPTIONS = (["str", "dex", "con", "int", "wis", "cha"] as const).map((k) => ({
  value: k,
  label: k.toUpperCase(),
}));

type PowClassRow = { slug: string; name: string | null; progression_json: unknown };
type DisciplineRow = { slug: string; name: string | null };

/** "broken_blade" → "Broken Blade" (fallback label when the discipline table doesn't know a key). */
const prettyKey = (k: string) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function PathOfWarEditor({ ed }: { ed: CharacterEditorApi }) {
  const supabase = useMemo(() => createClient(), []);
  const pow = ed.draft.pathOfWar;
  const summary = ed.computed.summary.pathOfWar;
  const [pickerOpen, setPickerOpen] = useState(false);
  // Just-added rows mount already-open for editing (manual add = full editor).
  const [openManeuverId, setOpenManeuverId] = useState<string | null>(null);
  const [openInitiatorId, setOpenInitiatorId] = useState<string | null>(null);
  const [presetSlug, setPresetSlug] = useState("");

  const ensure = (mut: (p: PathOfWarBlock) => void) =>
    ed.update((c) => {
      if (!c.pathOfWar) c.pathOfWar = { initiators: [], maneuvers: [] };
      mut(c.pathOfWar);
    });

  // The PoW class list (for initiator presets) + the 23 disciplines (for the disciplineKeys picker),
  // fetched once. Fails soft — manual entry never depends on the compendium being reachable.
  const [powClasses, setPowClasses] = useState<PowClassRow[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cls, disc] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("threepp_class_compendium")
          .select("slug,name,progression_json")
          .eq("system", "path_of_war")
          .order("name"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("pow_discipline_compendium").select("slug,name").order("name"),
      ]);
      if (cancelled) return;
      setPowClasses(((cls.data ?? []) as PowClassRow[]).filter((r) => !!r.name));
      setDisciplines(((disc.data ?? []) as DisciplineRow[]).filter((r) => !!r.name));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);
  const disciplineLabel = (key: string) => disciplines.find((d) => d.slug === key)?.name ?? prettyKey(key);

  // Per-initiator known/stance/readied/granted counts (engine attribution: initiatorId, else the
  // FIRST initiator) for the chips + the over-readied/over-granted warnings. Warn, never block.
  const firstInitiatorId = pow?.initiators[0]?.id;
  const countsByInit = new Map<string, { known: number; stances: number; readied: number; granted: number }>();
  for (const m of pow?.maneuvers ?? []) {
    const owner =
      m.initiatorId && pow!.initiators.some((i) => i.id === m.initiatorId) ? m.initiatorId : firstInitiatorId;
    if (!owner) continue;
    const c = countsByInit.get(owner) ?? { known: 0, stances: 0, readied: 0, granted: 0 };
    if (m.entryKind === "stance") c.stances++;
    else c.known++;
    if (m.readied) c.readied++;
    if (m.granted) c.granted++;
    countsByInit.set(owner, c);
  }
  const readiedWarnings: string[] = [];
  for (const init of pow?.initiators ?? []) {
    const n = countsByInit.get(init.id)?.readied ?? 0;
    if (init.maneuversReadiedMax != null && n > init.maneuversReadiedMax) {
      readiedWarnings.push(
        `${init.className || "Initiator"}: ${n} readied exceeds the max (${init.maneuversReadiedMax}).`,
      );
    }
    const g = countsByInit.get(init.id)?.granted ?? 0;
    if (init.maneuversGrantedMax != null && g > init.maneuversGrantedMax) {
      readiedWarnings.push(
        `${init.className || "Initiator"}: ${g} granted exceeds the max (${init.maneuversGrantedMax}).`,
      );
    }
  }

  const expendedCount = pow?.maneuvers.filter((m) => m.expended).length ?? 0;
  const readiedCount = pow?.maneuvers.filter((m) => m.readied).length ?? 0;

  // The initiator's class level: a matching identity.classes row wins (case-insensitive,
  // archetype parentheticals stripped) — PoW characters are commonly multiclass, and seeding from
  // totalLevel silently inflates IL + the progression maxes (Fighter 5/Warlord 3 must seed
  // Warlord 3, not 8). Fall back to totalLevel only when no class row matches.
  const classLevelFor = (className: string): number => {
    const norm = (s: string) =>
      s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const target = norm(className);
    const row = target ? ed.draft.identity.classes.find((c) => norm(c.name) === target) : undefined;
    const lvl = row?.level ?? ed.draft.identity.totalLevel;
    return Math.max(1, Math.floor(lvl || 1));
  };

  const addFromCompendium = (slug: string) => {
    const row = powClasses.find((r) => r.slug === slug);
    if (!row) return;
    const name = row.name ?? slug;
    const level = classLevelFor(name);
    const maxes = readPowProgressionMaxes(row.progression_json, Math.min(20, level));
    const id = newId("init");
    ensure((p) =>
      p.initiators.push({
        id,
        className: name,
        presetKey: `3pp:${slug}`,
        classLevel: level,
        initiationAbility: "", // blank = the per-class default (POW_INITIATION_DEFAULTS)
        recoveryMethod: powRecoveryDefault(name),
        disciplineKeys: [],
        ...(maxes.known != null ? { maneuversKnownMax: maxes.known } : {}),
        ...(maxes.readied != null ? { maneuversReadiedMax: maxes.readied } : {}),
        ...(maxes.granted != null ? { maneuversGrantedMax: maxes.granted } : {}),
        ...(maxes.stances != null ? { stancesKnownMax: maxes.stances } : {}),
      }),
    );
    setOpenInitiatorId(id);
  };

  const addManualInitiator = () => {
    const id = newId("init");
    ensure((p) =>
      p.initiators.push({
        id,
        className: "",
        classLevel: Math.max(1, Math.floor(ed.draft.identity.totalLevel || 1)),
        initiationAbility: "",
        recoveryMethod: "standard_action",
        disciplineKeys: [],
      }),
    );
    setOpenInitiatorId(id);
  };

  const addManualManeuver = () => {
    const id = newId("mvr");
    ensure((p) =>
      p.maneuvers.push({
        id,
        name: "New maneuver",
        level: 1,
        entryKind: "maneuver",
        readied: false,
        expended: false,
        granted: false,
        stanceActive: false,
        automation: [],
      }),
    );
    setOpenManeuverId(id);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Learn maneuvers and stances from the martial disciplines; ready a subset, expend them as you
        initiate, and recover per your class. Save DC = 10 + maneuver level + initiation modifier.
      </p>

      {/* Live IL/DC strip — straight from the engine's summary. */}
      {summary && summary.initiators.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-border p-3">
          {summary.initiators.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {i.className || "Initiator"}
              </span>
              <StatChip label="IL" value={i.initiatorLevel} tone="rune" />
              <StatChip label="max" value={`L${i.maxManeuverLevel}`} />
              <StatChip label="DC base" value={10 + i.initiationMod} tone="gold" />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            A maneuver&rsquo;s DC = its base above + the maneuver&rsquo;s level.
          </p>
        </div>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Initiators</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={presetSlug}
              onChange={(e) => setPresetSlug(e.target.value)}
              aria-label="Path of War class to add"
              className="h-11 max-w-[12rem] rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
            >
              <option value="">From compendium…</option>
              {powClasses.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!presetSlug}
              onClick={() => {
                addFromCompendium(presetSlug);
                setPresetSlug("");
              }}
            >
              <Plus className="size-4" /> Add
            </Button>
            <Button size="sm" variant="ghost" onClick={addManualInitiator}>
              <Plus className="size-4" /> Manual
            </Button>
          </div>
        </div>
        {(pow?.initiators.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            No initiators yet — pick your class from the compendium (seeds the known/readied/stance
            maxes at your level) or add one manually. With none, maneuvers still work at IL = ½
            character level (feat-based access).
          </p>
        )}
        <div className="space-y-2">
          {pow?.initiators.map((init, i) => {
            const setInit = (mut: (t: PathOfWarBlock["initiators"][number]) => void) =>
              ensure((p) => {
                const t = p.initiators[i];
                if (t) mut(t);
              });
            const sum = summary?.initiators.find((s) => s.id === init.id);
            const counts = countsByInit.get(init.id) ?? { known: 0, stances: 0, readied: 0, granted: 0 };
            const presetRow = init.presetKey?.startsWith("3pp:")
              ? powClasses.find((r) => r.slug === init.presetKey!.slice("3pp:".length))
              : undefined;
            return (
              <EntryCard
                key={init.id}
                name={init.className}
                nameLabel="Class"
                onNameChange={(v) => setInit((t) => (t.className = v))}
                onRemove={() => ensure((p) => p.initiators.splice(i, 1))}
                removeLabel={`Remove ${init.className || "initiator"}`}
                defaultOpen={init.id === openInitiatorId}
                chips={
                  <>
                    {sum && (
                      <>
                        <StatChip label="IL" value={sum.initiatorLevel} tone="rune" />
                        <StatChip label="max" value={`L${sum.maxManeuverLevel}`} />
                        <StatChip label="DC base" value={10 + sum.initiationMod} tone="gold" />
                      </>
                    )}
                    <StatChip
                      label="known"
                      value={init.maneuversKnownMax != null ? `${counts.known}/${init.maneuversKnownMax}` : counts.known}
                    />
                    <StatChip
                      label="readied"
                      value={
                        init.maneuversReadiedMax != null ? `${counts.readied}/${init.maneuversReadiedMax}` : counts.readied
                      }
                      tone={
                        init.maneuversReadiedMax != null && counts.readied > init.maneuversReadiedMax ? "poor" : "neutral"
                      }
                    />
                    {(init.maneuversGrantedMax != null || counts.granted > 0) && (
                      <StatChip
                        label="granted"
                        value={
                          init.maneuversGrantedMax != null ? `${counts.granted}/${init.maneuversGrantedMax}` : counts.granted
                        }
                        tone={
                          init.maneuversGrantedMax != null && counts.granted > init.maneuversGrantedMax ? "poor" : "neutral"
                        }
                      />
                    )}
                    <StatChip
                      label="stances"
                      value={init.stancesKnownMax != null ? `${counts.stances}/${init.stancesKnownMax}` : counts.stances}
                    />
                  </>
                }
              >
                <div className="flex flex-wrap items-end gap-2">
                  <NumberField
                    label="Class level"
                    value={init.classLevel}
                    min={0}
                    onChange={(v) => setInit((t) => (t.classLevel = Math.max(0, v)))}
                    className="w-24"
                  />
                  <SelectField
                    label="Initiation ability"
                    value={init.initiationAbility}
                    onChange={(v) => setInit((t) => (t.initiationAbility = v))}
                    options={[
                      { value: "", label: `Auto (${powInitiationAbility(init).toUpperCase()})` },
                      ...ABILITY_OPTIONS,
                    ]}
                    className="w-40"
                  />
                  <SelectField
                    label="Recovery method"
                    value={init.recoveryMethod}
                    onChange={(v) => setInit((t) => (t.recoveryMethod = v as PowRecoveryMethod))}
                    options={POW_RECOVERY_METHODS.map((m) => ({ value: m, label: RECOVERY_LABELS[m] }))}
                    className="min-w-[14rem]"
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <NumberField
                    label="Known max"
                    value={init.maneuversKnownMax ?? 0}
                    min={0}
                    onChange={(v) => setInit((t) => (t.maneuversKnownMax = v > 0 ? v : undefined))}
                    className="w-24"
                  />
                  <NumberField
                    label="Readied max"
                    value={init.maneuversReadiedMax ?? 0}
                    min={0}
                    onChange={(v) => setInit((t) => (t.maneuversReadiedMax = v > 0 ? v : undefined))}
                    className="w-24"
                  />
                  <NumberField
                    label="Granted max"
                    value={init.maneuversGrantedMax ?? 0}
                    min={0}
                    onChange={(v) => setInit((t) => (t.maneuversGrantedMax = v > 0 ? v : undefined))}
                    className="w-24"
                  />
                  <NumberField
                    label="Stances max"
                    value={init.stancesKnownMax ?? 0}
                    min={0}
                    onChange={(v) => setInit((t) => (t.stancesKnownMax = v > 0 ? v : undefined))}
                    className="w-24"
                  />
                  {presetRow && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const maxes = readPowProgressionMaxes(
                          presetRow.progression_json,
                          Math.max(1, Math.min(20, init.classLevel || 1)),
                        );
                        // Only overwrite maxes the table actually knows — a dash/missing level
                        // never clears a manually-set value.
                        setInit((t) => {
                          if (maxes.known != null) t.maneuversKnownMax = maxes.known;
                          if (maxes.readied != null) t.maneuversReadiedMax = maxes.readied;
                          if (maxes.granted != null) t.maneuversGrantedMax = maxes.granted;
                          if (maxes.stances != null) t.stancesKnownMax = maxes.stances;
                        });
                      }}
                    >
                      <RefreshCw className="size-4" /> Re-sync maxes
                    </Button>
                  )}
                </div>
                <TextField
                  label="Initiator level ƒx (override)"
                  value={init.initiatorLevelFormula ?? ""}
                  onChange={(v) => setInit((t) => (t.initiatorLevelFormula = v || undefined))}
                  inputClassName="font-mono"
                  placeholder="e.g. @{level.total}"
                  className="max-w-md"
                />
                <p className="-mt-2 text-[11px] text-muted-foreground">
                  Blank = class level + ½ all other levels, capped at character level.
                </p>
                <div className="space-y-1">
                  <span className="block text-[11px] text-muted-foreground">Disciplines</span>
                  <div className="flex flex-wrap items-center gap-1">
                    {init.disciplineKeys.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs text-foreground"
                      >
                        {disciplineLabel(k)}
                        <button
                          type="button"
                          aria-label={`Remove ${disciplineLabel(k)}`}
                          onClick={() => setInit((t) => (t.disciplineKeys = t.disciplineKeys.filter((d) => d !== k)))}
                          className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <select
                      value=""
                      aria-label="Add discipline"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) setInit((t) => t.disciplineKeys.push(v));
                      }}
                      className="h-11 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
                    >
                      <option value="">Add discipline…</option>
                      {disciplines
                        .filter((d) => !init.disciplineKeys.includes(d.slug))
                        .map((d) => (
                          <option key={d.slug} value={d.slug}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <TextAreaField
                  label="Notes"
                  value={init.notes ?? ""}
                  onChange={(v) => setInit((t) => (t.notes = v || undefined))}
                  rows={2}
                />
              </EntryCard>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            Maneuvers &amp; stances ({pow?.maneuvers.length ?? 0})
          </h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={pickerOpen ? "default" : "secondary"} onClick={() => setPickerOpen((o) => !o)}>
              <Search className="size-4" /> Browse
            </Button>
            <Button size="sm" variant="secondary" onClick={addManualManeuver}>
              <Plus className="size-4" /> Maneuver
            </Button>
          </div>
        </div>

        {/* Recovery quick actions — per-encounter housekeeping in one tap. */}
        {(pow?.maneuvers.length ?? 0) > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={expendedCount === 0} onClick={() => ensure((p) => {
              const first = p.maneuvers.find((m) => m.expended);
              if (first) first.expended = false;
            })}>
              Recover one
            </Button>
            <Button size="sm" variant="outline" disabled={expendedCount === 0} onClick={() => ensure((p) => {
              for (const m of p.maneuvers) m.expended = false;
            })}>
              Recover all / New encounter
            </Button>
            <Button size="sm" variant="ghost" disabled={readiedCount === 0} onClick={() => ensure((p) => {
              for (const m of p.maneuvers) {
                m.readied = false;
                m.expended = false;
              }
            })}>
              Un-ready all
            </Button>
            {expendedCount > 0 && (
              <span className="text-xs text-muted-foreground">{expendedCount} expended</span>
            )}
          </div>
        )}

        {readiedWarnings.map((w) => (
          <p key={w} className="mb-1 text-xs text-warning">
            {w}
          </p>
        ))}

        {pickerOpen && (
          <div className="mb-3">
            <ManeuverPicker ed={ed} onClose={() => setPickerOpen(false)} />
          </div>
        )}

        {(pow?.maneuvers.length ?? 0) === 0 && !pickerOpen && (
          <p className="text-sm text-muted-foreground">
            No maneuvers yet — Browse the compendium (758 maneuvers across 23 disciplines) or add
            one manually.
          </p>
        )}

        <div className="space-y-2">
          {pow?.maneuvers.map((m, i) => {
            const setM = (mut: (t: PowManeuver) => void) =>
              ensure((p) => {
                const t = p.maneuvers[i];
                if (t) mut(t);
              });
            const dc = summary?.maneuverDcs[m.id];
            const isStance = m.entryKind === "stance";
            return (
              <EntryCard
                key={m.id}
                name={m.name}
                nameLabel={isStance ? "Stance" : "Maneuver"}
                onNameChange={(v) => setM((t) => (t.name = v))}
                onRemove={() => ensure((p) => p.maneuvers.splice(i, 1))}
                removeLabel={`Remove ${m.name}`}
                defaultOpen={m.id === openManeuverId}
                chips={
                  <>
                    <StatChip label="lvl" value={m.level} tone="rune" />
                    {m.discipline && <StatChip value={m.discipline} />}
                    {m.maneuverType && <StatChip value={m.maneuverType} />}
                    {dc != null && <StatChip label="dc" value={dc} tone="gold" />}
                    {m.granted && <StatChip value="Granted" tone="gold" />}
                    {isStance ? (
                      <label className="flex min-h-11 items-center gap-1.5 text-xs text-foreground sm:min-h-0">
                        <input
                          type="checkbox"
                          checked={m.stanceActive}
                          onChange={(e) => ensure((p) => setActiveStance(p.maneuvers, m.id, e.target.checked))}
                          className="size-4 accent-[var(--pf-gold)]"
                        />
                        Active stance
                      </label>
                    ) : (
                      <>
                        <label className="flex min-h-11 items-center gap-1.5 text-xs text-foreground sm:min-h-0">
                          <input
                            type="checkbox"
                            checked={m.readied}
                            onChange={(e) =>
                              setM((t) => {
                                t.readied = e.target.checked;
                                if (!e.target.checked) t.expended = false;
                              })
                            }
                            className="size-4 accent-[var(--pf-gold)]"
                          />
                          Readied
                        </label>
                        {m.readied && (
                          <Button
                            size="sm"
                            variant={m.expended ? "outline" : "ghost"}
                            aria-pressed={m.expended}
                            onClick={() => setM((t) => (t.expended = !t.expended))}
                          >
                            {m.expended ? "Expended — recover" : "Expend"}
                          </Button>
                        )}
                      </>
                    )}
                  </>
                }
              >
                <div className="flex flex-wrap items-end gap-2">
                  <NumberField
                    label="Level"
                    value={m.level}
                    min={1}
                    max={9}
                    onChange={(v) => setM((t) => (t.level = Math.max(1, Math.min(9, v))))}
                    className="w-16"
                  />
                  <SelectField
                    label="Kind"
                    value={m.entryKind}
                    onChange={(v) =>
                      setM((t) => {
                        t.entryKind = v as PowManeuver["entryKind"];
                        // Clear the flags the new kind can't use (a stance is never readied; a
                        // strike is never an active stance — the engine ignores them anyway).
                        // Switching TO stance also clears stanceActive: a stale flag from a
                        // previous kind flip would silently self-reactivate the stance, bypassing
                        // the one-active enforcement — activation is always an explicit toggle.
                        if (v === "stance") {
                          t.readied = false;
                          t.expended = false;
                          t.granted = false;
                          t.stanceActive = false;
                        } else {
                          t.stanceActive = false;
                        }
                      })
                    }
                    options={[
                      { value: "maneuver", label: "Maneuver" },
                      { value: "stance", label: "Stance" },
                    ]}
                    className="w-32"
                  />
                  <TextField
                    label="Discipline"
                    value={m.discipline ?? ""}
                    onChange={(v) => setM((t) => (t.discipline = v || undefined))}
                    className="min-w-[9rem] flex-1"
                  />
                  <TextField
                    label="Type"
                    value={m.maneuverType ?? ""}
                    onChange={(v) => setM((t) => (t.maneuverType = v || undefined))}
                    placeholder="Strike / Boost / Counter…"
                    className="min-w-[9rem] flex-1"
                  />
                </div>
                {(pow?.initiators.length ?? 0) > 0 && (
                  <SelectField
                    label="Initiator"
                    value={m.initiatorId ?? ""}
                    onChange={(v) => setM((t) => (t.initiatorId = v || undefined))}
                    options={[
                      { value: "", label: "Auto (first initiator)" },
                      ...(pow?.initiators.map((it) => ({ value: it.id, label: it.className || "Initiator" })) ?? []),
                    ]}
                    className="max-w-xs"
                  />
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <TextField
                    label="Initiation action"
                    value={m.initiationAction ?? ""}
                    onChange={(v) => setM((t) => (t.initiationAction = v || undefined))}
                    className="min-w-[9rem] flex-1"
                  />
                  <TextField
                    label="Range"
                    value={m.range ?? ""}
                    onChange={(v) => setM((t) => (t.range = v || undefined))}
                    className="min-w-[8rem] flex-1"
                  />
                  <TextField
                    label="Target"
                    value={m.target ?? ""}
                    onChange={(v) => setM((t) => (t.target = v || undefined))}
                    className="min-w-[8rem] flex-1"
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <TextField
                    label="Duration"
                    value={m.duration ?? ""}
                    onChange={(v) => setM((t) => (t.duration = v || undefined))}
                    className="min-w-[8rem] flex-1"
                  />
                  <TextField
                    label="Saving throw"
                    value={m.savingThrow ?? ""}
                    onChange={(v) => setM((t) => (t.savingThrow = v || undefined))}
                    className="min-w-[8rem] flex-1"
                  />
                  <TextField
                    label="Save DC ƒx (override)"
                    value={m.saveDcFormula ?? ""}
                    onChange={(v) => setM((t) => (t.saveDcFormula = v || undefined))}
                    inputClassName="font-mono"
                    placeholder="10 + @{maneuverLevel} + @{initiationMod}"
                    className="min-w-[12rem] flex-1"
                  />
                  {/* S4 §266.3 — +2 competence to the DC while wielding the discipline's favored
                      weapon. Off by default; applies on top of the default OR a custom formula. */}
                  <label className="flex min-h-11 items-center gap-1.5 whitespace-nowrap pb-1 text-xs text-foreground sm:min-h-9">
                    <input
                      type="checkbox"
                      checked={m.favoredWeaponBonus === true}
                      onChange={(e) => setM((t) => (t.favoredWeaponBonus = e.target.checked || undefined))}
                      className="size-4 accent-[var(--pf-gold)]"
                    />
                    Favored weapon (+2 DC)
                  </label>
                </div>
                <TextField
                  label="Prerequisites"
                  value={m.prerequisites ?? ""}
                  onChange={(v) => setM((t) => (t.prerequisites = v || undefined))}
                />
                {!isStance && (
                  <label className="flex min-h-11 items-center gap-1.5 text-sm text-foreground sm:min-h-0">
                    <input
                      type="checkbox"
                      checked={m.granted}
                      onChange={(e) => setM((t) => (t.granted = e.target.checked))}
                      className="size-4 accent-[var(--pf-gold)]"
                    />
                    Granted (round-start draw — counted separately from readied)
                  </label>
                )}
                <TextAreaField
                  label="Description"
                  value={m.description ?? ""}
                  onChange={(v) => setM((t) => (t.description = v || undefined))}
                  rows={3}
                />
                <TextAreaField
                  label="Notes"
                  value={m.notes ?? ""}
                  onChange={(v) => setM((t) => (t.notes = v || undefined))}
                  rows={2}
                />
                {isStance ? (
                  <>
                    <AutomationEffectsEditor
                      effects={m.automation}
                      onChange={(next) => setM((t) => (t.automation = next))}
                      idPrefix="pow"
                      skillTargets={skillTargetOptions(ed.draft)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Stance effects apply to your totals only while this stance is active.
                    </p>
                  </>
                ) : (
                  <p className="border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                    Boosts, strikes, and counters apply on use, not passively — automation is
                    available on stances only.
                  </p>
                )}
              </EntryCard>
            );
          })}
        </div>
      </section>

      <TextAreaField
        label="Path of War notes"
        value={pow?.notes ?? ""}
        onChange={(v) => ensure((p) => (p.notes = v || undefined))}
        rows={2}
      />
    </div>
  );
}
