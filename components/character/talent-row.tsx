"use client";

import { useId, useState } from "react";
import { ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type TalentDetail = {
  description: string | null;
  prerequisites: string | null;
  base_cost: string | null;
  talent_category: string | null;
  subcategory: string | null;
};

/**
 * A talent row: a compact line (name · sphere) that expands on tap to fetch + show the talent's full
 * compendium rules text (description, prerequisites, cost) from sphere_talents (public-read) — the same
 * expand-to-read UX as <SpellRow>, but fetched on demand so the long wiki text isn't cached on the sheet
 * and already-saved talents still get detail. Only compendium-linked talents expand; manual entries show
 * the name only. Fetched once per row, then cached in component state.
 */
export function TalentRow({
  name,
  sphere,
  compendiumId,
  targetedBy,
}: {
  name: string;
  sphere: string;
  compendiumId?: string;
  /** Names of drawbacks/boons flagged specifically to this talent (the "applies here" note). */
  targetedBy?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TalentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const panelId = useId();
  const expandable = Boolean(compendiumId);

  const toggle = async () => {
    if (!expandable) return;
    const next = !open;
    setOpen(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setError(false);
      try {
        const { data, error: err } = await createClient()
          .from("sphere_talents")
          .select("description,prerequisites,base_cost,talent_category,subcategory")
          .eq("id", compendiumId!)
          .maybeSingle();
        if (err || !data) setError(true);
        else setDetail(data as TalentDetail);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="rounded-md border border-border/70 bg-surface-raised/30">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
          onClick={toggle}
          aria-expanded={expandable ? open : undefined}
          aria-controls={expandable ? panelId : undefined}
          disabled={!expandable}
        >
          {expandable ? (
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <span className="truncate text-sm text-foreground">{name}</span>
          {sphere && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {sphere}
            </Badge>
          )}
          {targetedBy && targetedBy.length > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-danger"
              title={`Affected by: ${targetedBy.join(", ")}`}
            >
              <TriangleAlert className="size-3" aria-hidden /> <span aria-hidden>{targetedBy.length}</span>
              <span className="sr-only">Affected by: {targetedBy.join(", ")}</span>
            </span>
          )}
        </button>
      </div>

      {open && expandable && (
        <div id={panelId} className="border-t border-border/50 px-3 py-2 text-xs">
          {targetedBy && targetedBy.length > 0 && (
            <p className="mb-1.5 text-danger">
              <TriangleAlert className="mr-1 inline size-3 align-[-2px]" />
              Affected by: {targetedBy.join(", ")}
            </p>
          )}
          {loading && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </p>
          )}
          {error && <p className="text-muted-foreground">Talent details unavailable.</p>}
          {detail && (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <DetailField
                  label="Type"
                  value={[detail.talent_category, detail.subcategory].filter(Boolean).join(" · ")}
                />
                <DetailField label="Cost" value={detail.base_cost} />
                <DetailField label="Prerequisites" value={detail.prerequisites} />
              </dl>
              {detail.description && (
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                  {detail.description.replace(/<br>/g, " ")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </>
  );
}
