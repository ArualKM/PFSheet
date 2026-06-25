"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { removeCharacterFromCampaignAction } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";

export function RemoveFromRoster({
  campaignId,
  characterId,
  characterName,
}: {
  campaignId: string;
  characterId: string;
  characterName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    if (!window.confirm(`Remove ${characterName} from this campaign?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeCharacterFromCampaignAction(campaignId, characterId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      disabled={pending}
      onClick={remove}
      aria-label={`Remove ${characterName} from campaign`}
      title={error ?? "Remove from campaign"}
    >
      <X className="size-4 text-muted-foreground" />
    </Button>
  );
}
