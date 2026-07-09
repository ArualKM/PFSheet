# S6 · Modern Editor Overhaul (desktop + mobile)

Part 2 of the S6 UX handoff package. Pillar 2 of 3 (companion sheets → **this** → wizard),
sequenced deliberately: this is the biggest lift and the wizard (`03_CHARACTER_WIZARD.md`) will
reuse whatever section-shell/EntryCard/Motion patterns this pass lands, so it should ship second.

Read this alongside:
- `docs/S6_UX_OVERHAUL/MASTER_PLAN.md` for the cross-cutting execution model + invariants.
- `docs/S6_UX_OVERHAUL/ANIMATION_SYSTEM.md` for the Motion primitives this doc consumes but does
  not define (durations, easing bridge to `data-motion`, the shared-element transition recipe).
- `docs/S6_UX_OVERHAUL/mockups/editor-canvas.html` — the static visual target (collapsed-chip-row →
  expanded-section canvas, desktop + mobile) already ships in this folder; match the real component
  to it.
- `docs/CLASSIC_EDITOR_PLAN.md` — the Classic layout (continuous scroll, jump-rail, mobile
  full-screen navigator) already solved several of the problems this plan needs (scroll-spy,
  jump-to-anchor, mobile full-screen nav-and-scroll). Reuse its primitives instead of
  reinventing them; see "Reuse, don't reinvent" below.

## 0. Ground truth: what exists today

`components/character/editor/character-editor.tsx` is **6,869 lines**, one file, one client
component (`"use client"` at the top — the whole tree below it is client). It contains:

- `useCharacterEditor(characterId, initial, initialVersion)` (imported from
  `use-character-editor.ts`, 371 lines) — the draft/compute/save contract. **Not part of this
  file** and **not to be touched** except additively (see §2).
- `EditLayout = "modern" | "classic"` (line ~194) with `EDIT_LAYOUT_GLOBAL`/`editLayoutKey`
  localStorage persistence (global default + per-character override) — the existing toggle this
  whole plan ships behind.
- A `SheetSection[]` array built inline in `CharacterEditor` (~line 234 onward): each section has
  `key`, `label`, `icon` (a `GameIcon` component reference), and `items: { key, label, render:
  () => ReactNode }[]`. Optional-system sections are pushed conditionally
  (`isModuleKeyEnabled(ed.draft, "hero_points")` etc.) — **this data shape is exactly the
  section-aware canvas's input; do not redesign it, adapt the shell around it.**
- **Modern layout** (function starting ~line 460, render ~536-733): a `md:grid-cols-[13rem_1fr]`
  desktop grid — left rail = vertical `role="tablist"` of sections (4-state collapse: the same
  `sectionsMode` `open|closed|auto` pattern as `CollapsibleSidebar`, `@container/sections` label
  hiding), right = a `Card` showing `sub.render()` for the *one* active section+sub. **Switching
  sections/subs is a hard `setState` swap — no transition, no persistence of scroll position, no
  shared element.** This is the thing to fix.
- **Classic layout** (`ClassicEditorLayout`, ~line 814 onward): every section rendered inline in
  one continuous scroll, grouped into "zones" (collapsible `<details>`-like sections keyed by
  `openZones` state), a sticky jump-chip rail with `scroll-spy` (IntersectionObserver-driven
  active-zone highlighting), and a `jump: {anchor, n}` nonce-based scroll effect that scrolls
  smoothly/instantly to an anchor and opens the containing zone. Mobile reuses the same
  `SectionSheet` full-screen navigator as Modern, but in "jump" mode (`jumpNavigation=true`)
  instead of "switch panel" mode.
- `SectionSheet` (~line 1277): a Radix `Dialog` that becomes a full-height (`100dvh`,
  safe-area-aware) mobile nav sheet, `pf-sheet-in` entrance animation, listing every section +
  sub-item; selecting either switches the active panel (Modern) or scrolls+opens (Classic via
  `jumpNavigation`).
- `LivePreviewBar` (~line 1408): the sticky top bar (`top-14 md:top-20`) showing HP/AC/Init/saves
  at a glance, expandable inline to the full `LivePreview`, with the mobile hamburger
  (`SectionSheet`) docked in its left edge.
- `EditorControls` (~line 739): the shared Modern⇄Classic pill + Simple/Advanced toggle + Undo +
  `SaveStatusBadge`, reused by both layouts so they can't drift.
- Section editors are separate files already: `combat-editor.tsx`, `spellcasting-editor.tsx`,
  `inventory-editor.tsx`, `feat-picker.tsx`, `class-compendium-picker.tsx`, `race-picker.tsx`,
  `archetype-picker.tsx`, `mythic-ability-picker.tsx`, `path-of-war-editor.tsx`,
  `akashic-editor.tsx`, `oaths-editor.tsx`, `background-occupation-editor.tsx`,
  `drawback-picker.tsx`, `entry-picker.tsx`, `class-options-picker.tsx`, `power-picker.tsx`,
  `sphere-picker.tsx`, `automation-effects-editor.tsx`, `modifier-list-editor.tsx`,
  `buff-center.tsx`, `conflict-resolver.tsx`, `fields.tsx` (29 files total in
  `components/character/editor/`). Several optional-system editors
  (`HeroPointsEditor`/`HonorEditor`/`StaminaEditor`/`MythicEditor`/`AbpEditor`/`PsionicsEditor`/…)
  are still defined **inline** in `character-editor.tsx` itself — extracting these is in scope
  for this overhaul (§4, Stage 0) purely because the file's size is already an obstacle to safe
  parallel work, not because the overhaul strictly requires it.
- `picker-shell.tsx` (249 lines): `PickerShell`/`PickerSearch`/`PickerError`/`PickerList`/
  `PickerRow`/`PickerDetail`/`Segmented`/`StatChip`/`FeatureTypeChip`/`ThreeppSystemBadge`/
  `PickerDivider` — the shared chrome for the M12 compendium pickers.
- `entry-card.tsx` (69 lines): `<EntryCard>` — collapsed `name + chips` row, a `Done/Edit`
  disclosure toggling `open`, with the `defaultOpen`-changes-on-prop-change "force reopen"
  idiom (`prevDefaultOpen` render-phase adjust) documented in
  `pathforge-editor-chip-disclosure.md`. **This is the pattern the new section canvas generalizes
  to whole SECTIONS, not just list rows.**
- **No `motion`/`framer-motion` dependency exists yet.** `package.json` has React 19.2.4 (stable
  channel — confirmed `startViewTransition` never fires; see `CLAUDE.md` "Motion system" section).
  `app/globals.css` already has the `data-motion` gate + token layer (`--pf-dur*`, `--pf-ease*`,
  `pf-fade-in`/`pf-rise`/`pf-scale-in`/`pf-stagger`/`pf-hover-lift`/`pf-shimmer`) built for the
  CSS-only motion system (2026-07-08). Motion (the library) is a **new, additive layer** used
  where CSS keyframes can't do the job (layout animations, shared-element/`layoutId` transitions,
  gesture-driven swipe, `AnimatePresence` exit animations) — it must still respect
  `data-motion`/`prefers-reduced-motion` (see §7).

## 1. The vision

**One continuous section-aware canvas, not hard-swap tabs.** Concretely:

- The section rail (desktop) / bottom command bar (mobile) is still the primary navigation
  affordance — but selecting a section **cross-fades/slides the panel in place** (Motion
  `AnimatePresence` + `layout`) instead of an instant `setState` re-render. Motion's `layoutId`
  gives the illusion that the *active section indicator* (the gold highlight bar in the rail, or
  the active pill in the mobile bar) physically slides between positions rather than teleporting.
- **Collapsed sections summarize themselves as a live chip row.** Every section that ISN'T
  currently expanded renders a one-line summary built from `StatChip` (already exists in
  `picker-shell.tsx`) — e.g. collapsed "Abilities" shows `STR 18 · DEX 14 · CON 16 · …`; collapsed
  "Defenses" shows `AC 18 · Fort +7 · Ref +5 · Will +9`; collapsed "Skills" shows a rank/class-skill
  count. This is the single biggest UX win: today collapsing to the rail hides everything; the
  goal is the read-view's "everything visible" instinct applied to the editor, without forcing
  every section open at once (which is what Classic already does and is intentionally denser/
  different — Modern's job is glanceable-but-editable, not exhaustive).
- **Each section expands in place with a shared-element transition** — tapping a collapsed
  summary card grows it into the full editor for that section using Motion's `layout` prop on the
  card container (the card animates its own height/position rather than the content just
  appearing), so the canvas reads as one continuous document that breathes open and closed, not a
  tab switcher.
- **Mobile = a full-height swipeable stack** with a bottom command bar (section chips, 44px
  targets, safe-area-aware, replacing/evolving `SectionSheet`'s full-screen dialog into an
  always-visible bottom bar for the common case, keeping the full-screen sheet for "jump to
  anything" / long section lists) **+ the sticky Live Values** bar staying exactly where it is
  today (`top-14`).
- Desktop keeps the left rail (4-state collapse, already built) but the panel it drives becomes
  the animated canvas instead of a static `Card`.

**What this is explicitly NOT:** a rebuild of Classic. Classic already IS "one continuous
document" — dense, all-zones-visible, for players who want the old-school full-sheet-on-one-page
feel. Modern's overhaul keeps Modern's identity (curated, one-section-at-a-time-ish, chip-forward,
friendlier for newer/mobile players) while removing its worst property (dead hard-swap, no sense
of the sheet as a whole). If in doubt about which layout a given interaction belongs in, Modern
gets the "expand in place" canvas; Classic keeps its jump-rail + `<details>` zones untouched.

## 2. The constraint: presentation refactor over `useCharacterEditor`

This is load-bearing and must be stated to every subagent before they touch code:

> **`useCharacterEditor`'s contract does not change.** `{ draft, computed, status, error,
> canUndo, conflict, update, undo, resolveConflict }` is the only surface the new canvas is
> allowed to consume. `update(mutate)` is still the only write path (structuredClone + mutate +
> commit — never bypass it with direct `setDraft`-style calls). The debounced autosave
> (900ms), the `sheet_version` CAS + 3-way merge + conflict surfacing, the offline outbox, and the
> `SAVE_TIMEOUT_MS`/`MAX_MERGE_ROUNDS` livelock guards in `use-character-editor.ts` are NOT touched
> by this overhaul. If a stage's design seems to require a change to the save loop, stop and
> re-scope the stage — it almost certainly doesn't (animating a panel, chip-summarizing a
> section, and swipe-gesture nav are all pure presentation over the existing `ed.draft`/
> `ed.computed`/`ed.update`).

Practical implications:
- Every section's `render()` closure keeps calling `ed.update(mutate)` exactly as today. The new
  canvas wraps the SAME `sub.render()` output in an animated container — it does not reimplement
  field editing.
- `ed.status === "conflict"` still disables editing globally (the `<fieldset disabled>` wrapper
  around `sub.render()`) — the new canvas must preserve this, including across whichever sections
  are simultaneously "open" if Stage 2+ allows more than one section open at a time.
- Undo (`ed.undo()`) operates on the whole draft, not per-section — no change needed here, but the
  canvas must not give the impression of per-section undo (no per-card undo button).
- `use-character-editor.test.tsx` and `editor-compute-guard.test.tsx` must keep passing unmodified
  — they exercise the hook, not the presentation layer, so a correct refactor never touches them.
  `character-editor-layouts.test.tsx` DOES need updates per stage (see §6) since it presumably
  asserts on the Modern layout's current DOM shape — check it before each stage and update
  alongside, never after.

## 3. Reuse, don't reinvent — inventory of primitives already solved

| Need | Already exists | Where |
|---|---|---|
| Section data model (key/label/icon/items) | `SheetSection` type + the built array | `character-editor.tsx` ~line 184, ~234 |
| Collapsed→expanded row-level disclosure | `<EntryCard>` | `entry-card.tsx` |
| Stat chip | `<StatChip label value tone>` | `picker-shell.tsx` |
| Segmented pill toggle | `<Segmented>` | `picker-shell.tsx` |
| Scroll-spy (which zone is "current") | `IntersectionObserver` wiring in `ClassicEditorLayout` | `character-editor.tsx` ~900-1030 |
| Jump-to-anchor with instant/smooth scroll + focus-on-jump | `jump` nonce state + effect | `character-editor.tsx` ~826-1035 (see `pathforge-classic-editor.md` for the "consume-once jump signal" gotcha) |
| Full-screen mobile section nav | `<SectionSheet>` | `character-editor.tsx` ~1277 |
| Sticky live-stats bar w/ mobile hamburger slot | `<LivePreviewBar>` | `character-editor.tsx` ~1408 |
| Motion-preference gating | `data-motion` attribute + CSS gate | `app/globals.css` ~161-182 |
| Motion token layer (durations/easings) | `--pf-dur*`, `--pf-ease*` | `app/globals.css` ~253-260 |
| 4-state rail collapse (auto/open/closed/hidden pattern) | `CollapsibleSidebar` + the section rail's `sectionsMode` | `components/app-shell/`, `character-editor.tsx` ~540-643 |

The new work is almost entirely **composition**: wrap the existing section render output in a
Motion-driven shell, add a chip-summary renderer per section, and reuse the scroll-spy/jump
machinery from Classic instead of re-deriving it for Modern's "expand in place" behavior (a
collapsed-then-expanded section IS a jump target, functionally).

## 4. Concrete component plan

New files under `components/character/editor/`:

### `editor-canvas.tsx` — the section-shell layer
- Exports `<EditorCanvas sections activeSection onSelectSection ed advanced>` — replaces the
  Modern-layout render body (~536-733) but takes the SAME `sections: SheetSection[]` prop the
  existing code already builds, so `CharacterEditor`'s section-construction logic (all the
  `isModuleKeyEnabled` pushes) is untouched.
- Internally: a `motion.div` per section with `layout` + `AnimatePresence` for
  expand/collapse; only the active section (or, in Stage 2+, any section the user has expanded)
  mounts its heavy `sub.render()` content — collapsed sections mount ONLY the lightweight chip
  summary, so the panel stays cheap even with 10+ sections in the DOM (important: Modern's whole
  point is NOT rendering everything at once like Classic does).
- Must render the SAME `role="tablist"`/`role="tab"` a11y structure the current rail uses — this
  is a presentation change, not an a11y regression. Roving-tabindex + arrow-key nav
  (`onSectionKeyDown`/`onSubKeyDown`, already written) moves over unchanged.

### `section-summary.tsx` — the collapsed chip row
- Exports `<SectionSummary sectionKey computed draft />` — a small per-section-key switch (NOT a
  generic "dump every field as a chip" — each section picks its own 3-6 most useful stats,
  mirroring how `HeroPointsEditor`/`HonorEditor` etc. already build a `StatChip` row at the top of
  their own editor for the "current state" line). Concretely:
  - `core` (Abilities item): STR/DEX/CON/INT/WIS/CHA from `ed.computed.summary.abilities`.
  - `defenses` (Saving throws): Fort/Ref/Will from `ed.computed.summary` (`formatModifier`,
    already imported).
  - `defenses` (Armor class): AC/Touch/Flat-footed.
  - `attacks`: BAB, CMB, CMD, and attack count.
  - `skills`: ranked-skill count + a "N maxed" chip if useful.
  - `spells`: caster level(s) + slot summary if `ed.computed.summary.spellcasting` exists.
  - `equipment`: carried weight / wealth total.
  - `buffs`: active-buff count.
  - optional sections: reuse each editor's own existing "current state" `StatChip` row logic —
    don't write it twice, extract a tiny `summary()` export from each optional editor if the
    logic is non-trivial (Hero Points/Honor/Mythic already compute exactly this).
  - Fallback: sections with no natural stat line (Story/Profile, Settings) show an item count or
    nothing — don't force a chip where there's nothing meaningful to show.
- This file has NO write access to `ed` — read-only from `ed.computed`/`ed.draft`. Keep it a pure
  presentational component so it's trivially reusable from the wizard's review step later.

### `mobile-command-bar.tsx` — the bottom bar
- Exports `<MobileCommandBar sections activeSection onSelect onOpenFullNav />` — a fixed
  `bottom-0` bar (safe-area padded, `env(safe-area-inset-bottom)`), showing 4-5 primary section
  icons (Core/Defenses/Attacks/Skills/+More) as 44px tap targets, with a "More" button opening the
  existing `<SectionSheet>` full-screen navigator for the long tail (Spells/Equipment/Buffs/Story/
  Optional/Settings) — don't try to fit 12 sections in a bottom bar; reuse the sheet for overflow.
- Uses Motion's `layoutId="active-section-indicator"` shared between this bar's active pill and
  the desktop rail's active-row highlight IS NOT required (they're different breakpoints, never
  simultaneously visible) — skip that complexity; `layoutId` shared-element magic is for the
  panel transition, not cross-breakpoint chrome.
- Coexists with `<LivePreviewBar>` — the command bar sits at the bottom, Live Values stays sticky
  at the top; they don't compete for the same screen edge.

### Gesture nav (mobile swipe between sections)
- A thin wrapper using Motion's `drag="x"` + `dragConstraints` + `onDragEnd` velocity/offset
  threshold on the active panel, calling the same `onSelectSection(next)` the command bar uses —
  swipe is an alternate INPUT to the same navigation model, not a separate state machine. Gate
  behind a a small threshold (don't hijack scroll — vertical drag inside the panel must not
  trigger a horizontal section change; use Motion's `dragDirectionLock` or compare
  `Math.abs(x) > Math.abs(y)` before committing).
- This is a **Stage 3+ nice-to-have** — ship the tap-driven bar first, add swipe once the
  animated transition itself is solid (swipe gestures are the easiest thing to get janky/
  disorienting; don't let them block the core cross-fade work).

### Modifications to `character-editor.tsx`
- Replace the Modern-layout function body with a call into `<EditorCanvas>` — the section array
  construction, `EditLayout` state/localStorage logic, `EditorControls`, and `ClassicEditorLayout`
  are UNTOUCHED.
- Extract the still-inline optional-system editors (`HeroPointsEditor`, `HonorEditor`,
  `StaminaEditor`, `MythicEditor`, `AbpEditor`, `PsionicsEditor`, and any others found inline) into
  their own files under `components/character/editor/` — pure move, no behavior change, done as
  its own reviewed sub-stage (Stage 0) specifically so the remaining stages touch a smaller file
  and land smaller, safer diffs. This also de-risks parallel subagent work: two agents editing
  disjoint new files never conflict, whereas two agents editing different line-ranges of one
  6,869-line file constantly will.

## 5. Desktop vs mobile layouts

**Desktop (≥ `md`, 768px+):**
- Left rail unchanged (4-state collapse, `sticky top-20`, `@container/sections` label hiding).
- Right column: `<LivePreviewBar>` unchanged, then `<EditorCanvas>` where the "active" section
  renders full-size and (Stage 2+) other sections can be peeked/expanded via the chip-summary
  cards stacked below — i.e. desktop has room to show 2-3 sections' summaries below the active
  one, Classic-lite, without fully committing to Classic's everything-open density. Stage 1 can
  simply keep desktop as "one active section, animated" and defer the peek-stack to Stage 2.

**Mobile (< `md`):**
- `<LivePreviewBar>` unchanged (`top-14`, hamburger already docked left).
- `<EditorCanvas>` fills the remaining height, single section at a time, animated cross-fade/slide
  on change (respecting `dir` — sliding left when moving to a "later" section, right when
  "earlier", mirroring how a swipeable stack should feel — Motion's `AnimatePresence
  custom={direction}` pattern is exactly built for this).
- `<MobileCommandBar>` fixed to the bottom, safe-area-padded, replacing/supplementing the
  hamburger-only nav. **44px minimum tap targets** — this repo already has a `tap-target` utility
  class (used throughout `character-editor.tsx`, e.g. `SectionSheet`'s buttons) — reuse it, don't
  hand-roll new touch-target CSS.
- Every collapsed-section chip row must itself be a 44px+ tap target to expand — `EntryCard`
  already sets this precedent (`h-11 sm:h-9` toggle button).

## 6. Staged rollout (behind the existing Modern⇄Classic toggle)

The Modern⇄Classic pill (`EDIT_LAYOUTS`) already isolates this work from Classic users — ship
every stage to `main` gate-green; Classic is never touched, so there is no user-facing risk to
players who prefer it, and Modern users get progressively better UX with each stage rather than
one giant flip.

**Stage 0 — De-risk the file (no user-visible change).**
- Extract the inline optional-system editor components out of `character-editor.tsx` into their
  own files (mirrors the existing pattern of `combat-editor.tsx` etc.).
- Add the `motion` dependency (`pnpm add motion` at the repo root — confirm workspace placement;
  it's a component-layer dep so it likely belongs in the root `package.json`, not a package under
  `packages/`).
- File-level tasks:
  - `pnpm add motion`
  - New files: `hero-points-editor.tsx`, `honor-editor.tsx`, `stamina-editor.tsx`,
    `mythic-editor.tsx` (careful: `mythic-ability-picker.tsx` already exists — name the extracted
    editor distinctly, e.g. `mythic-editor.tsx` for the tier/pool/surge/ability-boost UI vs. the
    existing picker for adding path abilities), `abp-editor.tsx`, `psionics-editor.tsx` (check
    against `power-picker.tsx`, similarly named but different responsibility).
  - Update imports in `character-editor.tsx`.
  - Gate: `pnpm lint && pnpm test && pnpm typecheck` (this stage touches only extraction —
    zero behavior change, so `character-editor-layouts.test.tsx` should pass with no edits).

**Stage 1 — The animated single-section canvas (desktop + mobile parity).**
- Build `editor-canvas.tsx`: same one-section-at-a-time behavior as today, but the panel
  swap is Motion `AnimatePresence`-driven (fade+slight-rise, respecting `data-motion`/
  reduced-motion — see §7) instead of an instant DOM swap.
- Wire it into `CharacterEditor` in place of the current Modern render body.
- No chip-summary collapsed cards yet — this stage is PURELY "make the existing swap feel good."
- File-level tasks: `editor-canvas.tsx` (new), `character-editor.tsx` (Modern render body
  replaced with `<EditorCanvas>`), `character-editor-layouts.test.tsx` updated for the new DOM
  (same `role="tab"`/`role="tabpanel"` contract, different wrapper).
- Adversarial review focus: does `AnimatePresence`'s exit-then-enter timing ever leave the
  `role="tabpanel"` region without `aria-labelledby` resolving? Does rapid clicking between
  sections (before an animation finishes) queue correctly or drop states? Does a compute-throw
  (see `use-character-editor.ts`'s `computeCharacter` try/catch) still render inside the animated
  wrapper without breaking the transition?
- Gate + a real-browser check (desktop + `preview_resize` mobile) before merge.

**Stage 2 — Collapsed chip-summary rows + expand-in-place.**
- Build `section-summary.tsx`.
- `EditorCanvas` grows a second mode: sections not currently "focused" render their `StatChip`
  summary row (tap to focus/expand); the desktop rail's click and the summary-card tap both drive
  the same `onSelectSection`.
- File-level tasks: `section-summary.tsx` (new), `editor-canvas.tsx` (expand/collapse modes +
  `layout` prop on the card for the shared-element grow animation), possibly small additive
  exports from `hero-points-editor.tsx`/`honor-editor.tsx`/etc. if their existing inline
  `StatChip` row needs factoring into a reusable `summary()` function.
- Adversarial review focus: does mounting/unmounting `sub.render()` on collapse lose in-progress
  local component state that isn't yet flushed to `ed.draft` (check every section editor for
  uncommitted local state — e.g. text fields with local draft buffering per
  `pathforge-mobile-first-ui.md`/`fields.tsx`'s `NumberField` "clearable local draft" — collapsing
  mid-edit must not silently discard a keystroke that hasn't reached `ed.update` yet)? Does the
  chip summary ever show STALE data after `ed.update` fires (must read `ed.computed`/`ed.draft`
  directly, never a memoized snapshot taken at mount)?

**Stage 3 — Mobile bottom command bar + gesture nav.**
- Build `mobile-command-bar.tsx`; wire the swipe-drag wrapper described in §4.
- File-level tasks: `mobile-command-bar.tsx` (new), `character-editor.tsx` (mount the bar on
  `< md`), `editor-canvas.tsx` (accept a `direction` for slide-in/out, gesture handlers).
- Adversarial review focus: does drag-to-swipe fight with any section's own horizontal-scrolling
  content (e.g. wide tables in Spells/Skills)? Does the command bar's fixed positioning overlap
  the safe-area home-indicator or any existing floating "back to top" button
  (`pathforge-mobile-first-ui.md` mentions one from the nav overhaul — check
  `components/app-shell/` for it and make sure the two floating elements don't collide)?

**Stage 4 (optional/desktop polish) — Peek-stack on desktop.**
- Desktop shows the active section full-size + collapsed summaries for 2-3 adjacent sections
  below it (scrollable), each independently expandable — moves desktop Modern a step closer to
  "everything glanceable" without becoming Classic.
- Lowest priority; cut if time-boxed.

Each stage ships as its own PR/commit, gate-green, ideally after an adversarial Workflow review
per the repo's established pattern (every substantive S4/S6-adjacent change in `CLAUDE.md` history
shipped this way). Fable 5 should spawn one Sonnet 5 subagent per stage's implementation +
a second Sonnet 5 subagent for that stage's adversarial review, sequentially per stage (stages are
NOT independent — Stage 2 builds on Stage 1's canvas) — the parallelism is across leaves WITHIN a
stage (e.g. Stage 0's editor extractions are trivially parallel across the 6 files) not across
stages.

## 7. Perf + a11y

- **Reduced motion / `data-motion="off"`:** every Motion component must check the same signal the
  CSS layer does. Motion has no automatic awareness of this app's custom `data-motion` attribute
  — read it (e.g. `document.documentElement.dataset.motion` or a small
  `useMotionPreference()` hook mirroring the CSS gate logic in `app/globals.css` lines ~161-182)
  and either skip `AnimatePresence`/`layout` animations entirely or force `transition={{
  duration: 0 }}` when motion is off/reduced. `ANIMATION_SYSTEM.md` should define this
  hook/bridge once — this doc consumes it, does not redefine it. **Do not ship a Motion animation
  that ignores OS `prefers-reduced-motion`** — that's a hard regression from the CSS-only system's
  current behavior.
- **Focus management on section change:** when a section becomes active (click, swipe, or
  keyboard arrow-nav), focus must move to the new panel's heading or first focusable field —
  mirror the Classic layout's "focus-on-jump" behavior (`pathforge-classic-editor.md` notes this
  exact gotcha: "focus-on-jump"). Losing focus to nowhere (or leaving it stuck on a now-hidden tab
  button) is a real a11y regression Motion's exit animation can introduce if the exiting node is
  removed from the DOM while still focused — check this explicitly with a screen-reader pass or at
  minimum a `document.activeElement` assertion in tests.
- **No layout thrash:** `layout` animations in Motion (used for the shared-element expand) recompute
  geometry every frame — keep the number of simultaneously-`layout`-animated elements small
  (the active card + maybe the rail indicator, not every chip in a collapsed summary row).
  Profile with the browser's Performance panel on a mid-tier mobile emulation before calling a
  stage done; a canvas that stutters on a real phone is worse than the hard-swap it replaced.
  `pf-hover-lift`'s existing "pointer-only" gate (`@media (hover:hover)`) is the precedent — don't
  add drag/hover-driven Motion behavior on touch devices where it can't fire cleanly anyway.
- **Section content should not all mount at once.** Per §4, only the focused/expanded section(s)
  render their full `sub.render()` — this is BOTH a perf requirement (some section editors are
  heavy — `SpellcastingEditor`, `InventoryEditor`, the compendium pickers) and consistent with
  Modern's existing lazy-tab-panel behavior (today only one section is ever mounted).

## 8. Risks + gate + the RSC gotcha

- **RSC function-prop gotcha (CLAUDE.md, `pathforge-rsc-function-props.md`):** `character-editor.tsx`
  is entirely client (`"use client"` at the top) and is always instantiated from a Server Component
  page (`app/(app)/characters/[characterId]/page.tsx` → `SheetViewSwitch` → eventually the editor
  route) with only serializable props (`characterId`, `initial`, `initialVersion`). **Nothing in
  this overhaul changes that boundary** — `EditorCanvas`, `SectionSummary`, `MobileCommandBar` are
  all new CLIENT components consumed only by the already-client `CharacterEditor`, never rendered
  directly by a Server Component. The one thing to double check: if the wizard (`03_CHARACTER_WIZARD.md`)
  or any future work tries to reuse `<EditorCanvas>` from a Server Component page shell, it must
  pass only serializable props — no passing `ed.update` or any function down from a server
  boundary (there is none in this plan, since `useCharacterEditor` itself is called client-side
  inside `CharacterEditor`, but flag this explicitly to whichever agent builds the wizard).
- **Motion + Tailwind v4 / Lightning CSS interaction:** the existing motion-system gotcha
  (`@keyframes` inside `@media` silently dropped by Lightning CSS) is a CSS-layer issue and does
  NOT apply to Motion's JS-driven animations (which set inline styles/transforms via
  `requestAnimationFrame`, not CSS `@keyframes`) — but any NEW CSS this overhaul adds (e.g. a
  safe-area padding utility for the mobile command bar) must follow the same "one keyframe + custom
  props the media query swaps" rule if it needs a keyframe at all.
- **Bundle size:** Motion is a new dependency on the editor's client bundle, which `CLAUDE.md`'s
  Nav-perf section flagged editor bundle code-splitting as explicitly deferred ("doesn't affect
  the swap symptom; core-dep-dominated; RSC-boundary risk"). Adding Motion makes the editor
  bundle bigger, not smaller — after Stage 1 ships, run a bundle-size check (`next build`'s
  output, or `@next/bundle-analyzer` if already wired) to confirm Motion's cost is acceptable; if
  it's not, this is the moment to revisit code-splitting the editor route, but don't preemptively
  solve a problem that hasn't been measured.
- **Test surface:** `character-editor-layouts.test.tsx` currently presumably renders `<CharacterEditor>`
  and asserts DOM/ARIA structure for Modern (and maybe Classic) — every stage that changes Modern's
  DOM shape must update this test IN THE SAME COMMIT, not after. `use-character-editor.test.tsx`
  and `editor-compute-guard.test.tsx` should need ZERO changes across all 4 stages — if a stage's
  diff touches either file, that's a signal the stage violated the §2 constraint and needs
  re-scoping.
- **Gate every stage:** `pnpm lint && pnpm test && pnpm typecheck`, plus `pnpm build` (with
  `NODE_OPTIONS=--max-old-space-size=7168` per the OOM gotcha), plus a real-browser check
  (`preview_start`/`preview_resize` to mobile + desktop, or the `verify` skill) before considering
  any stage done — animation quality cannot be judged from a snapshot test alone.
