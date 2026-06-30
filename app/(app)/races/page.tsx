import type { Metadata } from "next";
import { User } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Races" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Races",
  describe: (n) => `Browse ${n ? n.toLocaleString() : "all"} Pathfinder races — core and uncommon.`,
  icon: <User />,
  rpc: "search_race_compendium",
  table: "race_compendium",
  orderCol: "name",
  selectCols: "slug,name,category,source,details",
  placeholder: "Search races — e.g. Dwarf, Aasimar, Tiefling…",
  basePath: "/races",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
      {r.category ? <Badge variant="gold">{String(r.category)}</Badge> : null}
      {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
    </div>
  ),
  hasDetail: (r) => hasText(r.details),
  renderDetail: (r) => <Prose value={r.details} />,
};

export default async function RacesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const categories = await distinctValues("race_compendium", "category");
  const config: CompendiumConfig = { ...base, filters: [{ param: "category", label: "All categories", col: "category", options: categories }] };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
