"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, Plus, Search, RefreshCw, Trash2 } from "lucide-react";
import {
  KNOWN_CHAKRA_SLOTS,
  akashicVeilweavingDefault,
  isModuleKeyEnabled,
  type AbilityKey,
  type AkashicBlock,
  type AkashicVeilRef,
  type ShapedVeil,
} from "@pathforge/schema";
import type { AkashicShapedSummary } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import { classLevelFor } from "@/lib/character/path-of-war-presets";
import { readAkashicProgressionMaxes, parseBindUnlocks, parseCapacityBonus } from "@/lib/character/akashic-presets";
import { veilMatchesSlot } from "@/lib/character/akashic-veils";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField, TextField, TextAreaField, SelectField } from "./fields";
import { AutomationEffectsEditor, skillTargetOptions } from "./automation-effects-editor";
import { EntryCard } from "./entry-card";
import { StatChip } from "./picker-shell";
import { VeilPicker } from "./veil-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Akashic editor (3PP Phase 5 — docs/3PP_MASTER_PLAN.md): veilweaving classes (essence/veils-shaped
 * maxes + unlocked chakra binds), the veils-known list, and the shaped-for-the-day loadout with its
 * invested-not-spent essence pool. Lives in the gated "Optional" section group; everything computes
 * through `summary.akashic` (the engine), never locally. Shaped rows are a vertical slot LIST (a
 * 2-col grid on desktop, same component) with large tap targets — the mobile-first standing rule.
 */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const ABILITY_OPTIONS = (["str", "dex", "con", "int", "wis", "cha"] as const).map((k) => ({
  value: k,
  label: k.toUpperCase(),
}));

/** Display casing for the lowercase canonical chakra slots ("hands" → "Hands"). */
const KNOWN_SLOT_SUGGESTIONS = KNOWN_CHAKRA_SLOTS.map((s) => s.charAt(0).toUpperCase() + s.slice(1));

type AkashicClassRow = { slug: string; name: string | null; progression_json: unknown };

export function AkashicEditor({ ed }: { ed: CharacterEditorApi }) {
  const supabase = useMemo(() => createClient(), []);
  const ak = ed.draft.akashic;
  const summary = ed.computed.summary.akashic;
  const moduleOn = isModuleKeyEnabled(ed.draft, "akashic");
  const tempEssenceLabelId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Just-added rows mount already-open for editing (manual add = full editor).
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [openVeilId, setOpenVeilId] = useState<string | null>(null);
  const [openShapedId, setOpenShapedId] = useState<string | null>(null);
  const [presetSlug, setPresetSlug] = useState("");

  const ensure = (mut: (a: AkashicBlock) => void) =>
    ed.update((c) => {
      if (!c.akashic) c.akashic = { classes: [], veilsKnown: [], shaped: [], otherReceptacles: [], temporaryEssence: 0 };
      mut(c.akashic);
    });

  // The akashic class list (for veilweaver presets), fetched once. Fails soft — manual entry never
  // depends on the compendium being reachable.
  const [akashicClasses, setAkashicClasses] = useState<AkashicClassRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("threepp_class_compendium")
        .select("slug,name,progression_json")
        .eq("system", "akashic")
        .order("name");
      if (cancelled) return;
      setAkashicClasses(((data ?? []) as AkashicClassRow[]).filter((r) => !!r.name));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Per-class shaped counts (engine attribution: classId, else the FIRST class) for the chips +
  // the over-shaped warnings. Warn, never block.
  const firstClassId = ak?.classes[0]?.id;
  const shapedByClass = new Map<string, number>();
  for (const s of ak?.shaped ?? []) {
    const owner = s.classId && ak!.classes.some((c) => c.id === s.classId) ? s.classId : firstClassId;
    if (!owner) continue;
    shapedByClass.set(owner, (shapedByClass.get(owner) ?? 0) + 1);
  }
  const shapedWarnings: string[] = [];
  for (const cls of ak?.classes ?? []) {
    const n = shapedByClass.get(cls.id) ?? 0;
    if (cls.veilsShapedMax != null && n > cls.veilsShapedMax) {
      shapedWarnings.push(`${cls.className || "Veilweaver"}: ${n} veils shaped exceeds the max (${cls.veilsShapedMax}).`);
    }
  }

  const skillTargets = skillTargetOptions(ed.draft);

  const addFromCompendium = (slug: string) => {
    const row = akashicClasses.find((r) => r.slug === slug);
    if (!row) return;
    const name = row.name ?? slug;
    // A matching identity.classes row wins over totalLevel — akashic characters are commonly
    // multiclass, and seeding from totalLevel silently inflates the progression maxes.
    const level = classLevelFor(ed.draft.identity, name);
    const lvl = Math.min(20, level);
    const maxes = readAkashicProgressionMaxes(row.progression_json, lvl);
    const binds = parseBindUnlocks(row.progression_json, lvl);
    const capBonus = parseCapacityBonus(row.progression_json, lvl);
    const id = newId("akcls");
    ensure((a) =>
      a.classes.push({
        id,
        className: name,
        classLevel: level,
        veilweavingAbility: akashicVeilweavingDefault(name),
        ...(maxes.essence != null ? { essenceMax: maxes.essence } : {}),
        ...(maxes.veils != null ? { veilsShapedMax: maxes.veils } : {}),
        ...(capBonus > 0 ? { capacityBonus: capBonus } : {}),
        unlockedBinds: binds,
        compendiumId: `3pp:${slug}`,
      }),
    );
    setOpenClassId(id);
  };

  const addManualClass = () => {
    const id = newId("akcls");
    ensure((a) =>
      a.classes.push({
        id,
        className: "",
        classLevel: Math.max(1, Math.floor(ed.draft.identity.totalLevel || 1)),
        veilweavingAbility: "cha",
        unlockedBinds: [],
      }),
    );
    setOpenClassId(id);
  };

  const addCustomVeil = () => {
    const id = newId("veil");
    ensure((a) => a.veilsKnown.push({ id, name: "New veil", slots: [], custom: true }));
    setOpenVeilId(id);
  };

  const shapeVeil = (veil: AkashicVeilRef) => {
    const id = newId("shape");
    ensure((a) =>
      a.shaped.push({
        id,
        veilId: veil.id,
        slot: veil.slots[0] ?? "",
        essenceInvested: 0,
        bound: false,
        enabled: true,
        automation: [],
      }),
    );
    setOpenShapedId(id);
  };

  const addShaped = () => {
    const known = ak?.veilsKnown ?? [];
    const target = known.find((v) => !ak?.shaped.some((s) => s.veilId === v.id)) ?? known[0];
    if (target) shapeVeil(target);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Shape veils from your veils known into chakra slots each day, then invest essence into them —
        essence is invested, not spent, and can be reallocated. A veil&rsquo;s save DC = 10 + essence
        invested + your veilweaving ability modifier.
      </p>

      {/* Live essence pool — straight from the engine's summary. */}
      {summary ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">Essence pool</span>
            <StatChip label="total" value={summary.essence.total} tone="rune" />
            <StatChip label="invested" value={summary.essence.invested} />
            <StatChip
              label="available"
              value={summary.essence.available}
              tone={summary.essence.available < 0 ? "poor" : "good"}
            />
            <StatChip label="capacity" value={`≤${summary.essence.capacityCap}/receptacle`} tone="gold" />
          </div>
          <div role="group" aria-labelledby={tempEssenceLabelId} className="flex flex-wrap items-center gap-1.5">
            <span id={tempEssenceLabelId} className="text-xs text-muted-foreground">
              Temporary essence
            </span>
            <Button
              size="sm"
              variant="outline"
              aria-label="Decrease temporary essence"
              disabled={(ak?.temporaryEssence ?? 0) <= 0}
              onClick={() => ensure((a) => (a.temporaryEssence = Math.max(0, a.temporaryEssence - 1)))}
            >
              −
            </Button>
            <span className="tnum text-base font-semibold text-foreground">{ak?.temporaryEssence ?? 0}</span>
            <Button
              size="sm"
              variant="outline"
              aria-label="Increase temporary essence"
              onClick={() => ensure((a) => (a.temporaryEssence = a.temporaryEssence + 1))}
            >
              +
            </Button>
          </div>
        </div>
      ) : !moduleOn ? (
        // Data-without-module state only — with the module ON and no block yet (the first-run
        // state), telling the user to "enable the module" they just enabled is a contradiction;
        // the pool strip simply appears with the first edit (the PathOfWarEditor pattern).
        <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
          Enable the Akashic Mysteries module in Settings to compute the essence pool and save DCs.
        </p>
      ) : null}

      {(summary?.warnings ?? []).map((w) => (
        <p key={w} className="text-xs text-warning">
          {w}
        </p>
      ))}
      {shapedWarnings.map((w) => (
        <p key={w} className="text-xs text-warning">
          {w}
        </p>
      ))}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Veilweaving classes</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={presetSlug}
              onChange={(e) => setPresetSlug(e.target.value)}
              aria-label="Akashic class to add"
              className="h-11 max-w-[12rem] rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
            >
              <option value="">From compendium…</option>
              {akashicClasses.map((r) => (
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
            <Button size="sm" variant="ghost" onClick={addManualClass}>
              <Plus className="size-4" /> Manual
            </Button>
          </div>
        </div>
        {(ak?.classes.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            No veilweaving classes yet — pick yours from the compendium (seeds the essence/veils
            maxes and unlocked binds at your level) or add one manually.
          </p>
        )}
        <div className="space-y-2">
          {ak?.classes.map((cls, i) => {
            const setCls = (mut: (t: AkashicBlock["classes"][number]) => void) =>
              ensure((a) => {
                const t = a.classes[i];
                if (t) mut(t);
              });
            const sum = summary?.classes.find((s) => s.id === cls.id);
            const shapedCount = shapedByClass.get(cls.id) ?? 0;
            const presetRow = cls.compendiumId?.startsWith("3pp:")
              ? akashicClasses.find((r) => r.slug === cls.compendiumId!.slice("3pp:".length))
              : undefined;
            return (
              <EntryCard
                key={cls.id}
                name={cls.className}
                nameLabel="Class"
                onNameChange={(v) => setCls((t) => (t.className = v))}
                onRemove={() =>
                  // Removing a class also clears its shaped-veil attributions (mirrors the veil
                  // removal cascade) — a dangling classId would silently re-point each veil's DC
                  // at the FIRST class while its "Shaped by" select rendered blank.
                  ensure((a) => {
                    const removed = a.classes[i];
                    a.classes.splice(i, 1);
                    if (removed) {
                      for (const s of a.shaped) {
                        if (s.classId === removed.id) s.classId = undefined;
                      }
                    }
                  })
                }
                removeLabel={`Remove ${cls.className || "veilweaving class"}`}
                defaultOpen={cls.id === openClassId}
                chips={
                  <>
                    {sum && <StatChip label="DC base" value={10 + sum.veilweavingMod} tone="gold" />}
                    <StatChip label="essence" value={cls.essenceMax ?? "—"} tone="rune" />
                    <StatChip
                      label="veils"
                      value={cls.veilsShapedMax != null ? `${shapedCount}/${cls.veilsShapedMax}` : shapedCount}
                      tone={cls.veilsShapedMax != null && shapedCount > cls.veilsShapedMax ? "poor" : "neutral"}
                    />
                    <StatChip label="binds" value={cls.unlockedBinds.length} />
                  </>
                }
              >
                <div className="flex flex-wrap items-end gap-2">
                  <NumberField
                    label="Class level"
                    value={cls.classLevel}
                    min={0}
                    onChange={(v) => setCls((t) => (t.classLevel = Math.max(0, v)))}
                    className="w-24"
                  />
                  <SelectField
                    label="Veilweaving ability"
                    value={cls.veilweavingAbility}
                    onChange={(v) => setCls((t) => (t.veilweavingAbility = v as AbilityKey))}
                    options={ABILITY_OPTIONS}
                    className="w-28"
                  />
                  <NumberField
                    label="Essence max"
                    value={cls.essenceMax ?? 0}
                    min={0}
                    onChange={(v) => setCls((t) => (t.essenceMax = v > 0 ? v : undefined))}
                    className="w-24"
                  />
                  <NumberField
                    label="Veils shaped max"
                    value={cls.veilsShapedMax ?? 0}
                    min={0}
                    onChange={(v) => setCls((t) => (t.veilsShapedMax = v > 0 ? v : undefined))}
                    className="w-28"
                  />
                  <NumberField
                    label="Capacity bonus"
                    value={cls.capacityBonus ?? 0}
                    min={0}
                    onChange={(v) => setCls((t) => (t.capacityBonus = v > 0 ? v : undefined))}
                    className="w-28"
                  />
                  {presetRow && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const lvl = Math.max(1, Math.min(20, cls.classLevel || 1));
                        const maxes = readAkashicProgressionMaxes(presetRow.progression_json, lvl);
                        const binds = parseBindUnlocks(presetRow.progression_json, lvl);
                        const capBonus = parseCapacityBonus(presetRow.progression_json, lvl);
                        // Only overwrite what the table actually knows — a dash/missing level never
                        // clears a manually-set value, and manual binds not in the progression are
                        // kept (appended after the parsed unlock order).
                        setCls((t) => {
                          if (maxes.essence != null) t.essenceMax = maxes.essence;
                          if (maxes.veils != null) t.veilsShapedMax = maxes.veils;
                          if (capBonus > 0) t.capacityBonus = capBonus;
                          if (binds.length > 0) {
                            const merged = [...binds];
                            for (const b of t.unlockedBinds) {
                              if (!merged.some((x) => x.toLowerCase() === b.toLowerCase())) merged.push(b);
                            }
                            t.unlockedBinds = merged;
                          }
                        });
                      }}
                    >
                      <RefreshCw className="size-4" /> Re-sync
                    </Button>
                  )}
                </div>
                <SlotChipList
                  label="Unlocked chakra binds"
                  values={cls.unlockedBinds}
                  suggestions={KNOWN_SLOT_SUGGESTIONS}
                  onAdd={(v) => setCls((t) => t.unlockedBinds.push(v))}
                  onRemove={(v) => setCls((t) => (t.unlockedBinds = t.unlockedBinds.filter((b) => b !== v)))}
                />
                <TextAreaField
                  label="Notes"
                  value={cls.notes ?? ""}
                  onChange={(v) => setCls((t) => (t.notes = v || undefined))}
                  rows={2}
                />
              </EntryCard>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Veils known ({ak?.veilsKnown.length ?? 0})</h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant={pickerOpen ? "default" : "secondary"} onClick={() => setPickerOpen((o) => !o)}>
              <Search className="size-4" /> Browse
            </Button>
            <Button size="sm" variant="secondary" onClick={addCustomVeil}>
              <Plus className="size-4" /> Veil
            </Button>
          </div>
        </div>

        {pickerOpen && (
          <div className="mb-3">
            <VeilPicker ed={ed} onClose={() => setPickerOpen(false)} />
          </div>
        )}

        {(ak?.veilsKnown.length ?? 0) === 0 && !pickerOpen && (
          <p className="text-sm text-muted-foreground">
            No veils yet — Browse the compendium (1,332 veils across 15 class lists) or add one
            manually.
          </p>
        )}

        <div className="space-y-2">
          {ak?.veilsKnown.map((v, i) => {
            const setVeil = (mut: (t: AkashicVeilRef) => void) =>
              ensure((a) => {
                const t = a.veilsKnown[i];
                if (t) mut(t);
              });
            const isShaped = ak.shaped.some((s) => s.veilId === v.id);
            const metadataOnly = !!v.compendiumId && !v.effect?.trim();
            return (
              <EntryCard
                key={v.id}
                name={v.name}
                nameLabel="Veil"
                onNameChange={(val) => setVeil((t) => (t.name = val))}
                onRemove={() =>
                  // Removing a known veil also unshapes it — a shaped row pointing at a deleted
                  // ref would linger as "Unnamed veil".
                  ensure((a) => {
                    a.shaped = a.shaped.filter((s) => s.veilId !== v.id);
                    a.veilsKnown.splice(i, 1);
                  })
                }
                removeLabel={`Remove ${v.name || "veil"}`}
                defaultOpen={v.id === openVeilId}
                chips={
                  <>
                    {v.slots.map((s) => (
                      <StatChip key={s} value={s} />
                    ))}
                    {v.bindEffect?.trim() && <StatChip value="Bind" tone="gold" />}
                    {v.custom && <StatChip value="Custom" />}
                    {isShaped ? (
                      <StatChip value="Shaped" tone="rune" />
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => shapeVeil(v)}>
                        Shape
                      </Button>
                    )}
                  </>
                }
              >
                <SlotChipList
                  label="Chakra slots"
                  values={v.slots}
                  suggestions={KNOWN_SLOT_SUGGESTIONS}
                  onAdd={(val) => setVeil((t) => t.slots.push(val))}
                  onRemove={(val) => setVeil((t) => (t.slots = t.slots.filter((s) => s !== val)))}
                />
                <TextField
                  label="Descriptors"
                  value={v.descriptors ?? ""}
                  onChange={(val) => setVeil((t) => (t.descriptors = val || undefined))}
                  className="max-w-md"
                />
                <TextAreaField
                  label="Effect"
                  value={v.effect ?? ""}
                  onChange={(val) => setVeil((t) => (t.effect = val || undefined))}
                  rows={4}
                />
                {metadataOnly && (
                  <p className="-mt-2 text-[11px] italic text-muted-foreground">
                    Rules text not included — see {v.source?.trim() || "the source book"}.
                  </p>
                )}
                <TextAreaField
                  label="Bind effect"
                  value={v.bindEffect ?? ""}
                  onChange={(val) => setVeil((t) => (t.bindEffect = val || undefined))}
                  rows={3}
                />
                <TextAreaField
                  label="Notes"
                  value={v.notes ?? ""}
                  onChange={(val) => setVeil((t) => (t.notes = val || undefined))}
                  rows={2}
                />
              </EntryCard>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Shaped today ({ak?.shaped.length ?? 0})</h3>
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" disabled={(ak?.veilsKnown.length ?? 0) === 0} onClick={addShaped}>
              <Plus className="size-4" /> Shape veil
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={(ak?.shaped.length ?? 0) === 0}
              onClick={() => ensure((a) => (a.shaped = []))}
            >
              Unshape all
            </Button>
          </div>
        </div>
        {(ak?.shaped.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing shaped — shape veils from your veils known for the day, then invest essence.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {ak?.shaped.map((s, i) => (
            <ShapedVeilCard
              key={s.id}
              shaped={s}
              sum={summary?.shaped.find((x) => x.id === s.id)}
              veils={ak.veilsKnown}
              classes={ak.classes}
              capacityCap={summary?.essence.capacityCap}
              skillTargets={skillTargets}
              defaultOpen={s.id === openShapedId}
              onChange={(mut) =>
                ensure((a) => {
                  const t = a.shaped[i];
                  if (t) mut(t);
                })
              }
              onRemove={() => ensure((a) => a.shaped.splice(i, 1))}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Other essence receptacles</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => ensure((a) => a.otherReceptacles.push({ id: newId("recep"), label: "", essenceInvested: 0 }))}
          >
            <Plus className="size-4" /> Receptacle
          </Button>
        </div>
        {(ak?.otherReceptacles.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            Feats, class features, and items that hold invested essence (they count against the pool).
          </p>
        )}
        <div className="space-y-2">
          {ak?.otherReceptacles.map((r, i) => {
            const setRecep = (mut: (t: AkashicBlock["otherReceptacles"][number]) => void) =>
              ensure((a) => {
                const t = a.otherReceptacles[i];
                if (t) mut(t);
              });
            return (
              <div key={r.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
                <TextField
                  label="Receptacle"
                  value={r.label}
                  onChange={(v) => setRecep((t) => (t.label = v))}
                  placeholder="e.g. Essence of the Immortal"
                  className="min-w-[10rem] flex-1"
                />
                <NumberField
                  label="Essence"
                  value={r.essenceInvested}
                  min={0}
                  onChange={(v) => setRecep((t) => (t.essenceInvested = Math.max(0, v)))}
                  className="w-24"
                />
                <TextField
                  label="Notes"
                  value={r.notes ?? ""}
                  onChange={(v) => setRecep((t) => (t.notes = v || undefined))}
                  className="min-w-[10rem] flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${r.label || "receptacle"}`}
                  onClick={() => ensure((a) => a.otherReceptacles.splice(i, 1))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <TextAreaField
        label="Akashic notes"
        value={ak?.notes ?? ""}
        onChange={(v) => ensure((a) => (a.notes = v || undefined))}
        rows={2}
      />
    </div>
  );
}

/**
 * One shaped-veil row: an EntryCard-shaped disclosure card whose header control is the VEIL SELECT
 * (a shaped row has no free-text name — its name IS the chosen veil, so the shared EntryCard's
 * name TextField doesn't fit; the collapsed/expanded structure is mirrored exactly).
 */
function ShapedVeilCard({
  shaped: s,
  sum,
  veils,
  classes,
  capacityCap,
  skillTargets,
  defaultOpen,
  onChange,
  onRemove,
}: {
  shaped: ShapedVeil;
  sum?: AkashicShapedSummary;
  veils: AkashicVeilRef[];
  classes: AkashicBlock["classes"];
  capacityCap?: number;
  skillTargets: { label: string; target: string }[];
  defaultOpen: boolean;
  onChange: (mut: (t: ShapedVeil) => void) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const investedLabelId = useId();
  // Open when the parent signals this row should edit (just-added) — the EntryCard render-phase
  // "adjust on prop change" pattern. Never force-closes, so a manual toggle sticks.
  const [prevDefaultOpen, setPrevDefaultOpen] = useState(defaultOpen);
  if (defaultOpen !== prevDefaultOpen) {
    setPrevDefaultOpen(defaultOpen);
    if (defaultOpen) setOpen(true);
  }

  const veil = veils.find((v) => v.id === s.veilId);
  const name = veil?.name || "Unnamed veil";
  const invested = Math.max(0, s.essenceInvested);
  // The engine's per-veil cap (base band + class/receptacle capacityBonus); the local fallback
  // (summary absent) can only see the shaped row's own bonus.
  const effectiveCap =
    sum?.effectiveCap ?? (capacityCap != null ? capacityCap + Math.max(0, s.capacityBonus ?? 0) : undefined);
  const overCapacity = sum?.overCapacity ?? (effectiveCap != null && invested > effectiveCap);
  const bindValid = sum?.bindValid ?? true;
  // Veil options: veils shapeable into the chosen slot (or any veil when no slot is chosen / the
  // veil has no cached slots) — the current pick always stays selectable.
  const veilOptions = veils
    .filter((v) => v.id === s.veilId || veilMatchesSlot(v.slots, s.slot))
    .map((v) => ({ value: v.id, label: v.name || "Unnamed veil" }));
  if (!veils.some((v) => v.id === s.veilId)) {
    veilOptions.unshift({ value: s.veilId, label: "Unknown veil" });
  }

  return (
    <div className="min-w-0 rounded-lg border border-border">
      <div className="space-y-1.5 p-2">
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            label="Veil"
            value={s.veilId}
            onChange={(v) =>
              onChange((t) => {
                t.veilId = v;
                // A slotless row adopts the newly-picked veil's first slot (shape-time choice).
                const picked = veils.find((x) => x.id === v);
                if (!t.slot.trim() && picked?.slots[0]) t.slot = picked.slots[0];
              })
            }
            options={veilOptions}
            className="min-w-0 flex-1 sm:max-w-[18rem]"
          />
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? `Done editing ${name} details` : `Edit ${name} details`}
              className="flex h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:h-10"
            >
              {open ? "Done" : "Edit"}
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
            <Button variant="ghost" size="icon" aria-label={`Unshape ${name}`} onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <StatChip label="slot" value={s.slot.trim() || "—"} />
          <StatChip
            label="essence"
            value={effectiveCap != null ? `${invested}/${effectiveCap}` : invested}
            tone={overCapacity ? "poor" : "neutral"}
          />
          {sum && <StatChip label="DC" value={sum.dc.value} tone="gold" />}
          {s.bound && <StatChip value="Bound" tone={bindValid ? "gold" : "poor"} />}
          {overCapacity && <StatChip value="Over capacity" tone="poor" />}
          {!s.enabled && <StatChip value="Inactive" />}
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border/50 p-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <SlotInput
              label="Chakra slot"
              value={s.slot}
              onChange={(v) => onChange((t) => (t.slot = v))}
              suggestions={[...new Set([...KNOWN_SLOT_SUGGESTIONS, ...(veil?.slots ?? [])])]}
              className="w-36"
            />
            <div className="space-y-1">
              <span id={investedLabelId} className="block text-[11px] text-muted-foreground">
                Essence invested
              </span>
              {/* Investing past the capacity cap is WARNED, never blocked — capacity is legally
                  raised by class features/feats ("Improved essence capacity"), so a hard clamp
                  here would make rules-legal builds unenterable. The engine's over-capacity chip
                  + warning are the signal, matching every other akashic validation. */}
              <div role="group" aria-labelledby={investedLabelId} className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Decrease essence invested in ${name}`}
                  disabled={invested <= 0}
                  onClick={() => onChange((t) => (t.essenceInvested = Math.max(0, t.essenceInvested - 1)))}
                >
                  −
                </Button>
                <span className="tnum min-w-6 text-center text-base font-semibold text-foreground">{invested}</span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Increase essence invested in ${name}`}
                  onClick={() => onChange((t) => (t.essenceInvested = Math.max(0, t.essenceInvested) + 1))}
                >
                  +
                </Button>
              </div>
            </div>
            {classes.length > 1 && (
              <SelectField
                label="Shaped by"
                value={s.classId ?? ""}
                onChange={(v) => onChange((t) => (t.classId = v || undefined))}
                options={[
                  { value: "", label: "Auto (first class)" },
                  ...classes.map((c) => ({ value: c.id, label: c.className || "Veilweaver" })),
                ]}
                className="min-w-[10rem]"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <label className="flex min-h-11 items-center gap-1.5 text-sm text-foreground sm:min-h-0">
              <input
                type="checkbox"
                checked={s.bound}
                onChange={(e) => onChange((t) => (t.bound = e.target.checked))}
                className="size-4 accent-[var(--pf-gold)]"
              />
              Bound to its chakra
            </label>
            <label className="flex min-h-11 items-center gap-1.5 text-sm text-foreground sm:min-h-0">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => onChange((t) => (t.enabled = e.target.checked))}
                className="size-4 accent-[var(--pf-gold)]"
              />
              Enabled
            </label>
          </div>
          {s.bound && !bindValid && (
            <p className="text-xs text-warning">
              The shaping class hasn&rsquo;t unlocked the {s.slot.trim() || "chosen"} chakra bind — the bind
              effect doesn&rsquo;t apply yet (warned, never blocked).
            </p>
          )}
          <TextField
            label="Save DC ƒx (override)"
            value={s.saveDcFormula ?? ""}
            onChange={(v) => onChange((t) => (t.saveDcFormula = v || undefined))}
            inputClassName="font-mono"
            placeholder="10 + @{essenceInvested} + @{veilweavingMod}"
            className="max-w-md"
          />
          <AutomationEffectsEditor
            effects={s.automation}
            onChange={(next) => onChange((t) => (t.automation = next))}
            idPrefix="veilfx"
            skillTargets={skillTargets}
          />
          <p className="text-[11px] text-muted-foreground">
            Effect values may use <code className="font-mono">{"@{essenceInvested}"}</code> — they scale
            with this veil&rsquo;s invested essence while it&rsquo;s shaped and enabled.
          </p>
        </div>
      )}
    </div>
  );
}

/** A chip list of slot names with a datalist-backed add control — quick-pick a canonical chakra
 * slot or type a free string (nonstandard slots like "Storm" exist in the data by design). */
function SlotChipList({
  label,
  values,
  suggestions,
  onAdd,
  onRemove,
}: {
  label: string;
  values: string[];
  suggestions: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [text, setText] = useState("");
  const listId = useId();
  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onAdd(v);
    setText("");
  };
  return (
    <div className="space-y-1">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs text-foreground"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onRemove(v)}
              className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </span>
        ))}
        <input
          list={listId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          aria-label={`Add ${label.toLowerCase()}`}
          placeholder="Add…"
          className="h-11 w-32 rounded border border-border bg-background px-2 text-xs text-foreground sm:h-9"
        />
        <datalist id={listId}>
          {suggestions
            .filter((sug) => !values.some((x) => x.toLowerCase() === sug.toLowerCase()))
            .map((sug) => (
              <option key={sug} value={sug} />
            ))}
        </datalist>
        <Button size="sm" variant="ghost" disabled={!text.trim()} onClick={add}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </div>
  );
}

/** A labelled free-text slot input with datalist suggestions (a plain <select> can't take the
 * nonstandard free-string slots the compendium carries). */
function SlotInput({
  label,
  value,
  onChange,
  suggestions,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  className?: string;
}) {
  const id = useId();
  const listId = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} list={listId} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
