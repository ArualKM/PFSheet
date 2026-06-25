import { LayoutDashboard, ScrollText, Swords, Sparkles, Settings, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show in the mobile bottom navigation. */
  mobile?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/characters", label: "Characters", icon: ScrollText, mobile: true },
  { href: "/campaigns", label: "Campaigns", icon: Swords, mobile: true },
  { href: "/spells", label: "Spell Compendium", icon: Sparkles, mobile: true },
  { href: "/settings", label: "Settings", icon: Settings },
];
