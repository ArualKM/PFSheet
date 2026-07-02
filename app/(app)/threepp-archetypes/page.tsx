import type { Metadata } from "next";
import { Shield } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Meta,
  plain,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";
import { systemLabel, withSystemLabels } from "@/components/compendium/threepp-labels";

export const metadata: Metadata = { title: "Third-Party Archetypes" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Third-Party Archetypes",
  describe: (n) =>
    `Search ${n ? n.toLocaleString() : "all"} third-party archetypes by base class or system.`,
  icon: <Shield />,
  rpc: "search_threepp_archetype_compendium",
  table: "threepp_archetype_compendium",
  orderCol: "name",
  selectCols: "slug,name,system,base_class,altered_features,description,source",
  placeholder: "Search 3pp archetypes — e.g. Zweihander Sentinel, Dread, Ronin…",
  basePath: "/threepp-archetypes",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
        {r.system ? <Badge variant="gold">{systemLabel(r.system)}</Badge> : null}
        {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Base Class" value={r.base_class} />
      </dl>
    </>
  ),
  hasDetail: (r) => [r.altered_features, r.description].some(hasText),
  renderDetail: (r) => (
    <>
      <Prose label="Alters" value={r.altered_features} />
      <Prose value={r.description} />
    </>
  ),
};

export default async function ThreeppArchetypesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [systems, baseClasses] = await Promise.all([
    distinctValues("threepp_archetype_compendium", "system"),
    distinctValues("threepp_archetype_compendium", "base_class"),
  ]);
  const config: CompendiumConfig = {
    ...base,
    filters: [
      { param: "system", label: "All systems", col: "system", options: withSystemLabels(systems) },
      {
        param: "base_class",
        label: "All base classes",
        col: "base_class",
        options: baseClasses.map((o) => ({ ...o, label: plain(o.value) })),
      },
    ],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
