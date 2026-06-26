/**
 * Shared import helpers. Source files from external tools are messy — values are
 * stringly-typed, slots get reused as section dividers or trackers, and empty
 * slots often carry a template's placeholder label. These helpers normalize and
 * recognize that noise so adapters can map the real data and preserve the rest.
 */

/** Coerce any source value to a trimmed string ("" for null/undefined). */
export function str(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v.trim() : String(v).trim();
}

/** Parse an integer anywhere in the value (first signed run of digits). */
export function parseLeadingInt(v: unknown): number | undefined {
  const m = str(v).match(/-?\d+/);
  return m ? Number.parseInt(m[0], 10) : undefined;
}

/** Parse a strict integer (whole trimmed value), else undefined. */
export function toInt(v: unknown): number | undefined {
  const s = str(v);
  if (!/^-?\d+$/.test(s)) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A row used purely as a visual section divider, e.g. "##### Feats #####".
 * Single-line only — a multi-line text block that merely *contains* `#####`
 * headers (the way users overload Myth-Weavers text areas) is NOT a divider.
 */
export function isDivider(v: string): boolean {
  const s = v.trim();
  if (!s || s.includes("\n")) return false;
  if (/^[#=*_\-~\s]+$/.test(s)) return true; // only separator chars
  // "##### Something #####": starts and ends with 3+ separators, reasonably short.
  return s.length < 80 && /^[#=*_\-~]{3,}.*[#=*_\-~]{3,}$/.test(s);
}

/**
 * Known Myth-Weavers template placeholder labels left in unused slots. These are
 * NOT real data — an empty slot still serializes its template caption.
 */
const PLACEHOLDER_EXACT = new Set(
  [
    "Item",
    "Weight",
    "Loc",
    "Language",
    "None",
    "Properties",
    "Character Name",
    "Player Name",
    "Race",
    "Class",
    "Level",
    "Caster Level",
    "Deity",
    "Size",
    "Age",
    "Gender",
    "Height",
    "Weight",
    "Eyes",
    "Hair",
    "Speed",
    "Armor Type",
    "BAB",
    "Melee Total Attack",
    "Stat Block",
    "Personality Text",
    "Character Flaws",
    "Additional Information",
    "Conditions",
    "Contacts/Friends",
    "Character Traits",
    "Description",
    "Other Notes",
    "Private Notes Text",
    "Enemies Text",
    "Hero Points",
    "Campaign NAme",
    "Campaign Name",
    "Weapon3",
    "Weapon 4",
    "Shield Name",
    "Alignment",
    "Armor",
  ].map((x) => x.toLowerCase()),
);

/** Whether a value is an empty slot or a leftover template placeholder caption. */
export function isPlaceholder(v: string): boolean {
  const s = v.trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (PLACEHOLDER_EXACT.has(lower)) return true;
  if (/\b(first|final) slot$/i.test(s)) return true; // "Skill Final Slot", "...First Slot"
  if (/^#+\s*memorized/i.test(s)) return true; // "# Memorized/Cast First Slot"
  return false;
}

/** Real content = non-empty, not a placeholder, not a divider. */
export function isRealValue(v: unknown): boolean {
  const s = str(v);
  return Boolean(s) && !isPlaceholder(s) && !isDivider(s);
}
