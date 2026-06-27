/**
 * §6.3 Point-buy math. Pure + deterministic — lives in the rules package (which owns
 * all game math) and is consumed by the abilities editor and any importer. The
 * standard PF1e cost table maps an ability score to its cumulative point cost.
 */
export const POINT_BUY_COST: Record<number, number> = {
  7: -4,
  8: -2,
  9: -1,
  10: 0,
  11: 1,
  12: 2,
  13: 3,
  14: 5,
  15: 7,
  16: 10,
  17: 13,
  18: 17,
};

export const POINT_BUY_MIN = 7;
export const POINT_BUY_MAX = 18;

/** Cumulative point cost for a single ability score; null if outside the table. */
export function pointBuyCost(score: number, table: Record<number, number> = POINT_BUY_COST): number | null {
  const cost = table[score];
  return cost === undefined ? null : cost;
}

/** Total points spent across an allocation map (scores outside the table count 0). */
export function pointBuySpent(
  allocations: Record<string, number>,
  table: Record<number, number> = POINT_BUY_COST,
): number {
  let total = 0;
  for (const key of Object.keys(allocations)) {
    const score = allocations[key];
    if (score === undefined) continue;
    const cost = pointBuyCost(score, table);
    if (cost !== null) total += cost;
  }
  return total;
}

/** Points left given a budget and an allocation map (negative = over budget). */
export function pointBuyRemaining(
  budget: number,
  allocations: Record<string, number>,
  table: Record<number, number> = POINT_BUY_COST,
): number {
  return budget - pointBuySpent(allocations, table);
}

/**
 * The single definition of `score.score = pre-racial base + racial + other`. Keeping
 * it in one place means the UI and any importer recompose scores identically and a
 * racial modifier is never double-counted.
 */
export function composeAbilityScore(pointBuyBase: number, racial = 0, other = 0): number {
  return pointBuyBase + racial + other;
}
