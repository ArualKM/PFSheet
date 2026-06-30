"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2, X } from "lucide-react";
import { createSnapshotAction, deleteSnapshotAction } from "@/lib/actions/snapshots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateSnapshotButton({ characterId }: { characterId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    setError(null);
    startTransition(async () => {
      const res = await createSnapshotAction(characterId, label);
      if (res.error) setError(res.error);
      else {
        setLabel("");
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Camera className="size-4" /> Create snapshot
      </Button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={label}
          autoFocus
          maxLength={120}
          placeholder="Label (e.g. Before level 5)"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              create();
            }
          }}
          className="h-11 sm:h-9"
        />
        <Button type="button" size="sm" onClick={create} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-9 sm:size-9" onClick={() => setOpen(false)}>
          <X className="size-4" />
          <span className="sr-only">Cancel</span>
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function DeleteSnapshotButton({
  characterId,
  snapshotId,
  label,
}: {
  characterId: string;
  snapshotId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const del = () => {
    if (!window.confirm(`Delete the snapshot "${label}"?`)) return;
    startTransition(async () => {
      const res = await deleteSnapshotAction(characterId, snapshotId);
      if (!res.error) router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 sm:size-8"
      disabled={pending}
      onClick={del}
      aria-label={`Delete snapshot ${label}`}
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}
