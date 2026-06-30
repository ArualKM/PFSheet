"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SpellView } from "@/lib/character/view-model";

/**
 * A spell row: a compact line (name · L{level} · school) that expands on tap to show
 * the full cached compendium detail. Used on the read-only sheet and the public share
 * view. `right` renders trailing content (e.g. a used/prepared counter or an action).
 */
export function SpellRow({ spell, right }: { spell: SpellView; right?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const schoolLine = [spell.subschool, spell.descriptor].filter(Boolean).join(", ");
  const hasDetail = Boolean(
    spell.description ||
      spell.castingTime ||
      spell.components ||
      spell.range ||
      spell.area ||
      spell.targets ||
      spell.effect ||
      spell.duration ||
      spell.savingThrow ||
      spell.spellResistance ||
      schoolLine ||
      spell.notes,
  );

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
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <span className="truncate text-sm text-foreground">{spell.name}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            L{spell.level}
            {spell.effectiveLevel != null && spell.effectiveLevel !== spell.level ? `→${spell.effectiveLevel}` : ""}
          </Badge>
          {spell.atWill && (
            <Badge variant="rune" className="shrink-0 text-[10px]">
              at will
            </Badge>
          )}
          {spell.metamagic?.length ? (
            <span
              className="shrink-0 truncate text-[11px] font-medium text-rune"
              title={spell.metamagic.join(", ")}
            >
              {spell.metamagic.join(", ")}
            </span>
          ) : null}
          {spell.school && <span className="shrink-0 truncate text-xs text-muted-foreground">{spell.school}</span>}
        </button>
        {right}
      </div>

      {open && hasDetail && (
        <div id={panelId} className="border-t border-border/50 px-3 py-2 text-xs">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <DetailField label="School" value={schoolLine} />
            <DetailField label="Casting time" value={spell.castingTime} />
            <DetailField label="Components" value={spell.components} />
            <DetailField label="Range" value={spell.range} />
            <DetailField label="Area" value={spell.area} />
            <DetailField label="Targets" value={spell.targets} />
            <DetailField label="Effect" value={spell.effect} />
            <DetailField label="Duration" value={spell.duration} />
            <DetailField label="Save" value={spell.savingThrow} />
            <DetailField label="Spell resistance" value={spell.spellResistance} />
          </dl>
          {spell.description && (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{spell.description}</p>
          )}
          {spell.notes && <p className="mt-2 whitespace-pre-wrap text-gold">Notes: {spell.notes}</p>}
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </>
  );
}
