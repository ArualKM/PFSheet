/**
 * Standard PF1e conditions whose mechanical effects are clean numeric modifiers the engine can
 * apply. Targets use the same routing as buffs/items (classifyTarget): "attack" = all attacks,
 * "saves" = all saving throws, "skills" = all skill checks, "abilities.dex" = the ability score
 * (cascades), "ac", "attack.melee", etc. Penalties are untyped (they stack with other sources).
 *
 * Conditions with non-numeric or positional effects (loses Dex to AC, half speed, can't act) are
 * intentionally NOT modeled here — they're recorded for display but don't auto-adjust the math.
 */
export type ConditionEffect = {
  target: string;
  value: number;
  label: string;
  /**
   * Stacking group — effects sharing one keep only the single most-severe penalty (PF1e
   * "escalating track" rule). `fear` (shaken < frightened < panicked) and `fatigue`
   * (fatigued < exhausted) are tracks: you take the worse, they don't add. Conditions WITHOUT
   * a group stack with each other (e.g. Shaken + Sickened = -4).
   */
  group?: string;
};

function fear(label: string): ConditionEffect[] {
  return [
    { target: "attack", value: -2, label, group: "fear" },
    { target: "saves", value: -2, label, group: "fear" },
    { target: "skills", value: -2, label, group: "fear" },
  ];
}

export const CONDITION_EFFECTS: Record<string, ConditionEffect[]> = {
  shaken: fear("Shaken"),
  frightened: fear("Frightened"),
  panicked: fear("Panicked"),
  sickened: [
    { target: "attack", value: -2, label: "Sickened", group: "cond:sickened" },
    { target: "saves", value: -2, label: "Sickened", group: "cond:sickened" },
    { target: "skills", value: -2, label: "Sickened", group: "cond:sickened" },
  ],
  fatigued: [
    { target: "abilities.str", value: -2, label: "Fatigued", group: "fatigue" },
    { target: "abilities.dex", value: -2, label: "Fatigued", group: "fatigue" },
  ],
  exhausted: [
    { target: "abilities.str", value: -6, label: "Exhausted", group: "fatigue" },
    { target: "abilities.dex", value: -6, label: "Exhausted", group: "fatigue" },
  ],
  entangled: [
    { target: "attack", value: -2, label: "Entangled" },
    { target: "abilities.dex", value: -4, label: "Entangled" },
  ],
  grappled: [
    { target: "attack", value: -2, label: "Grappled" },
    { target: "abilities.dex", value: -4, label: "Grappled" },
  ],
  dazzled: [{ target: "attack", value: -1, label: "Dazzled" }],
  prone: [{ target: "attack.melee", value: -4, label: "Prone" }],
  cowering: [{ target: "ac", value: -2, label: "Cowering" }],
  stunned: [{ target: "ac", value: -2, label: "Stunned" }],
  // Blinded: −2 AC (its loss of Dex-to-AC, half speed, and −4 on Str/Dex skill checks are positional /
  // non-cleanly-targetable, so only the flat −2 AC is modeled — see the module header).
  blinded: [{ target: "ac", value: -2, label: "Blinded" }],
  // Deafened: −4 on initiative (the 20% verbal-spell-failure chance is not a numeric modifier).
  deafened: [{ target: "initiative", value: -4, label: "Deafened" }],
  // Pinned: an additional −4 AC (the denial of Dex-to-AC is positional, not modeled). Pinned is RAW also
  // grappled — list both conditions to get grappled's −2 attack / −4 Dex on top.
  pinned: [{ target: "ac", value: -4, label: "Pinned" }],
  // Squeezing (moving through a too-small space): −4 attack and −4 AC.
  squeezing: [
    { target: "attack", value: -4, label: "Squeezing" },
    { target: "ac", value: -4, label: "Squeezing" },
  ],
  // Invisible: +2 on attack rolls vs. sighted foes (the concealment / denial of the foe's Dex-to-AC is
  // positional and lives on the defender, not modeled here).
  invisible: [{ target: "attack", value: 2, label: "Invisible" }],
  // Intentionally NOT modeled (no clean static numeric self-modifier — they are action restrictions or
  // "set ability to 0" / helpless effects, recorded for display only): nauseated, paralyzed, helpless,
  // dazed, staggered, confused, stable, dying, unconscious, petrified, flat-footed (loses Dex to AC).
};

/** Display-cased condition names for the editor quick-pick. */
export const STANDARD_CONDITIONS = Object.keys(CONDITION_EFFECTS).map(
  (k) => k.charAt(0).toUpperCase() + k.slice(1),
);

/** The mechanical effects for an arbitrary (possibly free-typed) condition label, or []. */
export function conditionEffects(condition: string): ConditionEffect[] {
  return CONDITION_EFFECTS[condition.trim().toLowerCase()] ?? [];
}
