import type { PathForgeCharacterV1, ViewerContext } from "@pathforge/schema";
import { OPTIONAL_RULE_MODULES, isRuleEnabled } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { canSee, effectiveLevel } from "./view-model";

/**
 * Character snapshot diff (§16.2). Pure comparison of two canonical sheets into a
 * human-readable change set: changed values (identity + computed stats + wealth +
 * formula expressions), and added/removed lists (feats, features, spells, items,
 * buffs, formula overrides, rule modules). Recomputes both sides so stat changes
 * reflect the engine, not just stored values. UI-free and side-effect-free.
 *
 * Privacy: built for a `viewer` and honors §15 section privacy on the CURRENT
 * (after) sheet, mirroring `buildCharacterViewModel` — a GM diffing an approved
 * snapshot never sees changes to a section the owner restricts (e.g. feats set to
 * owner_only). Identity + computed stats are always-visible and never gated.
 */
export type ValueChange = { label: string; before: string; after: string };
export type ListChange = { label: string; added: string[]; removed: string[] };

export type CharacterDiff = {
  values: ValueChange[];
  lists: ListChange[];
  hasChanges: boolean;
};

function valueChange(label: string, before: unknown, after: unknown): ValueChange | null {
  const b = String(before ?? "");
  const a = String(after ?? "");
  return b === a ? null : { label, before: b || "—", after: a || "—" };
}

function countBy(names: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  return m;
}

/** Multiset diff by name, so adding a second copy of an item still registers. */
function listChange(label: string, before: string[], after: string[]): ListChange | null {
  const bc = countBy(before);
  const ac = countBy(after);
  const added: string[] = [];
  const removed: string[] = [];
  for (const key of new Set([...bc.keys(), ...ac.keys()])) {
    const delta = (ac.get(key) ?? 0) - (bc.get(key) ?? 0);
    for (let i = 0; i < delta; i++) added.push(key);
    for (let i = 0; i < -delta; i++) removed.push(key);
  }
  if (added.length === 0 && removed.length === 0) return null;
  return { label, added: added.sort(), removed: removed.sort() };
}

function classLine(c: PathForgeCharacterV1): string {
  return c.identity.classes.map((cl) => `${cl.name} ${cl.level}`).join(" / ") || "—";
}

function totalGp(c: PathForgeCharacterV1): number {
  const w = c.wealth;
  return Math.round((w.pp * 10 + w.gp + w.sp / 10 + w.cp / 100) * 100) / 100;
}

function allItemNames(c: PathForgeCharacterV1): string[] {
  const inv = c.inventory;
  return [
    ...inv.weapons,
    ...inv.armorAndShields,
    ...inv.potionsScrollsMagicItems,
    ...inv.gear,
    ...inv.otherItems,
  ].map((i) => i.name);
}

function allSpellNames(c: PathForgeCharacterV1): string[] {
  return [
    ...c.spellcasting.knownSpells,
    ...c.spellcasting.preparedSpells,
    ...c.spellcasting.spellbook,
  ].map((s) => s.name);
}

function enabledModuleNames(c: PathForgeCharacterV1): string[] {
  return OPTIONAL_RULE_MODULES.filter((m) => isRuleEnabled(c, m)).map((m) => m.name);
}

export function diffCharacters(
  before: PathForgeCharacterV1,
  after: PathForgeCharacterV1,
  viewer: ViewerContext = "owner",
): CharacterDiff {
  const bs = computeCharacter(before).summary;
  const as = computeCharacter(after).summary;

  // Section visibility from the current sheet's privacy, mirroring the read-only view.
  const see = (section: string) => canSee(effectiveLevel(after, section), viewer);

  const values: ValueChange[] = [];
  const push = (vc: ValueChange | null) => {
    if (vc) values.push(vc);
  };

  // Identity (always visible — appears in every viewer's header)
  push(valueChange("Name", before.identity.name, after.identity.name));
  push(valueChange("Total level", before.identity.totalLevel, after.identity.totalLevel));
  push(valueChange("Classes", classLine(before), classLine(after)));
  push(valueChange("Alignment", before.identity.alignment, after.identity.alignment));
  push(valueChange("Race", before.identity.race, after.identity.race));
  push(valueChange("Size", before.identity.size, after.identity.size));

  // Computed stats (always visible)
  push(valueChange("Max HP", bs.hp?.max, as.hp?.max));
  push(valueChange("AC", bs.ac, as.ac));
  push(valueChange("Touch AC", bs.touch, as.touch));
  push(valueChange("Flat-footed AC", bs.flatFooted, as.flatFooted));
  push(valueChange("CMD", bs.cmd, as.cmd));
  push(valueChange("Fortitude", bs.fortitude, as.fortitude));
  push(valueChange("Reflex", bs.reflex, as.reflex));
  push(valueChange("Will", bs.will, as.will));
  push(valueChange("Initiative", bs.initiative, as.initiative));

  // Wealth (gated)
  if (see("wealth")) push(valueChange("Wealth (gp)", totalGp(before), totalGp(after)));

  // Changed formula override expressions (gated on formulaDetails).
  const beforeFormulas = before.formulas.overrides;
  const afterFormulas = after.formulas.overrides;
  if (see("formulaDetails")) {
    for (const path of Object.keys(afterFormulas)) {
      const b = beforeFormulas[path];
      const a = afterFormulas[path];
      if (b && a && b.formula !== a.formula) {
        push(valueChange(`Formula: ${path}`, b.formula, a.formula));
      }
    }
  }

  const lists: ListChange[] = [];
  const pushList = (lc: ListChange | null) => {
    if (lc) lists.push(lc);
  };

  if (see("feats")) {
    pushList(listChange("Feats", before.feats.list.map((f) => f.name), after.feats.list.map((f) => f.name)));
  }
  if (see("features")) {
    pushList(
      listChange("Features", before.features.list.map((f) => f.name), after.features.list.map((f) => f.name)),
    );
  }
  if (see("spells")) {
    pushList(listChange("Spells", allSpellNames(before), allSpellNames(after)));
  }
  if (see("inventory")) {
    pushList(listChange("Inventory", allItemNames(before), allItemNames(after)));
  }
  if (see("buffs")) {
    pushList(
      listChange(
        "Active buffs",
        before.buffs.active.filter((b) => b.enabled).map((b) => b.name),
        after.buffs.active.filter((b) => b.enabled).map((b) => b.name),
      ),
    );
  }
  if (see("formulaDetails")) {
    pushList(listChange("Formula overrides", Object.keys(beforeFormulas), Object.keys(afterFormulas)));
  }
  // Enabled rule modules are campaign-relevant metadata, always shown.
  pushList(listChange("Rule modules", enabledModuleNames(before), enabledModuleNames(after)));

  return { values, lists, hasChanges: values.length > 0 || lists.length > 0 };
}
