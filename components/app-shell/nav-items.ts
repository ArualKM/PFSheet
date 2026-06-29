import type { ComponentType } from "react";
import { TreasureMap, User, Flag, ScrollText, Settings } from "@/components/ui/game-icons";

export type NavItem = {
  href: string;
  label: string;
  /** Short label for the mobile bottom nav (falls back to the first word of label). */
  shortLabel?: string;
  /** One-line blurb shown in the collapsed-rail hover tooltip (beneath the label). */
  description?: string;
  /** Any icon component taking `{ className }` — lucide icons + the game-icons wrappers both qualify. */
  icon: ComponentType<{ className?: string }>;
  /** Show in the mobile bottom navigation. */
  mobile?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", description: "Your jumping-off point & recent activity", icon: TreasureMap, mobile: true },
  { href: "/characters", label: "Characters", description: "Build, edit & share character sheets", icon: User, mobile: true },
  { href: "/campaigns", label: "Campaigns", description: "Run tables, rosters & GM approvals", icon: Flag, mobile: true },
  { href: "/compendium", label: "Compendium", shortLabel: "Library", description: "Search every PF1e rules element — feats, spells, spheres, races, archetypes & more", icon: ScrollText, mobile: true },
  { href: "/settings", label: "Settings", description: "Profile, API keys & preferences", icon: Settings },
];
