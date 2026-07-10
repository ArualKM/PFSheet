"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { writeWizardMeta } from "@pathforge/schema";
import { Button } from "@/components/ui/button";
import { formatModifier } from "@/lib/utils";
import { StatChip } from "../../editor/picker-shell";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/** §4.3 "handoff-step.tsx" — no wrapped editor, just a summary card from `ed.computed.summary` +
 *  `ed.draft.identity`, and the Finish action that closes the wizard out and lands in the full
 *  editor with everything already populated (same `ed`, same save loop — nothing reloads). */
export function HandoffStep({ ed, characterId }: { ed: CharacterEditorApi; characterId: string }) {
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);

  // Same navigation-vs-autosave-race concern as welcome-step.tsx's escape hatch: wait for the
  // Finish edit to actually save (or be durably queued offline) before navigating away, with a
  // bounded fallback. use-character-editor.ts is not modified — no flush() to await instead.
  useEffect(() => {
    if (!finishing) return;
    // A sync conflict HOLDS navigation (no fallback timer): the shell shows ConflictResolver and
    // leaving would strand the unsaved merge in memory. Once resolved, status flows through
    // saving → saved and this effect re-fires and navigates. "error" still falls back after 4s —
    // wizard.active stays true on the server, so the next /wizard visit resumes cleanly.
    if (ed.status === "conflict") return;
    if (ed.status === "saved" || ed.status === "offline") {
      router.push(`/characters/${characterId}/edit`);
      return;
    }
    const timer = setTimeout(() => router.push(`/characters/${characterId}/edit`), 4000);
    return () => clearTimeout(timer);
  }, [finishing, ed.status, characterId, router]);

  const finish = () => {
    ed.update((c) => {
      writeWizardMeta(c, { active: false, completedAt: new Date().toISOString() });
    });
    setFinishing(true);
  };

  const { identity } = ed.draft;
  const { summary } = ed.computed;
  const classLine = identity.classes.length
    ? identity.classes.map((c) => `${c.name} ${c.level}`).join(" / ")
    : "No class chosen yet";
  const raceLine = identity.race?.trim() || identity.raceApplied?.name || "No race chosen yet";

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-rune">Almost there</p>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">{identity.name || "Your character"}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Your character is ready. Everything you set is saved — head to the full editor for depth:
          buffs, feats, spells, and more.
        </p>
      </div>

      <div className="rounded-lg border border-border/70 bg-surface-sunken/60 p-4">
        <p className="text-sm font-medium text-foreground">
          {raceLine} · {classLine} · Level {summary.totalLevel || 1}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatChip label="HP" value={`${summary.hp.current}/${summary.hp.max}`} tone="good" />
          <StatChip label="AC" value={summary.ac} />
          <StatChip label="Fort" value={formatModifier(summary.fortitude)} />
          <StatChip label="Ref" value={formatModifier(summary.reflex)} />
          <StatChip label="Will" value={formatModifier(summary.will)} />
          <StatChip label="BAB" value={formatModifier(summary.bab)} />
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <Button type="button" onClick={finish} disabled={finishing} className="min-h-11 w-full sm:w-auto">
          {finishing ? "Saving…" : "Finish — go to full editor"}
        </Button>
      </div>
    </div>
  );
}
