"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  MENTAL_PROWESS_LEVELS,
  PHYSICAL_PROWESS_LEVELS,
  MAX_PROWESS_PER_ABILITY,
  prowessSlots,
  prowessAbilities,
  trackAssignments,
  computeProwessBonuses,
  type AbpBlock,
  type ProwessTrack,
} from "@pathforge/schema";
import type { CharacterEditorApi } from "./use-character-editor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * ABP Mental/Physical Prowess: the player-assigned half of Automatic Bonus Progression. The big-six
 * bonuses are level-driven by the engine; only prowess needs choices (which ability gains each +2).
 */
export function AbpEditor({ ed }: { ed: CharacterEditorApi }) {
  const level = ed.draft.identity.totalLevel ?? 0;
  const abp = ed.draft.abp;

  const ensure = (mut: (a: AbpBlock) => void) =>
    ed.update((c) => {
      if (!c.abp) c.abp = { mentalProwess: [], physicalProwess: [] };
      mut(c.abp);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Automatic Bonus Progression grants the “big six” enhancement bonuses (saves, AC, attack)
        automatically by level. Prowess is the part you choose: assign each <strong>+2 enhancement</strong> to
        an ability score. No single score can exceed <strong>+6</strong> from prowess.
      </p>
      <ProwessTrackEditor track="mental" level={level} abp={abp} ensure={ensure} />
      <ProwessTrackEditor track="physical" level={level} abp={abp} ensure={ensure} />
    </div>
  );
}

/** One prowess track (mental or physical): slot tracker + assign control + per-ability tally chips. */
function ProwessTrackEditor({
  track,
  level,
  abp,
  ensure,
}: {
  track: ProwessTrack;
  level: number;
  abp: AbpBlock | undefined;
  ensure: (mut: (a: AbpBlock) => void) => void;
}) {
  const abilities = prowessAbilities(track);
  const incrementLevels = track === "mental" ? MENTAL_PROWESS_LEVELS : PHYSICAL_PROWESS_LEVELS;
  const slots = prowessSlots(track, level);
  const assigned = trackAssignments(abp, track);
  const used = assigned.length;
  const [pick, setPick] = useState<string>(abilities[0]!);

  // Per-ability increment counts (cap enforcement + tally chips).
  const counts: Record<string, number> = {};
  for (const inc of assigned) counts[inc.ability] = (counts[inc.ability] ?? 0) + 1;
  const bonuses = computeProwessBonuses(abp, level);

  const slotsFull = used >= slots;
  const atCap = (counts[pick] ?? 0) >= MAX_PROWESS_PER_ABILITY;
  const overAssigned = used > slots;
  const nextUnlock = incrementLevels.find((l) => l > level);

  const add = () =>
    ensure((a) => {
      (track === "mental" ? a.mentalProwess : a.physicalProwess).push({ id: newId("prowess"), ability: pick });
    });
  const removeOne = (key: string) =>
    ensure((a) => {
      const arr = track === "mental" ? a.mentalProwess : a.physicalProwess;
      // Remove the most-recently-added increment for this ability.
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i]!.ability === key) {
          arr.splice(i, 1);
          break;
        }
      }
    });

  const title = track === "mental" ? "Mental prowess" : "Physical prowess";
  const accent = track === "mental" ? "text-rune" : "text-gold";

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={cn("text-sm font-semibold", accent)}>{title}</span>
        <span className="tnum text-xs text-muted-foreground">
          {used} / {slots} increment{slots === 1 ? "" : "s"} assigned
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        +2 increments at levels {incrementLevels.join(", ")} ({abilities.map((a) => a.toUpperCase()).join(" / ")}).
        {nextUnlock ? ` Next at level ${nextUnlock}.` : " Fully unlocked."}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <select
          value={pick}
          aria-label={`${title} — ability to enhance`}
          onChange={(e) => setPick(e.target.value)}
          className="h-11 rounded-md border border-border bg-background px-2 text-sm uppercase text-foreground sm:h-9"
        >
          {abilities.map((a) => (
            <option key={a} value={a}>
              {a.toUpperCase()}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={add} disabled={slotsFull || atCap}>
          <Plus className="size-4" /> Assign +2
        </Button>
        {slotsFull && !overAssigned && (
          <span className="pb-1 text-[11px] text-muted-foreground">All available increments assigned.</span>
        )}
        {!slotsFull && atCap && (
          <span className="pb-1 text-[11px] text-muted-foreground">{pick.toUpperCase()} is already at +6.</span>
        )}
      </div>

      {used === 0 ? (
        <p className="text-xs text-muted-foreground">No prowess assigned yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {abilities
            .filter((a) => (counts[a] ?? 0) > 0)
            .map((a) => {
              const assignedCount = counts[a]!;
              // The engine truth: slot- and +6-cap-limited. effCount is the increments that actually apply.
              const effBonus = bonuses[a] ?? 0;
              const effCount = effBonus / 2;
              const ignored = assignedCount - effCount;
              return (
                <span
                  key={a}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                    effBonus > 0
                      ? "border-border bg-surface text-foreground"
                      : "border-border/60 bg-surface/50 text-muted-foreground",
                  )}
                >
                  <span className="font-medium">
                    {effBonus > 0 ? `+${effBonus} ` : ""}
                    {a.toUpperCase()}
                  </span>
                  {ignored > 0 ? (
                    <span className="text-warning">
                      ({ignored} not applied)
                    </span>
                  ) : (
                    effCount > 1 && <span className="text-muted-foreground">(×{effCount})</span>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove one +2 ${a.toUpperCase()} prowess increment`}
                    onClick={() => removeOne(a)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              );
            })}
        </div>
      )}

      {overAssigned && (
        <p className="text-[11px] text-warning">
          {used - slots} increment{used - slots === 1 ? "" : "s"} beyond what your level grants — the extra{" "}
          {used - slots === 1 ? "one is" : "ones are"} ignored until you level up. Remove some to clear this.
        </p>
      )}
    </div>
  );
}
