"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { applyConflictChoices, type ConflictChoice, type MergeConflict } from "@/lib/character/merge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function humanizePath(path: string): string {
  return path
    .replace(/\[id=[^\]]+\]/g, "")
    .split(".")
    .filter(Boolean)
    .join(" › ");
}

function preview(v: unknown): string {
  if (v === undefined || v === null) return "(removed)";
  if (typeof v === "string") return v.length ? v : "(empty)";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `(${v.length} item${v.length === 1 ? "" : "s"})`;
  return "(changed)";
}

const allChoices = (conflicts: MergeConflict[], c: ConflictChoice): Record<string, ConflictChoice> =>
  Object.fromEntries(conflicts.map((x) => [x.path, c]));

/**
 * Per-field conflict resolution (S5b Phase 2). When two devices change the same field, the
 * user picks a winner per field (defaulting to "mine"); "Apply" commits the resolved document.
 * The disjoint edits are already auto-merged, so only the genuine collisions appear here.
 */
export function ConflictResolver({
  merged,
  conflicts,
  serverSheet,
  onResolve,
}: {
  merged: PathForgeCharacterV1;
  conflicts: MergeConflict[];
  serverSheet: PathForgeCharacterV1;
  onResolve: (resolved: PathForgeCharacterV1) => void;
}) {
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const choiceFor = (path: string): ConflictChoice => choices[path] ?? "mine";
  const pick = (path: string, c: ConflictChoice) => setChoices((prev) => ({ ...prev, [path]: c }));

  // serverSheet is referenced so a "Take all theirs" resolution is provably the server doc.
  void serverSheet;

  return (
    <div role="alert" className="rounded-lg border border-gold/40 bg-gold/10 p-4 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-gold">
        <CircleAlert className="size-4" /> This character was also edited on another device
      </p>
      <p className="mt-1 text-muted-foreground">
        Disjoint changes were merged automatically. {conflicts.length} field
        {conflicts.length === 1 ? "" : "s"} changed in both places — choose which wins:
      </p>

      <ul className="mt-3 space-y-2">
        {conflicts.map((c) => (
          <li key={c.path} className="rounded-md border border-border/60 bg-surface-raised p-2">
            <div className="text-xs font-medium text-foreground" title={c.path}>
              {humanizePath(c.path)}
            </div>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => pick(c.path, "mine")}
                aria-pressed={choiceFor(c.path) === "mine"}
                className={cn(
                  "rounded border px-2 py-1 text-left text-xs",
                  choiceFor(c.path) === "mine" ? "border-rune bg-rune/10 text-foreground" : "border-border text-muted-foreground",
                )}
              >
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Mine</span>
                <span className="block truncate">{preview(c.mine)}</span>
              </button>
              <button
                type="button"
                onClick={() => pick(c.path, "theirs")}
                aria-pressed={choiceFor(c.path) === "theirs"}
                className={cn(
                  "rounded border px-2 py-1 text-left text-xs",
                  choiceFor(c.path) === "theirs" ? "border-rune bg-rune/10 text-foreground" : "border-border text-muted-foreground",
                )}
              >
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Other device</span>
                <span className="block truncate">{preview(c.theirs)}</span>
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onResolve(applyConflictChoices(merged, conflicts, choices))}>
          Apply
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onResolve(applyConflictChoices(merged, conflicts, allChoices(conflicts, "mine")))}
        >
          Keep all mine
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onResolve(applyConflictChoices(merged, conflicts, allChoices(conflicts, "theirs")))}
        >
          Take all theirs
        </Button>
      </div>
    </div>
  );
}
