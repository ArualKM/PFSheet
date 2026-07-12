# PFcore — Compendium-Driven Builder (M12) — Master Plan

> **STATUS (2026-07-12): COMPLETE.** 9 of the 10 phases below shipped, each after an
> adversarial Workflow review + real-browser verification (Phase 0 data load through Phase 7
> races, plus Phase 9 companions). **Phase 8 (mythic depth compendium picker) was honestly
> skipped** — `mythic_path_ability_compendium.name` data turned out to be unusable book
> references, not real ability names (the mythic CORE system itself shipped separately,
> pre-M12, and was later completed with recovered names — see CLAUDE.md "Mythic completed").
> See CLAUDE.md "M12 (PFcore compendium-driven builder) is COMPLETE" for the full phase log,
> and `PHASE4_STATUS.md` in this folder for the keystone class-builder's detailed resume notes.

_Authored 2026-06-29 from a 4-agent grounded assessment of the live PathForge codebase + the new
`docs/PFcore Update/csv/` dataset (25 TSV tables / ~25,924 rows). This is the authoritative plan for the
"PFcore" epic: turning PathForge from a hand-entered sheet into a **compendium-driven builder** where you
tap to apply official PF1e content and the engine auto-fills the mechanics._

> **Companion docs:** the data-side spec is `csv/INSTRUCTIONS_FOR_CLAUDE_ULTRACODE.md` + `csv/README.md`.
> The app-to-1.0 plan is `docs/V1_ROADMAP.md` (DONE through V1·6). This plan is **post-1.0** and additive —
> it never touches the v1 core, `spell_compendium`, or the `sphere_*` tables.

---

## 0. The vision (owner's words, distilled)

A character sheet that **knows** Pathfinder. You pick Rogue 5; the engine fills Sneak Attack, Evasion,
Trap Sense, and prompts you to choose your Rogue Talents. You add Toughness; your HP goes up. You apply an
archetype; it swaps the right features and blocks conflicting archetypes. You meet a prestige class's
prereqs; it unlocks at the next level. Your wizard gains a familiar; a one-click wizard creates its linked
subsheet. Every table also has **custom slots** so you can hand-enter homebrew. All of it color-chipped,
accordion-organized, mobile-first, and secured by the same compendium-contract RLS as spells/spheres.

This is the natural payoff of the v1 work: the **effect-hook system** (feat/trait/feature/item `automation[]`
→ the buff/stacking engine) is already live, and the new dataset already speaks that exact DSL.

## 1. Design principles (non-negotiable)

1. **Additive only.** New compendium tables + new migrations after `0020`. Never alter `spell_compendium`,
   the six `sphere_*` tables, the v1 character schema's existing fields, or migrations `0001–0020`.
2. **Compendium contract** for every new table (proven by spells + spheres): PUBLIC read · service-role
   write · a generated `tsvector search` column · a `search_*` RPC · a GIN index · `source` + `url` on every
   row. (See `INSTRUCTIONS_FOR_CLAUDE_ULTRACODE.md` §2.3.)
3. **Reuse the framework.** Pickers reuse the `spell-picker`/`sphere-picker` pattern; applied content lands
   in the existing `FeatEntry`/`FeatureEntry`/`TraitEntry` (each already carries `automation[]` + `chosenOptions`);
   companions reuse the character sheet itself. Don't invent parallel systems.
4. **Engine computes, UI renders.** All math in `@pathforge/rules-pf1e`. New automation flows through
   `classifyTarget` → `effectToMod` → the bonus-stacking engine. No game math in components.
5. **Over-preserve text; never invent numbers.** Automation is encoded ONLY where a mechanic is unambiguous
   and deterministic (the `feats_effects`/`features_effects` seed model). Everything else stays as displayed
   rules text the player reads.
6. **Custom slots everywhere.** Every applied entity remains hand-editable; every list takes a "+ custom"
   entry. The compendium is a fast-start, never a cage.
7. **Spheres-grade polish.** Color-chips per domain (class/feat/trait/race/archetype/prestige/companion),
   accordions/modals/show-hides to tame the volume, real-browser-verified, mobile-first, a11y-clean.

## 2. Architecture grounding (the seams we plug into)

| System | Where | What it gives us |
|---|---|---|
| Character schema | `packages/pathforge-schema/src/{identity,feats,inventory,optional-rules}.ts` | `identity.classes[]` (name/level/archetype/track/presetKey), `FeatEntry`/`FeatureEntry`/`TraitEntry` with `automation[]` + `chosenOptions`, the optional-rules framework (`isModuleKeyEnabled`, `IMPLEMENTED_MODULE_KEYS`). |
| Rules engine | `packages/pathforge-rules-pf1e/src/compute.ts` + `class-catalog.ts` + `stacking.ts` + `gestalt.ts` | `computeCharacter`; `recomputeClassDerived` (BAB/saves/HP from presets, fractional + gestalt-aware); `computeMaxHpFromLevels`; `classifyTarget` (which paths effects can hit); `effectToMod`; the bonus-stacking engine; `CharacterResolver` for `@{path}` formulas. |
| Automation editor | `components/character/editor/automation-effects-editor.tsx` | The shipped `target·op·value·bonusType` row editor on feats/features/traits/items. The new `*_effects` TSVs are pre-baked rows for it. |
| Class apply | `class-catalog.ts` `applyClassPreset()` | The "tap-to-apply a class" flow (creates/updates a class row, unions class skills, seeds casters, recomputes derived). The hook for progression-driven building. |
| Compendium pickers | `components/character/editor/{spell,sphere}-picker.tsx` + `search_spell_compendium`/`search_sphere_*` RPCs | The exact UI + RPC pattern to clone for feats/traits/races/options/archetypes/prestige. |
| Privacy/view-model | `lib/character/view-model.ts` | §15 gating; where new read-view cards + privacy sections register. |

## 3. The data (25 TSVs → compendium tables)

**Browsable prose (→ search pickers):** `feats` (3,337) · `traits` (1,916) · `drawbacks` (66) · `races`
(77) · `archetypes` (1,318) · `prestige_classes` (118) · `class_options` (2,370 choice-pool entries) ·
`mythic_path_abilities` (431) · `animal_companions` (214 statblocks) · `familiars` (187) ·
`eidolon_evolutions` (79).

**Relational / computational (→ drive the engine):** `class_progression` (49, `json_data` level tables) ·
`class_features` (494, level-tied) · `archetype_features` (6,054, **with `replaces`**) · `feat_prerequisites`
(7,651, normalized req_type/req_value) · `race_traits` (77, ability mods/size/speed/traits) ·
`alternate_racial_traits` (275, **with `replaces`**) · `favored_class_options` (731) · `feats_effects` /
`features_effects` (the **automation seed**, already in our `@{…}` DSL).

**Special:** `mythic_spells` (287) loads as a **mythic-augmentation** table keyed to `spell_compendium` by
name (never as competing base spells — `INSTRUCTIONS` §8.3).

---

## 4. The phased plan

Each phase ships in our cadence: build a pass → adversarial Workflow review → `pnpm lint && test &&
typecheck && build` → real-browser check → commit/push → prod-verify. Efforts: S/M/L/XL.

### Phase 0 — DATA LOAD (the hard prerequisite) · XL · ⚠ owner sign-off (DB)
**Goal:** the 25 TSVs become ~15 Supabase compendium tables so everything downstream has data.
- **Tables (compendium contract each):** `feat_compendium`, `feat_prerequisite` (relational child),
  `trait_compendium`, `drawback_compendium`, `race_compendium`, `race_trait`, `alternate_racial_trait`,
  `favored_class_option`, `class_compendium`, `class_progression` (`json_data` jsonb), `class_feature`,
  `class_option_compendium`, `archetype_compendium`, `archetype_feature`, `prestige_class_compendium`,
  `prestige_progression` (jsonb), `mythic_path_compendium`, `mythic_path_ability`, `mythic_spell_augment`
  (joins `spell_compendium` by name), `animal_companion_compendium`, `familiar_compendium`,
  `eidolon_base_form`, `eidolon_evolution`, `feat_effect` / `feature_effect` (automation seeds). (~24 tables;
  group thematically into ~4–6 migrations after `0020`.)
- **Each:** stable `slug` PK (`slugify(parent, kind, name)` per `INSTRUCTIONS` §10.3), `source` + `url`,
  generated `search` tsvector over the prose columns, GIN index, RLS public-read/service-write, and a
  `search_<table>(q text)` RPC where browsable.
- **Load mechanism (decision — see §7):** the TSVs are already generated; the big ones (archetype_features
  3.9 MB, archetypes 3.7 MB, class_options 2.3 MB, feats 2.2 MB) are too large for MCP `execute_sql` inserts.
  Recommended: migrations create the tables; the **owner runs `psql \copy ... FORMAT csv, DELIMITER E'\t',
  HEADER true`** per `INSTRUCTIONS` §8.2 (one runbook command per table). Fallback: a chunked Node/SQL loader.
- **After:** regenerate `lib/supabase/types.ts` (Supabase MCP), run `get_advisors`.
- **Accept:** every table loads with 0 rejected rows; `search_feats('toughness')` etc. return ranked hits;
  advisors clean. **Blocks all other phases.**

### Phase 1 — COMPENDIUM BROWSE · M
**Goal:** read-only browse pages, exactly like `/spells` + `/spheres`.
- New routes under `app/(app)/`: `/feats`, `/traits` (incl. drawbacks tab), `/races`, `/archetypes`,
  `/prestige`, `/class-options`, `/companions` (or a unified `/compendium` hub with tabs). Ranked search via
  the RPCs; alpha-paginate when browsing; detail rows (the spell-style expand) with the verbatim rules text.
- Sidebar nav entries (game-icons), color-chips per domain.
- **Accept:** each page searches + paginates + renders verbatim text on mobile + all 3 themes. No auth/data
  beyond the public compendium. **Low risk, immediate payoff.**

### Phase 2 — PICKERS (tap-to-apply) + PREREQ ENGINE · L
**Goal:** add compendium content to a character from the editor.
- **Pickers** (clone `sphere-picker`): Feat picker, Trait/Drawback picker, Class-Option picker (rogue
  talents/discoveries/rage powers/bloodlines/…), Archetype picker, Prestige picker, Race picker. Selecting
  an entry maps it into the existing `FeatEntry`/`FeatureEntry`/`TraitEntry` (name + prereqs + benefit text +
  `compendiumId` + any baked `automation[]`).
- **Prereq engine** (`packages/pathforge-rules-pf1e/src/prerequisites.ts`, NEW): evaluate
  `feat_prerequisite` rows against the computed character (feat owned? ability ≥ N? BAB ≥ N? skill ranks ≥ N?
  level ≥ N? caster level?). Returns met/unmet per requirement → the picker **flags/highlights** unmet
  prereqs (chip: green met / amber unmet) but never hard-blocks.
  - **Skip-prereq cases:** model "ranger/monk may ignore prereq X for combat-style/bonus feats" as a
    per-feat exception checked against the character's classes (data: a small `prereq_exceptions` map, or a
    flag on the grant). Surface as "prereq waived by Ranger combat style."
  - **"Ignore prerequisites" setting** (`rules.variants.ignorePrerequisites`) + a per-pick "force take
    anyway" with a dismissible warning.
- **Accept:** apply a feat/trait/option → it lands on the sheet with correct text; unmet prereqs are flagged;
  force-take works; ranger/monk waivers show. Adversarial review (prereq correctness).

### Phase 3 — AUTOMATION HOOKS ("buffs in compendium features") · M
**Goal:** applied compendium content auto-applies its mechanics through the effect engine.
- Load `feat_effect`/`feature_effect` into the compendium; when a feat/feature is applied (Phase 2) and has a
  seed effect, pre-fill its `automation[]` (the user can still edit via `AutomationEffectsEditor`).
- **Expand the seed** beyond the 14 curated rows for the common deterministic feats/features (Weapon Focus,
  Dodge, Improved Initiative, Iron Will/Lightning Reflexes/Great Fortitude, Skill Focus, etc.) — only where
  unambiguous (the `INSTRUCTIONS` §7.9 discipline). Everything else stays display-only.
- Confirm `classifyTarget` covers the targets the seeds use; add any missing target domains.
- **Accept:** applying Toughness raises HP; Weapon Focus raises the chosen weapon's attack; Dodge raises AC —
  live, through the stacking engine, with a "Show Math" trail. Tests lock each seeded effect.

### Phase 4 — PROGRESSION-DRIVEN CLASS BUILDER · XL
**Goal:** a level-by-level builder driven by `class_progression` + `class_features` + `class_options`.
- **Schema** (`identity.ts`): a `levelPlan: LevelPlanEntry[]` on `progression` — per entry: `level`,
  `className`, `track?`, `classFeatures[]` (auto), `choiceFeatures[]` (`{optionType, group, selected?,
  available?}`), `hitPoints?`, `feats[]`. Plus `choiceFeatGrants[]` for "Extra X" feats. (See class-builder
  report for the full Zod.)
- **Engine** (`class-catalog.ts` + new `class-features-engine.ts`): `buildLevelPlan(character)`,
  `deriveClassFeatures(classKey, upToLevel)`, `getChoiceFeatureLevels(classKey)`,
  `getAvailableChoices(classKey, optionType, level, taken)`, `selectChoiceFeature(...)`. `applyClassPreset`
  calls `buildLevelPlan` after its existing logic.
- **Good/Bad save + BAB + skill-rank progressions as first-class data** (`class-progression-tables.ts`
  parsed from `class_progression.json_data`): drive BAB/saves with the existing **fractional** support and
  **skill ranks/level** (we already have HD); surface the curves in the builder.
- **Choice features:** when a level grants "Rogue Talent"/"Discovery"/"Bloodline"/"Rage Power", prompt a pick
  from `class_option_compendium` (filtered by level + prereqs + already-taken). **"Extra Rogue Talent"-type
  feats** add an extra pick via `choiceFeatGrants`.
- **Gestalt:** per-track level plans → a side-by-side comparison view; composite BAB/saves = max-per-track
  (already in `recomputeClassDerived`).
- **UI:** `LevelPlanBuilder` + `LevelCard` + `ChoiceFeatureSelector` (modal) + `GestaltComparisonView`.
  Accordions per level; choice prompts as chips.
- **Accept:** set Rogue 5 → features auto-fill, 3 talent prompts appear, picks persist, BAB/saves/skill
  ranks/HP correct (standard + fractional + gestalt). Multiple adversarial reviews (this is the keystone).

### Phase 5 — ARCHETYPES · L
**Goal:** apply an archetype to a class and correctly swap/alter features with stacking rules.
- Use `archetype_feature.replaces` to: add `feature_added`, mark the standard feature(s) `features_replaced`
  as removed/altered in the level plan. Tag whether an entry **replaces** vs **alters** a feature.
- **Stacking rule:** two archetypes on the same class may stack only if they don't both touch the same base
  feature — UNLESS both merely **alter** *separate aspects* of it (e.g. "Rogue Talent at 1/3" vs "Rogue
  Talent at 5/7"). If one **replaces** a feature, no other archetype may replace OR alter it. Implement a
  conflict checker over the (feature, replaces|alters) graph; block + explain conflicts in the picker.
- `identity.classes[].archetype` already exists; extend to a list + per-archetype feature deltas.
- **Accept:** apply Knife Master to Rogue → Sneak Attack becomes the dagger variant; a second archetype that
  also replaces Sneak Attack is blocked with a clear reason; a compatible "alter" archetype stacks. Review.

### Phase 6 — PRESTIGE CLASSES · M
**Goal:** prestige classes with prereq-gated entry.
- `prestige_class_compendium.requirements` (+ a normalized prereq parse like feats) → the prereq engine
  (Phase 2) computes eligibility. **Unlock at the level *after* all prereqs are met** (6 ranks required →
  earliest entry at L7). `prestige_progression.json_data` drives BAB/saves/casting advancement.
- **Force-take** with a dismissible warning + the global `ignorePrerequisites` setting.
- **Accept:** a prestige class greys out until prereqs met, then unlocks at the next level; casting
  "+1 level of existing class" advances the chosen caster; force-take works. Review.

### Phase 7 — RACES · L
**Goal:** apply a race → set racial profile + offer alternate traits + favored-class options.
- `race_compendium` + `race_trait` (ability mods/size/speed/senses/languages/standard traits) → applying a
  race sets `identity.race/size/speed`, seeds `FeatureEntry` racial traits (with `automation[]` where the
  mod is deterministic, e.g. `+2 Constitution`), and respects the **"+2 to one ability"** choice (a picker).
- `alternate_racial_trait` (with `replaces`) → swap standard traits (same conflict-checker pattern as
  archetypes). `favored_class_option` → per-(race,class) FCB picker feeding the existing FCB hp/skill bonus.
- **Accept:** apply Dwarf → +2 Con/+2 Wis/−2 Cha, darkvision, slow-and-steady speed; swap a racial trait for
  an alternate; pick a half-elf "+2 to one ability"; choose an FCB. Review.

### Phase 8 — MYTHIC DEPTH · M
**Goal:** full mythic path content on top of the shipped V1·3·3 mythic core.
- `mythic_path_compendium` + `mythic_path_ability` → tap-to-apply path abilities (the path-ability list is
  already a stub from V1·3·3); `mythic_spell_augment` joins `spell_compendium` so prepared/known spells show
  their mythic augmentation. Color-chip per path.
- **Accept:** pick Archmage path abilities from the compendium; a known spell shows its mythic version. Review.

### Phase 9 — COHORTS & COMPANIONS (linked subsheets) · XL · ⚠ architecture decision (see §7)
**Goal:** familiars, animal companions, eidolons, and cohorts as **linked subsheets** with a create wizard,
autofill, level-sync, and topline display.
- **Architecture (owner-signed): linked character rows (Option A).** Add `parent_character_id uuid
  REFERENCES characters(id) ON DELETE CASCADE` + `companion_type text` to `characters` (migration); a
  companion is a real (lighter-defaulted) sheet with the **same owner_id** → RLS is *free* (the existing
  `characters_select`/update policies apply). The parent dashboard reads each linked row's cached
  `computed_summary` for the **topline card** (no N+1 compute). Cohorts get the full framework (a true
  "lesser PC"); familiars default to a collapsed/light sheet.
- **Create wizard:** "Add companion" → pick type → search `animal_companion`/`familiar`/`eidolon_base_form`
  compendium → autofill the statblock/sheet → set the **level-sync formula** (`@{level}-3` animal companion /
  `@{level}` familiar / `@{casterLevel}` eidolon). **Prompt-to-create** when a feat/feature grants a
  companion (e.g. the Familiar class feature, Animal Companion, Leadership→cohort).
- **Topline display:** a Companions card in the editor + read view (name/type/level/AC/HP/attacks), each
  opening its subsheet (modal/drawer for light, full route for cohorts). Eidolon evolution picker from
  `eidolon_evolution`.
- **Accept:** a wizard's familiar + a ranger's animal companion are created via the wizard, level-sync, show
  topline, and edit as subsheets; a Leadership cohort is a full linked sheet. Adversarial review (RLS +
  privacy: a companion must never leak beyond the parent's visibility). 

---

## 5. Cross-cutting concerns (apply to every phase)

- **Color-chips** per domain (Spheres-style): class=gold, feat=rune, trait=sky, drawback=danger,
  race=success, archetype=violet-ish, prestige=gold-deep, mythic=rune, companion=gold. Chip = name + a
  source/level/prereq sub-line; click to expand the rules text.
- **Accordions / modals / show-hides** everywhere the volume is large (level plans, talent pools, archetype
  feature lists, racial traits). Lists > ~6 start collapsed (the `SphereSubsection` pattern).
- **Custom slots** on every applied entity + a "+ custom" on every list (homebrew never blocked).
- **Mobile-first** + real-browser verification (Tailwind v4 silently drops bad container-query/variant
  classes — `next build` won't catch it; see [[pathforge-collapsible-sidebar]]).
- **Security:** compendium-contract RLS on every new table; companions inherit parent visibility; the
  view-model gates any new read-view section; `get_advisors` after every DDL.
- **Prereq engine** is shared by feats, prestige classes, and (loosely) archetypes/races — build it once
  (Phase 2) and reuse.

## 6. Sequencing & milestones

```
Phase 0  DATA LOAD ───────────────┐  (blocks everything)
                                  ▼
Phase 1  BROWSE  ──►  Phase 2  PICKERS + PREREQ ──►  Phase 3  AUTOMATION
                                  │
                                  ├──►  Phase 4  CLASS BUILDER (keystone)
                                  │            └──►  Phase 5  ARCHETYPES
                                  ├──►  Phase 6  PRESTIGE
                                  ├──►  Phase 7  RACES
                                  └──►  Phase 8  MYTHIC DEPTH
Phase 9  COMPANIONS  (mostly independent; needs Phase 0 companion tables)
```
**Cut order (owner-signed): the THIN SLICE = Phase 0 → 1 → 2 → 3** ("tap-to-apply official content and it
computes") ships first as its own milestone, then we reassess before the keystone class builder (Phase 4),
then **5/6/7/8** (breadth, parallelizable) and **9** (companions, its own subsystem). Each phase is
independently shippable + reviewable; nothing forces a big-bang.

## 7. Decisions (owner-signed 2026-06-29)

1. **Companion architecture (Phase 9): ✅ LINKED CHARACTER ROWS (Option A).** A companion is a real
   (lighter-defaulted) sheet linked by `parent_character_id` + `companion_type`; same `owner_id` → RLS is
   free; the parent's topline card reads each linked row's cached `computed_summary`. Cohorts get the full
   framework (true "lesser PC"). +2 columns, one migration.
2. **Scope / order: ✅ THIN SLICE FIRST (Phase 0 → 3).** Data load → browse → pickers+prereqs → automation
   ("tap to apply official content and it computes") ships as its own milestone; reassess before the keystone
   class builder (Phase 4). Do NOT big-bang the full 0→9.
3. **Git scope: ✅ gitignore the ~11k HTML mirror; version the 25 TSVs + parsers + docs** (Spheres precedent;
   `.gitignore` updated).
4. **Still open / owner-gated when we reach them:** the Phase-0 **bulk-load mechanism** (recommended:
   owner-run `psql \copy ... FORMAT csv, DELIMITER E'\t', HEADER true` per `INSTRUCTIONS` §8.2 — it + the new
   migrations need DB sign-off); and the **licensing surface** (in-app reference like the spell compendium
   with attribution, never a data export — AoN/Paizo Community-Use/OGL "not for redistribution").

## 8. Effort summary

| Phase | Effort | Gate |
|---|---|---|
| 0 Data load | XL | owner DB sign-off |
| 1 Browse | M | — |
| 2 Pickers + prereq | L | review |
| 3 Automation | M | review |
| 4 Class builder | XL | multiple reviews (keystone) |
| 5 Archetypes | L | review |
| 6 Prestige | M | review |
| 7 Races | L | review |
| 8 Mythic depth | M | review |
| 9 Companions | XL | architecture decision + review |

This is a multi-session epic — but every phase is a clean, reviewable, shippable unit, and the data is
already shaped to drop straight into PathForge's conventions. **Start with Phase 0 once §7 is signed off.**
