"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CharacterViewModel } from "@/lib/character/view-model";
import { groupManeuversByDiscipline } from "@/lib/character/path-of-war-presets";
import { CollapsibleGroup, COLLAPSE_WHEN_OVER } from "./collapsible-group";

type ManeuverView = NonNullable<CharacterViewModel["pathOfWar"]>["maneuvers"][number];

/**
 * Read-view Path of War maneuvers — grouped by DISCIPLINE (the SphereSubsection collapse pattern:
 * groups with more than 6 entries start collapsed) with tap-to-expand cached-detail rows (the
 * PsionicPowerList pattern). Renders only the already-gated vm.pathOfWar payload:
 * description/notes arrive undefined for non-owner viewers, so the detail row simply shows less.
 */
export function ManeuverList({ maneuvers }: { maneuvers: ManeuverView[] }) {
  const groups = groupManeuversByDiscipline(maneuvers);
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <DisciplineGroup key={g.discipline} discipline={g.discipline} maneuvers={g.maneuvers} />
      ))}
    </div>
  );
}

function DisciplineGroup({ discipline, maneuvers }: { discipline: string; maneuvers: ManeuverView[] }) {
  return (
    <CollapsibleGroup title={discipline} count={maneuvers.length} defaultOpen={maneuvers.length <= COLLAPSE_WHEN_OVER}>
      {maneuvers.map((m, i) => (
        <ManeuverRow key={`${m.name}-${i}`} maneuver={m} />
      ))}
    </CollapsibleGroup>
  );
}

function ManeuverRow({ maneuver: m }: { maneuver: ManeuverView }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const isStance = m.entryKind === "stance";
  const hasDetail = Boolean(
    m.initiationAction ||
      m.range ||
      m.target ||
      m.duration ||
      m.savingThrow ||
      m.prerequisites ||
      m.description ||
      m.notes,
  );
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-surface-raised/30">
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
          <span className="min-w-0 truncate text-sm text-foreground">{m.name}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            L{m.level}
          </Badge>
          {m.maneuverType && (
            <Badge variant="default" className="shrink-0 text-[10px]">
              {m.maneuverType}
            </Badge>
          )}
          {isStance && m.stanceActive && (
            <Badge variant="gold" className="shrink-0 text-[10px]">
              Active
            </Badge>
          )}
          {!isStance && m.readied && !m.expended && (
            <Badge variant="success" className="shrink-0 text-[10px]">
              Readied
            </Badge>
          )}
          {m.expended && (
            <Badge variant="warning" className="shrink-0 text-[10px]">
              Expended
            </Badge>
          )}
          {m.granted && (
            <Badge variant="gold" className="shrink-0 text-[10px]">
              Granted
            </Badge>
          )}
          {m.saveDc != null && m.savingThrow && (
            <span className="tnum shrink-0 text-xs text-muted-foreground">DC {m.saveDc}</span>
          )}
        </button>
      </div>

      {open && hasDetail && (
        <div id={panelId} className="border-t border-border/50 px-3 py-2 text-xs">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <DetailField label="Initiation action" value={m.initiationAction} />
            <DetailField label="Range" value={m.range} />
            <DetailField label="Target" value={m.target} />
            <DetailField label="Duration" value={m.duration} />
            <DetailField label="Save" value={m.savingThrow} />
            <DetailField label="Prerequisites" value={m.prerequisites} />
          </dl>
          {m.description && (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{m.description}</p>
          )}
          {m.notes && (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
              <span className="font-semibold text-gold">Notes: </span>
              {m.notes}
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
