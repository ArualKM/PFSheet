"use client";

import type { ReactNode } from "react";
import { StatChip } from "./picker-shell";
import { formatModifier } from "@/lib/utils";
import type { CharacterEditorApi } from "./use-character-editor";

const ABILITY_CHIPS: { key: "str" | "dex" | "con" | "int" | "wis" | "cha"; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "cha", label: "CHA" },
];

/**
 * The collapsed section's one-line live chip summary — S6 Pillar 2 Stage 2
 * (docs/S6_UX_OVERHAUL/02_MODERN_EDITOR.md §4/§6 Stage 2). STRICTLY read-only: never touches
 * `ed.update`, and reads `ed.computed`/`ed.draft` directly on every render (no memoized snapshot)
 * so a collapsed summary card can never show a stale number after a sibling section's edit
 * recomputes the sheet. Each section picks its own 3-6 most useful stats — this is deliberately
 * NOT a generic "dump every field as a chip" renderer. Sections with nothing meaningful to show
 * (Story, Settings, Optional, unknown keys) render nothing so the caller doesn't render an empty
 * chip row.
 */
export function SectionSummary({ sectionKey, ed }: { sectionKey: string; ed: CharacterEditorApi }) {
  const chips = buildChips(sectionKey, ed);
  if (!chips || chips.length === 0) return null;
  return <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{chips}</div>;
}

function buildChips(sectionKey: string, ed: CharacterEditorApi): ReactNode[] | null {
  const summary = ed.computed.summary;
  switch (sectionKey) {
    case "core": {
      const abilityChips = ABILITY_CHIPS.map(({ key, label }) => (
        <StatChip key={key} label={label} value={formatModifier(summary.abilityMods[key] ?? 0)} />
      ));
      // Wounds & Vigor is a SIBLING pool — summary.hp stays the (often untouched 0/0) classic
      // fields when the variant is on, so the chip must fork exactly like the dashboard's
      // vitals tile does.
      const wv = summary.woundsVigor;
      if (wv) {
        return [
          ...abilityChips,
          <StatChip
            key="vigor"
            label="Vigor"
            value={`${wv.vigor.current}/${wv.vigor.max}`}
            tone={wv.vigor.current < wv.vigor.max ? "poor" : "neutral"}
          />,
          <StatChip
            key="wounds"
            label="Wounds"
            value={`${wv.wound.current}/${wv.wound.max}`}
            tone={wv.wound.current < wv.wound.max ? "poor" : "neutral"}
          />,
        ];
      }
      const hp = summary.hp;
      return [
        ...abilityChips,
        <StatChip
          key="hp"
          label="HP"
          value={`${hp.current}/${hp.max}`}
          tone={hp.current < hp.max ? "poor" : "neutral"}
        />,
      ];
    }

    case "defenses":
      return [
        <StatChip key="ac" label="AC" value={summary.ac} />,
        <StatChip key="touch" label="Touch" value={summary.touch} />,
        <StatChip key="ff" label="FF" value={summary.flatFooted} />,
        <StatChip key="fort" label="Fort" value={formatModifier(summary.fortitude)} />,
        <StatChip key="ref" label="Ref" value={formatModifier(summary.reflex)} />,
        <StatChip key="will" label="Will" value={formatModifier(summary.will)} />,
      ];

    case "attacks": {
      const chips: ReactNode[] = [
        <StatChip key="bab" label="BAB" value={formatModifier(summary.bab)} />,
        <StatChip key="cmb" label="CMB" value={formatModifier(ed.computed.attackBonuses.cmb.value)} />,
        <StatChip key="cmd" label="CMD" value={summary.cmd} />,
      ];
      if (ed.computed.attacks.length > 0) {
        chips.push(<StatChip key="attacks" label="Attacks" value={ed.computed.attacks.length} />);
      }
      return chips;
    }

    case "abilities":
      // The "Feats & features" section (character-editor.tsx's `abilities` key) — feat/feature
      // counts live on the draft directly, no computed roll-up needed.
      return [
        <StatChip key="feats" label="Feats" value={ed.draft.feats.list.length} />,
        <StatChip key="features" label="Features" value={ed.draft.features.list.length} />,
      ];

    case "skills": {
      const ranked = ed.draft.skills.list.filter(
        (s) => (s.ranks ?? 0) > 0 || (s.backgroundRanks ?? 0) > 0,
      ).length;
      const chips: ReactNode[] = [<StatChip key="ranked" label="Ranked" value={ranked} />];
      const bg = summary.backgroundSkills;
      if (bg) chips.push(<StatChip key="bg" label="BG" value={`${bg.spent}/${bg.budget}`} />);
      return chips;
    }

    case "spells": {
      const s = summary.spells;
      if (!s || s.casterCount === 0) return null;
      const highestCasterLevel = ed.computed.spellcasting.reduce((max, c) => Math.max(max, c.casterLevel), 0);
      return [
        <StatChip key="casters" label="Casters" value={s.casterCount} />,
        <StatChip key="cl" label="CL" value={highestCasterLevel} tone="rune" />,
      ];
    }

    case "equipment": {
      const inv = ed.draft.inventory;
      const itemCount =
        inv.weapons.length +
        inv.armorAndShields.length +
        inv.potionsScrollsMagicItems.length +
        inv.gear.length +
        inv.otherItems.length;
      // Converted TOTAL wealth (pp/gp/sp/cp → gp), same formula as the view-model's totalGp — the
      // raw gp coin count alone reads "broke" for a character carrying platinum.
      const w = ed.draft.wealth;
      const totalGp = Math.round((w.pp * 10 + w.gp + w.sp / 10 + w.cp / 100) * 100) / 100;
      const chips: ReactNode[] = [
        <StatChip key="items" label="Items" value={itemCount} />,
        <StatChip key="gp" label="GP" value={`≈${totalGp}`} tone="gold" />,
      ];
      // Items Overhaul Stage 3 — the equipment-slots summary is always-on (no module gate), read
      // live per render so the chip can never go stale after an equip/slot edit elsewhere.
      const slots = summary.equipmentSlots;
      if (slots.warnings.length > 0) {
        chips.push(<StatChip key="warnings" label="Warnings" value={slots.warnings.length} tone="poor" />);
      }
      if (slots.handsUsed > 0) {
        chips.push(<StatChip key="hands" label="Hands" value={`${slots.handsUsed}/${slots.handsAvailable}`} />);
      }
      return chips;
    }

    case "buffs": {
      const active = ed.draft.buffs.active;
      if (active.length === 0) return null;
      const enabledCount = active.filter((b) => b.enabled).length;
      return [<StatChip key="buffs" label="Active" value={`${enabledCount}/${active.length}`} />];
    }

    // Nothing meaningful to summarize — the disclosure IS the content (Story/Settings), or the
    // count would require re-deriving the optional-system enablement logic already owned by
    // character-editor.tsx's section builder (kept simple per the design brief).
    case "optional":
    case "story":
    case "settings":
      return null;

    default:
      return null;
  }
}
