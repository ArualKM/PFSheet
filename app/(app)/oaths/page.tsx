import type { Metadata } from "next";
import { Flag } from "@/components/ui/game-icons";
import {
  CompendiumBrowser,
  hasText,
  Meta,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Oaths" };

const config: CompendiumConfig = {
  title: "Oaths",
  describe: (n) =>
    `Browse ${n ? n.toLocaleString() : "all"} sacred oaths — sworn vows that grant oath points to spend on boons (see the Oath Boons page).`,
  icon: <Flag />,
  rpc: "search_oath_compendium",
  table: "oath_compendium",
  orderCol: "name",
  selectCols: "slug,name,oath_points,oath,defiance_penalty,atonement,source",
  placeholder: "Search oaths — e.g. Oath of Charity, Oath of Truth…",
  basePath: "/oaths",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
        {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Oath Points" value={r.oath_points} />
      </dl>
    </>
  ),
  hasDetail: (r) => [r.oath, r.defiance_penalty, r.atonement].some(hasText),
  renderDetail: (r) => (
    <>
      <Prose value={r.oath} />
      <Prose label="If broken" value={r.defiance_penalty} />
      <Prose label="Atonement" value={r.atonement} />
    </>
  ),
};

export default async function OathsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
