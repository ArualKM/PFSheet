/**
 * Common PF1e metamagic feats with their spell-slot level adjustment. Applying a metamagic feat to a
 * prepared spell raises the slot it occupies by `levelAdjust`. Heighten is variable (raise to any
 * level up to your max); we model its minimum (+1) and let the player bump the slot further by hand.
 */
export type MetamagicCatalogEntry = {
  id: string;
  name: string;
  levelAdjust: number;
  /** Short reminder of the effect. */
  blurb: string;
};

export const METAMAGIC_CATALOG: MetamagicCatalogEntry[] = [
  { id: "mm_empower", name: "Empower Spell", levelAdjust: 2, blurb: "Variable, numeric effects +50%." },
  { id: "mm_maximize", name: "Maximize Spell", levelAdjust: 3, blurb: "Variable, numeric effects are maximized." },
  { id: "mm_quicken", name: "Quicken Spell", levelAdjust: 4, blurb: "Cast as a swift action." },
  { id: "mm_extend", name: "Extend Spell", levelAdjust: 1, blurb: "Duration doubled." },
  { id: "mm_enlarge", name: "Enlarge Spell", levelAdjust: 1, blurb: "Range doubled." },
  { id: "mm_widen", name: "Widen Spell", levelAdjust: 3, blurb: "Area increased by 100%." },
  { id: "mm_heighten", name: "Heighten Spell", levelAdjust: 1, blurb: "Cast at a higher effective level (variable)." },
  { id: "mm_silent", name: "Silent Spell", levelAdjust: 1, blurb: "No verbal component." },
  { id: "mm_still", name: "Still Spell", levelAdjust: 1, blurb: "No somatic component." },
  { id: "mm_reach", name: "Reach Spell", levelAdjust: 1, blurb: "Touch spell gains 30 ft range (per +1)." },
  { id: "mm_intensified", name: "Intensified Spell", levelAdjust: 1, blurb: "Raise the damage dice cap by 5." },
  { id: "mm_persistent", name: "Persistent Spell", levelAdjust: 2, blurb: "Target rolls a failed save twice, takes worse." },
  { id: "mm_selective", name: "Selective Spell", levelAdjust: 1, blurb: "Exclude allies from an area spell." },
  { id: "mm_dazing", name: "Dazing Spell", levelAdjust: 3, blurb: "Damaged creatures may be dazed." },
  { id: "mm_bouncing", name: "Bouncing Spell", levelAdjust: 1, blurb: "Redirect a spell that fails to affect its target." },
  { id: "mm_toppling", name: "Toppling Spell", levelAdjust: 0, blurb: "Force spells gain a trip attempt." },
  { id: "mm_rime", name: "Rime Spell", levelAdjust: 1, blurb: "Cold spells also entangle." },
  { id: "mm_ectoplasmic", name: "Ectoplasmic Spell", levelAdjust: 1, blurb: "Affects incorporeal/ethereal fully." },
  { id: "mm_elemental", name: "Elemental Spell", levelAdjust: 1, blurb: "Change a spell's damage energy type." },
  { id: "mm_piercing", name: "Piercing Spell", levelAdjust: 1, blurb: "Reduce spell resistance by 5." },
];

const BY_ID = new Map(METAMAGIC_CATALOG.map((m) => [m.id, m]));

export function metamagicCatalogEntry(id: string): MetamagicCatalogEntry | undefined {
  return BY_ID.get(id);
}
