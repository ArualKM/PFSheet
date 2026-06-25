"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteCampaignAction } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";

export function DeleteCampaign({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const del = () => {
    if (!window.confirm(`Delete "${campaignName}"? This removes the roster and all reviews. This cannot be undone.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteCampaignAction(campaignId);
      // On success the action redirects; only an error returns here.
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="space-y-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={del} disabled={pending} className="text-danger hover:bg-danger/10">
        <Trash2 className="size-4" /> {pending ? "Deleting…" : "Delete campaign"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
