import type { Metadata } from "next";
import { Shield } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Archetypes" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Archetypes",
  describe: (n) => `Browse ${n ? n.toLocaleString() : "1,300+"} class archetypes — search by name or filter by class.`,
  icon: <Shield />,
  rpc: "search_archetype_compendium",
  table: "archetype_compendium",
  orderCol: "name",
  selectCols: "slug,name,class,source,description",
  placeholder: "Search archetypes — e.g. Knife Master, Eldritch Scoundrel…",
  basePath: "/archetypes",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
      {r.class ? <Badge variant="rune">{String(r.class)}</Badge> : null}
      {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
    </div>
  ),
  hasDetail: (r) => hasText(r.description),
  renderDetail: (r) => <Prose value={r.description} />,
};

export default async function ArchetypesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const classes = await distinctValues("class_compendium", "name");
  const config: CompendiumConfig = { ...base, filters: [{ param: "class", label: "All classes", col: "class", options: classes }] };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
