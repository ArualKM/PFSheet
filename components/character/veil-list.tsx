"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CharacterViewModel } from "@/lib/character/view-model";

type AkashicVm = NonNullable<CharacterViewModel["akashic"]>;
type ShapedView = AkashicVm["shaped"][number];
type VeilView = AkashicVm["veils"][number];

const nameKey = (s: string) => s.trim().toLowerCase();

/**
 * Read-view Akashic veils — the shaped-for-the-day loadout first (slot chip + essence pips +
 * save DC + bind state), then the remaining veils known in a collapsible group (the
 * ManeuverList/SphereSubsection pattern: more than 6 entries start collapsed). Renders only the
 * already-gated vm.akashic payload: effect/bindEffect/notes arrive undefined for non-owner
 * viewers, so the detail row simply shows less; metadata-only compendium veils render
 * "Text in {source}", never fake rules.
 */
export function VeilList({ akashic }: { akashic: AkashicVm }) {
  // Shaped rows join their veil detail by STABLE id (shaped.veilId → veil.id) with a name
  // fallback for legacy payloads/dangling refs only — a name join alone collides on same-named
  // veils (two default-named customs, or a custom renamed to match a compendium veil): the
  // last-wins Map showed the WRONG detail and the name-keyed exclusion dropped the unshaped
  // duplicate from "Known, not shaped" entirely.
  const detailById = new Map(akashic.veils.map((v) => [v.id, v]));
  const detailByName = new Map(akashic.veils.map((v) => [nameKey(v.name), v]));
  const resolve = (s: ShapedView) => detailById.get(s.veilId) ?? detailByName.get(nameKey(s.name));
  const shapedVeilIds = new Set(akashic.shaped.map((s) => resolve(s)?.id ?? s.veilId));
  const unshaped = akashic.veils.filter((v) => !shapedVeilIds.has(v.id));
  return (
    <div className="space-y-2">
      {akashic.shaped.length > 0 && (
        <div className="space-y-1">
          {akashic.shaped.map((s) => (
            <ShapedVeilRow key={s.id} shaped={s} veil={resolve(s)} capacityCap={akashic.essence.capacityCap} />
          ))}
        </div>
      )}
      {unshaped.length > 0 && <UnshapedGroup veils={unshaped} shapedCount={akashic.shaped.length} />}
    </div>
  );
}

function EssencePips({ invested, cap }: { invested: number; cap: number }) {
  if (invested <= 0) return null;
  const dots = Math.min(invested, Math.max(cap, 1), 6);
  return (
    <span className="tnum shrink-0 text-xs text-muted-foreground">
      <span aria-hidden className="tracking-tighter text-gold">
        {"●".repeat(dots)}
      </span>{" "}
      {invested} essence
    </span>
  );
}

function VeilDetail({ veil, bound }: { veil: VeilView; bound: boolean }) {
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <DetailField label="Slots" value={veil.slots.join(", ")} />
        <DetailField label="Descriptors" value={veil.descriptors} />
        <DetailField label="Classes" value={veil.classNames?.join(", ")} />
      </dl>
      {veil.effect ? (
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{veil.effect}</p>
      ) : veil.source ? (
        <p className="mt-2 italic text-muted-foreground">Text in {veil.source}.</p>
      ) : null}
      {veil.bindEffect && (
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
          <span className={cn("font-semibold", bound ? "text-gold" : "text-foreground")}>Bind: </span>
          {veil.bindEffect}
        </p>
      )}
      {veil.notes && (
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
          <span className="font-semibold text-gold">Notes: </span>
          {veil.notes}
        </p>
      )}
      {veil.source && <p className="mt-2 text-[11px] text-muted-foreground">{veil.source}</p>}
    </>
  );
}

function ShapedVeilRow({
  shaped: s,
  veil,
  capacityCap,
}: {
  shaped: ShapedView;
  veil?: VeilView;
  capacityCap: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasDetail = Boolean(veil && (veil.effect || veil.bindEffect || veil.descriptors || veil.notes || veil.source));
  const warned = !s.bindValid || s.overCapacity;
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border bg-surface-raised/30",
        warned ? "border-warning/50" : "border-border/70",
        !s.enabled && "opacity-60",
      )}
    >
      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left disabled:cursor-default"
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
          <span className="min-w-0 truncate text-sm text-foreground">{s.name}</span>
          {s.slot.trim() && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {s.slot}
            </Badge>
          )}
          <EssencePips invested={s.essenceInvested} cap={capacityCap} />
          {s.bound && (
            <Badge variant={s.bindValid ? "gold" : "warning"} className="shrink-0 text-[10px]">
              Bound
            </Badge>
          )}
          {!s.bindValid && (
            <Badge variant="warning" className="shrink-0 text-[10px]">
              Bind locked
            </Badge>
          )}
          {s.overCapacity && (
            <Badge variant="warning" className="shrink-0 text-[10px]">
              Over capacity
            </Badge>
          )}
          {!s.enabled && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Inactive
            </Badge>
          )}
          <span className="tnum shrink-0 text-xs text-muted-foreground">DC {s.saveDc}</span>
        </button>
      </div>
      {open && hasDetail && veil && (
        <div id={panelId} className="border-t border-border/50 px-3 py-2 text-xs">
          <VeilDetail veil={veil} bound={s.bound && s.bindValid} />
        </div>
      )}
    </div>
  );
}

function UnshapedGroup({ veils, shapedCount }: { veils: VeilView[]; shapedCount: number }) {
  const [open, setOpen] = useState(shapedCount === 0 && veils.length <= 6);
  const panelId = useId();
  return (
    <div className="min-w-0 rounded-md border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
      >
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Known, not shaped
        </span>
        <span className="rounded-full bg-surface-raised px-1.5 text-[10px] font-medium text-muted-foreground">
          {veils.length}
        </span>
      </button>
      {open && (
        <div id={panelId} className="space-y-1 border-t border-border/50 p-2">
          {veils.map((v) => (
            <KnownVeilRow key={v.id} veil={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function KnownVeilRow({ veil: v }: { veil: VeilView }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasDetail = Boolean(v.effect || v.bindEffect || v.descriptors || v.notes || v.source);
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-surface-raised/30">
      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left disabled:cursor-default"
          onClick={() => hasDetail && setOpen((o) => !o)}
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
          <span className="min-w-0 truncate text-sm text-foreground">{v.name}</span>
          {v.slots.map((slot) => (
            <Badge key={slot} variant="outline" className="shrink-0 text-[10px]">
              {slot}
            </Badge>
          ))}
          {v.bindEffect && (
            <Badge variant="gold" className="shrink-0 text-[10px]">
              Bind
            </Badge>
          )}
        </button>
      </div>
      {open && hasDetail && (
        <div id={panelId} className="border-t border-border/50 px-3 py-2 text-xs">
          <VeilDetail veil={v} bound={false} />
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-foreground">{value}</dd>
    </>
  );
}
