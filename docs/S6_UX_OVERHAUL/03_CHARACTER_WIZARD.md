# S6 · Pillar 3 — "Create a character" wizard

Part of the S6 UX overhaul handoff package. Read `docs/S6_UX_OVERHAUL/MASTER_PLAN.md` for the
cross-pillar sequencing + invariants before starting — **this pillar ships LAST**, on top of the
overhauled Modern editor (`02_MODERN_EDITOR.md`). Do not start this
plan until that editor overhaul has landed; every step in this wizard is a thin wrapper around
editor pieces that pillar rebuilds. The companion pillar (`01_COMPANION_SHEETS.md`) ships first and
is unrelated to this file except that the wizard's "what kind of character" step should be aware a
companion-creation path already exists (`createCompanionAction`) and must not collide with it.

**Execution model**: you are Fable 5, the leader. Read this whole file, then break Phases 1-6 below
into tasks and spawn **Sonnet 5** subagents to implement/verify them in parallel where the phase
table marks them independent. Every substantive change ships after an adversarial review (spawn a
reviewer subagent) + the gate (`pnpm lint && pnpm test && pnpm typecheck`, plus `pnpm build` with
`NODE_OPTIONS=--max-old-space-size=7168` — see the stack notes below). Keep schema changes additive
(Zod-only); this plan requires **no DB migration**.

---

## 1. What exists today (ground truth, verified against the repo 2026-07-09)

**Create flow.** `app/(app)/characters/new/page.tsx` renders a bare `Card` with
`components/characters/create-character-form.tsx` — one `name` `<Input>`, a submit button, wired to
`createCharacterAction` via `useActionState`. That server action
(`lib/actions/characters.ts:59`):

```ts
export async function createCharacterAction(_prev, formData) {
  const { supabase, user } = await authedClient();
  const name = ((formData.get("name") as string | null) ?? "").trim() || "New Character";
  const displayName = userDisplayName(user);
  await supabase.from("profiles").upsert({ id: user.id, display_name: displayName }, ...);
  const sheet = createDefaultCharacter({ name, playerName: displayName });
  const computed = computeCharacter(sheet);
  const { data, error } = await supabase.from("characters").insert({ owner_id: user.id, name, ... }).select("id").single();
  if (error || !data) return { error: ... };
  redirect(`/characters/${data.id}`);
}
```

`createDefaultCharacter` (`packages/pathforge-schema/src/factory.ts`) produces a fully
schema-valid, essentially **empty** sheet: abilities all 10, no classes (`identity.classes: []`,
`totalLevel: 0`), no skills ranks, no race, no gear, empty spellcasting/feats/traits/features,
`languages.known: ["Common"]`. This is correct for an experienced player who wants a blank canvas
and will drive the full editor themselves — **keep this path**. The wizard is a second, parallel
on-ramp for a **new player**, not a replacement.

**The edit workspace it hands off to.** `app/(app)/characters/[characterId]/edit/page.tsx` loads
the row (`sheet_data`, `sheet_version`, `parent_character_id`), does the familiar master-cache
refresh, and renders:

```tsx
<CharacterEditor characterId={characterId} initial={result.character} initialVersion={sheetVersion} />
```

`CharacterEditor` (`components/character/editor/character-editor.tsx:199`) owns one
`useCharacterEditor(characterId, initial, initialVersion)` (`ed`), a `SECTION_GROUPS`-driven
Sheet-Sections rail (desktop) / full-screen bottom-sheet navigator (mobile), a Modern⇄Classic
layout toggle, and a Simple/Advanced boolean. Every section is a `{ key, label, render: () => <X ed={ed} /> }`
entry — e.g. `{ key: "details", label: "Character details", render: () => <IdentityEditor ed={ed} /> }`.
**This is the reuse seam the wizard is built on**: every section editor and every M12 compendium
picker already takes exactly `{ ed: CharacterEditorApi; onClose?: () => void }` as its props (confirmed:
`RacePicker`, `ClassCompendiumPicker`, `FeatPicker`, `InventoryEditor`, `SpellcastingEditor`, the
Abilities/Skills/Health/Saves/AC/Combat editors all take `ed` alone or `ed` + `advanced`). A wizard
step is just "render one of these components, alone, full-width, with a Next button" — there is no
new editing surface to build, only new **chrome**.

`useCharacterEditor`'s contract (`components/character/editor/use-character-editor.ts`) —
**do not fork this**:

```ts
export type CharacterEditorApi = {
  draft: PathForgeCharacterV1;
  computed: ComputedCharacter;
  status: SaveStatus;                 // "saved" | "unsaved" | "saving" | "error" | "conflict" | "offline"
  error: string | null;
  canUndo: boolean;
  conflict: ConflictState | null;
  update: (mutate: (draft: PathForgeCharacterV1) => void) => void;
  undo: () => void;
  resolveConflict: (resolved: PathForgeCharacterV1) => void;
};
```

It debounces autosave (900ms) through `saveCharacterSheetAction` with sheet_version CAS + 3-way
merge + offline outbox. The wizard calls `useCharacterEditor` **exactly once**, same as
`CharacterEditor` does, and every step mutates the same `draft` via `ed.update(...)`. This is what
makes "hand off to the full editor" trivial — the wizard and the full editor are two different
**shells** around one save loop; nothing needs to be re-loaded or re-saved specially at handoff.

**The M12 pickers reused verbatim as steps.** Each already does its own compendium search +
preview + apply, and mutates `ed.draft` through `applyRace` / `applyCompendiumClass` /
`seedsToAutomationEffects` (the engine appliers) — the wizard does not re-implement any of that. Two
examples worth internalizing:

- `RacePicker` (`components/character/editor/race-picker.tsx`): search → select → shows ability-mod
  tiles + size/speed + alternate racial traits → `apply()` calls `applyRace(c, {...})` inside
  `ed.update`. It renders as an inline card (`PickerShell` chrome), not a modal — good, that's
  exactly the wizard step shape.
- `ClassCompendiumPicker` (`components/character/editor/class-compendium-picker.tsx`): Base/Prestige
  segmented filter, search, a per-level progression accordion, HP method + caster-type controls,
  `apply()` → `applyCompendiumClass`. Same shape.

**Ability scores today** default to 10/10/10/10/10/10 with an *optional* point-buy calculator
(`packages/pathforge-schema/src/abilities.ts` `pointBuyStateSchema`: `enabled`, `budget` (default
15), `system: "standard"|"custom"`, `minScore`/`maxScore`, `allocations`, `racial`). The engine's
`POINT_BUY_COST` table + `pointBuyCost()` already exist in `@pathforge/rules-pf1e`
(`point-buy.ts`). **The wizard's Abilities step is: turn `pointBuy.enabled = true`, default
`budget: 15`, and render whatever the editor overhaul's Abilities panel exposes** (find it via
`AbilitiesEditor` in `character-editor.tsx` today, or its S6-overhauled successor) — do not build a
second point-buy UI.

**Starting gear.** `class_compendium.starting_wealth` (confirmed column,
`lib/supabase/types.ts`) already carries a starting-wealth string (e.g. "5d6 × 10 gp") per class row
— use it to suggest (not silently apply) starting gold on the Gear step; the player still picks
items via `InventoryEditor`.

**Companions are out of scope here** but note the pattern for consistency: `createCompanionAction`
creates a **second character row** (`parent_character_id` link). The wizard creates exactly one
character row, same as today's flow — a companion is added afterward from the character overview's
`CompanionsCard`, not from this wizard.

**Design reference**: `docs/mockups/pathforge_mockups/` holds the existing static mockups (numbered
`pathforge_0X_*.svg/png`) that the rest of the app was built against — that's the visual language
(obsidian/parchment/high_contrast tokens, gold accents, rune-blue highlights, `<GameIcon>`, 44px tap
targets). **There is no wizard mockup yet.** Phase 0 below produces
`docs/S6_UX_OVERHAUL/mockups/wizard.html` — a static, non-interactive HTML page (same convention as
the `pathforge_0X_*` set, but source-controlled as HTML instead of Figma-exported SVG so it's
diffable) showing the step spine, one representative step (Class, since it has the richest content:
progression accordion + search), and the final handoff screen, across desktop + mobile widths. Build
every subsequent step against that mockup, not against your own taste.

---

## 2. Locked shape

**A `newPlayer` flag drives a guided step flow**: Welcome → Race → Class → Abilities → Skills →
Gear → Details → Handoff. Each step is a thin wrapper that mounts an **existing** section
editor/picker (post-overhaul versions where the overhaul touches them) with the chrome trimmed to
one panel, "Recommended" defaults pre-filled, inline plain-language help, and a progress spine.
Validation gates "Next" only where the sheet would otherwise be nonsensical (e.g. can't reach Skills
with zero classes — there's no BAB/skill-point context to rank against); everything else is
skippable and revisitable. On the last step the wizard hands off into the **same
`useCharacterEditor` session**, no reload, landing the player in the (overhauled) full editor with
every section already populated — the wizard is a scaffold around the editor's first 15 minutes of
use, not a separate product.

Do **not** build a new "simple sheet" data model or a parallel character shape. The wizard's whole
value is *sequencing and hand-holding* over the sheet that already exists. A player who abandons the
wizard midway still has a valid, playable character (`createDefaultCharacter` + whatever they'd
filled in) — never a half-initialized or wizard-only-parseable document.

---

## 3. Where the flag lives

Two flags, two lifetimes — keep them distinct, both additive:

### 3a. Per-character: "this sheet is mid-wizard" / "this sheet was built by the wizard"

Lives in `character.metadata.custom` (`packages/pathforge-schema/src/meta.ts`
`characterMetadataSchema.custom: z.record(z.string(), z.unknown()).default({})`) — already a
free-form bag, so this is **zero schema changes**:

```ts
// character.metadata.custom.wizard
type WizardMeta = {
  active: boolean;        // true while the wizard shell should be shown instead of the full editor
  step: WizardStepKey;    // "welcome" | "race" | "class" | "abilities" | "skills" | "gear" | "details" | "done"
  startedAt: string;      // ISO
  completedAt?: string;   // ISO, set on handoff
};
```

Read/write it through `ed.update(c => { c.metadata.custom.wizard = {...} })` exactly like every
other mutation — it rides the existing save loop, undo stack, and 3-way merge for free. Do **not**
add a typed top-level `character.wizard` block; `metadata.custom` exists precisely so ephemeral,
non-game-mechanical UI state like this doesn't need a schema migration. (If you want light type
safety, add an *optional* exported `wizardMetaSchema` in a new small module — e.g.
`packages/pathforge-schema/src/wizard.ts` — and parse/coerce `metadata.custom.wizard` through it at
the read site; still zero DB migration, still additive.)

Why per-character and not per-user: a returning player might make one guided character and one
freeform one; the flag has to travel with the sheet it describes, and it has to survive the 3-way
merge / offline outbox untouched (it's a leaf value, so the existing merge already treats it fine —
verify with a `threeWayMerge` unit test in Phase 5).

### 3b. Per-user: "offer the wizard by default for a brand-new account"

There is **no existing onboarding column** on `profiles` (checked `lib/supabase/types.ts` —
`profiles` is `{ id, display_name, handle, avatar_url, created_at, updated_at }` only) or on
`auth.users.user_metadata` in this codebase. Two additive options, in preference order:

1. **No new storage at all** (recommended): infer "probably new" from
   `characters.length === 0` at the `/characters/new` decision point (the characters-list page
   already loads the owner's characters; reuse that query). First character ever → offer the
   wizard by default (still skippable to blank-create); second and later characters → default to
   the existing blank-create form, with a small "Use the guided wizard instead" link. Zero schema,
   zero migration, zero new persisted state.
2. If product wants a stickier "always ask me" / "never show this again" per-user preference, add
   it to `profiles` as a new nullable column (`onboarding_wizard_dismissed boolean`) — this is the
   **only** place in this plan that would need a migration (next number after `0029`), and only
   if #1 proves insufficient. Default to NOT doing this; ship #1 first and see if anyone asks.

Do not gate the wizard behind a feature flag system — there isn't one in this codebase, and the
`isModuleKeyEnabled` machinery is for *character* optional-rule modules, not app-level UI variants;
reusing it here would be a category error.

---

## 4. Route + step architecture

### 4.1 Route

New route: `app/(app)/characters/new/wizard/page.tsx`. It does the **same** name-collection +
`createDefaultCharacter` + insert as `createCharacterAction` today (extract the shared body into a
helper, e.g. `createBlankCharacterRow(supabase, user, { name, playerName })` returning
`{ id, sheet, version }`, called by both the existing action and the new one) — then instead of
`redirect(/characters/${id})` it sets `metadata.custom.wizard = { active: true, step: "welcome", startedAt }`
on the freshly-created sheet's first save and redirects to
`/characters/${id}/wizard`. Keep `/characters/new` as the entry point with a choice: a "Guided
setup" card (primary, shown-by-default for zero-character accounts per §3b) and a plain "Blank
character" card/link (the existing `CreateCharacterForm`) — both create a real character row
immediately (no separate "draft" concept), they just differ in which page they redirect to next.

`app/(app)/characters/[characterId]/wizard/page.tsx` — loads the row exactly like
`edit/page.tsx` does (same `safeParseCharacter` + companion-master-refresh preamble; consider
factoring that preamble into a shared `loadCharacterForEdit(characterId)` helper used by both
`edit/page.tsx` and this new page, since they're now identical), then renders:

```tsx
<CharacterWizard characterId={characterId} initial={result.character} initialVersion={sheetVersion} />
```

`CharacterWizard` (new client component, `components/character/wizard/character-wizard.tsx`) calls
`useCharacterEditor` itself — **the same hook, same import, same contract** — and renders the step
shell around `ed`. If `metadata.custom.wizard?.active` is falsy when this page loads (e.g. someone
bookmarked the URL after finishing), redirect to `/characters/${characterId}/edit` server-side
instead of mounting the wizard client component at all.

### 4.2 Step shell

`components/character/wizard/wizard-shell.tsx` (client): owns local `stepIndex` state (mirrored
into `metadata.custom.wizard.step` via `ed.update` on every advance/back, so a refresh mid-wizard
resumes at the right step — read the initial index from `initial.metadata.custom.wizard?.step` on
mount, not from local-only state). Renders:

- A **progress spine** — desktop: a left-aligned vertical list of step labels with a filled/current/
  upcoming state per the design tokens (`--pf-gold` for current/done, `border-border` muted for
  upcoming); mobile: a compact horizontal dot/segment bar under a sticky header (reuse the motion
  system's `pf-stagger`/`pf-rise` utilities for the step transition — this is exactly the kind of
  surface Motion (`motion/react`) should own: animate the step panel in/out with
  `AnimatePresence mode="wait"` + a shared layout transition on the progress spine's active-step
  indicator, gated the same way `<RouteTransition>` is (respect `data-motion`, no motion when
  `off`/reduced-motion-without-`full`)).
- The **current step's panel** (see 4.3).
- A footer with **Back** / **Skip this step** (where allowed) / **Next** (disabled until the step's
  gate passes) / and on the last step, **Finish — go to full editor**.
- A **live status pill** reusing `ed.status` (Saved/Saving/Unsaved/Offline — same semantics the
  editor's Live Values bar already shows) so a new player isn't left wondering if their picks stuck.

### 4.3 Steps (each a thin wrapper file in `components/character/wizard/steps/`)

| Step | Wraps | Gate to advance | Recommended default | Inline help |
|---|---|---|---|---|
| `welcome-step.tsx` | nothing (pure copy) — 2-3 lines on what a PF1e character is, plus a "I've done this before, skip to blank editor" escape hatch that sets `wizard.active=false` and redirects to `/edit` | none | — | short "what you'll pick next" list |
| `race-step.tsx` | `RacePicker` (unwrapped — same component) | a race applied (`identity.raceApplied` set) OR explicit skip | none forced; surface 3-4 common races as quick-pick chips above the search box (Human/Elf/Dwarf/Halfling — client-side constants, not a new query) | 1-2 lines: "affects ability scores, size, speed" |
| `class-step.tsx` | `ClassCompendiumPicker` (Base mode only — hide the Base/Prestige `Segmented` for new players, a prestige class needs prerequisites they don't have yet) | at least one class in `identity.classes` with a resolvable preset (`resolveClassPreset(row)` truthy) | surface 4-6 iconic classes as quick-pick chips (Fighter/Cleric/Rogue/Wizard/Ranger/Barbarian) that jump straight to that class's preview in the picker | 1-2 lines: "your role in the party; sets HP/attack/spells" |
| `abilities-step.tsx` | the (overhauled) Abilities editor, forced into point-buy mode | `pointBuy.enabled && remaining budget >= 0` (reuse `pointBuyCost`/budget math already in the engine — do not reimplement) | `pointBuy.enabled = true, budget: 15` on step entry if not already set; a "recommended array" one-click button that assigns a sensible spread biased to the chosen class's key ability (e.g. highest to the class preset's primary casting/attack stat) | 1-2 lines per score explaining what it governs |
| `skills-step.tsx` | the (overhauled) Skills editor | none (skills are optional at level 1) | pre-check class-skill boxes implied by the chosen class preset if the schema exposes a class-skill list (verify against `ClassPreset`/`class_compendium` at implementation time — if no class-skill list is modeled, skip this default rather than inventing data) | "class skills get a +3 bonus once trained" |
| `gear-step.tsx` | `InventoryEditor` | none | show the chosen class's `class_compendium.starting_wealth` as a suggestion string near the wealth fields (fetch once, client-side, by the class's `compendiumId`/name — do not auto-roll or auto-fill gold, just display it) | "rough starting gold for your class" |
| `details-step.tsx` | the Identity/Profile editor's narrative fields (name already set; add alignment/deity/backstory blurb) | none | — | "this is flavor — come back anytime" |
| `handoff-step.tsx` | nothing — a summary card (portrait placeholder, name, race/class/level 1, key stats pulled from `ed.computed.summary`) + **Finish** button | — | — | "Your character is ready. Everything you set is saved — head to the full editor for depth: buffs, feats, spells, and more." |

On **Finish**: `ed.update(c => { c.metadata.custom.wizard = { ...prev, active: false, completedAt } })`,
then `router.push(/characters/${characterId}/edit)` (or `/characters/${characterId}` to land on the
read view first — pick whichever the editor-overhaul plan's "first run" UX prefers; either is a
one-line change). Because it's the same `useCharacterEditor` instance's draft being saved, there is
no risk of the wizard's edits being dropped or racing the editor's own load — the editor page does a
fresh server load on navigation, which is fine since the wizard's autosave already persisted.

### 4.4 Skipping / resuming

- **Skip this step**: advances `stepIndex` without a gate check; still writes
  `metadata.custom.wizard.step`.
- **Back**: always allowed, no gate.
- **Abandon mid-wizard** (closes tab, navigates away): the character row already exists and
  autosaves normally. Returning to `/characters/${id}/wizard` later resumes at
  `metadata.custom.wizard.step`. Returning via `/characters/${id}/edit` directly (e.g. from the
  characters list, which always links to `/edit` or the read view) should **not** force them back
  into the wizard — once in the full editor, a player is out of guided mode; consider a small
  "Resume guided setup" banner on the editor if `wizard.active` is still true, rather than an
  intercepting redirect, so a curious new player who wandered into `/edit` isn't trapped.

---

## 5. How this composes on top of the overhauled editor (built in Phase 2, before this pillar)

This is the sequencing constraint that matters most: **do not start step-wrapping until
`02_MODERN_EDITOR.md` has shipped**, because:

1. The overhaul may change the exact component names/props of `AbilitiesEditor`, `SkillsEditor`,
   etc. (it evolves the editor **in place**, so `ed`-taking components stay `ed`-taking, but a
   render-prop signature or an internal `advanced` threading detail could shift). Re-verify each
   step's wrapped component against the actual post-overhaul file before wiring it in — do not trust
   this document's line numbers/props past that point, re-grep.
2. The overhaul is where Motion (`motion/react`) gets wired into the editor's chip+disclosure
   pattern, layout transitions, etc. The wizard should **reuse those same motion primitives** for
   its step transitions rather than hand-rolling a second animation approach — check whether the
   overhaul introduces a shared `<AnimatedPanel>`/`<StepTransition>`-style wrapper and use it instead
   of writing a bespoke `AnimatePresence` block in `wizard-shell.tsx`.
3. If the overhaul changes the Simple/Advanced toggle's mechanism, the wizard's steps should force
   "Simple" (new players do not need the Advanced surfaces) — find wherever that boolean is now
   threaded and pass the wizard's own fixed `false`/simple equivalent into each wrapped step,
   the same way `character-editor.tsx` today passes `advanced={advanced}` into `AbilitiesEditor`.
4. Mobile is the overhaul's stated priority ("fluid, animated, human… especially mobile") — the
   wizard's one-panel-at-a-time shape is *inherently* mobile-friendly, but verify the wrapped
   components render sanely at 375px width standalone (outside the sidebar layout that normally
   constrains their max-width) before shipping; a picker built assuming it's constrained by a
   sidebar column could overflow full-bleed.

Practically: this pillar's Phase 0 (mockup) can start in parallel with the editor overhaul (it's
pure design, no code dependency). Phases 1-5 (route/shell/steps/flag/tests) must wait for the
overhaul to merge to `main`.

---

## 6. File-level task list

**Phase 0 — mockup (can start immediately, parallel with the editor overhaul)**
- [ ] `docs/S6_UX_OVERHAUL/mockups/wizard.html`: static HTML (Tailwind-via-CDN or inlined utility
  classes matching the real token names is fine for a mockup — it's never shipped) showing: the
  step spine (desktop + mobile), the Welcome step, the Class step (search + progression accordion +
  quick-pick chips — the richest step), and the Handoff summary. Use the real obsidian/parchment
  color values from `app/globals.css` `--pf-*` so it actually previews the aesthetic, not a generic
  placeholder.

**Phase 1 — flag + shared helpers (small, do first)**
- [ ] `packages/pathforge-schema/src/wizard.ts` (new, optional): `wizardMetaSchema` +
  `WizardStepKey` union + a `readWizardMeta(character)` / `writeWizardMeta(character, patch)` pair
  of pure helpers operating on `metadata.custom.wizard`. Export from the package's `index.ts`.
- [ ] `lib/actions/characters.ts`: extract `createBlankCharacterRow(...)` shared by
  `createCharacterAction` and the new wizard-create action; add `createWizardCharacterAction` (or
  reuse the same action with a `mode` form field) that also stamps `metadata.custom.wizard` before
  insert and redirects to `/characters/${id}/wizard` instead of `/characters/${id}`.
- [ ] `app/(app)/characters/[characterId]/edit/page.tsx` + the new wizard page: factor the shared
  "load sheet + refresh familiar master cache" preamble into `lib/character/load-for-edit.ts` (or
  similar) so both pages call one function instead of duplicating that block.
- [ ] Unit test: a `threeWayMerge` case with `metadata.custom.wizard` present on both sides (confirm
  it round-trips as an ordinary leaf value — it should, but lock it since S5b's merge is a load-
  bearing subsystem).

**Phase 2 — route + shell**
- [ ] `app/(app)/characters/new/page.tsx`: add the "Guided setup" vs "Blank character" choice
  (server-rendered; zero-character-count check per §3b option 1).
- [ ] `app/(app)/characters/new/wizard/page.tsx`: creates the row + redirects into
  `/characters/[id]/wizard`.
- [ ] `app/(app)/characters/[characterId]/wizard/page.tsx`: loads via the shared helper, redirects
  to `/edit` if `wizard.active` is falsy, else renders `<CharacterWizard>`.
- [ ] `components/character/wizard/character-wizard.tsx`: owns `useCharacterEditor`, renders
  `<WizardShell ed={ed} characterId={characterId} />`.
- [ ] `components/character/wizard/wizard-shell.tsx`: step index state (mirrored to
  `metadata.custom.wizard.step`), progress spine, footer nav, motion-gated step transitions.

**Phase 3 — steps (independent once Phase 2 lands; parallelizable across subagents)**
- [ ] `components/character/wizard/steps/welcome-step.tsx`
- [ ] `components/character/wizard/steps/race-step.tsx` (wraps `RacePicker`, adds quick-pick chips)
- [ ] `components/character/wizard/steps/class-step.tsx` (wraps `ClassCompendiumPicker` in
  Base-only mode, adds quick-pick chips, gate on `resolveClassPreset`)
- [ ] `components/character/wizard/steps/abilities-step.tsx` (forces point-buy on, "recommended
  array" button, gate on budget ≥ 0)
- [ ] `components/character/wizard/steps/skills-step.tsx`
- [ ] `components/character/wizard/steps/gear-step.tsx` (wraps `InventoryEditor` + starting-wealth
  suggestion lookup)
- [ ] `components/character/wizard/steps/details-step.tsx`
- [ ] `components/character/wizard/steps/handoff-step.tsx` (summary card from `ed.computed.summary`
  + Finish)

**Phase 4 — editor-side resume affordance**
- [ ] In the (overhauled) `character-editor.tsx`: if `ed.draft.metadata.custom.wizard?.active` is
  true, render a small dismissible "Finish guided setup" banner linking to `/wizard` instead of
  silently ignoring the flag forever.

**Phase 5 — tests + gate**
- [ ] Component tests per step (jsdom) — mount with a fixture draft, assert the gate logic
  (Next disabled/enabled), assert `ed.update` is called with the expected mutation shape (spy on a
  fake `ed`, same pattern as `tests/unit/use-character-editor.test.tsx`).
- [ ] An end-to-end-ish unit test that drives all 8 steps against a real `useCharacterEditor`
  instance (React Testing Library + fake timers for the debounce) and asserts the resulting
  character parses via `safeParseCharacter` and computes via `computeCharacter` without throwing —
  this is the cheapest way to catch a step that produces an invalid intermediate document.
- [ ] `pnpm lint && pnpm test && pnpm typecheck` (packages directly + narrowed app tsconfig per the
  OOM workaround) `&& pnpm build` with `NODE_OPTIONS=--max-old-space-size=7168`.
- [ ] Real-browser verify (localhost prod build) at both desktop and a real ≤400px width: click
  through the full flow once as a "new player" would, confirm the Finish step lands in the real
  (overhauled) editor with the picks visible, confirm autosave status pill behaves, confirm
  reduced-motion / `data-motion=off` collapses the step transitions cleanly.

---

## 7. Risks + gate

- **Component-shape drift from the editor overhaul.** The single biggest risk — every step wrapper
  assumes today's `{ ed, onClose? }` prop shape for the wrapped picker/editor. Re-grep each
  component immediately before wrapping it; don't trust this doc's snapshots once Phase 2 of the
  editor overhaul has landed.
- **Gate logic trapping a player.** A miscounted "has this step been satisfied" check (e.g. checking
  `identity.classes.length > 0` instead of "has a *resolvable* preset") could brick Next on a
  legitimately-valid pick. Prefer gating on the same predicates the engine/view-model already use
  (`resolveClassPreset`, `pointBuyCost` remaining ≥ 0) over inventing new ones.
- **`metadata.custom.wizard` colliding with import/merge.** An imported character (Myth-Weavers /
  Foundry / PDF) never sets this key, so `wizard?.active` is simply undefined/falsy for every
  existing and imported character — confirm this with a test rather than assuming it, since a wrong
  default here would incorrectly force old characters into wizard mode.
- **RSC boundary.** `CharacterWizard`/`WizardShell`/every step are Client Components (they hold
  `ed` and call hooks) — the wizard's `page.tsx` files pass only serializable
  `{ characterId, initial, initialVersion }` props, mirroring `edit/page.tsx` exactly. Never pass a
  function prop from the Server Component page down into `CharacterWizard`.
- **Motion gating.** Any `AnimatePresence`/spring transition in `wizard-shell.tsx` must respect
  `data-motion` (`system`/`full`/`off`) and OS `prefers-reduced-motion`, per the existing bridge in
  `app/globals.css` — do not hardcode motion on. Follow whatever bridge helper the editor-overhaul
  pillar introduces for wiring Motion library animations to that attribute; don't invent a second
  one.
- **Duplicated starting-wealth/class-skill lookups.** The Gear/Skills steps' "recommended default"
  lookups are conveniences, not mechanics — if the data shape isn't cleanly there (e.g. no
  structured class-skill list on `ClassPreset`), skip the nicety rather than half-implementing it
  against guessed data. Never silently fabricate PF1e rules data.
- **Gate before considering any phase done**: `pnpm lint && pnpm test && pnpm typecheck && pnpm build`
  (with the OOM workaround), plus an adversarial Workflow review on every substantive change,
  matching how every other pillar in this codebase's history has shipped (see the CLAUDE.md status
  log — every M12/S4/S5b/S6-predecessor pass followed this exact discipline).
