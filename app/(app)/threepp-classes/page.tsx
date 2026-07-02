import type { Metadata } from "next";
import { Helmet } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";
import { systemLabel, withSystemLabels } from "@/components/compendium/threepp-labels";

export const metadata: Metadata = { title: "Third-Party Classes" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Third-Party Classes",
  describe: (n) =>
    `Browse ${n ? n.toLocaleString() : "all"} third-party base & prestige classes — psionic, Path of War & akashic.`,
  icon: <Helmet />,
  rpc: "search_threepp_class_compendium",
  table: "threepp_class_compendium",
  orderCol: "name",
  // NOTE: progression_json is deliberately not selected/rendered — it powers the class builder, not browse.
  selectCols: "slug,name,system,class_type,hit_die,class_features,description,source",
  placeholder: "Search 3pp classes — e.g. Psion, Warlord, Vizier, Aegis…",
  basePath: "/threepp-classes",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
      {r.system ? <Badge variant="gold">{systemLabel(r.system)}</Badge> : null}
      {r.class_type ? <Badge variant="rune">{String(r.class_type)}</Badge> : null}
      {r.hit_die ? <Badge>{String(r.hit_die)}</Badge> : null}
      {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
    </div>
  ),
  hasDetail: (r) => [r.description, r.class_features].some(hasText),
  renderDetail: (r) => (
    <>
      <Prose value={r.description} />
      <Prose label="Class Features" value={r.class_features} />
    </>
  ),
};

export default async function ThreeppClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [systems, classTypes] = await Promise.all([
    distinctValues("threepp_class_compendium", "system"),
    distinctValues("threepp_class_compendium", "class_type"),
  ]);
  const config: CompendiumConfig = {
    ...base,
    filters: [
      { param: "system", label: "All systems", col: "system", options: withSystemLabels(systems) },
      {
        param: "class_type",
        label: "All class types",
        col: "class_type",
        options: classTypes.map((o) => ({ ...o, label: o.value === "base" ? "Base" : o.value === "prestige" ? "Prestige" : o.value })),
      },
    ],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
