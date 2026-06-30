"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "./fields";
import { cn } from "@/lib/utils";

/**
 * Shared editor row for any list entry (feat / feature / trait / known spell / SLA / …): the COLLAPSED state is a
 * compact name + a chip strip summarising the entry; the chevron opens the caller's full editor. This is the one
 * pattern the whole edit UI uses — beautiful chips by default, a disclosure to customise every aspect,
 * mobile-friendly. Mirrors the bespoke ClassRow.
 */
export function EntryCard({
  name,
  onNameChange,
  nameLabel = "Name",
  chips,
  onRemove,
  removeLabel,
  defaultOpen = false,
  children,
}: {
  name: string;
  onNameChange: (v: string) => void;
  nameLabel?: string;
  chips?: ReactNode;
  onRemove: () => void;
  removeLabel: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Open when the parent signals this row should edit (e.g. just-added) — render-phase "adjust on prop change",
  // robust to the ed.update re-render ordering that a mount-only initial value loses to. Never force-closes, so
  // a user's manual toggle sticks.
  const [prevDefaultOpen, setPrevDefaultOpen] = useState(defaultOpen);
  if (defaultOpen !== prevDefaultOpen) {
    setPrevDefaultOpen(defaultOpen);
    if (defaultOpen) setOpen(true);
  }
  return (
    <div className="rounded-lg border border-border">
      <div className="space-y-1.5 p-2">
        <div className="flex flex-wrap items-end gap-2">
          <TextField label={nameLabel} value={name} onChange={onNameChange} className="min-w-0 flex-1 sm:max-w-[18rem]" />
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${open ? "Done" : "Edit"} editing ${name} details`}
              className="flex h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:h-10"
            >
              {open ? "Done" : "Edit"}
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
            <Button variant="ghost" size="icon" aria-label={removeLabel} onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        {chips && <div className="flex flex-wrap items-center gap-1">{chips}</div>}
      </div>
      {open && <div className="space-y-3 border-t border-border/50 p-2.5">{children}</div>}
    </div>
  );
}
