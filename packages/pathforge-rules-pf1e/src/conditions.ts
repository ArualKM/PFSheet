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
};

/** Display-cased condition names for the editor quick-pick. */
export const STANDARD_CONDITIONS = Object.keys(CONDITION_EFFECTS).map(
  (k) => k.charAt(0).toUpperCase() + k.slice(1),
);

/** The mechanical effects for an arbitrary (possibly free-typed) condition label, or []. */
export function conditionEffects(condition: string): ConditionEffect[] {
  return CONDITION_EFFECTS[condition.trim().toLowerCase()] ?? [];
}
