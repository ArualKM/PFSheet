import type { CharacterViewModel } from "./view-model";

/**
 * API response shapes (§14, §13.4), built from a privacy-filtered CharacterViewModel
 * — so a public request only ever serializes what the viewer is allowed to see
 * (sections the view-model gated are null/empty here too).
 */
export function characterSummary(vm: CharacterViewModel) {
  return {
    name: vm.header.name,
    classLine: vm.header.classLine,
    level: vm.header.totalLevel,
    race: vm.header.race ?? null,
    alignment: vm.header.alignment ?? null,
    hp: vm.vitals.hp,
    ac: vm.vitals.ac,
    cmb: vm.vitals.cmb,
    cmd: vm.vitals.cmd,
    saves: vm.vitals.saves,
    initiative: vm.vitals.initiative,
    speed: vm.vitals.speed,
    // Lightweight spell roll-up (null if the spells section is gated for this viewer).
    spellcasting: vm.spellcasting
      ? {
          casterCount: vm.spellcasting.casters.length,
          highestLevel: Math.max(
            0,
            ...vm.spellcasting.casters.flatMap((c) => c.slots.filter((s) => s.total > 0).map((s) => s.level)),
          ),
          slotsRemaining: vm.spellcasting.casters.reduce(
            (a, c) => a + c.slots.reduce((b, s) => b + s.remaining, 0),
            0,
          ),
        }
      : null,
  };
}

export function characterStats(vm: CharacterViewModel) {
  return {
    ...characterSummary(vm),
    abilities: vm.abilities,
    skills: vm.skills, // null if the viewer can't see the skills section
    attacks: vm.attacks,
    languages: vm.languages,
    spellcasting: vm.spellcasting, // full gated spellcasting (null if not visible)
  };
}

export function characterPortrait(vm: CharacterViewModel) {
  return { name: vm.header.name, portraitUrl: vm.header.portraitUrl ?? null };
}

export function discordCard(vm: CharacterViewModel, shareUrl?: string) {
  const topSkills = (vm.skills ?? [])
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .map((s) => ({ name: s.label, value: s.total }));
  return {
    name: vm.header.name,
    subtitle: vm.header.classLine,
    portraitUrl: vm.header.portraitUrl ?? null,
    level: vm.header.totalLevel,
    hp: vm.vitals.hp,
    ac: vm.vitals.ac,
    saves: vm.vitals.saves,
    initiative: vm.vitals.initiative,
    speed: vm.vitals.speed,
    topSkills,
    activeBuffs: (vm.buffs ?? []).filter((b) => b.enabled).map((b) => b.name),
    preparedHighlights: (vm.spellcasting?.prepared ?? [])
      .filter((p) => p.used < p.prepared)
      .slice(0, 4)
      .map((p) => ({ name: p.name, level: p.level })),
    shareUrl: shareUrl ?? null,
  };
}

export function openGraph(vm: CharacterViewModel) {
  return {
    title: vm.header.name,
    description: `${vm.header.classLine} · Level ${vm.header.totalLevel}`,
    image: vm.header.portraitUrl ?? null,
  };
}
