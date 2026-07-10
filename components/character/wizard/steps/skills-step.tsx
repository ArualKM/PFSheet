"use client";

import type { ReactNode } from "react";
import { NumberField } from "../../editor/fields";
import { CollapsibleGroup } from "../../collapsible-group";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/**
 * §4.3 "skills-step.tsx" — wraps rank entry for every skill on `ed.draft.skills.list`.
 *
 * `SkillsEditor` lives INLINE in `character-editor.tsx` (~5,400 lines / ~1.2MB) — importing it
 * would drag the whole editor graph into the wizard bundle (a confirmed review finding on this
 * pillar's other steps). Option (a) from the task: a compact wizard-native ranks editor built from
 * the same schema + the same `ed.update` write shape `SkillsEditor` uses
 * (`c.skills.list[i].ranks = n`), just without its class-skill/ability-override/misc-bonus/add-skill
 * chrome. There's no engine-exposed overall skill-point budget to show (only the optional
 * Background Skills variant has one) — ranks-spent + the level-based per-skill cap (§4.3 mirrors
 * `SkillsEditor`'s own "max {totalLevel}/skill" copy) is the honest substitute.
 *
 * Adversarial-review fix (finding C): the 30+ skill rows used to live in one nested
 * `overflow-y-auto` box — this is a wizard step (the page itself scrolls), not a chrome-heavy
 * editor panel. Reworked onto the codebase's own long-list primitive, `<CollapsibleGroup>`
 * (`components/character/collapsible-group.tsx`): a "Class skills" group (open by default — the
 * ones a new player should prioritize, a class skill gets +3 once trained) and an "Other skills"
 * group (collapsed by default, count badge). The Race/Class steps come BEFORE this one but are both
 * skippable, so a real player can land here with zero class skills marked — in that case there's
 * nothing to prioritize, so the (now sole) "Other skills" group defaults OPEN instead of hiding the
 * entire step behind a collapsed header; the "Class skills" group itself is omitted rather than
 * rendered empty.
 */
export function SkillsStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  const totalLevel = ed.draft.identity.totalLevel || 1;
  const skills = ed.draft.skills.list;
  const ranksSpent = skills.reduce((sum, s) => sum + (s.ranks ?? 0), 0);

  const setRanks = (i: number, n: number) =>
    ed.update((c) => {
      const t = c.skills.list[i];
      if (t) t.ranks = n;
    });

  // Split by classSkill (each row keeps its ORIGINAL index for ed.update), sorted alphabetically
  // within each group.
  const indexed = skills.map((s, i) => ({ s, i }));
  const byLabel = (a: (typeof indexed)[number], b: (typeof indexed)[number]) => a.s.label.localeCompare(b.s.label);
  const classSkills = indexed.filter(({ s }) => !!s.classSkill).sort(byLabel);
  const otherSkills = indexed.filter(({ s }) => !s.classSkill).sort(byLabel);

  const renderRow = ({ s, i }: (typeof indexed)[number]): ReactNode => {
    const total = ed.computed.skills[s.key]?.value ?? 0;
    const label = s.specialty ? `${s.label} (${s.specialty})` : s.label;
    return (
      <div key={s.id} className="flex items-center gap-3 border-b border-border/40 py-2 last:border-b-0">
        <NumberField
          label={label}
          value={s.ranks}
          min={0}
          max={totalLevel}
          onChange={(n) => setRanks(i, n)}
          hint={`${s.ability.toUpperCase()}${s.classSkill ? " · class skill" : ""}`}
          className="min-w-0 flex-1"
        />
        <span className="tnum w-10 shrink-0 pt-5 text-right text-sm font-semibold text-gold">
          {total >= 0 ? `+${total}` : total}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Skills</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Skills you&rsquo;re trained in (&ldquo;class skills&rdquo;, listed first) get a +3 bonus once you
          put a rank in them. This step is optional — you can leave every rank at 0 and fill these in later.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Ranks spent: <span className="tnum font-semibold text-foreground">{ranksSpent}</span> · max{" "}
        {totalLevel} rank{totalLevel === 1 ? "" : "s"} per skill at level {totalLevel || 1}
      </p>

      <div className="space-y-2">
        {classSkills.length > 0 && (
          <CollapsibleGroup title="Class skills" count={classSkills.length} defaultOpen>
            <div className="space-y-1">{classSkills.map(renderRow)}</div>
          </CollapsibleGroup>
        )}
        <CollapsibleGroup
          title="Other skills"
          count={otherSkills.length}
          defaultOpen={classSkills.length === 0}
        >
          <div className="space-y-1">{otherSkills.map(renderRow)}</div>
        </CollapsibleGroup>
      </div>
    </div>
  );
}
