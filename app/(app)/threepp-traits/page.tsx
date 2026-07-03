import type { Metadata } from "next";
import { ScrollText } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";
import { systemLabel, withSystemLabels } from "@/components/compendium/threepp-labels";

export const metadata: Metadata = { title: "Third-Party Traits" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Third-Party Traits",
  describe: (n) => `Search ${n ? n.toLocaleString() : "all"} third-party character traits by name, type, or system.`,
  icon: <ScrollText />,
  rpc: "search_threepp_trait_compendium",
  table: "threepp_trait_compendium",
  orderCol: "name",
  selectCols: "slug,name,type,system,description,source",
  placeholder: "Search 3pp traits — e.g. practitioner traits…",
  basePath: "/threepp-traits",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
      {r.system ? <Badge variant="gold">{systemLabel(r.system)}</Badge> : null}
      {r.type ? <Badge variant="success">{String(r.type)}</Badge> : null}
      {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
    </div>
  ),
  hasDetail: (r) => hasText(r.description),
  renderDetail: (r) => <Prose value={r.description} />,
};

export default async function ThreeppTraitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [systems, types] = await Promise.all([
    distinctValues("threepp_trait_compendium", "system"),
    distinctValues("threepp_trait_compendium", "type"),
  ]);
  const config: CompendiumConfig = {
    ...base,
    filters: [
      { param: "system", label: "All systems", col: "system", options: withSystemLabels(systems) },
      { param: "type", label: "All types", col: "type", options: types },
    ],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
