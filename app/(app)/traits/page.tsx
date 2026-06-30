import type { Metadata } from "next";
import { ScrollText } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import { CompendiumBrowser, hasText, Meta, Prose, type CompendiumConfig } from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Traits" };

const config: CompendiumConfig = {
  title: "Traits",
  describe: (n) => `Search ${n ? n.toLocaleString() : "1,900+"} character traits by name, type, or benefit.`,
  icon: <ScrollText />,
  rpc: "search_trait_compendium",
  table: "trait_compendium",
  orderCol: "name",
  selectCols: "slug,name,type,category,source,requirements,description",
  placeholder: "Search traits — e.g. Reactionary, Indomitable Faith, Magical Knack…",
  basePath: "/traits",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
        {r.type ? <Badge variant="success">{String(r.type)}</Badge> : null}
        {r.category ? <Badge variant="outline">{String(r.category)}</Badge> : null}
        {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Requirement" value={r.requirements} />
      </dl>
    </>
  ),
  hasDetail: (r) => hasText(r.description),
  renderDetail: (r) => <Prose value={r.description} />,
};

export default async function TraitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
