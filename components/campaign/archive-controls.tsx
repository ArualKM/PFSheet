"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { archiveRosterCharacterAction, restoreRosterCharacterAction } from "@/lib/actions/campaigns";
import { ARCHIVE_REASONS } from "@/lib/character/review-status";
import { Button } from "@/components/ui/button";

export function ArchiveButton({
  campaignId,
  characterId,
}: {
  campaignId: string;
  characterId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(ARCHIVE_REASONS[0].key);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const archive = () => {
    setError(null);
    startTransition(async () => {
      const res = await archiveRosterCharacterAction(campaignId, characterId, reason);
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Archive character"
        title="Archive (dead, on break, retired…)"
      >
        <Archive className="size-4 text-muted-foreground" />
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={`archive-reason-${characterId}`}>
        Archive reason
      </label>
      <select
        id={`archive-reason-${characterId}`}
        value={reason}
        disabled={pending}
        onChange={(e) => setReason(e.target.value)}
        className="h-8 min-w-0 max-w-[8rem] rounded-lg border border-border bg-background px-2 text-xs text-foreground disabled:opacity-60"
      >
        {ARCHIVE_REASONS.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" variant="secondary" onClick={archive} disabled={pending}>
        {pending ? "…" : "Archive"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
        Cancel
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function RestoreButton({
  campaignId,
  characterId,
}: {
  campaignId: string;
  characterId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const restore = () => {
    setError(null);
    startTransition(async () => {
      const res = await restoreRosterCharacterAction(campaignId, characterId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={restore}
        disabled={pending}
        title={error ?? undefined}
      >
        <ArchiveRestore className="size-4" /> {pending ? "Restoring…" : "Restore"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
