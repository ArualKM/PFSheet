"use client";

import {
  OPTIONAL_RULE_MODULES,
  isRuleEnabled,
  isModuleComingSoon,
  isGestalt,
  gestaltLevel,
  gestaltTracksCollapsed,
  gestaltTrackClassCounts,
  splitGestaltTracks,
  recomputeClassDerived,
  computeMaxHpFromLevels,
  type OptionalRuleModule,
  type RuleModuleGroup,
} from "@pathforge/schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

// Same group vocabulary + labels as `character-editor.tsx`'s `RULE_GROUPS` (that file can't be
// imported into the wizard bundle, so this is a small mirror, not a re-export).
const RULE_GROUPS: { key: RuleModuleGroup; label: string }[] = [
  { key: "paizo", label: "Paizo optional rules" },
  { key: "subsystem", label: "Subsystems & tracking" },
  { key: "thirdparty", label: "Third-party content" },
];

/**
 * §4.3 "systems-step.tsx" — "What does your game use?" A compact, wizard-native optional-rules
 * toggle grid. NOT `OptionalRulesEditor` re-exported (that lives inside `character-editor.tsx`,
 * ~5,400 lines / ~1.2MB — never imported into the wizard bundle per the task brief); this mirrors
 * its exact write shape — `rules.variants[variantKey]` for modules that have one, otherwise an
 * add/remove into `rules.modules[]` — so a toggle made here and one made later in the full editor
 * are indistinguishable on the wire. Only IMPLEMENTED (non-"Coming soon") modules are offered —
 * a "Coming soon" toggle would flip a flag that visibly does nothing, which is worse in a
 * first-run wizard than in the full editor's Optional-rules panel.
 */
export function SystemsStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
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
      // Gestalt changes BAB/saves/HP and the character level — recompute so the toggle takes effect,
      // and auto-split so a normal multi-class sheet doesn't land on the silently-summed collapse
      // (see `gestaltTracksCollapsed`) the instant the toggle turns on.
      if (mod.key === "gestalt") {
        if (isGestalt(c) && gestaltTracksCollapsed(c)) splitGestaltTracks(c);
        c.identity.totalLevel = isGestalt(c) ? gestaltLevel(c) : c.identity.classes.reduce((s, x) => s + x.level, 0);
        recomputeClassDerived(c, { hpMethod: "manual" });
      }
    });

  const implementedModules = OPTIONAL_RULE_MODULES.filter((m) => !isModuleComingSoon(m.key));
  const enabledCount = implementedModules.filter((m) => isRuleEnabled(ed.draft, m)).length;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">What does your game use?</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Switch on the optional rulesets and third-party systems your table uses. This tailors the
          steps ahead — Gestalt adds a second class track to build, Background Skills adds an extra
          rank budget on the Skills step, and so on. Nothing here is required; skip if you&rsquo;re
          playing straight core rules.
          {enabledCount > 0 ? ` ${enabledCount} enabled.` : ""}
        </p>
      </div>

      {/* Defensive: the toggle above auto-splits a gestalt sheet the moment it's turned on, but a
          resumed wizard (or a sheet edited elsewhere) could still arrive here already collapsed. */}
      <GestaltNotice ed={ed} />

      {RULE_GROUPS.map((g) => {
        const mods = implementedModules.filter((m) => m.group === g.key);
        if (mods.length === 0) return null;
        return (
          <section key={g.key}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g.label}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {mods.map((mod) => {
                const on = isRuleEnabled(ed.draft, mod);
                return (
                  <label
                    key={mod.key}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
                      on ? "border-gold/40 bg-gold/5" : "border-border hover:border-border/80",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => toggleRule(mod, e.target.checked)}
                      aria-label={mod.name}
                      className="mt-0.5 size-5 shrink-0 accent-[var(--pf-gold)]"
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
        );
      })}
    </div>
  );
}

/** Mirrors the full editor's `GestaltCollapseBanner` (that component itself lives inside
 * `character-editor.tsx` and can't be imported) using the same exported schema helpers — a warning
 * + one-click split, so a collapsed sheet never silently sums two class lines through the wizard. */
function GestaltNotice({ ed }: { ed: CharacterEditorApi }) {
  if (!gestaltTracksCollapsed(ed.draft)) return null;
  const { a, b } = gestaltTrackClassCounts(ed.draft);
  const where = a === 0 ? "all on track B" : b === 0 ? "all on track A" : "stacked on one track";
  const split = () =>
    ed.update((c) => {
      // HP heal, same as the canonical GestaltCollapseBanner (and class-step's GestaltHint): if the
      // stored Max HP matches an AUTO-computed total of the collapsed sheet, re-derive it against
      // the split tracks; a hand-entered Max HP stays untouched (hpMethod "manual" is a no-op).
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
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/50 bg-warning/10 p-2.5">
      <p className="min-w-0 flex-1 text-xs text-foreground">
        <strong>Gestalt tracks aren&apos;t split.</strong> Your classes are {where}, so BAB, saves,
        character level, and HP would be <em>summed</em> across both class lines instead of taking the
        best of tracks A / B.
      </p>
      <Button type="button" size="sm" variant="outline" className="min-h-9" onClick={split}>
        Split into A / B
      </Button>
    </div>
  );
}
