import type { Metadata } from "next";
import { Swords } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import { CompendiumBrowser, hasText, Meta, Prose, type CompendiumConfig } from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Feats" };

const config: CompendiumConfig = {
  title: "Feats",
  describe: (n) => `Search ${n ? n.toLocaleString() : "3,300+"} Pathfinder feats by name, type, prerequisite, or benefit.`,
  icon: <Swords />,
  rpc: "search_feat_compendium",
  table: "feat_compendium",
  orderCol: "name",
  selectCols: "slug,name,types,source,prerequisites,benefit,description",
  placeholder: "Search feats — e.g. Power Attack, Toughness, Combat Reflexes…",
  basePath: "/feats",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
        {r.types ? <Badge variant="rune">{String(r.types)}</Badge> : null}
        {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Prerequisites" value={r.prerequisites} />
      </dl>
    </>
  ),
  hasDetail: (r) => hasText(r.benefit) || hasText(r.description),
  renderDetail: (r) => (
    <>
      <Prose label="Benefit" value={r.benefit} />
      {r.description && r.description !== r.benefit ? <Prose value={r.description} /> : null}
    </>
  ),
};

export default async function FeatsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
