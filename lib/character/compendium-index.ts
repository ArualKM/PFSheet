import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { CompendiumIndex } from "./compendium-hunt";

/** Build the in-memory compendium index for the import hunt. Paginates because the reference tables
 * (~3.9k talents, ~3k spells) exceed PostgREST's 1000-row default. Read-only, public tables. */
type DB = SupabaseClient<Database>;

const lc = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();
const PAGE = 1000;

async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function loadCompendiumIndex(supabase: DB): Promise<CompendiumIndex> {
  const spheres = await fetchAll<{ id: string; name: string; system: string }>((f, t) =>
    supabase.from("sphere_compendium").select("id,name,system").range(f, t),
  );
  const sphereSystem = new Map<string, string>();
  const spheresMap: CompendiumIndex["spheres"] = new Map();
  for (const s of spheres) {
    sphereSystem.set(s.name.toLowerCase(), s.system);
    spheresMap.set(lc(s.name), { id: s.id, name: s.name, system: s.system });
  }

  const talents = await fetchAll<{
    id: string;
    talent_name: string;
    sphere_name: string;
    talent_category: string | null;
  }>((f, t) => supabase.from("sphere_talents").select("id,talent_name,sphere_name,talent_category").range(f, t));
  const talentsMap: CompendiumIndex["talents"] = new Map();
  for (const tal of talents) {
    const key = lc(tal.talent_name);
    if (talentsMap.has(key)) continue; // first wins on duplicate names
    talentsMap.set(key, {
      id: tal.id,
      talentName: tal.talent_name,
      sphereName: tal.sphere_name,
      system: sphereSystem.get(tal.sphere_name.toLowerCase()) ?? "Magic",
      category: tal.talent_category ?? "",
    });
  }

  const spells = await fetchAll<{ id: string; name: string }>((f, t) =>
    supabase.from("spell_compendium").select("id,name").range(f, t),
  );
  const spellsMap: CompendiumIndex["spells"] = new Map();
  for (const sp of spells) {
    const key = lc(sp.name);
    if (!spellsMap.has(key)) spellsMap.set(key, { id: sp.id, name: sp.name });
  }

  return { talents: talentsMap, spheres: spheresMap, spells: spellsMap };
}
