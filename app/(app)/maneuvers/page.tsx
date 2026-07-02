import type { Metadata } from "next";
import { Swords } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Meta,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Maneuvers" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Maneuvers",
  describe: (n) =>
    `Search ${n ? n.toLocaleString() : "all"} Path of War maneuvers — strikes, boosts, counters & stances by discipline.`,
  icon: <Swords />,
  rpc: "search_pow_maneuver_compendium",
  table: "pow_maneuver_compendium",
  orderCol: "name",
  selectCols:
    "slug,name,discipline,level,type,initiation_action,range,target,duration,saving_throw,prerequisite,description,source",
  placeholder: "Search maneuvers — e.g. Steel Flurry, Iron Shell, Searing Break…",
  basePath: "/maneuvers",
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
        <Meta label="Discipline" value={r.discipline} />
        <Meta label="Level" value={r.level} />
      </dl>
    </>
  ),
  hasDetail: (r) =>
    [r.initiation_action, r.range, r.target, r.duration, r.saving_throw, r.prerequisite, r.description].some(hasText),
  renderDetail: (r) => (
    <>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Initiation Action" value={r.initiation_action} />
        <Meta label="Range" value={r.range} />
        <Meta label="Target" value={r.target} />
        <Meta label="Duration" value={r.duration} />
        <Meta label="Saving Throw" value={r.saving_throw} />
        <Meta label="Prerequisite" value={r.prerequisite} />
      </dl>
      <Prose value={r.description} />
    </>
  ),
};

export default async function ManeuversPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [disciplines, types, levels] = await Promise.all([
    distinctValues("pow_maneuver_compendium", "discipline"),
    distinctValues("pow_maneuver_compendium", "type"),
    distinctValues("pow_maneuver_compendium", "level"),
  ]);
  const config: CompendiumConfig = {
    ...base,
    filters: [
      { param: "discipline", label: "All disciplines", col: "discipline", options: disciplines },
      { param: "type", label: "All types", col: "type", options: types },
      { param: "level", label: "All levels", col: "level", options: levels },
    ],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
