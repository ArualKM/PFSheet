import Link from "next/link";
import {
  Share2,
  SlidersHorizontal,
  ShieldCheck,
  Zap,
  Smartphone,
  ArrowLeftRight,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getUser } from "@/lib/auth/session";

const features = [
  {
    icon: Share2,
    title: "Shareable command center",
    body: "A beautiful public or read-only profile for every character. Copy a link, drop it in Discord, keep the table in sync.",
  },
  {
    icon: SlidersHorizontal,
    title: "Explainable math",
    body: "Every value shows its work. Click any stat for the formula, resolved terms, and which modifiers stacked or were suppressed.",
  },
  {
    icon: ShieldCheck,
    title: "GM-verifiable, player-owned",
    body: "GMs inspect, audit, approve, and request changes — but can never edit a player's canonical sheet without explicit access.",
  },
  {
    icon: Zap,
    title: "Buff Center automation",
    body: "Toggle Haste, Bless, or Rage and watch AC, saves, attacks, and speed update — with stacking rules handled correctly.",
  },
  {
    icon: Smartphone,
    title: "Mobile session mode",
    body: "A one-handed table companion: HP, AC, quick rolls, attacks, and consumables, designed for phones and offline play.",
  },
  {
    icon: ArrowLeftRight,
    title: "Import & export",
    body: "Bring characters in from Foundry, Hero Lab, Myth-Weavers, or PDF — and export back out, without silently dropping data.",
  },
];

export default async function LandingPage() {
  const user = await getUser();
  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6">
      {/* Hero */}
      <section className="flex flex-col items-center py-20 text-center md:py-28">
        <Badge variant="gold" className="mb-6">
          PFSheet.org · Pathfinder 1e
        </Badge>
        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl">
          Your Pathfinder character,
          <br />
          <span className="text-gold">forged for the table.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          Build, customize, share, and play a Pathfinder 1e character from any device. Dashboard-first,
          formula-aware, mobile-friendly, and GM-verifiable — not a PDF clone.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {user ? (
            <Button asChild size="lg">
              <Link href="/dashboard">
                Open your dashboard <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg">
                <Link href="/signup">
                  Start building <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">I already have an account</Link>
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Feature grid */}
      <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="transition-colors hover:border-gold/40">
            <CardContent className="space-y-3 p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-gold/10 text-gold">
                <Icon className="size-5" />
              </span>
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
