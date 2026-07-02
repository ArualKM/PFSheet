# 3pp Update — TSV Compendium (README / Manifest)

Third-party (3pp) Pathfinder 1e rules data for **PFSheet / PathForge**, parsed from the archived HTML in `3pp Update/` into tab-delimited **TSV** tables. Same pipeline and contract as the `PFcore Update/csv` project: additive Supabase compendium tables (public-read, service-role-write), a `tsvector` search column + search RPC, a `source` citation per row, and deterministic mechanics wired to the `@{…}` formula DSL. Every 3pp row also carries a **`system`** tag so whole systems can be filtered and gated behind a settings toggle.

**Format:** tab-delimited (`\t`), UTF-8, one header row. Internal newlines are encoded as `<br>`; embedded tables/progressions as JSON. No field contains a raw tab or newline (integrity-verified: every table has a constant column count).

## Tables (20) — 14,350 rows (post Phase 0, 2026-07-02)

| # | Table | Rows | System | What it is |
|--:|---|--:|---|---|
| 1 | `psionic_powers` | 678 | psionic | Individual powers (full rules text, augment, mythic) |
| 2 | `psionic_power_class_levels` | 2,458 | psionic | Junction: power → class + level (the per-class power lists) |
| 3 | `pow_disciplines` | 21 | path_of_war | Martial disciplines (skill, weapon groups, tradition) |
| 4 | `pow_maneuvers` | 758 | path_of_war | Maneuvers & stances — full rules text, from d20pfsrd (all 22 disciplines) |
| 5 | `akashic_veils` | 1,332 | akashic | Veils (slot, descriptors, effect, bind effect) — deduped |
| 6 | `veil_class_lists` | 6,645 | akashic | Junction: veil → class veil list (membership) |
| 7 | `major_drawbacks` | 29 | optional | Ultimate Options major drawbacks (RGG) |
| 8 | `flaws` | 13 | optional | 3.5 SRD character flaws |
| 9 | `oaths` | 23 | optional | Spheres oaths (grant Oath Points) |
| 10 | `oath_boons` | 33 | optional | Spheres oath boons (spend Oath Points) |
| 11 | `backgrounds` | 8 | optional | Adamant general background categories |
| 12 | `occupations` | 41 | optional | Adamant specific backgrounds/occupations (class-skill grants) |
| 13 | `metzofitz_feats` | 266 | akashic/psionic/rune/… | 3pp feats (Miraheze), system-tagged |
| 14 | `spheres_feats` | 607 | spheres | Spheres of Power/Might feats |
| 15 | `threepp_archetypes` | 863 | all 4 | Archetypes across Akashic/Psionic/PoW/Spheres |
| 16 | `threepp_classes` | 130 | akashic/psionic/pow | Base + prestige classes (stats + progression JSON) |
| 17 | `spheres_class_options` | 17 | spheres | Spheres class-option pages (discoveries, rage powers, …) |

`system` values: `psionic`, `path_of_war`, `akashic`, `spheres`, `optional` (plus `rune_magic` / `metascript` / `other` inside `metzofitz_feats`).

> **`pow_maneuvers` (rebuilt from d20pfsrd):** now carries full per-maneuver rules text plus initiation action, range, target, and duration — a source-tagged superset of the earlier Miraheze set. Covers all **22** disciplines: the 21 in `pow_disciplines` **plus Radiant Dawn and Unquiet Grave**. The 758 per-maneuver source pages live in `3pp System Rules/Path Of War/Disciplines/Maneuvers/<Discipline>/` (Black Seraph + Golden Lion are real d20pfsrd sub-pages; the other 20 disciplines were split from each discipline's inline `<h4>` sections).

> **Phase 0 additions (PathForge, 2026-07-02):** `threepp_races` (20 akashic races), `threepp_racial_traits` (286 spheres alt racial traits), `threepp_traits` (131 spheres traits); PoW core classes (Stalker/Warder/Warlord/Zealot + rebuilt Harbinger/Mystic) and 22 PoW class archetypes parsed from the d20pfsrd pages; Radiant Dawn + Unquiet Grave discipline rows; all 266 blank spheres `base_class` values backfilled; byte-identical dupes removed (23 archetypes / 13 spheres feats) and the psionic-system Zealot dupe dropped (Zealot lives under `path_of_war`). Loaded to Supabase via `loader/threepp.mjs` (migrations 0027/0028); table names in the DB end `_compendium` (e.g. `pow_maneuvers.tsv` → `pow_maneuver_compendium`); metzofitz+spheres feats union into `threepp_feat_compendium`, major_drawbacks+flaws into `threepp_drawback_compendium` (category column).

## Column reference

- **psionic_powers** — name, discipline, descriptors, display, manifesting_time, range, target_area_effect, duration, saving_throw, power_resistance, power_points, description, augment, special, mythic, source, url
- **psionic_power_class_levels** — power, class, level
- **pow_disciplines** — name, associated_skill, associated_weapon_groups, martial_tradition, title_veil, dao_veil, description, source, url
- **pow_maneuvers** — name, discipline, level, category *(Maneuver/Stance)*, type *(Strike/Boost/Counter/Stance)*, descriptor, initiation_action, range, target, duration, saving_throw, prerequisite, description, source, url
- **akashic_veils** — name, slot, descriptors, effect, bind_effect, is_retold, source, url
- **veil_class_lists** — veil, veil_list
- **major_drawbacks** — name, effect, bonus_granted, description, source, url
- **flaws** — name, drawback_effect, prerequisite, description, source, url
- **oaths** — name, oath_points, oath, defiance_penalty, atonement, source, url
- **oath_boons** — name, oath_point_cost, type, description, source, url
- **backgrounds** — name, type, description, source, url
- **occupations** — name, class_skills_or_benefit, granted_feat, description, source, url
- **metzofitz_feats** / **spheres_feats** — name, type, system, prerequisites, benefit, normal, special, source, url
- **threepp_archetypes** — name, base_class, system, altered_features, description, source, url
- **threepp_classes** — name, class_type *(base/prestige)*, system, alignment, hit_die, skill_points, bab, fort, ref, will, class_features, progression_json, description, source, url
- **spheres_class_options** — name, base_class, system, option_type, description, source, url

## The two "list" models

Unlike Spheres (open talent trees, already in Supabase), Psionic / Akashic / Path of War content is organized as **per-class lists**, exactly like PF spell lists — reuse the spell-list picker UI:

- **Powers (psionic):** `psionic_powers` is the catalog; `psionic_power_class_levels` is the per-class list (power → class + level). Default the picker to the character's class list; uncheck to browse all 678.
- **Veils (akashic):** `akashic_veils` is the catalog; `veil_class_lists` is the per-class list (veil → class). Veils bind to chakra **slots**; supplement veils may be metadata-only (see Limitations).
- **Maneuvers (PoW):** `pow_maneuvers` carries `discipline` + `level`; a class's access is its associated disciplines (`pow_disciplines`) plus discipline-access feats/archetypes.

## Optional rulesets (settings toggles)

`major_drawbacks`, `flaws`, `oaths`+`oath_boons`, `backgrounds`+`occupations` are each gated behind a settings checkbox. When enabled, the sheet lets the player pick entries and auto-applies their mechanical pieces (drawback→bonus, oath points budget, background→class skill/feat). Each also supports a **custom builder** so players define their own with the same fields.

## Secondary tables on core pages

Per the design, 3pp content that parallels core PF content is exposed as a **secondary, source-tagged, searchable table alongside** the PFcore table (not merged): `metzofitz_feats` + `spheres_feats` on the main Feats page (filter by `system`); veils/powers/maneuvers as their own pickers. Every row carries `system` + `source` so the UI can filter and settings toggles can gate whole systems.

## Method / reproducibility

Parsers live in `csv/parsers/` (one per table group; stdlib-only Python 3, regex over the archived HTML). Re-runnable and idempotent. Miraheze pages parse via the portable-infobox (`data-source` keys) + section text + wikitables; Spheres (wikidot) via `#page-content`; d20pfsrd/d20srd via inline tables + article text.

## Known limitations / follow-ups

- **Spheres class-archetypes:** ~266 archetypes (the `*/Archetypes/` variants of Spheres classes) have a blank `base_class` — the wiki page titles don't name the base class. The description text still contains it; can be back-filled.
- **Akashic supplement veils:** ~395 "standard" veils from expansion books (Whispers of Immortality, Expanded Akasha, Akasha Retold, …) are catalogued by metadata only (name/slot/descriptors/source) — the wiki does not reproduce their effect text (it lives in the source books). Verified against source HTML; not a parse gap.
- **Retold veils:** 234 `(Akasha Retold)` variants are pointer rows (empty effect by design).
- **Spheres class options:** captured at the page level (one row per option page). Per-option decomposition (like PFcore's `class_options`) is a possible follow-up.
- **PoW base classes:** the 5 Fandom-sourced classes (Harbinger, Medic, Mystic, Parasite, Rajah) were browser-saved without a portable infobox, so their stat columns are sparse (name/description present).
- **3pp traits / alt racial traits:** not separately downloaded as their own set; when added they become secondary tables on the Traits / Race pages (same pattern as feats).

See `INSTRUCTIONS_FOR_CLAUDE_ULTRACODE.md` for the Supabase load contract, per-system tags/filters/UI, and the effects/automation mapping.
