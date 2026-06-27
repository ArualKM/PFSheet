/**
 * Default PF1e sheet formulas (mechanics only — no rules text).
 * These are the starting formulas the formula engine evaluates; players may
 * override any of them via the FormulaBlock. References use the `@{path}` syntax
 * resolved by @pathforge/rules-pf1e.
 */
export const DEFAULT_FORMULAS = {
  ac: {
    total:
      "10 + @{abilities.dex.mod} + @{ac.maxDexPenalty} + @{ac.armor} + @{ac.shield} + @{ac.naturalArmor} + @{ac.deflection} + @{ac.dodge} + @{size.acMod} + @{ac.misc}",
    touch:
      "10 + @{abilities.dex.mod} + @{ac.maxDexPenalty} + @{ac.deflection} + @{ac.dodge} + @{size.acMod} + @{ac.misc}",
    flatFooted:
      "10 + @{ac.armor} + @{ac.shield} + @{ac.naturalArmor} + @{ac.deflection} + @{size.acMod} + @{ac.misc}",
    cmd: "10 + @{combat.bab.total} + @{abilities.str.mod} + @{abilities.dex.mod} + @{size.cmdMod} + @{cmd.misc}",
  },
  saves: {
    fortitude: "@{saves.fortitude.base} + @{abilities.con.mod} + @{saves.fortitude.misc}",
    reflex: "@{saves.reflex.base} + @{abilities.dex.mod} + @{saves.reflex.misc}",
    will: "@{saves.will.base} + @{abilities.wis.mod} + @{saves.will.misc}",
  },
  initiative: "@{abilities.dex.mod} + @{combat.initiative.misc}",
  attack: {
    melee: "@{combat.bab.total} + @{abilities.str.mod} + @{size.attackMod} + @{attack.misc.melee}",
    ranged:
      "@{combat.bab.total} + @{abilities.dex.mod} + @{size.attackMod} + @{attack.misc.ranged}",
    cmb: "@{combat.bab.total} + @{abilities.str.mod} + @{size.cmbMod} + @{attack.misc.cmb}",
  },
  /** Per-skill template: resolved within the row's local scope. */
  skill: "@{ranks} + @{abilityMod} + @{classSkillBonus} + @{armorCheckPenalty} + @{misc}",
  abilityModifier: "floor((@{score} - 10) / 2)",
} as const;
