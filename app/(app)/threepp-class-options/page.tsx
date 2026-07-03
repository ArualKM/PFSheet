import type { Metadata } from "next";
import { Target } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  plain,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";
import { systemLabel, withSystemLabels } from "@/components/compendium/threepp-labels";

export const metadata: Metadata = { title: "Third-Party Class Options" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Third-Party Class Options",
  describe: (n) =>
    `Search ${n ? n.toLocaleString() : "all"} third-party class options by base class, system, or type.`,
  icon: <Target />,
  rpc: "search_threepp_class_option_compendium",
  table: "threepp_class_option_compendium",
  orderCol: "name",
  selectCols: "slug,name,base_class,system,option_type,description,source",
  placeholder: "Search 3pp class options — e.g. Discoveries, Rage Powers, Hexes…",
  basePath: "/threepp-class-options",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
      {r.system ? <Badge variant="gold">{systemLabel(r.system)}</Badge> : null}
      {r.option_type ? <Badge variant="rune">{String(r.option_type)}</Badge> : null}
      {r.base_class ? <Badge variant="default">{String(r.base_class)}</Badge> : null}
      {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
    </div>
  ),
  hasDetail: (r) => hasText(r.description),
  renderDetail: (r) => <Prose value={r.description} />,
};

export default async function ThreeppClassOptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [systems, optionTypes, baseClasses] = await Promise.all([
    distinctValues("threepp_class_option_compendium", "system"),
    distinctValues("threepp_class_option_compendium", "option_type"),
    distinctValues("threepp_class_option_compendium", "base_class"),
  ]);
  const config: CompendiumConfig = {
    ...base,
    filters: [
      { param: "system", label: "All systems", col: "system", options: withSystemLabels(systems) },
      { param: "option_type", label: "All types", col: "option_type", options: optionTypes },
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
