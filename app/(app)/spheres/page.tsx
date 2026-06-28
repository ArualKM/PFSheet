import type { Metadata } from "next";
import { Search, Orbit } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Spheres Compendium" };

const CATEGORIES = ["Base Talent", "Advanced Talent", "Legendary Talent"];
const PAGE_SIZE = 30;

type TalentRow = {
  id: string;
  sphere_name: string;
  talent_name: string;
  talent_category: string | null;
  subcategory: string | null;
  source: string | null;
  tags: string | null;
  prerequisites: string | null;
  base_cost: string | null;
  description: string | null;
};

const categoryVariant = (c: string | null) =>
  c === "Legendary Talent" ? "gold" : c === "Advanced Talent" ? "rune" : "default";

export default async function SpheresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sphere?: string; category?: string; page?: string }>;
}) {
  await requireUser();
  const { q = "", sphere = "", category = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // Sphere filter options, grouped by system for the dropdown.
  const { data: sphereRows } = await supabase
    .from("sphere_compendium")
    .select("name,system")
    .order("system", { ascending: true })
    .order("name", { ascending: true });
  const spheresBySystem = new Map<string, string[]>();
  for (const r of sphereRows ?? []) {
    const list = spheresBySystem.get(r.system) ?? [];
    list.push(r.name);
    spheresBySystem.set(r.system, list);
  }

  const RANKED_LIMIT = 50;
  let talents: TalentRow[] = [];
  let total = 0;
  let ranked = false;
  let error: { message: string } | null = null;
  if (q.trim()) {
    // Searching → ranked relevance (exact → prefix → contains → sphere → tags → description) so the
    // best match is first and isn't truncated; top results only (no pagination).
    const res = await supabase.rpc("search_sphere_talents", {
      p_query: q.trim(),
      p_sphere: sphere,
      p_category: category,
      p_limit: RANKED_LIMIT,
    });
    talents = (res.data ?? []) as TalentRow[];
    total = talents.length;
    ranked = true;
    error = res.error;
  } else {
    // Browsing → alphabetical, paginated.
    let query = supabase
      .from("sphere_talents")
      .select(
        "id,sphere_name,talent_name,talent_category,subcategory,source,tags,prerequisites,base_cost,description",
        { count: "exact" },
      );
    if (sphere) query = query.eq("sphere_name", sphere);
    if (category) query = query.eq("talent_category", category);
    const res = await query
      .order("sphere_name", { ascending: true })
      .order("talent_name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    talents = (res.data ?? []) as TalentRow[];
    total = res.count ?? 0;
    error = res.error;
  }
  const totalPages = ranked ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (sphere) sp.set("sphere", sphere);
    if (category) sp.set("category", category);
    sp.set("page", String(p));
    return `/spheres?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Spheres Compendium"
        description={`Search ${total ? total.toLocaleString() : "thousands of"} Spheres of Power / Might / Guile talents by name, sphere, and category.`}
      />

      <form method="get" className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search talents, e.g. teleport, blast, shapeshift…"
            className="pl-9"
            aria-label="Search talents"
          />
        </div>
        <select
          name="sphere"
          defaultValue={sphere}
          aria-label="Filter by sphere"
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          <option value="">All spheres</option>
          {[...spheresBySystem.entries()].map(([system, names]) => (
            <optgroup key={system} label={system}>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          name="category"
          defaultValue={category}
          aria-label="Filter by category"
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          <option value="">All types</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button type="submit">Search</Button>
      </form>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-danger">
            Could not load talents: {error.message}
          </CardContent>
        </Card>
      ) : talents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Orbit className="size-6 text-gold" />
            <p className="text-sm text-muted-foreground">
              No talents match your search. Try a different term or clear the filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {talents.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{t.talent_name}</h2>
                  <Badge variant="rune">{t.sphere_name}</Badge>
                  {t.talent_category && (
                    <Badge variant={categoryVariant(t.talent_category)}>
                      {t.talent_category.replace(" Talent", "")}
                    </Badge>
                  )}
                  {t.tags && <span className="text-xs text-muted-foreground">{t.tags}</span>}
                  {t.source && <span className="ml-auto text-xs text-muted-foreground">{t.source}</span>}
                </div>

                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <Meta label="Cost" value={t.base_cost} />
                  <Meta label="Prerequisites" value={t.prerequisites} />
                  <Meta label="Subcategory" value={t.subcategory} />
                </dl>

                {t.description && (
                  <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                    {t.description.replace(/<br>/g, " ")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center justify-between pt-2 text-sm">
            <span className="text-muted-foreground">
              {ranked
                ? `${total}${total >= RANKED_LIMIT ? "+" : ""} result${total === 1 ? "" : "s"} · ranked by relevance`
                : `Page ${pageNum} of ${totalPages} · ${total.toLocaleString()} talents`}
            </span>
            <div className="flex gap-2">
              {pageNum > 1 && (
                <Button asChild variant="secondary" size="sm">
                  <a href={pageHref(pageNum - 1)}>Previous</a>
                </Button>
              )}
              {pageNum < totalPages && (
                <Button asChild variant="secondary" size="sm">
                  <a href={pageHref(pageNum + 1)}>Next</a>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-medium text-foreground">{label}:</span> {value}
    </div>
  );
}
