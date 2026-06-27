"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addCharacterToCampaignAction } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";

type Candidate = { id: string; name: string };

export function AddCharacter({
  campaignId,
  candidates,
}: {
  campaignId: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(candidates[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        All of your characters are already in this campaign.
      </p>
    );
  }

  const add = () => {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await addCharacterToCampaignAction(campaignId, selected);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="add-character">
          Character to add
        </label>
        <select
          id="add-character"
          value={selected}
          disabled={pending}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground disabled:opacity-60"
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={add} disabled={pending || !selected}>
          <Plus className="size-4" /> {pending ? "Adding…" : "Add to roster"}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
