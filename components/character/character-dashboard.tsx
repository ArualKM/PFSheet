import type { ReactNode } from "react";
import Image from "next/image";
import {
  Heart,
  Shield,
  Swords,
  Zap,
  Footprints,
  Sparkles,
  ScrollText,
  EyeOff,
  Wand2,
} from "lucide-react";
import type { CharacterViewModel } from "@/lib/character/view-model";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatModifier } from "@/lib/utils";

export function CharacterDashboard({
  vm,
  actions,
}: {
  vm: CharacterViewModel;
  actions?: ReactNode;
}) {
  const topSkills = (vm.skills ?? [])
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return (
    <div className="space-y-3">
      <HeroCard vm={vm} actions={actions} />

      {/* Core vitals — bento stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Heart} label="Hit Points" accent="danger" value={`${vm.vitals.hp.current}/${vm.vitals.hp.max}`} sub={vm.vitals.hp.temp ? `+${vm.vitals.hp.temp} temp` : undefined} />
        <StatTile icon={Shield} label="Armor Class" accent="gold" value={vm.vitals.ac.total} sub={`Touch ${vm.vitals.ac.touch} · FF ${vm.vitals.ac.flatFooted}`} />
        <StatTile icon={Zap} label="Initiative" accent="rune" value={formatModifier(vm.vitals.initiative)} />
        <StatTile icon={Footprints} label="Speed" value={vm.vitals.speed} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Left / main column */}
        <div className="space-y-3 lg:col-span-2">
          <SectionCard title="Saving Throws" icon={Shield}>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Fortitude" value={formatModifier(vm.vitals.saves.fortitude)} />
              <MiniStat label="Reflex" value={formatModifier(vm.vitals.saves.reflex)} />
              <MiniStat label="Will" value={formatModifier(vm.vitals.saves.will)} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="CMD" value={vm.vitals.cmd} subtle />
            </div>
          </SectionCard>

          <SectionCard title="Ability Scores" icon={Sparkles}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {vm.abilities.map((a) => (
                <div key={a.key} className="rounded-lg border border-border bg-surface-raised p-2 text-center">
                  <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                    {a.key.toUpperCase()}
                  </div>
                  <div className="tnum text-lg font-semibold text-foreground">{a.score}</div>
                  <div className="tnum text-xs text-gold">{formatModifier(a.modifier)}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          {vm.attacks && vm.attacks.length > 0 && (
            <SectionCard title="Attacks" icon={Swords}>
              <ul className="divide-y divide-border/60">
                {vm.attacks.map((atk, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate text-sm text-foreground">{atk.name}</span>
                    <span className="flex items-center gap-4">
                      <span className="tnum text-sm font-semibold text-rune">
                        {formatModifier(atk.attackBonus)}
                      </span>
                      {atk.damage && (
                        <span className="tnum text-sm text-gold">{atk.damage}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {topSkills.length > 0 && (
            <SectionCard title="Best Skills" icon={ScrollText}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {topSkills.map((s) => (
                  <div key={s.key} className="flex items-center justify-between border-b border-border/40 py-1">
                    <span className="truncate text-sm text-foreground">{s.label}</span>
                    <span className="tnum text-sm font-semibold text-rune">
                      {formatModifier(s.total)}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right / sidebar column */}
        <div className="space-y-3">
          {vm.buffs && (
            <SectionCard title="Active Buffs" icon={Zap}>
              {vm.buffs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active buffs. Add Haste, Bless, Rage, or a custom effect before initiative gets
                  messy.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {vm.buffs.map((b, i) => (
                    <Badge key={i} variant={b.enabled ? "success" : "default"}>
                      {b.name}
                      {b.remainingRounds != null && ` · ${b.remainingRounds}r`}
                    </Badge>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {vm.spellcasting && (
            <SectionCard title="Spellcasting" icon={Wand2}>
              <div className="space-y-2">
                {vm.spellcasting.casters.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{c.className}</span>
                    <span className="text-muted-foreground">CL {c.casterLevel}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  {vm.spellcasting.knownCount} spell{vm.spellcasting.knownCount === 1 ? "" : "s"}
                  {vm.spellcasting.preparedCount > 0 ? ` · ${vm.spellcasting.preparedCount} prepared` : ""}
                </p>
              </div>
            </SectionCard>
          )}

          {vm.feats && vm.feats.length > 0 && (
            <SectionCard title="Feats" icon={Sparkles}>
              <div className="flex flex-wrap gap-1.5">
                {vm.feats.map((f, i) => (
                  <Badge key={i} variant="outline">
                    {f.name}
                  </Badge>
                ))}
              </div>
            </SectionCard>
          )}

          {vm.features && vm.features.length > 0 && (
            <SectionCard title="Features" icon={ScrollText}>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {vm.features.map((f, i) => (
                  <li key={i} className="truncate text-foreground">
                    {f.name}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {vm.profile && (vm.profile.backstory || vm.profile.appearance || vm.profile.personality) && (
            <SectionCard title="Character Profile" icon={ScrollText}>
              <div className="space-y-2 text-sm text-muted-foreground">
                {vm.profile.backstory && <p className="whitespace-pre-line">{vm.profile.backstory}</p>}
                {vm.profile.personality && (
                  <p>
                    <span className="font-medium text-foreground">Personality:</span>{" "}
                    {vm.profile.personality}
                  </p>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {vm.hiddenSections.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
          <EyeOff className="size-3.5" />
          {vm.hiddenSections.length} section{vm.hiddenSections.length > 1 ? "s" : ""} hidden by the
          owner&rsquo;s privacy settings.
        </p>
      )}
    </div>
  );
}

function HeroCard({ vm, actions }: { vm: CharacterViewModel; actions?: ReactNode }) {
  const raceLine = [vm.header.race, vm.header.alignment, vm.header.size].filter(Boolean).join(" · ");
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-raised">
            {vm.header.portraitUrl ? (
              <Image src={vm.header.portraitUrl} alt={vm.header.name} fill className="object-cover" sizes="80px" />
            ) : (
              <span className="grid size-full place-items-center font-display text-2xl text-gold">
                {vm.header.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {vm.header.name}
            </h1>
            <p className="text-muted-foreground">{vm.header.classLine}</p>
            {raceLine && <p className="text-sm text-muted-foreground/70">{raceLine}</p>}
            {vm.header.quote && (
              <p className="mt-1 max-w-md text-sm italic text-muted-foreground">
                &ldquo;{vm.header.quote}&rdquo;
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:ml-auto">{actions}</div>}
      </CardContent>
    </Card>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "gold" | "rune" | "danger";
}) {
  const accentClass =
    accent === "gold" ? "text-gold" : accent === "rune" ? "text-rune" : accent === "danger" ? "text-danger" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" /> {label}
        </div>
        <div className={cn("tnum text-2xl font-semibold", accentClass)}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="size-4 text-gold" /> {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string | number;
  subtle?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-border p-3 text-center", subtle ? "bg-transparent" : "bg-surface-raised")}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tnum text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
