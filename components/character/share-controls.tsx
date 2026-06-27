"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Link2 } from "lucide-react";
import { setCharacterVisibilityAction } from "@/lib/actions/characters";
import { Button } from "@/components/ui/button";

type Visibility = "private" | "campaign" | "unlisted" | "public";

export function ShareControls({
  characterId,
  initialVisibility,
  initialSlug,
  appUrl,
}: {
  characterId: string;
  initialVisibility: Visibility;
  initialSlug: string | null;
  appUrl: string;
}) {
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const shareUrl = slug ? `${appUrl.replace(/\/$/, "")}/c/${slug}` : null;
  const isShared = visibility === "public" || visibility === "unlisted";

  const change = (next: Visibility) => {
    startTransition(async () => {
      const res = await setCharacterVisibilityAction(characterId, next);
      if (!res.error) {
        setVisibility(res.visibility ?? next);
        if (res.slug !== undefined) setSlug(res.slug);
      }
    });
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="visibility">
        Visibility
      </label>
      <select
        id="visibility"
        value={visibility}
        disabled={pending}
        onChange={(e) => change(e.target.value as Visibility)}
        className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground disabled:opacity-60"
      >
        <option value="private">Private</option>
        <option value="unlisted">Unlisted (link only)</option>
        <option value="public">Public</option>
      </select>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={copy}
        disabled={!isShared || !shareUrl}
        title={isShared ? shareUrl ?? "" : "Make the character public or unlisted to share"}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy link"}
      </Button>

      {isShared && shareUrl && (
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-rune hover:underline"
        >
          <Link2 className="size-3.5" /> Open share view
        </a>
      )}
    </div>
  );
}
