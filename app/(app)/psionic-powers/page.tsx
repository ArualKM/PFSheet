import type { Metadata } from "next";
import { Sparkles } from "@/components/ui/game-icons";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Meta,
  plain,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Psionic Powers" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Psionic Powers",
  describe: (n) =>
    `Search ${n ? n.toLocaleString() : "all"} psionic powers (Dreamscarred Press) by name, discipline, or effect.`,
  icon: <Sparkles />,
  rpc: "search_psionic_power_compendium",
  table: "psionic_power_compendium",
  orderCol: "name",
  selectCols: "slug,name,discipline,display,power_points,description,augment,mythic,source",
  placeholder: "Search powers — e.g. Energy Ray, Astral Construct, Mind Thrust…",
  basePath: "/psionic-powers",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
        {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Discipline" value={r.discipline} />
        <Meta label="Power Points" value={r.power_points} />
        <Meta label="Display" value={r.display} />
      </dl>
    </>
  ),
  hasDetail: (r) => [r.description, r.augment, r.mythic].some(hasText),
  renderDetail: (r) => (
    <>
      <Prose value={r.description} />
      <Prose label="Augment" value={r.augment} />
      <Prose label="Mythic" value={r.mythic} />
    </>
  ),
};

export default async function PsionicPowersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const disciplines = await distinctValues("psionic_power_compendium", "discipline");
  const config: CompendiumConfig = {
    ...base,
    filters: [
      {
        param: "discipline",
        label: "All disciplines",
        col: "discipline",
        options: disciplines.map((o) => ({ ...o, label: plain(o.value) })),
      },
    ],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
