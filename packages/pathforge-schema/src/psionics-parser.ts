import type { PsionicPowerEntry } from "./psionics";

/** A parsed power (no id — the caller assigns one). */
export type ParsedPower = Omit<PsionicPowerEntry, "id">;

export type ParsePowersResult = { powers: ParsedPower[]; warnings: string[] };

const DISCIPLINES = [
  "clairsentience",
  "metacreativity",
  "psychokinesis",
  "psychometabolism",
  "psychoportation",
  "telepathy",
];

const PSIONIC_CLASSES =
  "psion|wilder|psychic\\s*warrior|kineticist|nomad|seer|shaper|egoist|telepath|cryptic|tactician|vitalist|dread|marksman|aegis|soulknife";

/** Pull the lowest level the power is learnable at (powers list multiple class levels). */
function extractLevel(text: string): number | undefined {
  // Prefer "Level ... <n>"; fall back to "<class> <n>". Collect all and take the minimum.
  const nums: number[] = [];
  const levelLine = text.match(/level\b([^\n]*)/i)?.[1] ?? "";
  const re = new RegExp(`(?:${PSIONIC_CLASSES})[^\\d\\n]{0,12}(\\d)`, "gi");
  for (const src of [levelLine, text]) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, "gi");
    while ((m = r.exec(src)) !== null) nums.push(parseInt(m[1]!, 10));
    if (nums.length) break;
  }
  if (!nums.length) {
    const bare = levelLine.match(/(\d)/)?.[1];
    if (bare) nums.push(parseInt(bare, 10));
  }
  return nums.length ? Math.min(...nums) : undefined;
}

/**
 * Parse one or more pasted psionic-power statblocks into structured powers. Lenient + never-discard:
 * whatever can't be mapped to a field stays in `description`, so nothing is lost. Blocks are split on
 * blank lines; the first line of each is the power name.
 */
export function parsePsionicPowers(raw: string): ParsePowersResult {
  const warnings: string[] = [];
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return { powers: [], warnings: ["Nothing to parse — paste a power statblock."] };

  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const powers: ParsedPower[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim());
    const name = (lines.find(Boolean) ?? "").replace(/^[•\-*]\s*/, "").trim();
    if (!name) continue;

    const level = extractLevel(block);
    const ppCost = block.match(/power\s*points?:?\s*(\d+)/i)?.[1];
    const disciplineRaw = block.match(/discipline:?\s*([a-z]+)/i)?.[1]?.toLowerCase();
    const discipline = disciplineRaw && DISCIPLINES.includes(disciplineRaw) ? disciplineRaw : undefined;
    const augment = block.match(/augment(?:ed?)?:?\s*([^]*)$/i)?.[1]?.trim();

    powers.push({
      name,
      level: level ?? 1,
      ...(discipline ? { discipline } : {}),
      ...(ppCost ? { ppCost: parseInt(ppCost, 10) } : {}),
      ...(augment ? { augment: augment.slice(0, 600) } : {}),
      // Preserve the full pasted text so nothing is silently discarded.
      description: block.slice(0, 4000),
    });

    if (level === undefined) warnings.push(`Couldn't read a level for "${name}" — defaulted to 1.`);
  }

  if (powers.length === 0) warnings.push("Couldn't recognize any powers in the pasted text.");
  return { powers, warnings };
}
