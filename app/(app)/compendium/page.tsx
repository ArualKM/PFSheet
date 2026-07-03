import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  Wand2,
  ConcentrationOrb,
  Swords,
  ScrollText,
  User,
  Shield,
  Flag,
  Target,
  Helmet,
  Sparkles,
  Coins,
  EyeOff,
  GameIcon,
} from "@/components/ui/game-icons";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Compendium" };

type Entry = { href: string; label: string; desc: string; Icon: ComponentType<{ className?: string }> };

const GemPendant = ({ className }: { className?: string }) => <GameIcon name="item-magic_item" className={className} />;

const ENTRIES: Entry[] = [
  { href: "/classes", label: "Classes", desc: "Base, core & hybrid classes", Icon: Helmet },
  { href: "/feats", label: "Feats", desc: "3,300+ feats, with prerequisites", Icon: Swords },
  { href: "/traits", label: "Traits", desc: "1,900+ character traits", Icon: ScrollText },
  { href: "/races", label: "Races", desc: "Every Pathfinder race", Icon: User },
  { href: "/archetypes", label: "Archetypes", desc: "1,300+ class archetypes", Icon: Shield },
  { href: "/class-options", label: "Class Options", desc: "Talents · discoveries · bloodlines · hexes", Icon: Target },
  { href: "/prestige", label: "Prestige Classes", desc: "100+ prestige classes", Icon: Flag },
  { href: "/spells", label: "Spells", desc: "3,000+ spells", Icon: Wand2 },
];

const THIRD_PARTY: Entry[] = [
  { href: "/spheres", label: "Spheres", desc: "Power · Might · Guile talents", Icon: ConcentrationOrb },
  { href: "/psionic-powers", label: "Psionic Powers", desc: "Dreamscarred Press powers, by discipline", Icon: Sparkles },
  { href: "/maneuvers", label: "Maneuvers", desc: "Path of War strikes · boosts · counters · stances", Icon: Swords },
  { href: "/veils", label: "Veils", desc: "Akashic Mysteries veilweaving", Icon: GemPendant },
  { href: "/threepp-feats", label: "3pp Feats", desc: "Psionic · Path of War · akashic · spheres feats", Icon: Target },
  { href: "/threepp-classes", label: "3pp Classes", desc: "Base & prestige classes from 3pp systems", Icon: Helmet },
  { href: "/threepp-archetypes", label: "3pp Archetypes", desc: "Third-party archetypes by base class", Icon: Shield },
  { href: "/threepp-class-options", label: "3pp Class Options", desc: "Third-party discoveries · rage powers · hexes", Icon: Target },
  { href: "/threepp-traits", label: "3pp Traits", desc: "Practitioner & other third-party traits", Icon: ScrollText },
  { href: "/oaths", label: "Oaths", desc: "Sacred oaths & oath points", Icon: Flag },
  { href: "/oath-boons", label: "Oath Boons", desc: "Boons bought with oath points", Icon: Coins },
  { href: "/threepp-options", label: "Drawbacks & Flaws", desc: "Major drawbacks & character flaws", Icon: EyeOff },
];

function CardGrid({ entries }: { entries: Entry[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(({ href, label, desc, Icon }) => (
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
  );
}

export default function CompendiumHub() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Compendium"
        description="The complete Pathfinder 1e reference — search and browse every rules element, ready to drop onto your sheet."
      />
      <CardGrid entries={ENTRIES} />
      <h2 className="mb-3 mt-8 text-lg font-semibold text-foreground">Third-party</h2>
      <CardGrid entries={THIRD_PARTY} />
    </div>
  );
}
