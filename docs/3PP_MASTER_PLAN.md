# The Big 3pp Update — Master Plan (S4 flagship)

_Drafted 2026-07-02 from the owner's completed data drop (`docs/3pp Update/csv/` — 17 TSVs,
13,888 rows, parsers, README manifest, and `INSTRUCTIONS_FOR_CLAUDE_ULTRACODE.md`), the S4
design corpus (`docs/S4_OPTIONAL_RULES_PLAN.md`, `docs/S4_SYSTEM_DESIGNS.md`), and a 5-reader
grounded sweep of the shipped infrastructure. This supersedes the dataset-blocked portions of
the S4 plan: **the data long-pole is broken.** Additive-only throughout — nothing here modifies
PFcore/Spheres data or existing sheets._

## What the owner delivered (and the contract)

Four systems + an optional-rules bundle, parsed to TSVs on the PFcore pipeline conventions
(tab-delimited, `<br>` newlines, JSON progressions, `source`+`url` on every row, a `system`
tag on every 3pp row):

| System | Tables (rows) | Sheet system status today |
|---|---|---|
| **Psionics** | psionic_powers (678) + psionic_power_class_levels (2,458) | **LIVE** (PP pool/ML/focus/powersKnown + paste-parser) — needs the compendium + picker |
| **Path of War** | pow_disciplines (21) + pow_maneuvers (724) | Toggle exists, system NOT built (S4 design ready) |
| **Akashic** | akashic_veils (1,332) + veil_class_lists (6,645) | Toggle exists, system NOT built (S4 design ready) |
| **Spheres extras** | spheres_feats (607) + spheres_class_options (17) | Core P/M/G LIVE — these deepen it |
| **Feats (shared)** | metzofitz_feats (266, multi-system) | → secondary source-tagged feat table |
| **Classes/archetypes** | threepp_classes (130) + threepp_archetypes (863) | → class builder + archetype picker sources |
| **Optional rulesets** | oaths (23) + oath_boons (33), major_drawbacks (29), flaws (13), backgrounds (8) + occupations (41) | New small systems (Vehti already uses oaths!) |

The owner's `INSTRUCTIONS_FOR_CLAUDE_ULTRACODE.md` fixes the contract: compendium tables on
the PFcore contract (public-read RLS, service-role write, tsvector+GIN, search RPC, citations
kept), **system gating** ("when a system is off, its compendium rows are hidden and its
pickers/pools disappear"), per-system UI sketches, automation mapping, and **custom builders**
for every system (players define their own powers/veils/maneuvers/oaths/drawbacks/backgrounds).

**Owner clarification (2026-07-02):** "secondary tables should ONLY appear in search results
IF the system settings are enabled" — see the Gating Model below.

## Data audit — verified shapes, gaps, and flags

Verified against the TSVs + mirror:

- `threepp_classes.progression_json` uses the **same header-row format PFcore's
  `class_progression` uses** ("Level / Base Attack Bonus / Fort / Ref / Will / Special" + extra
  columns like Known/Readied/Stances/Manifesting) → **`parseProgression` +
  `compendiumRowToPreset` + `applyCompendiumClass` work on 3pp classes as-is** (the M12 Phase-4
  adapter), with the extra columns feeding the per-system trackers. Huge reuse win.
- `psionic_powers` has FULL rules text (median 588 chars) + augment + mythic. Clean.
- `akashic_veils`: ~703 full rows; ~395 supplement veils are **metadata-only by design** (name/
  slot/descriptors/source — effect text lives in the source books); 234 `(Akasha Retold)`
  pointer rows. Ship as-is: metadata rows render a "see {source}" note and the custom builder /
  notes field covers tables that own the book.
- `pow_maneuvers` **(rebuilt by the owner 2026-07-02 from d20pfsrd)**: 758 rows, full
  per-maneuver rules text + initiation_action/range/target/duration/saving_throw/prerequisite,
  covering all **22 disciplines** (the 21 in `pow_disciplines` + Radiant Dawn + Unquiet Grave —
  Phase 0 adds those two discipline rows). Flag #1 RESOLVED.
- PoW classes: the owner grabbed the d20pfsrd pages (Stalker/Warder/Warlord/Zealot + Harbinger/
  Mystic full-stat versions) plus TWO new archetype folders (`Archetypes/` = PoW prestige-class
  pages + d20pfsrd archetypes; `PoW Archetypes/` = archetypes FOR the PoW classes). **Not yet
  parsed into the TSVs** — Phase 0 parses them (new `threepp_classes` rows for the four core
  classes, sparse-row upgrades, new `threepp_archetypes` rows). Flag #2 RESOLVED at the page
  level.
- `threepp_archetypes`: 266 spheres rows have blank `base_class` (page titles don't name it) —
  **backfilled by us in Phase 0** from description text.
- **Not yet parsed (mirror has the pages; our work, not the owner's):** Akashic races (20
  Miraheze pages), Spheres alternate racial traits + practitioner traits (3 wikidot index
  pages) → 2–3 new TSVs in Phase 0.
- **Not in the mirror (optional owner items):** psionic races (Blue/Dromite/Elan/Half-Giant/
  Maenad/Ophiduan/Xeph…), PoW martial-tradition organizations (partial via pow_disciplines
  columns), 3pp traits beyond Spheres.

### Owner flags — RESOLVED 2026-07-02

The owner sourced everything: full maneuver text (758 rows, 22 disciplines), the d20pfsrd
core-class pages, and both PoW archetype sets. Remaining data work is OURS (Phase 0): parse
the new class/archetype pages into the TSVs, add the Radiant Dawn + Unquiet Grave discipline
rows, backfill the 266 blank spheres `base_class` values, and parse the already-downloaded
akashic races + spheres traits pages. *(Optional, non-blocking: psionic races were never
downloaded — skip unless wanted later.)*

## Architecture decisions

### D1 — The gating model (the owner's clarification, generalized)

3pp content is **system-tagged everywhere** and surfaces per context:

| Context | Rule |
|---|---|
| **Character editor pickers** (feat picker, trait picker, class/archetype pickers, new power/maneuver/veil/oath pickers) | 3pp rows appear **only when the character has the system's module enabled** (`isModuleKeyEnabled`). The feat picker unions `threepp_feat_compendium` into results *only* for enabled systems (`system = any(enabled)`); the class picker unions `threepp_class_compendium` the same way. Whole pickers for PoW/Akashic/etc. only exist inside their gated editor sections. |
| **Import verification** | 3pp tables join the probe/match tables **only when the sheet's detected/answered modules include the system** (detector questions flip modules; a "no" answer keeps 3pp tables out of matching). |
| **Public compendium browse** (`/compendium`) | Reference pages are public (the `/spheres` precedent) but **3pp lives on its own pages under a "Third-party" hub group** — core pages (`/feats`, `/classes`, …) stay 100% Paizo. No signed-out gating (a compendium is a library), but zero 3pp bleed into core pages. |
| **Read view / API** | Each system's block is §15-gated behind its own privacy section (existing pattern); off-module = no summary = nothing rendered or served. |

### D2 — Table naming & the loader

Browsable tables MUST end in `_compendium` (the `compendium_distinct` RPC enforces it).
Mapping from the owner's TSVs:

| TSV(s) | Table | Browsable |
|---|---|---|
| psionic_powers | `psionic_power_compendium` | ✓ |
| psionic_power_class_levels | `psionic_power_class_level` (junction) | – |
| pow_disciplines | `pow_discipline_compendium` | ✓ |
| pow_maneuvers | `pow_maneuver_compendium` | ✓ |
| akashic_veils | `akashic_veil_compendium` | ✓ |
| veil_class_lists | `akashic_veil_class_list` (junction) | – |
| metzofitz_feats + spheres_feats | `threepp_feat_compendium` (unioned, `system` column) | ✓ |
| threepp_classes | `threepp_class_compendium` | ✓ |
| threepp_archetypes | `threepp_archetype_compendium` | ✓ |
| spheres_class_options | `threepp_class_option_compendium` | ✓ |
| oaths / oath_boons | `oath_compendium` / `oath_boon_compendium` | ✓ |
| major_drawbacks + flaws | `threepp_drawback_compendium` (unioned, `category` = major_drawback/flaw) | ✓ |
| backgrounds + occupations | `background_compendium` / `occupation_compendium` | ✓ |
| *(Phase 0 parses)* akashic races → `threepp_race_compendium`; spheres alt racial traits → rows in `alternate_racial_trait_compendium`-style table `threepp_racial_trait_compendium`; practitioner traits → `threepp_trait_compendium` | | ✓ |

Loader: `docs/3pp Update/csv/loader/threepp.mjs` — pfcore.mjs copied, with the RPC generator
replaced by the **0026 ILIKE pattern** (substring WHERE + exact>prefix>substring>ts_rank ORDER)
so the whole-word bug is never re-introduced. Same subcommands (`ddl`/`rpc`/`grants`/`load`/
`counts`). Migrations numbered from **0027**; advisors after every DDL batch.

### D3 — Module keys (reuse, never invent)

Existing keys are reused: `psionics`, `path_of_war`, `akashic`, `spheres_of_power/might/guile`.
Shipping a system = add its key to `IMPLEMENTED_MODULE_KEYS` (un-locks the "Coming soon"
toggle). New small keys for the optional bundle (added to `OPTIONAL_RULE_MODULES` +
implemented as they ship): `oaths`, `flaws_drawbacks`, `backgrounds_occupations`.

### D4 — Per-system pipeline (the proven 4-step, every phase)

engine `summary.<x>` gated by `isModuleKeyEnabled` → view-model `gate("<key>")` +
`DEFAULT_SECTION_PRIVACY` + `SECTION_LABELS` (+ invariant tests) → editor section pushed into
`optionalSystemItems` (own file, NOT inline in character-editor.tsx) + `OPTIONAL_PRIVACY_SECTIONS`
row → dashboard card (content-heavy → main column SectionCard; compact tracker → right rail).
New privacy sections: `pathOfWar`, `akashic`, `oaths` (psionics/spheres exist). Default
**public** (consistent with 0960ee5; per-character override in Settings).

### D5 — Automation discipline (from S4, unchanged)

Spendable/conditional things (PoW boosts, psionic augmentation, oath boons) are NEVER always-on
modifiers. Clean numeric cases only: active **stances** ingest like active buffs; **veil**
modifiers are formula-valued over `@{essenceInvested}`; drawback penalties/bonus-grants and
background class-skill/feat grants apply as typed effects. Everything else = rich cached text.

### D6 — Mobile (standing rule: genuinely good on mobile, layouts may differ)

Every feature below names its mobile layout. Shared constraints: `tap-target`/h-11 controls,
`min-w-0` grid children, no sticky elements competing with the top-14 LivePreviewBar, section
labels that survive the hamburger's `max-w-[5.5rem]` truncation ("Path of War" → nav label
"Path of War", sheet label may shorten to "Martial"; "Akashic" fits). The mobile full-screen
section navigator picks up new Optional sub-rows automatically.

---

## Phases

Each phase ships gate-green (lint/typecheck/tests/build), adversarially reviewed (Workflow),
live-verified in the browser (desktop + mobile viewport), then committed + pushed.

### Phase 0 — Repo + data prep (S)
- `.gitignore`: mirror ignored, `csv/` versioned (**done**). Commit the 17 TSVs + parsers +
  docs.
- **Backfill** `threepp_archetypes.base_class` for the 266 blank spheres rows (parse the
  description's "The <archetype> is an archetype of the <class>" patterns; verified feasible).
- **Parse the already-downloaded pages** the README lists as follow-ups: akashic races (20) →
  `threepp_races.tsv`; spheres alt racial traits + practitioner traits →
  `threepp_racial_traits.tsv` + `threepp_traits.tsv` (wikidot page structure, same as the
  Spheres Phase-1 parsers).
- Sanity report: row counts, column integrity, dedup checks (the loader's `counts` mode).

### Phase 1 — Data layer (M)
- `threepp.mjs` loader (D2) → migrations **0027+**: ~16 tables + junctions on the contract,
  search RPCs (0026 pattern), grants, indexes on junction parents.
- Load all rows to prod; regenerate `lib/supabase/types.ts`; `get_advisors` clean.
- Unit smoke: a fake-free integration check via the loader's counts + a couple of RPC probes.

### Phase 2 — 3pp compendium browse + gated surfacing (M)
- `/compendium` hub gains a **"Third-party" group** of cards: Psionic Powers, Maneuvers &
  Disciplines, Veils, 3pp Feats, 3pp Classes, 3pp Archetypes, Oaths, Drawbacks & Flaws,
  Backgrounds. Thin `CompendiumConfig` pages (native accordion, filters from `system`/
  `discipline`/`slot`/`level` columns via `compendium_distinct`).
- **Gated pickers (D1):** feat-picker unions `threepp_feat_compendium` (system-filtered by the
  character's enabled modules, source badge on rows); trait/race pickers likewise once their
  tables land; `<ClassCompendiumPicker>`/`<ArchetypePicker>` union `threepp_class_compendium`/
  `threepp_archetype_compendium` for enabled systems (progression adapter already compatible).
- Mobile: browse pages are already mobile-solid (server accordions); hub group stacks to one
  column.

### Phase 3 — Psionics depth (L) — first system (core is LIVE)
- **Power picker** (`power-picker.tsx`, spell-picker model on picker-shell): default view = the
  character's class lists via the junction (order by level), "On my class list" / "Can
  currently manifest" (PP/ML gate) toggles, discipline + level + descriptor filters, PP-cost
  badge, expandable Augment/Mythic detail; caches full detail onto `powersKnown` entries
  (`compendiumId` extension point already in the schema).
- Editor: powers section upgraded (picker + the existing paste-parser + manual entry = the
  custom builder); PP pool card unchanged.
- Read view: powers grouped by level with detail rows (spell-list pattern).
- **Import detector goes LIVE**: psionics question kind ("enable psionics + re-file as
  powers?"), `psionic_power_compendium` into KIND_TABLES/candidates/apply/verify UI (the
  6-touch-point recipe), classifyHeader `psionic|manifest|power points` ABOVE the generic
  `powers?` rule.
- Mobile: picker = full-width list, filters in a collapsible row, 44px rows; augment detail
  expands in place.

### Phase 4 — Path of War (XL) — per the S4 design
- Schema `character.pathOfWar` (`path-of-war.ts`): initiators (class, IL formula override,
  initiation ability, known/readied/stance maxes, recovery method, disciplineKeys) + maneuvers
  (spellRef-style cached detail; `entryKind` maneuver/stance; readied/expended/granted/
  stanceActive lifecycle booleans — explicitly NOT a resource pool).
- Engine `computePathOfWar`: IL = classLevel + ⌊(charLevel − classLevel)/2⌋ (clamped; no-PoW =
  ⌊L/2⌋), IL→max maneuver level table, DC = 10 + `@{maneuverLevel}` + initiation mod (locals
  like `@{spellLevel}`), favored-weapon +2 as an off-by-default term, **active stances →
  modifier buckets** (buff ingestion pattern), `summary.pathOfWar`.
- Editor (`path-of-war-editor.tsx`, Optional group): initiator panel w/ presets seeded from
  `threepp_class_compendium` progression columns (Known/Readied/Stances) once core classes
  land — manual entry meanwhile; **ManeuverPicker** (spell-picker model + discipline
  `<optgroup>` + Strike/Boost/Counter/Stance type filter); readied checkboxes (≤ max),
  expended toggles, one-active-stance radio, recovery quick actions ("Recover one", "New
  encounter"); custom-maneuver form.
- Read: "Martial Disciplines" main-column card (readied list w/ expended state, active stance
  chip, IL/DC); privacy section `pathOfWar`.
- Import: `pow_maneuver_compendium` claims (discipline = tie-break `group`), header contexts
  `maneuvers?|stances?|disciplines?|martial`, module question. Vehti-style manual sheets work.
- Mobile: maneuver cards = chips + tap-to-expand (EntryCard); readied/expended toggles as
  large tap targets; per-discipline collapsible groups (SphereSubsection pattern, collapse >6).

### Phase 5 — Akashic (XL) — per the S4 design
- Schema `character.akashic`: classes (veilweaving ability, essence/veils-shaped tables or
  overrides, unlocked binds), veils (cached detail incl. per-chakra bind effects), shaped
  loadout (slot, essenceInvested, bound), essence pool (**invested, not spent**).
- Engine `computeAkashic`: shared essence pool (Σ classes), invested/available, **capacity cap
  1/2/3/4 by char level bands** with violation warnings, per-veil DC = 10 + essenceInvested +
  veilweaving mod, bind validity vs unlocked slots, one-veil-per-slot collisions, veil
  modifiers formula-valued over `@{essenceInvested}` → buckets.
- Editor (`akashic-editor.tsx`): essence pool card; **VeilPicker** (class-list via junction +
  slot filter; metadata-only rows show "text in {source}" + notes affordance); **chakra-slot
  grid** — desktop: the slot grid with per-slot veil select + essence stepper + bind checkbox;
  **mobile: a vertical slot LIST, each slot an EntryCard opening a bottom-sheet veil picker**
  (the grid does not shrink well); "Shape for the day" reset; custom-veil builder.
- Read: "Veils & Essence" main-column card; privacy section `akashic`.
- Akashic classes (43 base + 23 prestige rows) via the class builder; akashic races via
  `threepp_race_compendium` (+ RacePicker union under the gate).
- Import: veils claims (class-list group tie-break), contexts `veils?|essence|chakra|veilweav`.

### Phase 6 — Optional-rules bundle (M) — oaths, drawbacks/flaws, backgrounds
- **Oaths** (module `oaths`): `character.oaths` block — taken oaths (+Oath Points each) +
  purchased boons (−cost); engine emits the running budget to `summary.oaths`; small editor
  panel (oath picker + boon picker + budget bar); read-view rail tracker; privacy `oaths`.
  *(Vehti's Forbidden Knowledge finally links on import.)*
- **Drawbacks & flaws** (module `flaws_drawbacks`): picker adds to `traits.list` with
  `type: "drawback"/"flaw"` + automation seeds for the clean numeric penalties/grants; the
  existing Traits editor hosts the secondary picker (gated).
- **Backgrounds & occupations** (module `backgrounds_occupations`): Identity-adjacent panel;
  applying an occupation pushes its granted feat + sets the class skill (D5 automation).
- Import: `oath_compendium`/`threepp_drawback_compendium` claims — the Vehti fixture's OATHS
  and DRAWBACKS & FLAWS sections become linkable (regression test upgrade).
- Mobile: each is a single compact card; pickers are EntryPicker-based (already mobile-good).

### Phase 7 — Spheres depth (M)
- `threepp_feat_compendium` spheres feats into the gated feat picker (prereq rows advisory);
  552 spheres archetypes usable via ArchetypePicker (post-backfill); class options browse +
  picker chips; practitioner traits + alt racial traits tables into trait/race pickers.
- Mythic Spheres / Strain reference pages: seed later if per-entry decomposition proves
  worthwhile (deferred by default).

### Phase 8 — Import verification sweep + Vehti/Anise regression (M)
- Consolidated pass over the detectors: all new tables in KIND_TABLES/TABLE_KIND/candidates/
  apply/verify-UI; module questions per system; classifyHeader ordering locked by fixture
  tests; group-guard demotions for discipline/class-list/race-owned tables; re-run both
  fixtures end-to-end (Vehti should now link its oaths, drawbacks, spirit-magic powers…).

### Phase 9 — Polish, docs, real-device verify (S)
- CLAUDE.md + memory updates; README/INSTRUCTIONS annotated with what shipped; mobile
  real-device pass on the new editors (the emulated-viewport gap is a known limitation);
  dashboard/compendium hub screenshots for the owner.

## Sequencing & sizing

0 (S) → 1 (M) → 2 (M) → 3 (L) → 4 (XL) → 5 (XL) → 6 (M) → 7 (M) → 8 (M) → 9 (S).
Phases 3–7 are independently shippable after 2; the order above is the recommendation
(psionics first: cheapest, its system is live; PoW before Akashic per S4; the optional bundle
any time after 1 — it's small and Vehti-relevant). Owner data flags #1/#2 slot into Phase 4
whenever they arrive (loader upgrades in place; nothing blocks).

## Risks (carried from S4 + new)

- **PP cost cap / augmentation** stays advisory-only (the rule players get wrong).
- **Essence invested-not-spent** + capacity caps is Akashic's core correctness risk (tests).
- **IL multiclass rounding/cap** — all four cases tested; `@{maneuverLevel}` not IL in DCs.
- **classifyHeader ordering** (psionic "POWERS" vs the generic feature rule) — fixture-locked.
- **Metadata-only veils** must render honestly ("text in source book"), never as empty rules.
- **Licensing**: all four lines are Dreamscarred/DDS Open Game Content; every row carries
  `source` + `url`; OGL attribution page already exists — extend it with the 3pp product lines.
- **character-editor.tsx size**: new editors in their own files, always.
