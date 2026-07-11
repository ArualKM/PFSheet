"use client";

import { useState } from "react";
import {
  computeMaxHpFromLevels,
  isGestalt,
  gestaltTracksCollapsed,
  resolveClassPreset,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import { NumberField, SelectField } from "../../editor/fields";
import { Button } from "@/components/ui/button";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/**
 * §4.3 "hp-step.tsx" — "Starting Hit Points". A compact wizard-native panel mirroring (never
 * importing — `character-editor.tsx` is off-limits for the wizard bundle) the Health tab's "Compute
 * HP from levels" section: the SAME `computeMaxHpFromLevels` call (gestalt-aware — best-of-two-tracks,
 * matching `recomputeClassDerived`), the SAME `c.health.maxHp` write for both "Apply to Max HP" and
 * the manual override field below it, and the SAME per-class favored-class HP/skill split
 * (`favoredClassBonus` + the `health.favoredClassHpBonus` sync) `ClassRow`'s FCB steppers use.
 *
 * The Method toggle (Average / Max) is honestly WHOLE-CHARACTER, not per-class:
 * `computeMaxHpFromLevels` takes one method applied to every class level (the very first character
 * level always takes the full Hit Die regardless of the method) — there's no per-class hpMethod field
 * to expose here, so this doesn't fabricate one.
 */
export function HpStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  const [hpMethod, setHpMethod] = useState<"average" | "max">("average");
  const classes = ed.draft.identity.classes;
  const collapsed = gestaltTracksCollapsed(ed.draft);

  const hpFromLevels = (() => {
    if (isGestalt(ed.draft)) {
      const a = computeMaxHpFromLevels(ed.draft, hpMethod, classes.filter((c) => c.track !== "b"));
      const b = computeMaxHpFromLevels(ed.draft, hpMethod, classes.filter((c) => c.track === "b"));
      return a.total >= b.total ? a : b;
    }
    return computeMaxHpFromLevels(ed.draft, hpMethod);
  })();

  const applyComputedHp = () =>
    ed.update((c) => {
      c.health.maxHp = hpFromLevels.total;
      if (c.health.currentHp === 0) c.health.currentHp = hpFromLevels.total;
    });

  // Mirrors ClassRow's syncFcbHp/syncFavoredClasses exactly (character-editor.tsx) — those are
  // local closures there, not exported, so re-declared here rather than imported.
  const syncFcbHp = (c: PathForgeCharacterV1) => {
    c.health.favoredClassHpBonus = c.identity.classes.reduce((s, x) => s + (x.favoredClassBonus?.hp ?? 0), 0);
  };
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
  const toggleFavored = (classId: string, on: boolean) =>
    ed.update((c) => {
      const t = c.identity.classes.find((x) => x.id === classId);
      if (!t) return;
      t.favoredClass = on || undefined;
      if (!on) t.favoredClassBonus = undefined;
      syncFavoredClasses(c);
      syncFcbHp(c);
    });
  const setFcb = (classId: string, hp: number, skill: number) =>
    ed.update((c) => {
      const t = c.identity.classes.find((x) => x.id === classId);
      if (!t) return;
      const cap = Math.max(0, t.level);
      const h = Math.min(Math.max(0, hp), cap);
      const sk = Math.min(Math.max(0, skill), cap - h);
      t.favoredClassBonus = { hp: h, skill: sk };
      syncFcbHp(c);
    });

  // A master-linked familiar's Max HP is derived (half the master's) — the stored field is a silent
  // no-op while linked (same guard the Health tab uses), so show it read-only instead of an editable
  // field a player could type into and have quietly ignored.
  const familiarLinked = ed.draft.companion?.type === "familiar" && ed.computed.summary.companion?.synced === true;
  const hpMax = ed.computed.summary.hp.max;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Starting hit points</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Hit points track how much damage your character can take before falling. This step is
          optional — fine-tune HP anytime from the full editor&rsquo;s Health tab.
        </p>
      </div>

      <div className="rounded-lg border border-gold/40 bg-gold/5 p-3">
        <p className="text-xs text-muted-foreground">Your character&rsquo;s Max HP</p>
        <p className="tnum text-2xl font-bold text-foreground">{hpMax}</p>
      </div>

      {familiarLinked ? (
        <p className="rounded-lg border border-border p-2.5 text-xs text-muted-foreground">
          This companion&rsquo;s Max HP is derived automatically (half the master&rsquo;s) while the
          companion link is on — nothing to set here.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Compute from class levels</h3>
            {collapsed && (
              <p className="rounded-lg border border-warning/50 bg-warning/10 p-2.5 text-xs text-foreground">
                Gestalt is on but your class tracks aren&apos;t split yet, so this would sum both class
                lines instead of taking the best. Fix this on the Class step first.
              </p>
            )}
            {classes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add a class on the Class step to compute HP from levels.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <SelectField
                  label="Method"
                  value={hpMethod}
                  onChange={(v) => setHpMethod(v as "average" | "max")}
                  options={[
                    { value: "average", label: "Average" },
                    { value: "max", label: "Max" },
                  ]}
                  className="w-32"
                />
                <div className="pb-2 text-sm text-muted-foreground">
                  ={" "}
                  <span className="font-semibold text-foreground">{hpFromLevels.total} HP</span>{" "}
                  <span className="text-xs">
                    (HD {hpFromLevels.hd}
                    {hpFromLevels.con ? ` · Con ${hpFromLevels.con >= 0 ? "+" : ""}${hpFromLevels.con}` : ""}
                    {hpFromLevels.fcb ? ` · FCB +${hpFromLevels.fcb}` : ""})
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={applyComputedHp}
                  disabled={hpFromLevels.levels === 0 || collapsed}
                >
                  Apply to Max HP
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Applies to every class level — the very first level always takes the full Hit Die
              regardless of the method.
            </p>
          </section>

          {classes.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Favored class</h3>
              <p className="text-xs text-muted-foreground">
                Most races let you pick one favored class at 1st level — each level in it can add +1 HP
                or +1 skill rank instead.
              </p>
              <div className="space-y-2">
                {classes.map((cl) => {
                  const fcb = cl.favoredClassBonus ?? { hp: 0, skill: 0 };
                  const remaining = Math.max(0, cl.level - fcb.hp - fcb.skill);
                  const className = cl.compendiumPreset?.name ?? cl.name;
                  return (
                    <div key={cl.id} className="rounded-lg border border-border/60 p-2.5">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={!!cl.favoredClass}
                          onChange={(e) => toggleFavored(cl.id, e.target.checked)}
                          className="size-4 rounded border-border accent-gold"
                        />
                        <span className="font-medium">{className} is a favored class</span>
                      </label>
                      {cl.favoredClass && (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <NumberField
                            label="+1 HP ×"
                            value={fcb.hp}
                            min={0}
                            max={cl.level}
                            onChange={(v) => setFcb(cl.id, v, fcb.skill)}
                            className="w-20"
                          />
                          <NumberField
                            label="+1 Skill ×"
                            value={fcb.skill}
                            min={0}
                            max={cl.level}
                            onChange={(v) => setFcb(cl.id, fcb.hp, v)}
                            className="w-20"
                          />
                          <p className="pb-2 text-[11px] text-muted-foreground">
                            {remaining} of {cl.level} unassigned
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="space-y-2 border-t border-border/50 pt-4">
            <h3 className="text-sm font-semibold text-foreground">Manual override</h3>
            {typeof ed.draft.health.maxHp === "number" ? (
              <>
                <NumberField
                  label="Max HP"
                  value={ed.draft.health.maxHp}
                  min={0}
                  onChange={(v) => ed.update((c) => (c.health.maxHp = v))}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Type an exact value if you&rsquo;d rather set Max HP directly (e.g. rolled dice) — the
                  same field the full editor&rsquo;s Health tab writes.
                </p>
              </>
            ) : (
              // maxHp can be FORMULA-valued (imported sheets) — a plain number field can't edit that
              // without silently discarding the formula; the Health tab owns that case.
              <p className="text-xs text-muted-foreground">
                Max HP on this sheet is formula-driven — fine-tune it in the full editor&rsquo;s Health
                tab.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
