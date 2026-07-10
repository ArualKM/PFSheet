"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { writeWizardMeta } from "@pathforge/schema";
import { Button } from "@/components/ui/button";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

const WHAT_YOULL_PICK = [
  "A race — shapes your ability scores, size, and speed",
  "A class — your role in the party, and where your power comes from",
  "Ability scores — how strong, tough, smart, and skilled you are",
  "Skills, starting gear, and a few flavor details",
];

/** §4.3 "welcome-step.tsx" — pure copy, no wrapped editor. The escape hatch sets
 *  `wizard.active = false` and hands off straight to the full editor, for a player who doesn't need
 *  the hand-holding. */
export function WelcomeStep({ ed, characterId }: { ed: CharacterEditorApi; characterId: string }) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  // Navigating away (router.push) unmounts this component, which cancels the hook's pending
  // debounced autosave (~900ms) before it fires — an immediate ed.update()-then-push can lose the
  // flag flip. Wait for the save to actually land (ed.status flips to "saved", or "offline" once the
  // outbox has durably queued it — the fresh /edit mount recovers an offline-queued draft from the
  // outbox on its own) before navigating, with a bounded fallback so a stuck save can't trap the
  // player. See wizard-shell.tsx / the session report for the full note; use-character-editor.ts
  // itself is NOT modified (no exposed flush() to call instead).
  useEffect(() => {
    if (!exiting) return;
    // A sync conflict HOLDS navigation (no fallback): the shell shows ConflictResolver; leaving
    // would strand the unsaved merge in memory. Resolution flows back through saving → saved.
    if (ed.status === "conflict") return;
    if (ed.status === "saved" || ed.status === "offline") {
      router.push(`/characters/${characterId}/edit`);
      return;
    }
    const timer = setTimeout(() => router.push(`/characters/${characterId}/edit`), 4000);
    return () => clearTimeout(timer);
  }, [exiting, ed.status, characterId, router]);

  const skipToEditor = () => {
    ed.update((c) => {
      writeWizardMeta(c, { active: false });
    });
    setExiting(true);
  };

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-rune">Welcome</p>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Let&rsquo;s build your character</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          A Pathfinder character is a hero built from a few core choices — a race, a class, and six
          ability scores — plus the skills, gear, and details that make them yours. We&rsquo;ll walk
          through each one together. Nothing here is permanent, and you can change any of it later in
          the full editor.
        </p>
      </div>

      <div className="rounded-lg border border-border/70 bg-surface-sunken/60 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What you&rsquo;ll pick next
        </p>
        <ul className="space-y-1.5 text-sm text-foreground">
          {WHAT_YOULL_PICK.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-gold">
                •
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={skipToEditor}
          disabled={exiting}
          className="min-h-11"
        >
          {exiting ? "Taking you to the editor…" : "I've done this before — skip to the blank editor"}
        </Button>
      </div>
    </div>
  );
}
