# S6 · Viewers Design Language — unifying read / share / GM with the editor

> **STATUS: SHIPPED (2026-07-09, `fff6133`/`89d0d0c`).** The shared `stat-tile.tsx`/
> `section-card.tsx` (with the `accent`/`className` prop)/`severity-pill.tsx` extraction landed
> as a byte-identical extraction commit, then a restyle commit, per the §7 risk note — plus
> `ShareHero` on `/c/[publicSlug]` (with the `#full-sheet` anchor CTA), the `AuditReport`
> severity strip + GM status pills, and the Combat-only accent bar. One deliberate narrowing vs.
> §3.1: the shipped `pf-hover-lift` on Companion/Familiar cards is CONDITIONAL (only when the
> owner-only master link actually renders), not a blanket extension. Privacy + RSC review angles
> came back clean. See CLAUDE.md's "S6 UX overhaul" entry. Kept below as the design record.

Part 4 of 4 in the S6 UX overhaul (`docs/S6_UX_OVERHAUL/`). Ships **LAST**, deliberately — the owner's
own framing: "make [the editor mockups] function and be implemented, THEN work on the design language
of the Viewers to match these next too." Pillars 1–3 make the create/edit side fluid and prove a shared
component set (chips, stat-tiles, section shells, Motion recipes); Pillar 4 brings the **read-only
surfaces** — Modern dashboard, Classic sheet, public share, GM audit, and the new companion read view —
into that same visual language. This is a **design-only pass**: no new privacy surface, no new data path.

Design reference: `docs/S6_UX_OVERHAUL/mockups/viewer.html` (new — ships with this doc) — three
labeled zones (Modern read view, public share, GM audit) built from the exact same `--pf-*` tokens and
chip/tile primitives as `mockups/editor-canvas.html` and `mockups/companion-sheet.html`. Read all three
mockups side by side before touching a real component; the point of Pillar 4 is that a screenshot of
the editor and a screenshot of the read view should look like they came from the same designer.

## 1. Goal — one cohesive design language, editor leads

Today the editor (post S6 Pillars 1–3) and the read/share/GM surfaces are **visually related but not
unified**. Grounding in the real components confirms this precisely:

- `components/character/character-dashboard.tsx` (`CharacterDashboard`, 1645 lines) already uses a
  disciplined structure — a wiki `InfoBox` (portrait + facts `<dl>`), bento `StatTile`s, `SectionCard`s
  with a gold-icon heading, `MiniStat` tiles, `Badge`s — but every one of these is a thin wrapper around
  the generic shadcn `<Card>`/`<CardContent>` (see `StatTile`, `SectionCard`, `DefensesCard` at lines
  ~1508–1626). It has never adopted the specific tokens-and-tile system the S6 mockups define (the
  `surface-raised` tile grid with a colored left accent bar, the `mini-chip`/`StatChip` summary-row
  idiom, the gold-dot section-title convention) because that vocabulary didn't exist yet when the
  dashboard was last touched (2026-06-28 read-view overhaul, pre-dating S6 entirely).
- `components/character/classic-sheet.tsx` (`ClassicSheet`, 616 lines) is a deliberately denser,
  bespoke "paper stat-block" — `Box`/`SaveBox`/`Mini`/`Tracker`/`DefLine` helpers, its own visual
  identity. It reuses the *view-model* and several list components (`SpellListViewer`,
  `PsionicPowerList`, `EntryDetailRow`) but not the dashboard's card/tile helpers, and definitely not
  anything from the editor. It should **stay dense** (that is its purpose) but its tokens, radii, and
  accent discipline should read as "the same app" as Modern and the editor.
- The public share page (`app/c/[publicSlug]/page.tsx`) is the thinnest surface today: a plain header
  ("PathForge" wordmark + "Public character sheet" label), `SheetViewSwitch` rendering
  `CharacterDashboard`/`ClassicSheet` with **no `actions` prop** (nothing to click — correct, since a
  non-owner can't edit), and a footer CTA ("Create your own character"). It builds `vm` with
  `buildCharacterViewModel(..., "public", ...)` exactly like the owner's own overview, but presents
  **no hero moment** and no glanceable "here's what matters" band before the full (long) dashboard.
  For a link a friend clicks cold, this is a missed first impression.
- The GM audit view (`app/(app)/campaigns/[campaignId]/gm/[characterId]/page.tsx` +
  `components/campaign/audit-report.tsx` + `lib/character/audit.ts`) renders `CharacterDashboard` (no
  actions) beside a `GmReviewPanel` and an `AuditReport` card that is **entirely `<ul>`/`<li>` prose**
  (warnings as bulleted `<AlertTriangle>` lines, formula overrides as `<li>` blocks, custom content as
  `Badge`s). A GM triaging 8 characters in a session has no at-a-glance signal — everything requires
  reading, nothing is a scannable pill.
- The companion read view (`components/character/companion-sheet.tsx`, planned by Pillar 1 — **does
  not exist in this repo yet**, ships before Pillar 4 executes) is designed from `companion-sheet.html`
  and *already* uses the target vocabulary (stat-tile grid, `master-link` chip, `grants-card` accent
  card). Pillar 4 must make sure Modern/Classic/share/GM **catch up to it**, not the other way around —
  the companion sheet is a preview of where the read side is going.

**The fix is not a rebuild.** `buildCharacterViewModel` is untouched; every card/section already exists
and is already correctly gated. Pillar 4 re-skins existing render trees onto the shared primitives the
editor pillar proves, re-prioritizes what's above the fold on share/GM, and gives the GM audit a
pill/chip reading instead of a prose list. If a stage's design starts to require a *new* `vm` field or a
different gating rule, stop — that's out of scope for this pass (flag it as a follow-up, don't fold it in).

## 2. The shared design vocabulary to codify

Everything below already exists in at least one of the three mockups (`editor-canvas.html`,
`companion-sheet.html`, and this doc's new `viewer.html`) or the shipped editor code
(`picker-shell.tsx`, `entry-card.tsx`). Pillar 4's job is to **extract it into components the viewers
can import**, not invent new visual rules.

| Primitive | What it is | Where it currently lives / should live |
|---|---|---|
| **Design tokens** | `--pf-bg/surface/surface-raised/surface-sunken/border/text/muted/gold/on-gold/rune/danger/warning/success`, `--pf-radius: 0.75rem`, `--pf-tap: 44px` | `app/globals.css` (already the single source — every mockup just hardcodes the same values for portability) |
| **`StatChip`** | Compact label+score+modifier tile (`stat-tile`/`stat-chip` in the mockups): `surface-raised` bg, `border`, small uppercase label, bold score, gold/rune modifier pill | Already exists in `components/character/editor/picker-shell.tsx` (built for the editor's ability/save chips) — **reuse this exact component from the read side**, don't re-implement `StatTile`'s look-alike math a second time |
| **`SectionCard`** | A card with a gold-dot uppercase title, optional left accent bar (`accent-card`/`.section-card::before` in the mockups) for the "currently important" section (Combat on the dashboard, the active audit severity strip on GM) | Exists informally as `SectionCard` in `character-dashboard.tsx` (~1599) — promote it to a shared file (see §5) and add the accent-bar variant |
| **Chip-summary row (`mini-chip`)** | A one-line "everything visible without opening anything" strip — exactly what Pillar 2's `section-summary.tsx` builds for the editor's collapsed sections | New for viewers: the public-share glance row and the GM severity strip are this same primitive applied to read-only surfaces |
| **`EntryCard`** | Collapsed chips + expand-to-detail disclosure | Exists in `components/character/editor/entry-card.tsx`; the read side's equivalent is already `EntryDetailRow`/`DetailPara` (`components/character/entry-detail-row.tsx`) — these are read-view-native, NOT a fork of `EntryCard`, but they should visually match it (same disclosure chevron, same `surface-sunken` expand panel) |
| **Motion entrances/hover** | `pf-stagger` (dashboard already uses it — `<div className="pf-stagger space-y-3">` at the top of `CharacterDashboard`), `pf-hover-lift` on clickable cards, `pf-fade-in`/`pf-rise` on mount | CSS-only, already wired on the dashboard; extend the SAME classes to Classic/share/GM — do **not** bring the editor's `motion/react` dependency onto these Server-Component-rendered surfaces (see Hard Invariants §4) |
| **Severity/status pills** | `status-pill`/`sev-chip` in `viewer.html` — colored pill (success/warning/danger/rune) with a bold count, used for GM approval state + audit severity | New shared primitive `components/character/severity-pill.tsx` (or extend `Badge` with `variant="warning"/"danger"/"success"` — `components/ui/badge.tsx` likely already has some of these variants; check before adding new ones) |

**Concrete shared components to land** (file-level, see §5 for the full task list):
- `components/character/stat-tile.tsx` — extract `StatTile`/`MiniStat` out of `character-dashboard.tsx`
  into their own file so Classic, the public-share hero band, and the GM audit strip can import the
  identical component instead of three copies drifting apart.
- `components/character/section-card.tsx` — extract `SectionCard`/`DefenseRow` similarly, add the
  accent-bar (`accent`) prop the mockup shows for "the thing that matters most right now."
  the mockup shows for "the thing that matters most right now."
- `components/character/severity-pill.tsx` — new, small, presentational (`tone: "success"|"warning"|
  "danger"|"info"`, `count?: number`), used by the GM audit rewrite.
- These are pure presentational, read-only, take only serializable props — safe to import from any
  Server Component (`CharacterDashboard`, `ClassicSheet`, the GM page, the share page) without
  crossing the RSC boundary in either direction.

## 3. Per-viewer plan

### 3.1 Modern dashboard refinement (`character-dashboard.tsx`)

- Swap `StatTile`/`SectionCard`/`MiniStat`'s internals to the extracted shared components (§2) — same
  props, same call sites, zero behavior change, purely a re-skin to the `surface-raised` tile grid +
  gold-dot heading + accent-bar convention `viewer.html` zone 1 shows for Combat/Defenses.
  the accent-bar treatment goes on **Combat** (the section most players glance at first) as the mockup
  demonstrates — don't accent-bar every card, that defeats the purpose of using it as an emphasis signal.
- Ability scores, Combat, and Defenses become the read-view's `StatChip` grid (reusing the editor's
  actual `<StatChip>` from `picker-shell.tsx` if its prop shape is generic enough — check whether it's
  presentational-only; if it has editor-specific affordances baked in, extract a shared base and have
  both the editor's interactive chip and the read view's static chip wrap it, rather than importing an
  editor-owned component into a Server Component tree).
- Chip-summary rows (the mockup's `chip-strip`) get added under Combat/Defenses cards for the things
  that don't fit a stat tile (attack list preview, AC breakdown) — this is the SAME idea as Pillar 2's
  `section-summary.tsx`, applied read-only. Consider literally reusing `SectionSummary`'s per-section
  chip logic (§2's table) as a shared function both the editor's collapsed-section view AND the
  dashboard's card subtitle call into — one source of "what are the 3-6 things worth showing for
  Abilities/Defenses/Combat/Skills", not two.
- `pf-stagger`/`pf-hover-lift` already applied at the top level — extend `pf-hover-lift` to the
  clickable Companion/Familiar `SectionCard`s (they already link out via `<Link>`) so they read as
  interactive, matching the characters-list/campaigns-list treatment elsewhere in the app.

### 3.2 Classic sheet (`classic-sheet.tsx`)

- Classic **keeps its own identity** (dense continuous stat-block — this is intentional, per its
  original design doc, and Pillar 2's Modern-editor overhaul explicitly preserved the same "Classic
  stays itself" principle). Pillar 4's job here is narrower: align its **tokens and accent discipline**
  with the rest of the app, not its density.
- Concretely: confirm `Box`/`SaveBox`/`Mini`/`Tracker`/`DefLine` use the same `--pf-radius`/border/
  surface-raised treatment as the new shared `StatTile` (they likely already do, since both read from
  the same Tailwind `@theme inline` mapping — this is a verification pass, not a rewrite unless a real
  drift is found).
- Add the gold-dot section-title convention to `Zone`'s heading (`function Zone({ title, icon, ... })`
  at line ~512) if it doesn't already carry one, so a reader flipping between Modern and Classic (the
  `SheetViewSwitch` toggle) sees the same "this app has a visual signature" cue even though the layouts
  differ.
- Do **not** add stat-tile grids or accent bars to Classic's core stat-block — that would blur the two
  layouts' distinct purposes (Classic = maximum density, Modern = curated glanceable). Scope any change
  here to shared tokens/spacing/section-heading treatment only.

### 3.3 Public share (`app/c/[publicSlug]/page.tsx`) — "everything up front" + clear CTAs

This is the highest-value target in the pillar — a cold link click is the app's best marketing moment
and today it's a bare header + the full dashboard.

- Add a **share hero band** above `SheetViewSwitch` (new component, e.g.
  `components/character/share-hero.tsx`, Server Component, `{ vm }` props only): portrait thumbnail +
  name + class line + a glance row of the vm's already-computed HP/AC/Init/saves (`vm.vitals`,
  `vm.header`) — exactly `viewer.html` zone 2. This is **pure re-presentation of fields the page
  already has in `vm`** (no new view-model work) — it's the same data `HeroCard`/`InfoBox` render,
  arranged as a lead banner instead of buried inside the dashboard's grid.
- Two clear CTAs, matching the mockup: a primary gold **"Create your own character"** button (the
  existing footer CTA, promoted to the top) and a secondary **"View full sheet ↓"** ghost button that
  smooth-scrolls to the existing `SheetViewSwitch` content (a plain anchor-link `#full-sheet`, no JS
  needed — or a tiny client leaf exactly like `ShowMore`'s pattern if smooth-scroll needs
  `scrollIntoView`).
- Keep the existing "Public character sheet" chrome label and the bottom CTA (don't remove — a reader
  who scrolls all the way down should still see the same prompt).
- The share page currently passes NO `actions` prop to `CharacterDashboard`/`ClassicSheet` (correct —
  a public viewer has nothing to click on the sheet itself); the hero band's CTAs live OUTSIDE that
  prop, in the page's own JSX, so this doesn't touch the RSC "no function props" boundary at all.
- If the owner has set `visibility: "unlisted"`, keep the current behavior (still fully renders, just
  not discoverable) — the hero band doesn't add or remove any privacy behavior, only presentation.

### 3.4 GM audit view (`AuditReport` + the GM review page)

- Add a **status pill row** at the top of the GM character-review page (`app/(app)/campaigns/
  [campaignId]/gm/[characterId]/page.tsx`) — the review-status `Badge` (`statusMeta`, already computed
  via `reviewStatusMeta(status)`) plus the "changed since approval" warning (`changedSinceApproval`,
  already computed) become the two `status-pill`s in `viewer.html` zone 3, replacing the current
  `Badge`+`Card` combo with the pill treatment (same data, same computation — purely how it's rendered).
- Rewrite `AuditReport`'s **top** into a **severity strip** (new `severity-pill.tsx` instances): counts
  of `audit.warnings.filter(severity==="warning")`, `.filter(severity==="info")`,
  `audit.flaggedEntries.length`, and a computed "clean sections" count — all already on
  `CharacterAudit` (`lib/character/audit.ts`), no new audit-engine work. This strip sits ABOVE the
  existing prose sections (which stay as-is for the detail a GM drills into) — it's an at-a-glance
  summary, not a replacement for the detail.
- Optionally: turn the checklist inside `GmReviewPanel` into `check-chip` pills (done/not-done, dashed
  vs solid border per the mockup) if that panel currently uses plain checkboxes — verify its current
  markup before changing (`components/campaign/gm-review-panel.tsx`, not read in this planning pass —
  read it first when this stage starts).
- `AuditReport` stays a pure presentational component over `CharacterAudit` — no new props, no
  function props, since it's already consumed from a Server Component page.

### 3.5 Companion read view alignment (`companion-sheet.tsx`, from Pillar 1)

- By the time Pillar 4 starts, Pillar 1 has shipped `companion-sheet.tsx` built directly from
  `companion-sheet.html`, which already uses the target vocabulary. Pillar 4's job here is verification,
  not construction: confirm it imports the SAME extracted `StatTile`/`SectionCard` components §2 lands
  (not a fourth copy of the tile-grid CSS), and that its master-link/grants-card accent treatment
  matches the `accent-card` convention now used on the Modern dashboard's Combat card. If Pillar 1
  shipped its own bespoke tile CSS (likely, since it shipped before the extraction), this is the pass
  that DRY's it into the shared component — a mechanical refactor, not a redesign.

## 4. The hard invariants — do not violate these

- **`buildCharacterViewModel` stays the single source.** Every viewer (Modern, Classic, share, GM,
  companion) renders the SAME already-built, already-§15-gated `CharacterViewModel` the page computed
  server-side. Pillar 4 changes how `vm` fields are arranged and styled — it never reads a raw
  `PathForgeCharacterV1` field directly in a viewer component, and it never adds a new `viewer` context
  or a new gating rule. "Everything up front on public/share/GM" means **reordering/re-presenting what
  `vm` already exposes to that viewer context** (e.g. promoting `vm.vitals`/`vm.header` into a hero
  band), not exposing anything `effectiveLevel`/`canSee` (`lib/character/view-model.ts`) would otherwise
  hide. If a stage's design wants a field that isn't in `vm` for that viewer, that's a `view-model.ts`
  change and needs its own scoped review — flag it, don't quietly add it inside a "just styling" PR.
- **RSC boundary — same rule as every other pillar.** `CharacterDashboard`, `ClassicSheet`,
  `CompanionSheet`, `AuditReport`, the new `ShareHero`/`SeverityPill`/`StatTile`/`SectionCard` are all
  Server-Component-safe: `{ vm, actions?: ReactNode, ...serializable }` props only. Never pass a
  function prop into any of these from a Server Component page. Interactive bits (the share page's
  smooth-scroll CTA, any expand/collapse) are children-based client leaves in the `ShowMore`/
  `EntryDetailRow` mold — never make `StatTile`/`SectionCard` themselves take a callback.
- **No Motion (`motion/react`) on the read side.** The editor overhaul's Motion layer (Pillar 2,
  `ANIMATION_SYSTEM.md`) is scoped to `components/character/editor/*` and the wizard's client tree —
  explicitly NOT imported into `components/ui/*` shared primitives "unless a specific primitive's
  animation need is confirmed to justify it." The read viewers are Server Components; adding Motion to
  them would force a client-component conversion of surfaces that today render server-side (fast,
  cacheable, no hydration cost). Pillar 4 uses ONLY the existing CSS `pf-*` utilities
  (`pf-fade-in`/`pf-rise`/`pf-stagger`/`pf-hover-lift`) — already gated by `data-motion` +
  reduced-motion in `app/globals.css`, already used on the dashboard today. If a specific read-view
  interaction genuinely needs Motion (e.g. a future expand-in-place on a read-only `EntryDetailRow`),
  that's a scoped follow-up requiring its own client-boundary review, not something to fold into this
  design pass.
- **Never bypass §15 privacy gating from a component.** `visible()`/`canSee()`/`effectiveLevel()` in
  `lib/character/view-model.ts` are the only gate. A viewer component must never contain its own
  "should I show this" logic based on raw sheet data — if a section is absent from `vm`, the viewer
  renders nothing for it (already the pattern; e.g. `vm.wealth` is `undefined` when hidden and
  `showWealth` in `CharacterDashboard` already handles that correctly). Pillar 4's new hero/pill
  components inherit this by construction (they only ever receive `vm`, never the raw character).
- **Mobile-first, 44px targets, no horizontal body scroll.** The share hero's CTA row, the GM severity
  strip, and any new chip row must wrap on narrow viewports (the mockup's `@media (max-width: 860px)`
  rules are the reference breakpoint) and any tappable element (the share page's "View full sheet"
  ghost button, a future audit-checklist chip) must hit `--pf-tap` (44px) — reuse the existing
  `tap-target` utility class rather than hand-rolling new touch CSS.

## 5. File-level task list

**Design:**
1. `docs/S6_UX_OVERHAUL/mockups/viewer.html` — ships with this doc (three zones: Modern read view,
   public share hero, GM audit pills). Treat as the visual target; refine only if real data reveals a
   gap once wired up.

**Shared components (land first — everything else depends on these):**
2. `components/character/stat-tile.tsx` (new) — extract `StatTile`/`MiniStat` out of
   `character-dashboard.tsx`; re-export from the dashboard for backward compatibility during the
   transition, or update all call sites in one commit (prefer the latter — smaller blast radius since
   this file is only consumed within `components/character/*`).
3. `components/character/section-card.tsx` (new) — extract `SectionCard`/`DefenseRow`; add an
   `accent?: boolean` prop rendering the gold left bar from `viewer.html`'s `.accent-card`.
4. `components/character/severity-pill.tsx` (new) — `{ tone: "success"|"warning"|"danger"|"info",
   label: string, count?: number }`, pure presentational.
5. `components/character/section-summary.ts` or similar (new, or shared with Pillar 2's
   `section-summary.tsx` if it lands as a plain function, not a component) — the "3-6 most useful chips
   for section X" logic, callable from BOTH the editor's collapsed-section rows and the dashboard's
   card chip-strip, so the curation logic has one home.

**Per-viewer:**
6. `components/character/character-dashboard.tsx` — swap `StatTile`/`SectionCard` internals to the
   extracted components; add chip-strip rows under Combat/Defenses; accent-bar Combat.
7. `components/character/classic-sheet.tsx` — token/accent alignment pass only (verify, then fix any
   real drift from the shared tokens); gold-dot section-title convention on `Zone`.
8. `components/character/share-hero.tsx` (new) — the public-share hero band, `{ vm }` Server Component.
9. `app/c/[publicSlug]/page.tsx` — mount `<ShareHero vm={vm} />` above `SheetViewSwitch`; add the
   "View full sheet" anchor/scroll CTA; keep the existing footer CTA.
10. `components/campaign/audit-report.tsx` — add the severity-pill strip above the existing prose
    sections (keep the detail sections; this is additive-above, not a replacement).
11. `app/(app)/campaigns/[campaignId]/gm/[characterId]/page.tsx` — status-pill row (review status +
    "changed since approval") replacing the current `Badge`/`Card` combo.
12. `components/campaign/gm-review-panel.tsx` — read it first (not inspected in this planning pass);
    convert its checklist to `check-chip` styling only if it's currently plain checkboxes and the
    change is low-risk.
13. `components/character/companion-sheet.tsx` (from Pillar 1, already shipped by this point) —
    DRY its tile/accent CSS onto the shared components from step 2–3 if it shipped with bespoke styles.

**Tests:**
14. `tests/unit/` — render tests for the new shared components (`stat-tile`, `section-card`,
    `severity-pill`) with representative props; a render test for `ShareHero` with a fixture `vm`
    confirming it never receives (and would error if given) a function prop; extend existing
    `character-dashboard`/`classic-sheet` render tests (find them — likely
    `tests/unit/character-dashboard*.test.tsx` or similar) to cover the swapped internals produce
    equivalent output for a fixture character (no visual regression in the numbers shown, only in the
    styling).

## 6. Sequencing note

**Pillar 4 depends on Pillar 2**, not just by the locked build order but structurally: the `StatChip`/
`Segmented`/section-shell primitives this plan reuses (§2) are proven and stabilized during the editor
overhaul first. Starting Pillar 4 before Pillar 2 ships risks building read-view components against a
chip API that Pillar 2 then changes out from under it. If Pillar 2 lands in stages (per its own
`02_MODERN_EDITOR.md` §6 staged rollout), Pillar 4 should start once at least Stage 1–2 (the animated
canvas + chip-summary rows) are stable — it does not need to wait for Pillar 2's Stage 3–4 (mobile
gesture nav, desktop peek-stack), since those don't change the shared chip/tile component surface.
Pillar 4 does NOT depend on Pillar 3 (the wizard) — the wizard consumes the editor's section components,
not the read-view ones, so Pillars 3 and 4 could in principle run in parallel once Pillar 2 is stable
enough; the locked order (1→2→3→4) is a sequencing preference for a single leader+workforce team, not a
hard dependency between 3 and 4.

## 7. Risks + the gate

- **Visual regression on the dashboard/Classic sheet.** These are the most-used read surfaces in the
  app (every character open, every share link). Extracting `StatTile`/`SectionCard` into shared files
  must be byte-identical in *output* for the existing call sites before any new accent/chip styling is
  layered on — do the extraction and the re-styling as two separate commits so a regression is
  bisectable.
- **RSC function-prop gotcha** (`pathforge-rsc-function-props.md`) applies to every new component in
  this pillar exactly as it does to the existing dashboard/Classic/companion sheets — verify with a real
  page load (`/characters/[id]`, `/c/[publicSlug]`, `/campaigns/[id]/gm/[characterId]`), not just
  jsdom tests, per the established gotcha.
- **Privacy regression via "everything up front."** The share-hero band and the GM severity strip are
  the two places most tempted to "just show one more thing" for impact — every value they render MUST
  trace back to a `vm` field already gated by `buildCharacterViewModel`/`auditCharacter` for that exact
  viewer context. An adversarial review pass for this pillar should specifically try to find a hero-band
  or pill-strip value that bypasses `effectiveLevel`/`canSee` (e.g. reads `computed.summary` directly
  instead of `vm.vitals`) — this is the single highest-severity failure mode for Pillar 4, mirroring the
  2026-06-28 "abilities leaking on public share" bug this codebase has already hit once.
- **Classic's identity dilution.** The temptation to make Classic "look more like Modern" for
  consistency's sake would undo its entire reason for existing (max density, old-school stat-block feel
  per its original design doc). Scope Classic's changes to tokens/accent only, and have the adversarial
  review explicitly check that Classic's information density (rows per screen, etc.) hasn't decreased.
- **Motion creeping onto Server Components.** Given Pillar 2 lands `motion/react` right before this
  pillar starts, a rushed implementation might reach for `motion.div` on a dashboard card "since it's
  right there." Review must confirm zero `motion/react` imports anywhere under
  `components/character/character-dashboard.tsx`, `classic-sheet.tsx`, `companion-sheet.tsx`,
  `share-hero.tsx`, `audit-report.tsx`, or any file consumed by a Server Component page in this pillar.
- **Gate**: `pnpm lint && pnpm test && pnpm typecheck`, then `pnpm build`
  (`NODE_OPTIONS=--max-old-space-size=7168` per the repo's OOM gotcha). Verify visually in a real
  browser for all four surfaces (`preview_start`/`preview_resize` desktop + mobile, obsidian +
  parchment + high_contrast themes — the mockups are obsidian-only, but the shared components must
  theme correctly via the `--pf-*` token mapping, same as every other themed surface in the app) before
  calling any stage done. Ship after an adversarial Workflow review per the project's established
  pattern — privacy-leak and RSC-boundary checks are the two non-negotiable review angles for this
  pillar specifically (see the risks above).
