import type { ComponentType, ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import {
  Shield,
  Swords,
  Sparkles,
  ScrollText,
  Backpack,
  Coins,
  Wand2,
  Footprints,
  Heart,
  Languages as LanguagesIcon,
  Meditation,
  Handshake,
  Eye,
  GameIcon,
  itemIconName,
} from "@/components/ui/game-icons";
import type { CharacterViewModel } from "@/lib/character/view-model";
import { PortraitImage } from "./portrait-image";
import { SpellListViewer } from "./spell-list-viewer";
import { PsionicPowerList } from "./psionic-power-list";
import { ManeuverList } from "./maneuver-list";
import { VeilList } from "./veil-list";
import { EntryDetailRow, DetailPara } from "./entry-detail-row";
import { ShowMore } from "./show-more";
import { Badge } from "@/components/ui/badge";
import { cn, formatModifier } from "@/lib/utils";

/**
 * Classic sheet view — the familiar Myth-Weavers / paper-sheet stat-block, rebuilt for the web.
 * It is a PURE presentation layer over the same {@link CharacterViewModel} the modern dashboard and
 * the API consume, so privacy gating + the rules-engine math are shared (no second source of truth).
 * The distinctive top "stat block" is bespoke; the detail sections reuse the modern list components
 * so behaviour stays at parity automatically.
 */
export function ClassicSheet({ vm, actions }: { vm: CharacterViewModel; actions?: ReactNode }) {
  const h = vm.header;
  const v = vm.vitals;
  const editable = vm.viewer === "owner" || vm.viewer === "editor";
  const initials = (h.name || "?").trim().slice(0, 2).toUpperCase();
  const identityBits = [h.race, h.alignment, h.size].filter(Boolean).join(" · ");
  const wv = v.woundsVigor;

  const rankedSkills = (vm.skills ?? []).slice().sort((a, b) => b.total - a.total);
  const wealth = vm.wealth;
  const showWealth = !!(wealth && (wealth.pp > 0 || wealth.gp > 0 || wealth.sp > 0 || wealth.cp > 0));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
      {/* ── Identity banner ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 border-b border-border bg-gradient-to-b from-surface-raised to-surface p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border">
          <PortraitImage src={h.portraitUrl} alt={h.name} fallback={initials} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl leading-tight text-foreground text-balance sm:text-3xl">
            {h.name}
            {h.playerName && <span className="ml-2 align-middle text-sm text-muted-foreground">· {h.playerName}</span>}
          </h1>
          {h.classLine && <p className="mt-0.5 text-sm text-muted-foreground">{h.classLine}</p>}
          {identityBits && <p className="text-sm text-muted-foreground">{identityBits}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="gold">Level {h.totalLevel}</Badge>
            {h.deity && <Badge variant="outline">{h.deity}</Badge>}
            {h.homeland && <Badge variant="outline">{h.homeland}</Badge>}
            {v.hp.status !== "ok" && <Badge variant="danger">{v.hp.status}</Badge>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
      </div>

      {/* ── Top stat block: 3 columns on desktop, stacked on mobile ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Column A — abilities, movement, senses */}
        <div className="space-y-4 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <Zone.Head icon={Sparkles}>Ability Scores</Zone.Head>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
            {vm.abilities.map((a) => (
              <div
                key={a.key}
                className="rounded-lg border border-border bg-surface-sunken p-2 text-center transition-colors hover:border-gold/50"
              >
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{a.key}</div>
                <div className="font-display text-2xl leading-none text-foreground tnum">{a.score}</div>
                <div className="mt-1 inline-block rounded-full bg-surface-raised px-2 text-xs font-bold text-gold tnum">
                  {formatModifier(a.modifier)}
                </div>
              </div>
            ))}
          </div>
          {vm.racialMods && vm.racialMods.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Racial:</span>{" "}
              {vm.racialMods.map((m) => `${m.key.toUpperCase()} ${formatModifier(m.value)}`).join(", ")}
            </p>
          )}

          <div>
            <Zone.Head icon={Footprints}>Movement</Zone.Head>
            <div className="grid grid-cols-2 gap-2">
              <Box big={v.speed} cap="Land" />
              {v.movement.map((m) => (
                <Box key={m.mode} big={m.value} cap={m.mode} />
              ))}
            </div>
          </div>

          {(vm.senses.vision.length > 0 || vm.senses.special.length > 0 || vm.senses.perception != null) && (
            <div>
              <Zone.Head icon={Eye}>Senses</Zone.Head>
              <div className="space-y-1 text-xs text-muted-foreground">
                {vm.senses.perception != null && (
                  <p>
                    Perception <span className="font-semibold text-foreground tnum">{formatModifier(vm.senses.perception)}</span>
                  </p>
                )}
                {vm.senses.vision.length > 0 && <p className="text-foreground">{vm.senses.vision.join(", ")}</p>}
                {vm.senses.special.length > 0 && <p>{vm.senses.special.join(", ")}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Column B — defenses & combat numbers */}
        <div className="space-y-4 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <Zone.Head icon={Shield}>Armor Class</Zone.Head>
          <div className="grid grid-cols-3 gap-2">
            <Box big={v.ac.total} cap="AC" lead />
            <Box big={v.ac.touch} cap="Touch" />
            <Box big={v.ac.flatFooted} cap="Flat-footed" />
          </div>

          {/* HP (or Wounds & Vigor) */}
          {wv ? (
            <div className="grid grid-cols-2 gap-2">
              <Box big={`${wv.vigor.current}/${wv.vigor.max}`} cap="Vigor" />
              <Box big={`${wv.wound.current}/${wv.wound.max}`} cap="Wounds" lead={wv.status !== "ok"} />
            </div>
          ) : (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Heart className="size-3.5" /> Hit Points
                </span>
                <span className="font-display text-lg text-foreground tnum">
                  {v.hp.current}
                  <span className="text-muted-foreground">/{v.hp.max}</span>
                  {v.hp.temp > 0 && <span className="ml-1 text-sm text-success">+{v.hp.temp}</span>}
                </span>
              </div>
              <div className="h-3.5 overflow-hidden rounded-full border border-border bg-surface-sunken">
                <div
                  className={cn("h-full transition-all", hpFill(v.hp.status))}
                  style={{ width: `${Math.max(0, Math.min(100, v.hp.max > 0 ? (v.hp.current / v.hp.max) * 100 : 0))}%` }}
                />
              </div>
              {(v.hp.nonlethal > 0 || v.hp.negativeLevels > 0) && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {v.hp.nonlethal > 0 && <span>Nonlethal {v.hp.nonlethal}</span>}
                  {v.hp.nonlethal > 0 && v.hp.negativeLevels > 0 && " · "}
                  {v.hp.negativeLevels > 0 && <span className="text-danger">−{v.hp.negativeLevels} levels</span>}
                </p>
              )}
            </div>
          )}

          <div>
            <Zone.Head>Saving Throws</Zone.Head>
            <div className="grid grid-cols-3 gap-2">
              <SaveBox v={v.saves.fortitude} c="Fort" />
              <SaveBox v={v.saves.reflex} c="Ref" />
              <SaveBox v={v.saves.will} c="Will" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Mini v={formatModifier(v.initiative)} c="Init" />
            <Mini v={formatModifier(vm.fullAttack.bab)} c="BAB" />
            <Mini v={formatModifier(v.cmb)} c="CMB" />
            <Mini v={v.cmd} c="CMD" />
          </div>
        </div>

        {/* Column C — defensive abilities, trackers, languages */}
        <div className="space-y-4 p-4">
          {hasDefenses(vm.defenses) && (
            <div>
              <Zone.Head icon={Shield}>Defenses</Zone.Head>
              <dl className="space-y-1 text-xs">
                <DefLine label="DR" values={vm.defenses.damageReduction} />
                <DefLine label="Resist" values={vm.defenses.energyResistance} />
                <DefLine label="Immune" values={vm.defenses.immunities} />
                {vm.defenses.spellResistance != null && (
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 font-semibold text-muted-foreground">SR</dt>
                    <dd className="text-foreground tnum">{vm.defenses.spellResistance}</dd>
                  </div>
                )}
                <DefLine label="Conditions" values={vm.defenses.conditions} tone="warn" />
              </dl>
            </div>
          )}

          {hasTrackers(vm) && (
            <div>
              <Zone.Head icon={Sparkles}>Trackers</Zone.Head>
              <div className="flex flex-wrap gap-1.5">
                {vm.heroPoints && <Tracker label="Hero pts" value={`${vm.heroPoints.current}/${vm.heroPoints.max}`} tone="gold" />}
                {vm.honor && <Tracker label="Honor" value={`${vm.honor.score} · ${vm.honor.tier}`} tone={vm.honor.dishonored ? "danger" : "gold"} />}
                {vm.stamina && <Tracker label="Stamina" value={`${vm.stamina.current}/${vm.stamina.max}`} tone="rune" />}
                {vm.mythic && <Tracker label={`Mythic T${vm.mythic.tier}`} value={`${vm.mythic.power.current}/${vm.mythic.power.max}`} tone="gold" />}
                {vm.psionics && <Tracker label="Power pts" value={`${vm.psionics.powerPoints.current}/${vm.psionics.powerPoints.max}`} tone="rune" />}
                {vm.spheres && <Tracker label="Spell pts" value={`${vm.spheres.spellPoints.current}/${vm.spheres.spellPoints.max}`} tone="rune" />}
                {vm.pathOfWar && vm.pathOfWar.initiators.length > 0 && (
                  <Tracker label="Init. level" value={Math.max(...vm.pathOfWar.initiators.map((i) => i.initiatorLevel))} tone="rune" />
                )}
                {vm.akashic && <Tracker label="Essence" value={`${vm.akashic.essence.invested}/${vm.akashic.essence.total}`} tone="rune" />}
                {vm.oaths && <Tracker label="Oath pts" value={`${vm.oaths.available}`} tone="gold" />}
                {vm.milestoneLeveling && (
                  <Tracker label="Milestones" value={`${vm.milestoneLeveling.intoLevel}/${vm.milestoneLeveling.span}`} tone={vm.milestoneLeveling.readyToLevel ? "gold" : "rune"} />
                )}
              </div>
            </div>
          )}

          <div>
            <Zone.Head icon={LanguagesIcon}>Languages</Zone.Head>
            {vm.languages.known.length > 0 ? (
              <p className="text-xs text-foreground">{vm.languages.known.join(", ")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">None recorded.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Full-width content sections (MW "pages" 2–4) ─────────────── */}
      <div className="space-y-0 border-t border-border">
        {vm.attacks && vm.attacks.length > 0 && (
          <Zone title="Attacks" icon={Swords}>
            {(vm.fullAttack.melee.length > 1 || vm.fullAttack.ranged.length > 1) && (
              <p className="mb-2 text-xs text-muted-foreground">
                Full attack: <span className="text-foreground tnum">{vm.fullAttack.melee.map(formatModifier).join("/")} melee</span>
                {" · "}
                <span className="text-foreground tnum">{vm.fullAttack.ranged.map(formatModifier).join("/")} ranged</span>
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] border-collapse text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1 pr-3 text-left font-bold">Attack</th>
                    <th className="px-3 text-right font-bold">Bonus</th>
                    <th className="px-3 text-right font-bold">Damage</th>
                    <th className="pl-3 text-right font-bold">Crit / Range</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.attacks.map((atk, i) => {
                    const crit = [atk.critRange, atk.critMultiplier].filter(Boolean).join("/");
                    return (
                      <tr key={i} className="border-t border-border/60">
                        <td className="py-2 pr-3 text-foreground">{atk.name}</td>
                        <td className="px-3 text-right font-semibold text-rune tnum">{formatModifier(atk.attackBonus)}</td>
                        <td className="px-3 text-right text-gold tnum">
                          {atk.damage ?? "—"}
                          {atk.damageType && <span className="ml-1 text-[11px] text-muted-foreground">{atk.damageType}</span>}
                        </td>
                        <td className="pl-3 text-right text-[11px] text-muted-foreground">{[crit, atk.range].filter(Boolean).join(" · ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Zone>
        )}

        {rankedSkills.length > 0 && (
          <Zone title="Skills" icon={ScrollText} right={vm.backgroundSkills ? `Background ${vm.backgroundSkills.spent}/${vm.backgroundSkills.budget}` : undefined}>
            <ShowMore cap={40} noun="skills" className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {rankedSkills.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5 text-sm">
                  <span className="min-w-0 truncate text-foreground">{s.label}</span>
                  <span className="shrink-0 font-semibold text-gold tnum">{formatModifier(s.total)}</span>
                </div>
              ))}
            </ShowMore>
          </Zone>
        )}

        {vm.spellcasting && vm.spellcasting.casters.length > 0 && (
          <Zone title="Spellcasting" icon={Wand2}>
            <div className="space-y-4">
              {vm.spellcasting.casters.map((c) => (
                <div key={c.casterId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{c.className}</span>
                  <span className="text-xs text-muted-foreground">
                    CL {c.casterLevel} · Conc {formatModifier(c.concentration)}
                  </span>
                </div>
              ))}
              {vm.spellcasting.prepared && vm.spellcasting.prepared.length > 0 && (
                <SpellListViewer title="Prepared" spells={vm.spellcasting.prepared} mythicAugments={!!vm.mythic} />
              )}
              {vm.spellcasting.known.length > 0 && (
                <SpellListViewer title="Known" spells={vm.spellcasting.known} mythicAugments={!!vm.mythic} />
              )}
              {vm.spellcasting.spellbook && vm.spellcasting.spellbook.length > 0 && (
                <SpellListViewer title="Spellbook" spells={vm.spellcasting.spellbook} mythicAugments={!!vm.mythic} />
              )}
              {vm.spellcasting.slas.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Spell-like abilities</p>
                  {vm.spellcasting.slas.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-foreground">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.usesPerDay == null ? "at will" : `${s.usesPerDay}/day`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Zone>
        )}

        {vm.spheres && vm.spheres.spheresList.length > 0 && (
          <Zone title="Spheres" icon={Wand2} right={`CL ${vm.spheres.casterLevel} · DC ${vm.spheres.saveDc}`}>
            <div className="flex flex-wrap gap-1.5">
              {vm.spheres.spheresList.map((s, i) => (
                <Badge key={i} variant="outline">{s.name}</Badge>
              ))}
            </div>
            {vm.spheres.talentsList.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {vm.spheres.talentCount} talents · {vm.spheres.traditions.map((t) => t.name).join(", ")}
              </p>
            )}
          </Zone>
        )}

        {vm.psionics && vm.psionics.powers.length > 0 && (
          <Zone title="Psionic Powers" icon={Wand2}>
            <PsionicPowerList powers={vm.psionics.powers} />
          </Zone>
        )}

        {vm.pathOfWar && vm.pathOfWar.maneuvers.length > 0 && (
          <Zone title="Martial Disciplines" icon={Swords}>
            <ManeuverList maneuvers={vm.pathOfWar.maneuvers} />
          </Zone>
        )}

        {vm.akashic && (vm.akashic.shaped.length > 0 || vm.akashic.veils.length > 0) && (
          <Zone title="Veils & Essence" icon={Meditation}>
            <VeilList akashic={vm.akashic} />
          </Zone>
        )}

        {vm.oaths && vm.oaths.oaths.length > 0 && (
          <Zone title="Oaths" icon={Handshake} right={`${vm.oaths.available} pts available`}>
            <div className="space-y-1">
              {vm.oaths.oaths.map((o, i) => (
                <EntryDetailRow key={i} name={o.name} badges={<Badge variant="outline">{o.points} pt</Badge>} details={o.oathText ? <DetailPara value={o.oathText} /> : undefined} />
              ))}
            </div>
          </Zone>
        )}

        {vm.feats && vm.feats.length > 0 && (
          <Zone title="Feats" icon={Sparkles}>
            <div className="space-y-1">
              {vm.feats.map((f, i) => (
                <EntryDetailRow
                  key={i}
                  name={f.name}
                  badges={
                    <>
                      {f.type && <Badge variant="outline">{f.type}</Badge>}
                      {f.mythicBenefit && <Badge variant="gold">Mythic</Badge>}
                    </>
                  }
                  details={
                    f.benefit || f.mythicBenefit || f.special || f.notes ? (
                      <>
                        <DetailPara value={f.benefit} />
                        {f.mythicBenefit && <DetailPara label="Mythic" value={f.mythicBenefit} tone="gold" />}
                        <DetailPara label="Special" value={f.special} />
                        {f.notes && <DetailPara label="Notes" value={f.notes} tone="muted" />}
                      </>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </Zone>
        )}

        {vm.features && vm.features.length > 0 && (
          <Zone title="Features & Abilities" icon={ScrollText}>
            <div className="space-y-1">
              {vm.features.map((f, i) => (
                <EntryDetailRow
                  key={i}
                  name={f.name}
                  badges={
                    <>
                      {f.level != null && <Badge variant="outline">Lv {f.level}</Badge>}
                      {f.uses && <Badge variant="rune">{f.uses.remaining}/{f.uses.max} {f.uses.per}</Badge>}
                    </>
                  }
                  details={f.description ? <DetailPara value={f.description} /> : undefined}
                />
              ))}
            </div>
          </Zone>
        )}

        {vm.traits && vm.traits.length > 0 && (
          <Zone title="Traits" icon={Sparkles}>
            <div className="space-y-1">
              {vm.traits.map((t, i) => (
                <EntryDetailRow key={i} name={t.name} badges={t.type ? <Badge variant="outline">{t.type}</Badge> : undefined} details={t.description ? <DetailPara value={t.description} /> : undefined} />
              ))}
            </div>
          </Zone>
        )}

        {vm.inventory && vm.inventory.items.length > 0 && (
          <Zone
            title="Inventory"
            icon={Backpack}
            right={vm.inventory.carriedWeight > 0 ? `${vm.inventory.carriedWeight} lb` : undefined}
          >
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {vm.inventory.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <GameIcon name={itemIconName(it.category)} className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate text-foreground">
                      {it.name}
                      {it.quantity > 1 && <span className="ml-1 text-muted-foreground">×{it.quantity}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {it.equipped && <span className="text-rune">worn</span>}
                    {typeof it.armorBonus === "number" && it.armorBonus !== 0 && <span> · AC +{it.armorBonus}</span>}
                    {it.weapon?.damage && <span> · {it.weapon.damage}</span>}
                  </span>
                </div>
              ))}
            </div>
          </Zone>
        )}

        {showWealth && wealth && (
          <Zone title="Wealth" icon={Coins}>
            <div className="flex flex-wrap gap-4 text-sm">
              {wealth.pp > 0 && <span className="tnum text-foreground">{wealth.pp} <span className="text-muted-foreground">pp</span></span>}
              {wealth.gp > 0 && <span className="tnum text-foreground">{wealth.gp} <span className="text-muted-foreground">gp</span></span>}
              {wealth.sp > 0 && <span className="tnum text-foreground">{wealth.sp} <span className="text-muted-foreground">sp</span></span>}
              {wealth.cp > 0 && <span className="tnum text-foreground">{wealth.cp} <span className="text-muted-foreground">cp</span></span>}
              <span className="ml-auto text-xs text-muted-foreground">≈ {wealth.totalGp} gp</span>
            </div>
          </Zone>
        )}

        {vm.profile && hasProfile(vm.profile) && (
          <Zone title="Background" icon={ScrollText}>
            <div className="space-y-3">
              {PROFILE_FIELDS.map(({ key, label }) => {
                const val = vm.profile?.[key];
                return val ? (
                  <div key={key}>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{val}</p>
                  </div>
                ) : null;
              })}
            </div>
          </Zone>
        )}
      </div>

      {vm.hiddenSections.length > 0 && (
        <div className="flex items-start gap-2 border-t border-border bg-surface-sunken px-4 py-3 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {vm.hiddenSections.length} section{vm.hiddenSections.length === 1 ? "" : "s"} hidden by the owner:{" "}
            {vm.hiddenSections.join(", ")}.
          </span>
        </div>
      )}

      {editable && (
        <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
          Switch to the <span className="text-foreground">Modern</span> view to edit and see build prompts.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small presentational helpers                                               */
/* -------------------------------------------------------------------------- */

type IconCmp = ComponentType<{ className?: string }>;

function Zone({ title, icon: Icon, right, children }: { title: string; icon?: IconCmp; right?: string; children: ReactNode }) {
  return (
    <section className="border-t border-border p-4 first:border-t-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg text-foreground">
          {Icon && <Icon className="size-4 text-gold" />}
          {title}
        </h2>
        {right && <span className="text-xs text-muted-foreground">{right}</span>}
      </div>
      {children}
    </section>
  );
}
Zone.Head = function ZoneHead({ icon: Icon, children }: { icon?: IconCmp; children: ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      {Icon && <Icon className="size-3.5" />}
      {children}
    </p>
  );
};

function Box({ big, cap, lead }: { big: string | number; cap: string; lead?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-sunken p-2 text-center">
      <div className={cn("font-display leading-none", lead ? "text-2xl text-gold" : "text-xl text-foreground")}>{big}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{cap}</div>
    </div>
  );
}

function SaveBox({ v, c }: { v: number; c: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-sunken p-2 text-center">
      <div className="font-display text-xl text-foreground tnum">{formatModifier(v)}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{c}</div>
    </div>
  );
}

function Mini({ v, c }: { v: string | number; c: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-sunken px-1 py-1.5 text-center">
      <div className="text-sm font-bold text-foreground tnum">{v}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{c}</div>
    </div>
  );
}

function Tracker({ label, value, tone = "rune" }: { label: string; value: string | number; tone?: "gold" | "rune" | "danger" }) {
  const toneCls = tone === "gold" ? "text-gold border-gold/40" : tone === "danger" ? "text-danger border-danger/40" : "text-rune border-rune/40";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border bg-surface-sunken px-2.5 py-1 text-xs", toneCls)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tnum">{value}</span>
    </span>
  );
}

function DefLine({ label, values, tone }: { label: string; values: string[]; tone?: "warn" }) {
  if (!values || values.length === 0) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn(tone === "warn" ? "text-warning" : "text-foreground")}>{values.join(", ")}</dd>
    </div>
  );
}

function hpFill(status: string): string {
  if (status === "dead" || status === "dying") return "bg-danger";
  if (status === "unconscious" || status === "disabled") return "bg-warning";
  if (status === "staggered") return "bg-warning";
  return "bg-gradient-to-r from-success to-success/70";
}

function hasDefenses(d: CharacterViewModel["defenses"]): boolean {
  return (
    d.damageReduction.length > 0 ||
    d.energyResistance.length > 0 ||
    d.immunities.length > 0 ||
    d.spellResistance != null ||
    d.conditions.length > 0
  );
}

function hasTrackers(vm: CharacterViewModel): boolean {
  return !!(vm.heroPoints || vm.honor || vm.stamina || vm.mythic || vm.psionics || vm.spheres || vm.pathOfWar || vm.akashic || vm.oaths || vm.milestoneLeveling);
}

const PROFILE_FIELDS = [
  { key: "backstory", label: "Backstory" },
  { key: "appearance", label: "Appearance" },
  { key: "personality", label: "Personality" },
  { key: "ideals", label: "Ideals" },
  { key: "allies", label: "Allies" },
  { key: "foes", label: "Foes" },
  { key: "affiliations", label: "Affiliations" },
  { key: "family", label: "Family" },
] as const;

function hasProfile(p: NonNullable<CharacterViewModel["profile"]>): boolean {
  return PROFILE_FIELDS.some(({ key }) => !!p[key]);
}
