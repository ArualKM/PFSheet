import type { Metadata } from "next";
import { Target } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Meta,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";
import { systemLabel, withSystemLabels } from "@/components/compendium/threepp-labels";

export const metadata: Metadata = { title: "Third-Party Feats" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Third-Party Feats",
  describe: (n) =>
    `Search ${n ? n.toLocaleString() : "all"} third-party feats — psionic, Path of War, akashic, spheres & more.`,
  icon: <Target />,
  rpc: "search_threepp_feat_compendium",
  table: "threepp_feat_compendium",
  orderCol: "name",
  selectCols: "slug,name,system,type,prerequisites,benefit,normal,special,source",
  placeholder: "Search 3pp feats — e.g. Psionic Body, Advanced Study, Shape Veil…",
  basePath: "/threepp-feats",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
      {r.system ? <Badge variant="gold">{systemLabel(r.system)}</Badge> : null}
      {r.type ? <Badge variant="rune">{String(r.type)}</Badge> : null}
      {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
    </div>
  ),
  hasDetail: (r) => [r.prerequisites, r.benefit, r.normal, r.special].some(hasText),
  renderDetail: (r) => (
    <>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Prerequisites" value={r.prerequisites} />
      </dl>
      <Prose label="Benefit" value={r.benefit} />
      <Prose label="Normal" value={r.normal} />
      <Prose label="Special" value={r.special} />
    </>
  ),
};

export default async function ThreeppFeatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [systems, types] = await Promise.all([
    distinctValues("threepp_feat_compendium", "system"),
    distinctValues("threepp_feat_compendium", "type"),
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
