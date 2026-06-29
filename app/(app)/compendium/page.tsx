import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType } from "react";
import { Wand2, ConcentrationOrb, Swords, ScrollText, User, Shield, Flag, Target } from "@/components/ui/game-icons";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Compendium" };

const ENTRIES: { href: string; label: string; desc: string; Icon: ComponentType<{ className?: string }> }[] = [
  { href: "/feats", label: "Feats", desc: "3,300+ feats, with prerequisites", Icon: Swords },
  { href: "/traits", label: "Traits", desc: "1,900+ character traits", Icon: ScrollText },
  { href: "/races", label: "Races", desc: "Every Pathfinder race", Icon: User },
  { href: "/archetypes", label: "Archetypes", desc: "1,300+ class archetypes", Icon: Shield },
  { href: "/class-options", label: "Class Options", desc: "Talents · discoveries · bloodlines · hexes", Icon: Target },
  { href: "/prestige", label: "Prestige Classes", desc: "100+ prestige classes", Icon: Flag },
  { href: "/spells", label: "Spells", desc: "3,000+ spells", Icon: Wand2 },
  { href: "/spheres", label: "Spheres", desc: "Power · Might · Guile talents", Icon: ConcentrationOrb },
];

export default function CompendiumHub() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Compendium"
        description="The complete Pathfinder 1e reference — search and browse every rules element, ready to drop onto your sheet."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ENTRIES.map(({ href, label, desc, Icon }) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <Card className="h-full transition-colors hover:border-gold/40 hover:bg-surface-raised">
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="size-6 shrink-0 text-gold" />
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{label}</div>
                  <div className="truncate text-xs text-muted-foreground">{desc}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
