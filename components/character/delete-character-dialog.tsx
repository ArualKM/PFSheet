"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteCharacterAction } from "@/lib/actions/characters";
import { deleteConfirmMatches, deleteConfirmTarget } from "@/lib/character/delete-confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Owner-requested "are you sure?" protection on character deletion — collapsed by
 * default (a small destructive "Delete character" button), expands into an inline
 * confirm panel (no portal — matches the codebase's chip+disclosure idiom) with the
 * warning copy, a linked-companions notice, and a "type the name to confirm" field.
 * The destructive confirm button stays disabled until the typed value satisfies
 * `deleteConfirmMatches` (trimmed, case-sensitive; blank-named characters type DELETE
 * instead) — `deleteCharacterAction` re-verifies the SAME shared match server-side,
 * so this is a UX gate, not the real guard.
 */
export function DeleteCharacterDialog({
  characterId,
  characterName,
  companionCount = 0,
}: {
  characterId: string;
  characterName: string;
  companionCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The exact string the user must type: the trimmed name, or the literal DELETE
  // fallback when the stored name trims to empty (which would otherwise make the
  // character undeletable). Shared with the server action so the two can't drift.
  const confirmTarget = deleteConfirmTarget(characterName);
  const displayName = characterName.trim() || "this unnamed character";
  const matches = deleteConfirmMatches(typed, characterName);

  const reset = () => {
    setOpen(false);
    setTyped("");
    setError(null);
  };

  const confirmDelete = () => {
    if (!matches || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCharacterAction(characterId, typed);
      // On success the action redirects (never returns); only a failure resolves here.
      if (res?.error) setError(res.error);
    });
  };

  if (!open) {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete character
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-danger/40 bg-danger/5 p-4">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <span>
          This permanently deletes <strong>{displayName}</strong> and its history/snapshots. It
          cannot be undone.
        </span>
      </p>

      {companionCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {companionCount} linked companion{companionCount === 1 ? "" : "s"} will be unlinked, not
          deleted.
        </p>
      )}

      <div>
        <Label htmlFor="delete-character-confirm-name" className="mb-1 block text-xs text-muted-foreground">
          Type <strong className="text-foreground">{confirmTarget}</strong> to confirm
        </Label>
        <Input
          id="delete-character-confirm-name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoFocus
          aria-label="Type the character's name to confirm deletion"
          className="max-w-sm"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" size="sm" disabled={!matches || pending} onClick={confirmDelete}>
          <Trash2 className="size-4" /> {pending ? "Deleting…" : "Permanently delete"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
