import type { Metadata } from "next";
import { Flag } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import { CompendiumBrowser, Meta, plain, type CompendiumConfig } from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Prestige Classes" };

const config: CompendiumConfig = {
  title: "Prestige Classes",
  describe: (n) => `Browse ${n ? n.toLocaleString() : "100+"} prestige classes and their entry requirements.`,
  icon: <Flag />,
  rpc: "search_prestige_class_compendium",
  table: "prestige_class_compendium",
  orderCol: "name",
  selectCols: "slug,name,source,hit_die,role,requirements,description",
  placeholder: "Search prestige classes — e.g. Arcane Trickster, Eldritch Knight…",
  basePath: "/prestige",
  rowKey: (r) => String(r.slug),
  renderRow: (r) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
        {r.hit_die ? <Badge variant="gold">{String(r.hit_die).replace(/\.$/, "")}</Badge> : null}
        {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Requirements" value={r.requirements} />
      </dl>
      {r.description ? <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{plain(r.description)}</p> : null}
    </>
  ),
};

export default async function PrestigePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
