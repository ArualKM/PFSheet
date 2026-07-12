# Classic Editor — Implementation Plan

**Status: BUILT (2026-07-09, branch `feat/classic-editor`) and MERGED to `main`.** All phases shipped in one pass (the
phasing below was written for a context-limited session; the build session had the full map loaded).
Gate-green (lint / typecheck / 762 tests / prod build), browser-verified via a temporary no-auth
harness page (deleted before commit), adversarially reviewed. §8 below records the as-built design —
it upgrades the baseline §3 layout to a "continuous classic sheet" aesthetic; the plan's invariants
(§5) all hold.

**Original plan (kept for the map + invariants):** planned 2026-07-07. **Owner-locked decisions:**
all-in-one single-page editor that **reuses the existing modern edit cards**, entered via a
**Modern⇄Classic toggle on the edit page**, sharing **one** `useCharacterEditor` state. This doc is
self-contained so a fresh session (Fable 5) can execute it with minimal file loading — the grounded
map is embedded below; you should not need to re-derive it.

Companion read-view precedent: the Classic **read** view (`components/character/classic-sheet.tsx`,
commit `157eb20`) + its `SheetViewSwitch`. The classic *editor* is its editing counterpart.

---

## 1. The one big idea (read this first)

The modern editor's entire state lives in **one hook**, `useCharacterEditor(characterId, initial,
initialVersion)` — called **exactly once** at the top of `CharacterEditor`
(`components/character/editor/character-editor.tsx:195`) and prop-drilled as a single object `ed` to
**every** sub-editor. Every sub-editor is uniformly `ed`-driven: it reads `ed.draft.*` / `ed.computed.*`
and writes via `ed.update((d) => { … })`. There are **no** sub-editors wired via narrow value/onChange
props (the only extra prop anywhere is `advanced: boolean` on `AbilitiesEditor`/`PointBuyPanel`).

**Consequence — the load-bearing constraint:**
> The Classic editor layout must render the *same* sub-editors fed the *same* `ed` object. It must NOT
> call `useCharacterEditor` a second time. Two hook instances ⇒ two drafts, two debounced save-loops,
> two compare-and-swap writers against the same `sheet_version` ⇒ they conflict with each other on
> every keystroke. **One hook, two layouts.**

This is why the read-view's `SheetViewSwitch` (which swaps two independent *server-rendered* `ReactNode`
trees) does **not** translate directly — the editor is a stateful **client** component. The correct shape
is a **layout switch *inside* the client `CharacterEditor`**, above which the single `ed` (and the shared
`advanced` flag + the `ConflictResolver`) live, and below which either the Modern layout or the Classic
layout renders. Both are plain client JSX, so there is **no RSC/function-prop hazard** here — simpler than
the read-view switch.

```
CharacterEditor (client, "use client")            ← owns the ONE useCharacterEditor(ed) + advanced + editLayout
├── header: SaveStatusBadge · Undo · Simple/Advanced · [Modern ⇄ Classic]   ← new toggle here
├── <ConflictResolver> when ed.conflict            ← lift ABOVE the layouts so it shows in either mode
├── <LivePreviewBar ed=… />                         ← shared sticky "Live Values" bar (both layouts)
└── editLayout === "modern"
       ? <ModernEditorLayout ed advanced … />       ← the existing rail + sub-tabs + panel (extracted)
       : <ClassicEditorLayout ed advanced … />      ← NEW: all sub-editors stacked, classic order
```

---

## 2. Grounded map (embedded so you don't have to re-read 6k lines)

`character-editor.tsx` is ~6,150 lines; **all inline sub-editors live in that one file**. You will mostly
touch the `CharacterEditor` function body (`:186`–`:680`) and add one new layout function. Do **not**
rewrite the sub-editors.

### 2.1 The hook API — `CharacterEditorApi` (`use-character-editor.ts:20`)
```ts
type CharacterEditorApi = {
  draft: PathForgeCharacterV1;
  computed: ComputedCharacter;
  status: "saved" | "unsaved" | "saving" | "error" | "conflict" | "offline";
  error: string | null;
  canUndo: boolean;
  conflict: ConflictState | null;
  update: (mutate: (draft: PathForgeCharacterV1) => void) => void;   // the ONLY mutation path
  undo: () => void;
  resolveConflict: (resolved: PathForgeCharacterV1) => void;
};
```
Autosave is automatic (900 ms debounce, single serialized loop, `sheet_version` compare-and-swap, 3-way
merge / `ConflictResolver` on true collisions, offline outbox). There is **no** manual-save fn. `advanced`
(Simple/Advanced) is a separate `useState` in `CharacterEditor` (`:196`). All of this is already tested by
`tests/unit/use-character-editor.test.tsx` — you are not touching the engine, only the layout.

### 2.2 Sub-editor inventory — every one is `{ ed }`-driven (reuse as-is)
The `sections[]` array (`character-editor.tsx:340`) is the source of truth for order + gating. Section →
component:

| Section group | Sub-item → component | Slice edited | Props |
|---|---|---|---|
| **Core** | Character details → `IdentityEditor` (`:3657`) | `identity` | `{ ed }` |
| | Ability scores → `AbilitiesEditor` (`:4076`) | `abilities` | `{ ed, advanced }` |
| | Languages → `LanguagesEditor` (`:2982`) | `languages` | `{ ed }` |
| | Speed → `SpeedEditor` (`combat-editor.tsx:36`) | `combat.speed` | `{ ed }` |
| | Health & wounds → `HealthEditor` (`:4209`) | `vitals`/health | `{ ed }` |
| | *(if `ed.draft.companion`)* Companion → `CompanionEditor` (`:2714`) | `companion` | `{ ed }` |
| **Defenses** | Saving throws → `SavesEditor` (`:4633`) | `saves` | `{ ed }` |
| | Armor class → `ACEditor` (`:4862`) | `defenses.armorClass` | `{ ed }` |
| **Attacks** | Attacks → `CombatEditor` (`combat-editor.tsx:70`) | `combat.attacks` | `{ ed }` |
| **Abilities** | Feats & features → `FeatsEditor` (`:5592`) | `feats`, `features` | `{ ed }` |
| **Skills** | Skills → `SkillsEditor` (`:5065`) | `skills` | `{ ed }` |
| **Spells** | Spellcasting → `SpellcastingEditor` (`spellcasting-editor.tsx:44`) | `spellcasting` | `{ ed }` |
| **Equipment** | Inventory & wealth → `InventoryEditor` (`inventory-editor.tsx:100`) | `inventory`, `wealth` | `{ ed }` |
| **Buffs** | Buff center → `BuffCenter` (`buff-center.tsx:136`) | `buffs` | `{ ed }` |
| **Story** | Profile & backstory → `ProfileEditor` (`:5971`) | `profile` | `{ ed }` |
| **Optional** *(each gated by `isModuleKeyEnabled(ed.draft, key)`, some also if data present)* | Hero Points `HeroPointsEditor` (`:866`) · Honor `HonorEditor` (`:948`) · Stamina `StaminaEditor` (`:1040`) · Mythic `MythicEditor` (`:1110`) · Prowess/ABP `AbpEditor` (`:1360`) · Psionics `PsionicsEditor` (`:2233`) · Spheres `SpheresEditor` (`:1666`) · Path of War `PathOfWarEditor` (`path-of-war-editor.tsx:60`) · Akashic `AkashicEditor` (`akashic-editor.tsx:52`) · Oaths `OathsEditor` (`oaths-editor.tsx:28`) · Background & Occupation `BackgroundOccupationEditor` (`background-occupation-editor.tsx:30`) · Milestones `MilestoneLevelingEditor` (`:2524`) | per-system `character.<x>` | `{ ed }` |
| **Settings** | Optional rules & 3pp → `OptionalRulesEditor` (`:2880`) · Privacy & sharing → `PrivacySharingEditor` (`:2823`) | `rules.*`, `privacy.sections` | `{ ed }` |

The optional-systems list is assembled at `character-editor.tsx:271`–`338` (`optionalSystemItems[]`) with the
exact gating — **reuse that gating logic verbatim** in the classic layout (see Phase 2). Compendium pickers
(`FeatPicker`, `SpellPicker`, `RacePicker`, …) are launched *inside* sub-editors and render as overlays — they
work unchanged because the sub-editors are reused as-is.

### 2.3 Persistence contract to mirror (from `SheetViewSwitch`)
Read-view keys are `pf:sheetView` (global) + `pf:sheetView:${characterId}` (per-char). The **edit** toggle
gets its **own** keys (owner chose a separate edit toggle, NOT a unified pref):
```
const EDIT_LAYOUT_GLOBAL = "pf:editLayout";
const editLayoutKey = (id) => `pf:editLayout:${id}`;   // per-character override wins; write BOTH
type EditLayout = "modern" | "classic";                // default "modern"
```
Read on mount = per-char `??` global; write on toggle = both keys. `CharacterEditor` is already a client
component, but keep the initial state `"modern"` and apply the stored value in a mount `useEffect` (matches
`SheetViewSwitch` and avoids any first-paint surprise).

### 2.4 Routing (unchanged — do NOT add a route)
- Edit page: `app/(app)/characters/[characterId]/edit/page.tsx` — server component, `requireUser()` +
  RLS-gated load, mounts `<CharacterEditor characterId initial initialVersion />`. **The toggle lives inside
  `CharacterEditor`; the edit page does not change** (no new route, no duplicated load/gate/CAS logic).
- "Edit" entry button is in the read page `actions` (`[characterId]/page.tsx:79`).

---

## 3. Classic layout spec (the target UI)

`ClassicEditorLayout({ ed, advanced, setAdvanced })` — a client function. Render all sub-editors on one
scrolling page, in the **classic read-sheet order/grouping**, each wrapped in the existing
`<CollapsibleGroup>` primitive (`components/character/collapsible-group.tsx`) so the long page stays
scannable (core sections `defaultOpen`, optional/settings collapsed).

Order (mirrors `ClassicSheet`):
1. **Identity** (full width) — `IdentityEditor`.
2. **Core stat block** — responsive grid `grid-cols-1 lg:grid-cols-2` (the read view uses 3 cols of tiny
   read tiles; edit cards are wider, so 2 cols on desktop, 1 on mobile):
   - `AbilitiesEditor {advanced}` · `LanguagesEditor` · `SpeedEditor` · `HealthEditor`
   - `SavesEditor` · `ACEditor`
3. **Attacks** (full width) — `CombatEditor`.
4. **Skills** (full width) — `SkillsEditor`.
5. **Spellcasting** (full width) — `SpellcastingEditor`.
6. **Optional systems** (full width, each gated exactly as `optionalSystemItems[]` builds them) — Spheres,
   Psionics, Path of War, Akashic, Oaths, Mythic, Hero Points, Honor, Stamina, ABP, Background & Occupation,
   Milestones. Wrap the whole block so it renders nothing when none are enabled.
7. **Feats & Features** (full width) — `FeatsEditor`.
8. **Buffs** (full width) — `BuffCenter`.
9. **Inventory & Wealth** (full width) — `InventoryEditor`.
10. **Story** (full width) — `ProfileEditor`.
11. *(if `ed.draft.companion`)* **Companion** — `CompanionEditor`.
12. **Settings** (full width, collapsed by default) — `OptionalRulesEditor`, `PrivacySharingEditor`.

Wrap the whole thing in `<fieldset disabled={ed.status === "conflict"}>` (the modern layout does this at the
panel — `:652`) so editing is locked while a conflict is open. Nice-to-have (Phase 3): a compact in-page
anchor "jump to section" nav built from the same section titles (each `CollapsibleGroup` gets an `id`).

---

## 4. Phased plan (each phase ends green: `pnpm lint && pnpm typecheck && pnpm test` + a browser check)

### Phase 1 — Toggle scaffold + shared state (thin vertical slice) ✅ ship first
Goal: prove one `ed` drives two layouts and the toggle persists — before touching all sections.
1. In `CharacterEditor` add `editLayout` state + the §2.3 localStorage read/write (mount effect + a
   `setEditLayout` that writes both keys).
2. Add a **Modern⇄Classic pill** to the editor header next to the Simple/Advanced control (`:583` region).
   Copy the pill markup/aria from `SheetViewSwitch` (`role="group"`, two `aria-pressed` buttons, gold active).
3. **Lift the shared bits above the layouts:** keep `<ConflictResolver … onResolve={ed.resolveConflict}/>`
   (`:641`) and `<LivePreviewBar ed=…/>` (`:566` area) rendered once, above the layout switch.
4. Extract the current modern return JSX (the rail + sub-tabs + panel, `:566`–end) into a local function
   `ModernEditorLayout({ ed, advanced, setAdvanced, …nav state })` — mechanical move, no logic change.
5. Add `ClassicEditorLayout({ ed, advanced, setAdvanced })` rendering ONLY `IdentityEditor` + `AbilitiesEditor`
   for now (+ a "more sections coming" note), wrapped in the conflict `fieldset`.
6. `CharacterEditor` returns: shared header + ConflictResolver + LivePreviewBar, then
   `editLayout === "classic" ? <ClassicEditorLayout …/> : <ModernEditorLayout …/>`.
- **Verify:** toggle flips + persists across reload; edit STR in Classic → switch to Modern → the change is
  there (proves shared draft); SaveStatusBadge goes unsaved→saved once (proves ONE save loop, no double-save).

### Phase 2 — Full section coverage
1. Fill `ClassicEditorLayout` with every section from §3, each in a `<CollapsibleGroup title=… defaultOpen=…>`.
2. Reuse the `optionalSystemItems[]` gating (`:271`–`338`) for the Optional block; reuse the `ed.draft.companion`
   gate for Companion. Factor the gating into a small helper if it's cleaner than duplicating.
3. Pass `advanced` to `AbilitiesEditor`; everything else takes just `{ ed }`.
- **Verify:** every section renders; edit one field in each of ~5 varied sections (identity, skills, a spell via
  the picker, an optional system, inventory) → autosaves → reload → persisted. Toggle an optional module off/on
  and confirm its card appears/disappears without stranding data.

### Phase 3 — Classic density & in-page navigation
1. Apply the §3 responsive grid (core stat block `lg:grid-cols-2`, wide sections full width; mobile all stack).
2. Add the in-page anchor jump-nav (reuse section titles → `id`s; a sticky compact bar or a menu in the
   LivePreviewBar — in classic mode the LivePreviewBar's mobile *section hamburger* should point at this jump
   menu, not the modern `SectionSheet`).
3. Visual pass to the classic aesthetic (Zone-style section headers with the section icons already in `sections[]`).
- **Verify:** desktop 2-col + mobile 1-col both read well; jump-nav scrolls to sections.

### Phase 4 — Mobile, a11y, verify, gate, review
1. Mobile: single-column stack (natural), confirm 44px targets (mostly inherited from the reused cards), keep
   the sticky Live Values bar + back-to-top usable on the long page.
2. Add a unit test: mount `CharacterEditor`, flip to classic, assert an edit made in classic is visible after
   flipping to modern (shared-draft invariant) and that only one save fires. Extend
   `tests/unit/use-character-editor.test.tsx` or add a sibling.
3. Real-browser verification (both layouts, edit round-trip, the conflict path if feasible, an optional system).
4. Gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Then an adversarial Workflow review of the
   diff (per project convention) and fix findings.

---

## 5. Invariants & gotchas (do NOT violate)

- **ONE `useCharacterEditor`.** Never call it inside `ClassicEditorLayout`. Thread the same `ed` in. (See §1.)
- **Don't rebuild sub-editors.** Reuse them; the only extra prop is `advanced` for `AbilitiesEditor`.
- **Keep the modern layout working.** The extraction in Phase 1.4 is a pure move — diff it to confirm no logic
  changed. The modern rail/sub-tabs/`SectionSheet`/`activeSection` machinery is modern-only and simply isn't
  rendered in classic mode.
- **Conflict + fieldset:** render `ConflictResolver` once above both layouts; wrap classic content in
  `<fieldset disabled={ed.status==="conflict"}>` so editing locks during a collision (parity with modern `:652`).
- **Separate persistence keys** (`pf:editLayout*`), independent of the read view's `pf:sheetView*`. (Owner chose
  the standalone edit toggle; unifying later is a trivial key change if ever wanted.)
- **No new route, no edit-page changes.** The toggle is internal to the client `CharacterEditor`.
- **RSC:** everything here is inside the existing client component, so passing `ed`/callbacks between the layout
  functions is fine — but if you ever split a layout into a file imported by a *server* component, never pass a
  function prop across that boundary (project rule; see `pathforge-rsc-function-props`). Not a risk with the
  in-`CharacterEditor` approach.
- **File size:** `character-editor.tsx` is already ~6.1k lines. Keeping `ClassicEditorLayout` in the same file is
  simplest (sub-editors are in scope, no exports needed). A later refactor to split the file is optional and out
  of scope for this plan.

## 6. Fable session playbook (limited access — minimize loading)

1. Read THIS doc first (it embeds the map). Then read only: `character-editor.tsx` `:186`–`:680` (the
   `CharacterEditor` body + `sections[]` + `optionalSystemItems[]`), `sheet-view-switch.tsx` (copy the toggle +
   persistence pattern), and `collapsible-group.tsx` (the wrapper). You should not need the 6k-line remainder —
   the sub-editor names/props are in §2.2.
2. Do the phases in order; **commit at each green phase** (small commits) so limited access doesn't lose progress.
   Phase 1 alone is a shippable, reviewable increment.
3. Gate every phase (`lint && typecheck && test`, `build` before push). Verify in a real browser via the preview
   tools (start `dev`, flip the toggle, edit-in-classic → see-in-modern).
4. Keep diffs surgical; the biggest risk is the Phase 1.4 modern-layout extraction — verify it's behavior-neutral.

---

## 7. Open (nice-to-have, defer unless time)
- Unify read+edit "Modern/Classic" into a single preference (owner picked separate for now).
- ~~Two-way in-page nav highlight (scroll-spy) in classic mode.~~ **Shipped** (see §8).
- Denser bespoke Myth-Weavers-style inline grids for abilities/skills (a *different* editor style; the owner
  chose card-reuse — revisit only if the all-in-one card layout feels insufficiently "classic").

---

## 8. As-built record (2026-07-09)

Everything lives in `character-editor.tsx` (per §5): `ModernEditorLayout` (mechanical extraction — the
modern nav state moved INTO it since it's modern-only), `ClassicEditorLayout`, `ClassicZone`,
`ClassicCell`, `ClassicJumpBar`, `EditorControls` (shared toolbar cluster), plus a `secondRow` slot on
`LivePreviewBar`. Test: `tests/unit/character-editor-layouts.test.tsx` (mounts the FULL CharacterEditor:
shared-draft + single-save-loop invariant, persistence restore).

**Design upgrades over the baseline §3** (goal: the editing twin of `<ClassicSheet>`, not a stack of
gray boxes):
- **One continuous sheet frame** (`rounded-xl border bg-surface shadow-lg`), zones separated by
  hairline `border-t` — echoes the classic read sheet exactly. **No left rail in classic**; the sheet
  gets full width.
- **`ClassicZone` headers** reuse the read sheet's Zone language (gold icon + `font-display` title),
  are collapsible (44px header, aria-expanded/controls), and carry a **live accessory** (AC total,
  feat/buff/item/caster counts) so a collapsed page reads as an informative index. Settings collapsed
  by default; optional systems inside `CollapsibleGroup`s (collapsed when > 2).
- **Zones are built FROM the shared `sections[]` array** — the gating (optional systems, companion) is
  reused structurally, not duplicated. Identity is split out of core; the rest of core + defenses render
  as 2-col `ClassicCell` grids (`lg:grid-cols-2`).
- **Jump nav:** desktop = a sticky **chip rail** rendered as the Live Values bar's second row, with an
  IntersectionObserver **scroll-spy** (the §7 nice-to-have); mobile = the existing full-screen
  `SectionSheet`, repurposed to **jump-and-expand** (every (section, sub) maps to a zone + anchor via
  `jumpTargets`). Anchors use `scroll-mt-28 md:scroll-mt-44`.
- **Motion:** `pf-view-fade` keyed on layout switch (matches `SheetViewSwitch`), `pf-stagger` zone
  entrance — both inherit the `data-motion` gating.

**Deliberate deviations from the plan sketch (§1 diagram):**
- `ConflictResolver` / `LivePreviewBar` / the toolbar are rendered **by each layout** rather than lifted
  above the switch — lifting the bar above would have restructured the modern grid (the bar lives inside
  the modern right column, beside the rail), violating "modern unchanged". Only one layout mounts at a
  time, so the one-instance guarantee holds; the shared `EditorControls` component prevents toolbar
  drift. Because switching layouts remounts the resolver, **the layout pill is disabled while a conflict
  is open** (an in-progress resolution can't be dropped).
- **Jump scrolling is instant (`behavior:"auto"`), synchronous in the effect** — browser verification
  showed Chrome aborts long smooth `scrollIntoView` animations when the scroll-spy re-render invalidates
  layout mid-flight (jump stranded partway), and rAF-deferred scrolling never fires in throttled
  background tabs. Instant scroll lands exactly on the `scroll-mt` offset and matches reduced motion.

**Verification notes (no-session harness):** a temporary `app/dev-classic-editor/page.tsx` mounted the
editor unauthenticated (deleted before commit). Gotchas hit there, for future harness use: the
**offline outbox replays on mount** — a failed save from a previous visit triggers the server action →
`requireUser()` → client redirect to `/login` (clear `pf:outbox:<id>` first); block server-action
fetches (reject on the `Next-Action` header) to keep autosave from redirecting mid-check (the hook
degrades to "Offline — will sync", which is itself a nice status-path check).
