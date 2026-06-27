"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { setCommentStatusAction } from "@/lib/actions/gm-review";
import { Button } from "@/components/ui/button";

export function CommentControls({
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

  const setStatus = (status: string) => {
    startTransition(async () => {
      const res = await setCommentStatusAction(commentId, status, { campaignId, characterId });
      if (!res.error) router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        className="sm:size-8"
        disabled={pending}
        onClick={() => setStatus("resolved")}
        aria-label="Mark resolved"
        title="Mark resolved"
      >
        <Check className="size-3.5 text-success" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        className="sm:size-8"
        disabled={pending}
        onClick={() => setStatus("dismissed")}
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
