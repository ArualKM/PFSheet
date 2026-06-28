import type { ComponentType } from "react";
import { TreasureMap, User, Flag, Wand2, ConcentrationOrb, Settings } from "@/components/ui/game-icons";

export type NavItem = {
  href: string;
  label: string;
  /** Short label for the mobile bottom nav (falls back to the first word of label). */
  shortLabel?: string;
  /** Any icon component taking `{ className }` — lucide icons + the game-icons wrappers both qualify. */
  icon: ComponentType<{ className?: string }>;
  /** Show in the mobile bottom navigation. */
  mobile?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: TreasureMap, mobile: true },
  { href: "/characters", label: "Characters", icon: User, mobile: true },
  { href: "/campaigns", label: "Campaigns", icon: Flag, mobile: true },
  { href: "/spells", label: "Spell Compendium", shortLabel: "Spells", icon: Wand2, mobile: true },
  { href: "/spheres", label: "Spheres Compendium", shortLabel: "Spheres", icon: ConcentrationOrb },
  { href: "/settings", label: "Settings", icon: Settings },
];
