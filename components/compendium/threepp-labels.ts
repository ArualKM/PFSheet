/** Friendly labels for the 3pp compendiums' snake_case `system` column (filter options + badges). */
export const SYSTEM_LABELS: Record<string, string> = {
  akashic: "Akashic",
  path_of_war: "Path of War",
  psionic: "Psionics",
  spheres: "Spheres",
  rune_magic: "Rune Magic",
  other: "Other",
};

export function systemLabel(value: unknown): string {
  const v = String(value ?? "");
  return SYSTEM_LABELS[v] ?? v;
}

/** Remap distinctValues() options to friendly system labels (values stay raw for the `.eq` filter). */
export function withSystemLabels(options: { value: string; label: string }[]): { value: string; label: string }[] {
  return options.map((o) => ({ ...o, label: systemLabel(o.value) }));
}
