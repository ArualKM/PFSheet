"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readLevelUpMeta, writeLevelUpMeta } from "@pathforge/schema";
import { Button } from "@/components/ui/button";
import { formatModifier } from "@/lib/utils";
import { StatChip } from "../../editor/picker-shell";
import { CollapsibleGroup } from "../../collapsible-group";
import { LevelUpFeatsStep } from "./feats-step";
import { LevelUpAsiStep } from "./asi-step";
import { LevelUpSpellsStep } from "./spells-step";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

type AnythingElsePanel = "feats" | "asi" | "spells" | null;

/**
 * Level-Up Wizard Stage 7 — the terminal Review/Finish step
 * (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`, "The step list" + "Conditional steps" point 2). Two halves:
 *
 * 1. A before/after summary built ENTIRELY from `meta` (the ONLY source of truth for "where this
 *    session started" — never re-derived by guessing, the same discipline `hp-step.tsx`/
 *    `skills-step.tsx`'s wrappers already hold to) plus the engine-computed CURRENT values. BAB /
 *    saves / initiative are 100% engine-computed and never get a manual step (Ground Truth point 7
 *    — "saving throws, initiative, and attack values are engine-computed — they review on the
 *    Finish card, not a manual step", `handoff-step.tsx`'s own comment) — same accessors as that
 *    step's chip row, copied verbatim.
 * 2. The "Anything else?" disclosure (Conditional steps point 2 — the Master Plan's own flagged
 *    judgment call, built as specified regardless of the pending owner redline): three buttons that
 *    open the SAME `feats`/`asi`/`spells` step components INLINE, regardless of what this session's
 *    visibility predicates decided — a hidden step only ever meant "not in the default Back/Next
 *    walk," never "blocked," and PF1e homebrew tables routinely grant an extra feat or stat bump a
 *    formula wouldn't predict.
 *
 * Finish mirrors `handoff-step.tsx` byte-equivalent in behavior: flip the flag via `ed.update`, then
 * wait for `ed.status` to reach "saved"/"offline" before navigating, with a 4s fallback — except a
 * sync conflict, which HOLDS navigation indefinitely (no fallback), because leaving would strand the
 * unsaved merge in memory. Unlike the create wizard (which hands off into `/edit`), Finish here lands
 * on the character OVERVIEW (`/characters/${characterId}`) — the player just leveled up; the sheet
 * itself is the payoff, not another editor screen.
 */
export function LevelUpReviewStep({ ed, characterId }: { ed: CharacterEditorApi; characterId: string }) {
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);
  const [openPanel, setOpenPanel] = useState<AnythingElsePanel>(null);

  // Identical navigation-vs-autosave-race handling to handoff-step.tsx — see that file's comment for
  // the full reasoning. "error" still falls back after 4s — levelUp.active stays true on the server,
  // so the next /level-up visit resumes cleanly via the interstitial's "Resume level-up" path.
  useEffect(() => {
    if (!finishing) return;
    if (ed.status === "conflict") return;
    if (ed.status === "saved" || ed.status === "offline") {
      router.push(`/characters/${characterId}`);
      return;
    }
    const timer = setTimeout(() => router.push(`/characters/${characterId}`), 4000);
    return () => clearTimeout(timer);
  }, [finishing, ed.status, characterId, router]);

  const finish = () => {
    ed.update((c) => {
      writeLevelUpMeta(c, { active: false, completedAt: new Date().toISOString() });
    });
    setFinishing(true);
  };

  const meta = readLevelUpMeta(ed.draft);
  const { summary } = ed.computed;
  const currentLevel = ed.draft.identity.totalLevel;
  const currentMaxHp = summary.hp.max;
  const hasHpBaseline = typeof meta?.startingMaxHp === "number";
  const hpDelta = hasHpBaseline ? currentMaxHp - meta!.startingMaxHp! : 0;

  // Per-class gains vs the session-start snapshot, matched by id (never by array position — classes
  // can be reordered/added). A class with no snapshot entry was added THIS session (multiclass), not
  // "leveled" — labeled "new" rather than a misleading "0 → N".
  const classRows = ed.draft.identity.classes.map((cl) => {
    const name = cl.compendiumPreset?.name ?? cl.name;
    const before = meta?.startingClasses?.find((s) => s.id === cl.id)?.level;
    return { id: cl.id, name, before, after: cl.level };
  });

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-rune">Almost there</p>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Review your level-up</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          {ed.draft.identity.name || "Your character"} is ready. Everything below is already saved —
          confirm it looks right, then finish. You can always fine-tune from the full editor after.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-border/70 bg-surface-sunken/60 p-4">
        <h3 className="text-sm font-semibold text-foreground">Before → after</h3>
        <div className="flex flex-wrap gap-2">
          <StatChip label="Level" value={meta ? `${meta.fromLevel} → ${currentLevel}` : currentLevel} tone="gold" />
          {hasHpBaseline && (
            <StatChip
              label="Max HP"
              value={`${meta!.startingMaxHp} → ${currentMaxHp} (${hpDelta >= 0 ? "+" : ""}${hpDelta})`}
              tone="good"
            />
          )}
        </div>
        {classRows.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {classRows.map((row) => (
              <StatChip
                key={row.id}
                label={row.name}
                value={row.before != null ? `${row.before} → ${row.after}` : `new · ${row.after}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/70 bg-surface-sunken/60 p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Current values</h3>
        <div className="flex flex-wrap gap-2">
          <StatChip label="HP" value={`${summary.hp.current}/${summary.hp.max}`} tone="good" />
          <StatChip label="AC" value={summary.ac} />
          <StatChip label="Fort" value={formatModifier(summary.fortitude)} />
          <StatChip label="Ref" value={formatModifier(summary.reflex)} />
          <StatChip label="Will" value={formatModifier(summary.will)} />
          <StatChip label="BAB" value={formatModifier(summary.bab)} />
          <StatChip label="Init" value={formatModifier(summary.initiative)} tone="rune" />
        </div>
      </div>

      <CollapsibleGroup title="Anything else?" defaultOpen={false}>
        <p className="max-w-prose text-xs text-muted-foreground">
          Homebrew tables grant extras a formula can&apos;t predict — these open the same tools
          regardless of what this level-up owed you.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="button"
            size="sm"
            variant={openPanel === "feats" ? "secondary" : "ghost"}
            aria-expanded={openPanel === "feats"}
            onClick={() => setOpenPanel((p) => (p === "feats" ? null : "feats"))}
          >
            Add a feat
          </Button>
          <Button
            type="button"
            size="sm"
            variant={openPanel === "asi" ? "secondary" : "ghost"}
            aria-expanded={openPanel === "asi"}
            onClick={() => setOpenPanel((p) => (p === "asi" ? null : "asi"))}
          >
            Increase an ability score
          </Button>
          <Button
            type="button"
            size="sm"
            variant={openPanel === "spells" ? "secondary" : "ghost"}
            aria-expanded={openPanel === "spells"}
            onClick={() => setOpenPanel((p) => (p === "spells" ? null : "spells"))}
          >
            Manage spells
          </Button>
        </div>
        {/* Only one open at a time (per the brief) — a fresh click swaps rather than stacking, so the
            disclosure never grows into three simultaneous pickers. */}
        {openPanel === "feats" && (
          <div className="pt-3">
            <LevelUpFeatsStep ed={ed} characterId={characterId} />
          </div>
        )}
        {openPanel === "asi" && (
          <div className="pt-3">
            <LevelUpAsiStep ed={ed} characterId={characterId} />
          </div>
        )}
        {openPanel === "spells" && (
          <div className="pt-3">
            <LevelUpSpellsStep ed={ed} characterId={characterId} />
          </div>
        )}
      </CollapsibleGroup>

      <div className="border-t border-border pt-4">
        {/* No revalidatePath here — Finish is client-only (the save loop persists through
            saveCharacterSheetAction, not a server action this component owns), exactly like the
            create wizard's handoff-step. The router.push target (the overview) may briefly serve a
            Router Cache hit (experimental.staleTimes.dynamic = 30s) instead of the just-finished
            level's fresh numbers — an accepted, pre-existing tradeoff this step doesn't newly
            introduce (the create wizard's own handoff has the same property navigating to /edit). */}
        <Button type="button" onClick={finish} disabled={finishing} className="min-h-11 w-full sm:w-auto">
          {finishing ? "Saving…" : "Finish level-up"}
        </Button>
      </div>
    </div>
  );
}
