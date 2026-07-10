"use client";

import { Check, CircleAlert, Cloud, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "./use-character-editor";

/**
 * The autosave status pill shared by every editor surface (the full editor's toolbar AND the
 * wizard's spine). Lives in its own tiny module — importing it from character-editor.tsx would
 * couple the consumer's client bundle to the entire ~5,400-line editor module graph (a confirmed
 * ~1.2MB regression on the wizard route when it was briefly imported from there).
 */
const STATUS_META: Record<SaveStatus, { label: string; icon: typeof Check; className: string }> = {
  saved: { label: "Saved", icon: Check, className: "text-success" },
  unsaved: { label: "Unsaved", icon: Cloud, className: "text-muted-foreground" },
  saving: { label: "Saving…", icon: Loader2, className: "text-rune" },
  error: { label: "Save failed", icon: CircleAlert, className: "text-danger" },
  conflict: { label: "Edit conflict", icon: CircleAlert, className: "text-gold" },
  offline: { label: "Offline — will sync", icon: CloudOff, className: "text-muted-foreground" },
};

export function SaveStatusBadge({ status, error }: { status: SaveStatus; error: string | null }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.className)}
      title={error ?? undefined}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("size-3.5", status === "saving" && "animate-spin")} />
      {meta.label}
    </span>
  );
}
