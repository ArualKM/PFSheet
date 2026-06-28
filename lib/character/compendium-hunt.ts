import type { PathForgeCharacterV1 } from "@pathforge/schema";

/**
 * Import "hunt": after an adapter parses a source sheet, match the free-text entries it produced
 * (sphere talents dumped into known-spells / feats, plain spells) against the seeded compendiums and
 * LINK them — turning opaque strings like "2[Monk]. Mass Teleport [mass]" into a structured
 * character.spheres.talent with a compendiumId, the right sphere, and the enabled Spheres module.
 *
 * This is format-agnostic: it operates on the parsed PathForge character, so it upgrades Myth-Weavers
 * AND Foundry imports alike. Pure (takes a prebuilt index) so it's unit-testable without a DB; the
 * server builds the index from Supabase. Never destructive beyond MOVING a matched entry — unmatched
 * spells/feats stay exactly where they were.
 */
export type CompendiumIndex = {
  /** normalized talent name → talent + its sphere's system. */
  talents: Map<string, { id: string; talentName: string; sphereName: string; system: string; category: string }>;
  /** normalized sphere name → sphere. */
  spheres: Map<string, { id: string; name: string; system: string }>;
  /** normalized spell name → spell. */
  spells: Map<string, { id: string; name: string }>;
};

export type HuntReport = {
  talentsLinked: number;
  spellsLinked: number;
  spheresAdded: number;
  modulesEnabled: string[];
};

const lc = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A section-divider / header row a power user typed into a slot (mostly '#'), never a real entry. */
function isDivider(s: string): boolean {
  return /#{3,}/.test(s) || s.trim().length === 0;
}

/** Strip a slot's bookkeeping so the bare entry name remains, then return match-candidate keys.
 * Handles "N[Source]. Name", "N. Name", "N: Name", and trailing "[tag]" / "(tag)" qualifiers. */
function candidateKeys(raw: string): string[] {
  let s = raw.trim();
  s = s.replace(/^\s*\d+\s*\[[^\]]*\]\s*[.:)]\s*/, ""); // "2[Monk]. " / "2[Monk]) "
  s = s.replace(/^\s*\d+\s*[.:)]\s*/, ""); // "2. " / "2) "
  const base = s.trim();
  let stripped = base;
  let prev = "";
  while (stripped !== prev) {
    prev = stripped;
    stripped = stripped
      .replace(/\s*\[[^\]]*\]\s*$/, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
  }
  return [...new Set([lc(base), lc(stripped)].filter(Boolean))];
}

const moduleForSystem = (system: string): string =>
  system === "Combat" ? "spheres_of_might" : system === "Skill" ? "spheres_of_guile" : "spheres_of_power";

const sphereSystem = (system: string): "Magic" | "Combat" | "Skill" =>
  system === "Combat" || system === "Skill" ? system : "Magic";

/** Enrich `character` in place by linking compendium matches. Returns a report of what was linked. */
export function huntCompendium(character: PathForgeCharacterV1, index: CompendiumIndex): HuntReport {
  const report: HuntReport = { talentsLinked: 0, spellsLinked: 0, spheresAdded: 0, modulesEnabled: [] };

  if (!character.spheres) {
    character.spheres = { casterClasses: [], spheres: [], talents: [], drawbacks: [], boons: [], bonusSpellPoints: 0 };
  }
  const sph = character.spheres;
  const sphereNames = new Set(sph.spheres.map((s) => s.name.toLowerCase()));
  const talentIds = new Set(sph.talents.map((t) => t.compendiumId).filter(Boolean) as string[]);
  const systemsFound = new Set<string>();

  let idc = 0;
  const nid = (p: string) => `hunt-${p}-${idc++}`;

  const addTalent = (raw: string): boolean => {
    if (isDivider(raw)) return false;
    for (const c of candidateKeys(raw)) {
      const t = index.talents.get(c);
      if (!t) continue;
      if (!talentIds.has(t.id)) {
        sph.talents.push({
          id: nid("tal"),
          compendiumId: t.id,
          sphereName: t.sphereName,
          talentName: t.talentName,
          category: t.category || undefined,
        });
        talentIds.add(t.id);
        report.talentsLinked++;
      }
      if (!sphereNames.has(t.sphereName.toLowerCase())) {
        sph.spheres.push({ id: nid("sph"), name: t.sphereName, system: sphereSystem(t.system) });
        sphereNames.add(t.sphereName.toLowerCase());
        report.spheresAdded++;
      }
      systemsFound.add(t.system);
      return true;
    }
    return false;
  };

  // Known spells: a REAL SPELL ALWAYS WINS. Many sphere-talent names exactly equal real spell names
  // (Scrying, Resurrection, Break Enchantment, …), so a memorized spell must never be re-filed as a
  // talent (that would silently delete it from the spell list + wrongly enable Spheres). Only entries
  // that match no real spell fall through to talent matching.
  const keptSpells: typeof character.spellcasting.knownSpells = [];
  for (const spell of character.spellcasting.knownSpells) {
    let linkedSpell = false;
    if (!isDivider(spell.name)) {
      for (const c of candidateKeys(spell.name)) {
        const m = index.spells.get(c);
        if (m) {
          if (!spell.compendiumId) {
            spell.compendiumId = m.id;
            report.spellsLinked++;
          }
          linkedSpell = true;
          break;
        }
      }
    }
    if (!linkedSpell && addTalent(spell.name)) continue;
    keptSpells.push(spell);
  }
  character.spellcasting.knownSpells = keptSpells;

  // Feats: a slot whose name matches a sphere talent is a mis-filed talent — move it.
  character.feats.list = character.feats.list.filter((f) => !addTalent(f.name));

  // Enable the Spheres module(s) for the systems we actually found talents in.
  for (const system of systemsFound) {
    const key = moduleForSystem(system);
    const existing = character.rules.modules.find((m) => m.key === key);
    if (existing) {
      existing.enabled = true;
    } else {
      character.rules.modules.push({ key, enabled: true, settings: {} });
    }
    if (!report.modulesEnabled.includes(key)) report.modulesEnabled.push(key);
  }

  return report;
}
