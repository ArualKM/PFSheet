import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
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
  /** Inner card content for a row (the browser wraps it in <Card><CardContent>). */
  renderRow: (row: Record<string, unknown>) => ReactNode;
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
  await requireUser();
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
  let error: { message: string } | null = null;

  if (q && activeFilters.length === 0) {
    const res = await sb.rpc(config.rpc, { p_query: q, p_limit: RANKED });
    rows = (res.data ?? []) as Record<string, unknown>[];
    total = rows.length;
    ranked = true;
    error = res.error;
  } else {
    let query = sb.from(config.table).select(config.selectCols, { count: "exact" });
    if (q) query = query.textSearch("search", q, { type: "websearch" });
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
          {rows.map((row) => (
            <Card key={config.rowKey(row)}>
              <CardContent className="p-5">{config.renderRow(row)}</CardContent>
            </Card>
          ))}

          <div className="flex items-center justify-between pt-2 text-sm">
            <span className="text-muted-foreground">
              {ranked
                ? `${total}${total >= RANKED ? "+" : ""} result${total === 1 ? "" : "s"} · ranked by relevance`
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

/** Sorted distinct values of a compendium column — for building `<select>` filter options. Uses the
 * `compendium_distinct` RPC so it isn't truncated by PostgREST's default row cap. */
export async function distinctValues(table: string, col: string): Promise<{ value: string; label: string }[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc("compendium_distinct", { p_table: table, p_col: col });
  return ((data ?? []) as { value: string }[]).map((r) => ({ value: r.value, label: r.value }));
}
