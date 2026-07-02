import type { Metadata } from "next";
import { Coins } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Meta,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Oath Boons" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Oath Boons",
  describe: (n) =>
    `Browse ${n ? n.toLocaleString() : "all"} oath boons — abilities bought with the oath points your sworn oaths grant (see the Oaths page).`,
  icon: <Coins />,
  rpc: "search_oath_boon_compendium",
  table: "oath_boon_compendium",
  orderCol: "name",
  selectCols: "slug,name,oath_point_cost,type,description,source",
  placeholder: "Search oath boons by name or effect…",
  basePath: "/oath-boons",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
        {r.type ? <Badge variant="rune">{String(r.type)}</Badge> : null}
        {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Cost" value={r.oath_point_cost} />
      </dl>
    </>
  ),
  hasDetail: (r) => hasText(r.description),
  renderDetail: (r) => <Prose value={r.description} />,
};

export default async function OathBoonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const types = await distinctValues("oath_boon_compendium", "type");
  const config: CompendiumConfig = {
    ...base,
    filters: [{ param: "type", label: "All types", col: "type", options: types }],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
