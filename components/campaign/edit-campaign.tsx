"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateCampaignDetailsAction } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** GM/owner edit of a campaign's name + description (so a typo no longer forces delete + recreate). */
export function EditCampaign({
  campaignId,
  name,
  description,
}: {
  campaignId: string;
  name: string;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftDesc, setDraftDesc] = useState(description);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setDraftName(name);
          setDraftDesc(description);
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil className="size-4" /> Edit details
      </Button>
    );
  }

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateCampaignDetailsAction(campaignId, draftName, draftDesc);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-raised p-3">
      <div className="space-y-1">
        <label htmlFor="camp-name" className="text-xs font-medium text-muted-foreground">
          Name
        </label>
        <Input
          id="camp-name"
          value={draftName}
          disabled={pending}
          onChange={(e) => setDraftName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="camp-desc" className="text-xs font-medium text-muted-foreground">
          Description
        </label>
        <textarea
          id="camp-desc"
          value={draftDesc}
          rows={2}
          disabled={pending}
          onChange={(e) => setDraftDesc(e.target.value)}
          className="flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={pending || !draftName.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
