import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Link2 } from "lucide-react";
import { PortraitImage } from "./portrait-image";
import { Heart, Shield, Swords, Sparkles, ScrollText } from "@/components/ui/game-icons";
import type { CharacterViewModel } from "@/lib/character/view-model";
import { formatFamiliarEffect, titleCaseKey } from "@/lib/character/familiar-format";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatModifier } from "@/lib/utils";

/**
 * The SIMPLE companion sheet — a Server Component read view for animal companions / familiars /
 * eidolons / cohorts / mounts, replacing the full 12-card `CharacterDashboard` with the ~6 things
 * anyone cares about on a companion: identity, base body, HP/AC/saves, attacks, the master link,
 * and (for familiars) what it grants back. Design target: `docs/S6_UX_OVERHAUL/mockups/
 * companion-sheet.html`. Same RSC contract as `CharacterDashboard`/`ClassicSheet` — only `vm`
 * (already privacy-gated) and a serializable `actions` node, no function props.
 */
export function CompanionSheet({ vm, actions }: { vm: CharacterViewModel; actions?: ReactNode }) {
  const companion = vm.companion;
  const subtitle = companion
    ? [companion.archetype, titleCaseKey(companion.type)].filter(Boolean).join(" ")
    : undefined;
  const rankedSkills = (vm.skills ?? []).filter((s) => s.ranks > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {vm.header.name}
          </h1>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {/* Mobile: the infobox rides as a wide banner up top (desktop uses the sidebar column). */}
      <div className="space-y-3 lg:hidden">
        <CompanionInfoBox vm={vm} variant="banner" />
        <MasterLinkPanel vm={vm} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        {/* Left / infobox column — desktop only. */}
        <div className="hidden min-w-0 space-y-3 lg:block">
          <CompanionInfoBox vm={vm} />
          <MasterLinkPanel vm={vm} />
        </div>

        {/* Right / main column. */}
        <div className="min-w-0 space-y-3">
          {vm.abilities.length > 0 && (
            <SectionCard title="Base Body" icon={Sparkles}>
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
          )}

          <SectionCard title="Vitals" icon={Heart}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile
                label="Hit Points"
                accent="danger"
                value={`${vm.vitals.hp.current}/${vm.vitals.hp.max}`}
                sub={vm.vitals.hp.status !== "ok" ? vm.vitals.hp.status.toUpperCase() : undefined}
              />
              <StatTile
                label="Armor Class"
                accent="rune"
                value={vm.vitals.ac.total}
                sub={`Touch ${vm.vitals.ac.touch} · FF ${vm.vitals.ac.flatFooted}`}
              />
              <StatTile label="Initiative" value={formatModifier(vm.vitals.initiative)} />
              <StatTile label="CMD" value={vm.vitals.cmd} />
            </div>
          </SectionCard>

          <SectionCard title="Saving Throws" icon={Shield}>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Fort" accent="gold" value={formatModifier(vm.vitals.saves.fortitude)} />
              <StatTile label="Ref" accent="gold" value={formatModifier(vm.vitals.saves.reflex)} />
              <StatTile label="Will" accent="gold" value={formatModifier(vm.vitals.saves.will)} />
            </div>
            {companion?.synced && (
              <p className="mt-2 text-xs text-muted-foreground">
                Uses the better of its own base save or its master&rsquo;s.
              </p>
            )}
          </SectionCard>

          {vm.attacks && vm.attacks.length > 0 && (
            <SectionCard title="Attacks" icon={Swords}>
              <div className="divide-y divide-border/60">
                {vm.attacks.map((atk, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{atk.name}</span>
                      <span className="text-[11px] text-muted-foreground">{atk.attackType}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-sm font-semibold text-gold">{formatModifier(atk.attackBonus)}</div>
                      {atk.damage && <div className="text-xs text-muted-foreground">{atk.damage}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {companion && companion.grantedAbilities.length > 0 && (
            <SectionCard title="Special Abilities" icon={Sparkles}>
              <div className="space-y-2">
                {companion.grantedAbilities.map((a, i) => (
                  <div key={i} className="rounded-r-md border-l-2 border-rune bg-surface-raised py-2 pl-3 pr-2 text-sm">
                    <span className="font-semibold text-rune">
                      {a.name}
                      {a.fromArchetype && <span className="ml-1 text-gold">†</span>}
                    </span>
                    {a.note && <p className="mt-0.5 text-xs text-muted-foreground">{a.note}</p>}
                  </div>
                ))}
              </div>
              {companion.grantedAbilities.some((a) => a.fromArchetype) && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  † from the {companion.archetype} archetype
                </p>
              )}
            </SectionCard>
          )}

          {companion && (companion.grantsAlertness || companion.masterBenefit) && (
            <SectionCard
              title="Grants to Master"
              icon={Sparkles}
              className="border-gold/40 bg-gradient-to-br from-gold/10 to-transparent"
            >
              <p className="mb-3 text-xs text-muted-foreground">
                Familiar special abilities apply to the master, not {vm.header.name}.{" "}
                {companion.synced
                  ? "These are already folded into the master’s sheet."
                  : "The master link is off, so these are shown for reference — they apply only while linked to a master."}
              </p>
              <div className="space-y-2">
                {companion.grantsAlertness && (
                  <div className="rounded-lg border border-border/60 bg-surface-raised px-3 py-2 text-sm text-foreground">
                    Alertness — <span className="font-semibold text-gold">+2 Perception / +2 Sense Motive</span>
                  </div>
                )}
                {companion.masterBenefit?.effects.map((eff, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-surface-raised px-3 py-2 text-sm text-foreground">
                    <span className="font-semibold text-gold">{formatFamiliarEffect(eff)}</span>
                    {eff.note ? ` · ${eff.note}` : ""}
                  </div>
                ))}
                {(!companion.masterBenefit?.effects.length) && companion.masterBenefit?.rawText && (
                  <div className="rounded-lg border border-border/60 bg-surface-raised px-3 py-2 text-sm text-muted-foreground">
                    {companion.masterBenefit.rawText}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {rankedSkills.length > 0 && (
            <SectionCard title="Skills" icon={ScrollText}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {rankedSkills.map((s) => (
                  <div key={s.key} className="flex items-center justify-between border-b border-border/40 py-1">
                    <span className="truncate text-sm text-foreground">{s.label}</span>
                    <span className="tnum text-sm font-semibold text-rune">{formatModifier(s.total)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

/** Wiki-style infobox: portrait + identity facts. Dual-renders like `CharacterDashboard`'s InfoBox —
 * a horizontal `variant="banner"` card on mobile, a tall sidebar card on desktop. */
function CompanionInfoBox({ vm, variant = "sidebar" }: { vm: CharacterViewModel; variant?: "sidebar" | "banner" }) {
  const companion = vm.companion;
  const speedParts = [
    vm.vitals.speed,
    ...vm.vitals.movement.map((m) => `${m.mode.toLowerCase()} ${m.value}`),
  ].filter(Boolean);
  const facts: Array<[string, string | undefined]> = [
    ["Type", companion ? titleCaseKey(companion.type) : undefined],
    ["Race", vm.header.race],
    ["Size", vm.header.size],
    ["Alignment", vm.header.alignment],
    ["Speed", speedParts.length ? speedParts.join(" · ") : undefined],
  ];
  const shown = facts.filter((f): f is [string, string] => Boolean(f[1]));

  if (variant === "banner") {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="aspect-square w-16 shrink-0 overflow-hidden rounded-lg border-2 border-gold bg-surface-raised sm:w-20">
            <PortraitImage src={vm.header.portraitUrl} alt={vm.header.name} fallback={vm.header.name.charAt(0)} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {/* Not a heading: the page h1 above already carries the name — a second "Whiskers"
                heading right under it is noise in the screen-reader outline. */}
            <p className="truncate text-lg font-semibold text-foreground">{vm.header.name}</p>
            {companion && (
              <p className="truncate text-sm font-medium text-gold">
                {[companion.archetype, titleCaseKey(companion.type)].filter(Boolean).join(" ")}
              </p>
            )}
            {companion?.synced && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                Synced
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square w-full overflow-hidden border-b-2 border-gold bg-surface-raised">
        <PortraitImage src={vm.header.portraitUrl} alt={vm.header.name} fallback={vm.header.name.charAt(0)} />
      </div>
      {shown.length > 0 && (
        <CardContent className="p-4">
          <dl className="text-sm">
            {shown.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-border/30 py-1 last:border-0">
                <dt className="shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words text-right text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      )}
    </Card>
  );
}

/** The "linked to master" panel — renders nothing when this character isn't (or isn't reported as)
 * linked to a master. Owner/editor sees the master's name (a link to their sheet); an anonymous
 * viewer sees only the level (§15 — the master's identity is owner-only on `vm.companion.master`). */
function MasterLinkPanel({ vm }: { vm: CharacterViewModel }) {
  const master = vm.companion?.master;
  if (!master) return null;
  const linkText = master.characterId && master.name ? `${master.name} · Level ${master.level}` : `Master · Level ${master.level}`;
  const inner = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rune bg-rune/15 text-rune">
        <Link2 className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Linked to</span>
        <span className={cn("block truncate text-sm font-semibold", master.characterId ? "text-rune" : "text-foreground")}>
          {linkText}
        </span>
      </span>
    </>
  );
  return (
    <div className="space-y-2">
      {master.characterId ? (
        <Link
          href={`/characters/${master.characterId}`}
          className="flex items-center gap-3 rounded-xl border border-rune/40 bg-surface-raised p-3 hover:border-rune"
        >
          {inner}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-rune/40 bg-surface-raised p-3">{inner}</div>
      )}
      {vm.companion?.synced && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          Synced with master
        </span>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "gold" | "rune" | "danger";
}) {
  const accentClass =
    accent === "gold" ? "text-gold" : accent === "rune" ? "text-rune" : accent === "danger" ? "text-danger" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-3 text-center sm:p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("tnum text-xl font-semibold sm:text-2xl", accentClass)}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
}) {
  // A <section> named by its heading is a region landmark — screen-reader users can jump between
  // sheet sections, and the heading is programmatically associated with its content. The heading
  // text stays muted-foreground on every card (accent color lives on the icon/border only — a gold
  // heading on the gold-tinted grants card fails WCAG AA on the parchment theme).
  const headingId = `companion-sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
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
