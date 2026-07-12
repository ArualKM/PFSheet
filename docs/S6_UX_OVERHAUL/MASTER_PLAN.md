# S6 — UX Overhaul: companion sheets, fluid Modern editor, wizard, unified viewers

**Status:** ALL FOUR PILLARS SHIPPED (2026-07-09). Companion sheets, the Modern editor overhaul,
the create-a-character wizard, and the Viewers design-language pass all landed — see CLAUDE.md's
"S6 UX overhaul — ALL FOUR PILLARS COMPLETE" entry for the shipped commits. Two things below
drifted from plan after shipping and are noted in their own docs rather than here: Pillar 2's
Stage 3 mobile command bar was superseded by the existing app-level `MobileBottomNav` (see
`02_MODERN_EDITOR.md`), and Pillar 3's step order/list changed under "wizard v2" + the 2026-07-12
level-up wizard generalized `WizardShell` (see `03_CHARACTER_WIZARD.md`). This file remains the
accurate cross-cutting invariants + execution-model reference for any future work on these
surfaces.

Originally drafted 2026-07-09 as a handoff package for a fresh Fable 5 chat. Everything here was
additive on top of a v1-complete app; nothing below required throwing away working code.

**North star:** ONE cohesive design language across the whole app. The mockups in `mockups/` set the visual
vocabulary — chip/stat-tile density, live summaries, purposeful hierarchy, disciplined gold/rune accents,
generous radius, and subtle Motion. First we make the *editor* side of that vocabulary real and functional
(Pillars 1–3); then we bring the read/share/GM **Viewers** into the same language so the whole app feels like
one deliberate thing (Pillar 4). Editor leads, viewers follow — so the shared components (chips, cards,
section shells, Motion recipes) are proven on the editor before the viewers adopt them.

This folder is the single source of truth for the next big UX push. Read this file first, then the pillar docs
and the mockups. **Do not relitigate the locked decisions** — they were made deliberately with the owner.

---

## Why this, why now

The core app is feature-complete (M0–M12 + v1 + the 3pp flagship all shipped). What's left is the thing that
decides whether people actually *enjoy* building a sheet: the **feel** of the create/edit experience, especially
on mobile. Three gaps:

1. **Companions are over-heavy.** A familiar/animal companion is a much simpler object than a PC (no classes,
   no spell-slot engine, no feats-as-build, no 3pp systems), but today it's edited through the exact same 11-group
   Modern editor. The just-shipped companion data + engine (base bodies, master→familiar link, owner benefit)
   make a purpose-built **simple companion sheet** cheap — it's mostly presentation over data that already exists.
2. **The Modern editor doesn't feel fluid.** Section changes hard-swap; there's no continuity, no spring, no
   sense that it was designed as one purposeful surface. Mobile especially needs to feel effortless.
3. **New players have no on-ramp.** There's no guided path — you land in the full editor and sink or swim.

## The three pillars (LOCKED)

| # | Pillar | Doc |
|---|--------|-----|
| 1 | Simple/Advanced **Companion** sheet + editor | [`01_COMPANION_SHEETS.md`](01_COMPANION_SHEETS.md) |
| 2 | **Modern editor** overhaul (desktop + mobile, fluid, animated) | [`02_MODERN_EDITOR.md`](02_MODERN_EDITOR.md) |
| 3 | New-player **Create-a-character wizard** | [`03_CHARACTER_WIZARD.md`](03_CHARACTER_WIZARD.md) |
| 4 | **Viewers** design-language unification (Modern/Classic read, public share, GM audit) | [`04_VIEWERS_DESIGN_LANGUAGE.md`](04_VIEWERS_DESIGN_LANGUAGE.md) |
| — | **Animation system** (Motion library integration) | [`ANIMATION_SYSTEM.md`](ANIMATION_SYSTEM.md) |
| — | **Mockups** (openable HTML, desktop + mobile) | [`mockups/`](mockups/) |

### Locked decisions (with rationale)

- **Animation engine = the Motion library (`motion/react`).** Add it as a dependency. It's the Framer-Motion
  successor and the real path to spring physics, layout + shared-element transitions, `AnimatePresence`, and
  gestures. React's own `<ViewTransition>`/`<Activity>` are experimental and **do not fire on stable React
  19.2.4** (verified previously). Pure CSS (the current `pf-*` utilities) can't do springs, shared-element, or
  gesture — that's the ceiling being felt now. Motion layers *under* the existing `data-motion` preference and
  reduced-motion gating; see `ANIMATION_SYSTEM.md` for the bridge.
- **Editor overhaul = evolve in place.** Refactor the existing `character-editor.tsx` section-group model into
  the new fluid canvas incrementally, reusing every section editor and the `useCharacterEditor` draft/save loop.
  Lower risk, ships in stages behind the existing Modern⇄Classic editor toggle. No ground-up rewrite.
- **Scope = all four, sequenced.** Build order is **1 → 2 → 3 → 4**: companion sheets first (smallest,
  self-contained, immediate win), then the editor overhaul (the big one, the foundation), then the wizard on top
  of the overhauled editor, then the Viewers design-language pass — which adopts the shared components (chips,
  cards, section shells, Motion recipes) the editor pillar proves. Pillars 1–3 make the new UX functional;
  Pillar 4 makes the read/share/GM side match it.

## Sequencing & definition of done

**Pillar 1 — Companion sheets (ship first).** Done when: a companion character opens in a Simple companion
view/editor by default (auto-detected via `companion.type`), with an Advanced escape hatch into the full Modern
editor; creating + reading a familiar/animal companion is fast and legible; gate green; adversarially reviewed.

**Pillar 2 — Modern editor (the foundation).** Done when: the Modern editor is a continuous, section-aware,
Motion-animated canvas on desktop and a fluid full-height stack on mobile, preserving the `useCharacterEditor`
contract exactly; shipped in stages behind the editor layout toggle; reduced-motion/off truly collapses motion;
gate green each stage; adversarially reviewed.

**Pillar 3 — Wizard (on top).** Done when: a `newPlayer` path launches a guided step flow reusing the section
editors as embeddable steps, with recommended defaults + plain-language help, handing off cleanly to the full
editor; gate green; adversarially reviewed.

**Pillar 4 — Viewers design language (last).** Done when: the Modern read dashboard, the Classic sheet, the
public share (`/c/[publicSlug]`), and the GM audit view all speak the editor's design vocabulary
(chips / stat-tiles / section shells / Motion), the public/share/GM surfaces lead with the info that matters +
clear CTAs ("everything up front"), and §15 privacy gating + the `buildCharacterViewModel` contract are
untouched (design-only pass — never a new data path); gate green; adversarially reviewed. See
[`04_VIEWERS_DESIGN_LANGUAGE.md`](04_VIEWERS_DESIGN_LANGUAGE.md).

Each pillar ships independently — do not block Pillar 1 on Pillar 2. Pillar 4 depends on Pillar 2 (it reuses
the editor's proven components), so it genuinely comes last.

---

## Execution model — strong leader, cheap workforce

**Fable 5 is the leader.** For each substantive unit of work:

1. **Plan the slice** (a shippable increment — e.g. "companion Simple read view", or "editor section-transition
   layer"). Keep slices small enough to gate + review in one pass.
2. **Fan out to Sonnet 5 subagents** for the parallel legs — implementation across files, mockup-to-code,
   test authoring, and the adversarial review. Spawn them with the Agent/Workflow tools using **Sonnet 5**
   (`model: 'sonnet'`); reserve the leader (Fable) for synthesis, architecture calls, and final judgment. This
   "strong leader, cheap workforce" split keeps throughput high and cost sane.
3. **Adversarially review** every substantive change before calling it done — a Sonnet skeptic panel that tries
   to *refute* each change (bugs, RSC boundary, a11y, perf, privacy), verify findings, then fix. This is the
   same loop that shipped the companion fix (27-agent audit → 4-dimension review).
4. **Gate + commit.** Run the full gate (below). Commit per slice with a clear message. Push only when asked.

## Cross-cutting invariants — do NOT break these

- **Preserve `useCharacterEditor`'s contract.** `{ draft, computed, status, error, canUndo, conflict,
  update(mutate), undo(), resolveConflict() }` — the debounced autosave, optimistic-concurrency CAS, 3-way
  merge, and offline outbox are load-bearing (S5b). The editor overhaul is a *presentation* refactor over this
  hook. Do not fork the save logic.
- **RSC boundary.** Never pass a function prop from a Server Component to a Client Component — it builds and
  passes jsdom tests but crashes at request time. New views/editors used by Server Components take serializable
  props + `children` only. `SheetViewSwitch` swaps *server-rendered ReactNodes* on the client for exactly this
  reason; the companion view slots into that pattern.
- **Privacy is a view-model concern.** The "everything up front on public/share/GM" goal lives in
  `buildCharacterViewModel` + the dashboard, not the editor. §15 gating per viewer (owner/editor/gm/anonymous)
  is the single source for the read view *and* `/api/v1`. Don't leak by rendering raw sheet fields.
- **Motion respects `data-motion` + reduced-motion.** Every Motion animation goes through the bridge in
  `ANIMATION_SYSTEM.md`. `data-motion="off"` and reduced-motion must truly collapse motion.
- **Schema changes are additive / Zod-only** where possible (no DB migration unless genuinely required). The
  `newPlayer` flag and any companion-mode preference should be additive.
- **Mobile-first.** Genuinely nice on mobile even if it's a *different* layout than desktop. 44px (`--pf-tap`)
  touch targets, safe-area insets, no horizontal body scroll.

## The gate (run before "done")

```bash
pnpm lint && pnpm test && pnpm typecheck
NODE_OPTIONS=--max-old-space-size=7168 pnpm build   # prod build = the definitive whole-app typecheck + RSC guard
```

**Environment gotcha:** on this machine root `tsc`/`next lint` OOM on the full app graph. Typecheck the two
packages directly (`cd packages/pathforge-schema && npx tsc --noEmit`, same for `pathforge-rules-pf1e`) and use
a narrowed `tsconfig` (`include` only the changed app files, `skipLibCheck`) for app-level type coverage; the
prod build with the 7GB heap is the definitive whole-app typecheck. Verify UI changes in a real browser where a
session allows (companion/editor flows need auth + a character).

## Design system quick reference

Themes on `<html>`: `obsidian` (default dark), `parchment` (light), `high_contrast`. Tokens are `--pf-*` in
`app/globals.css`, mapped to Tailwind colors via `@theme inline` (`bg-surface`, `text-foreground`,
`text-muted-foreground`, `text-gold`, `text-rune`, `border-border`, …). Gold `#f0b35a`, rune-blue `#67d5ff`,
radius `0.75rem`, tap `44px`. Icons via `<GameIcon>` (CSS-mask over `currentColor`). The mockups in `mockups/`
use the real tokens — treat them as the visual target, not pixel-exact law.

## Suggested kickoff prompt for the new Fable chat

> Read `docs/S6_UX_OVERHAUL/MASTER_PLAN.md` and the pillar docs. Start Pillar 1 (companion sheets). Work as the
> leader and spawn **Sonnet 5** subagents for the parallel implementation + adversarial-review legs. Ship the
> first slice (the Simple companion *read* view), gate it green, adversarially review it, then commit. Then
> continue through the sequence. Keep the `useCharacterEditor` contract and the RSC/privacy invariants intact.
