import { cn } from "@/lib/utils";

/**
 * game-icons.net glyphs rendered as a CSS mask so they inherit the current text color
 * (`currentColor`) across every theme. The source SVGs are hardcoded `fill="#000"`, so a plain
 * <img> would paint solid black and ignore the `--pf-*` theme tokens; instead we cut a
 * `currentColor` background to the glyph shape with `mask-image`. Pure presentational component —
 * safe in both Server and Client trees. Icons are decorative (`aria-hidden`); the adjacent text
 * label carries the meaning.
 *
 * Art: CC-BY 3.0 — Lorc, Delapouite, sbed, Skoll, caro-asercion, et al. (game-icons.net). Keep an
 * attribution note reachable from the app (e.g. /about or the footer) per the licence.
 */
const ICON_BASE = "/icons/000000/transparent/1x1";

// Semantic name -> "<artist>/<file>". Every path is verified to exist under public/icons.
const ICON_FILES = {
  // vitals · combat · defenses
  hp: "sbed/health-normal",
  shield: "sbed/shield",
  combat: "lorc/crossed-swords",
  initiative: "lorc/lightning-arc",
  speed: "lorc/run",
  // abilities · magic · story
  abilities: "delapouite/sparkles",
  spellcasting: "lorc/magic-swirl",
  scroll: "lorc/scroll-unfurled",
  languages: "lorc/conversation",
  flag: "lorc/flying-flag",
  sphere: "lorc/concentration-orb",
  // nav · sheet sections
  dashboard: "lorc/treasure-map",
  character: "delapouite/character",
  skills: "delapouite/skills",
  settings: "delapouite/settings-knobs",
  // wealth · inventory
  coins: "delapouite/two-coins",
  backpack: "delapouite/backpack",
  wand: "lorc/fairy-wand",
  // privacy
  eye: "lorc/eyeball",
  "eye-off": "skoll/sight-disabled",
  // inventory category glyphs (keyed `item-<category>`)
  "item-weapon": "lorc/broadsword",
  "item-armor": "lorc/breastplate",
  "item-shield": "sbed/shield",
  "item-potion": "lorc/potion-ball",
  "item-scroll": "lorc/scroll-unfurled",
  "item-wand": "lorc/fairy-wand",
  "item-magic_item": "lorc/gem-pendant",
  "item-gear": "lorc/swap-bag",
  "item-other": "delapouite/cube",
} as const;

export type GameIconName = keyof typeof ICON_FILES;

export function GameIcon({ name, className }: { name: GameIconName; className?: string }) {
  const url = `${ICON_BASE}/${ICON_FILES[name]}.svg`;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current align-[-0.125em]", className)}
      style={{
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

/** The category glyph name for an inventory item (falls back to a generic box). */
export function itemIconName(category: string): GameIconName {
  const key = `item-${category}`;
  return (key in ICON_FILES ? key : "item-other") as GameIconName;
}

// Drop-in components matching the lucide call signature (`{ className }`) so existing `icon={...}`
// props on SectionCard / StatTile swap 1:1 without touching the call sites.
type IconProps = { className?: string };
const make = (name: GameIconName) =>
  function GameIconGlyph(props: IconProps) {
    return <GameIcon name={name} className={props.className} />;
  };

export const Heart = make("hp");
export const Shield = make("shield");
export const Swords = make("combat");
export const Zap = make("initiative");
export const Footprints = make("speed");
export const Sparkles = make("abilities");
export const Languages = make("languages");
export const Backpack = make("backpack");
export const Coins = make("coins");
export const ScrollText = make("scroll");
export const Wand2 = make("spellcasting");
export const Flag = make("flag");
export const Eye = make("eye");
export const EyeOff = make("eye-off");
export const TreasureMap = make("dashboard");
export const ConcentrationOrb = make("sphere");
export const User = make("character");
export const Target = make("skills");
export const Settings = make("settings");
