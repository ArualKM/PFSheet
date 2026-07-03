/**
 * Pure helpers for the Spheres talent lists (read view + editor). Kept in a lib file (no React,
 * no Supabase) so the tier-grouping rule is unit-testable.
 *
 * Sphere talents carry a `category` of "Base Talent" / "Advanced Talent" / "Legendary Talent"
 * (some rows have none). The read view + editor group each sphere's talents by tier in a fixed
 * order so a player can scan Base vs Advanced vs Legendary at a glance.
 */

/** The tier buckets in display order; uncategorized talents fall into "Other". */
export const TALENT_TIERS = ["Base", "Advanced", "Legendary", "Other"] as const;
export type TalentTier = (typeof TALENT_TIERS)[number];

/** Map a raw `category` value ("Base Talent" / "Advanced Talent" / "Legendary Talent" / undefined)
 * to its tier bucket. Anything unrecognized (or missing) → "Other". */
export function talentTier(category?: string | null): TalentTier {
  const c = (category ?? "").toLowerCase();
  if (c.includes("legendary")) return "Legendary";
  if (c.includes("advanced")) return "Advanced";
  if (c.includes("base")) return "Base";
  return "Other";
}

/**
 * Group a sphere's talents by tier (Base → Advanced → Legendary → Other), dropping empty tiers and
 * sorting each tier's talents alphabetically by name. Callers render tier subheaders only when the
 * result has more than one group (mixed tiers); a single-tier sphere lists its talents flat.
 */
export function groupTalentsByCategory<T extends { name: string; category?: string }>(
  talents: T[],
): Array<{ tier: TalentTier; talents: T[] }> {
  const by = new Map<TalentTier, T[]>();
  for (const t of talents) {
    const tier = talentTier(t.category);
    const list = by.get(tier);
    if (list) list.push(t);
    else by.set(tier, [t]);
  }
  return TALENT_TIERS.filter((tier) => by.has(tier)).map((tier) => ({
    tier,
    talents: [...by.get(tier)!].sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
