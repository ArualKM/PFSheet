import { LayoutDashboard, ScrollText, Swords, Sparkles, Orbit, Settings, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  /** Short label for the mobile bottom nav (falls back to the first word of label). */
  shortLabel?: string;
  icon: LucideIcon;
  /** Show in the mobile bottom navigation. */
  mobile?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/characters", label: "Characters", icon: ScrollText, mobile: true },
  { href: "/campaigns", label: "Campaigns", icon: Swords, mobile: true },
  { href: "/spells", label: "Spell Compendium", shortLabel: "Spells", icon: Sparkles, mobile: true },
  { href: "/spheres", label: "Spheres Compendium", shortLabel: "Spheres", icon: Orbit },
  { href: "/settings", label: "Settings", icon: Settings },
];
