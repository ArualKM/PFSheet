"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Check, ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow, PickerDivider } from "./picker-shell";

export type EntryRow = Record<string, unknown> & { slug: string; name: string };

/**
 * An optional second compendium searched alongside the primary — the module-gated 3pp union
 * (docs/3PP_MASTER_PLAN.md D1). Pass it ONLY when the gate is open (e.g. a 3pp module is enabled):
 * when absent, no secondary query ever fires. Results render below the primary group under a
 * divider so core always reads first; the secondary query fails soft (never blocks core picking).
 */
export type EntryPickerSecondary = {
  /** The secondary `search_*` RPC (same p_query/p_limit contract). */
  rpc: string;
  /** Divider label above the secondary group (e.g. "Third-party"). */
  label: string;
  /** Render-time row filter (e.g. keep only rows whose `system` is enabled on the character). */
  filter?: (row: EntryRow) => boolean;
  /** compendiumId for the Added check (e.g. `3pp:${slug}` so 3pp slugs never collide with core). */
  rowId: (row: EntryRow) => string;
  /** Inline badges next to the name (e.g. the 3pp system badge). */
  renderBadges?: (row: EntryRow) => ReactNode;
  /** Optional sub-line under the name (type / source). */
  renderMeta?: (row: EntryRow) => ReactNode;
  onAdd: (row: EntryRow) => void;
};

/**
 * Generic compendium picker — searches one `search_*` RPC (ranked, debounced) and adds a pick via the
 * caller's onAdd. No prerequisite logic (the feat picker has its own, prereq-aware variant); this is the
 * simple search→list→add picker reused for traits, and future compendium entries. Single-column results
 * so long names stay readable in the editor's panel width.
 */
export function EntryPicker({
  title,
  icon,
  rpc,
  placeholder,
  addedIds,
  onAdd,
  renderMeta,
  onClose,
  limit = 40,
  secondary,
}: {
  title: string;
  /** Header icon (defaults to a scroll). */
  icon?: ReactNode;
  /** The `search_*` RPC name (takes p_query + p_limit, returns rows with slug + name). */
  rpc: string;
  placeholder: string;
  /** compendiumIds already on the sheet (the matching pick shows "Added"). */
  addedIds: Set<string>;
  onAdd: (row: EntryRow) => void;
  /** Optional sub-line under the name (type / category / requirements). */
  renderMeta?: (row: EntryRow) => ReactNode;
  onClose: () => void;
  limit?: number;
  /** Gated secondary compendium (3pp union) — omit to search the primary RPC only. */
  secondary?: EntryPickerSecondary;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [secondaryRows, setSecondaryRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Depend on the RPC name (a stable string), not the config object the caller recreates per render.
  const secondaryRpc = secondary?.rpc;

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return; // 1 char waits for more
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const [primary, sec] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc(rpc, { p_query: term, p_limit: limit }),
        // Gate BEFORE querying: no secondary config → the union query never fires.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        secondaryRpc ? (supabase as any).rpc(secondaryRpc, { p_query: term, p_limit: limit }) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (primary.error) {
        setError(primary.error.message);
        setRows([]);
        setSecondaryRows([]);
      } else {
        setError(null);
        setRows((primary.data ?? []) as EntryRow[]);
        // The secondary union fails soft — a 3pp hiccup never blocks core picking.
        setSecondaryRows(sec && !sec.error ? ((sec.data ?? []) as EntryRow[]) : []);
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, supabase, rpc, limit, secondaryRpc]);

  // Filter at render (cheap: ≤ limit rows) so a module toggle mid-session narrows instantly.
  const visibleSecondary = secondary ? (secondary.filter ? secondaryRows.filter(secondary.filter) : secondaryRows) : [];

  return (
    <PickerShell icon={icon ?? <ScrollText />} title={title} onClose={onClose}>
      <PickerSearch autoFocus value={q} onChange={setQ} loading={loading} label={`Search ${title}`} placeholder={placeholder} />
      <PickerError message={error} />
      <PickerList
        isEmpty={rows.length === 0 && visibleSecondary.length === 0 && !loading}
        hint={q.trim().length === 1 ? "Keep typing…" : "No matches found."}
      >
        {rows.map((r) => {
          const isAdded = addedIds.has(r.slug);
          return (
            <PickerRow key={r.slug}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{r.name}</span>
                  {renderMeta && <div className="truncate text-[11px] text-muted-foreground">{renderMeta(r)}</div>}
                </div>
                <Button
                  size="sm"
                  variant={isAdded ? "ghost" : "secondary"}
                  disabled={isAdded}
                  onClick={() => onAdd(r)}
                  aria-label={`Add ${r.name}`}
                  className="shrink-0"
                >
                  {isAdded ? (
                    <>
                      <Check className="size-4" /> Added
                    </>
                  ) : (
                    <>
                      <Plus className="size-4" /> Add
                    </>
                  )}
                </Button>
              </div>
            </PickerRow>
          );
        })}
        {secondary && visibleSecondary.length > 0 && (
          <>
            <PickerDivider label={secondary.label} />
            {visibleSecondary.map((r) => {
              const cid = secondary.rowId(r);
              const isAdded = addedIds.has(cid);
              return (
                <PickerRow key={cid}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                        {secondary.renderBadges?.(r)}
                      </span>
                      {secondary.renderMeta && (
                        <div className="min-w-0 truncate text-[11px] text-muted-foreground">{secondary.renderMeta(r)}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isAdded ? "ghost" : "secondary"}
                      disabled={isAdded}
                      onClick={() => secondary.onAdd(r)}
                      aria-label={`Add ${r.name}`}
                      className="shrink-0"
                    >
                      {isAdded ? (
                        <>
                          <Check className="size-4" /> Added
                        </>
                      ) : (
                        <>
                          <Plus className="size-4" /> Add
                        </>
                      )}
                    </Button>
                  </div>
                </PickerRow>
              );
            })}
          </>
        )}
      </PickerList>
    </PickerShell>
  );
}
