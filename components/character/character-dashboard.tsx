import type { ReactNode } from "react";
import { PortraitImage } from "./portrait-image";
import {
  Heart,
  Shield,
  Swords,
  Zap,
  Footprints,
  Sparkles,
  Languages,
  Backpack,
  Coins,
  ScrollText,
  EyeOff,
  Wand2,
  Flag,
} from "lucide-react";
import type { CharacterViewModel } from "@/lib/character/view-model";
import { SpellListViewer } from "./spell-list-viewer";
import { ShowMore } from "./show-more";
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
  const rankedSkills = (vm.skills ?? []).slice().sort((a, b) => b.total - a.total);
  // Owner/editor see editing affordances + empty-state prompts; read-only viewers don't.
  const editable = vm.viewer === "owner" || vm.viewer === "editor";

  return (
    <div className="space-y-3">
      <HeroCard vm={vm} actions={actions} />

      {/* Core vitals — bento stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {vm.vitals.woundsVigor ? (
          <StatTile
            icon={Heart}
            label="Vigor / Wounds"
            accent="danger"
            value={`${vm.vitals.woundsVigor.vigor.current}/${vm.vitals.woundsVigor.vigor.max}`}
            sub={
              [
                `Wounds ${vm.vitals.woundsVigor.wound.current}/${vm.vitals.woundsVigor.wound.max}`,
                vm.vitals.woundsVigor.status !== "ok" ? vm.vitals.woundsVigor.status.toUpperCase() : null,
              ]
                .filter(Boolean)
                .join(" · ")
            }
          />
        ) : (
          <StatTile
            icon={Heart}
            label="Hit Points"
            accent="danger"
            value={`${vm.vitals.hp.current}/${vm.vitals.hp.max}`}
            sub={
              [
                vm.vitals.hp.status !== "ok" ? vm.vitals.hp.status.toUpperCase() : null,
                vm.vitals.hp.temp ? `+${vm.vitals.hp.temp} temp` : null,
                vm.vitals.hp.nonlethal ? `${vm.vitals.hp.nonlethal} nonlethal` : null,
                vm.vitals.hp.negativeLevels ? `−${vm.vitals.hp.negativeLevels} lvl` : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          />
        )}
        <StatTile icon={Shield} label="Armor Class" accent="gold" value={vm.vitals.ac.total} sub={`Touch ${vm.vitals.ac.touch} · FF ${vm.vitals.ac.flatFooted}`} />
        <StatTile icon={Zap} label="Initiative" accent="rune" value={formatModifier(vm.vitals.initiative)} />
        <StatTile icon={Footprints} label="Speed" value={vm.vitals.speed} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Left / main column */}
        <div className="min-w-0 space-y-3 lg:col-span-2">
          <SectionCard title="Saving Throws" icon={Shield}>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Fortitude" value={formatModifier(vm.vitals.saves.fortitude)} />
              <MiniStat label="Reflex" value={formatModifier(vm.vitals.saves.reflex)} />
              <MiniStat label="Will" value={formatModifier(vm.vitals.saves.will)} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <MiniStat label="CMB" value={formatModifier(vm.vitals.cmb)} subtle />
              <MiniStat label="CMD" value={vm.vitals.cmd} subtle />
            </div>
          </SectionCard>

          <DefensesCard defenses={vm.defenses} />

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
              {(vm.fullAttack.melee.length > 1 || vm.fullAttack.ranged.length > 1) && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Full attack:{" "}
                  <span className="tnum text-foreground">
                    {vm.fullAttack.melee.map(formatModifier).join("/")} melee
                  </span>
                  {" · "}
                  <span className="tnum text-foreground">
                    {vm.fullAttack.ranged.map(formatModifier).join("/")} ranged
                  </span>
                </p>
              )}
              <ShowMore cap={6} noun="attacks" className="divide-y divide-border/60">
                {vm.attacks.map((atk, i) => {
                  const crit =
                    atk.critRange || atk.critMultiplier
                      ? `${atk.critRange ?? ""}${atk.critMultiplier ? `/${atk.critMultiplier}` : ""}`.trim()
                      : null;
                  const meta = [crit, atk.range].filter(Boolean).join(" · ");
                  return (
                    <div key={i} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <span className="block truncate text-sm text-foreground">{atk.name}</span>
                        {meta && <span className="text-[11px] text-muted-foreground">{meta}</span>}
                      </div>
                      <span className="flex shrink-0 items-center gap-4">
                        <span className="tnum text-sm font-semibold text-rune">
                          {formatModifier(atk.attackBonus)}
                        </span>
                        {atk.damage && (
                          <span className="tnum text-sm text-gold">
                            {atk.damage}
                            {atk.damageType && (
                              <span className="ml-1 text-[11px] text-muted-foreground">{atk.damageType}</span>
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </ShowMore>
            </SectionCard>
          )}

          {rankedSkills.length > 0 && (
            <SectionCard title="Skills" icon={ScrollText}>
              <ShowMore cap={8} noun="skills" className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {rankedSkills.map((s) => (
                  <div key={s.key} className="flex items-center justify-between border-b border-border/40 py-1">
                    <span className="truncate text-sm text-foreground">{s.label}</span>
                    <span className="tnum text-sm font-semibold text-rune">{formatModifier(s.total)}</span>
                  </div>
                ))}
              </ShowMore>
            </SectionCard>
          )}
        </div>

        {/* Right / sidebar column */}
        <div className="min-w-0 space-y-3">
          {vm.heroPoints && (
            <SectionCard title="Hero Points" icon={Sparkles}>
              <div className="flex items-center gap-2">
                <div className="flex gap-1" aria-hidden="true">
                  {Array.from({ length: Math.max(0, vm.heroPoints.max) }).map((_, i) => (
                    <span
                      key={i}
                      className={
                        i < vm.heroPoints!.current
                          ? "size-3.5 rounded-full bg-gold"
                          : "size-3.5 rounded-full border border-border"
                      }
                    />
                  ))}
                </div>
                <span className="tnum text-sm text-foreground">
                  {vm.heroPoints.current}/{vm.heroPoints.max}
                </span>
              </div>
            </SectionCard>
          )}
          {vm.honor && (
            <SectionCard title="Honor" icon={Shield}>
              <div className="flex items-baseline gap-2">
                <span className={vm.honor.dishonored ? "text-2xl font-semibold text-danger" : "text-2xl font-semibold text-gold"}>
                  {vm.honor.score}
                </span>
                <span className="text-sm text-muted-foreground">{vm.honor.tier}</span>
              </div>
            </SectionCard>
          )}
          {vm.stamina && (
            <SectionCard title="Stamina" icon={Zap}>
              <span className="tnum text-lg font-semibold text-foreground">
                {vm.stamina.current}
                <span className="text-sm text-muted-foreground">/{vm.stamina.max}</span>
              </span>
            </SectionCard>
          )}
          {vm.mythic && (
            <SectionCard title="Mythic" icon={Sparkles}>
              <div className="space-y-1 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-gold">
                    Tier {vm.mythic.tier}
                    {vm.mythic.path !== "none" && (
                      <span className="ml-1 font-normal capitalize text-muted-foreground">{vm.mythic.path}</span>
                    )}
                  </span>
                  {vm.mythic.surgeDie && <span className="text-xs text-muted-foreground">Surge {vm.mythic.surgeDie}</span>}
                </div>
                <div className="text-muted-foreground">
                  Mythic power{" "}
                  <span className="tnum text-foreground">
                    {vm.mythic.power.current}/{vm.mythic.power.max}
                  </span>
                </div>
              </div>
            </SectionCard>
          )}
          {vm.psionics && (
            <SectionCard title="Psionics" icon={Sparkles}>
              <div className="space-y-1 text-sm">
                <div className="text-muted-foreground">
                  Power points{" "}
                  <span className="tnum font-semibold text-rune">
                    {vm.psionics.powerPoints.current}/{vm.psionics.powerPoints.max}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span>ML {vm.psionics.manifesterLevel}</span>
                  <span>{vm.psionics.powersKnown} powers</span>
                  {vm.psionics.focused && <span className="text-gold">Focused</span>}
                </div>
              </div>
            </SectionCard>
          )}
          {vm.milestoneLeveling && (
            <SectionCard title="Milestones" icon={Flag}>
              <div className="space-y-1 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="tnum text-lg font-semibold text-foreground">
                    {vm.milestoneLeveling.current}
                    <span className="text-sm text-muted-foreground">
                      /{vm.milestoneLeveling.nextThreshold}
                    </span>
                  </span>
                  {vm.milestoneLeveling.readyToLevel ? (
                    <span className="text-xs font-semibold text-success">Ready to level up!</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {vm.milestoneLeveling.remaining} to next level
                    </span>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-rune"
                    style={{
                      width: `${
                        vm.milestoneLeveling.nextThreshold > 0
                          ? Math.min(100, (vm.milestoneLeveling.current / vm.milestoneLeveling.nextThreshold) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </SectionCard>
          )}
          {vm.buffs && (vm.buffs.length > 0 || editable) && (
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
              <div className="space-y-3">
                {vm.spellcasting.casters.map((c, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{c.className}</span>
                      <span className="text-muted-foreground">
                        CL {c.casterLevel} · Conc {c.concentration >= 0 ? "+" : ""}
                        {c.concentration}
                      </span>
                    </div>
                    {c.slots.filter((s) => s.total > 0).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.slots
                          .filter((s) => s.total > 0)
                          .map((s) => (
                            <span
                              key={s.level}
                              className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] text-muted-foreground"
                              title={`Save DC ${s.dc}`}
                            >
                              L{s.level}: {s.remaining}/{s.total}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  {vm.spellcasting.counts.known} known
                  {vm.spellcasting.counts.prepared > 0 ? ` · ${vm.spellcasting.counts.prepared} prepared` : ""}
                  {vm.spellcasting.counts.spellbook > 0
                    ? ` · ${vm.spellcasting.counts.spellbook} in spellbook`
                    : ""}
                </p>

                {vm.spellcasting.prepared && vm.spellcasting.prepared.length > 0 && (
                  <SpellListViewer title="Prepared" spells={vm.spellcasting.prepared} />
                )}
                {vm.spellcasting.known.length > 0 && (
                  <SpellListViewer
                    title={vm.spellcasting.prepared ? "Known" : "Spells"}
                    spells={vm.spellcasting.known}
                  />
                )}
                {vm.spellcasting.spellbook && vm.spellcasting.spellbook.length > 0 && (
                  <SpellListViewer title="Spellbook" spells={vm.spellcasting.spellbook} />
                )}
              </div>
            </SectionCard>
          )}

          {vm.feats && vm.feats.length > 0 && (
            <SectionCard title="Feats" icon={Sparkles}>
              <ShowMore cap={12} noun="feats" className="flex flex-wrap gap-1.5">
                {vm.feats.map((f, i) => (
                  <Badge key={i} variant="outline">
                    {f.name}
                  </Badge>
                ))}
              </ShowMore>
            </SectionCard>
          )}

          {vm.features && vm.features.length > 0 && (
            <SectionCard title="Features" icon={ScrollText}>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {vm.features.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-foreground">{f.name}</span>
                    {f.uses && (
                      <span className="tnum shrink-0 text-xs text-gold">
                        {f.uses.remaining}/{f.uses.max}
                        <span className="text-muted-foreground">/{f.uses.per === "day" ? "day" : f.uses.per}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {vm.traits && vm.traits.length > 0 && (
            <SectionCard title="Traits" icon={Sparkles}>
              <ul className="space-y-1 text-sm">
                {vm.traits.map((t, i) => (
                  <li key={i} className="text-foreground">
                    {t.name}
                    {t.type && <span className="ml-1 text-xs text-muted-foreground">({t.type})</span>}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {vm.languages.known.length > 0 && (
            <SectionCard title="Languages" icon={Languages}>
              <div className="flex flex-wrap gap-1.5">
                {vm.languages.known.map((l, i) => (
                  <Badge key={i} variant="outline">
                    {l}
                  </Badge>
                ))}
              </div>
            </SectionCard>
          )}

          {vm.inventory && vm.inventory.items.length > 0 && (
            <SectionCard title="Inventory" icon={Backpack}>
              <ShowMore cap={10} noun="items" className="space-y-1">
                {vm.inventory.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-foreground">
                      {it.name}
                      {it.quantity > 1 && <span className="text-muted-foreground"> ×{it.quantity}</span>}
                      {(it.armorBonus || it.armorCheckPenalty) && (
                        <span className="text-xs text-muted-foreground">
                          {it.armorBonus ? ` +${it.armorBonus} AC` : ""}
                          {it.armorCheckPenalty ? ` · ACP −${it.armorCheckPenalty}` : ""}
                        </span>
                      )}
                    </span>
                    {it.equipped && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-gold">equipped</span>
                    )}
                  </div>
                ))}
              </ShowMore>
            </SectionCard>
          )}

          {vm.wealth && (vm.wealth.pp > 0 || vm.wealth.gp > 0 || vm.wealth.sp > 0 || vm.wealth.cp > 0) && (
            <SectionCard title="Wealth" icon={Coins}>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
                <span className="tnum">{vm.wealth.pp} pp</span>
                <span className="tnum">{vm.wealth.gp} gp</span>
                <span className="tnum">{vm.wealth.sp} sp</span>
                <span className="tnum">{vm.wealth.cp} cp</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">≈ {vm.wealth.totalGp} gp total</p>
            </SectionCard>
          )}

          {vm.profile && (vm.profile.backstory || vm.profile.appearance || vm.profile.personality) && (
            <SectionCard title="Character Profile" icon={ScrollText}>
              <div className="space-y-2 text-sm text-muted-foreground">
                {vm.profile.backstory && <p className="whitespace-pre-line">{vm.profile.backstory}</p>}
                {vm.profile.appearance && (
                  <p>
                    <span className="font-medium text-foreground">Appearance:</span>{" "}
                    {vm.profile.appearance}
                  </p>
                )}
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
  const details = [
    vm.header.gender,
    vm.header.age,
    vm.header.height,
    vm.header.weight,
    vm.header.ethnicity,
    vm.header.deity && `Deity: ${vm.header.deity}`,
    vm.header.homeland && `Homeland: ${vm.header.homeland}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-raised">
            <PortraitImage
              src={vm.header.portraitUrl}
              alt={vm.header.name}
              fallback={vm.header.name.charAt(0)}
            />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {vm.header.name}
            </h1>
            <p className="text-muted-foreground">{vm.header.classLine}</p>
            {raceLine && <p className="text-sm text-muted-foreground/70">{raceLine}</p>}
            {details && <p className="mt-0.5 text-xs text-muted-foreground/60">{details}</p>}
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

function DefensesCard({ defenses }: { defenses: CharacterViewModel["defenses"] }) {
  const { damageReduction, energyResistance, immunities, spellResistance, conditions, nonlethal, conditional } =
    defenses;
  const hasAny =
    damageReduction.length > 0 ||
    energyResistance.length > 0 ||
    immunities.length > 0 ||
    spellResistance != null ||
    conditions.length > 0 ||
    nonlethal > 0 ||
    conditional.length > 0;
  if (!hasAny) return null;

  return (
    <SectionCard title="Defenses" icon={Shield}>
      <div className="space-y-1.5">
        {conditions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((c, i) => (
              <Badge key={i} variant="danger">
                {c}
              </Badge>
            ))}
          </div>
        )}
        {damageReduction.length > 0 && <DefenseRow label="DR" value={damageReduction.join(", ")} />}
        {energyResistance.length > 0 && <DefenseRow label="Resist" value={energyResistance.join(", ")} />}
        {immunities.length > 0 && <DefenseRow label="Immune" value={immunities.join(", ")} />}
        {spellResistance != null && <DefenseRow label="SR" value={String(spellResistance)} />}
        {nonlethal > 0 && <DefenseRow label="Nonlethal" value={String(nonlethal)} />}
        {conditional.length > 0 && (
          <div className="space-y-1 pt-0.5">
            {conditional.map((c, i) => (
              <DefenseRow key={i} label={c.label} value={c.condition ? `vs ${c.condition}` : "(conditional)"} />
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function DefenseRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
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
  // A <section> named by its heading is a region landmark — screen-reader users can jump
  // between sheet sections, and the heading is programmatically associated with its content.
  const headingId = `sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <Card>
      <CardContent className="p-5">
        <section aria-labelledby={headingId}>
          <h2
            id={headingId}
            className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <Icon className="size-4 text-gold" /> {title}
          </h2>
          {children}
        </section>
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
