import type { PathForgeCharacterV1, ViewerContext } from "@pathforge/schema";
import { ABILITY_KEYS, OPTIONAL_RULE_MODULES, isRuleEnabled } from "@pathforge/schema";
import type { ComputedCharacter } from "@pathforge/rules-pf1e";
import { canSee, effectiveLevel } from "./view-model";

/**
 * GM math/content audit (§10 GM Audit View, §17.3). Pure, UI-free analysis of a
 * canonical sheet + its computed values: surfaces likely math problems, formula
 * overrides, homebrew/3pp content, enabled rule modules, and active buffs so the
 * GM can vet a sheet without trusting the player's own numbers. Read-only — it
 * never mutates the character.
 *
 * Privacy: the audit is built for a specific `viewer` and honors the SAME §15
 * section privacy as `buildCharacterViewModel`. Content whose section the viewer
 * may not see (e.g. an owner who restricted feats/spells/formulaDetails to
 * `owner_only`) is omitted, not enumerated — so the audit panel can't leak what
 * the read-only sheet beside it hides. Math warnings on always-visible data
 * (abilities, level, HP, AC) are always included.
 */
export type AuditSeverity = "warning" | "info";

export type AuditWarning = {
  id: string;
  severity: AuditSeverity;
  message: string;
  /** Sheet path the warning relates to, when applicable. */
  targetPath?: string;
};

export type FormulaOverrideItem = {
  targetPath: string;
  formula: string;
  note?: string;
  enabled: boolean;
  gmRecommended: boolean;
};

export type CustomContentItem = {
  kind: "Feat" | "Feature" | "Trait" | "Buff" | "Skill" | "Class";
  name: string;
  detail?: string;
  /** A GM previously flagged or rejected this entry. */
  flagged: boolean;
};

export type AuditModule = {
  key: string;
  name: string;
  group: string;
  publisher?: string;
};

export type ActiveBuffSummary = {
  name: string;
  category?: string;
  effectCount: number;
  custom: boolean;
};

export type CharacterAudit = {
  warnings: AuditWarning[];
  formulaOverrides: FormulaOverrideItem[];
  customFormulaCount: number;
  customContent: CustomContentItem[];
  flaggedEntries: CustomContentItem[];
  modules: AuditModule[];
  activeBuffs: ActiveBuffSummary[];
  /** Labels of sections withheld from this viewer by the owner's privacy settings. */
  hiddenSections: string[];
};

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** A source ref counts as homebrew/3pp when explicitly custom or from a module. */
function isCustomSource(source: { custom?: boolean; module?: string } | undefined): boolean {
  return Boolean(source && (source.custom || source.module));
}

function sourceDetail(source: { custom?: boolean; module?: string; book?: string } | undefined): string | undefined {
  if (!source) return undefined;
  if (source.module) return source.module;
  if (source.custom) return "Custom";
  return source.book;
}

export function auditCharacter(
  character: PathForgeCharacterV1,
  computed: ComputedCharacter,
  viewer: ViewerContext = "owner",
): CharacterAudit {
  const warnings: AuditWarning[] = [];
  const totalLevel = num(character.identity.totalLevel);
  const classLevelSum = character.identity.classes.reduce((sum, c) => sum + num(c.level), 0);

  // Section visibility for this viewer, mirroring the read-only sheet's privacy.
  const see = (section: string) => canSee(effectiveLevel(character, section), viewer);
  const hidden = new Set<string>();
  const note = (visible: boolean, label: string): boolean => {
    if (!visible) hidden.add(label);
    return visible;
  };
  const canFeats = note(see("feats"), "Feats");
  const canFeatures = note(see("features"), "Features");
  const canSkills = note(see("skills"), "Skills");
  const canBuffs = note(see("buffs"), "Buffs");
  const canSpells = note(see("spells"), "Spellcasting");
  const canFormulas = note(see("formulaDetails"), "Formula details");

  // ── Math audit (always-visible data) ─────────────────────────────────────
  if (character.identity.classes.length === 0) {
    warnings.push({ id: "no-classes", severity: "info", message: "No classes are set on this character." });
  } else if (totalLevel !== classLevelSum) {
    warnings.push({
      id: "level-mismatch",
      severity: "warning",
      message: `Total level (${totalLevel}) doesn't match the sum of class levels (${classLevelSum}).`,
      targetPath: "identity.totalLevel",
    });
  }

  for (const key of ABILITY_KEYS) {
    const score = num(computed.abilities[key]?.effectiveScore, 10);
    if (score <= 0) {
      warnings.push({
        id: `ability-${key}-nonpositive`,
        severity: "warning",
        message: `Effective ${key.toUpperCase()} is ${score} — a score of 0 or less usually indicates an error.`,
        targetPath: `abilities.primary.${key}`,
      });
    } else if (score > 30) {
      warnings.push({
        id: `ability-${key}-high`,
        severity: "info",
        message: `${key.toUpperCase()} is unusually high (${score}) — worth confirming the bonuses.`,
        targetPath: `abilities.primary.${key}`,
      });
    }
  }

  const maxHp = num(computed.summary.hp?.max);
  if (totalLevel > 0 && maxHp <= 0) {
    warnings.push({
      id: "hp-nonpositive",
      severity: "warning",
      message: `A level-${totalLevel} character has ${maxHp} max HP.`,
      targetPath: "health.maxHp",
    });
  }

  if (num(computed.summary.ac, 10) < 10) {
    warnings.push({ id: "ac-low", severity: "info", message: `Total AC is ${computed.summary.ac}, below the base of 10.`, targetPath: "defenses.armorClass" });
  }

  // Max ranks in any skill = character level (PF1e). Flag over-ranked skills.
  if (canSkills && totalLevel > 0) {
    for (const skill of character.skills.list) {
      if (num(skill.ranks) > totalLevel) {
        warnings.push({
          id: `skill-overrank-${skill.key}`,
          severity: "warning",
          message: `${skill.label} has ${skill.ranks} ranks but the character is level ${totalLevel} (max ranks = level).`,
          targetPath: `skills.list.${skill.key}`,
        });
      }
    }
  }

  if (canSpells) {
    for (const caster of character.spellcasting.casters) {
      const cl = num(caster.casterLevel);
      if (totalLevel > 0 && cl > totalLevel) {
        warnings.push({
          id: `caster-level-${caster.className}`,
          severity: "warning",
          message: `${caster.className} caster level (${cl}) exceeds the character level (${totalLevel}).`,
          targetPath: "spellcasting.casters",
        });
      }
    }
  }

  // ── Formula overrides (gated on formulaDetails) ──────────────────────────
  const formulaOverrides: FormulaOverrideItem[] = canFormulas
    ? Object.values(character.formulas.overrides).map((o) => ({
        targetPath: o.targetPath,
        formula: o.formula,
        note: o.note,
        enabled: o.enabled !== false,
        gmRecommended: Boolean(o.gmReviewRecommended),
      }))
    : [];
  for (const o of formulaOverrides) {
    if (o.enabled && o.gmRecommended) {
      warnings.push({
        id: `formula-${o.targetPath}`,
        severity: "warning",
        message: `Formula override on ${o.targetPath} is flagged for GM review.`,
        targetPath: o.targetPath,
      });
    }
  }

  // ── Custom / third-party content (gated per owning section) ──────────────
  const customContent: CustomContentItem[] = [];
  const flaggedEntries: CustomContentItem[] = [];

  const considerEntry = (
    visible: boolean,
    kind: CustomContentItem["kind"],
    name: string,
    source: { custom?: boolean; module?: string; book?: string } | undefined,
    gmStatus: string | undefined,
  ) => {
    if (!visible) return;
    const flagged = gmStatus === "flagged" || gmStatus === "rejected";
    const item: CustomContentItem = { kind, name, detail: sourceDetail(source), flagged };
    if (isCustomSource(source)) customContent.push(item);
    if (flagged) flaggedEntries.push(item);
  };

  for (const f of character.feats.list) considerEntry(canFeats, "Feat", f.name, f.source, f.gmStatus);
  for (const f of character.features.list) considerEntry(canFeatures, "Feature", f.name, f.source, f.gmStatus);
  for (const t of character.traits.list) considerEntry(canFeats, "Trait", t.name, t.source, t.gmStatus);
  // Classes appear in the always-visible header, so their detail isn't gated.
  for (const c of character.identity.classes) {
    if (isCustomSource(c.source) || c.archetype) {
      customContent.push({ kind: "Class", name: c.name, detail: c.archetype ?? sourceDetail(c.source), flagged: false });
    }
  }
  if (canSkills) {
    for (const s of character.skills.list) {
      if (s.custom) customContent.push({ kind: "Skill", name: s.label, detail: s.specialty, flagged: false });
    }
  }
  if (canBuffs) {
    for (const b of character.buffs.active) {
      const custom = b.category === "custom" || !b.templateId || isCustomSource(b.source);
      if (custom) customContent.push({ kind: "Buff", name: b.name, detail: b.category, flagged: false });
    }
  }

  // ── Rule modules (enabled-rules metadata, always visible) ────────────────
  const modules: AuditModule[] = OPTIONAL_RULE_MODULES.filter((m) => isRuleEnabled(character, m)).map((m) => ({
    key: m.key,
    name: m.name,
    group: m.group,
    publisher: m.publisher,
  }));

  // ── Active buffs (gated on buffs) ────────────────────────────────────────
  const activeBuffs: ActiveBuffSummary[] = canBuffs
    ? character.buffs.active
        .filter((b) => b.enabled)
        .map((b) => ({
          name: b.name,
          category: b.category,
          effectCount: b.effects.length,
          custom: b.category === "custom" || !b.templateId,
        }))
    : [];

  return {
    warnings,
    formulaOverrides,
    customFormulaCount: canFormulas ? character.formulas.custom.length : 0,
    customContent,
    flaggedEntries,
    modules,
    activeBuffs,
    hiddenSections: [...hidden],
  };
}
