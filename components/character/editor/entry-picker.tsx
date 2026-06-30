"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Check, ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PickerShell, PickerSearch, PickerError, PickerList, PickerRow } from "./picker-shell";

export type EntryRow = Record<string, unknown> & { slug: string; name: string };

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
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return; // 1 char waits for more
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any).rpc(rpc, { p_query: term, p_limit: limit });
      if (cancelled) return;
      if (e) {
        setError(e.message);
        setRows([]);
      } else {
        setError(null);
        setRows((data ?? []) as EntryRow[]);
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, supabase, rpc, limit]);

  return (
    <PickerShell icon={icon ?? <ScrollText />} title={title} onClose={onClose}>
      <PickerSearch autoFocus value={q} onChange={setQ} loading={loading} label={`Search ${title}`} placeholder={placeholder} />
      <PickerError message={error} />
      <PickerList isEmpty={rows.length === 0 && !loading} hint={q.trim().length === 1 ? "Keep typing…" : "No matches found."}>
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
      </PickerList>
    </PickerShell>
  );
}
