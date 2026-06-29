"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, Plus, Check, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export type EntryRow = Record<string, unknown> & { slug: string; name: string };

/**
 * Generic compendium picker — searches one `search_*` RPC (ranked, debounced) and adds a pick via the
 * caller's onAdd. No prerequisite logic (the feat picker has its own, prereq-aware variant); this is the
 * simple search→list→add picker reused for traits, and future compendium entries. Single-column results
 * so long names stay readable in the editor's panel width.
 */
export function EntryPicker({
  title,
  rpc,
  placeholder,
  addedIds,
  onAdd,
  renderMeta,
  onClose,
  limit = 40,
}: {
  title: string;
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
    <div className="rounded-lg border border-rune/40 bg-surface-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="size-4" /> {title}
        </h4>
        <Button variant="ghost" size="icon" aria-label={`Close ${title}`} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="relative">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={`Search ${title}`}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground"
        />
        {loading && (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <ul className="mt-2 flex max-h-[65vh] flex-col gap-1 overflow-y-auto sm:max-h-96">
        {rows.length === 0 && !loading ? (
          <li className="px-1 py-2 text-sm text-muted-foreground">
            {q.trim().length === 1 ? "Keep typing…" : "No matches found."}
          </li>
        ) : (
          rows.map((r) => {
            const isAdded = addedIds.has(r.slug);
            return (
              <li
                key={r.slug}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5"
              >
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
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
