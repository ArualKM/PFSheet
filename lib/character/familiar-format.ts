/** "sense_motive" → "Sense Motive". */
export function titleCaseKey(key: string): string {
  return key
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** A familiar master-benefit engine effect → a short human label ("+3 Stealth", "+2 Fortitude save"). */
export function formatFamiliarEffect(eff: { target: string; value: number }): string {
  const sign = eff.value >= 0 ? "+" : "";
  if (eff.target === "init") return `${sign}${eff.value} initiative`;
  if (eff.target === "hp") return `${sign}${eff.value} HP`;
  const [domain, key] = eff.target.split(".");
  if (domain === "skill" && key) return `${sign}${eff.value} ${titleCaseKey(key)}`;
  if (domain === "save" && key) return `${sign}${eff.value} ${titleCaseKey(key)} save`;
  return `${sign}${eff.value}`;
}
