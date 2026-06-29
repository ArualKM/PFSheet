# PFcore Phase 4 — Progression-Driven Class Builder (status + resume)

The keystone. Full design: `PFCORE_MASTER_PLAN.md` §"Phase 4" + the grounded synthesis (4-explorer Understand
workflow, 2026-06-29). This file = the live status + the decisions made, so any session can resume cleanly.

## Architecture (the thing that makes it additive + safe)

The existing `recomputeClassDerived` (`packages/pathforge-schema/src/class-catalog.ts`) already does **100% of
the class-derived math** (BAB / Fort-Ref-Will / HP / caster level, with fractional + gestalt) by resolving a
`ClassPreset` per `identity.classes` row. Phase 4 is therefore an **adapter**, not new math:

- **`class_progression.json_data` → a synthetic `ClassPreset`** via `parseProgression` + `compendiumRowToPreset`
  (`packages/pathforge-schema/src/class-compendium.ts`). The preset is **cached on the class row**
  (`CharacterClass.compendiumPreset`) — NOT in a session registry — so recompute is self-contained + offline-safe.
- **`resolveClassPreset(row)`** (class-catalog.ts) returns the row's cached compendium preset (authoritative) else
  its catalog preset by `presetKey`. `recomputeClassDerived` resolves every row through it. **One writer ⇒
  double-counting is structurally impossible** (proven byte-identical to the catalog in tests).
- **Feature granting** (the one new job the preset system never did): per level, push a `FeatureEntry`
  (`category: "class_feature"`, `level`, `compendiumId`) with `automation` pre-filled via the Phase 3 mapper
  `seedsToAutomationEffects` (`packages/pathforge-rules-pf1e/src/effect-seeds.ts`). Dedup by `compendiumId`.

## Build order (each step ships gate-green; 2–6 each after an adversarial review)

1. **Schema + parser** ✅ DONE (`3e9ea14`). `classPresetSchema` in common.ts (single source, re-exported by
   class-catalog); `CharacterClass.compendiumId`/`compendiumPreset`; `FeatureEntry.level`; `parseProgression`
   (infers bab/save/caster enums from real json_data — column-by-label, L1+top-level numbers, column-drift robust);
   `compendiumRowToPreset`. **Proven: parser output matches CLASS_CATALOG for all 11 core classes.**
2. **Recompute hook + equivalence** ✅ DONE (`eec43b2`). `resolveClassPreset` + the recompute wiring. **Proven:
   a compendium Fighter recomputes byte-identical BAB/saves/HP to the catalog Fighter at L1/5/11/20.**
3. **Feature granter** — `grantClassFeatures(character, {classKey, fromLevel, toLevel, featureRows})` (idempotent,
   dedup by compendiumId, automation via `seedsToAutomationEffects`) + `applyCompendiumClass` (wraps
   `applyClassPreset` with the synthetic preset, sets compendiumId + compendiumPreset, then grants L1..level).
4. **Picker UI** — `class-compendium-picker.tsx` in `IdentityEditor` (beside the catalog `ClassPresetPicker`):
   search `search_class_compendium` → detail (level + HP method + apply-report preview) → apply. RPC reads in
   `lib/character/class-compendium.ts` (hit_die "d10"→10, class_skills → keys, caster fields). Real-browser verify.
5. **Progression accordion + level-up regrant** — per-level tree (features as Su/Ex/Sp color-chips, locked levels
   dimmed); `ClassRow` level-change → `grantClassFeatures` for the delta.
6. **Choosable `class_options` sub-picker** — Discoveries / Rogue Talents / Hexes "pick N" → `FeatureEntry`.

## Decisions (owner trusts judgment; defaults taken)

- **Level-DOWN** leaves the now-higher-level feature rows in place + flags stale (never deletes user edits/notes).
- **Choosable options** are modelled as ordinary `FeatureEntry` rows tagged by option type (not a new typed
  sub-structure) — reuses everything; revisit only if enforced per-level pick-counts are wanted.

## Data notes / gotchas

- `feature_effect` is **sparse** (3 rows total) — most of the 494 `class_features` grant a *named* feature with
  empty automation (matches today's manual reality). Structure first; authored effects flow automatically.
- `class_progression.json_data` column counts drift (some have a leading section-header row, varying spell cols) —
  `parseProgression` infers from numbers, never trusts labels; warns + falls back, never blocks.
- HP from levels reads the **row's** `hitDie` (string "d10"); `applyCompendiumClass` must set it. Flat HP bonuses
  come from feats/items via the modifier index, NOT the class total (no double-count).
