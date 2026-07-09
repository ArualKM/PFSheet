# S6 · Companion Sheets — Simple/Advanced view + editor

Part 1 of 3 in the S6 UX overhaul (`docs/S6_UX_OVERHAUL/`). Ship this pillar FIRST — smallest,
self-contained, and it proves the "third server-rendered node" pattern the editor overhaul will
reuse. Execution model: **you (Fable 5) are the leader** — spawn Sonnet 5 subagents for the
parallel implementation legs and for adversarial review/verification. Every substantive change
ships after an adversarial review + `pnpm lint && pnpm test && pnpm typecheck` (+ `pnpm build`
before calling it done).

Design reference: `docs/S6_UX_OVERHAUL/mockups/companion-sheet.html` — the static mockup (real
`--pf-*` tokens, obsidian theme, desktop + mobile framed side by side) already ships in this folder
as the visual target. Refine it if you like, then wire the real component to match it.

## 1. Goal — why a companion needs a simpler sheet than a PC

A companion (animal companion / familiar / eidolon / cohort / mount) is, today, a normal
`characters` row: full `CharacterDashboard` (wiki infobox, Combat/Defenses cards, spells,
inventory, buffs, feats, the whole 12-tab editor…) for a creature that is usually "a wolf with a
statblock." That's the wrong shape for two reasons:

- **Cognitive overkill.** A familiar or animal companion has ~6 things anyone cares about:
  identity/portrait, base body (size/speed/ability scores/attacks/special qualities), HP/AC/
  saves, the master link status, and (for familiars) the master-benefit it grants. Everything
  else on the full sheet (spells, buffs, feats, inventory, 12 edit tabs) is either empty or noise
  for 95% of companions.
- **The data + engine already exist** (see `packages/pathforge-schema/src/companion.ts`,
  `lib/character/companion-sync-server.ts`, `computed.summary.companion` /
  `computed.summary.masterFamiliars`, and the `CompanionEditor` panel + dashboard "Companion" /
  "Familiar" `SectionCard`s already in `character-dashboard.tsx` / `character-editor.tsx`). This
  pillar is **mostly a presentation layer** over what Phase 9 + the 2026-07-09 companion-system
  fix shipped — a new simple read view + a new simple editor layout, not new rules math.

Improved familiars (fixed creature + extra abilities from an archetype) are the common case and
fit Simple mode perfectly: statblock + a special-abilities list, no manual tuning needed. Only
unusual builds (reflavored creature, hand-tuned attacks, homebrew ability scores) need to drop
into Advanced.

## 2. The model

### 2.1 Read view — a third `SheetViewSwitch` node, RSC-safe

`SheetViewSwitch` (`components/character/sheet-view-switch.tsx`) currently swaps two
server-rendered `ReactNode`s (`modern` / `classic`) by key, no function props, localStorage
persisted per-character + global default. Extend it to a third view:

```ts
type View = "modern" | "classic" | "companion";
const VIEWS: View[] = ["modern", "classic", "companion"];
```

- Add a `companion?: ReactNode` prop (optional — pages that never render a companion just omit
  it). Keep the existing modern/classic contract untouched; this is additive.
- `app/(app)/characters/[characterId]/page.tsx` builds the third node **only when
  `result.character.companion?.type` is set**:
  ```tsx
  <SheetViewSwitch
    characterId={data.id}
    modern={<CharacterDashboard vm={vm} actions={actions} />}
    classic={<ClassicSheet vm={vm} actions={actions} />}
    companion={result.character.companion ? <CompanionSheet vm={vm} actions={actions} /> : undefined}
  />
  ```
  `CompanionSheet` is a new Server Component (`components/character/companion-sheet.tsx`) — same
  shape as `CharacterDashboard`/`ClassicSheet`: takes `vm` (the already-built, already-privacy-
  gated `CharacterViewModel`) + `actions: ReactNode`, no function props, fully serializable. It
  is the READ target for `/c/[publicSlug]` too (that page already builds `vm` the same way —
  reuse this component there, gated the same as modern/classic are today).
- **Auto-select the companion view** when `companion.type` is present: seed `SheetViewSwitch`'s
  initial `view` state from a prop (`defaultView?: View`) computed server-side
  (`result.character.companion?.type ? "companion" : "modern"`), instead of the hardcoded
  `"modern"` in `useState<View>("modern")`. Keep the "matches server, no hydration flash" rule —
  the initial `useState` value must still come from a prop that's identical on server and first
  client render (not from `localStorage`, which stays a `useEffect`-applied override as today).
  The stored per-character override still wins over the auto-default on return visits.
- The view toggle pill (`role="group" aria-label="Sheet view"`) only shows the "Companion" option
  when the `companion` prop is provided — don't show a 3-way toggle on a non-companion character.

### 2.2 Editor — a simple single-scroll layout, Advanced escape hatch

The full editor's `SECTION_GROUPS` rail (Core/Defenses/Attacks/Abilities/Skills/Spells/Equipment/
Buffs/Story/Optional/Settings) is the wrong IA for a companion. Build a **Companion Simple
editor layout** that sits ALONGSIDE the existing Modern/Classic layout toggle already in
`character-editor.tsx` (`ed` from `useCharacterEditor` is unchanged — this is a presentation
fork, exactly like Classic was):

- New layout value, e.g. `"companion-simple"`, selected automatically (same auto-select rule as
  the read view: `ed.draft.companion?.type` set → default to it) with a visible "Advanced" button
  that switches to the existing Modern layout **without leaving the editor** (same `ed` state, no
  navigation) — this is the "Advanced escape hatch."
- **Single continuous scroll, no section rail**: identity header → base body stats → HP/AC/
  saves → attacks → master-link panel → (familiar) master-benefit panel → a collapsed "More"
  disclosure that links into the full section list for anything Simple doesn't cover (feats,
  buffs, inventory, spells for spellcasting eidolons, etc.) — reuse `EntryCard`/`StatChip`/
  `Segmented` from `picker-shell.tsx` for the chip+disclosure look established by the rest of the
  2026-06-30 editor redesign, don't invent a new visual language.
- Reuse existing section components directly where they already fit instead of re-implementing:
  the existing `CompanionEditor` panel (character-editor.tsx line ~3377) for the master-link
  block, the Health editor's HP controls, the Saves/AC chip rows, and `combat-editor.tsx`'s
  attack rows — Simple mode is a **different arrangement of the same editors**, not new state or
  new save logic. This keeps `useCharacterEditor`'s save/undo/conflict contract completely
  untouched (LOCKED decision).
- Mobile: this layout IS the mobile-first target — a companion sheet is exactly the kind of short,
  linear form that should never need the bottom-sheet section navigator. Build it mobile-first
  (44px targets, `grid-cols-1 sm:grid-cols-2` stat tiles) and let it also be the desktop layout
  (no separate desktop variant needed — it's short enough).

### 2.3 Where things branch

| Concern | Branch point |
|---|---|
| Read view selection | `SheetViewSwitch` view state (3-way) + the page passing `companion` node only when `character.companion?.type` is set |
| Editor layout selection | The existing Modern/Classic layout toggle state in `character-editor.tsx`, extended with a third value, auto-defaulted the same way |
| Data/engine | **No branch** — `computeCharacter`, `companion-sync-server.ts`, `companionBlockSchema` are shared unchanged by Simple/Advanced/full-PC sheets alike |

## 3. Simple mode — shown vs hidden

Everything below is **already present on `computed.summary.companion` / the view-model's
`vm.companion` / `vm.familiarBenefits`** (see `lib/character/view-model.ts` lines ~359–378) or on
`vm.header`/`vm.vitals`/`vm.attacks`/`vm.defenses` that every character view already has —
Simple mode is curation, not new computation.

**Shown:**
- **Identity**: name, portrait (`PortraitImage`, plain `<img>` per the owner-reported fix — don't
  regress to `next/image`), companion type + archetype (`vm.companion.type`,
  `vm.companion.archetype`), size/speed from the base body.
- **Base body stats**: ability scores (`vm.abilities` — full grid, this is often the ONLY thing
  a player tunes), the `FamiliarBaseBody`/`AnimalCompanion` attacks list, special qualities text.
- **HP / AC / saves**: `vm.vitals.hp`, `vm.defenses` (AC/touch/flat-footed), `vm.vitals.saves` —
  same numbers the Combat/Defenses cards show on the full dashboard, just presented as compact
  stat tiles instead of full cards.
- **Attacks**: `vm.attacks` (BAB already resolves to the master's for a synced familiar via the
  existing `summary.bab` single-source rule — no new logic needed).
- **Master-link status**: `vm.companion.synced`, `vm.companion.master` (name/level/link to the
  master's sheet), the granted-abilities list (`vm.companion.grantedAbilities`, already
  archetype-aware) — this is a direct port of the existing dashboard "Companion" `SectionCard`
  (character-dashboard.tsx ~595–654), just placed at the top of a shorter page instead of in a
  card grid.
- **Familiar → master benefit** (only when THIS character is a companion that grants one, i.e.
  it's the familiar's own sheet showing what it grants back): `vm.companion.masterBenefit` /
  the granted-abilities Alertness note — read-only, informational.
- **Natural armor adj / SR** (`vm.companion.naturalArmorAdj`, `vm.companion.spellResistance`) —
  small chips, same as today.

**Hidden (pushed behind "Advanced" or the "More" disclosure):**
- Spellcasting/buffs/inventory/feats-features-traits/skills grid/optional-rules systems — a
  companion CAN have these (eidolons especially), but they're not the default; Simple mode links
  out to Advanced for them rather than omitting the data.
- The full Skills table (Simple mode shows only skills with ranks, if any — most familiars have
  none worth editing).
- Buff Center, Spheres/Psionics/Mythic optional panels — essentially always empty on a companion.

## 4. Improved familiars

Improved familiars (fixed creature + an archetype swapping/adding granted abilities, e.g. Mauler's
Increased Strength, Sage's uncapped Int) are **fully data-driven already**
(`FAMILIAR_ARCHETYPE_ALTERS`, `familiarGrantedAbilities`, `familiarStrengthBonus`,
`familiarMaxHp` in `packages/pathforge-schema/src/companion.ts`). Simple mode needs no special
handling beyond what's already there:
- The base body (`FAMILIAR_BASE_BODIES` / `DEFAULT_FAMILIAR_BODY`) + the archetype-adjusted
  granted-abilities list is exactly what Simple mode's "base body" + "master-link status"
  sections already show.
- Str bump (Mauler), natural-armor scaling (Sage's half-master-level), frozen/uncapped Int are
  all folded into `computed.summary.companion` by the engine already — Simple mode just displays
  the resolved numbers, never recomputes them itself.
- The ONE thing to add: surface the archetype's per-ability `note` text (already on
  `vm.companion.grantedAbilities[].note`) inline so a player can see e.g. "Str +1 at master level
  3, +1 every 2 levels" without opening Advanced. This is a template change, not new data.

## 5. File-level task list

**Design:**
1. `docs/S6_UX_OVERHAUL/mockups/companion-sheet.html` — the static mockup already exists (identity
   header, stat-tile row, attacks list, master-link panel, familiar-benefit panel, "Advanced" link,
   desktop + mobile). Treat it as the visual target; refine only if the real data reveals a gap.

**Read view:**
2. `components/character/companion-sheet.tsx` (new) — Server Component, `{ vm, actions }` props,
   no function props. Port the existing dashboard "Companion"/"Familiar" `SectionCard` JSX
   (character-dashboard.tsx ~595–694) plus a trimmed identity/stats/attacks header. Reuse
   `PortraitImage`, `DefensesCard` (already exported-ish — check if it needs exporting from
   character-dashboard.tsx or extracting to its own file), `formatModifier`, `Badge`.
3. `components/character/sheet-view-switch.tsx` — add the `companion` prop + `"companion"` view
   value + `defaultView` prop (server-computed initial state) as described in §2.1. Keep the
   modern/classic behavior byte-identical when `companion` is omitted (regression risk — test it).
4. `app/(app)/characters/[characterId]/page.tsx` — pass `companion={...}` + `defaultView` when
   `result.character.companion?.type` is set.
5. Public share page (find it — `app/(app)/c/[publicSlug]/page.tsx` or similar; grep for
   `buildCharacterViewModel(... "anonymous" ...)`) — same treatment so a shared familiar link
   lands on the companion view by default too.

**Editor:**
6. `components/character/editor/character-editor.tsx` — extend the Modern/Classic layout toggle
   to a third `"companion-simple"` value; auto-select from `ed.draft.companion?.type`; add the
   "Advanced" button that flips to Modern in place (no route change, `ed` untouched).
7. New `components/character/editor/companion-simple-layout.tsx` (or inline in
   character-editor.tsx next to the existing `ClassicZones`/layout components — match whatever
   pattern the Classic layout used) — the single-scroll composition described in §2.2, reusing
   `CompanionEditor`, the Health/Saves/AC editors, `combat-editor.tsx` rows, and
   `picker-shell.tsx` primitives. **Do not fork `useCharacterEditor` or the save loop.**
8. `PrivacySharingEditor`'s existing companion-link row (line ~3504) — verify it still renders
   correctly reached from the new layout (no change expected, just confirm).

**Tests:**
9. `tests/unit/` — a render test for `SheetViewSwitch` covering the 3-way toggle + the
   `companion` prop being optional (old 2-way call sites must not need changes); a render test
   for `CompanionSheet` with a fixture familiar `vm` (reuse/extend
   `tests/unit/companion-master-benefit.test.ts` fixtures where possible). No engine tests needed
   — no new engine surface.

## 6. Risks + the gate

- **RSC boundary**: `CompanionSheet` must take only `vm`/`actions`(ReactNode)/serializable props —
  the HARD RSC gotcha applies here exactly as it does to `CharacterDashboard`/`ClassicSheet`.
  Verify with a real page load (jsdom tests won't catch a function-prop crash), per
  `[[pathforge-rsc-function-props]]`.
- **Auto-select regression**: changing `SheetViewSwitch`'s initial `useState` from a hardcoded
  `"modern"` to a server-computed `defaultView` prop must not reintroduce a hydration mismatch —
  the value must be identical between server render and first client render (it will be, since
  it's derived server-side from the same `character.companion` the page already read; just don't
  let a `useEffect` touch it before the localStorage-restore effect runs).
  test-verified.
- **Existing companion sheets default view**: a companion character created before this ships
  currently opens on Modern (full dashboard). After this ships it'll auto-open on the new Simple
  companion view. This is the intended UX (owner wants companions simpler by default) but confirm
  the localStorage per-character override still lets a user who explicitly picked Modern for
  their companion keep seeing Modern.
- **Don't duplicate state**: Simple and Advanced (Modern) editor layouts must render the SAME
  `ed` from ONE `useCharacterEditor` call — no parallel drafts, no re-fetch on toggle.
- **Gate**: `pnpm lint && pnpm test && pnpm typecheck`, then `pnpm build` (remember
  `NODE_OPTIONS=--max-old-space-size=7168` for the prod build on this machine). Ship after an
  adversarial Workflow review per the project's established pattern (every companion-system /
  editor-redesign pass so far has shipped this way — see CLAUDE.md "Companion system" and
  "Editor chip+disclosure redesign" entries for precedent).
