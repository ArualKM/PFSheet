import type { Metadata } from "next";
import { Helmet } from "@/components/ui/game-icons";
import { Badge } from "@/components/ui/badge";
import {
  CompendiumBrowser,
  distinctValues,
  hasText,
  Meta,
  Prose,
  type CompendiumConfig,
} from "@/components/compendium/compendium-browser";

export const metadata: Metadata = { title: "Classes" };

const base: Omit<CompendiumConfig, "filters"> = {
  title: "Classes",
  describe: (n) =>
    `Browse ${n ? n.toLocaleString() : "all"} base, core & hybrid classes — hit dice, skills, proficiencies, and role.`,
  icon: <Helmet />,
  rpc: "search_class_compendium",
  table: "class_compendium",
  orderCol: "name",
  selectCols:
    "slug,name,category,role,hit_die,skill_points_per_level,class_skills,proficiencies,alignment,starting_wealth,source,description",
  placeholder: "Search classes — e.g. Fighter, Wizard, Magus, Investigator…",
  basePath: "/classes",
  rowKey: (r) => String(r.slug),
  summaryLabel: (r) => String(r.name),
  renderSummary: (r) => (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold text-foreground">{String(r.name)}</h2>
      {r.category ? <Badge variant="gold">{String(r.category)}</Badge> : null}
      {r.hit_die ? <Badge variant="rune">{String(r.hit_die).replace(/\.$/, "")}</Badge> : null}
      {r.source ? <span className="ml-auto text-xs text-muted-foreground">{String(r.source)}</span> : null}
    </div>
  ),
  hasDetail: (r) =>
    [
      r.hit_die,
      r.skill_points_per_level,
      r.alignment,
      r.starting_wealth,
      r.role,
      r.class_skills,
      r.proficiencies,
      r.description,
    ].some(hasText),
  renderDetail: (r) => (
    <>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Meta label="Hit Die" value={r.hit_die} />
        <Meta label="Skill Ranks / Level" value={r.skill_points_per_level} />
        <Meta label="Alignment" value={r.alignment} />
        <Meta label="Starting Wealth" value={r.starting_wealth} />
      </dl>
      <Prose label="Role" value={r.role} />
      <Prose label="Class Skills" value={r.class_skills} />
      <Prose label="Proficiencies" value={r.proficiencies} />
      <Prose value={r.description} />
    </>
  ),
};

export default async function ClassesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const categories = await distinctValues("class_compendium", "category");
  const config: CompendiumConfig = {
    ...base,
    filters: [{ param: "category", label: "All categories", col: "category", options: categories }],
  };
  return <CompendiumBrowser config={config} searchParams={searchParams} />;
}
