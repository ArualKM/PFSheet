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

export const metadata: Metadata = { title: "Class Options" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Class Options",
  describe: (n) =>
    `Browse ${n ? n.toLocaleString() : "2,300+"} class options — rogue talents, discoveries, rage powers, bloodlines, mysteries, hexes, and more.`,
  icon: <Target />,
  rpc: "search_class_option_compendium",
  table: "class_option_compendium",
  orderCol: "name",
  selectCols: "slug,class,option_type,name,subtype,group,source,description",
  placeholder: "Search options — e.g. Bleeding Attack, Vivisectionist, Beast Totem…",
  basePath: "/class-options",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
        {r.option_type ? <Badge variant="rune">{String(r.option_type)}</Badge> : null}
        {r.class ? <Badge variant="default">{String(r.class)}</Badge> : null}
        {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Group" value={r.group} />
        <Meta label="Subtype" value={r.subtype} />
      </dl>
    </>
  ),
  hasDetail: (r) => hasText(r.description),
  renderDetail: (r) => <Prose value={r.description} />,
};

export default async function ClassOptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [classes, optionTypes] = await Promise.all([
    distinctValues("class_option_compendium", "class"),
    distinctValues("class_option_compendium", "option_type"),
  ]);
  const config: CompendiumConfig = {
    ...base,
    filters: [
      { param: "class", label: "All classes", col: "class", options: classes },
      { param: "option_type", label: "All option types", col: "option_type", options: optionTypes },
    ],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
