"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ABILITY_KEYS, asiCountAtLevel, readLevelUpMeta } from "@pathforge/schema";
import { Button } from "@/components/ui/button";
import { StatChip } from "../../editor/picker-shell";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * The bookkeeping level to stamp on a new increase: the smallest multiple of 4 at or under
 * `targetLevel` that isn't already used by a recorded entry â€” 4 first, then 8, 12â€¦ â€” falling back to
 * `targetLevel` itself once every milestone through it is already taken (e.g. a catch-up session
 * logging a homebrew extra beyond the formula). This is bookkeeping ONLY, per `abilityIncreaseSchema`'s
 * own doc comment â€” never enforced or re-derived from; the array's LENGTH is the budget source of
 * truth, not this label.
 */
function nextAsiLevel(targetLevel: number, existing: { level: number }[]): number {
  const used = new Set(existing.map((e) => e.level));
  for (let lvl = 4; lvl <= targetLevel; lvl += 4) {
    if (!used.has(lvl)) return lvl;
  }
  return targetLevel;
}

/**
 * Level-Up Wizard Stage 5 â€” the Ability Score Increase step (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`,
 * "The step list" + the Stage 5 review point â€” this is the genuinely NEW surface, not a reused
 * component). Mirrors `mythic-editor.tsx`'s ability-boost pattern (select + Add + removable chips,
 * same `newId` helper shape re-declared locally per this codebase's "mirror, don't import
 * character-editor.tsx-adjacent files across the wizard boundary" convention) but for core,
 * always-on `abilities.abilityIncreases` (+1, not Mythic's +2, and no module gate).
 *
 * Two counts are shown deliberately, not one: `sessionOwed` (what THIS level-up crosses) is a
 * moment-in-time diff of `asiCountAtLevel`; `recorded`/`totalOwed` is lifetime bookkeeping straight off
 * the array's length, because a catch-up player may already have unrecorded ASIs from levels the
 * engine never modeled until this wizard shipped â€” the array is the source of truth, the formula is
 * only ever a hint (Master Plan item 4).
 */
export function LevelUpAsiStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  const [ability, setAbility] = useState<string>("str");
  const meta = readLevelUpMeta(ed.draft);

  const increases = ed.draft.abilities.abilityIncreases ?? [];
  const recorded = increases.length;
  const totalOwed = meta ? asiCountAtLevel(meta.targetLevel) : 0;
  const sessionOwed = meta ? Math.max(0, asiCountAtLevel(meta.targetLevel) - asiCountAtLevel(meta.fromLevel)) : 0;
  // Only flagged with an active session in hand â€” without one there's no honest "owed" to compare
  // against, and this must never guess a baseline (same discipline as the HP/Skills wrappers).
  const overCap = meta ? recorded > totalOwed : false;

  // Group for display by ability, core six first (stable order) then anything else on the sheet (a
  // hand-typed/imported custom ability key) so a chip never silently vanishes from the list.
  const coreGroups = ABILITY_KEYS.map((key) => ({
    key,
    entries: increases.filter((i) => i.ability === key).sort((a, b) => a.level - b.level),
  })).filter((g) => g.entries.length > 0);
  const otherKeys = [...new Set(increases.map((i) => i.ability).filter((k) => !(ABILITY_KEYS as readonly string[]).includes(k)))];
  const otherGroups = otherKeys.map((key) => ({
    key,
    entries: increases.filter((i) => i.ability === key).sort((a, b) => a.level - b.level),
  }));
  const groups = [...coreGroups, ...otherGroups];

  const addIncrease = () => {
    if (!meta) return;
    const level = nextAsiLevel(meta.targetLevel, increases);
    ed.update((c) => {
      c.abilities.abilityIncreases.push({ id: newId("asi"), level, ability });
    });
  };
  // Removes the group's MOST RECENT (highest-level) entry, by id â€” a grouped chip shows every level
  // taken for that ability, but the remove affordance undoes one bump at a time, newest first.
  const removeMostRecent = (key: string) => {
    const entries = increases.filter((i) => i.ability === key);
    const target = entries[entries.length - 1];
    if (!target) return;
    ed.update((c) => {
      c.abilities.abilityIncreases = c.abilities.abilityIncreases.filter((i) => i.id !== target.id);
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Ability score increase</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          PF1e grants a permanent +1 to one ability of your choice at levels 4, 8, 12, 16, and 20 â€”
          cumulative, and untyped so it stacks with everything else.
        </p>
      </div>

      {meta && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-sm font-medium text-foreground">
          This level-up crosses {sessionOwed} ability-increase milestone{sessionOwed === 1 ? "" : "s"}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {recorded} of {totalOwed} lifetime increase{totalOwed === 1 ? "" : "s"} recorded
      </p>
      {overCap && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-2.5 text-xs text-foreground">
          More increases recorded than levels 4/8/12/16/20 up to level {meta!.targetLevel} would grant â€”
          fine if your table granted extras.
        </div>
      )}

      <section className="space-y-2 border-t border-border/50 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Increase an ability</h3>
          <div className="flex items-end gap-2">
            <select
              value={ability}
              aria-label="Ability to increase"
              onChange={(e) => setAbility(e.target.value)}
              className="h-11 rounded-md border border-border bg-background px-2 text-sm uppercase text-foreground sm:h-9"
            >
              {ABILITY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k.toUpperCase()}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" onClick={addIncrease} disabled={!meta}>
              <Plus className="size-4" /> Add +1
            </Button>
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No ability increases recorded yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <span
                key={g.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs text-gold"
              >
                {g.key.toUpperCase()} +{g.entries.length} Â· level{g.entries.length === 1 ? "" : "s"}{" "}
                {g.entries.map((e) => e.level).join(", ")}
                <button
                  type="button"
                  aria-label={`Remove an ability increase from ${g.key.toUpperCase()}`}
                  onClick={() => removeMostRecent(g.key)}
                  className="text-gold/70 hover:text-gold"
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-border/50 pt-4">
        <h3 className="text-sm font-semibold text-foreground">Current ability scores</h3>
        <p className="text-xs text-muted-foreground">Watch a score tick up the moment you add an increase.</p>
        <div className="flex flex-wrap gap-1.5">
          {ABILITY_KEYS.map((k) => {
            const a = ed.computed.abilities[k];
            return (
              <StatChip
                key={k}
                label={k.toUpperCase()}
                value={a ? `${a.effectiveScore} (${a.modifier >= 0 ? "+" : ""}${a.modifier})` : "â€”"}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
