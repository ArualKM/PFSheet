import type { Metadata } from "next";
import { EyeOff } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Meta,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Drawbacks & Flaws" };

const CATEGORY_LABELS: Record<string, string> = {
  flaw: "Flaw",
  major_drawback: "Major Drawback",
};

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Drawbacks & Flaws",
  describe: (n) =>
    `Browse ${n ? n.toLocaleString() : "all"} third-party major drawbacks & flaws — penalties taken in exchange for extra options.`,
  icon: <EyeOff />,
  rpc: "search_threepp_drawback_compendium",
  table: "threepp_drawback_compendium",
  orderCol: "name",
  selectCols: "slug,name,category,effect,bonus_granted,prerequisite,description,source",
  placeholder: "Search drawbacks & flaws by name or effect…",
  basePath: "/threepp-options",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
      {r.category ? <Badge variant="rune">{CATEGORY_LABELS[String(r.category)] ?? String(r.category)}</Badge> : null}
      {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
    </div>
  ),
  hasDetail: (r) => [r.effect, r.bonus_granted, r.prerequisite, r.description].some(hasText),
  renderDetail: (r) => (
    <>
      <Prose value={r.effect} />
      <Prose label="Grants" value={r.bonus_granted} />
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Prerequisite" value={r.prerequisite} />
      </dl>
      <Prose value={r.description} />
    </>
  ),
};

export default async function ThreeppOptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const categories = await distinctValues("threepp_drawback_compendium", "category");
  const config: CompendiumConfig = {
    ...base,
    filters: [
      {
        param: "category",
        label: "All categories",
        col: "category",
        options: categories.map((o) => ({ ...o, label: CATEGORY_LABELS[o.value] ?? o.value })),
      },
    ],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
