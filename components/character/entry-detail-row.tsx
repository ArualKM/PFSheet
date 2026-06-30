"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A read-view row: a compact line (name + trailing badges) that expands on tap to show detail (feat benefit /
 * prerequisites, feature/trait description, etc.). Mirrors {@link SpellRow} so feats/features/traits read the
 * same as spells on the sheet + the public share. `details` is the expanded content; pass `undefined` for a
 * non-expandable row (the chevron is hidden + the button disabled).
 */
export function EntryDetailRow({ name, badges, details }: { name: string; badges?: ReactNode; details?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasDetail = !!details;
  return (
    <div className="rounded-md border border-border/70 bg-surface-raised/30">
      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
          onClick={() => hasDetail && setOpen((v) => !v)}
          aria-expanded={hasDetail ? open : undefined}
          aria-controls={hasDetail ? panelId : undefined}
          disabled={!hasDetail}
        >
          {hasDetail ? (
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <span className="truncate text-sm text-foreground">{name}</span>
          {badges}
        </button>
      </div>
      {open && hasDetail && (
        <div id={panelId} className="space-y-1.5 border-t border-border/50 px-3 py-2 text-xs">
          {details}
        </div>
      )}
    </div>
  );
}

/** A labelled detail paragraph inside an expanded {@link EntryDetailRow} (e.g. "Prerequisites: …"). */
export function DetailPara({ label, value, tone }: { label?: string; value?: string; tone?: "muted" | "gold" }) {
  if (!value || !value.trim()) return null;
  return (
    <p className={cn("whitespace-pre-wrap", tone === "gold" ? "text-gold" : "text-muted-foreground")}>
      {label && <span className="font-medium text-foreground">{label}: </span>}
      {value}
    </p>
  );
}
