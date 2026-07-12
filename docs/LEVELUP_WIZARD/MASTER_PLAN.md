# Level-Up Wizard — Master Plan

**Status:** PLANNING (docs-only leg, drafted 2026-07-11). No app code touched. Format follows
`docs/ITEMS_OVERHAUL/MASTER_PLAN.md` and `docs/S6_UX_OVERHAUL/03_CHARACTER_WIZARD.md` — read those
first if you haven't; this doc assumes the same conventions (additive Zod, the M12 compendium
pickers, `useCharacterEditor` as the one save loop, chip+disclosure, "warn/hide, never block",
mobile-first).

## Goals

1. **Level up an existing class** — bump a class the character already has, guided through
   everything PF1e says changes at that level (HP, skills, feats on odd levels, ASI at 4/8/12/16/20,
   new spell slots/known for casters, a favored-class-bonus choice).
2. **Multiclass "like a crazy person"** — add a brand-new class the character doesn't have yet, at
   any point, with the same guided picks.
3. **Prestige classes** — the same guided flow, honestly labeled: PF1e prestige prerequisites are
   **not enforced** (the compendium's `requirements` data doesn't exist to check against — see Ground
   Truth), so the step is guidance + self-assessment, never a gate.
4. **One level-up can cross more than one character level** — a returning player catching up after
   missing sessions (e.g. level 3 → level 7) walks through every milestone crossed (every odd level's
   feat, every multiple-of-4's ASI), not just the final target — never silently skipped.
5. **Reuse, don't fork.** Every mechanical piece this wizard needs beyond ability-score increases
   already exists in the full editor (`ClassRow`'s level-bump regrant, `ClassCompendiumPicker`,
   `ArchetypePicker`, `HpStep`, `FeatPicker`, `SpellPicker`) and in the create wizard's shell
   (`WizardShell`, the `metadata.custom.<x>` flag pattern, the save/undo/conflict/exit machinery). This
   plan's job is chrome + sequencing + the one genuinely missing piece (ASI), not new game math.

---

## Ground truth — what exists today (verified against the repo)

### The create wizard architecture this reuses (`components/character/wizard/`)

`wizard-shell.tsx` is a **client** component driving one `useCharacterEditor` session
(`CharacterEditorApi` — `draft`, `computed`, `status`, `error`, `canUndo`, `conflict`, `update`,
`undo`, `resolveConflict`; debounced autosave, CAS + 3-way merge, offline outbox — "do not fork
this," per `docs/S6_UX_OVERHAUL/03_CHARACTER_WIZARD.md`). It renders a `DesktopSpine`/`MobileSpine`
step indicator, a `ConflictResolver` when `ed.conflict` is set, the current step's panel inside a
`motion.div` (entrance-on-change only, never on first mount — the editor-canvas idiom), and a
`WizardFooter` (Back / Skip / Next, a **visible** gate-hint paragraph with `aria-live`/
`aria-describedby` — never a `title` tooltip, which is unreachable on a disabled button for touch/SR
users).

**The hardcoded part (this plan's Phase 1 generalization target):**

```ts
// wizard-shell.tsx — every one of these is a module-level Record<WizardStepKey, …>
const STEP_LABELS: Record<WizardStepKey, string> = { welcome: "Welcome", … };
const STEP_HELP: Record<WizardStepKey, string> = { … };
const STEP_RENDER: Record<WizardStepKey, (props: WizardStepProps) => ReactNode> = { … };
const STEP_GATES: Partial<Record<WizardStepKey, (ed) => boolean>> = { race: canAdvanceRace, … };
const STEP_GATE_HINTS: Partial<Record<WizardStepKey, string>> = { … };
const STEPS: WizardStepDef[] = WIZARD_STEP_KEYS.map((key) => ({ key, label: STEP_LABELS[key], … }));
```

`STEPS` is built **once, at module scope**, by mapping over `WIZARD_STEP_KEYS` — a `const` tuple
imported from `packages/pathforge-schema/src/wizard.ts`. `goTo(nextIndex)` clamps into `STEPS`,
writes `writeWizardMeta(c, { step: key })` via `ed.update`, and that's the entire navigation model.
There is **no concept of a step being absent for a given session** — every session sees the same 11
steps in the same order; only `skippable` (always true except the bookends) varies. This is the one
piece of real generalization work the level-up wizard needs — see
[Shell generalization design](#shell-generalization-design).

`wizard.ts` — the per-character progress flag, living entirely inside the existing free-form
`metadata.custom` bag (`z.record(z.string(), z.unknown())`, `meta.ts`) — **zero schema change, zero
migration** for the create wizard's own flag:

```ts
export const WIZARD_STEP_KEYS = ["welcome","systems","abilities","race","class","skills","feats","hp","gear","details","done"] as const;
export const WIZARD_ORDER_VERSION = 2; // bump on any reorder/insert — see resumeStepFor
export const wizardMetaSchema = z.object({
  active: z.boolean(), step: z.enum(WIZARD_STEP_KEYS),
  startedAt: z.string(), completedAt: z.string().optional(), order: z.number().optional(),
});
export function resumeStepFor(meta): WizardStepKey { /* walk forward past steps inserted after the checkpoint's order */ }
export function readWizardMeta(character): WizardMeta | null { /* safeParse, null if never touched */ }
export function writeWizardMeta(character, patch): WizardMeta { /* merge + re-stamp order */ }
```

`resumeStepFor`'s whole reason to exist: a checkpoint written under an **older** step order can't
resume by raw key, because steps inserted before its position would be silently skipped forever (the
shell only walks forward). This exact idiom — "a stored key may no longer be reachable in the
CURRENT step sequence; walk forward to the nearest one that is" — is the precedent the level-up
wizard's **visibility** filtering (steps that come and go per-session, not per-app-version) reuses
directly. See [Conditional steps](#conditional-steps--the-novel-shell-problem).

`handoff-step.tsx` — the exit pattern every terminal step follows: flip the flag
(`writeWizardMeta(c, { active: false, completedAt: … })`) via `ed.update`, then wait for
`ed.status` to reach `"saved"` or `"offline"` before `router.push`, with a 4-second fallback timer —
**except** when `ed.status === "conflict"`, which holds navigation indefinitely (no fallback) because
leaving would strand the unsaved merge. `character-wizard.tsx` (the root client component) calls
`useCharacterEditor` exactly once and picks `initialStep` via `resumeStepFor(meta)`, never the raw
stored key.

**Routing + entry-point precedent**
(`app/(app)/characters/[characterId]/wizard/page.tsx`,
`app/(app)/characters/new/page.tsx`, `lib/actions/characters.ts`):

- The page loads via the shared `loadCharacterForEdit`, checks `readWizardMeta(character)?.active`;
  if inactive, it does **not** redirect away (a 2026-07-11 follow-up fix — the old behavior made the
  URL a dead end) — it renders a small interstitial with a `reopenWizardAction.bind(null,
  characterId)` form button, and a "Back to the editor" link.
- `reopenWizardAction` (`lib/actions/characters.ts:158`) is the exact template for a level-up
  "start/reopen" server action: `"use server"`, read `sheet_data`+`sheet_version` through the
  **RLS-scoped** client (non-owner reads come back empty, no separate ownership check needed),
  `safeParseCharacter`, `writeWizardMeta(parsed.character, { active: true })`, then a
  **compare-and-swap** update (`.eq("sheet_version", data.sheet_version)`) — a CAS miss (a concurrent
  save landed between read and write) falls back to `/edit` rather than redirecting into a flag that
  may not have actually flipped.
- `createCharacterAction` stamps `writeWizardMeta(sheet, {...})` **before** the initial DB insert
  when the player chose "Guided setup" on `/characters/new` — i.e. the flag can be seeded either at
  creation (client chose guided) or after the fact via `reopenWizardAction`'s pattern.
- The character overview's owner-only actions bar
  (`app/(app)/characters/[characterId]/page.tsx:99-117`) already renders `History` / `Export` /
  `Edit` as `<Button asChild><Link href={...}>` — this is where a **Level Up** button belongs.

### The level-up machinery that ALREADY EXISTS (this is the big finding)

**A single class's level-up is already fully built** — it just lives inline inside `ClassRow`
(`components/character/editor/character-editor.tsx:2585+`), not behind any guided flow. Bumping the
`Level` `NumberField` does, in one `onChange`:

```ts
onChange={(v) => {
  const oldLevel = cl.level;
  set((t, c) => {
    t.level = v;
    // re-clamp FCB tally to the new level
    syncLevel(c);           // totalLevel = gestalt ? gestaltLevel(c) : Σ class levels
    syncFcbHp(c);
    if (resolveClassPreset(t)) recomputeClassDerived(c, { hpMethod: "manual" });
  });
  if (cl.compendiumId && v > oldLevel) {
    const exclude = (cl.archetypes ?? []).flatMap((a) => a.replaces);
    void regrantFeatures(cl.compendiumPreset?.name ?? cl.name, cl.id, oldLevel, v, exclude, cl.compendiumId);
  }
}}
```

`regrantFeatures` fetches the class's `class_feature_compendium` rows (or synthesizes them from a
3pp progression's "Special" column via `fetchFeatureRows`) and calls
`grantClassFeatures(c, { features, fromLevel: oldLevel, toLevel: v, exclude })`
(`packages/pathforge-rules-pf1e/src/class-builder.ts:36`) — which **dedups by `compendiumId`**
(`have.has(row.id)`), so re-running it is idempotent; a level-down leaves already-granted features in
place (by design, per the function's doc comment).

`recomputeClassDerived` (`packages/pathforge-schema/src/class-catalog.ts:366`) is a **full recompute
from scratch**, not an additive patch — "so re-applying never double-counts." It handles gestalt
(best-of-two-tracks, `Math.max`, with a `gestaltTracksCollapsed` warning + `character.identity.
totalLevel = gestaltLevel(character)` when gestalt is on), keeps every caster's `casterLevel` in sync
with its class level, and — when `hpMethod !== "manual"` — recomputes Max HP via
`computeMaxHpFromLevels` (gestalt-aware, best-of-two-tracks there too).

**`applyCompendiumClass`/`applyClassPreset` are OVERWRITE, not additive** — a critical semantic for
this plan: `applyClassPreset` does `row ? row.level = level : classes.push({...})`
(`class-catalog.ts:476-492`), and `applyCompendiumClass` matches an existing row by
`compendiumId`/`presetKey` the same way (`class-builder.ts:94-98`). Selecting your OWN class again in
`ClassCompendiumPicker` and clicking Apply **sets** its level to whatever the `level` field currently
holds — it does not add. This is exactly right for "level up to N," but it is a **live gotcha for
reuse**: `ClassCompendiumPicker`'s `level` state (`class-compendium-picker.tsx:106`) initializes to
`1` and is **never reset or pre-filled from an existing owned class row** on `select()` — there is no
code anywhere in that component that checks `ed.draft.identity.classes` for a match. Selecting an
already-owned class today and clicking Apply with a stale/default `level` value would silently **lower
or misset** the class's level. **This must be fixed before the level-up wizard's Class step can reuse
this picker for "level an existing class" safely** — see [Risks](#risks) and Stage 3.

**Prestige classes** already have a full path: `ClassCompendiumPicker`'s `mode: "base" | "prestige"`
Segmented queries a **separate table** (`prestige_class_compendium` / `search_prestige_class_
compendium`, not `class_compendium`) and applies via the same `applyCompendiumClass` with
`suppressCaster: true` ("a prestige class advances an existing caster — '+1 level of existing
class' — not a new one"). The `requirements` column exists on the row (`lib/supabase/
types.ts:1827`) but — per the M12 Phase 6 status (CLAUDE.md) — **every one of the 118 rows' value is
effectively unusable for auto-gating**; Phase 6 shipped "honest scope given the data: no auto-gating
(show the description for self-assessment); no prestige feature table." The level-up wizard's
Prestige branch inherits this as-is — no new prereq-checking work is possible without new data.

**Archetypes** — `ArchetypePicker` (`components/character/editor/archetype-picker.tsx`) takes a
`lockedClassId` prop and is already invoked per-class from both `ClassRow` and the create wizard's
`ClassStep` (`ClassArchetypeRow`) — directly reusable, unmodified, if the level-up flow wants an
"apply an archetype" affordance (not required for MVP scope, see Staged rollout).

**`HpStep` (`components/character/wizard/steps/hp-step.tsx`) is level-up-ready essentially as-is.**
`computeMaxHpFromLevels` always recomputes from **all** of a class's **current total levels**, not
incrementally — so re-running it after a level bump just yields a new total; there's no "add this
level's HP" special case to build. The component already has: a Method toggle (Average/Max, "the very
first character level always takes the full Hit Die regardless of the method" — correctly stays true
whether that's session level 1 or the wizard is invoked at character level 12), a Gestalt-collapsed
guard (disables Apply, points at the Class step), a manual-override field, and a **complete
favored-class-bonus editor** — checkbox + `+1 HP ×N` / `+1 Skill ×N` steppers, jointly clamped to
`cl.level` (`Math.min(Math.max(0, hp), cap)`, `cap = t.level`). Because the cap is `t.level` (whatever
the class's level is NOW), gaining a level automatically raises the cap by however many levels were
gained — **no new FCB code needed for level-up**, the exact same component works whether the class
just went from 0→1 or from 11→12.

**Skill ranks are NOT engine-enforced** — confirmed by the create wizard's own `SkillsStep` doc
comment: *"There's no engine-exposed overall skill-point budget to show (only the optional Background
Skills variant has one) — ranks-spent + the level-based per-skill cap ('max {totalLevel}/skill') is
the honest substitute."* `skillRanksForLevel(perLevel, intMod, level) = Math.max(1, perLevel + intMod)
* level` (`class-catalog.ts:239`) is **cumulative through `level`**, advisory only, "never
auto-distributed" (per `applyClassPreset`'s own comment) — diffing it at two levels
(`skillRanksForLevel(…, newLevel) − skillRanksForLevel(…, oldLevel)`) gives exactly "ranks gained this
level-up" with zero new engine code.

**Feat prerequisites** are checked, never blocking: `evaluatePrerequisites`
(`packages/pathforge-rules-pf1e/src/prerequisites.ts:87`) takes a `PrereqContext` built live from
`ed.draft`/`ed.computed` (feat names, ability scores, BAB, total level, caster level, skill ranks) and
returns `met | unmet | manual` per requirement (`reqType`s: feat, ability, skill, bab, level,
caster_level). `feat-picker.tsx`'s `usePrereqContext` is the exact reusable hook. There is **no feat
count/budget tracked anywhere** in the engine (confirmed: no `featBudget` field, no cap enforcement) —
core PF1e's "1 feat at level 1, +1 every odd level" is **pure UI-hint math**, same honesty as skill
ranks.

**Ability Score Increases are UNMODELED.** `character.progression.levelPlan[].abilityScoreIncrease:
z.string().optional()` exists on the schema (`packages/pathforge-schema/src/identity.ts:133`) and is
backfilled by `factory.ts` — but grepping the whole repo turns up **zero** reads of `levelPlan` or
`abilityScoreIncrease` outside the schema/factory/docs. No component renders it, no engine function
consumes it — it is exactly the kind of dead, typed-but-never-wired field the 2026-06 sheet-depth
audit was built to find (this one predates that audit and was simply never picked up). It is **not a
usable ASI mechanism** and this plan must design a real one.

**The precedent to mirror exists one system over: Mythic ability boosts** (V1·3·3, shipped). Schema
(`packages/pathforge-schema/src/mythic.ts:32`):

```ts
export const mythicAbilityBoostSchema = z.object({ id: z.string(), tier: z.number().int(), ability: z.string() });
// on mythicBlockSchema: abilityBoosts: z.array(mythicAbilityBoostSchema).default([])
```

Engine (`packages/pathforge-rules-pf1e/src/compute.ts:380-392`), gated behind
`isModuleKeyEnabled(character, "mythic")`:

```ts
for (const boost of character.mythic?.abilityBoosts ?? []) {
  const mod = modifierEntryToMod("Mythic ability increase", { id: `mythic-boost-${boost.id}`, label: "Mythic ability increase", value: 2, enabled: true });
  if (mod) push(classifyTarget(`abilities.${String(boost.ability).toLowerCase()}`), mod);
}
```
Comment: *"Untyped so multiple boosts to one ability stack (RAW: cumulative) and cascade like any
other ability change."* `computeAbilities` (`compute.ts:82`) folds every `ability.<key>` index entry
into `applyStacking(typedMods).total`, which feeds `effectiveScore`. UI precedent:
`components/character/editor/mythic-editor.tsx:39-43` — an ability `<select>` + "Add" button pushing
`{ id: newId("mboost"), tier: m.tier, ability: boostAbility }`, rendered as a removable chip list.

This is a **complete, working template** for core ASI — value `+1` instead of `+2`, **no module
gate** (core PF1e, always-on, unlike Mythic), and a level instead of a tier. See
[The flag design](#the-flag-design) is unrelated to this — the ASI *data* design is under
[PF1e rules encoded as gates/hints](#pf1e-level-up-rules-encoded-as-gates--hints).

### Gestalt interplay (already engine-correct; the wizard must not regress it)

`isGestalt`, `gestaltLevel`, `gestaltTracksCollapsed`, `gestaltTrackClassCounts`,
`splitGestaltTracks` (`packages/pathforge-schema/src/gestalt.ts` + `class-catalog.ts`) are the fixed
2026-07-07 machinery (`[[pathforge-gestalt-collapse]]`): a gestalt class row defaults to track A
(`track: undefined`), and if every class on the sheet is still on one track, `recomputeClassDerived`'s
`Math.max(trackA, emptyTrackB)` silently returns track A's **sum**, not the best-of. The create
wizard's `ClassStep` already has a full, reusable `GestaltHint` component: warns when
`gestaltTracksCollapsed`, offers a one-click `splitGestaltTracks` + HP-heal (`autoMethod` detects
whether the current Max HP matches a clean average/max recompute before re-applying it, so it doesn't
clobber a hand-entered value), and reminds a single-class gestalt session to add track B. **This
component is directly reusable, unmodified**, in the level-up wizard's Class step.

### Companion / familiar interplay

`HpStep` already guards the master-linked-familiar case: `familiarLinked = ed.draft.companion?.type
=== "familiar" && ed.computed.summary.companion?.synced === true` renders a read-only explanation
instead of an editable HP control, because a synced familiar's Max HP is *derived* (half the master's)
and any stored value is silently ignored while linked. The level-up wizard needs the **same guard on
its Class/HP steps** for a synced familiar (its levels/HD track the master via `companion-sync.ts`,
not independent class levels) — cohorts and non-familiar companions (which "keep the PC race/class
picker" per the companion-system notes) are unaffected and level normally through this wizard like any
PC.

### Undo / save-loop guarantees (inherited for free)

`useCharacterEditor`'s undo is a **session-local** stack (`MAX_UNDO`-capped, `undoStack.current`,
never persisted) — every `ed.update` call, from any step, pushes one entry automatically. The
level-up wizard gets Undo across every step with zero new code, the same way the create wizard does.
One pre-existing, not-new quirk: `ClassRow`'s level bump is **two separate writes** (a synchronous
`ed.update` for level/HP/BAB, then an async `regrantFeatures` that does its own `ed.update` once the
compendium fetch resolves) — a single Undo after a level bump only reverts the second write. This is
already true in the full editor today; the level-up wizard inherits it unchanged, not a new risk.

### Milestone Leveling (unrelated, adjacent)

`summary.milestoneLeveling.readyToLevel` (an **optional** system — job-reward XP thresholds,
`isModuleKeyEnabled(character, "milestone_leveling")`) is a good cross-link ("Ready to level up!") on
the entry-point button when the module is on, but is not a gate or a dependency — the level-up wizard
must work identically for XP-tracked, milestone-tracked, and untracked characters.

---

## The flag design

Mirrors `wizard.ts` closely but is a **separate, independently-versioned module** — not a
generalization of `wizardMetaSchema` into one polymorphic bag. Rationale: the two flags' shapes
already diverge on day one (level-up needs `fromLevel`/`targetLevel`/`classId` fields the create
wizard never needed), and a shared `order`/`WIZARD_ORDER_VERSION` would let a future create-wizard
reorder accidentally invalidate in-flight level-up checkpoints or vice versa — two small, independent
modules is lower-risk than one generic one two features immediately need to diverge from.

`packages/pathforge-schema/src/level-up.ts` (new file, same shape family as `wizard.ts`):

```ts
export const LEVEL_UP_STEP_KEYS = [
  "class",   // level existing / add new / prestige
  "hp",      // reuses hp-step.tsx's HpStep verbatim (incl. FCB)
  "skills",  // reuses skills-step.tsx's SkillsStep verbatim
  "feats",   // NEW visibility gate — see below
  "asi",     // NEW step + NEW schema — see below
  "spells",  // NEW step — casters only
  "review",  // NEW — summary + Finish (handoff-step.tsx's shape, level-up copy)
] as const;
export type LevelUpStepKey = (typeof LEVEL_UP_STEP_KEYS)[number];

export const LEVEL_UP_ORDER_VERSION = 1;

export const levelUpMetaSchema = z.object({
  active: z.boolean(),
  step: z.enum(LEVEL_UP_STEP_KEYS),
  /** Character level when this session STARTED — the baseline every gate/budget diffs against. */
  fromLevel: z.number().int(),
  /** Character level this session is walking the player to. May be > fromLevel + 1 (catch-up). */
  targetLevel: z.number().int(),
  /** Max HP at fromLevel — lets the HP step show a "+7 this level-up" delta instead of just a total. */
  startingMaxHp: z.number().int().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  order: z.number().optional(),
});
export type LevelUpMeta = z.infer<typeof levelUpMetaSchema>;

// readLevelUpMeta / writeLevelUpMeta / resumeLevelUpStepFor — same three functions, same contract,
// as wizard.ts's trio. resumeLevelUpStepFor additionally has to skip a stored step that's no longer
// VISIBLE for this session (see Conditional steps) — a superset of resumeStepFor's "walk forward past
// an inserted step," reusing the identical sequential-key-list idiom.
```

Lives in `metadata.custom.levelUp` — same free-form bag, same zero-migration guarantee `wizard.ts`
already established.

**Interplay when both flags could be active.** `metadata.custom.wizard.active` and
`metadata.custom.levelUp.active` are **mutually exclusive by construction**, not by a new runtime
check: the create wizard's entry points (`/characters/new`, `reopenWizardAction`) only ever touch a
character that either has no classes yet or is being explicitly reopened by its owner; the level-up
entry point (the character overview's "Level Up" button) is reachable from any character page
regardless of wizard history. The realistic collision is narrow — a player reopens the create wizard
on a character that ALSO has an in-progress level-up. Cheapest correct answer, no new schema: the
level-up entry-point server action (`startLevelUpAction`, mirroring `reopenWizardAction`) checks
`readWizardMeta(character)?.active` first and, if true, does **not** start a level-up session —
redirects to `/characters/[id]/wizard` instead with a one-line explanation ("Finish guided setup
first"). Symmetrically, `reopenWizardAction` gains the same one-line check the other direction. Both
checks are pure reads of the already-parsed sheet already in hand — no extra query, no schema change.

---

## Shell generalization design

**Recommendation: generalize `WizardShell` to take `steps` (+ per-step `visible`) as props, used by
BOTH wizards — not a sibling `LevelUpWizardShell`.**

Rationale against a sibling shell: the codebase's standing discipline is explicit about not forking
mechanisms it's already built once — see the Items plan's "Do not fork the mechanism" (weapon↔attack
linked sync) and the spawned "DRY the buff/automation effect-row UI" follow-up (two effect-row UIs had
already drifted). `WizardShell`'s chrome is ~250 lines: `DesktopSpine`/`MobileSpine` (progress dots,
`SaveStatusBadge`), the `ConflictResolver` wiring, the entrance-animation adjust-on-render idiom
(`prevKey`/`hasChanged`, matching `editor-canvas.tsx`'s pattern — replay on step CHANGE, never on
first mount), and `WizardFooter`'s a11y-correct gate-hint plumbing
(`aria-live`/`aria-describedby`, the `disabled:pointer-events-none` tooltip trap already fixed once).
A duplicate shell means every future motion/a11y polish pass (there have been several — S6, the
motion system, the mobile-nav overhaul) needs two edits, and the two will drift the same way the
effect-row UIs did.

**Concrete change, additive to the existing call site:**

```ts
// wizard-shell.tsx — signature grows, old behavior fully preserved by the create wizard's own call
export type WizardStepDef = {
  key: string;
  label: string;
  help: string;
  skippable: boolean;
  canAdvance?: (ed: CharacterEditorApi) => boolean;
  /** NEW. Absent = always visible (every existing create-wizard step). When present and false, the
   *  step is omitted from the spine, from Next/Back sequencing, and from resume — but its RENDER
   *  function and any data it wrote are untouched; re-satisfying the predicate (e.g. the player adds
   *  a caster on the Class step) makes it reappear with whatever was already on the draft. */
  visible?: (ed: CharacterEditorApi) => boolean;
  render: (props: WizardStepProps) => ReactNode;
};

export function WizardShell({
  ed, characterId, steps, initialStep, metaKey, writeMeta,
}: {
  ed: CharacterEditorApi;
  characterId: string;
  steps: WizardStepDef[];          // the FULL ordered list; filtering happens inside on every render
  initialStep: string;
  metaKey: "wizard" | "levelUp";   // which metadata.custom.<key> goTo() writes step into
  writeMeta: (c: PathForgeCharacterV1, patch: { step: string }) => void; // writeWizardMeta or writeLevelUpMeta
}) { … }
```

The create wizard's own `wizard-shell.tsx` module-level `STEP_LABELS`/`STEP_HELP`/`STEP_RENDER`/
`STEP_GATES`/`STEP_GATE_HINTS` tables move, unchanged in content, into a new
`create-wizard-steps.ts` that builds `CREATE_WIZARD_STEPS: WizardStepDef[]` (no `visible` on any
entry — 100% behavior-identical, confirmed by the existing wizard's own test/browser-verification
coverage carrying over unchanged). `character-wizard.tsx` passes `steps={CREATE_WIZARD_STEPS}
metaKey="wizard" writeMeta={writeWizardMeta}`. A new `level-up-steps.ts` builds
`LEVEL_UP_STEPS: WizardStepDef[]` with `visible` predicates on `feats`/`asi`/`spells` (see next
section), consumed by a new `level-up-wizard.tsx` root client component (the `character-wizard.tsx`
shape, `useCharacterEditor` once, `resumeLevelUpStepFor` for `initialStep`).

Inside `WizardShell`, one line changes the filtering:
```ts
const visibleSteps = steps.filter((s) => !s.visible || s.visible(ed));
```
computed fresh every render (cheap — every predicate here is a handful of array lengths/comparisons
against already-computed `ed.computed`/`ed.draft` values, no new work). `goTo`/`stepIndex` operate on
`visibleSteps`, not `steps` — Back/Next/the spine dot count/the mobile "Step N of M" copy all
naturally reflect only what's relevant to this session. **Order itself never changes** — only
presence — so there is no reordering-instability class of bug to guard against, just the same
"a stored step key might not be in today's sequence" problem `resumeStepFor` already solved once.

**Resume-with-visibility.** `resumeLevelUpStepFor(meta, ed)` (unlike `resumeStepFor`, which only
consults the static order-version) additionally takes `ed` to evaluate `visible` predicates: find the
stored `step`'s position in `LEVEL_UP_STEP_KEYS`, walk forward to the first key that is (a) at or
after that position and (b) currently visible. This covers both directions safely — a step that
became visible after the checkpoint was written (player added a caster, then refreshed) is reachable
on the next forward walk; a step that's no longer visible (player removed the class that made ASI
eligible — see Risks) is skipped rather than rendering an empty/nonsensical panel.

---

## The step list

| Key | Reuses | New work | Visible when |
|---|---|---|---|
| `class` | `ClassCompendiumPicker` (base+prestige mode), `ArchetypePicker`, `GestaltHint` — all verbatim | The picker's existing-class level pre-fill fix (Risks); a thin wrapper choosing Level-existing / Add-new / Prestige | always |
| `hp` | `HpStep` **verbatim, unmodified** | A "+N this level-up" delta line (reads `meta.startingMaxHp`) | always |
| `skills` | `SkillsStep` **verbatim, unmodified**; `skillRanksForLevel` diffed old→new | An advisory "N new ranks available" summed across every class that gained a level this session | always |
| `feats` | `FeatPicker`, `EntryPicker` (traits), `DrawbackPicker` — verbatim (`FeatsStep`'s composition) | A count badge ("2 feats available") computed from the odd-level formula, not per-level slots | `featsOwed(targetLevel) − featsOwed(fromLevel) > 0` |
| `asi` | `mythic-editor.tsx`'s ability-boost UI pattern (select + Add + removable chips) | **New schema** (`abilities.abilityIncreases`) + **new engine loop** (mirrors the Mythic one, unconditional) + new step component | `Math.floor(targetLevel/4) − Math.floor(fromLevel/4) > 0` |
| `spells` | `SpellPicker` (compendium picker, `{ed, onClose}` — same convention as every other picker) | **No direct wizard-step precedent** (the create wizard has no Spells step at all) — new wrapper, class/level-aware wiring | `ed.computed.spellcasting.length > 0` |
| `review` | `handoff-step.tsx`'s shape (`StatChip` summary, Finish button, saved/offline navigation wait, conflict-holds-exit) | Level-up-specific copy + a before/after stat comparison (HP/BAB/saves delta) | always (terminal) |

Every step is additionally **always skippable** (mirrors the create wizard: "Skip this step" is
never gated, only Next is) — a hidden-but-technically-still-in-the-list step never blocks Finish.

### PF1e level-up rules encoded as gates / hints

Stated explicitly, per the task's ask — every one of these is an **advisory UI hint**, matching the
codebase's established "warn, never block" discipline (Akashic slot collisions, buff stacking
conflicts, the whole Items epic's slot warnings) — nothing here is schema- or engine-enforced as a
hard rule, because PF1e tables run enormous homebrew and a validation error on save would be a
regression against that design language:

1. **+1 Hit Die / HP per class level** — `computeMaxHpFromLevels`, already engine-correct
   (first-level-full-die, average/max thereafter, + Con mod floored at 1/HD, + FCB). No new rule
   logic; `HpStep` already surfaces it.
2. **Skill ranks per level** = class's `skillRanksPerLevel + Int mod` (min 1), **+2/level** more under
   the Background Skills variant when `isModuleKeyEnabled(character, "background_skills")` (already
   modeled — `summary.backgroundSkills`, `SkillsStep` already branches on it). Advisory only, per
   Ground Truth — never enforced, never auto-spent.
3. **Feats at every ODD character level** (1, 3, 5, 7, …) — `featsOwed(level) = Math.ceil(level / 2)`
   for `level ≥ 1`, else 0. The `feats` step's visibility/badge is
   `featsOwed(targetLevel) − featsOwed(fromLevel)`. Class-granted bonus feats (e.g. Fighter) are
   **already handled automatically** by the existing `grantClassFeatures` call on the Class step —
   they show up as `class_feature` rows with no separate feat-picker action needed; this formula is
   purely about the core "any class" feat progression.
4. **Ability Score Increase at levels 4, 8, 12, 16, 20** — `+1` to one ability of the player's choice,
   cumulative, untyped (RAW: not a competing "bonus," a permanent addition to the score — same
   RAW-cumulative language the Mythic ability-boost comment already uses). Unclaimed count =
   `Math.floor(targetLevel / 4) − Math.floor(fromLevel / 4)` (equivalently,
   `Math.floor(targetLevel/4) − (abilities.abilityIncreases?.length ?? 0)` once the array exists as
   the source of truth rather than re-deriving from levels — see schema below). **No module gate** —
   unlike Mythic tier boosts, this is core PF1e, always-on.
5. **New spell levels/known** — casters gain new spell slots automatically once `computeSpellcasting`
   re-derives from the bumped `casterLevel` (already synced by `recomputeClassDerived`'s per-caster
   loop); "spells known" for spontaneous casters is a **player pick**, which is exactly what
   `SpellPicker` already exists to do — the level-up wizard's Spells step is "open `SpellPicker`
   for every caster whose `casterLevel` changed this session," not new spellcasting math.
6. **Favored-class bonus choice, once per level gained** — already modeled per-class as a running
   tally (`favoredClassBonus.hp` / `.skill`), capped at the class's current `level` — gaining a level
   raises the cap, and `HpStep`'s existing stepper UI is already the correct, complete editor for it
   (no separate "FCB step" needed — see the note in Staged rollout about the owner's sketch ordering
   this after Spells; this plan recommends keeping it bundled with HP, first, as `HpStep` already
   does, since splitting one working component into two step positions is pure UX-sequencing work for
   zero new function — flag for an owner redline if a later position is preferred).
7. **BAB / saving throws / initiative / attack values are 100% engine-computed** and never get a
   manual step — `recomputeClassDerived` handles BAB/saves, the resolver handles initiative/attacks —
   exactly the create wizard's own stated principle (`handoff-step.tsx`'s comment: "saving throws,
   initiative, and attack values are engine-computed — they review on the Finish card, not a manual
   step"). The level-up wizard's `review` step is where these are reviewed, same as the create
   wizard's `done` step.
8. **Prestige prerequisites are NOT auto-checked** — the `class` step's Prestige mode must say so
   plainly (a static banner, not a computed gate): "Prerequisites for prestige classes aren't in our
   data yet — check your character meets them before committing." This is not a gap this plan can
   close; the compendium's `requirements` text exists but isn't structured/parseable data (per the
   M12 Phase 6 status), and no amount of wizard chrome fixes that.

---

## Conditional steps — the novel shell problem

This is the one piece of real design work beyond "wrap an existing picker in a step." The create
wizard has no precedent for a step that's absent for some sessions — every one of its 11 steps always
renders (only the CONTENT is empty/short for an edge case, e.g. zero classes on the Skills step). The
level-up wizard genuinely needs `feats`/`asi`/`spells` to not exist in the flow at all for a session
where they don't apply (a level-2 level-up has no feat, no ASI, and — for a non-caster — no spells).

**Design, building on [Shell generalization](#shell-generalization-design):**

1. **Visibility is a pure predicate over `ed`, re-evaluated every render** — the same shape as
   `canAdvance` gate predicates (`(ed) => boolean`, reading `ed.draft`/`ed.computed`, never inventing
   a new engine primitive). It is **not** frozen at session-start: if the player is on the Class step
   and adds a class that grants spellcasting, the Spells step should appear later in the same session
   without a restart — this is why it re-evaluates every render rather than being computed once into
   `metadata.custom.levelUp` at start.
2. **Hidden ≠ unreachable — "hidden" only means "not in the default Back/Next walk."** A step whose
   predicate is currently false is dropped from the spine and skipped by `goTo`'s forward/backward
   stepping, but the underlying data it would edit (an extra feat pick, an extra ASI) is never
   something the player is BLOCKED from wanting — PF1e homebrew tables routinely grant an extra feat
   or stat bump a formula wouldn't predict. The `review` step therefore always renders one small
   "Anything else?" disclosure section — three ghost-styled buttons ("+ Add a feat", "+ Increase an
   ability score", "+ Manage spells") that open the SAME step components inline (not a navigation
   jump — mirrors how the Modern editor's chip+disclosure pattern opens a picker in place) regardless
   of what the visibility predicates decided. This is this plan's own original design (no direct
   precedent in the repo) — flagged explicitly as **the one UX judgment call in this plan that
   deserves an owner redline pass** before Stage 5 build, the same honesty the Items plan gave its own
   paper-doll mockup ("no reference image was available … treat it as a strong starting point to
   redline, not gospel").
3. **Resume reuses `resumeStepFor`'s sequential-key-list idiom, extended with the visibility check**
   (`resumeLevelUpStepFor`, spelled out in [The flag design](#the-flag-design)) — no new resume
   mechanism, just one more condition on the same forward walk.
4. **The spine (`DesktopSpine`/`MobileSpine`) renders only `visibleSteps`** — so a level-2 level-up
   literally shows "Class → HP → Skills → Review" as its 4-dot progress, not a padded 7-dot list with
   3 dots that immediately vanish. This is a direct, load-bearing consequence of filtering `steps`
   before deriving `stepIndex`/`isLast`/the dot count inside `WizardShell` (per the generalization
   design above) rather than filtering only at render-time of an individual step.
5. **Multi-level catch-up sessions never lose a milestone.** Because `feats`/`asi` visibility diffs
   `targetLevel` against `fromLevel` (not `targetLevel` against a hardcoded "is this level odd"
   check), a 3→7 jump correctly reports "2 feats available" (levels 5 and 7) and "1 ability increase
   available" (crossing level 4) in ONE pass through those two steps — not per-level UI, just a
   correct COUNT budget the player spends via the same picker N times (identical to how the Skills
   step already sums an advisory budget rather than itemizing per-level rows).

---

## Entry points

- **Character overview action bar** (`app/(app)/characters/[characterId]/page.tsx:99-117`) — a new
  `Button asChild` alongside History/Export/Edit, owner-only (same `isOwner` gate already computing
  `actions` there), reading `Level Up` (or, when `isModuleKeyEnabled(character,
  "milestone_leveling") && vm.milestoneLeveling.readyToLevel`, an emphasized "Ready to level up!"
  variant — cosmetic only, not a gate; the button works identically either way). Posts a new
  `startLevelUpAction(characterId)` server action.
- **`startLevelUpAction`** (`lib/actions/characters.ts`, new) — copies `reopenWizardAction`'s shape
  exactly: RLS-scoped read of `sheet_data`/`sheet_version`, `safeParseCharacter`, the
  create-wizard-active mutual-exclusion check (see The flag design), then
  `writeLevelUpMeta(parsed.character, { active: true, step: "class", fromLevel: parsed.character.
  identity.totalLevel, targetLevel: parsed.character.identity.totalLevel + 1, startingMaxHp: parsed.
  character.health.maxHp, startedAt: new Date().toISOString() })`, a CAS update, then `redirect(
  "/characters/${characterId}/level-up")`. `targetLevel` defaults to `+1` (the common case); the
  `class` step's own UI (see below) lets the player raise it for a multi-level catch-up before
  touching anything else — the flag is corrected via a normal `ed.update` + `writeLevelUpMeta` call
  from inside the step, exactly how the create wizard's steps already mutate their own meta.
- **`app/(app)/characters/[characterId]/level-up/page.tsx`** (new) — the `wizard/page.tsx` shape:
  loads via `loadCharacterForEdit`, checks `readLevelUpMeta(character)?.active`, renders the same
  "closed — reopen or back to editor" interstitial when inactive (a `reopenLevelUpAction` mirroring
  `reopenWizardAction`, so an abandoned level-up is never a dead end either — see Risks), otherwise
  renders `<LevelUpWizard characterId initial initialVersion>`.
- **A secondary entry point from the full editor's Classes section** is explicitly OUT of scope for
  MVP — `ClassRow`'s inline level-bump already exists and works for a player who doesn't want the
  guided flow; adding a "Guide me" link next to it is a trivial follow-up once the wizard exists, not
  a blocker to build it.

---

## Risks

- **The `ClassCompendiumPicker` level-field reuse gotcha (Ground Truth) is a must-fix, not a
  nice-to-have.** Without it, the Class step's "level up an existing class" path can silently reset a
  class's level downward the first time a player selects their own class and the `level` NumberField
  hasn't been touched (defaults to 1). Fix options for Stage 3: (a) add an optional
  `prefillFromExisting?: boolean` prop (additive, mirrors the `baseOnly`/`resetAfterApply` precedent
  set by this exact component already twice) that, on `select()`, checks
  `ed.draft.identity.classes.find(c => c.compendiumId === row.slug)` and seeds `level` from
  `existing.level + (targetLevel - fromLevel)` when found; (b) the level-up wizard's Class step
  wraps the picker with its own pre-selection UI (chips of the character's current classes, tapping
  one calls `select()` then immediately overrides `level`) rather than touching the shared component.
  Recommend (a) — smaller diff, same additive-prop precedent the component already follows twice.
- **"Double-leveling" — the class step must land on exactly `targetLevel`, not more or less.**
  Mitigated with a `canAdvanceClass`-shaped gate, zero new engine code: non-gestalt,
  `ed.draft.identity.totalLevel === meta.targetLevel`; gestalt, both track sums must independently
  reach `targetLevel` (RAW: a gestalt character takes a class from EACH track at every level — the
  gate must not let the player advance having only fed track A). The gate hint text spells out how
  many levels remain to assign and to which track, reusing `STEP_GATE_HINTS`'s existing
  visible-text-not-tooltip pattern.
- **Mid-level-up abandonment must not be a dead end** — this is a solved problem one system over
  (the 2026-07-11 `reopenWizardAction` fix exists *because* the wizard page used to redirect away
  from an inactive flag with no way back). The level-up `page.tsx` must ship with the same
  interstitial + `reopenLevelUpAction` from day one, not as a follow-up fix after an owner reports
  the same dead end twice. A half-finished level-up (e.g. class leveled, feat not yet picked) is
  still a fully **valid** sheet at every intermediate step (same `ed.update`/Zod-validate path every
  other editor write uses) — the risk is purely "the player forgets they owe themselves a pick," not
  schema validity. Mitigation: `metadata.custom.levelUp.active` stays true until the `review` step's
  Finish, so returning to the character surfaces the same reopen path.
- **Gestalt — leveling both tracks, and the existing collapse guard.** Already engine-correct and
  UI-solved (`GestaltHint`, reused verbatim); the level-up wizard's only new obligation is the
  target-level gate above requiring both tracks to move together, not "at least one."
- **Companion/familiar sync must gate the Class/HP steps** exactly as `HpStep` already does for
  `familiarLinked` — a synced familiar's HP (and, by the same logic, any class-level concept) is
  derived from the master, not independently leveled. The level-up entry point itself should simply
  not appear (or should explain itself) on a synced familiar's overview.
- **ASI is genuinely new schema + engine surface** (unlike every other step here) — small
  (`{id, level, ability}[]` + one unconditional compute.ts loop, directly mirroring the Mythic
  ability-boost precedent), but new, so it needs its OWN adversarial review point in Stage 5 the way
  Mythic's ability-boost feature got one, not a pass-through under the Class/HP steps' "verbatim
  reuse, low risk" umbrella.
- **The "hidden but reachable" disclosure design (Conditional steps, point 2) has no direct
  precedent in this codebase** — it is this plan's own judgment call, not a discovered pattern.
  Flagged plainly as the single highest-uncertainty design decision here; get an owner redline before
  Stage 5, the same way the Items plan flagged its paper-doll mockup as a best-effort strawman rather
  than a spec.
- **Prestige false confidence** — the "no auto-gating" banner must be genuinely prominent (not a
  small muted footnote easy to miss), because every OTHER picker in this app (feats, in particular)
  trains the player to expect green/amber prereq chips; prestige's total absence of that signal reads
  as "nothing to check" unless stated outright.
- **3-way merge** — no new risk beyond what the create wizard already carries: every field this plan
  touches (`identity.classes[]` by id, `abilities.abilityIncreases[]` by id once it exists,
  `spellcasting.casters[]` by id) is already an id-merged entity array per `lib/character/merge.ts`,
  so concurrent edits merge at the field level with no new merge logic required.

---

## Staged rollout

Each stage gate-green (`pnpm lint && pnpm test && pnpm typecheck`, prod build) before the next
starts, per an adversarial Workflow review on every substantive stage (standing discipline for every
epic in this codebase).

### Stage 1 — Flag + ASI schema/engine (S)
- `packages/pathforge-schema/src/level-up.ts` (the flag module above).
- `abilities.abilityIncreases: z.array(z.object({ id, level: z.number().int(), ability:
  z.string() })).default([])` on `abilityBlockSchema`.
- The unconditional compute.ts loop (mirrors the Mythic block, no module gate, value `1` not `2`).
- Unit tests: two increases to the same ability stack (cumulative, RAW); `factory.ts` needs no edit
  (`.default([])` backfills, same as every other array field).
- **Review point:** confirm the ASI loop truly has no `isModuleKeyEnabled` gate (it's core, not
  optional — an easy copy-paste mistake from the Mythic precedent) and that `abilityIncreases` merges
  correctly by `id` in the 3-way merge (should be automatic — entity-array detection, no special case
  needed — confirm with a test rather than assuming).

### Stage 2 — Shell generalization (S/M)
- `WizardShell` gains `steps`/`metaKey`/`writeMeta` props + the `visible` filter; `create-wizard-
  steps.ts` extracted, `character-wizard.tsx` updated to pass it — **zero behavior change** for the
  existing create wizard (this is the safety net: if the create wizard's own browser-verified flow
  regresses even slightly, this stage isn't done).
- **Review point:** a real-browser pass through the EXISTING create wizard start-to-finish, confirming
  identical behavior post-refactor (spine, gates, conflict resolver, motion, mobile spine) — this is
  a pure refactor stage and must be provably a no-op for the create wizard before any level-up-only
  code lands on top of it.

### Stage 3 — Class step (M/L)
- The Level-existing / Add-new / Prestige three-way UI; the `ClassCompendiumPicker` prefill fix
  (Risks); the `targetLevel` gate (both non-gestalt and gestalt-both-tracks forms); `GestaltHint`
  reuse; the prestige no-auto-gating banner.
- **Review point:** the level-field prefill fix specifically — verify it cannot ever silently lower
  an existing class's level (test: select an owned class, confirm the field shows the correct
  current-plus-delta value before any player interaction, not a stale default).

### Stage 4 — HP + Skills steps (S)
- Thin wrappers around the EXISTING `HpStep`/`SkillsStep` components (verbatim), each gaining a small
  "this level-up" delta readout (`meta.startingMaxHp`/`meta.fromLevel` diffs) — the lowest-risk
  stage, almost pure composition.
- **Review point:** confirm the delta readouts read `meta`, never re-derive `fromLevel`'s state by
  guessing (the flag is the only source of truth for "where this session started").

### Stage 5 — Feats + ASI steps (M)
- `feats`/`asi` visibility predicates; the Feats step (wraps `FeatPicker`/`EntryPicker`/
  `DrawbackPicker` per `FeatsStep`'s existing composition, with the count badge); the new ASI step UI
  (mirrors `mythic-editor.tsx`'s ability-boost pattern, capped at the unclaimed count).
- **Review point:** the ASI step specifically (new engine surface, per Risks) — confirm the unclaimed
  count formula is correct across single-level AND multi-level-catch-up sessions (a 3→7 jump must
  offer exactly 1 increase, not 0 or 2 — off-by-one on `Math.floor` boundaries is the likely bug
  class).

### Stage 6 — Spells step (M)
- No direct precedent (Ground Truth) — wraps `SpellPicker`, visibility = `ed.computed.spellcasting.
  length > 0`, scoped to casters whose `casterLevel` changed this session.
- **Review point:** confirm a level-up that adds a BRAND NEW caster (e.g. a multiclass dip into a
  casting class) is correctly caught by the visibility predicate on the same render it's added (the
  "re-evaluated every render, not frozen at session start" design point) — this is the step most
  likely to have a stale-closure bug given it's entirely new code.

### Stage 7 — Review/Finish + entry points (S)
- `review` step (handoff-step.tsx shape + before/after stat comparison); the "Anything else?"
  disclosure (Conditional steps point 2 — flagged for an owner redline first); `startLevelUpAction`/
  `reopenLevelUpAction`; the character overview button; the `/level-up` route + interstitial.
- **Review point:** the full mutual-exclusion + reopen-dead-end pair of checks (The flag design) —
  these are exactly the two bug classes (wizard-vs-wizard collision, dead-end URL) already found and
  fixed once on the create wizard; verify both are actually present here, not just assumed carried
  over by similarity.
