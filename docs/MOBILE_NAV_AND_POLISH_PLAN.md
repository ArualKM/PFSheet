# Mobile navigation overhaul + editor polish + view-page update — PLAN

Grounded in: live-code nav audit, editor-mobile audit (~360–390px), view-staleness audit, and a
cited UX research pass (NN/g, Material Design 3, Apple HIG, WCAG 2.5.8). Every item is `what · where[file] · why`.
Touch baseline is the house standard `--pf-tap: 44px` (`app/globals.css:30`); anything under it is a regression.

## ✅ Decisions (locked by owner, 2026-06-30)
- **Nav arrangement: Proposal (a).** Top-right avatar menu (settings/profile/sign-out), section switcher → a
  hamburger-triggered bottom sheet, sticky live-stats up top, floating back-to-top, keep the 4-tab bottom bar,
  kill the redundant mobile sidebar drawer. (Rejected (b)'s "Settings as a bottom slot".)
- **Live-stats header: Stacked.** Two thin bars — the 56px app header, then the HP/AC/saves strip flush under
  it. (Merge-into-one-bar deferred as later polish.)
- **Build order: A → B → C** — nav overhaul, then the mobile-polish sweep, then the view-page update. Each ships
  as its own gate-green, adversarially-reviewed, browser-verified increment (same bar as the editor redesign).

> **Status (2026-07-12): A → B → C all SHIPPED, live on prod.** Nav overhaul (A — killed the sidebar
> drawer, avatar account menu, section hamburger bottom-sheet, sticky live-stats at `top-14`, floating
> back-to-top: commits `893d00c`/`0b3b6e7`), the 44px touch-target sweep (B — `842a441`), and the
> view-page completeness pass (C — feat/feature/trait rules-text via `<EntryDetailRow>`, per-class
> archetypes header, at-will spell badge + FCB skill ranks, SLA/racial-mod lines: `1b2f9b1`/`b958d0f`/
> `1eed610`/`40708e8`) are all done. Items below already carry "Shipped deviation" notes where the as-built
> behavior diverged from plan (e.g. A2/A3's shrink-on-scroll decision). See `../CLAUDE.md` ("Mobile +
> view-page plan" note) for the commit-level record.

---

## A) MOBILE NAVIGATION OVERHAUL — ONE recommended arrangement

**The decision.** Adopt the owner's proposal (a) almost wholesale; reject the one part of (b) that puts
Settings in the bottom bar. (a) is the better-sourced layout; (b)'s only distinct idea — Settings as a
bottom-nav slot — loses to the top-right avatar convention (Snapchat/Asana/Spotify) and would burn a
precious bottom slot on a low-frequency action. Net: bottom tab bar stays the sole primary nav; the
killed sidebar is NOT replaced by anything app-level; the only "hamburger" left on mobile navigates
*within a sheet* (the editor's section switcher), not *across the app*.

Final layout, top → bottom: **fixed top bar** (section trigger left on editor pages · avatar menu right)
→ **sticky Live-values strip** (≤56px, shrink-on-scroll) → **section bottom-sheet** (opened by the left
trigger; accordion of the 11 groups) → content → **floating back-to-top** (above the bottom bar) →
**bottom tab bar** (4 primary tabs, kept).

### A1 — Kill the mobile sidebar drawer (the redundancy)
- **What:** Delete `MobileNavDrawer` and its hamburger trigger. 4 of its 5 rows (Dashboard/Characters/
  Campaigns/Compendium) exactly duplicate the bottom tab bar — that is the redundancy.
- **Where:** delete `components/app-shell/mobile-nav-drawer.tsx`; remove the trigger at
  `components/app-shell/app-shell.tsx:50`; drop the now-orphaned `<Logo>`/hamburger imports there.
- **Prereq (do FIRST):** rehome the drawer's 3 unique payloads — Settings, theme toggle, user/sign-out —
  into the top-right avatar menu (A4). Settings has NO mobile entry today (`nav-items.ts:22` lacks a
  `mobile` flag), so it MUST land somewhere before the drawer dies or it becomes unreachable on mobile.
- **Then:** `SidebarNav`'s `compact` prop (`components/app-shell/sidebar-nav.tsx:16,56,66-67`) loses its
  only mobile consumer — verify no other caller, then delete the prop + branch.
- **Why:** every destination should have exactly one obvious home; visible nav for primary, hidden only
  for secondary. Duplicating primary links in both a drawer and the bottom bar is the canonical anti-pattern.

### A2 — Section switcher → a hamburger-triggered bottom sheet (replaces the pseudo-dropdown)
- **What:** Keep the existing `SectionSheet` bottom-sheet LIST; change its trigger from the inline
  `<select>`-style pseudo-dropdown (chevron-up-down framing) to a dedicated **hamburger** button. Drop the
  `ChevronsUpDown` glyph so it stops reading as a form input.
- **Where:** trigger at `components/character/editor/character-editor.tsx:634-641` (inside `SectionSheet`,
  `:617-679`); the bottom-sheet Dialog content (`:643-677`) is reusable as-is. Dock the new hamburger in
  the editor's mobile top-bar slot (A4), not inline in the content column.
- **Why:** 11 groups + sub-tabs is 2-level hierarchy with too many siblings for a segmented/tab control
  (good only for 3–5). An accordion is the right pattern for 2–3 levels; a **bottom sheet** (opens from the
  bottom = thumb zone) beats a top slide-in drawer. This also visually disambiguates the two mobile menus:
  bottom *tab* bar = "which area of the app", section *hamburger* = "which part of this sheet".
- **a11y:** the sheet must be `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; focus moves in on
  open and returns to the trigger on close; Tab/Shift-Tab trapped; **Esc closes**. Rows ≥44px (already
  `tap-target`). Prefer native `<dialog>` semantics where practical (free focus-trap + Esc).

> **Shipped deviation (A3):** the strip locks sticky at `top-14` (56px, flush under the header) as specified,
> but **shrink-on-scroll was intentionally NOT implemented** — the collapsed bar is already a single thin text
> row, so an IntersectionObserver shrink buys ~8px for real complexity. On the narrowest phones (~360px) the
> stats can gracefully wrap to a second line (the section trigger was slimmed — icon + ≤5.5rem label — to
> minimise this); we favour full HP/AC/Init/save visibility over a rigid ≤56px cap. Revisit if it bothers in use.

### A3 — Lock the Live-values strip at the very top (sticky, shrink-on-scroll)
- **What:** On mobile, render `LivePreviewBar` FIRST (above the section trigger), pinned flush under the
  56px app header; shrink-on-scroll-down / expand-on-scroll-up (do NOT hide — players want HP/AC visible
  while scrolling). Keep it ≤56px, read-only (HP/AC/Init/F·R·W).
- **Where:** `components/character/editor/character-editor.tsx:521-522` (render order) + `:681-720` (bar);
  reconcile its `sticky top-20` (`:688`) with the real `h-14`=56px header (`app-shell.tsx:48`, `top-0 z-30`).
  Set it `sticky top-14` on mobile so there's no 24px dead gap, and move it ABOVE the mobile section
  trigger (`:510-519`) in DOM order.
- **Why:** owner goal ("lock stats at the very top"). Two sticky layers (header `top-0`, bar `top-20`)
  currently compete and the bar sits *below* the section picker. Research: sticky mobile headers ≤~50–60px;
  drive the shrink with a CSS sticky + class toggle / `IntersectionObserver`, NOT a naive scroll handler (jank).
- **a11y/touch:** keep any interactive control (quick HP ±) ≥44px; the bar's expand trigger already is.

### A4 — User / settings / sign-out → top-right avatar menu
- **What:** Add an account menu (avatar → Settings · Profile · Sign out) to the mobile top-bar RIGHT
  cluster, beside the theme toggle (or fold theme into the same popover). Small popover, NOT a drawer.
- **Where:** `components/app-shell/app-shell.tsx:53-55` (the `ml-auto … md:hidden` cluster — today it holds
  ONLY `<ThemeToggle>`). Reuse `<UserMenu>` (currently buried in the drawer footer, `mobile-nav-drawer.tsx:46`).
- **Why:** settings/sign-out are low-frequency utility actions; top-right avatar is the established
  convention and it's where the theme control already lives — consolidate one top-right control instead of
  two. Keeps all four bottom slots for real destinations (this is the win over proposal (b)).
- **Touch fix:** `ThemeToggle` is `size="icon"` = 40px (`theme-toggle.tsx:43` → `button.tsx:24`) — bump to
  `icon-touch` (44px) when moved here. The `UserMenu` sign-out (40px) likewise.

### A5 — Floating back-to-top (^) — NET NEW (does not exist)
- **What:** Add a floating `^` button, bottom-RIGHT, appearing only after ~2 viewport-heights of scroll,
  **anchored ABOVE the bottom tab bar** so they never overlap. `aria-label="Back to top"`, ≥44×44px, Enter/
  Space activates, visible focus ring. Smooth `scrollTo({top:0})`.
- **Where:** new component (e.g. `components/app-shell/back-to-top.tsx`), rendered in `AppShell` near the
  bottom nav. Position `bottom: calc(<bottom-bar-height> + env(safe-area-inset-bottom) + 1rem)`; the bar is
  `min-h-14` (56px) + safe area (`mobile-bottom-nav.tsx:13-18`).
- **Why:** owner goal; long editor/read pages qualify. Research: ~2× viewport threshold (300px is too
  eager); a FAB only ~16dp from a bottom bar loses prominence → offset it above the bar (Material guidance).
- **Perf:** gate visibility on an `IntersectionObserver` sentinel, not a scroll handler.

### A6 — Bottom tab bar — KEEP unchanged
- **What:** No change. 4 tabs (Dashboard/Characters/Campaigns/Compendium-as-"Library"), `grid-cols-4`,
  `min-h-14`, active = gold, safe-area padding. This is the canonical primary nav.
- **Where:** `components/app-shell/mobile-bottom-nav.tsx` (whole). `<main>` already has `pb-24` clearance
  (`app-shell.tsx:58`). No Settings tab (it's in the avatar menu, A4).
- **Why:** thumb-zone primary nav for 3–5 destinations; tabs are 1-tap vs a hamburger's ≥2; visible nav
  lifts feature discovery 30–50%.

### A11y musts (all of A) + risks
- **Two distinct menus, distinct behavior:** top-left section trigger (within-sheet, bottom sheet) vs
  top-right avatar (account, popover). They must look/behave differently so neither reintroduces a
  redundant primary-nav drawer. **RISK:** re-creating app-level nav inside the section sheet.
- **Dialog/sheet a11y (section sheet + any popover):** `role=dialog` + `aria-modal` + `aria-labelledby`,
  focus-trap, **Esc**, focus restore to trigger.
- **44px everywhere new:** section-sheet rows, avatar-menu items, back-to-top, the moved theme/user icons.
- **Sticky stacking RISK:** header `z-30` vs Live-bar `z-20` vs section sheet (`z-30`) vs bottom bar
  (`z-40`) vs back-to-top — audit z-index + `top` offsets together so nothing is hidden behind the header
  or the bar.
- **Safe-area RISK:** back-to-top + bottom bar must both respect `env(safe-area-inset-bottom)` (notch phones).

### The one remaining either/or for the owner
**Where does the Live-values strip sit relative to the app header on the editor — flush UNDER the 56px
header (two thin stacked bars), or MERGED INTO the header (one combined bar carrying logo/section-trigger/
avatar on row 1 and HP/AC/saves on row 2)?** Stacked is simpler and lower-risk; merged saves ~24px of
vertical space (precious on mobile) but couples two components. Recommendation: **stacked first**
(ship fast, low risk), revisit merging as polish.

---

## B) MOBILE POLISH — prioritized editor mobile-fix list

Fix the 3 root causes first; they clear ~70% of findings.

### Root-cause fixes (do these first)
- **B-R1 · Button `sm`/`icon` variants are sub-44px and used as PRIMARY controls everywhere.**
  `sm` = `h-8` (32px), `icon` = `size-10` (40px) at `components/ui/button.tsx:21,24`. Make them ≥44px on
  touch viewports — `sm: "h-11 px-3 sm:h-8"`, `icon: "size-11 sm:size-10"` (or sweep in-row buttons to the
  existing `touch`/`icon-touch` variants, `button.tsx:26-27`). Clears the steppers (Spend/Heal/Damage/Cast/
  Rest), every Trash icon, and every picker Add button. **Why:** these are the dense-row tap targets.
- **B-R2 · Hand-rolled `<select>`/`<input>` stuck at `h-8`/`h-9`.** Route through `SelectField`/`NumberField`
  (`fields.tsx` already does `h-11 … md:h-10`) or add `h-11 sm:h-9`. Hot spots: `automation-effects-editor.tsx:
  116,143,189`; `character-editor.tsx:1042,1224,4355` (inline ability select has NO height); mythic/prowess/
  metamagic selects (`spellcasting-editor.tsx:496`). **Why:** consistency with the touch-safe primitives.
- **B-R3 · The two bespoke layouts that a primitive sweep won't fix:** the `AutomationEffectsEditor` effect
  row (B-H3) and the sticky-bar order (covered in A3). These need real responsive restructuring.

### HIGH
- **B-H1 · 44px sweep of in-row buttons** — see B-R1 (`components/ui/button.tsx:21,24`). Single highest-leverage fix.
- **B-H2 · Sticky-bar order / Live-values at top** — see **A3** (`character-editor.tsx:510-522,688`). Owner goal.
- **B-H3 · AutomationEffectsEditor row overflows into a jumble at 360px** — `automation-effects-editor.tsx:109`
  packs 5–7 controls in one `flex flex-wrap`; nested 2 cards deep inside every feat/feature/trait EntryCard
  (`character-editor.tsx:4753,4866,4957`), the narrowest context in the app. Below `sm` use a 2-col grid
  (`grid grid-cols-2 sm:flex sm:flex-wrap`), Target/Bonus-type full-width; bump its `h-9` selects to `h-11 sm:h-9`.
- **B-H4 · Bare sub-44px `<select>`/`<input>`** — see B-R2.
- **B-H5 · Spells-per-day 5-col grid of tiny inputs** — `spellcasting-editor.tsx:241-254`: `grid-cols-5`
  of `px-1 text-xs` inputs at ~50px cols, native spinners unhittable. Use `grid-cols-3 xs:grid-cols-5
  sm:grid-cols-10`, `appearance-none` to drop spinners, larger cell height.

### MEDIUM
- **B-M6 · Editor toolbar competes with sub-tabs** — `character-editor.tsx:524-580`: sub-tabs + Simple/
  Advanced + Undo + SaveStatus share one `flex-wrap` row, wrapping to 3+ lines on Core (5 subs) at 360px.
  Move the Simple/Undo/Save cluster to its own row on mobile, or behind an overflow menu.
- **B-M7 · EntryCard disclosure/Trash borderline** — `entry-card.tsx:46-62`: Edit/Done `h-10` (40px) +
  Trash `size="icon"` (40px). Bump disclosure to `h-11`, Trash to `icon-touch` (folds into B-R1).
- **B-M8 · Picker rows dense; Add button is the 32px sm target** — `picker-shell.tsx:117` + `feat-picker.tsx:194`.
  Add button touch-height (B-R1); consider hiding the type Badge below `sm` to give the name room.
- **B-M9 · ProfileEditor portrait squeezes URL fields** — `character-editor.tsx:4971-4978`: stack portrait
  above the fields below `sm` (`flex-col sm:flex-row`).
- **B-M10 · Optional-system stepper rows + bare checkboxes** — `character-editor.tsx:913-927,1018-1033,
  2005-2028`: buttons covered by B-R1; give the `Psionically focused`/`Hero's Fortune` checkboxes `size-5`
  + padded `<label>`.
- **B-M11 · PsionicsEditor multi-field rows fragment at 360px** — `character-editor.tsx:2057-2100,2121-2145`
  (6 controls + trash, fixed `w-16/w-20/w-36`). Grid below `sm`, or move per-row detail behind an EntryCard
  disclosure like feats/spells already do.

### LOW
- **B-L12 · RaceDetails ability grid** — `character-editor.tsx:3123-3127` (`grid-cols-3`): confirm inputs
  stay ≥44px via NumberField; no change needed.
- **B-L13 · Optional-system inline `h-9` selects** — `character-editor.tsx:1042,1224` (folds into B-R2; rare).
- **B-L14 · ModifierRows trash icon** — `character-editor.tsx:3669-3689,4054-4085` (only the trash is sub-44px; B-R1).
- **B-L15 · SettingsEditor toggle cards** — `character-editor.tsx:2442-2485`: `size-4` checkbox but the whole
  `<label>` card is the target; no action.
- **B-L16 · Languages/Health chip-add** — `character-editor.tsx:2564-2589,3927-3943`: only the sm Add button
  is sub-44px (B-R1); the chip `×` already uses `tap-target`. This is the good model for the rest.

> Note: the redesign's chip-collapse pattern (`EntryCard`, `ClassRow`, `RaceDetails`) is genuinely good for
> mobile — it sidesteps the multi-field-row problem. Remaining pain is concentrated in shared button/input
> sizing (B-R1/B-R2) and the few editors still rendering raw multi-field flex rows (PsionicsEditor,
> AutomationEffectsEditor, spells-per-day) instead of adopting the EntryCard disclosure.

---

## C) VIEW-PAGE UPDATE — editor/engine data the read view must surface (privacy-aware)

All additions stay inside existing §15 section gates (`feats`/`features`/`spells`/`abilities`/identity — all
default public) and preserve owner-only treatment for any `notes`/`augment`/free-text, so nothing leaks on the
public `/c/[slug]` share or `/api/v1`. Files: VM `lib/character/view-model.ts`; read view
`components/character/character-dashboard.tsx`; spell row `components/character/spell-row.tsx`.

### HIGH — the biggest "M12 builder captures it, read view ignores it" gaps
- **C-H1 · Per-class progression + favored-class is invisible** (single biggest gap). Editor/engine capture
  HD/BAB tier/3 save tiers/caster type/favored star per class (`character-editor.tsx:2870-2899`); VM exposes
  only the flat `classLine` string (`view-model.ts:369-370`). Add a `classes` array to the VM header
  (`[{ name, level, hitDie?, favored?, casterType?, archetypes[] }]`, resolved via `resolveClassPreset`);
  render a per-class breakdown in the InfoBox facts (`character-dashboard.tsx:937-953`). **Gate:** identity/
  header (public — class names/levels already public via `classLine`; introduce NO new private leak).
- **C-H2 · Structured archetypes per class are invisible** — `identity.classes[].archetypes[]`
  (`character-editor.tsx:2895-2897`). Bundle archetype names into the C-H1 breakdown (`Rogue 2 — Acrobat`).
  **Gate:** identity/header (public).
- **C-H3 · Feat rules text** (Benefit/Prerequisites/Special/Normal) — captured at
  `character-editor.tsx:4745-4752`, VM drops to `{name,type}` (`view-model.ts:627-630`), read view shows a
  bare badge (`character-dashboard.tsx:273-286`). Add `benefit?/prerequisites?/special?/normal?` to the VM;
  make each feat an expandable row (mirror `SpellRow`). **Gate:** `feats` (public) for rules text; `notes` **owner-only**.
- **C-H4 · Feature description + "Gained at level"** — captured at `character-editor.tsx:4823-4830`, VM drops
  both (`view-model.ts:631-643`). Add `description?`/`level?`; render a `Lvl N` chip + expandable description;
  strong candidate to **group features by `category`** (racial/class/archetype). **Gate:** `features` (public).
- **C-H5 · Trait descriptions** — captured (`character-editor.tsx:4919`), VM drops (`view-model.ts:644-647`).
  Add `description?`, render expand-on-tap. **Gate:** `features` (public, traits already nest there).

### MEDIUM
- **C-M6 · At-will flag on known spells** — `knownSpell.atWill` (`spellcasting-editor.tsx:350-351`) lost in
  `toSpellView` (`view-model.ts:411-429`). Add `atWill?` to `SpellView`, render an "at will" badge in
  `spell-row.tsx:52-66`. **Gate:** `spells` (public).
- **C-M7 · Favored-class skill ranks (FCB skill tally)** — tracked (`character-editor.tsx:2999`), unshown;
  add the per-class FCB skill count to the Advancement card (`character-dashboard.tsx:519-559`).
  **Gate:** `advancement` — already **owner-only** (`view-model.ts:764`); keep there.
- **C-M8 · SLA detail (caster level / description)** — captured (`spellcasting-editor.tsx:537-541`), VM keeps
  only `{name,usesPerDay,used}` (`view-model.ts:470-474`). Add `casterLevel?` + owner-only `notes?`. NOTE:
  the engine does NOT compute SLA save DCs (no SLA handling in `rules-pf1e`) — show the raw formula or skip;
  resolving DCs is a deferred engine pass. **Gate:** `spells`; `notes` owner-only.
- **C-M9 · Racial ability-mod lens** — `identity.raceApplied.abilityMods` (`character-editor.tsx:3066-3160`)
  not shown as an explicit racial breakdown (the net is already baked into scores, so informational). Add a
  small "Racial modifiers" line near the InfoBox or Ability Scores card. **Gate:** `abilities` (public).

### LOW (optional polish)
- **C-L10 · `casterType`/`castingAbility` tag** — already in VM (`view-model.ts:438-439`), unrendered; add a
  small "(Int, prepared)" tag if desired. **Gate:** `spells`.
- **C-L11 · Custom metamagic notes** — owner-bookkeeping; fine to leave unsurfaced.

### Verified NOT a gap (leave as-is)
- **Companions** (`CompanionsCard`) render on the overview page gated by `isOwner`
  (`app/(app)/characters/[characterId]/page.tsx:103`), intentionally OUTSIDE `CharacterDashboard` so they
  never reach the public share. Correct — do not move into the VM/dashboard.
- **advancement/XP** correctly owner-only; **spell/inventory `notes`, psionic `augment`/`description`,
  senses `notes`** correctly owner-only via `isOwnerView`. Spellbook-vs-known lists already render separately.

### Suggested build order
1. **C-H1 + C-H2** (per-class progression + archetypes) — one VM addition + one read-view block; biggest visible gap.
2. **C-H3 + C-H4 + C-H5** (feat/feature/trait rules text + level) — same expandable-row pattern; high value, public gates, owner-only `notes`.
3. **C-M6 + C-M7** (at-will badge, FCB skill count) — tiny, high polish.
4. **C-M8 + C-M9** (SLA detail, racial-mod lens) — informational.
5. **C-L10–C-L11** — optional.
