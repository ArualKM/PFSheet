"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Layers } from "lucide-react";
import { setCommentStatusAction } from "@/lib/actions/gm-review";
import { adoptCampaignModulesAction } from "@/lib/actions/campaign-feedback";
import { Button } from "@/components/ui/button";

export function ResolveRequestButton({
  commentId,
  campaignId,
  characterId,
}: {
  commentId: string;
  campaignId: string;
  characterId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const resolve = () => {
    startTransition(async () => {
      const res = await setCommentStatusAction(commentId, "resolved", { campaignId, characterId });
      if (!res.error) router.refresh();
    });
  };

  return (
    <Button type="button" size="sm" variant="ghost" onClick={resolve} disabled={pending}>
      <Check className="size-4" /> Mark addressed
    </Button>
  );
}

export function AdoptModulesButton({
  characterId,
  campaignId,
  count,
}: {
  characterId: string;
  campaignId: string;
  count: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const adopt = () => {
    setError(null);
    startTransition(async () => {
      const res = await adoptCampaignModulesAction(characterId, campaignId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="secondary" onClick={adopt} disabled={pending}>
        <Layers className="size-4" /> Adopt {count} module{count === 1 ? "" : "s"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
