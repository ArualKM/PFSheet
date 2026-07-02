"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CharacterViewModel } from "@/lib/character/view-model";
import { groupPowersByLevel } from "@/lib/character/psionic-powers";

type PowerView = NonNullable<CharacterViewModel["psionics"]>["powers"][number];

/**
 * Read-view psionic powers list — powers grouped by level (like the spell list) with
 * tap-to-expand cached-detail rows (the SpellRow/EntryDetailRow pattern). Renders only
 * the already-gated vm.psionics payload: description/augment/special/mythic arrive undefined
 * for non-owner viewers, so the detail row simply shows less.
 */
export function PsionicPowerList({ powers }: { powers: PowerView[] }) {
  const groups = groupPowersByLevel(powers);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.level} className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Level {g.level} <span className="text-foreground">({g.powers.length})</span>
          </p>
          <div className="space-y-1">
            {g.powers.map((p, i) => (
              <PowerRow key={`${p.name}-${i}`} power={p} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PowerRow({ power }: { power: PowerView }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasDetail = Boolean(
    power.discipline ||
      power.descriptors ||
      power.display ||
      power.manifestingTime ||
      power.range ||
      power.targetAreaEffect ||
      power.duration ||
      power.savingThrow ||
      power.powerResistance ||
      power.description ||
      power.augment ||
      power.special ||
      power.mythic,
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
          <span className="truncate text-sm text-foreground">{power.name}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            L{power.level}
          </Badge>
          {power.ppCost != null && (
            <Badge variant="rune" className="shrink-0 text-[10px]">
              {power.ppCost} PP
            </Badge>
          )}
          {power.discipline && (
            <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">
              {power.discipline}
            </span>
          )}
        </button>
      </div>

      {open && hasDetail && (
        <div id={panelId} className="border-t border-border/50 px-3 py-2 text-xs">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <DetailField label="Discipline" value={power.discipline} />
            <DetailField label="Descriptors" value={power.descriptors} />
            <DetailField label="Display" value={power.display} />
            <DetailField label="Manifesting time" value={power.manifestingTime} />
            <DetailField label="Range" value={power.range} />
            <DetailField label="Target/Area" value={power.targetAreaEffect} />
            <DetailField label="Duration" value={power.duration} />
            <DetailField label="Save" value={power.savingThrow} />
            <DetailField label="Power resistance" value={power.powerResistance} />
          </dl>
          {power.description && (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{power.description}</p>
          )}
          {power.augment && (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
              <span className="font-semibold text-gold">Augment: </span>
              {power.augment}
            </p>
          )}
          {power.mythic && (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
              <span className="font-semibold text-gold">Mythic: </span>
              {power.mythic}
            </p>
          )}
          {power.special && (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
              <span className="font-semibold text-foreground">Special: </span>
              {power.special}
            </p>
          )}
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
      <dd className="whitespace-pre-wrap text-foreground">{value}</dd>
    </>
  );
}
