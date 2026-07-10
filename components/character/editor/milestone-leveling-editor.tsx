"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  MILESTONE_DIFFICULTIES,
  MILESTONE_MAX_JOB_LEVEL,
  milestoneJobReward,
  type MilestoneLevelingBlock,
  type MilestoneDifficulty,
} from "@pathforge/schema";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField } from "./fields";
import { StatChip } from "./picker-shell";
import { cn } from "@/lib/utils";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Difficulty ladder tints for the job tiles — green → blue → gold → red conveys escalating risk.
 * The tone colors the border/bg only; the label + reward stay text-foreground for WCAG contrast. */
const MILESTONE_DIFFICULTY_TONES: Record<MilestoneDifficulty, string> = {
  easy: "border-success/40 bg-success/5 hover:border-success/60 hover:bg-success/10",
  medium: "border-rune/40 bg-rune/5 hover:border-rune/60 hover:bg-rune/10",
  hard: "border-gold/40 bg-gold/5 hover:border-gold/60 hover:bg-gold/10",
  deadly: "border-danger/40 bg-danger/5 hover:border-danger/60 hover:bg-danger/10",
};

export function MilestoneLevelingEditor({ ed }: { ed: CharacterEditorApi }) {
  const ml = ed.draft.milestoneLeveling;
  const summary = ed.computed.summary.milestoneLeveling;
  const charLevel = Math.max(1, ed.draft.identity.totalLevel || 1);
  const [jobLevel, setJobLevel] = useState(charLevel);

  const ensure = (mut: (m: MilestoneLevelingBlock) => void) =>
    ed.update((c) => {
      if (!c.milestoneLeveling) c.milestoneLeveling = { current: 0, log: [] };
      mut(c.milestoneLeveling);
    });
  const earnJob = (difficulty: MilestoneDifficulty) => {
    const value = milestoneJobReward(jobLevel, difficulty);
    ensure((m) => {
      m.current = Math.max(0, m.current + value);
      m.log = [{ id: newId("job"), jobLevel, difficulty, value }, ...(m.log ?? [])].slice(0, 30);
    });
  };
  const undoJob = (id: string) =>
    ensure((m) => {
      const entry = (m.log ?? []).find((e) => e.id === id);
      if (!entry) return;
      m.current = Math.max(0, m.current - entry.value);
      m.log = (m.log ?? []).filter((e) => e.id !== id);
    });

  const current = summary?.current ?? 0;
  const level = summary?.level ?? charLevel;
  const nextLevel = summary?.nextLevel ?? charLevel + 1;
  const intoLevel = summary?.intoLevel ?? 0;
  const span = summary?.span ?? 0;
  const remaining = summary?.remaining ?? 0;
  const atCap = !!summary?.atCap;
  const freeLevels = !atCap && span === 0;
  const showBar = !atCap && span > 0;
  const log = ml?.log ?? [];
  const pct = summary
    ? Math.min(100, summary.span > 0 ? (summary.intoLevel / summary.span) * 100 : 100)
    : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Replaces XP. Milestones are <strong>cumulative</strong> — finish jobs to earn them, and level up
        (bump your class level on the Identity tab) when your running total reaches the next threshold.
        Your level is read from your class level; the tables below come from the campaign rules.
      </p>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">Milestones</span>
          <StatChip label="level" value={level} tone="rune" />
          <StatChip label="earned" value={current} />
          <div className="ml-auto">
            {atCap ? (
              <StatChip value="Max level" />
            ) : freeLevels ? (
              <StatChip value="Levels freely" />
            ) : summary?.readyToLevel ? (
              <StatChip value="Ready to level up!" tone="gold" />
            ) : (
              <StatChip label={`to L${nextLevel}`} value={remaining} />
            )}
          </div>
        </div>
        {showBar && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-rune" style={{ width: `${pct}%` }} />
            </div>
            <div className="tnum text-xs text-muted-foreground">
              {intoLevel}/{span} toward level {nextLevel}
            </div>
          </>
        )}
      </div>

      <div className="space-y-2.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complete a job</h4>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            label="Job level"
            value={jobLevel}
            min={1}
            max={MILESTONE_MAX_JOB_LEVEL}
            onChange={(v) => setJobLevel(Math.max(1, Math.min(MILESTONE_MAX_JOB_LEVEL, v)))}
            className="w-24"
          />
          <p className="pb-2 text-[11px] text-muted-foreground">
            Tap a difficulty to bank its milestones. Rewards scale by job level (defaults to your
            level); jobs below level&nbsp;3 are worth 0.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MILESTONE_DIFFICULTIES.map((d) => {
            const value = milestoneJobReward(jobLevel, d);
            return (
              <button
                key={d}
                type="button"
                disabled={value <= 0}
                onClick={() => earnJob(d)}
                aria-label={`Complete a ${d} job for ${value} milestones`}
                className={cn(
                  "tap-target flex grow basis-[calc(50%-0.25rem)] flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors sm:grow-0 sm:basis-auto sm:min-w-[5rem] disabled:cursor-not-allowed disabled:opacity-40",
                  MILESTONE_DIFFICULTY_TONES[d],
                )}
              >
                <span className="text-xs font-medium capitalize text-foreground">{d}</span>
                <span className="tnum text-base font-semibold leading-none text-foreground">+{value}</span>
              </button>
            );
          })}
        </div>
      </div>

      {log.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent jobs</h4>
          <ul className="space-y-0.5 text-sm">
            {log.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-baseline gap-2">
                <span className="tnum text-rune">+{e.value}</span>
                <span className="flex-1 capitalize text-muted-foreground">
                  {e.difficulty} job <span className="normal-case">(lvl {e.jobLevel})</span>
                </span>
                <button
                  type="button"
                  onClick={() => undoJob(e.id)}
                  className="tap-target -my-1 shrink-0 rounded px-1 text-xs text-muted-foreground hover:text-danger"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group">
        <summary className="tap-target flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          Adjust total manually
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <NumberField
            label="Milestones earned"
            value={ml?.current ?? 0}
            min={0}
            onChange={(v) => ensure((m) => (m.current = Math.max(0, v)))}
            className="w-44"
          />
          <span className="pb-2 text-xs text-muted-foreground">
            Set the cumulative total directly (e.g. after a mid-campaign import).
          </span>
        </div>
      </details>
    </div>
  );
}
