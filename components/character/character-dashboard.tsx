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
  Eye,
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
        <StatTile
          icon={Footprints}
          label="Speed"
          value={vm.vitals.speed}
          sub={
            vm.vitals.movement.length
              ? vm.vitals.movement.map((m) => `${m.mode} ${m.value}`).join(" · ")
              : undefined
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Left / main column */}
        <div className="min-w-0 space-y-3 lg:col-span-2">
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

          <SectionCard title="Combat" icon={Swords}>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <MiniStat label="BAB" value={formatModifier(vm.fullAttack.bab)} subtle />
              <MiniStat label="CMB" value={formatModifier(vm.vitals.cmb)} subtle />
              <MiniStat label="CMD" value={vm.vitals.cmd} subtle />
            </div>
            {vm.attacks && vm.attacks.length > 0 ? (
              <>
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
              </>
            ) : editable ? (
              <p className="text-sm text-muted-foreground">No attacks yet.</p>
            ) : null}
          </SectionCard>

          <DefensesCard saves={vm.vitals.saves} defenses={vm.defenses} />

          {(rankedSkills.length > 0 || editable) && (
            <SectionCard title="Skills" icon={ScrollText}>
              {rankedSkills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No skill ranks yet.</p>
              ) : (
                <ShowMore cap={8} noun="skills" className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                  {rankedSkills.map((s) => (
                    <div key={s.key} className="flex items-center justify-between border-b border-border/40 py-1">
                      <span className="truncate text-sm text-foreground">{s.label}</span>
                      <span className="tnum text-sm font-semibold text-rune">{formatModifier(s.total)}</span>
                    </div>
                  ))}
                </ShowMore>
              )}
            </SectionCard>
          )}

          {vm.spellcasting && (
            <SectionCard title="Spellcasting" icon={Wand2}>
              <div className="space-y-3">
                {vm.spellcasting.casters.map((c, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-foreground">{c.className}</span>
                      <span className="shrink-0 text-muted-foreground">
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
                {vm.spellcasting.slas.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Spell-like abilities
                    </p>
                    <div className="space-y-0.5">
                      {vm.spellcasting.slas.map((s, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate text-foreground">{s.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {s.usesPerDay == null
                              ? "At will"
                              : `${Math.max(0, s.usesPerDay - s.used)}/${s.usesPerDay}/day`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
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
                    {f.type && f.type.trim() && (
                      <span className="ml-1 text-muted-foreground">({f.type})</span>
                    )}
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

          {vm.inventory && (vm.inventory.items.length > 0 || editable) && (
            <SectionCard title="Inventory" icon={Backpack}>
              {vm.inventory.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items yet.</p>
              ) : (
                <>
                  <ShowMore cap={10} noun="items" className="space-y-1.5">
                    {vm.inventory.items.map((it, i) => {
                      const meta = [
                        it.weapon?.enhancement ? `+${it.weapon.enhancement}` : null,
                        it.weapon?.damage,
                        it.weapon?.damageType,
                        it.weapon?.crit,
                        it.weapon?.range,
                        it.armorBonus ? `+${it.armorBonus} AC` : null,
                        it.armorCheckPenalty ? `ACP −${it.armorCheckPenalty}` : null,
                        it.cost || null,
                        typeof it.weight === "number" && it.weight > 0 ? `${it.weight} lb` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <div key={i} className="flex items-start justify-between gap-2 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate text-foreground">
                              {it.name}
                              {it.quantity > 1 && <span className="text-muted-foreground"> ×{it.quantity}</span>}
                            </span>
                            {meta && <span className="block text-[11px] text-muted-foreground">{meta}</span>}
                            {it.notes && (
                              <span className="block text-[11px] italic text-muted-foreground/80">{it.notes}</span>
                            )}
                          </span>
                          {it.equipped && (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-gold">equipped</span>
                          )}
                        </div>
                      );
                    })}
                  </ShowMore>
                  {vm.inventory.carriedWeight > 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      ≈ {vm.inventory.carriedWeight} lb carried
                    </p>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {vm.profile &&
            (vm.profile.backstory ||
              vm.profile.appearance ||
              vm.profile.personality ||
              vm.profile.ideals ||
              vm.profile.likes ||
              vm.profile.dislikes ||
              vm.profile.flaws ||
              vm.profile.phobias ||
              vm.profile.uniqueTraits ||
              vm.profile.allies ||
              vm.profile.foes ||
              vm.profile.affiliations ||
              vm.profile.family) && (
            <SectionCard title="Background" icon={ScrollText}>
              <div className="space-y-2 text-sm text-muted-foreground">
                {vm.profile.backstory && <p className="whitespace-pre-line">{vm.profile.backstory}</p>}
                {(
                  [
                    ["Appearance", vm.profile.appearance],
                    ["Personality", vm.profile.personality],
                    ["Ideals & flaws", vm.profile.ideals],
                    ["Likes", vm.profile.likes],
                    ["Dislikes", vm.profile.dislikes],
                    ["Flaws", vm.profile.flaws],
                    ["Phobias", vm.profile.phobias],
                    ["Unique traits", vm.profile.uniqueTraits],
                    ["Allies", vm.profile.allies],
                    ["Foes", vm.profile.foes],
                    ["Affiliations", vm.profile.affiliations],
                    ["Family", vm.profile.family],
                  ] as const
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <p key={label} className="whitespace-pre-line">
                      <span className="font-medium text-foreground">{label}:</span> {value}
                    </p>
                  ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right / sidebar column — wiki-style infobox + at-a-glance trackers */}
        <div className="min-w-0 space-y-3">
          <InfoBox vm={vm} />
          {vm.heroPoints && (
            <SectionCard title="Hero Points" icon={Sparkles}>
              <div className="flex items-center gap-2">
                <div className="flex flex-wrap gap-1" aria-hidden="true">
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
                {vm.psionics.powers.length > 0 && (
                  <ShowMore cap={10} noun="powers" className="space-y-0.5 pt-1">
                    {[...vm.psionics.powers]
                      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
                      .map((p, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-foreground">{p.name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            L{p.level}
                            {p.ppCost != null ? ` · ${p.ppCost} PP` : ""}
                          </span>
                        </div>
                      ))}
                  </ShowMore>
                )}
              </div>
            </SectionCard>
          )}
          {vm.advancement && (
            <SectionCard title="Advancement" icon={Flag}>
              <div className="space-y-1.5 text-sm">
                {vm.advancement.nextLevelXp != null && vm.advancement.nextLevelXp > 0 ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tnum text-lg font-semibold text-foreground">
                        {vm.advancement.currentXp ?? 0}
                        <span className="text-sm text-muted-foreground">/{vm.advancement.nextLevelXp}</span>
                      </span>
                      {vm.advancement.xpTrack && (
                        <span className="text-xs capitalize text-muted-foreground">
                          {vm.advancement.xpTrack} track
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-rune"
                        style={{
                          width: `${Math.min(100, ((vm.advancement.currentXp ?? 0) / vm.advancement.nextLevelXp) * 100)}%`,
                        }}
                      />
                    </div>
                  </>
                ) : vm.advancement.currentXp != null ? (
                  <div className="tnum text-lg font-semibold text-foreground">{vm.advancement.currentXp} XP</div>
                ) : null}
                {vm.advancement.favoredClasses.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <span className="text-xs text-muted-foreground">Favored:</span>
                    {vm.advancement.favoredClasses.map((fc, i) => (
                      <Badge key={i} variant="outline">
                        {fc}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}
          {(vm.senses.vision.length > 0 || vm.senses.special.length > 0 || vm.senses.notes) && (
            <SectionCard title="Senses" icon={Eye}>
              <div className="space-y-1.5 text-sm">
                {(vm.senses.vision.length > 0 || vm.senses.special.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {[...vm.senses.vision, ...vm.senses.special].map((s, i) => (
                      <Badge key={i} variant="default">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                {vm.senses.perception != null && (
                  <div className="text-muted-foreground">
                    Perception <span className="tnum text-foreground">{formatModifier(vm.senses.perception)}</span>
                  </div>
                )}
                {vm.senses.notes && <p className="text-xs text-muted-foreground">{vm.senses.notes}</p>}
              </div>
            </SectionCard>
          )}
          {vm.milestoneLeveling && (
            <SectionCard title="Milestones" icon={Flag}>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-foreground">Level {vm.milestoneLeveling.level}</span>
                  {vm.milestoneLeveling.atCap ? (
                    <span className="text-xs text-muted-foreground">Max level</span>
                  ) : vm.milestoneLeveling.span === 0 ? (
                    <span className="text-xs text-muted-foreground">Levels freely</span>
                  ) : vm.milestoneLeveling.readyToLevel ? (
                    <span className="text-xs font-semibold text-success">Ready to level up!</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {vm.milestoneLeveling.remaining} to level {vm.milestoneLeveling.nextLevel}
                    </span>
                  )}
                </div>
                {!vm.milestoneLeveling.atCap && vm.milestoneLeveling.span > 0 && (
                  <>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-rune"
                        style={{
                          width: `${Math.min(
                            100,
                            (vm.milestoneLeveling.intoLevel / vm.milestoneLeveling.span) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="tnum text-xs text-muted-foreground">
                      {vm.milestoneLeveling.current}/{vm.milestoneLeveling.nextThreshold} milestones
                    </div>
                  </>
                )}
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

          {vm.wealth && (vm.wealth.pp > 0 || vm.wealth.gp > 0 || vm.wealth.sp > 0 || vm.wealth.cp > 0) && (
            <SectionCard title="Wealth" icon={Coins}>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
                {(
                  [
                    ["pp", vm.wealth.pp],
                    ["gp", vm.wealth.gp],
                    ["sp", vm.wealth.sp],
                    ["cp", vm.wealth.cp],
                  ] as const
                )
                  .filter(([, n]) => n > 0)
                  .map(([u, n]) => (
                    <span key={u} className="tnum">
                      {n} {u}
                    </span>
                  ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">≈ {vm.wealth.totalGp} gp total</p>
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

/** Slim page title (name · class · player) + the share/edit actions. The portrait + bio facts live in
 * the wiki-style InfoBox in the sidebar. */
function HeroCard({ vm, actions }: { vm: CharacterViewModel; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {vm.header.name}
        </h1>
        <p className="text-muted-foreground">{vm.header.classLine}</p>
        {vm.header.playerName && (
          <p className="text-xs text-muted-foreground/60">Played by {vm.header.playerName}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Wiki-style infobox: a large portrait + a structured facts panel (identity + topline appearance). */
function InfoBox({ vm }: { vm: CharacterViewModel }) {
  const facts: Array<[string, string | undefined]> = [
    ["Race", vm.header.race],
    ["Alignment", vm.header.alignment],
    ["Size", vm.header.size],
    ["Deity", vm.header.deity],
    ["Homeland", vm.header.homeland],
    ["Ethnicity", vm.header.ethnicity],
    ["Gender", vm.header.gender],
    ["Age", vm.header.age],
    ["Height", vm.header.height],
    ["Weight", vm.header.weight],
    ["Hair", vm.profile?.hair],
    ["Eyes", vm.profile?.eyes],
    ["Skin", vm.profile?.skin],
    ["Features", vm.profile?.distinguishingFeatures],
  ];
  const shown = facts.filter((f): f is [string, string] => Boolean(f[1]));
  return (
    <Card className="overflow-hidden">
      <div className="aspect-[3/4] w-full overflow-hidden bg-surface-raised">
        <PortraitImage src={vm.header.portraitUrl} alt={vm.header.name} fallback={vm.header.name.charAt(0)} />
      </div>
      <CardContent className="space-y-2 p-4">
        {vm.header.quote && (
          <p className="text-sm italic text-muted-foreground">&ldquo;{vm.header.quote}&rdquo;</p>
        )}
        {shown.length > 0 && (
          <dl className="text-sm">
            {shown.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-border/30 py-1 last:border-0">
                <dt className="shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words text-right text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        )}
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

function DefensesCard({
  saves,
  defenses,
}: {
  saves: CharacterViewModel["vitals"]["saves"];
  defenses: CharacterViewModel["defenses"];
}) {
  const { damageReduction, energyResistance, immunities, spellResistance, conditions, nonlethal, conditional } =
    defenses;
  const hasDetail =
    damageReduction.length > 0 ||
    energyResistance.length > 0 ||
    immunities.length > 0 ||
    spellResistance != null ||
    conditions.length > 0 ||
    nonlethal > 0 ||
    conditional.length > 0;

  return (
    <SectionCard title="Defenses" icon={Shield}>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Fortitude" value={formatModifier(saves.fortitude)} />
        <MiniStat label="Reflex" value={formatModifier(saves.reflex)} />
        <MiniStat label="Will" value={formatModifier(saves.will)} />
      </div>
      {hasDetail && (
        <div className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
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
      )}
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
