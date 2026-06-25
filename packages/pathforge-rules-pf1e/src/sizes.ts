/** PF1e size categories and their special size modifiers. */
export type SizeModifiers = {
  /** Size modifier to AC and attack rolls (Small +1 … Large -1). */
  acMod: number;
  attackMod: number;
  /** Size modifier to CMB and CMD (inverse of attack: Small -1 … Large +1). */
  cmbMod: number;
  cmdMod: number;
};

const SIZE_TABLE: Record<string, number> = {
  fine: 8,
  diminutive: 4,
  tiny: 2,
  small: 1,
  medium: 0,
  large: -1,
  huge: -2,
  gargantuan: -4,
  colossal: -8,
};

export function getSizeModifiers(size: string | undefined): SizeModifiers {
  const key = (size ?? "medium").trim().toLowerCase();
  const acMod = SIZE_TABLE[key] ?? 0;
  return { acMod, attackMod: acMod, cmbMod: -acMod, cmdMod: -acMod };
}
