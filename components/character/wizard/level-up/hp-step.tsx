"use client";

import { readLevelUpMeta } from "@pathforge/schema";
import { HpStep } from "../steps/hp-step";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/**
 * Level-Up Wizard Stage 4 — the HP step (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "The step list").
 * `HpStep` is level-up-ready essentially as-is (Ground Truth): `computeMaxHpFromLevels` always
 * recomputes from ALL of a class's CURRENT total levels, not incrementally, so re-running it after a
 * level bump on the Class step just yields a new total — there's no "add this level's HP" special
 * case to build. This wrapper's only job is level-up copy plus a "+N this level-up" delta line that
 * reads `meta.startingMaxHp` — the ONLY source of truth for "where this session started" (never
 * re-derived by guessing, per Stage 4's own review point). Hidden entirely when `startingMaxHp` is
 * absent (an in-flight session started before the field existed, or a defensive read outside an
 * active session).
 */
export function LevelUpHpStep({ ed, characterId }: { ed: CharacterEditorApi; characterId: string }) {
  const meta = readLevelUpMeta(ed.draft);
  const startingMaxHp = meta?.startingMaxHp;
  const currentMaxHp = ed.computed.summary.hp.max;
  const hasBaseline = typeof startingMaxHp === "number";
  const delta = hasBaseline ? currentMaxHp - startingMaxHp! : 0;

  return (
    <div className="space-y-3">
      {hasBaseline && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-2.5 text-sm font-medium text-foreground">
          {delta >= 0 ? `+${delta}` : delta} HP this level-up{" "}
          <span className="font-normal text-muted-foreground">
            ({startingMaxHp} → {currentMaxHp})
          </span>
        </div>
      )}
      <HpStep
        ed={ed}
        characterId={characterId}
        heading="Level-up hit points"
        intro="Update your hit points for the level(s) you just gained — fine-tune anytime from the full editor’s Health tab."
      />
    </div>
  );
}
