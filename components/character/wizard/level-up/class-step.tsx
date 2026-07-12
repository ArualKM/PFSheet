"use client";

import { useMemo, useState } from "react";
import {
  readLevelUpMeta,
  writeLevelUpMeta,
  resolveClassPreset,
  isGestalt,
  gestaltLevel,
  gestaltTracksCollapsed,
  recomputeClassDerived,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import { grantClassFeatures, type CompendiumFeatureRow } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/client";
import { buildFeatureRows } from "@/lib/character/class-compendium";
import { threeppFeaturesFromProgression } from "@/lib/character/threepp-class-adapter";
import { NumberField } from "../../editor/fields";
import { Button } from "@/components/ui/button";
import { ClassCompendiumPicker } from "../../editor/class-compendium-picker";
import { CollapsibleGroup } from "../../collapsible-group";
import { GestaltHint } from "../steps/class-step";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

type ClassEntry = PathForgeCharacterV1["identity"]["classes"][number];

/**
 * Level-Up Wizard Stage 3 — the Class step (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "The step list" +
 * "Risks"). Three affordances in one card: (1) a target-level stepper for a returning player catching
 * up after missing sessions, (2) a one-tap "+1 level" per owned class that mirrors `ClassRow`'s
 * level-bump onChange EXACTLY (character-editor.tsx:2603-2624 — synchronous level/FCB/BAB/saves/HP
 * update, then an async class-feature regrant), and (3) the existing `ClassCompendiumPicker` for a
 * brand-new multiclass or prestige pick, now safe to reuse for "level up a class I already have" via
 * its new `prefillLevel` prop (the Ground Truth gotcha this stage exists to fix).
 *
 * House rule: mirrors character-editor.tsx's closures, never imports from it (~5,400 lines / ~1.2MB —
 * would bloat the wizard bundle, the same reasoning `hp-step.tsx`/`skills-step.tsx` already state).
 */
export function LevelUpClassStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const classes = ed.draft.identity.classes;
  const gestalt = isGestalt(ed.draft);

  // A synced familiar's levels/HD track its master (companion-sync.ts), not independent class
  // levels — same guard HpStep already uses for the master-derived HP field. Cohorts and
  // non-familiar companions are unaffected and level normally through this step like any PC.
  const familiarLinked = ed.draft.companion?.type === "familiar" && ed.computed.summary.companion?.synced === true;

  // Guard null defensively (the level-up page only renders this wizard when a session is active),
  // but never crash or silently corrupt a real session: fall back to the character's CURRENT total
  // level so the header/remaining math is at least honest until a real session starts.
  const meta = readLevelUpMeta(ed.draft);
  const fromLevel = meta?.fromLevel ?? ed.draft.identity.totalLevel;
  const targetLevel = meta?.targetLevel ?? fromLevel + 1;

  const setTargetLevel = (v: number) =>
    ed.update((c) => {
      // Pass fromLevel explicitly — writeLevelUpMeta defaults an omitted fromLevel to 0 on a FIRST
      // write, which would only matter in the defensive null-meta case above, but there's no reason
      // to risk that footgun when we already know the right value.
      writeLevelUpMeta(c, { fromLevel, targetLevel: Math.max(fromLevel + 1, v) });
    });

  // "Levels to assign" — gestalt tracks independently (RAW: a class from EACH track every level;
  // see canAdvanceLevelUpClass below), everyone else against the single totalLevel.
  const trackA = classes.filter((c) => c.track !== "b").reduce((s, c) => s + c.level, 0);
  const trackB = classes.filter((c) => c.track === "b").reduce((s, c) => s + c.level, 0);
  const remaining = targetLevel - ed.draft.identity.totalLevel;
  const remainingA = targetLevel - trackA;
  const remainingB = targetLevel - trackB;
  const remainingFor = (cl: ClassEntry) => (gestalt ? (cl.track === "b" ? remainingB : remainingA) : remaining);

  const syncLevel = (c: PathForgeCharacterV1) => {
    c.identity.totalLevel = isGestalt(c) ? gestaltLevel(c) : c.identity.classes.reduce((s, x) => s + x.level, 0);
  };
  const syncFcbHp = (c: PathForgeCharacterV1) => {
    c.health.favoredClassHpBonus = c.identity.classes.reduce((s, x) => s + (x.favoredClassBonus?.hp ?? 0), 0);
  };

  // A failed feature fetch must be VISIBLE: the level bump has already committed synchronously, so
  // silently granting zero features would leave the sheet half-leveled with no signal (review
  // finding). The banner offers the honest retry path (−1 then +1 re-runs the regrant).
  const [regrantError, setRegrantError] = useState<string | null>(null);

  // Mirrors ClassRow's fetchFeatureRows/regrantFeatures (character-editor.tsx:2496-2528) —
  // re-declared locally per the house rule above, not imported — plus error surfacing.
  const fetchFeatureRows = async (
    className: string,
    compendiumId: string | undefined,
  ): Promise<{ rows: CompendiumFeatureRow[]; error?: string }> => {
    if (compendiumId?.startsWith("3pp:")) {
      const slug = compendiumId.slice("3pp:".length);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("threepp_class_compendium").select("slug,progression_json").eq("slug", slug).maybeSingle();
      if (error) return { rows: [], error: error.message };
      return { rows: data ? threeppFeaturesFromProgression(data.progression_json, slug) : [] };
    }
    const [featsRes, fxRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("class_feature_compendium").select("slug,feature,level,type,description").eq("class", className).eq("category", "Main"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("feature_effect").select("feature,target,op,value_or_formula,bonus_type,notes").eq("class", className),
    ]);
    if (featsRes.error || fxRes.error) return { rows: [], error: featsRes.error?.message ?? fxRes.error?.message };
    return { rows: buildFeatureRows(featsRes.data ?? [], fxRes.data ?? []) };
  };

  const regrantFeatures = async (
    className: string,
    classId: string,
    fromLvl: number,
    toLevel: number,
    exclude: string[],
    compendiumId: string | undefined,
  ) => {
    const { rows, error } = await fetchFeatureRows(className, compendiumId);
    if (error) {
      setRegrantError(
        `Couldn't load ${className}'s class features (${error}) — the level itself applied. Tap −1 then +1 to retry, or grant them from the full editor's Features section.`,
      );
      return;
    }
    setRegrantError(null);
    ed.update((c) => {
      if (!c.identity.classes.some((r) => r.id === classId)) return; // removed while the fetch was in flight
      grantClassFeatures(c, { features: rows, fromLevel: fromLvl, toLevel, exclude });
    });
  };

  // The dominant one-tap path — an EXACT mirror of ClassRow's Level NumberField onChange
  // (character-editor.tsx:2607-2624): re-clamp FCB to the new level, sync totalLevel, recompute
  // BAB/saves/HP from all classes, THEN (async, only on an increase, only for compendium classes)
  // regrant the newly-reached levels' features.
  const bumpUp = (cl: ClassEntry) => {
    const oldLevel = cl.level;
    const v = oldLevel + 1;
    ed.update((c) => {
      const t = c.identity.classes.find((x) => x.id === cl.id);
      if (!t) return;
      t.level = v;
      if (t.favoredClassBonus) {
        t.favoredClassBonus.hp = Math.min(t.favoredClassBonus.hp, Math.max(0, v));
        t.favoredClassBonus.skill = Math.min(t.favoredClassBonus.skill, Math.max(0, v - t.favoredClassBonus.hp));
      }
      syncLevel(c);
      syncFcbHp(c);
      if (resolveClassPreset(t)) recomputeClassDerived(c, { hpMethod: "manual" });
    });
    if (cl.compendiumId) {
      const exclude = (cl.archetypes ?? []).flatMap((a) => a.replaces);
      void regrantFeatures(cl.compendiumPreset?.name ?? cl.name, cl.id, oldLevel, v, exclude, cl.compendiumId);
    }
  };

  // The undo affordance for an accidental +1 — floored at the level this class ENTERED the session
  // with (meta.startingClasses, by id; a class added this session, or a pre-startingClasses session,
  // floors at 1), so repeated clicks can never erase levels the character had before the wizard
  // opened (review finding). This is a correction control, not class removal, and per
  // `grantClassFeatures`'s own contract a level-down leaves already-granted features in place BY
  // DESIGN (ClassRow does the same; there's nothing to un-grant).
  const sessionFloor = (cl: ClassEntry): number =>
    Math.max(1, meta?.startingClasses?.find((s) => s.id === cl.id)?.level ?? 1);
  const bumpDown = (cl: ClassEntry) => {
    if (cl.level <= sessionFloor(cl)) return;
    const v = cl.level - 1;
    ed.update((c) => {
      const t = c.identity.classes.find((x) => x.id === cl.id);
      if (!t) return;
      t.level = v;
      if (t.favoredClassBonus) {
        t.favoredClassBonus.hp = Math.min(t.favoredClassBonus.hp, Math.max(0, v));
        t.favoredClassBonus.skill = Math.min(t.favoredClassBonus.skill, Math.max(0, v - t.favoredClassBonus.hp));
      }
      syncLevel(c);
      syncFcbHp(c);
      if (resolveClassPreset(t)) recomputeClassDerived(c, { hpMethod: "manual" });
    });
  };

  // The ClassCompendiumPicker prefill fix's caller side (Stage 3's must-fix): find an already-owned
  // class matching the row being previewed — by compendiumId first, falling back to a case-
  // insensitive name match (a hand-added/imported class may have no compendiumId yet) — and, if
  // found, seed the level field past its CURRENT level so re-selecting it can only raise it, never
  // silently reset it downward. Stored compendiumIds are PREFIXED keys ("pfcore:<slug>",
  // "3pp:<slug>", "pfcore-prestige:<slug>" — applyCompendiumClass, class-builder.ts) while the
  // picker row carries the bare slug, so compare on the part after the first colon (a review caught
  // the direct equality was dead code). Remaining is per-track under gestalt — the same
  // remainingFor the +1 buttons use — so a lagging track isn't under-seeded in a catch-up.
  const bareCompendiumSlug = (id: string | undefined): string | undefined => {
    if (!id) return undefined;
    const colon = id.indexOf(":");
    return colon >= 0 ? id.slice(colon + 1) : id;
  };
  const prefillLevel = (row: { slug: string; name: string }): number | undefined => {
    const existing =
      classes.find((cl) => bareCompendiumSlug(cl.compendiumId) === row.slug) ??
      classes.find((cl) => (cl.compendiumPreset?.name ?? cl.name).toLowerCase() === row.name.toLowerCase());
    if (!existing) return undefined;
    return existing.level + Math.max(1, remainingFor(existing));
  };

  if (familiarLinked) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Level up</h2>
        <p className="rounded-lg border border-border p-2.5 text-xs text-muted-foreground">
          This companion&rsquo;s levels track its master automatically while the companion link is
          on — half the master&rsquo;s Hit Dice, saves/skills the better of the two, no independent
          class levels to assign. Level up the master character instead.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
          Level {fromLevel} → {targetLevel}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Assign the new level(s) below — bump a class you already have, or pick up something new.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 p-2.5">
        <NumberField label="Target level" value={targetLevel} min={fromLevel + 1} onChange={setTargetLevel} className="w-28" />
        <p className="max-w-sm pb-2 text-xs text-muted-foreground">
          Catching up after missed sessions? Raise the target to walk through every milestone at once.
        </p>
      </div>

      <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm">
        {gestalt ? (
          <div className="flex flex-wrap gap-4">
            <p>
              Track A: <span className="tnum font-semibold text-foreground">{Math.max(0, remainingA)}</span> level
              {Math.max(0, remainingA) === 1 ? "" : "s"} to assign
            </p>
            <p>
              Track B: <span className="tnum font-semibold text-foreground">{Math.max(0, remainingB)}</span> level
              {Math.max(0, remainingB) === 1 ? "" : "s"} to assign
            </p>
          </div>
        ) : (
          <p>
            <span className="tnum font-semibold text-foreground">{Math.max(0, remaining)}</span> level
            {Math.max(0, remaining) === 1 ? "" : "s"} left to assign
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Your classes</h3>
        {regrantError && (
          <p role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-2.5 text-xs text-foreground">
            {regrantError}
          </p>
        )}
        {classes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No classes yet — add one below.</p>
        ) : (
          <div className="space-y-2">
            {classes.map((cl) => {
              const name = cl.compendiumPreset?.name ?? cl.name;
              const rem = remainingFor(cl);
              return (
                <div key={cl.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{name}</span>
                    <span className="inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                      Level {cl.level}
                    </span>
                    {gestalt && <span className="text-[11px] text-muted-foreground">track {(cl.track ?? "a").toUpperCase()}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" size="sm" variant="ghost" onClick={() => bumpDown(cl)} disabled={cl.level <= sessionFloor(cl)} aria-label={`Lower ${name} by one level`}>
                      −1
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => bumpUp(cl)} disabled={rem <= 0} aria-label={`Raise ${name} by one level`}>
                      +1 level
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <GestaltHint ed={ed} />

      <CollapsibleGroup title="Add a new class (multiclass or prestige)" defaultOpen={false}>
        <div className="space-y-2">
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-2.5 text-xs text-foreground">
            <strong>Prestige prerequisites aren&apos;t auto-checked.</strong> Our compendium data doesn&apos;t
            include structured prerequisites yet — confirm you meet a prestige class&apos;s requirements
            yourself before committing to it.
          </div>
          {/* No baseOnly here (unlike the create wizard's ClassStep) — prestige must be reachable;
              the picker's own Base/Prestige Segmented handles the toggle. initialHpMethod="manual"
              matches the +1 buttons: HP is untouched until the HP step — the picker's usual
              "average" default would silently recompute-and-overwrite a hand-rolled Max HP the
              moment it re-applies an existing class (review HIGH). The player can still choose
              Average/Max in the picker deliberately. */}
          <ClassCompendiumPicker
            ed={ed}
            onClose={() => {}}
            autoFocusSearch={false}
            resetAfterApply
            prefillLevel={prefillLevel}
            initialHpMethod="manual"
          />
        </div>
      </CollapsibleGroup>
    </div>
  );
}

/** RAW: a gestalt character takes a class from EACH track at every level — the gate must not let the
 * player advance having only fed track A (or a track-collapsed sheet, which isn't a valid gestalt
 * state to leave the step in at all; the GestaltHint above offers the one-click split). */
export function canAdvanceLevelUpClass(ed: CharacterEditorApi): boolean {
  const meta = readLevelUpMeta(ed.draft);
  if (!meta) return false;
  if (isGestalt(ed.draft)) {
    if (gestaltTracksCollapsed(ed.draft)) return false;
    const classes = ed.draft.identity.classes;
    const trackA = classes.filter((c) => c.track !== "b").reduce((s, c) => s + c.level, 0);
    const trackB = classes.filter((c) => c.track === "b").reduce((s, c) => s + c.level, 0);
    return trackA === meta.targetLevel && trackB === meta.targetLevel;
  }
  return ed.draft.identity.totalLevel === meta.targetLevel;
}
