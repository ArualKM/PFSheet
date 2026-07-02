import type { Metadata } from "next";
import { GameIcon } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Meta,
  plain,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Veils" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Veils",
  describe: (n) =>
    `Search ${n ? n.toLocaleString() : "all"} akashic veils — shaped essence by chakra slot, with bind effects.`,
  icon: <GameIcon name="item-magic_item" />,
  rpc: "search_akashic_veil_compendium",
  table: "akashic_veil_compendium",
  orderCol: "name",
  selectCols: "slug,name,slot,descriptors,effect,bind_effect,is_retold,source",
  placeholder: "Search veils — e.g. Bloodpelt Hunter's Bow, Crown of the Victor…",
  basePath: "/veils",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
        {String(r.is_retold ?? "") === "yes" ? <Badge variant="gold">Retold</Badge> : null}
        {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Slot" value={r.slot} />
        <Meta label="Descriptors" value={r.descriptors} />
      </dl>
    </>
  ),
  // Always expandable: veils with no scraped effect text still expand to a see-the-book pointer.
  renderDetail: (r) => (
    <>
      {hasText(r.effect) ? (
        <Prose value={r.effect} />
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Rules text in {plain(r.source) || "the source book"} — see the book.
        </p>
      )}
      <Prose label="Bind" value={r.bind_effect} />
    </>
  ),
};

export default async function VeilsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [slots, retold] = await Promise.all([
    distinctValues("akashic_veil_compendium", "slot"),
    distinctValues("akashic_veil_compendium", "is_retold"),
  ]);
  const config: CompendiumConfig = {
    ...base,
    filters: [
      { param: "slot", label: "All slots", col: "slot", options: slots },
      {
        param: "retold",
        label: "Retold — any",
        col: "is_retold",
        options: retold.map((o) => ({ ...o, label: o.value === "yes" ? "Retold only" : o.value })),
      },
    ],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
