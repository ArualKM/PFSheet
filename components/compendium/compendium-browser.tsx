import type { ReactNode } from "react";
import { Search, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** A `.eq` filter exposed as a `<select>` (applied in browse + search-with-filter mode). */
export type CompendiumFilter = {
  param: string; // query-string key
  label: string;
  col: string; // table column to filter on
  options: { value: string; label: string }[];
};

export type CompendiumConfig = {
  title: string;
  describe: (total: number) => string;
  /** Empty-state icon (a game-icon / lucide element). */
  icon: ReactNode;
  rpc: string; // search RPC name (ranked search when a query is present + no filters)
  table: string; // table for browse / filtered queries
  orderCol: string; // alpha sort column
  selectCols: string; // columns to select (browse mode)
  placeholder: string;
  basePath: string; // e.g. "/feats"
  pageSize?: number;
  rankedLimit?: number;
  filters?: CompendiumFilter[];
  /** Always-visible collapsed content: name + badges + source + short key meta (prereqs/requirements).
   * Rendered inside the `<summary>`, so keep it scannable. */
  renderSummary: (row: Record<string, unknown>) => ReactNode;
  /** Terse accessible name for the disclosure toggle (defaults to the whole summary subtree text, which
   * includes badges + source). Set to the entry name to keep the button's a11y name name-first. */
  summaryLabel?: (row: Record<string, unknown>) => string;
  /** The expanded, full, untruncated detail (prose + secondary meta). Omit for non-expandable entries. */
  renderDetail?: (row: Record<string, unknown>) => ReactNode;
  /** Whether this row has detail to expand — drives the accordion chevron vs. a flat card. */
  hasDetail?: (row: Record<string, unknown>) => boolean;
  rowKey: (row: Record<string, unknown>) => string;
};

/**
 * Shared read-only compendium browse page (mirrors /spells + /spheres): ranked relevance search via the
 * entity's `search_*` RPC when a query is present (no pagination), alphabetical + paginated when browsing.
 * Filters narrow the table query; with a query + a filter we fall back to a filtered FTS table query
 * (alpha-ordered). Pure server component — the GET form needs no client JS.
 */
export async function CompendiumBrowser({
  config,
  searchParams,
}: {
  config: CompendiumConfig;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Auth is enforced by the /(app) layout (requireUser + proxy.ts); no per-page recheck needed.
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const PAGE = config.pageSize ?? 30;
  const RANKED = config.rankedLimit ?? 60;
  const pageNum = Math.max(1, Number(sp.page) || 1);
  const activeFilters = (config.filters ?? [])
    .map((f) => ({ f, value: (sp[f.param] ?? "").trim() }))
    .filter((x) => x.value);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  let rows: Record<string, unknown>[] = [];
  let total = 0;
  let ranked = false;
  let hasMore = false;
  let error: { message: string } | null = null;

  if (q && activeFilters.length === 0) {
    // Fetch one extra row to know whether there are MORE than RANKED matches (accurate "60+" badge).
    const res = await sb.rpc(config.rpc, { p_query: q, p_limit: RANKED + 1 });
    const all = (res.data ?? []) as Record<string, unknown>[];
    ranked = true;
    hasMore = all.length > RANKED;
    rows = hasMore ? all.slice(0, RANKED) : all;
    total = rows.length;
    error = res.error;
  } else {
    let query = sb.from(config.table).select(config.selectCols, { count: "exact" });
    // Match the 0026 RPC semantics in filtered-search mode: name SUBSTRING (so prefixes like
    // "Wiza" hit "Wizard") OR whole-word FTS. PostgREST `or` needs its values double-quoted —
    // escape one level for the quoted string, and LIKE metacharacters inside the pattern.
    if (q) {
      const pgQuote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      const likePattern = `%${q.replace(/\\/g, "\\\\").replace(/[%_]/g, (m) => `\\${m}`)}%`;
      query = query.or(`${config.orderCol}.ilike.${pgQuote(likePattern)},search.wfts(english).${pgQuote(q)}`);
    }
    for (const { f, value } of activeFilters) query = query.eq(f.col, value);
    const res = await query.order(config.orderCol).range((pageNum - 1) * PAGE, (pageNum - 1) * PAGE + PAGE - 1);
    rows = (res.data ?? []) as Record<string, unknown>[];
    total = res.count ?? 0;
    error = res.error;
  }
  const totalPages = ranked ? 1 : Math.max(1, Math.ceil(total / PAGE));

  const hrefFor = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    for (const { f, value } of activeFilters) u.set(f.param, value);
    u.set("page", String(p));
    return `${config.basePath}?${u.toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={config.title} description={config.describe(total)} />

      <form method="get" className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder={config.placeholder} className="pl-9" aria-label={`Search ${config.title}`} />
        </div>
        {(config.filters ?? []).map((f) => (
          <select
            key={f.param}
            name={f.param}
            defaultValue={sp[f.param] ?? ""}
            aria-label={f.label}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        <Button type="submit">Search</Button>
      </form>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-danger">Could not load: {error.message}</CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <span className="text-gold [&>*]:size-6">{config.icon}</span>
            <p className="text-sm text-muted-foreground">No matches. Try a different term or clear the filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const expandable = Boolean(config.renderDetail && (config.hasDetail?.(row) ?? true));
            if (!expandable) {
              return (
                <Card key={config.rowKey(row)}>
                  <CardContent className="p-5">{config.renderSummary(row)}</CardContent>
                </Card>
              );
            }
            return (
              <Card key={config.rowKey(row)} className="overflow-hidden p-0">
                <details className="group">
                  <summary
                    aria-label={config.summaryLabel?.(row)}
                    className="flex cursor-pointer list-none items-start gap-3 p-5 transition-colors hover:bg-surface-raised/40 [&::-webkit-details-marker]:hidden"
                  >
                    <div className="min-w-0 flex-1">{config.renderSummary(row)}</div>
                    <ChevronDown
                      aria-hidden
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <div className="space-y-3 border-t border-border/60 px-5 pb-5 pt-4">{config.renderDetail!(row)}</div>
                </details>
              </Card>
            );
          })}

          <div className="flex items-center justify-between pt-2 text-sm">
            <span className="text-muted-foreground">
              {ranked
                ? `${total}${hasMore ? "+" : ""} result${total === 1 ? "" : "s"} · ranked by relevance`
                : `Page ${pageNum} of ${totalPages} · ${total.toLocaleString()} entries`}
            </span>
            <div className="flex gap-2">
              {pageNum > 1 && (
                <Button asChild variant="secondary" size="sm">
                  <a href={hrefFor(pageNum - 1)}>Previous</a>
                </Button>
              )}
              {pageNum < totalPages && (
                <Button asChild variant="secondary" size="sm">
                  <a href={hrefFor(pageNum + 1)}>Next</a>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small inline `<dt>/<dd>` for the card meta rows. Renders nothing when empty. */
export function Meta({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <span className="font-medium text-foreground">{label}:</span> {String(value).replace(/<br>/g, " ")}
    </div>
  );
}

/** Strip the `<br>` tokens from compendium prose for inline display. */
export function plain(value: unknown): string {
  return value ? String(value).replace(/<br>/g, " ") : "";
}

/** True when `value` has visible text after stripping `<br>` + trimming — i.e. whether `<Prose>` (or a `<Meta>`)
 * would render anything. Use in `hasDetail` so the accordion chevron never appears over an empty body. */
export function hasText(value: unknown): boolean {
  return value != null && String(value).replace(/<br\s*\/?>/gi, "").trim() !== "";
}

/** Full, untruncated compendium prose for the expanded accordion body. Converts the data's `<br>` tokens to
 * real line breaks and preserves them with `whitespace-pre-wrap`. Renders nothing when empty. */
export function Prose({ label, value }: { label?: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return (
    <div>
      {label ? (
        <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-foreground">{label}</div>
      ) : null}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

/** Sorted distinct values of a compendium column — for building `<select>` filter options. Uses the
 * `compendium_distinct` RPC so it isn't truncated by PostgREST's default row cap. */
export async function distinctValues(table: string, col: string): Promise<{ value: string; label: string }[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc("compendium_distinct", { p_table: table, p_col: col });
  return ((data ?? []) as { value: string }[]).map((r) => ({ value: r.value, label: r.value }));
}
