# PathForge — Secondary Milestones (post-M11)

> Planned work **after** the core 11 milestones (M0–M9 are done; **M10** PWA/offline and **M11**
> polish/QA come next). Captured 2026-06-26 from the product owner's seven asks, each fleshed out by
> a design pass grounded in the current codebase. **Nothing here is scheduled or built yet** — this is
> the backlog of intent, kept so we can pick any item up with context already in hand.
>
> IDs map to the original asks: **S1** point-buy · **S2** `/view` polish · **S3** spells + classes ·
> **S4** 3pp / optional-rules content · **S5** mobile overhaul + native apps · **S6** more features ·
> **S7** final review. Effort tags are rough: **S** < a few days, **M** ~a week, **L** multi-week,
> **XL** a milestone in its own right.

See also: the core roadmap + status in [`CLAUDE.md`](../CLAUDE.md), and the modularity/3pp notes that
S4 builds on (the existing `lib/character/optional-rules.ts` framework).

> **Status update (2026-07-12) — most of this backlog has since shipped, usually via simpler/different
> designs than sketched below; this doc stays as the design record, not a live spec.** Per item:
> - **S1 (Point Buy)** — ✅ shipped.
> - **S2 (`/view` polish)** — ✅ shipped (folded into M11's read-view work and later the "Read-view
>   overhaul" + Pillar-4 viewer-design-language passes).
> - **S3a (spells detail/prepared casting)** + **S3b (prebuilt classes)** — ✅ both shipped
>   (`spell-tables.ts`/`computeSpellcasting`; `class-catalog.ts`, itself later superseded by M12's live
>   compendium-driven class builder).
> - **S4 (3pp / optional-rules content)** — ✅ shipped, but **not** via the `RuleModuleDefinition` registry
>   pattern designed below (that registry/`modules/*.ts` layer, and the `fieldDefinitionSchema`/
>   `formulaPatchSchema` stubs it would have consumed, were never built). The actual shape is simpler and
>   ad hoc per module: `character.<system>` block → `isModuleKeyEnabled`-gated engine `summary.<system>` →
>   gated view-model section → own-file editor → dashboard card. Every module this doc anticipated (Mythic,
>   Psionics, Spheres ×3, Path of War, Akashic, Oaths, Hero Points, Background Skills, Honor, Stamina, ABP,
>   Fractional BAB, Wounds & Vigor, Gestalt) is live — see CLAUDE.md's S4/3pp-epic entries.
> - **S5a (mobile UI overhaul)** — ✅ shipped (`MOBILE_NAV_AND_POLISH_PLAN.md`, then further mobile passes).
> - **S5b (native apps + sync/conflict)** — **partially shipped, and re-scoped.** Phase 0
>   (`threeWayMerge`) and Phase 1 (`sheet_version` + CAS + conflict banner, migration `0016`) shipped **on
>   web only** — see `S5b_NATIVE_APP_PLAN.md`'s own status note. Phase 2 (offline outbox, per-field
>   conflict UI) is deferred. **The native-app half of this section (Expo/React Native, App/Play Store) is
>   SHELVED** — the owner-locked v1 decision (`docs/V1_ROADMAP.md`) is that the **PWA is the mobile
>   story**; no native shell is planned.
> - **S6 (additional features — this doc's own numbering)** — **mostly still backlog.** Shipped from this
>   list: the condition tracker (A3, via the conditions-engine expansion), quick HP adjust (A2, partial —
>   no dedicated Play view), printable-PDF export (E, as V1·6), the feat/class/race/etc. compendium (C1,
>   far bigger in the end — the M12 PFcore epic), and the level-up wizard (D1, shipped 2026-07-12, all 7
>   stages). **Not built:** the dice roller (A1), initiative/encounter tracker (A4), real-time party
>   presence (A5), party page (B1 — the `party_viewer` view-model tier this section counts on still exists
>   unwired), gallery (B2), embeds (B3), a general NPC/monster statblock system (C2 — the companion system
>   covers creature statblocks for PCs, not GM encounters), the build-advisor linter (D2), NL rules lookup
>   (D3), VTT integration (F), and monetization (H). **Do not confuse this doc's "S6" with CLAUDE.md's
>   later, unrelated "S6 UX overhaul"** (companion sheets / Modern editor / wizard / viewers design
>   language, shipped 2026-07-09) — same letter, different initiative.
> - **S7 (full feature review)** — still the standing final gate; treat as ongoing. Every phase above
>   shipped behind its own adversarial review, but a single cross-cutting S7 pass hasn't run as its own
>   milestone.
>
> Live status for all of the above: [`../CLAUDE.md`](../CLAUDE.md).

---

## S1 — Point Buy Calculator (ability scores)

### Overview
- **What:** an embedded, collapsible Point Buy calculator inside the Core → "Ability scores" sub-editor (`AbilitiesEditor` in `components/character/editor/character-editor.tsx`). It lets a player allocate a configurable budget (e.g. 15/20/25) across the six core abilities using the standard PF1e cost table, shows spent/remaining live, and writes the resulting scores back into the sheet. The player can instead keep entering scores manually; point-buy is one optional input mode, never a gate.
- **Why / user value:** new-character creation is the highest-friction moment in a PF1e sheet. Today a player computes point-buy on paper (or a separate site) and types the six numbers in by hand. Embedding the calculator removes that detour, prevents illegal builds (over budget, score <7 or >18 pre-racial), and makes "what if I drop CHA to bump CON" a one-click experiment with live downstream recompute (the editor already re-runs `computeCharacter` on every `ed.update`).

### Core semantics to respect (grounded in the schema/engine)
- `abilityScoreSchema` (`packages/pathforge-schema/src/abilities.ts`) has `score`, `baseScore?`, and typed adjusts (`enhancement`, `inherent`, `drain`, `damage`, `penalty`, `tempAdjust`).
- In `computeAbilities` (`packages/pathforge-rules-pf1e/src/compute.ts`): the **effective base** is `num(score.score, base)`; `base` (the displayed "Base") is `score.baseScore ?? score.score`. Enhancement/inherent/temp are added *on top* and damage/penalty/drain subtracted. So **racial and other permanent modifiers must already be baked into `score.score`** — the engine has no separate "racial" field.
- Decision: **point-buy governs the pre-racial value**; the racial/other modifier is a separate, explicitly-tracked addend, and `score.score` = `pointBuyValue + racial + other`. We must NOT just dump the point-buy number into `score.score`, or applying a +2 racial later would silently double-count.

### Data / schema changes
Add an optional, self-describing point-buy state so the calculator can re-open with its prior allocation, and so the racial split is auditable. Put it on the ability block, not metadata, since it is character data:

- In `packages/pathforge-schema/src/abilities.ts`, extend `abilityBlockSchema`:
  - `pointBuy: pointBuyStateSchema.optional()` — absent means "never used point-buy" (manual mode).
- New `pointBuyStateSchema`:
  - `enabled: z.boolean().default(false)` — whether the calculator currently drives scores.
  - `done: z.boolean().default(false)` — "Mark as done" collapsed state (re-openable).
  - `budget: z.number().int().default(15)` — total points (15/20/25/custom).
  - `system: z.enum(["standard", "custom"]).default("standard")` — cost-table choice (standard PF1e; `custom` reserved for variant tables / 3pp, slots into the optional-rules framework later).
  - `minScore: z.number().int().default(7)`, `maxScore: z.number().int().default(18)` — pre-racial bounds (configurable for variants like "no dump <8" houserules).
  - `allocations: z.record(z.string(), z.number().int()).default({})` — per ability key → chosen pre-racial score (7–18). Record keyed by string so it covers `str…cha` and any custom score.
  - `racial: z.record(z.string(), z.number().int()).default({})` — per ability key → racial/other permanent modifier the player declares, so we can recompose `score.score = allocations[k] + racial[k]`.
- Also extend `abilityScoreSchema` with an optional **provenance** marker so a future "this score came from point-buy" badge / round-trip is possible without re-deriving: `pointBuyBase: z.number().int().optional()` (the pre-racial value last applied). Optional — the `pointBuy` block is the source of truth; this is a convenience mirror per-ability for the manual editor and importers.
- `createDefaultCharacter` (`factory.ts`) needs no change (block is optional), but it's cheap to seed `abilities.pointBuy` absent → manual mode by default. New characters could optionally default `enabled:false, done:false` so the calculator auto-shows on a fresh sheet — see open questions.
- Add the **standard PF1e cost table** as a pure constant + helper in a new `packages/pathforge-schema/src/point-buy.ts` (or in rules — see below). Standard table (score → cumulative cost), the canonical PF1e values:
  - 7→−4, 8→−2, 9→−1, 10→0, 11→1, 12→2, 13→3, 14→5, 15→7, 16→10, 17→13, 18→17.

### Engine changes (`packages/pathforge-rules-pf1e`)
The calculator math is deterministic and testable, and the same cost table is needed by validation, so put the pure functions in the rules package (it already owns "all game math") and re-export:
- `pointBuyCost(score: number, table?): number` — cumulative cost for a single score; throws/returns `null` outside `[minScore,maxScore]`.
- `pointBuySpent(allocations, table): number` — sum of costs.
- `pointBuyRemaining(budget, allocations, table): number`.
- `composeAbilityScore(pointBuyBase, racial, other): number` — the one place that defines `score.score = base + racial + other`, reused by UI and any importer.
- **`computeCharacter` itself needs NO change.** Once the calculator writes `score.score`, the existing `computeAbilities` pipeline (effective score → modifier → AC/saves/attacks/skills) already cascades correctly. This keeps the engine's single-responsibility intact and means the live preview "just works" via the existing `ed.computed`.
- Add `compute.test.ts`/new `point-buy.test.ts` cases: cost table edges (7 and 18), 15-budget legal/illegal builds, racial recomposition (15 pre-racial +2 racial → `score.score===17`, `effectiveScore===17`, modifier +3), and a round-trip (allocate → apply → re-open → allocations preserved).

### View-model / privacy implications
- `lib/character/view-model.ts` already gates `abilities` (the review fix noted in CLAUDE.md). The view-model only emits `{ key, label, score, modifier }` from `computed.abilities` — it never reads `abilities.primary[k].score` raw and never touches `abilities.pointBuy`. So **the point-buy block is automatically excluded** from every public/API surface. No new gating needed, but add an explicit note/test that `buildCharacterViewModel` output contains no `pointBuy`/`racial` keys (build-instructions/character-vs-meta leak guard pattern already used elsewhere).
- No new `PRIVACY_SECTIONS` entry — point-buy is build-time scaffolding, not a shareable section.

### UI / UX flow (fits existing components)
All inside `AbilitiesEditor({ ed, advanced })`, reusing `ed.update`, `ed.computed`, `NumberField`, `Badge`, `Button`, `Card`:

- **Toggle / visibility:**
  - A header row in the abilities sub-editor with a "Point Buy" `Button` (ghost) that toggles `abilities.pointBuy.enabled`/panel open.
  - When `pointBuy.done === true`, render a collapsed one-line summary chip ("Point buy: 15 pts · 0 remaining — Reopen") instead of the full panel; clicking "Reopen" sets `done:false`. This is the "Mark as done → re-openable" requirement.
- **Mode coexistence (point-buy OR manual):**
  - When the panel is open and `enabled`, the six per-ability inputs in the panel are **pre-racial steppers** (− / value / +) bounded to `[minScore,maxScore]`; the existing manual "Score" `NumberField` in each ability card becomes read-only (or shows the composed total with a small "from point buy" badge) to avoid two writers fighting over `score.score`.
  - When `enabled` is false, the panel is hidden/collapsed and the existing manual `NumberField` per ability is the sole editor (today's behavior, untouched).
  - A clear "Switch to manual entry" / "Use point buy" affordance flips `enabled`; switching to manual leaves the last-applied `score.score` values in place (non-destructive).
- **Budget + tracking:**
  - A budget selector (segmented buttons 15/20/25 + a "Custom" `NumberField`) writing `pointBuy.budget`.
  - A live "Spent X / Budget Y · Remaining Z" readout using the engine helpers; `Remaining < 0` shows a destructive `Badge` and disables Apply (or warns), `Remaining > 0` is informational. Each ability row shows its per-score cost.
- **Racial / other modifiers:**
  - A compact per-ability "Racial +/-" input (only shown in advanced or behind a "racial modifiers" disclosure to keep the simple view clean). This drives `pointBuy.racial[k]`.
  - The row displays: `pre-racial (point buy) + racial = total` so the player sees exactly how a +2 racial turns a 15 into a 17. The live ability modifier badge (already in each card) reflects the composed total because Apply writes `score.score`.
  - Future hook: when a race picker / racial-traits module ships (modularity roadmap), it can prefill `pointBuy.racial`; for now it's manual.
- **Apply / Change:**
  - An "Apply" button (label "Apply" first time, "Update scores" when already applied) runs one `ed.update` that, for each key, sets `c.abilities.primary[key].score = composeAbilityScore(allocations[k], racial[k], 0)` and mirrors `pointBuyBase`. This triggers the existing debounced autosave + live recompute. No separate persistence path.
  - Edits to allocations before Apply are staged in the `pointBuy` block (which itself autosaves as part of the draft), so the panel is consistent across tab switches/reloads.
- **Mark as done:** a "Mark as done" button sets `pointBuy.done = true` (and typically applies first if dirty), collapsing to the summary chip. Re-open restores the full panel with prior allocations.
- **Accessibility / consistency:** reuse the existing ARIA-tab/section patterns; steppers get `aria-label`s like the `NumberField` `useId/htmlFor` convention already in `fields.tsx`; the over-budget state is announced (live region) consistent with the buff-center stacking-conflict warnings.

### Persistence: saved, not ephemeral
- The `abilities.pointBuy` block is **part of the canonical character** and saved via the normal `saveCharacterSheetAction` path (it's just more draft state). This is the right call: re-opening the calculator months later to retune a build is a real workflow, and exporters/importers round-trip it for free (PathForge JSON is lossless). The alternative — ephemeral component state — would lose the racial split and force re-deriving point-buy from final scores (impossible once racials are baked in). The only ephemeral piece is the panel open/closed *focus* if we want; even that is better stored in `done` so it survives reloads.

### Rough effort & sequencing
- **Effort: M.** No engine recompute changes, no migration (JSON sheet column, additive optional schema field), no RLS/view-model work. The weight is the pure cost-table + helpers (S), schema additions (S), and the calculator UI inside one existing component (M).
- **Dependencies / ordering:**
  1. Schema: add `pointBuyStateSchema` + extend `abilityBlockSchema`/`abilityScoreSchema`; regenerate nothing (no DB type change — sheet is JSON). Run `parseCharacter` round-trip tests.
  2. Rules: cost table + `pointBuyCost/Spent/Remaining/composeAbilityScore` + unit tests.
  3. UI: rebuild `AbilitiesEditor` with the panel; wire to `ed.update`.
  4. Tests/QA: `pnpm test && pnpm typecheck && pnpm lint`; manual create-character flow.
- No dependency on M10/M11. Slots cleanly before or alongside other editor polish. The `system:"custom"` / variant-table field is the seam for later 3pp point-buy tables via the optional-rules framework (`isModuleKeyEnabled`).

### Open questions / risks
- **Default on new characters?** Auto-show the calculator on a fresh sheet (helps first-timers) vs. keep it opt-in (less clutter for importers/manual users). Leaning opt-in with a prominent "Use Point Buy" CTA when all six scores are still 10.
- **Two writers to `score.score`.** Must make manual `NumberField` read-only while point-buy `enabled` (or detect drift and offer to re-sync) to avoid the calculator and manual entry clobbering each other. This is the main correctness risk.
- **Racial double-count on import.** Imported sheets already have racials baked into `score`. If a user then enables point-buy, we can't safely infer the pre-racial split. Behavior: enabling point-buy on an existing sheet starts from the current `score` as the pre-racial value with `racial:0`, and surfaces a note ("set racial modifiers if these scores include them"). Document this; don't try to auto-decompose.
- **Custom/secondary abilities.** Point-buy is core-six only in PF1e; `allocations`/`racial` are keyed by string so custom scores are ignored by the calculator (manual only). Confirm the panel renders only `ABILITY_KEYS`.
- **Variant cost tables / "Epic" or 3pp.** Reserved via `system:"custom"` + a future table source; out of scope for v1.
- **Budget legality vs. campaign.** A GM might mandate a specific point-buy budget. Out of scope here, but `pointBuy.budget` is exactly the field a future campaign-rules check (M7 surfaces) could validate against — worth a forward note, not v1 work.

Relevant files: `packages/pathforge-schema/src/abilities.ts`, `packages/pathforge-schema/src/factory.ts`, new `packages/pathforge-schema/src/point-buy.ts` (or rules), `packages/pathforge-rules-pf1e/src/compute.ts` (helpers + tests only; `computeCharacter` unchanged), `components/character/editor/character-editor.tsx` (`AbilitiesEditor`, lines ~602–667), `components/character/editor/fields.tsx` (`NumberField`), `lib/character/view-model.ts` (no change; add leak-guard test).


---


## S2 — `/view` page final polish pass

**Overview.** A dedicated polish pass on the public read-only sheet (`/c/[publicSlug]`, rendered by
`CharacterDashboard` through the `anonymous`/`public` view-model). This is QA/polish rather than new
capability, so it is **best folded into M11** — but it is tracked here because it has real
cross-dependencies (notably S3's prepared-spell display and S5a's responsive work).

**Scope.**
- Visual-hierarchy + spacing audit against `docs/mockups/`: consistent card rhythm, typography scale,
  and correctness across all three themes (`obsidian` / `parchment` / `high_contrast`).
- Mobile/responsive correctness (depends on **S5a**) — the dashboard is desktop-first today.
- Surface **S3** additions in read-only form: prepared spells + slots-per-day, and the
  simplified→detailed spell expansion.
- Empty / loading / error states; gated sections should not render empty shells (the view-model
  already returns `null` for hidden sections — make sure the UI omits them cleanly).
- Share affordances: copy-link, the OpenGraph preview (the `/api/v1/public/characters/{slug}/opengraph`
  endpoint already exists), and a clear "this is what's public" signal.
- A11y: heading order, landmark regions, focus order, and contrast in every theme.

**Effort:** M · **Depends on:** S3 (spell display), S5a (responsive) · **Fold into:** M11.

---

## S3a — Spells: simplified/detailed views + prepared casting

### Overview

The spellcasting feature today is shallow: the editor (`components/character/editor/spellcasting-editor.tsx`) lets you add casters with a manual "spells/day · levels 0–9" grid and dump every picked spell into a single flat `knownSpells` list. `preparedSpells` and `spellbook` exist in the schema (`packages/pathforge-schema/src/spellcasting.ts`) but **nothing reads or writes them** — the picker (`spell-picker.tsx`) only ever pushes into `knownSpells`, and the rules engine (`packages/pathforge-rules-pf1e/src/compute.ts`) computes **zero** spell math. The read-only surface is one line: "N spells · M prepared" in `character-dashboard.tsx` and a `{ knownCount, preparedCount }` blob in the view-model.

This milestone delivers three things players actually need:

1. **A per-spell detail view.** Each spell row is compact by default (name + level + school badge) and expands on tap to show the full compendium entry — casting time, components, range, area/target, duration, save, SR, description. The data already lives in `public.spell_compendium` (21 columns incl. `casting_time`, `components`, `range`, `area`, `targets`, `duration`, `saving_throw`, `spell_resistance`, `description`); we just don't surface it.
2. **Real prepared-casting workflow.** When a caster's `casterType` is `prepared` or `spellbook`, support choosing *which* spells fill *which* of the day's slots, tracking spellbook (known list) vs. prepared (today's loadout) vs. cast (`used`). For spontaneous casters keep the known-spells + slots-per-day model and per-level expenditure tracking.
3. **Slots-per-day computation in the engine**, so per-level totals (base table value + ability-bonus spells) are derived instead of hand-typed, and so the read-only `/c/[slug]` page and `/api/v1` endpoints can show "Level 3: 2 of 4 remaining" — privacy-gated through the existing `spells` section.

User value: the sheet stops being a static list and becomes a usable at-the-table spell tracker (prepare in the morning, tick off as you cast), and shared/Discord views show a real spell loadout instead of a bare count.

---

### Data / schema changes (`packages/pathforge-schema/src/spellcasting.ts`)

The existing shapes are close; extend rather than replace so imports (M8) and exports (M9) keep round-tripping.

- **Enrich `spellRefSchema`** with the detail fields cached from the compendium at pick time, so the detailed view (and the public/API surface) does not require a client round-trip to `spell_compendium` and works offline (M10 PWA dependency):
  - `school`, `subschool`, `descriptor`, `castingTime`, `components`, `range`, `area`, `targets`, `duration`, `savingThrow`, `spellResistance`, `description` — all `z.string().optional()`.
  - Keep `compendiumId` as the link for "refresh from compendium". Spells added manually simply leave these undefined.
  - Rationale: cheaper detail rendering, no extra RLS-gated fetch on the public page, and `description` is needed for the share view where the viewer may be anonymous (no Supabase session for the RPC).
- **`spellcasterEntrySchema` — add a derivation toggle and class table inputs** so the engine can compute slots:
  - `effectiveCasterLevel` stays as `casterLevel` (already `numberOrFormulaSchema`).
  - `autoSlots: z.boolean().default(false)` — when true, the engine fills `spellsPerDay[*].total` from a table; when false, the manual grid (current behavior) wins. Default false preserves every existing sheet.
  - `spellsPerDayTable: z.record(z.string(), z.record(z.string(), z.number().int())).optional()` — optional class-progression table keyed `"classLevel" → { "spellLevel": baseSlots }`. Seeded from a constants module (below) when a recognized class is chosen; editable for archetypes/3pp. Keeping it on the sheet (not hardcoded in the engine) fits the modularity roadmap and avoids the engine owning a 27-class data table.
  - `knownPerLevel` (optional, same record shape) — spontaneous "spells known" caps, used to warn when `knownSpells` for a level exceeds the table.
- **`spellSlotsSchema`** already has `total` / `used` / `bonus`. Add `prepared: z.number().int().optional()` (count of slots filled for prepared casters) and treat `bonus` as the ability-derived bonus-spell count. No breaking change (all optional).
- **`preparedSpellEntrySchema`** already has `prepared` + `used` + `metamagicIds`; add `spellbookEntryId: z.string().optional()` to link a prepared instance back to its `spellbook` source (so "prepare from spellbook" can show what's been pulled and validate the spell is known). Add `effectiveLevel: z.number().int().optional()` to record the slot level after metamagic adjustment.
- **New constants** `packages/pathforge-schema/src/spell-tables.ts` (not the engine — schema is the data home, matching how `buff-templates.ts` lives in schema): export `SPELLS_PER_DAY_TABLES: Record<string, …>` for the core full/3-4 casters (Wizard, Cleric, Druid, Sorcerer, Bard, etc.) and `BONUS_SPELLS_BY_MOD` (the standard PF1e bonus-spell-by-ability-mod table). Re-export from `index.ts`.

These are all additive/optional, so `createDefaultCharacter()` (`factory.ts` lines 126-133) needs no change and `parseCharacter()` stays backward-compatible.

---

### Engine changes (`packages/pathforge-rules-pf1e/src/compute.ts`)

Add a spellcasting computation block and a new `ComputedCharacter.spellcasting` field. This is the right home — the project rule is "ALL game math lives in the rules engine, never in components."

- **New function `computeSpellcasting(character, abilities, resolver)`** returning, per caster:
  - `casterLevel: number` — evaluate `casterLevel` (it's `numberOrFormulaSchema`) via the existing `evaluate(...)` against the `CharacterResolver`.
  - `concentration: ComputedValue` — evaluate `concentrationFormula` (default to `@{casterLevel} + @{abilities.<castingAbility>.mod}` when blank). This requires teaching `CharacterResolver.lookup` two new paths: `casterLevel` (the per-caster CL, set via the existing `resolver.local` overlay like skills do) and reuse of the existing `abilities.<key>.mod`.
  - `slotsByLevel: Record<string, { base, bonus, total, used, remaining, prepared }>`:
    - `base` = manual `spellsPerDay[lvl].total` when `autoSlots` is false; else `spellsPerDayTable[classLevel][lvl]` from the schema constants.
    - `bonus` = bonus spells: from `BONUS_SPELLS_BY_MOD` indexed by the casting-ability modifier and spell level (0-level orisons get no bonus), only for prepared/spontaneous slot casters; falls back to the stored `bonus`.
    - `total = base + bonus`; `remaining = max(0, total − used)`.
  - `saveDcByLevel: (lvl) => number` — evaluate `saveDcFormula` (default `10 + spell level + @{abilities.<castingAbility>.mod}`) with `spell level` injected through `resolver.local`.
- **Wire into `computeCharacter`**: after skills (it depends on `abilities` + `resolver`, both already built), add `const spellcasting = computeSpellcasting(...)`, include it on the returned object, and add a compact `summary.spells` (e.g. `{ casterCount, highestSpellLevel, totalSlots, usedSlots }`) for dashboard cards / Discord.
- **Type additions**: extend `ComputedCharacter` with `spellcasting: ComputedSpellcasting[]` and export `ComputedSpellcasting` / `ComputedSpellSlots` from `index.ts` (alongside the existing `ComputedValue` exports).
- Use the existing `evalWith` / `resolver.local` pattern (lines 380-461) verbatim — no new evaluation machinery, no `eval`.

---

### View-model / privacy (`lib/character/view-model.ts`)

Everything must continue to flow through `gate("spells", …)` so the owner's privacy choice is honored on `/c/[slug]` and `/api/v1`.

- **Replace the `{ knownCount, preparedCount }` blob** (lines 185-201) with a structured, gated payload built from `computed.spellcasting`:
  ```
  spellcasting: gate("spells", {
    casters: [{ className, casterLevel, casterType, castingAbility,
                concentration, // number
                slots: [{ level, total, used, remaining, dc }] }],
    prepared: [{ name, level, school, used, prepared, casterId }] | null,
    known:    [{ name, level, school }],
    spellbook:[{ name, level }] | null,
    counts: { known, prepared, spellbook },
  })
  ```
- **Privacy nuance — descriptions are the leak risk.** The full `description` text is fine on a public sheet only if the owner left `spells` public, which `gate()` already enforces. But to mirror the buffs pattern (line 164: non-owners "only see live effects, not toggled-off buffs"), **non-owner viewers should not see per-spell `notes`** (player's private tactical notes) and should see `used/remaining` but not, say, scribe costs. Keep it simple: include `description` (it's public SRD-ish reference data) but strip `SpellRef.notes` for non-owner viewers, consistent with how the buffs section filters.
- This keeps the single-source-of-truth guarantee: `api-shapes.ts` and the public page both read the already-gated `vm.spellcasting`, so a private `spells` section is `null` everywhere automatically (the existing pattern; covered by the "public never leaks private" tests in `tests/unit/view-model.test.ts`).

### API shapes (`lib/character/api-shapes.ts`)

- **`characterStats(vm)`** — add `spellcasting: vm.spellcasting` (null-safe; null if gated). This is the natural home since `stats` already exposes the deeper sheet (abilities/skills/attacks).
- **`characterSummary(vm)`** — add a light `spellSlots` summary only (e.g. `highestLevel`, `slotsRemaining`) so the summary endpoint stays lightweight; no spell lists.
- **`discordCard(vm)`** — optionally append `preparedHighlights` (top few prepared/unused spells) next to `activeBuffs` (line 54), mirroring `topSkills`.
- The **catalog/OpenAPI** (`lib/api/catalog.ts`) is the single source of truth for `/developers` + `/api/v1/openapi.json`, so update the `stats` response model there too, or the docs drift (the M9 review explicitly fixed drift of this kind).

---

### UI / UX (editor + read-only)

**Editor — `spellcasting-editor.tsx` + `spell-picker.tsx`:**

- **Detailed row (both surfaces).** Build a shared `SpellRow` (new `components/character/spell-row.tsx`) that renders the compact line (name, `Badge L{level}`, school) and an expand affordance (chevron / tap) revealing the detail grid from the cached `SpellRef` fields. Use a `<details>`/`<summary>` or a controlled `useState` disclosure with ARIA (`aria-expanded`, `aria-controls`) to match the existing ARIA-tab a11y bar already used in the sheet sidebar. Reuse `--pf-*` tokens; no new theme work.
- **Picker writes detail fields.** Extend `SpellResult` (`spell-picker.tsx` lines 12-19) and the RPC select list to include `subschool`, `casting_time`, `components`, `range`, `area`, `targets`, `duration`, `saving_throw`, `spell_resistance`, `description` (the RPC already returns most of these — see `0009`; just add `area`/`targets` to the `returns table (...)` and select). In `addSpell` (lines 134-144), populate the new `SpellRef` fields. **New migration `0013`** updates `search_spell_compendium`'s return signature (additive columns; keep the grant).
- **Prepared vs. spontaneous modes.** Drive the Spells section off the *primary* caster's `casterType`:
  - **Prepared / spellbook:** show two columns — "Spellbook / Known" (the source list, what's in `spellbook`/`knownSpells`) and "Prepared today" grouped by spell level with a slot counter `prepared / total` per level (total from `computed.spellcasting[i].slotsByLevel`). "Prepare" copies a known/spellbook spell into `preparedSpells` (respecting the slot cap, warn on overflow). Each prepared row gets `used`/`+`/`−` and a "Rest" bulk action that resets all `used` to 0.
  - **Spontaneous:** keep `knownSpells` as the canonical list; render the per-level slot tracker (`used` against computed `total`) with `Cast` (increment `used`) / `Rest` buttons. No `preparedSpells`.
  - Toggle the slots grid to **read-only/derived** when `autoSlots` is on (show computed totals; the manual inputs become the override path when off). Adds an `autoSlots` checkbox next to the caster's type/ability selects (lines 80-109).
- All mutations go through the existing `ed.update((c) => …)` immer-style draft API (`use-character-editor`), so live recompute + debounced autosave + undo all work for free.

**Read-only — `character-dashboard.tsx` (lines 129-144) and `/c/[publicSlug]`:**

- Replace the single count line with: per-caster CL + concentration, a per-level slot summary ("L3: 2/4"), and an expandable prepared/known list reusing the same `SpellRow` (read-only variant — no Cast/Rest buttons). Drives entirely off `vm.spellcasting`, so it's automatically privacy-correct and renders identically for owner/GM/public per gating.

---

### Effort, sequencing, dependencies

Overall **L** (≈ the size of M6 Buff Center: schema + engine + view-model + editor + read-only + a migration + tests).

Suggested passes, each shippable behind an adversarial review (the project's established cadence):

1. **Pass A — schema + engine (M).** Extend `spellcasting.ts`, add `spell-tables.ts` constants, `computeSpellcasting` + `ComputedCharacter.spellcasting`, resolver paths (`casterLevel`, spell-level injection). Unit tests in `pathforge-rules-pf1e` (slots = base+bonus, save DC, concentration, manual-vs-auto). *No deps.*
2. **Pass B — view-model + API + migration `0013` (M).** Gated `vm.spellcasting`, `api-shapes` additions, catalog/OpenAPI update, RPC return-column expansion. Extend `view-model.test.ts` "never leaks private" + `api.test.ts`. *Depends on A.*
3. **Pass C — detail view + picker enrichment (M).** Shared `SpellRow`, picker writes detail fields, read-only dashboard/`/c` rendering. *Depends on B (uses `vm.spellcasting`).*
4. **Pass D — prepared/spontaneous workflow (M).** Prepare/cast/rest UI in the editor. *Depends on A (slot totals) + C (rows).*

Cross-milestone: cached `description` strings benefit **M10 PWA/offline** (no compendium fetch on shared sheets). Slot/DC math is reusable by a future combat-tracker.

---

### Open questions / risks

- **Bonus spells & ability damage:** `BONUS_SPELLS_BY_MOD` should index off the *effective* casting-ability modifier (`computed.abilities[castingAbility].modifier`), which already folds in buffs/drain/damage from `computeAbilities`. Confirm the design intends slots to drop live when the casting stat is damaged below the threshold (PF1e RAW: yes for *preparing*, murkier mid-day) — likely compute from effective mod and note the caveat in the inspector rather than block.
- **Multiclass casters:** the picker keys class slots by `maxCastLevel` per caster (lines 37-46). With auto-slots, each caster computes independently; the UI must scope prepared/known lists by `casterId` (already on `SpellRef` / `PreparedSpellEntry`). Domains/bloodlines/specialist bonus slots (`domain_levels`, `bloodline_levels` exist in the compendium) are **out of scope** for v1 — track as deferred, with the manual override grid as the escape hatch.
- **Compendium coverage gaps:** `spellsPerDayTable` only ships for core classes; archetypes/3pp/`Unchained Summoner` fall back to the manual grid (`autoSlots=false`). Acceptable and consistent with the optional-rules "reveal as it ships" philosophy.
- **Schema size / payload:** caching `description` per spell inflates the character JSON (a 100-spell wizard could add tens of KB). Mitigation: store `description` only for spells actually in `preparedSpells`/`spellbook`, or gzip-at-rest is already handled by Postgres TOAST — but worth measuring against any `import_jobs` size caps (§21.3) and the export size. Flag for the review.
- **Privacy of `notes`:** decision needed on whether per-spell tactical `notes` are owner-only (recommended, mirrors buffs) vs. follow the section gate. Defaulting to owner-only is the safer, leak-proof choice.
- **`saveDcByLevel` as a function** won't serialize into the view-model — materialize it to a `{ level: dc }` map in `computeSpellcasting`'s output (the view-model needs plain JSON).

Key files this milestone touches: `packages/pathforge-schema/src/spellcasting.ts`, new `packages/pathforge-schema/src/spell-tables.ts`, `packages/pathforge-rules-pf1e/src/compute.ts` (+ `index.ts`), `lib/character/view-model.ts`, `lib/character/api-shapes.ts`, `lib/api/catalog.ts`, `components/character/editor/spellcasting-editor.tsx`, `components/character/editor/spell-picker.tsx`, new `components/character/spell-row.tsx`, `components/character/character-dashboard.tsx`, and a new migration `supabase/migrations/0013_spell_search_detail_columns.sql`.


---


## S3b — Prebuilt PF1e Classes + HP / Skill Calculators

### Overview

- **What:** A tap-to-apply preset for each Pathfinder 1e core/base class. Picking "Fighter" (or "Wizard", "Rogue, level 3"…) fills in the parts of the sheet that are mechanically determined by class: class skills, hit die, BAB total, the good/poor save *bases*, skill ranks/level, the favored-class flag, and — for casters — a `spellcasting.casters` entry with the right casting ability + progression. On apply, the user picks an **HP method** (manual / average / max) and a **skill-ranks method**, and the engine-fed stored fields are written for them.
- **Why:** Today, adding a class (`IdentityEditor`, `character-editor.tsx:434-516`) only writes `{name, level}` and asks the user to hand-enter BAB, each save base, max HP, every class-skill checkbox, and skill ranks. Those are the most error-prone numbers on the sheet and the #1 reason a new character is wrong. Presets turn ~15 minutes of table-lookup into one tap, while keeping every value an *editable stored number* (no hidden magic) so the existing formula engine and "Show Math" inspector keep working unchanged.
- **Key constraint discovered by reading the engine:** `computeCharacter` (`compute.ts`) does **not** derive HP/BAB/saves/skills from class data. It evaluates formulas that read *stored* values: `@{combat.bab.total}`, `@{saves.fortitude.base}` (etc.), `health.maxHp`, and per-skill `ranks` / `classSkill`. The skill formula gives the +3 class-skill bonus purely from the row's `classSkill` flag (`compute.ts:443`). **Therefore presets must compute and write those stored numbers** — they feed the existing engine; they do not change it.

### Data source: a TS catalog in `@pathforge/schema`

- Add `packages/pathforge-schema/src/class-catalog.ts`, exported from `src/index.ts` — exactly mirroring how `buff-templates.ts` (`BUFF_LIBRARY`) and `optional-rules.ts` (`OPTIONAL_RULE_MODULES`) already ship static, mechanics-only catalogs. **Not a DB table:** this is static SRD-derived game data (~14 rows), it must be importable by the rules/schema packages "without pulling in any UI or server code" (per `index.ts` header), and it needs zero RLS/per-user state. (Contrast: `spell_compendium` is in the DB because it's 3,034 rows and powers a search RPC — wrong fit here.)
- Proposed type (skill keys reuse the existing `DEFAULT_SKILLS` `key`s from `skills.ts`, ability keys reuse `AbilityKey`):

```ts
export type SaveProgression = "good" | "poor";       // good = level/2+2, poor = level/3
export type BabProgression  = "full" | "three_quarter" | "half"; // matches combat.bab.progression enum
export type ClassPreset = {
  key: string;                 // "fighter", "wizard", …
  name: string;
  hitDie: 6 | 8 | 10 | 12;     // written to identity.classes[].hitDie as "d10" etc.
  bab: BabProgression;
  saves: { fortitude: SaveProgression; reflex: SaveProgression; will: SaveProgression };
  skillRanksPerLevel: number;  // 2 | 4 | 6 | 8 (before Int)
  classSkillKeys: string[];    // subset of DEFAULT_SKILLS keys
  caster?: {                   // omitted for martials
    casterType: "prepared" | "spontaneous" | "spellbook";
    castingAbility: AbilityKey;
    casterLevelProgression: "full" | "two_thirds" | "half"; // CL vs class level
    // progression flags only — actual spells/day come later from a table or stay manual
  };
};
export const CLASS_CATALOG: ClassPreset[] = [ /* ~11 core + base */ ];
```

- **Coverage (deliver-first):** the 11 Core classes — Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Wizard — plus the APG base four (Alchemist, Cavalier, Inquisitor, Oracle, Summoner, Witch) as a "then add" tail. Archetypes are explicitly **out of scope** here (they layer on top; the schema already has `identity.classes[].archetype` and `spellcasterEntrySchema.archetype` as free strings).

### Engine math helpers (where the numbers come from)

These are **pure functions** — put them either in the catalog file or in `@pathforge/rules-pf1e` alongside the other math. They are the only "new game math", and they produce stored numbers, not computed views:

- `babForLevel(prog, level)` → `full`: `level`; `three_quarter`: `floor(level*3/4)`; `half`: `floor(level/2)`.
- `saveBaseForLevel(prog, level)` → `good`: `floor(level/2)+2`; `poor`: `floor(level/3)`.
- `hpForLevel(method, hitDie, level, isFirstClassFirstLevel)` →
  - `"max"`: `hitDie` per level (max at 1st always).
  - `"average"`: 1st level (of the very first class) = full `hitDie`; each subsequent HD = `hitDie/2 + 1`.
  - `"manual"`: returns nothing — user enters per the existing Health editor.
- `skillRanksForLevel(perLevel, intMod, level)` → `max(1, perLevel + intMod) * level` (PF1e floor of 1/level; humans/FCB handled separately as a note).
- **Multiclass:** the per-class helpers run per `identity.classes[]` entry and **sum**. Critical subtlety for fidelity:
  - BAB is the **sum of each class's BAB-for-its-own-level** (PF1e adds fractional-rounded-down BAB per class — already matches `combat.bab.progression` enum semantics). The existing **Fractional Base Bonuses** optional rule (`optional-rules.ts` `fractionalBabSaves`) is the toggle that changes this to fractional summing; v1 can compute non-fractional sum and leave fractional as a follow-up that reads `isRuleEnabled`.
  - **Saves are summed per-class** (each class contributes its good/poor base for its own level), which is why presets must write the *summed* base into the three `saves.*.base` fields, not a single class's value.
  - HP "average": only the **first level of the first class** gets the max; all other levels (including 1st level of a second class) use half+1.

### Schema changes (minimal — name the fields)

- **`identity.ts` `characterClassSchema`** already has `hitDie`, `favoredClass`, `archetype` — no change needed for the core write. **Add two optional provenance fields** so re-apply/merge is safe and the UI can offer "this came from a preset":
  - `presetKey: z.string().optional()` — links the row back to its `ClassPreset.key`.
  - `babProgression` / `saveProgression` — *optional*, only if we want to store per-class progression for fractional-BAB recompute later. (Lighter alternative: derive on demand from `presetKey` by catalog lookup. Recommend **derive from `presetKey`** to avoid schema bloat; store only `presetKey`.)
- **No new fields needed** for HP/BAB/saves/skills storage — they already exist (`health.maxHp`, `combat.bab.total`, `saves.*.base`, `skillEntry.ranks`, `skillEntry.classSkill`). This is the big win: presets are pure writers into existing fields.
- **Spellcasting:** `spellcasterEntrySchema` already has `casterType`, `castingAbility`, `casterLevel` (number-or-formula), `concentrationFormula`, `saveDcFormula`. A preset writes a caster entry with `casterLevel` set to a formula like `@{level.total}` (or class-level once per-class level refs exist) and sensible default DC/concentration formulas. **Optional add:** `spellcasterEntrySchema.classKey`/`presetKey` to tie a caster to its class row for merge.

### The apply / merge function (the heart of the feature)

- Add `applyClassPreset(character, { preset, level, hpMethod, skillMethod, asNewClass | mergeIntoClassId })` to `@pathforge/schema` (pure, returns a new draft; the editor calls it inside `ed.update(...)`). **Merge strategy — never clobber user edits:**
  - **Classes:** push a new `identity.classes` row (or update the matched one by `presetKey`/`id`); recompute `identity.totalLevel` the same way the editor already does (`character-editor.tsx:447`).
  - **Class skills:** for each `classSkillKeys` entry, set `skillEntry.classSkill = true` on the matching row by `key`. **Union, never reset:** only flips `false→true`, never removes a class-skill the user added, and never touches `ranks`/`misc`/`formula`. Repeatable skills (craft/perform/profession — excluded from the factory's default rows) are handled by key-prefix match.
  - **BAB / saves:** these are *summed across all classes*, so the write must be a **full recompute from `identity.classes` (post-mutation)**, not an additive patch — otherwise re-applying double-counts. Write `combat.bab.total` and `saves.{fortitude,reflex,will}.base` = the summed helpers.
  - **HP:** if `hpMethod !== "manual"`, set `health.maxHp` to the summed `hpForLevel` AND append `health.hitDice[]` rows (`hitDiceEntrySchema` exists: `{classId, level, die, rolledOrTaken}`) so the per-level breakdown is preserved and re-derivable. `currentHp` is set to new max only if it was 0 (don't heal/hurt an in-play character).
  - **Skill ranks:** **never auto-distribute** silently. `skillMethod: "manual"` (default) just surfaces the **budget** ("you have N ranks to spend"); `skillMethod: "even"`/`"class-only"` are opt-in conveniences that only fill rows with `ranks === 0`, never overwrite. This respects "import/edit never silently discards data".
  - **Spellcasting:** add a `casters[]` entry only if no caster with the same `className` exists (merge-by-name); never delete spells/spellbook.
  - **Conflict surface:** the function returns a `ClassApplyReport { wrote: string[]; skipped: string[]; warnings: string[] }` so the UI can show "Set BAB to +6, marked 7 class skills, left your custom AC formula untouched."

### View-model / privacy implications

- **None new.** Presets only write stored fields that already flow through `computeCharacter` and then `buildCharacterViewModel`. The view-model gates *sections* (`view-model.ts` `gate()/canSee()`); class names already live in `identity.classes` which the overview/share already render. No new public surface, no new gate. The one thing to verify: a preset must **not** write any rules text (SRD descriptions) into the sheet — keep it mechanics-only like `buff-templates.ts`, so there's nothing license-sensitive to leak via the public API.

### UI / UX flow (fits existing components)

- **Entry point:** the existing `IdentityEditor` "Add class" button (`character-editor.tsx:437`) becomes a small **menu**: "From catalog…" (opens a preset picker) or "Custom (blank)" (today's behavior, preserved). Mirror the Buff Center's library/custom split that already exists in `buff-center.tsx`.
- **Preset picker dialog:** a searchable list of `CLASS_CATALOG` (reuse the same dialog/search affordance as `spell-picker.tsx`). Selecting one shows a **preview card**: hit die, BAB/save progression, skill ranks/level, the class skills it will mark, and (for casters) the casting ability — driven entirely by the catalog row, no I/O.
- **Apply step:** level input + two radio groups — **HP**: Manual / Average (half+1, max at 1st) / Max-per-level; **Skill ranks**: Manual budget / Fill class skills only / Even split. A live "this will write…" summary (the `ClassApplyReport` preview) before confirm.
- **On confirm:** one `ed.update((c) => applyClassPreset(c, …))` call — the editor's existing `useMemo(computeCharacter)` recompute + debounced autosave + undo (`use-character-editor.ts:39,41`) all work unchanged. Undo reverts the whole apply atomically.
- **Re-apply / leveling:** because BAB/saves recompute from `identity.classes`, bumping a class's `level` and re-running the recompute (or just editing level and tapping "Recompute from classes") keeps numbers correct. Offer a subtle "Recompute base stats from classes" action in Identity that re-runs the BAB/save/HP(non-manual) write without re-touching class skills/ranks.

### Effort, sequencing, dependencies

- **Overall: M** (focused; no engine rewrite, no migration, no DB).
  - `class-catalog.ts` + math helpers + unit tests (mirror `optional-rules.test.ts`, `compute.test.ts`): **S**.
  - `applyClassPreset` + merge logic + report + tests: **M** (multiclass summing + non-clobber are the tricky bits).
  - UI (preset picker dialog, apply step, Identity menu wiring): **M**.
- **Dependencies / sequencing:**
  - Independent of M10/M11; can ship now. No migration (pure schema-package + UI).
  - Pairs naturally with a future **S3a "abilities/point-buy"** and a **spells/day table** (the caster preset only sets progression flags; per-level slot counts are a separate table — currently `spellsPerDay` is hand-entered).
  - The **Fractional Base Bonuses** path (`optional-rules.ts`) is the one place to leave a `// TODO reads isRuleEnabled` hook so multiclass BAB/saves can switch to fractional summing later.

### Open questions / risks

- **Re-apply double-counting** is the main correctness risk — mitigated by making BAB/saves/HP a *full recompute from `identity.classes`* rather than additive. Must have tests for multiclass (e.g. Fighter 4 / Rogue 2 → BAB +5, Fort good+poor summed).
- **HP for an in-play character:** writing `maxHp` could surprise someone who rolled HP. Mitigation: default HP method to **Manual** for any class added to a character that already has `health.maxHp > 0` or existing `hitDice[]`; only offer auto methods freely on a fresh sheet.
- **Class-skill removal on un-apply:** if a user removes a preset class, do we un-mark its class skills? Risky (other classes/traits may grant the same skill). Recommend **leave them marked** and let the user uncheck — record provenance in the report instead.
- **Int-to-skill-ranks timing:** skill-rank budgets depend on the Int modifier, which can change after the class is applied (race/items/buffs). The budget should be *advisory and live* (read current `computeAbilities` Int mod), not frozen at apply time.
- **Favored class / FCB:** PF1e FCB (+1 HP or +1 skill rank per favored-class level) interacts with both calculators. v1: set `identity.classes[].favoredClass` + add to `progression.favoredClasses` (already supported, `character-editor.tsx:412`) but treat the FCB *bonus* as a note/manual line, since `hitDiceEntrySchema.favoredClassBonus` exists but isn't yet summed by the engine.
- **Catalog licensing:** keep strictly to mechanical numbers (hit die, progressions, skill list) — the same "mechanics only, no rules text" discipline `buff-templates.ts` and `optional-rules.ts` already follow.

**Key files this design touches:** `packages/pathforge-schema/src/class-catalog.ts` (new), `packages/pathforge-schema/src/identity.ts` (optional `presetKey`), `packages/pathforge-schema/src/index.ts` (export), helpers in `packages/pathforge-rules-pf1e/src/` (or co-located in the catalog), and `components/character/editor/character-editor.tsx` (`IdentityEditor`, ~line 434) plus a new preset-picker dialog modeled on `spell-picker.tsx` / `buff-center.tsx`. No migration; no `computeCharacter` signature change — presets feed its existing stored inputs.


---


## S4 — Preparations for 3pp + Optional-Ruleset Content

### Overview

PathForge already has the *plumbing* for optional rules — `OPTIONAL_RULE_MODULES` (in `packages/pathforge-schema/src/optional-rules.ts`) lists 17 modules (Mythic, Hero Points, Psionics, Spheres of Power/Might/Guile, Path of War, Akashic, etc.), toggles persist to `rules.variants` / `rules.modules` (`packages/pathforge-schema/src/rules.ts`), and `isRuleEnabled` / `isModuleKeyEnabled` already let UI reveal fields. What is missing is the **content layer**: a module currently flips a boolean but contributes no schema fields, no editor section, no view-model gating, and no engine math. CLAUDE.md's "Deferred sheet depth" calls this out explicitly ("per-module field reveals … toggles persist; fields come per module").

S4's job is **not to ship every module** — it is to build the *registry pattern + extension seams* so that adding (say) Hero Points becomes a single self-contained file, not a cross-cutting edit across schema/engine/view-model/editor/migration. The user-facing value: a Mythic or Spheres character can be built/computed/shared *correctly*, and the platform's "deeply customizable PF1e" promise (the reason for the flexible JSON document, per `character.ts` §6) becomes real and incremental.

Crucially, two stub schemas already exist in `common.ts` and are currently **unused** — `fieldDefinitionSchema` and `formulaPatchSchema`. These were planted for exactly this work and the registry should consume them.

### Where module data lives (no new top-level schema blocks)

The canonical document (`pathForgeCharacterV1Schema`) is fixed and privacy-gated section by section. Adding a top-level Zod field per module would explode the schema, break the importers/exporters, and force a schema-version bump every module. Instead, store all per-module sheet state in **namespaced, already-existing extension points**:

- **`rules.modules[].settings`** (`z.record(z.string(), z.unknown())` in `enabledModuleSchema`) — per-character module config and small scalar state (e.g. `hero_points`: `{ pool: 3, max: 5 }`; `mythic`: `{ tier: 4, path: "champion" }`). Already persisted, already round-trips through import/export.
- **`resources.list`** (`resourceDefinitionSchema`, `meta.ts`) — for module *pools* that are genuinely resource-shaped (mythic power, power points, spell points, panache/grit-style). Reuse rather than reinvent: it already has `max` as a `numberOrFormula`, `current`, `per`, and a `formula`. A module declares these instead of inventing a new array.
- **`metadata.custom`** (`z.record`) — escape hatch for free-form module data the importer captured but no field maps yet (mirrors the existing `unmapped` discipline: "import never silently discards data").
- **`formulas.overrides`** + **`buffs`/`features`/`feats` automation** — modules that only add *bonuses* (Elephant in the Room, ABP, Fractional BAB) need **no new state at all**; they emit `AutomationEffect[]` / `FormulaPatch` consumed by the existing `buildModifierIndex` / `evalWith` paths.

This means **most modules require zero `character.ts` change**. Only modules with genuinely new typed structure (Mythic tier/path, psionic power list) need a Zod sub-schema, and those go in a new `packages/pathforge-schema/src/modules/<key>.ts` validating the shape of *its own* `rules.modules[].settings` slice — not a new top-level field.

### The registry pattern (the core of S4)

Introduce a `RuleModuleDefinition` that co-locates everything one module needs, extending the existing `OptionalRuleModule` metadata. New file `packages/pathforge-schema/src/modules/registry.ts` (schema-side, data + pure helpers only — no React, no engine import, to keep the package UI-free per its header doc):

```ts
export type RuleModuleDefinition = OptionalRuleModule & {
  /** Zod schema for this module's rules.modules[].settings slice. */
  settingsSchema?: z.ZodTypeAny;            // built from common.ts primitives
  /** Default settings written when the module is first enabled. */
  defaultSettings?: () => Record<string, unknown>;
  /** Resource pools this module contributes (mythic power, power points…). */
  resources?: ResourceDefinition[];          // resourceDefinitionSchema
  /** Declarative fields surfaced in the editor + reveals. */
  fields?: FieldDefinition[];                 // fieldDefinitionSchema (already in common.ts!)
  /** Engine contributions: passive bonuses + formula patches. */
  effects?: (c: PathForgeCharacterV1) => AutomationEffect[];   // reuses effectToMod path
  formulaPatches?: (c: PathForgeCharacterV1) => FormulaPatch[]; // reuses overrideFor path
  /** Section labels this module adds for §15 gating (see view-model below). */
  privacySections?: { key: string; defaultLevel: PrivacyLevel; label: string }[];
};
```

Each module is one file (`modules/mythic.ts`, `modules/hero-points.ts`, …) exporting a `RuleModuleDefinition`; `registry.ts` aggregates them and `OPTIONAL_RULE_MODULES` becomes a *projection* of the registry (`registry.map(toMetadata)`) so the existing editor/`campaign-modules.ts` consumers keep working unchanged. `isRuleEnabled` / `isModuleKeyEnabled` stay as-is.

**Data-driven vs coded:** pure-bonus modules (ABP, Elephant, Fractional, Background Skills) are **fully data-driven** — just `effects`/`formulaPatches`/`resources`/`fields` arrays, no code. Modules with real conditional logic (Mythic surge interacting with d20s, Spheres caster-level math, kineticist burn reducing pools) keep a small typed `effects(c)` *function* but everything else stays declarative. Start data-driven; promote to a function only when a module needs it.

### Engine changes (`computeCharacter` stays correct as modules add bonuses)

The engine is already module-shaped — it just needs to *also* iterate the registry. In `compute.ts`:

- **Bonuses:** `buildModifierIndex` currently scans buffs, equipped items, and passive feat/trait/feature `automation`. Add one more loop: for each enabled module, call `def.effects(character)` and run each result through the *existing* `effectToMod` → `classifyTarget` → `push` pipeline. Because everything funnels through `applyStacking`, module bonuses obey PF1e stacking automatically (same-type-no-stack, highest-wins) — Mythic and a magic-item enhancement bonus to AC won't double-count. **No new math, no double-counting risk.**
- **Formula patches:** `evalWith` already supports overrides via `overrideFor(character, path)` reading `formulas.overrides`. Add a resolution step that merges registry `formulaPatches` *under* user overrides (user override always wins). `FormulaPatch.mode` (`replace | append_term | wrap`, already in `common.ts`) handles e.g. ABP wrapping AC, Fractional BAB replacing the BAB formula.
- **`classifyTarget` extension:** new domains (e.g. `mythic.power`, `caster.spherePool`) need recognition. Keep `classifyTarget` as the core-stat router but add a registry-supplied passthrough so a module can claim a custom domain bucket the resolver exposes (e.g. `@{mythic.tier}`). The `CharacterResolver.lookup` switch gets a fallthrough that reads `rules.modules[key].settings` / `resources.list` by path before returning `undefined` — letting module formulas reference module state.
- **Determinism / circular-dep safety:** keep the existing two-pass discipline (`baseResolver` → `buildModifierIndex(character, baseResolver)` → full resolver). Module `effects(c)` must read only *base* state, never computed-from-buffs values, mirroring the existing rule that formula-valued effects resolve against the base resolver.

Add a `computeCharacter` regression-test matrix: one fixture per shipped module asserting the delta vs. base (the existing `compute.test.ts` is the home).

### View-model / privacy implications

Module-contributed sections must be privacy-gated like every core section — otherwise enabling Mythic could leak GM-secret tier info on the public `/c/[slug]` view or the `/api/v1` endpoints (both built from `view-model.ts`). The §15 gating in `view-model.ts` is centralized: `DEFAULT_SECTION_PRIVACY`, `effectiveLevel`, and `gate()`. Changes:

- Each module's `privacySections` register into `DEFAULT_SECTION_PRIVACY` and `SECTION_LABELS` (e.g. `mythic → "party"`, `gmSecrets`-style module notes → `"gm_only"`). Also extend the `PRIVACY_SECTIONS` const tuple in `meta.ts` so the privacy editor lists them.
- Add a `moduleSections: Array<{ key; label; data }> | null` field to `CharacterViewModel`, populated via `gate(section, …)` exactly like `buffs`/`skills`. Public viewers never receive a module section they can't see; `hiddenSections` reports it by label — same mechanism that already protects abilities/inventory.
- **Default to conservative:** new module sections default to `"party"` (not `"public"`) so a freshly-enabled 3pp module never over-shares before the owner reviews. This matches the privacy-leak class the M7/M9 adversarial reviews already fixed.

### Versioning / migration when a module is enabled/disabled

The character `schemaVersion` stays `pathforge-character-v1` — modules don't bump it (they live in open `record`/array extension points that already validate). The migration concern is **state lifecycle**, handled in the toggle path, not in `migrateCharacter`:

- **Enable:** when `SettingsEditor.toggleRule` turns a module on, also run `def.defaultSettings()` into `rules.modules[key].settings` and append `def.resources` into `resources.list` (idempotent by `id`). This is the seam to add to the existing `toggleRule` in `character-editor.tsx` (currently it only pushes `{ key, enabled, settings: {} }`).
- **Disable (soft, non-destructive):** flip `enabled: false` (the schema already supports it — `enabledModuleSchema.enabled` defaults true; `isRuleEnabled` checks `enabled !== false`). **Keep** `settings` + resources so re-enabling restores state; just stop the engine/view-model from reading them. This is the safe default and avoids data loss on accidental toggles.
- **Hard remove:** an explicit "remove module data" action prunes `settings`/resources — gated behind a confirm, since it's destructive.
- **Per-module settings migration:** add a `migrate?(old): settings` hook on `RuleModuleDefinition` and a `version` on the settings blob; when a module's `settingsSchema` changes shape later, `parseCharacter` stays green (it's `z.unknown()` at the top level) and the module migrates its own slice lazily on load. This isolates module evolution from the global schema version — the right call given 17 modules will iterate independently.

### Campaign-level module gating (extend what exists)

Campaign gating is partially built: `campaign_characters` / campaign `enabled_modules` jsonb, `enabledModuleKeys()` + `moduleName()` in `campaign-modules.ts`, the §17.2 mismatch+adopt surface in `lib/character/campaign-feedback.ts`, and `EnabledModule.fromCampaign` already exists in the schema as the marker for campaign-pushed modules. S4 additions:

- A campaign **allow-list mode**: when set, the editor's module toggles outside the campaign's `enabled_modules` are disabled with "not allowed in this campaign" (the registry + `enabledModuleKeys` already give both lists; this is UI + a server-side validation in `saveCharacterSheetAction`).
- GM **audit** (`lib/character/audit.ts` already privacy-aware): flag module bonuses the GM hasn't approved, reusing `gmReviewRecommended` / `gmStatus` patterns already in the formula/feat schemas.
- Mark campaign-enabled modules `fromCampaign: true` so the existing feedback surface can distinguish player-chosen vs GM-mandated.

### UI/UX flow (fits existing components)

- **Settings → Optional rules & 3pp** (`SettingsEditor` in `character-editor.tsx`) already renders the toggle grid grouped by `paizo/subsystem/thirdparty`. Extend each card so an *enabled* module expands an inline settings panel rendered **declaratively from `def.fields`** (`FieldDefinition.type` → existing `NumberField`/text/toggle controls). No bespoke editor per module for simple cases.
- **Sheet Sections sidebar** (the ARIA-tab `sections` array in `character-editor.tsx`): a module with a heavier editor (Mythic path/abilities, psionic powers list) contributes a section entry shown **only when `isModuleKeyEnabled`** — the reveal pattern CLAUDE.md describes is finally exercised. Sub-editors live in `components/character/editor/modules/<key>-editor.tsx`.
- **Resources tab** (deferred in CLAUDE.md) becomes the natural home for module pools rendered from `resources.list`; build it in S4 since modules depend on it.
- **Spheres of Power** can reuse the existing spell-compendium picker pattern (`spell-picker.tsx` + `search_spell_compendium`) conceptually for a sphere/talent picker if a sphere table is seeded later (out of scope for S4 prep; note the integration point).
- **Theme:** module UI uses existing `--pf-*` tokens — no new theming.

### Rough effort & sequencing

- **L overall** for the prep milestone (the framework + 1–2 reference modules); each *additional* module afterward is **S** (one registry file + tests), which is the entire point.

Sequence (each step shippable, each behind an adversarial review per project norm):
1. **(M)** Registry types + `modules/registry.ts`; make `OPTIONAL_RULE_MODULES` a projection; wire `defaultSettings`/resource provisioning into `toggleRule`; soft-disable semantics. Pure schema/data — no behavior change to existing sheets. *Depends on:* nothing.
2. **(M)** Engine: registry `effects`/`formulaPatches` loops in `buildModifierIndex`/`evalWith`; resolver fallthrough for module state; per-module compute tests. *Depends on:* (1).
3. **(M)** View-model + privacy: `moduleSections`, `DEFAULT_SECTION_PRIVACY`/`SECTION_LABELS`/`PRIVACY_SECTIONS` registration, conservative defaults, privacy/leak tests. *Depends on:* (1).
4. **(M)** UI: declarative `fields` rendering in `SettingsEditor`, conditional sidebar sections, Resources tab. *Depends on:* (1)–(3).
5. **(S–M)** Two reference modules end-to-end: **Hero Points** (pure subsystem: resource pool + `effects` for the +8/luck-reroll style bonus) and **Mythic** (variant flag + tier/path settings + surge effect) — proving both the `variants` and `modules[]` storage paths and both data-driven + coded `effects`. *Depends on:* (1)–(4).
6. **(M)** Campaign gating: allow-list enforcement in `saveCharacterSheetAction`, `fromCampaign` marking, GM audit of module bonuses. *Depends on:* (1)–(5) + existing M7 campaign layer.

### Open questions / risks

- **`classifyTarget` scaling:** it's a hardcoded `if`-chain mapping target strings → domain buckets. Letting modules add domains risks collisions/ambiguity. Decide whether modules register *explicit* domain keys (safer) vs. relying on substring matching (current style). Recommend explicit registration.
- **Resolver path namespace:** module formulas referencing `@{mythic.tier}` need a stable, collision-free namespace in `CharacterResolver.lookup`. Recommend reserving `@{module.<key>.<path>}` and reading from `rules.modules[key].settings`.
- **Stacking correctness for novel bonus types:** PF1e 3pp sometimes introduces bonus types not in `BONUS_TYPES` (`common.ts`). Either map them to `untyped`/`custom` (safe but may over-stack) or extend the enum (schema change). Per-module decision; document in each module file.
- **Mythic's deep cross-cutting reach** (surge affects d20 rolls, abilities grant per-tier scaling): may exceed the declarative `effects` model and need engine special-cases — accept that Mythic is the "coded" reference, not the data-driven one.
- **Import/export round-trip:** the M8/M9 adapters must preserve `rules.modules[].settings` and module `resources` losslessly. The PathForge JSON exporter is lossless by design; verify Foundry/Myth-Weavers adapters at least dump module state to `metadata.unmapped` rather than dropping it.
- **Privacy default tension:** defaulting module sections to `"party"` is safe but may surprise owners who expect public parity with core stats. Surface clearly in the privacy editor.
- **Migration ordering** if two modules touch the same formula path via `formulaPatches` (e.g. ABP + Fractional both rewriting saves): define deterministic patch ordering (registry order) and surface conflicts in "Show Math".

### Key files this milestone touches

- `packages/pathforge-schema/src/optional-rules.ts` — registry projection; `isRuleEnabled` unchanged.
- `packages/pathforge-schema/src/modules/*.ts` — **new**: `registry.ts` + one file per module.
- `packages/pathforge-schema/src/common.ts` — `fieldDefinitionSchema` + `formulaPatchSchema` finally consumed (currently dead stubs).
- `packages/pathforge-schema/src/rules.ts` / `meta.ts` — `enabledModuleSchema.settings` is the state store; extend `PRIVACY_SECTIONS`.
- `packages/pathforge-rules-pf1e/src/compute.ts` — registry loops in `buildModifierIndex` + `evalWith` + resolver fallthrough.
- `lib/character/view-model.ts` — `moduleSections` + privacy registration.
- `components/character/editor/character-editor.tsx` (`SettingsEditor.toggleRule`, `sections`) + `components/character/editor/modules/*-editor.tsx` (**new**).
- `lib/character/campaign-modules.ts` + `lib/actions` (campaigns/sheet-save) — allow-list enforcement.


---


## S5a — Mobile UI Overhaul + Modern Design Hierarchy (Responsive Web)

### Overview

- **What:** Make PathForge genuinely usable on a phone. Today the app shell, the M6 "Sheet Sections" sidebar, and the editor are desktop-first: `components/character/editor/character-editor.tsx` renders a hard `grid lg:grid-cols-[190px_minmax(0,1fr)_300px]` (three columns), and `components/character/character-dashboard.tsx` leans on `lg:grid-cols-3`. Below the `lg` breakpoint these collapse into one long vertical stack — the section sidebar becomes a horizontally-scrolling tab strip, the live-preview sidebar drops to the bottom (out of sight while editing), and form fields (`h-10` inputs, `size-10` icon buttons) sit just under comfortable thumb-reach minimums.
- **Why / user value:** PF1e players run their sheets *at the table*, on a phone, mid-combat. The single highest-value mobile interaction is "toggle a buff / change HP / read a stat and watch the math update" — which is exactly what's hidden today because the live-preview panel is desktop-only and the dense bento grids don't reflow well. This milestone is the prerequisite for the M10 PWA install pitch ("add to home screen") being anything other than a desktop site in a frame.
- **Scope:** Pure presentation + a small amount of view-state schema. **No `computeCharacter` changes, no view-model/privacy changes, no game math.** This is deliberately a low-risk milestone that touches layout, navigation, touch ergonomics, and design tokens only.

### Design system foundation (do this first)

Extend the existing `--pf-*` token layer in `app/globals.css` rather than inventing a parallel system. Tailwind v4's `@theme inline` already maps tokens to utilities, so additions are cheap.

- **Touch-target tokens.** There is currently *no* enforced minimum tap size anywhere (grep for 44px/min-h-11 returns nothing). Add a spacing token and a `.touch-target` utility:
  - `--pf-tap: 44px;` in `:root`, and an `@utility tap-target { min-height: var(--pf-tap); min-width: var(--pf-tap); }`.
  - Add a `touch`/`xl` size to `buttonVariants` in `components/ui/button.tsx` (`h-11 min-w-11`) and bump the bottom-nav/drawer/section-tab controls to it. Keep the dense `sm` (`h-8`) for desktop-only toolbars.
  - The `<input type="number">` fields in `components/character/editor/fields.tsx` are `h-10`; add a responsive bump (`h-11 md:h-10`) and confirm `inputMode`/`step` are already correct (they are — `NumberField` sets `inputMode="numeric"` for non-negative ints, which gives the phone numeric keypad).
- **Safe-area + viewport.** `MobileBottomNav` already uses `env(safe-area-inset-bottom)` and `min-h-dvh`/`h-dvh` is used in the shell — good. Standardize on `dvh` (not `vh`) everywhere a full-height region exists so the iOS URL bar doesn't clip content, and add `viewport-fit=cover` to the viewport export in `app/layout.tsx`.
- **Fluid type + density.** Introduce two `clamp()` type steps for stat readouts so the bento tiles in `character-dashboard.tsx` (`text-lg`) scale down gracefully on a 360px screen instead of wrapping. Keep `tnum` (tabular figures) — it's already correct and important for stat columns.
- **Breakpoint strategy.** Standardize on Tailwind's `md` (768px) as the "has a persistent sidebar" line and `lg` (1024px) as the "third column (live preview) appears" line. Today the editor jumps straight from 1-col to 3-col at `lg`; introduce an intermediate `md` 2-col state (sections + content, preview moves to a sheet).

### Navigation: app shell

Ground: `components/app-shell/app-shell.tsx`, `mobile-bottom-nav.tsx`, `sidebar-nav.tsx`, `nav-items.ts`.

- **Bottom nav is already the right primitive** — keep it. It currently shows the 4 `mobile: true` items in `nav-items.ts` (Dashboard / Characters / Campaigns / Spells) and hides Settings. Improvements:
  - Make each `<Link>` a `tap-target` (currently `min-h-14`, which is fine vertically but the label uses `item.label.split(" ")[0]` — verify "Spell Compendium" → "Spell" reads OK, consider an explicit `shortLabel` field on `NavItem`).
  - Add a "More" overflow entry (or move Settings/Sign-out into a top-right drawer) so Settings is reachable on mobile — right now mobile users can only sign out, with no Settings route at all.
- **Top header on mobile.** The header currently only shows the logo + theme toggle + sign-out on mobile. Add a hamburger that opens a **left drawer** mirroring `SidebarNav` for the secondary routes (Settings, future items), so bottom-nav stays to the 4 primary destinations. Implement the drawer with Radix `Dialog`/`Sheet` semantics (focus trap + `Esc` + scrim) rather than a bespoke div — the project already uses `@radix-ui/react-slot`.

### Navigation: the editor's "Sheet Sections" + sub-tabs (the core of this milestone)

Ground: `character-editor.tsx` lines 202–308 (the 3-col grid, the vertical `role="tablist"` section rail, the per-section sub-tablist, and the `LivePreview` aside).

The existing keyboard a11y is good and must be preserved: roving-tabindex (`onSectionKeyDown`/`onSubKeyDown`), `role="tablist"`/`tab`/`tabpanel`, `aria-controls="editor-panel"`, `aria-selected`. The redesign is responsive layout *around* that logic, not a rewrite of it.

- **Section rail → bottom sheet / segmented control on mobile.** The vertical rail (10 sections: Core, Defenses, Attacks, Abilities, Skills, Spells, Equipment, Buffs, Story, Settings) currently becomes a horizontal `overflow-x-auto` strip below `lg`. That's a known anti-pattern (hidden items, no affordance). Replace with:
  - **`< md`:** a single **"Section" picker button** (shows the active section + icon) that opens a bottom-sheet list of all 10 sections. This is one tap to a full, labeled, `tap-target`-sized menu — far better than horizontal scroll. Reuse the same `sections[]` array; the sheet just renders it as a vertical list and calls the existing `setActiveSection`/`setActiveSub`.
  - **`md`–`lg`:** keep the vertical rail but icon-first/label-on-`md+` to save width.
  - **`lg+`:** unchanged (today's 3-col layout).
- **Sub-tabs.** Sections with `items.length > 1` (Core has details/abilities/health; Defenses has saves/ac) render a sub-tablist (lines 244–266). On mobile this stays as a horizontal segmented control but with `tap-target` heights and snap scrolling (`snap-x`). Keep `aria-orientation` correct.
- **Live preview is the killer mobile feature — promote it.** On desktop it's the right `aside` (`lg:sticky lg:top-20`). On mobile it currently falls to the very bottom of a long form. Instead:
  - Render a **persistent collapsed "stat bar"** docked above the bottom nav showing the 3–4 most-watched values (HP, AC, the save you're editing) pulled from `ed.computed.summary` — the same `cells[]` data already assembled in `LivePreview`.
  - Tapping it expands the full `LivePreview` (all 10 cells + the "Show math" `FormulaBreakdown`) in a bottom sheet. This makes "edit a field, see the live recompute" a first-class mobile loop. `useCharacterEditor` already recomputes synchronously via `useMemo(() => computeCharacter(draft))`, so no new plumbing — just relocate where `LivePreview` mounts at small widths.
- **Toolbar.** The Simple/Advanced toggle, Undo, and `SaveStatusBadge` (lines 270–289) wrap awkwardly on narrow screens. On mobile, collapse Undo + Advanced into an overflow menu and keep the `SaveStatusBadge` always visible (it's `role="status" aria-live="polite"` — important feedback that autosave fired).

### Read view (character dashboard)

Ground: `character-dashboard.tsx`.

- The bento grids already declare mobile-first breakpoints (`grid-cols-2 md:grid-cols-4`, `lg:grid-cols-3`), so the dashboard is in better shape than the editor. Main work:
  - **Progressive disclosure for density.** Best Skills, Attacks, and Active Buffs lists can be long. On mobile, cap to top N with a "Show all" expander (Best Skills already slices to 8 — apply the same pattern to attacks). This is presentation-only; the full `vm` is already in props.
  - Make the `HeroCard` portrait/identity stack vertically and the share `actions` slot wrap to its own row on `< sm`.

### Data / schema changes

Minimal, and **all in the view-state lane, not the canonical sheet.** Game-relevant fields must not get UI prefs mixed in.

- **No changes to `@pathforge/schema`'s canonical character shape** (identity/abilities/defenses/etc.). The mobile overhaul reads existing fields only.
- Two small additions, both optional/non-game:
  - **UI density preference** — add a `density: "comfortable" | "compact"` to whatever local UI-preferences store already drives theme (theme lives on `<html>` via the `obsidian`/`parchment`/`high_contrast` classes; reuse that same client/cookie mechanism — do **not** add it to the character Zod schema). Comfortable = larger tap targets default on touch; compact = today's desktop density.
  - **Last-open editor section** — persist `activeSection`/`activeSub` (currently `useState("core")/"details"` at character-editor.tsx:92–93) to `localStorage` keyed by `characterId` so re-opening a sheet on mobile returns to where you were. Pure client state; not synced, not in the schema.
- If a server-synced preference is later wanted, it belongs on a `profiles`/user-settings row (out of scope here) — explicitly **not** on `characters` (RLS-protected game data).

### Engine / view-model / privacy implications

- **`computeCharacter` (`packages/pathforge-rules-pf1e`):** no changes. The mobile live-preview reuses the existing synchronous `useMemo` recompute in `use-character-editor.ts`.
- **View-model (`lib/character/view-model.ts`) + privacy:** no changes and **no new exposure surface.** The mobile read view and the collapsed stat bar render from data the viewer can already see (`CharacterViewModel` for the public `/c/[slug]` view; `ed.computed` for the owner in the editor). The "show fewer items on mobile" expanders are client-side slices of already-authorized data — they cannot leak, because nothing new is fetched. This is worth stating explicitly so a reviewer doesn't have to re-audit gating: the gate stays in the view-model; the UI only chooses how much of the *already-filtered* model to paint.

### Performance

- **Keep editors mounted, not virtualized — but lazy-load the heavy ones.** The Skills editor renders a 35+ row table and the spell picker hits `search_spell_compendium`. On mobile, `next/dynamic` the rarely-first-opened sub-editors (`SpellcastingEditor`, `InventoryEditor`, `CombatEditor`, `BuffCenter`) so the initial editor route ships less JS to phones on cellular. They're already separate modules (`combat-editor.tsx`, etc.), so this is a one-line import change each.
- **Avoid layout thrash from the live recompute.** `computeCharacter` runs on every keystroke via `useMemo`. It's fast, but on low-end phones the *re-render* of 10 sub-editors is the cost. Wrap each sub-editor panel so only the active `sub.render()` mounts (it already does — only the active panel renders, lines 300). Confirm the bottom stat bar subscribes narrowly to `ed.computed.summary` and doesn't re-render the whole tree.
- **`content-visibility: auto`** on off-screen dashboard `SectionCard`s for cheap below-the-fold paint savings.
- Respect `prefers-reduced-motion` (already handled globally in `globals.css`) for the new drawer/sheet transitions.

### Tie-in to M10 (PWA / offline / install)

- `app/manifest.ts` already exists (`display: "standalone"`, `orientation: "portrait-primary"`, theme `#090d12`). This milestone is what makes that manifest *honest* — an installed app that's still desktop-first feels broken. Concretely:
  - The bottom-nav + drawer + safe-area work here is exactly the "standalone app chrome" an installed PWA needs (no browser back button, so in-app nav must be complete — see the missing mobile Settings route above).
  - The persistent stat bar + bottom-sheet preview become the "at-the-table" surface that justifies installing.
  - `theme_color` / `background_color` in the manifest are hard-coded to the obsidian `#090d12`. Note for M10: derive these from `--pf-bg` per active theme (parchment install would currently flash dark).
  - Sequencing: **S5a should land before M10's service-worker/offline pass.** Offline is pointless if the on-device UX is unusable; do ergonomics first, then cache.

### How it fits existing components (file-by-file)

- `app/globals.css` — add `--pf-tap`, `tap-target`/density utilities, fluid-type steps. No token renames.
- `components/ui/button.tsx` — add a touch size to `buttonVariants`.
- `components/character/editor/fields.tsx` — responsive input height; verify `inputMode`.
- `components/app-shell/app-shell.tsx` — add mobile hamburger + Radix drawer; keep desktop aside as-is.
- `components/app-shell/nav-items.ts` — add `shortLabel`; surface Settings in the mobile drawer.
- `components/character/editor/character-editor.tsx` — the big one: section-picker bottom sheet (`< md`), relocate `LivePreview` to a docked stat bar + sheet on mobile, collapse toolbar overflow, persist active section. Reuse the existing `sections[]`, roving-tabindex handlers, and ARIA roles verbatim.
- `components/character/character-dashboard.tsx` — top-N expanders, HeroCard stacking.
- New small client components: `<SectionSheet>`, `<LivePreviewBar>`, `<MobileDrawer>` (Radix-based), `<Expander>`.

### Rough effort & sequencing

- **Overall: L** (≈ XL if the dashboard polish and a fresh design-token pass are folded in; the editor responsive rework alone is **M–L**).
- Sequence:
  1. **S — Design-system foundation:** tap tokens, button touch size, input bumps, safe-area/`dvh`/`viewport-fit`. Unblocks everything and is independently shippable.
  2. **M — App-shell nav:** hamburger drawer + bottom-nav touch sizing + mobile Settings route.
  3. **L — Editor responsive rework:** section sheet, live-preview stat bar, toolbar overflow, lazy sub-editors. Highest value, highest risk; do after 1–2 so the primitives exist.
  4. **S–M — Dashboard density / read view.**
- **Dependencies:** none on schema/engine/RLS — fully parallelizable with backend work. Must precede M10's offline pass. The editor rework (step 3) depends on the design tokens (step 1).

### Open questions / risks

- **Section navigation pattern:** bottom-sheet section picker vs. a swipeable/segmented top bar vs. an accordion (each section's content inline, tap to expand). The bottom sheet preserves the existing tab/tabpanel ARIA model with the least churn; an accordion would change the a11y contract and break the roving-tabindex code. Recommend the sheet, but worth a quick usability check with a real player.
- **Live-preview placement:** a fixed bottom stat bar competes for vertical space with the bottom nav and the iOS keyboard. Need to confirm it doesn't occlude the focused input (use `scroll-margin` / `scrollIntoView` on focus, and hide the bar while the soft keyboard is up via `visualViewport` resize detection).
- **Density preference storage:** cookie (SSR-stable, no flash, matches how theme is applied to `<html>`) vs. `localStorage` (simpler, but FOUC). Recommend the cookie path to match theme; confirm where the theme cookie is read.
- **Touch vs. pointer detection:** default to comfortable density on coarse pointers (`@media (pointer: coarse)`) rather than width alone, so a small laptop window doesn't get phone-sized controls and a tablet does.
- **`<input type="number">` ergonomics:** spinner steppers are tiny on mobile and the numeric keypad lacks a minus on iOS — the existing `NumberField` local-draft logic already handles a leading `-`, but validate HP-loss / penalty entry on a real iPhone.
- **Testing reach:** Playwright (`pnpm test:e2e`) supports device emulation — add a mobile viewport project. But real-device verification (iOS Safari standalone PWA quirks, safe-area, keyboard) is the actual risk and can't be fully automated.
- **Regression surface:** the editor a11y (roving-tabindex, `aria-controls`) is subtle and correct today; the biggest risk is breaking it during the responsive refactor. Add explicit keyboard-nav tests before refactoring, not after.

Key files referenced (all absolute): `C:\Users\bitte\Documents\Projects\PFSheet\components\character\editor\character-editor.tsx`, `...\components\app-shell\app-shell.tsx`, `...\components\app-shell\mobile-bottom-nav.tsx`, `...\components\app-shell\sidebar-nav.tsx`, `...\components\app-shell\nav-items.ts`, `...\components\character\editor\fields.tsx`, `...\components\character\editor\use-character-editor.ts`, `...\components\character\character-dashboard.tsx`, `...\components\ui\button.tsx`, `...\components\ui\input.tsx`, `...\app\globals.css`, `...\app\manifest.ts`.


---


## S5b — Native Android + iPhone Apps with Real-Time Sync & Conflict Handling

### Overview

PathForge today is a server-rendered Next.js web app: the edit workspace (`components/character/editor/use-character-editor.ts`) keeps a client draft, recomputes live via `computeCharacter()`, and debounce-autosaves the **entire** JSON document through `saveCharacterSheetAction` (`lib/actions/characters.ts`) with a blind `.update()` — no version guard, last-writer-wins by accident. That is fine for one device. The moment a player has the phone app open at the table **and** a laptop open at home, two full-document writes silently clobber each other.

This milestone delivers true native iOS + Android apps at **full parity** with the website, sharing the game-math and schema code verbatim, and replaces the accidental last-write-wins with an explicit, field-aware concurrency model backed by a real version column and Supabase Realtime. User-facing value: a real app-store presence, offline play at the table (no signal in the basement game room), instant cross-device sync, and a clear "someone else edited this" experience instead of lost work.

---

### 1) Stack choice — Expo / React Native (recommended)

Three candidates, evaluated for a solo/small team needing **web + iOS + Android parity** while preserving the existing pure-TS engine.

- **Capacitor (wrap the M10 PWA in a WebView).**
  - Pros: near-zero new code — ship the existing Next PWA; one UI codebase; fastest path to "an app in the store."
  - Cons: it is the website in a shell. Offline-first is bounded by what the PWA already does; the autosave/conflict problem is unchanged because it is still the web `saveCharacterSheetAction` path. WebView text-entry, gesture, and scroll feel is the classic "it's a website" tell — and the user's stated #1 priority is *native* apps. Background push, widgets, Watch, and haptics all require native plugins anyway, so the "no native code" advantage erodes immediately.
  - Verdict: a good fallback if timeline collapses, but it does not satisfy "native parity."

- **Fully native (Swift + Kotlin, two codebases).**
  - Pros: best possible feel and platform integration.
  - Cons: **the engine cannot be shared.** `@pathforge/rules-pf1e` (the no-eval formula parser, stacking, dependency graph, `computeCharacter`) and `@pathforge/schema` (Zod) are TypeScript. Reimplementing PF1e math twice (Swift + Kotlin) guarantees the three platforms drift — the exact failure mode the architecture was built to prevent ("all game math lives here, never in components"). 3x the surface for a solo dev. Rejected.

- **Expo / React Native — RECOMMENDED.**
  - The engine and schema are **pure, UI-free TypeScript already published as `workspace:*` packages** (`@pathforge/schema`, `@pathforge/rules-pf1e`; the rules index header literally says "reused server-side, client-side, and in future native apps"). RN runs JS, so `computeCharacter()` runs *byte-identical* on web and native — game math stays provably the same.
  - `@supabase/supabase-js` (already a dep at 2.47) runs in RN; only the SSR-cookie client (`lib/supabase/server.ts`, `client.ts`) is web-specific and gets a native sibling.
  - One language, one team, true native widgets/gestures, and a rich ecosystem for the mobile extras (haptics, push, Watch via Expo modules, Live Activities).
  - Tradeoff accepted: the **React UI is not shared** with Next (Server Components, App Router, Tailwind/`--pf-*` tokens, Radix don't cross to RN). We re-implement screens in RN — but the *hard, correctness-critical* layer is shared, and the UI is the part that *should* differ per platform anyway.

**Recommendation: Expo (managed workflow, dev-client / EAS).** Maximizes shared correctness code, gives genuinely native UX, and is the only option a small team can keep at parity across three targets.

---

### 2) Code-sharing — what crosses the boundary

Convert the repo into a shared-core monorepo. Today `packages/*` are consumed only by the Next app; add an Expo app as a second consumer.

**Shared verbatim (move/keep in `packages/`, zero changes):**
- `@pathforge/schema` — `createDefaultCharacter()`, `parseCharacter()`/`safeParseCharacter()`, every Zod block (`pathForgeCharacterV1Schema`, `CHARACTER_SCHEMA_VERSION`). Pure Zod, runs in RN unmodified.
- `@pathforge/rules-pf1e` — formula tokenizer/parser/evaluator, `applyStacking`, `buildDependencyGraph`, `computeCharacter`, `ComputedCharacter`, buff helpers. Pure TS.
- `lib/character/view-model.ts` — `buildCharacterViewModel` + `canSee`/`effectiveLevel`. Pure functions over `(character, computed, viewer, visibility)`; no React, no `server-only`, no Next imports. **Promote it into a package** (e.g. `@pathforge/view-model`, or a `packages/pathforge-shared` barrel) so the native app imports the *same* §15 privacy gate. Privacy logic must never be re-implemented on a client.
- `@pathforge/importers` / `@pathforge/exporters` — pure adapters; usable for the native share-sheet import (§6).
- The new **sync core** (designed below): version/merge logic written as pure TS in a package so web and native run the identical conflict resolver.

**Cannot be shared (web-specific; needs a native sibling):**
- `lib/supabase/server.ts`, `client.ts`, `middleware.ts` — SSR/cookie-bound. Native uses `@supabase/supabase-js` with `AsyncStorage`/`expo-secure-store` for token persistence and PKCE deep-link auth (§5).
- The **server actions** (`saveCharacterSheetAction`, `createCharacterAction`, snapshots, etc.) are `"use server"` Next RPCs. Native cannot call them directly. Two options:
  - (a) The native app talks to Supabase directly via RLS-gated table writes (mirrors what the actions do — they are thin RLS wrappers), **plus** the existing `/api/v1` for read shapes. *Problem:* the actions also run `safeParseCharacter` + `computeCharacter` + the §16.3 stale-flag admin step. To keep that logic in one place, prefer (b).
  - (b) **Extract the save pipeline into a pure function** `applySheetSave(sheet) -> { parsed, computedSummary }` in the shared package, and expose a thin **`/api/v1/characters/{id}/sheet` PUT** (and snapshot/create) endpoint that both web actions *and* native call. This is the cleanest parity path and is required for the conflict guard anyway (§4). The server action becomes a wrapper over the same handler.
- React UI (`character-editor.tsx`, the Sheet Sections sidebar, `*-editor.tsx`) — re-implemented as RN screens reusing the same draft/recompute hook *logic* (the hook itself is portable in spirit; see §3).
- Tailwind `--pf-*` tokens / themes — re-expressed as an RN theme object (same token names: `obsidian`/`parchment`/`high_contrast`) so the palette is identical.

**Effort to set up sharing: M.** Mostly monorepo wiring (Expo + Metro resolving `workspace:*`, TS path config) and lifting `view-model.ts` + the save pipeline into packages.

---

### 3) Offline-first — extending the existing draft/autosave model

The web hook already *is* an offline-tolerant draft model in miniature: local `draft` state, live `computeCharacter`, debounced flush, undo stack, `lastSaved` ref. Native generalizes this into durable offline-first.

- **Local persistence (native).** Persist the working `PathForgeCharacterV1` draft to on-device storage (Expo SQLite or MMKV; SQLite preferred for query-able multi-character lists + an outbox). On launch, hydrate from disk so the sheet opens instantly with no network. Mirror `lastSaved` as a stored `baseVersion` (see §4).
- **The hook, generalized.** Port `use-character-editor.ts` to a platform-agnostic core that takes a `persist(draft)` and a `flush(draft, baseVersion)` injection. Web keeps cookie/action flush; native swaps in SQLite-persist + a sync-outbox flush. `computeCharacter` and the undo stack are unchanged. The `beforeunload` guard becomes an app-state/`AppState` "background" persist on native.
- **Outbox / queue.** Each debounced flush, instead of a fire-and-forget `.update()`, enqueues a pending mutation `{ characterId, sheet, baseVersion, clientMutationId, ts }`. Online → drain immediately; offline → drain on reconnect (NetInfo/connectivity listener). This *is* the M10 sync layer — design them together; M10's service-worker background sync on web and the native outbox share the same enqueue/drain contract from the shared sync core.
- **Optimistic UX.** The local draft is the source of truth for what the user sees; the server is the source of truth for conflicts. A small status chip reuses the existing `SaveStatus` union (`"saved" | "unsaved" | "saving" | "error"`) plus a new `"conflict"` state.
- **Multi-character & reference data offline.** Cache the character list and (optionally) a slice of `spell_compendium` for offline spell lookup at the table (it's read-only, ~3,034 rows — a compact bundled/synced dataset; never the live web table — that one is never altered).

**Effort: L** (durable store + outbox + reconnect drain + porting the hook).

---

### 4) Real-time sync + CONFLICT RESOLUTION (the core)

**The scenario:** the user edits the *same* sheet area on desktop and in the app without refreshing. Today both do a full-document `.update()` → the later write wins and silently erases the earlier one. We replace this with explicit version-guarded, field-aware merging.

#### DB changes (new migration `0013`)

- **Add a version column to `characters`:**
  ```sql
  alter table public.characters add column sheet_version integer not null default 1;
  ```
  Bump it on every sheet write. Add it to the `updated_at` trigger family or bump explicitly in the write RPC (preferred — see guarded write). `updated_at` already exists (trigger from `0001`) and serves as a secondary tiebreaker, but an integer `sheet_version` is the authoritative guard (clock-skew-proof).
- **Guarded write via RPC (compare-and-swap).** Replace the blind `.update()` with a `SECURITY INVOKER` RPC `save_character_sheet(p_id, p_sheet, p_summary, p_base_version)` that does:
  ```sql
  update public.characters
     set sheet_data = p_sheet, computed_summary = p_summary,
         sheet_version = sheet_version + 1, last_calculated_at = now()
   where id = p_id and sheet_version = p_base_version
  returning sheet_version;
  ```
  RLS still applies (invoker), so the existing owner/editor gate is unchanged. **Zero rows returned = either RLS denied (the `.select()`-verified pattern in `lib/actions/imports.ts` already treats 0-row writes as failure) OR a version mismatch.** Disambiguate with a follow-up read of the current `sheet_version`: row exists but version differs → **conflict**; row not visible → RLS denial. This preserves the existing "0-row write can't report false success" invariant while adding conflict detection.
- **Realtime.** Enable Supabase Realtime on `public.characters` (Postgres changes / `replication`), filtered per row: each open editor subscribes to `id=eq.{characterId}`. RLS governs what a subscriber may receive (only owner/editor/authorized viewers get the payload). Broadcast carries `{ sheet_version, updated_by, updated_at }` (lightweight) — clients then decide whether to pull the new `sheet_data`. Avoid streaming the full JSONB on every keystroke-flush; stream the version bump, pull-on-demand.

#### Concurrency model — field-level merge, not document last-write-wins

- **Why not pure LWW:** the document is one big JSON blob; LWW at the document level means editing HP on the phone wipes a feat added on the laptop. Unacceptable.
- **Why not full CRDT/OT:** a character sheet is not collaborative free-text. Edits are overwhelmingly **disjoint scalar fields** (`health.currentHp`, an ability score, a skill rank, a buff toggle). A full CRDT (Yjs/Automerge) would mean re-modeling the entire Zod document as a CRDT type and giving up the clean canonical JSON that the engine, view-model, importers, exporters, and snapshots all depend on. Too heavy for the actual edit pattern.
- **Chosen model: structured three-way merge with field-level LWW + explicit conflict surfacing.** When a guarded write returns "version mismatch," run a **three-way merge** in the shared sync core:
  - **base** = the `sheet_data` at the version this client started from (we have it: `lastSaved`/stored `baseVersion` snapshot),
  - **mine** = the local draft,
  - **theirs** = the server's current `sheet_data` (pulled on mismatch).
  - Walk the document by **leaf path** (reuse the same path machinery as `lib/character/diff.ts`, the §16.2 privacy-aware diff already exists). For each leaf:
    - changed only in mine → take mine,
    - changed only in theirs → take theirs,
    - changed in both to the **same** value → no conflict,
    - changed in both to **different** values → **true conflict** for that field.
  - Auto-resolvable merges (the common case: I changed HP, they added a feat) apply silently and re-flush at the new base version. Only genuine same-field divergences (both edited current HP to different numbers) raise a conflict.
- **Conflict UI.** A non-destructive **conflict banner** appears (reuse the visual language of the existing M7 "stale-after-changes" banner). It lists the conflicting fields with **mine vs theirs** values and a per-field choice (Keep mine / Take theirs), plus "Keep all mine" / "Take all theirs." Nothing is lost until the user picks — the local draft is preserved in the outbox. The diff/merge runs through the shared, privacy-aware path so a *collaborator* editing never sees fields they can't see.
- **Interaction with debounced autosave.** The 900ms debounce stays. The change: a flush sends `baseVersion`; on success it advances `baseVersion = returned sheet_version` and persists it; on mismatch it transitions `status: "conflict"`, pauses further auto-flush for that doc, runs the auto-merge, and either resumes (clean merge) or shows the banner (true conflict). The Realtime subscription proactively flips a "newer version exists" hint so a user editing for a while sees "updated on another device" *before* they hit a hard conflict — reducing surprise.
- **Snapshots as the safety net.** Before applying a "Take theirs" that would discard local edits, auto-create a `character_snapshots` row (reason `"pre_merge"`) via the existing snapshot pipeline (`createSnapshotAction` logic) so nothing is ever truly unrecoverable. Ties into M7 history.

#### Schema fields touched

- No change to `pathForgeCharacterV1Schema` is strictly required for the merge (it operates on the existing tree). Optional, additive: a small `metadata.sync` block (`lastDeviceId`, `lastClientMutationId`) inside the existing `characterMetadataSchema.custom`/`unmapped`-style record — **no new top-level Zod field needed**, keeping the doc stable for importers/exporters. The authoritative version lives in the DB column, not the JSON, so snapshots and exports stay clean.

**Engine / view-model implications:** none to `computeCharacter` (merge happens on the *input* sheet, then recompute as normal). The merge resolver is new pure code; the view-model is reused unchanged for any merge-time rendering of "theirs."

**Effort: XL** (the version column + RPC is M; the three-way field merge, conflict UI, Realtime wiring, and outbox integration are the bulk).

---

### 5) Auth, push, release, parity testing

- **Auth across platforms.** Web uses `@supabase/ssr` cookies; native uses `@supabase/supabase-js` with `expo-secure-store` for refresh-token persistence and the **PKCE flow with deep links** (`pfsheet://auth/callback`) for OAuth/magic-link. Same Supabase project (`ldhpdstmgvcsiiupckqx`), same users, same RLS — so `auth.uid()` and every existing policy (the `0007` returning fix, `campchar_update`, etc.) apply unchanged. Configure the deep-link redirect URL in Supabase Auth settings. Sessions refresh in background via the SDK's auto-refresh.
- **Push notifications (campaign/GM events).** Expo Notifications + a `device_push_tokens` table (migration). A Supabase Edge Function (or DB trigger → `pg_net`) fires on the events PathForge already records: GM review decisions (`gm_reviews` insert — approve / changes_requested), new `gm_notes` with `player_visible`/`party_visible`, new `character_comments`, campaign roster changes (`campaign_characters`). Reuse the existing event semantics from M7. Respect privacy: a push for a GM-only note never goes to players. Deep-link the notification straight to `/characters/[id]` or `/campaigns/[id]/gm/[characterId]`.
- **Build / release pipeline.** Expo **EAS Build** (cloud iOS + Android binaries) + **EAS Submit** to App Store Connect / Play Console, and **EAS Update** for instant OTA JS pushes (engine/UI fixes without a store review — valuable for keeping native math in lockstep with web). Channels: `preview` (internal/TestFlight) and `production`. CI: extend the existing `pnpm lint && pnpm test && pnpm typecheck` gate to the Expo app; EAS build on tag.
- **Parity testing.** (a) The shared packages already have Vitest suites (`compute.test.ts`, `stacking.test.ts`, `character.test.ts`, view-model render tests) — these *are* the math-parity guarantee since native runs the same code. (b) Add a **golden-character cross-platform test**: run `computeCharacter` on a fixture and assert byte-identical `ComputedCharacter` in Node and in an RN/Hermes runtime. (c) **Conflict-resolution unit tests** for the three-way merge (disjoint, same-value, true-conflict, deep-array cases) in the shared package. (d) Detox (native) + the existing Playwright (`test:e2e`) for the offline→reconnect→merge flow. (e) Privacy parity: assert the native app, given the same `(character, viewer)`, produces the identical `buildCharacterViewModel` output as web ("public never leaks private" must hold on every platform).

**Effort: L** (auth M, push M, EAS pipeline M, parity harness M).

---

### 6) Mobile-specific additions (imaginative but practical)

Ranked roughly by value/effort. All reuse the shared engine/schema so they stay correct.

- **Dice roller with haptics (S, high value).** A native dice tray that reads attack/save/skill formulas straight from `ComputedCharacter` (`computed.attacks[].attackBonus`, `summary.fortitude`, `skills[key].value`) — tap a stat to roll `1d20 + bonus`, with `expo-haptics` on crit/fumble. No new game math; it consumes existing computed values.
- **Quick-Combat HUD (M, high value at the table).** A stripped, thumb-reachable screen: current/max/temp HP steppers (`health.currentHp`/`tempHp`), initiative (`summary.initiative`), AC trio, and one-tap buff toggles from the Buff Center (the M6 buff model already drives live deltas). Every tap is a small field edit → flows through the same offline outbox + conflict guard, so HP changes at the table sync home.
- **Share-sheet import (M).** Register the OS share sheet so a `.json`/`.pdf`/Foundry/Myth-Weavers export opens directly in PathForge → straight into `@pathforge/importers` `runImportPipeline`. The import logic is already pure and platform-agnostic.
- **NFC / QR character share (S–M, fun + practical).** Generate a QR (or NFC tag) encoding a character's `public_slug`; another player scans → opens the public `/c/[slug]` view (already exists, already privacy-gated). Zero backend change — it rides the existing share + view-model surface.
- **Home-screen / lock-screen widgets (M).** A widget showing HP / AC / initiative pulled from `computed_summary` (the column the web already persists) via the `/api/v1/characters/{id}/summary` endpoint that already exists. iOS WidgetKit / Android Glance.
- **Apple Watch / Wear initiative + HP (L, delight).** Initiative tracker and HP nudge on the wrist for combat; Live Activities on iOS for an ongoing encounter. Reads the same computed summary; writes HP through the outbox.
- **Voice-to-note (S).** Dictate session notes into `notes.player` / `notes.scratchpad` (existing `notesBlockSchema` fields) via on-device speech — hands-free at the table.
- **Offline reference (M).** Bundled/cached spell + condition reference (from `spell_compendium`, read-only) so spellcasters can look up spells with no signal — the #1 "no internet in the game room" pain point.

---

### Sequencing & dependencies

1. **Monorepo + shared-core extraction (M)** — lift `view-model.ts` and the save pipeline into packages; wire Expo to consume `workspace:*`. *Blocks everything.*
2. **DB: `sheet_version` column + guarded `save_character_sheet` RPC (M)** — refactor web `saveCharacterSheetAction` onto it first (web benefits immediately, even before native ships). *Depends on 1.*
3. **Shared sync core: outbox + three-way merge (L)** — pure TS, unit-tested. *Depends on 1, 2.*
4. **Expo app shell + auth + read-only sheet parity (L)** — proves the engine/view-model run native. *Depends on 1.*
5. **Native editor + offline persistence + conflict UI (XL)** — the editor screens + outbox + banner. *Depends on 3, 4.*
6. **Realtime subscriptions + proactive "updated elsewhere" (M).** *Depends on 2, 5.*
7. **Push + EAS pipeline + store submission (L).** *Depends on 4.*
8. **Mobile extras (S–L, incremental)** — dice/haptics and Quick-Combat HUD first. *Depends on 4/5.*

This intentionally interleaves with **M10 (PWA/offline)**: the outbox/merge core (steps 2–3) is the same machinery the web PWA needs for offline autosave, so build it once in the shared package and let both consume it. Overall: **XL** milestone.

---

### Open questions / risks

- **Conflict granularity for arrays.** Feats/skills/buffs/inventory are arrays. Naive index-based leaf merge mis-handles reordering/insertion (two devices both append → both should survive). Need stable per-entry ids (some blocks have ids; e.g. `defensiveItemIds`, buff entries) and id-keyed array merge, not index-keyed. Decide which arrays get a guaranteed stable `id` — possible small additive schema change (an `id` on feat/skill/feature entries that lack one). **Highest-risk detail.**
- **Realtime cost/scale.** Per-row subscriptions are cheap at solo/small-table scale; confirm Supabase Realtime quota and whether to gate subscriptions to "sheet currently open on >1 device" to limit fan-out.
- **`computeCharacter` payload on broadcast.** Decide firmly: broadcast version-only + pull-on-demand (recommended) vs. broadcast full sheet. The former is cheaper and avoids leaking unfiltered `sheet_data` over Realtime to a non-owner subscriber — must verify Realtime RLS filtering actually withholds rows from unauthorized viewers (run `get_advisors` after enabling).
- **Server actions vs. shared `/api/v1` PUT.** Committing to (4b) means a real write endpoint with the same auth/rate-limit/audit treatment the M9 API got — non-trivial but it's the only honest parity path. Confirm before building native writes.
- **OTA vs. native-binary divergence.** EAS Update can ship JS that expects a native module the installed binary lacks. Need a runtime-version guard so the shared engine updates OTA but native-module changes force a store build.
- **App Store review for a "companion" app.** Apple sometimes rejects thin wrappers; the native UX (HUD, dice, widgets, Watch) is what makes this a real app, not a website in a can — prioritize at least one native-only feature for the first submission.
- **Hermes/JS engine parity.** Tiny float/`Intl`/number-format differences between Node and Hermes could theoretically diverge a computed value. Mitigate with the golden cross-runtime test (5b) before trusting "the math is identical."

Key real references grounding this plan: `components/character/editor/use-character-editor.ts` (draft/debounce/undo/`SaveStatus`), `lib/actions/characters.ts` (`saveCharacterSheetAction`, blind `.update()`, §16.3 stale flag), `lib/character/view-model.ts` (`buildCharacterViewModel`, `canSee`), `lib/character/diff.ts` (§16.2 path-walk to reuse for merge), `packages/pathforge-rules-pf1e/src/index.ts` + `compute.ts` (`computeCharacter`, pure), `packages/pathforge-schema/src/character.ts` + `meta.ts` (`pathForgeCharacterV1Schema`, `characterMetadataSchema`), `supabase/migrations/0001_core_schema.sql` (`characters` table, `updated_at` trigger — no version column yet), `lib/supabase/{server,client}.ts` (SSR-cookie clients needing native siblings), `lib/actions/imports.ts` (the `.select()`-verified 0-row-write-as-failure pattern the guarded RPC must preserve).


---


## S6 — Additional High-Value Features Worth Adding

### Overview

PathForge today is a strong *build-and-store* tool: the canonical Zod sheet, the `computeCharacter()` engine, the §15 privacy view-model, campaigns/GM audit, imports, exports, and the `/api/v1` surface are all done. The biggest remaining value gap is **at the table**: PathForge can describe a character perfectly but does almost nothing while a session is actually running. The features below close that gap and add the network-effect / content / monetization layers that turn a sheet tool into a platform. Everything here is grounded in real fields (`character.health`, `character.resources.list`, `character.buffs.active`, `combat.attacks`, `spellcasting.preparedSpells`) and real surfaces (the spell-compendium pattern, the view-model gates, `/api/v1`, `export_jobs`, `content_packs`/`rule_modules` tables that already exist but are unused).

The single highest-leverage theme: **play-time tools that mutate the already-existing transient sheet fields** (HP, resource `current`, prepared-spell `used`, buff `remainingRounds`). The schema already models all of these; nothing on the sheet *uses* them in a play context yet.

---

### A. Play-time tools (the biggest gap)

#### A1. Dice roller wired to the sheet — **value: high / effort: M**
- **Value**: One-click rolls from any computed line ("roll Stealth", "attack with +1 Longsword", "Fort save"), with the modifier auto-filled from `computed.skills[key].value` / `computed.attacks[i].attackBonus` / `computed.saves.*`. This is the #1 thing every sheet competitor (Roll20, Demiplane, D&D Beyond) has and PathForge lacks.
- **Engine**: a pure `packages/pathforge-dice` (tokenizer/evaluator mirroring the existing `formula/` parser style — **reuse the no-`eval` discipline**). Roll `NdX`, keep/drop, crit ranges from `attackEntry.critRange`/`critMultiplier`, damage from `damageFormula` (which the engine currently passes through untouched at `compute.ts:478`). `computeCharacter()` itself stays deterministic — dice live in a separate package so the rules engine remains pure.
- **Schema**: none required for basic rolling. Optional `metadata.custom.diceMacros` or a small `rollMacroSchema[]` for saved custom rolls.
- **View-model/privacy**: rolls are client-side; a *shared* roll log (see A5) goes through a new table, not the sheet.
- **UI**: a roll button on each value in `CharacterDashboard`/`*-editor.tsx` and a floating roll tray. Show the dice breakdown using the same "Show Math" affordance pattern.

#### A2. HP / resource quick-adjust ("combat mode") — **value: high / effort: M**
- **Value**: Damage/heal stepper, temp-HP, nonlethal, and one-tap resource spend during play. All four fields **already exist**: `health.currentHp`, `health.tempHp`, `health.nonlethalDamage`, and `resources.list[].current` (`resourceRefSchema.current`, `per`).
- **Schema**: zero new fields for the core loop. Add `health.conditions` is already there (`string[]`) — see A3.
- **Data path**: these are tiny, high-frequency writes. Add a focused server action `applyPlayStateAction(characterId, patch)` that does a partial JSONB update of just `health.*` / `resources.*` / `buffs.active[].remainingRounds` / `spellcasting.preparedSpells[].used` — **do not** round-trip the whole sheet through `useCharacterEditor`'s debounced autosave (too heavy for per-round edits). Recompute is cheap and unaffected (HP isn't an input to derived math), so skip the recompute on pure-HP writes.
- **UI**: a dedicated **Play view** (`/characters/[id]/play`) — a stripped, large-touch-target layout (vitals, attacks with A1 rolls, prepared spells with `used++`, resource pips, active buffs with round countdown). Pairs naturally with the M10 PWA/offline work.

#### A3. Condition tracker — **value: med-high / effort: S-M**
- **Value**: Toggle the ~30 PF1e conditions (shaken, sickened, fatigued, prone, flat-footed, etc.) and have their mechanical penalties flow into the math automatically.
- **Schema**: `health.conditions: string[]` already exists. Add a condition library `packages/pathforge-schema/src/condition-templates.ts` mirroring `buff-templates.ts` — each condition maps to `AutomationEffect[]` (e.g. shaken → `-2` morale to attacks/saves/skills/ability checks).
- **Engine**: `buildModifierIndex()` already ingests buff effects via `effectToMod`/`classifyTarget` (`compute.ts:154-159`). Add a parallel loop over `character.health.conditions` that resolves each to its template effects and pushes them through the **same** stacking pipeline. Conditions like "flat-footed" need a small extension to `classifyTarget` (it has no flat-footed/touch bucket yet). Minimal, additive.
- **UI**: condition chips in the Play view + Health editor; live deltas reuse the M6 `activeBuffDelta` preview pattern.

#### A4. Initiative / encounter tracker (GM tool) — **value: high / effort: L**
- **Value**: GM runs combat across the campaign roster — initiative order, round counter, per-combatant HP, ad-hoc monsters. This is the marquee GM feature and ties directly to the existing campaign system.
- **Schema/DB**: a new `encounters` table (campaign-scoped) + `encounter_combatants` (FK to `campaign_characters` for PCs, or inline JSONB stat block for monsters), with `initiative`, `current_hp`, `conditions`, `is_turn`, `round`. Follows the existing `campaign_characters` RLS shape exactly (GM-owned, players read their own).
- **Engine**: initiative auto-rolls reuse A1 + `computed.summary.initiative`.
- **View-model**: a player should see the turn order and their own HP but **not** monster stat blocks — reuse the gating mindset from `lib/character/view-model.ts` and `audit.ts` (the §15 viewer-aware filtering already proven in M7).
- **Dependency**: builds on A1 (rolls) and A2 (HP writes) and the monster sheets in C2.

#### A5. Real-time party presence / shared roll log — **value: med / effort: L**
- **Value**: Live dice results and HP changes visible to the table via Supabase Realtime (already in the stack). Makes the Play view feel multiplayer.
- **DB**: an `encounter_events` / `roll_log` append-only table broadcast over Realtime channels keyed by campaign/encounter.
- **Risk**: Realtime auth + RLS on broadcast channels; keep it additive and opt-in per campaign.

---

### B. Social / sharing (network effects)

#### B1. Party page — **value: high / effort: M**
- **Value**: One shareable URL showing the whole party at a glance (the public-card view of each member). Strong organic-growth surface and a natural complement to campaigns.
- **DB/route**: campaigns already have `public_slug` (unused). Add `/p/[campaignSlug]` rendering each rostered character through `buildCharacterViewModel(..., "party_viewer")` — **the `party_viewer` context already exists** in `ALL_CONTEXTS` and `LEVEL_ALLOWED` (`view-model.ts:21,28`) but has no UI consuming it. This is largely wiring an existing privacy tier to a new page.
- **Privacy**: GM toggles party-page publication; each owner's per-section privacy still applies via the existing gate. Zero new privacy logic.

#### B2. Character gallery / discovery — **value: med / effort: M**
- **Value**: A browsable directory of opted-in `public` characters (builds, art, backstories) — community + SEO + a reason to make sheets public.
- **DB**: `characters.visibility = 'public'` + `public_slug` already exist; add a `gallery_listings` view or a `featured`/`gallery_opt_in` flag and tag-based filtering on the existing `metadata.tags`.
- **Reuse**: cards render from the same anonymous view-model as `/c/[publicSlug]` and the `/api/v1/public` endpoints — no new privacy surface.

#### B3. Embeds + richer OpenGraph cards — **value: med / effort: S**
- **Value**: Paste a character into Discord/forums/blogs and get a live stat card. Pure distribution.
- **Reuse**: `/api/v1/public/characters/{slug}/opengraph` and `/discord/character-card` **already exist**. Add an `<iframe>`-embeddable `/embed/[slug]` route and an SVG/PNG badge endpoint built on the same anonymous view-model. Mostly a thin presentation layer over shipped API.

---

### C. Content (the spell-compendium pattern, repeated)

The `spell_compendium` table (~3,034 rows, GIN-indexed `search_vector`, `search_spell_compendium` RPC, public-read RLS) is a proven, reusable pattern. Two obvious extensions:

#### C1. Feats / items / class-features compendium — **value: high / effort: L (mostly data)**
- **Value**: A feat picker and magic-item picker as polished as the spell picker — the most-requested thing after spells. Auto-fills `feats.list[].automation` / `inventory.*[].modifiers` so picked content is *mechanically live*, not just text.
- **DB**: new `feat_compendium` / `item_compendium` tables cloned from `spell_compendium` (same `search_vector` + RPC shape). Store prerequisites + an `automation` JSONB column of `AutomationEffect[]` so the engine ingests them with **no engine changes** (`buildModifierIndex` already reads `feat.automation` at `compute.ts:176-179`).
- **Effort driver**: licensing/data sourcing (PRD/OGL content), not code. The code is a near-copy of the spell path.
- **UI**: `feat-picker.tsx` / `item-picker.tsx` mirroring `spell-picker.tsx`.

#### C2. NPC / monster stat blocks — **value: high (esp. with A4) / effort: L**
- **Value**: GMs build/store monsters and drop them into encounters (A4). Bestiary import is a known PF1e need.
- **Schema**: monsters can reuse `pathForgeCharacterV1Schema` with a `metadata.custom.entityType = "monster"` marker, or a lighter `monsterStatBlockSchema`. Reusing the character schema means the **whole engine, view-model, and import/export pipeline come for free**. Recommend reuse + a creator-type discriminator on the `characters` row.
- **Dependency**: enables A4; pairs with a statblock-parser importer (already a deferred M8 tail).

---

### D. AI-assisted features (monetization-friendly)

These are the natural premium tier. All can be grounded in the canonical schema + compendiums so the model operates on structured data, not guesses.

#### D1. Level-up wizard — **value: high / effort: M-L**
- **Value**: Guided level-up — pick class/HP/skills/feats/spells with legality checks. Reduces the steepest PF1e friction.
- **Schema**: `progression` block already exists (`characterProgressionSchema`); `hitDice[]` and favored-class bonus are modeled (`vitals.ts:5-12`). Largely a structured flow over existing fields + C1 compendium.
- **AI is optional** — the deterministic version (rules-driven prompts) is the valuable core; AI adds suggestions.

#### D2. Build advisor / legality linter — **value: med-high / effort: M**
- **Value**: "You have a feat with an unmet prerequisite," "your CL is too low for that spell," "dump-stat warning." 
- **Reuse**: `lib/character/audit.ts` already does privacy-aware math/content auditing for GMs — extend its rule set into a player-facing linter. Mostly new rules on an existing engine, no schema change.

#### D3. Natural-language rules lookup — **value: med / effort: M**
- **Value**: "What does the grappled condition do?" answered from the compendiums (C1) + condition library (A3) via RAG over the existing `search_vector` indexes. Keeps answers grounded and licensable.
- **Risk**: must cite sources; never invent rules. Pair with the deterministic condition/feat data so it's retrieval-grounded.

---

### E. Printing / PDF character sheets — **value: high / effort: M**
- **Value**: A clean printable/exportable PDF is table-stakes and a deferred M9 tail (§13.3 printable-PDF export is explicitly listed as deferred in CLAUDE.md).
- **Reuse**: the `pathforge-exporters` package + `runExport` + `exportCharacterAction` + `export_jobs` logging already exist (M9 Pass A/B). Add a `printable-pdf` adapter (server-side render → `pdf-lib`, the same dep M8's fillable-PDF importer uses) driven by the privacy view-model so public PDFs stay filtered.
- **Dependency**: slots straight into the existing export UI at `/characters/[id]/exports`.

---

### F. VTT integration beyond import/export — **value: med / effort: L-XL**
- **Value**: Live sync to Foundry (a PathForge module) so sheet edits reflect in-VTT without re-import.
- **Reuse**: the `/api/v1/characters/{id}/*` authenticated endpoints + scoped API keys (`pf_live_…`) + the Foundry actor exporter all exist. A Foundry module polls/pulls via API key. Two-way write-back is the XL part (auth + conflict resolution); read-only pull is L.
- **Risk**: round-trip fidelity is already flagged as a deferred M9 limitation; treat write-back as later.

---

### G. Accessibility — **value: med / effort: S-M (incremental)**
- **Value**: The editor already invests in a11y (ARIA tab roles, roving tabindex, `useId`/`htmlFor` in `NumberField`). Extend: full keyboard nav of the Play view, screen-reader live regions for roll results / HP changes, `high_contrast` theme audit (the token already exists in `globals.css`), reduced-motion, and dyslexia-friendly font option.
- **Reuse**: theme tokens (`--pf-*`) and the existing high-contrast theme make this mostly auditing + polish, fitting M11.

---

### H. Monetization-friendly extras — **value: strategic / effort: varies**
- **Premium content packs** via the **already-existing-but-unused** `content_packs` / `rule_modules` tables (`0001_core_schema.sql:227-256`) + the optional-rules framework (`optional-rules.ts`, `isModuleKeyEnabled`). The whole 3pp/module plumbing is built; monetization is a paywall + pack catalog on top.
- **Higher API rate limits / more keys** — the rate-limit infra (`0011`/`0012`, scoped keys) is the natural metering point.
- **AI features (D)** as the subscription anchor.
- **Custom themes / character art hosting** — small, low-risk upsells over the existing theme system + portrait storage.

---

### Cross-cutting open questions / risks

- **Transient-write architecture**: per-round HP/resource edits must NOT go through the full `useCharacterEditor` save+recompute cycle. Decide on the focused `applyPlayStateAction` partial-JSONB path early — it's a prerequisite for A2/A3/A4 and for M10 offline. Risk: conflict with the autosave draft model if both write the same fields concurrently.
- **Condition stacking**: `classifyTarget` (`compute.ts:85-103`) lacks buckets for flat-footed/touch AC and ability-check penalties — A3 needs small, careful additions to avoid regressing existing stacking tests.
- **Realtime RLS** (A5): Supabase broadcast-channel authorization is a new security surface; gate it per-campaign and keep it opt-in.
- **Content licensing** (C1/D3): PRD/OGL sourcing and attribution are the real cost; code is cheap. Resolve licensing before committing to data scope.
- **Monster-as-character reuse** (C2): reusing `pathForgeCharacterV1Schema` is powerful but risks bloating the characters table / RLS with a second entity type — needs a clean creator-type discriminator and gallery/list filtering.
- **Privacy regression surface**: every new read surface (party page, gallery, embeds, encounter player view) MUST route through `buildCharacterViewModel` with the correct `ViewerContext`. The M7/M9 reviews already caught privacy-leak classes here — reuse the existing gate, never read raw `sheet_data`.

---

### Prioritized "do these first" list

1. **A2 HP/resource quick-adjust + a Play view** — highest table value, all fields already exist, and it's the foundation for everything else play-time. Pairs with M10 PWA.
2. **A1 sheet-wired dice roller** — the most conspicuous missing feature vs. every competitor; pure-package, no schema risk.
3. **A3 condition tracker** — small, high-value, reuses the buff/stacking pipeline; completes the Play view.
4. **B1 party page** — near-free (the `party_viewer` view-model tier already exists, just unwired) and a real growth lever.
5. **E printable-PDF export** — a deferred M9 tail, slots into the existing exporter/UI with minimal new surface.
6. **A4 initiative/encounter tracker** (then **C2 monster sheets**) — the marquee GM feature once A1–A3 exist.
7. **C1 feat/item compendium** — proven pattern, engine-ready (`feat.automation` already ingested); gated on content licensing.

Key files referenced: `lib/character/view-model.ts` (gates + the unused `party_viewer` context), `packages/pathforge-rules-pf1e/src/compute.ts` (`buildModifierIndex`/`classifyTarget`/`effectToMod` for conditions; `damageFormula` passthrough for dice), `packages/pathforge-schema/src/vitals.ts` (`health.currentHp/tempHp/nonlethalDamage/conditions`) and `src/common.ts` (`resourceRefSchema.current/per`), `packages/pathforge-schema/src/buff-templates.ts` (template for `condition-templates.ts`), `supabase/migrations/0006_spell_compendium.sql` (compendium pattern for C1/C2), `supabase/migrations/0001_core_schema.sql` (unused `content_packs`/`rule_modules`/`export_jobs`/`api_keys`), `lib/api/catalog.ts` + `app/api/v1/discord/character-card/route.ts` (embed/card reuse), `packages/pathforge-exporters` + `lib/actions/exports.ts` (printable-PDF host), and `lib/character/audit.ts` (build-linter base).


---


## S7 — Full feature review + final pass

**Overview.** Before calling PathForge "1.0", a comprehensive audit across every milestone
(M0–M11 plus whichever S-items shipped): correctness, privacy, performance, accessibility, and UX
consistency. This is the true final gate.

**Scope.**
- **Adversarial multi-agent review** (the established cadence) across the whole surface: privacy/RLS,
  the rules engine vs PF1e RAW, import/export round-trips, the `/api/v1` surface, and the edit workspace.
- **End-to-end flows** (Playwright): signup → create → edit → share → API pull; import (each adapter)
  → preview → commit; campaign create → roster → GM audit → approve; export round-trips.
- **Rules-engine validation suite** against known-good PF1e characters (the import fixtures in `docs/`
  are good seeds): assert computed HP/BAB/saves/skills/AC match hand-calculated values.
- **Performance**: large sheets (high level, many buffs/spells/items), bundle size, server-action
  latency, and a DB query / N+1 audit.
- **Security hardening checklist**: enable Supabase leaked-password protection (a dashboard toggle the
  advisor keeps flagging); re-run `get_advisors`; re-audit every admin-client call site for an
  authorize-in-code guard; confirm rate-limit coverage; secret hygiene.
- **Content/UX consistency**: terminology, empty states, error copy, theme parity, keyboard nav.

**Effort:** L · **Depends on:** everything · **When:** the final gate before launch / 1.0.

---

## Suggested sequencing & dependencies

A recommended order (not binding — quick wins first, biggest/most-dependent last):

1. **S1 — Point Buy** (S). Self-contained, no engine changes, high value at the highest-friction
   moment (character creation). Good first quick win.
2. **S3 — Spells + Classes** (L). Prebuilt classes (S3b) also smooth character creation and pair well
   with S1; the spells deepening (S3a) is high player value. Engine + schema + view-model work.
3. **M10 (PWA/offline) + S5a — Mobile-web overhaul** (L). Do these together — the responsive overhaul
   is part of the same mobile story and unblocks the PWA install experience.
4. **S2 — `/view` polish** (M), inside **M11**. Depends on S3 (spell display) and S5a (responsive).
5. **S5b — Native apps + real-time sync/conflict** (XL). The biggest item; depends on M10's offline
   model and on locking down the sync/conflict design. Reuses `@pathforge/schema` + `@pathforge/rules-pf1e`.
6. **S4 — 3pp / optional-rules content** (L, ongoing). Data-driven; can interleave once the registry
   pattern lands. Builds on the existing `optional-rules.ts` framework.
7. **S6 — Additional features** (varies). Cherry-pick from its own "do these first" list (e.g. dice
   roller, encounter/initiative tracker, feats/items compendium) as capacity allows.
8. **S7 — Full feature review** (L). The final gate before 1.0; depends on everything above.

_Generated from a 7-agent design fan-out (each grounded in the live codebase), then assembled +
edited. Treat the per-section designs as starting points to validate at build time, not final specs._
