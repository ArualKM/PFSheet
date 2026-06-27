/**
 * PF1e full-attack iterative bonuses: a character gets one extra attack for every 5 points of
 * base attack bonus (BAB 6 → two attacks, 11 → three, 16 → four), each 5 lower than the last.
 * Applied to a weapon's top attack bonus. Pure; the UI formats the numbers.
 */
export function iterativeAttackBonuses(topBonus: number, bab: number): number[] {
  const count = bab <= 0 ? 1 : Math.min(4, Math.floor((bab - 1) / 5) + 1);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(topBonus - i * 5);
  return out;
}
