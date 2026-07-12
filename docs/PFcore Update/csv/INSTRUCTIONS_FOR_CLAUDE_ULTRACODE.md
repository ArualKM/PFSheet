# INSTRUCTIONS FOR CLAUDE ULTRACODE — Finish Converting the Archives of Nethys (PF1e) HTML Archive into Normalized TSV Compendium Tables for PFSheet / PathForge

> **EXECUTED — 2026-06-29 (Phase 0, PFcore/M12).** The Supabase load described in §8 is done: **25,924 rows / 25 tables** loaded to prod via migrations **`0021`–`0024`** (+ the search-prefix fix in `0026`, 2026-07-01) using a config-driven loader (`csv/loader/pfcore.mjs`), not the per-table `\copy` recipe below — the compendium contract (RLS, tsvector search, search RPC) is the same, just applied generically. Migrations now run through `0029`. **Do not re-run this import.** See `CLAUDE.md` → "PFcore / M12" for the full history. The TSV-extraction TODOs in §0/§7 (rage powers, cavalier orders/banners, hunter animal focus, fighter weapon groups, druid herbalism, the 13 summary-only `class_options` rows, expanding `feats_effects`/`features_effects` beyond the seed) were left unresolved and the data was loaded as-is — still open if anyone picks them up.

> **Read this whole brief before touching anything.** It is the single source of truth for the task. Where this document and your training intuition disagree, **this document wins** — especially on TSV formatting, the Supabase "compendium contract," and which columns already exist. Do not invent columns that contradict the schemas given here, and do not "improve" the rules text by summarizing it.


---

## 0) STATUS — Phase 2 delivered (most of §7 is now DONE)

A Phase-2 pass (`parsers/aon_parse2.py`) has run. **25 tables / ~25,924 rows** now exist in `csv/`. The sections below remain the authoritative spec; here is what is already built vs. left:

**Done since the first draft:**
- `class_options.tsv` (2,370 rows, 54 option types: talents, discoveries, hexes, bloodlines, mysteries, domains, schools, oaths, mercies, blessings, evolutions, arcana, …). Index-style options were backfilled with full rules text by downloading their `*Display.aspx` pages into a new `Class Options/` HTML folder — **99% carry full source+text; 13 summary-only.**
- `archetype_features.tsv` (6,054), `race_traits.tsv` (77), `alternate_racial_traits.tsv` (275), `favored_class_options.tsv` (731).
- `feats.tsv` gained **`combat_trick`**; `feat_prerequisites.tsv` (7,651) normalizes prereqs.
- `class_features.tsv` → 494 (tagged + level-table-named features, with `level`).
- `mythic_paths.tsv` (6), `mythic_path_abilities.tsv` (431, from downloaded `Mythic/Path Abilities/`); `mythic_spells.tsv` school split into `school | subschool | descriptors`.
- `eidolon_base_forms.tsv` (6), `eidolon_evolutions.tsv` (79), `familiars.tsv` (187), `animal_companions.tsv` (214 — **full statblocks**: size/speed/AC/attacks/ability scores/special qualities/advancement, from the per-animal detail pages; cross-listed animals merge categories).
- `feats_effects.tsv` (11) + `features_effects.tsv` (3) — curated automation seed in the `@{…}` DSL.

**Remaining (your job):**
- **Comma-list pages with no local per-entry text:** rage powers, cavalier orders/banners, hunter animal focus, fighter weapon groups, druid herbalism — source the per-entry text.
- **13 `class_options` rows** still summary-only — fetch + backfill.
- **Expand `feats_effects`/`features_effects`** beyond the seed.
- Refinements: "+2 to one ability" race mods, archetype `features_replaced` normalization, mythic_spell school edge cases.

Parser is now two files: `parsers/aon_parse.py` (Phase 1) + `parsers/aon_parse2.py` (Phase 2). Backfill pages saved under `Class Options/<Base>/<Item>.html` and `Mythic/Path Abilities/<Path>.html`.

---

## 1) Mission & Your Role

### 1.1 The mission
There is a **local, complete HTML mirror** of the Archives of Nethys (AoN) for **Pathfinder 1st Edition** sitting on disk (10,715 pages). A regex-based, stdlib-only Python parser (`aon_parse.py`) has already converted a large chunk of it into **tab-delimited (.tsv)** compendium tables. **Your job is to finish the conversion** — extend the parser, build the remaining tables, fix the known caveats, and prepare everything to be loaded into Supabase as **additive** compendium tables for the existing PFSheet / PathForge app.

This is fundamentally a **data-engineering + careful-parsing** task, not a game-design task. The rules text already exists; your job is to extract it **exactly**, normalize it into clean tables, and wire it to the app's established conventions.

### 1.2 What "done" looks like
1. The **caveats** on already-produced tables are resolved (see §5 and §7).
2. The **remaining tables** in §7 are produced as `.tsv` files in `PFcore Update\csv\`, each following the **TSV conventions** in §4.
3. Each table has a **representative Supabase `CREATE TABLE`** that follows the **compendium contract** in §2.3, plus an import recipe (§8).
4. Every row has a **stable slug/id**, an **exact source citation** (book + page) and a **source url**, and is **deduped** across the categories that duplicate it.
5. Nothing in the **existing** schema is altered. All new tables are **additive**.

### 1.3 Operating principles (non-negotiable)
- **Fidelity over cleverness.** Reproduce mechanics text verbatim. Never paraphrase, never "tidy up" rules wording, never drop a clause because it looks redundant.
- **Additive only.** Do not modify `public.spell_compendium` or the six `sphere_*` tables, and do not change migrations `0001–0018`. New work lands as new tables / new migrations.
- **Deterministic & idempotent.** Each table writer must be re-runnable and produce the same output from the same input. Re-running overwrites the `.tsv` cleanly.
- **Local archive is the source of truth.** Prefer parsing the downloaded HTML over re-crawling the web. Only re-crawl to fill genuine gaps (see §3.3).
- **When unsure about a mechanic, keep the raw text intact** in a description column rather than guessing a structured value. It is always safe to over-preserve text; it is never safe to invent a number.

---

## 2) Target Architecture (PFSheet / PathForge)

### 2.1 The app
- **App:** PFSheet (a.k.a. **PathForge**) — https://pfsheet.org
- **Repo:** github.com/ArualKM/PFSheet
- **Stack:** Next.js 16 + React 19 + TypeScript; **Supabase** (Postgres + Auth + Storage) with **strict RLS**; **Zod** validation throughout.

### 2.2 How a character & the rules engine work
- A character is **one versioned JSONB document** (schema id `"pathforge-character-v1"`). The character is data; it is not a pile of denormalized columns.
- **All game math lives in the package `@pathforge/rules-pf1e`** — *never* in the UI. UI components render; the rules package computes.
- **Formula engine — a SAFE, no-`eval` formula DSL.**
  - References use the form `@{path}` — e.g. `@{abilities.str.mod}`, `@{level}`, `@{bab}`.
  - **Only an allow-listed set of functions** is permitted: `floor`, `ceil`, `round`, `min`, `max`, `clamp`, `abs`, `sum`, `if`, `exists`. (No arbitrary code, no other calls.)
  - A **PF1e bonus-stacking engine** applies typed-bonus rules:
    - Typed bonuses of the same type **do not stack** → keep the **highest**.
    - **Dodge** bonuses and **untyped** bonuses **do stack**.
    - **Penalties stack** (always).
    - There are explicit **stacking groups** handling the edge cases.
- **Automation = effects.** Feature/feat/trait automation is encoded as **effects** objects:
  ```
  { target, op, value-or-formula, bonusType }
  ```
  where `op` ∈ {`add`, `subtract`} (and `value-or-formula` may be a literal number or a `@{…}` DSL formula). **This is the hook for auto-fill** — when a player picks a feat/feature, its effects get applied through the formula + bonus-stacking engine. Your machine-readable automation rows (§7) must speak exactly this shape and this DSL.

### 2.3 The "compendium contract" (MANDATORY for every new table)
The existing `spell_compendium` (~3,034 spells) and the six Spheres tables (`sphere_spheres`, `sphere_talents`, `sphere_traditions`, `sphere_drawbacks`, `sphere_boons`, `sphere_rules_tables`) all follow a **shared contract**. **Every AoN table you create must follow the same contract:**

1. **PUBLIC read** — anyone (including anon) may `SELECT`.
2. **service-role write** — only the service role may `INSERT/UPDATE/DELETE` (enforced via RLS).
3. **A `tsvector` full-text search column** (a Postgres **generated** column) covering at least `name + description` (add more text columns to the vector where useful).
4. **A search RPC** (a SQL function) so the app queries full-text search consistently, the same way it does for spells/spheres.
5. **Every row carries a source citation string** (book + page) — and, for AoN, also a source URL.

> Migrations currently run **0001–0018**. New tables are introduced via **new migrations after 0018**. Follow the existing file/numbering conventions in the repo (inspect the `supabase/migrations` directory before writing new ones).

### 2.4 Who consumes this data
New AoN compendium tables are consumed by:
- **(a) Pickers** — the **feat picker**, the **class catalog "tap-to-apply"** flow, and **talent/option pickers** (rogue talents, discoveries, rage powers, bloodlines, schools, domains, mysteries, revelations, hexes, wild talents, evolutions, …).
- **(b) The formula engine** — via the **automation effects** described in §2.2, so picking an option can auto-apply its mechanical bonuses.

Design every table so it can feed **both** a human-browsable picker (clean `name`, `prerequisites`, `description`, `source`) **and**, where applicable, an automation row.

---

## 3) The Local HTML Archive (the raw source of truth)

### 3.1 Where it lives
- **Project root:** `C:\Users\bitte\Desktop\PFcore Update` (the "**PFcore Update**" project folder).
- **Raw HTML:** **10,715** pages mirrored from **aonprd.com** (Archives of Nethys, **PF1e**).

### 3.2 Counts by section (so you know the scope of each parser)
| Section (folder) | Pages | Notes |
|---|---:|---|
| Classes / Main Classes | 1,431 | 44 base classes + per-class subpages + individual archetypes |
| Classes / NPC Classes | 5 | the NPC classes |
| Classes / Prestige Classes | 120 | 119 prestige classes + 1 index page |
| Cohorts and Companions | 62 | companion / eidolon / familiar / drake / phantom + subpages |
| Mythic | 547 | paths + 159 mythic feats + 287 mythic spells + 89 mythic monsters + rules |
| Traits | 1,997 | 14 trait types + Drawbacks; all individual trait pages |
| Races | 79 | Core + Other races |
| Feats | 6,474 | 39 category folders; **each feat duplicated across every category it belongs to** → **~3,337 unique** |

> **Dedup warning:** the Feats count (6,474) is inflated by cross-listing. The unique count is **~3,337** (which matches `feats.tsv`). Any new feat-derived table must dedupe by stable identity (see §7.10 / §10).

### 3.3 How it was downloaded (and how to fill gaps)
- Downloaded by a **resumable, rate-limited crawler** kept at `C:\Users\bitte\AppData\Local\Temp\aon_crawl\`:
  - `crawler.py` — everything
  - `races.py` — races
- **Re-running skips existing files** (resumable). If you discover missing subpages (e.g., a class-option aggregate page that wasn't fetched, or race subpages you need), re-run the appropriate crawler to fetch only the gaps, then parse locally. **Respect the existing rate limiting** — do not hammer aonprd.com.

---

## 4) TSV Conventions (the proven "Spheres standard" — MANDATORY)

These rules are **non-negotiable** and apply to **every** table you produce. They are the reason the existing data is clean; deviating will corrupt downstream imports.

1. **Tab-delimited (`.tsv`). NEVER commas.** PF rules text is full of commas; a CSV would shred on the first "Strength, Dexterity, and …". The output folder is named `/csv` for historical reasons, **but the files are TSV** — state this clearly wherever you document it, and write real tabs (`\t`) as the delimiter.
2. **One physical line per record.** Replace every internal paragraph break / newline inside a cell with the **literal token `<br>`**. After this step, a record must occupy exactly one line of the file.
3. **Reproduce rules text EXACTLY.** Never summarize, never paraphrase mechanics, never normalize wording. Preserve punctuation, capitalization, parentheticals, and dice notation as-is.
4. **Split base mechanics from upgraded/variant text into separate columns.** Examples:
   - a feat's **base** benefit text vs its **Mythic** version (separate columns),
   - a spell's **base** text vs its **mythic augmentation** (separate columns),
   - a class feature's base text vs an archetype's altered version.
5. **Embedded rules tables become JSON.** Any in-page table (e.g., a class level-progression "Table 2-1") is stored as a **JSON array-of-arrays string** in a `json_data` column (header rows included). Do not flatten it into prose.
6. **Every row carries a source citation** (book + page) **and** a **source url**.
7. **Strip cells of any literal tab / CR / LF before writing.** (Convert meaningful newlines to `<br>` per rule 2 first; then ensure no stray `\t`, `\r`, or `\n` survives into the field.)

> **Encoding:** write UTF-8. Preserve em dashes, ×, –, en dashes, and other glyphs that appear in AoN text. Do not transliterate them to ASCII.

> **Header row:** each `.tsv` has a single header row of column names (lower_snake_case), matching the schemas in §5 / §7. The Postgres import (`HEADER true`) depends on it.

---

## 5) Tables Already Produced (per-table schema + caveats)

All of these live in **`PFcore Update\csv\`** and were produced by **`csv\parsers\aon_parse.py`**. **Columns are listed in physical order.** Row counts are in parentheses. **Caveats are TODOs you must address** (cross-referenced in §7).

### 5.1 `feats.tsv` (3,337)
**Columns:** `name | types | source | description | prerequisites | benefit | normal | special | mythic | url`
- `types` = the parenthetical tag(s) from the title, e.g. `Combat`, `Teamwork`, `Achievement` (may be multiple).
- `description` = the **flavor** text (the italic line between the Source line and the first bold label).
- `mythic` = the embedded **"Mythic `<feat>`"** augmentation text, if the page has one.
- **CAVEAT / TODO:** the **Combat Stamina "Combat Trick" variant** section (`<h2 class="title">` "Combat Trick (from Combat Stamina)") is **NOT yet split out**. Capture it (see §7.1).

### 5.2 `traits.tsv` (1,916)
**Columns:** `name | type | category | source | requirements | description | url`
- `type` = the **trait family** derived from the source folder, e.g. `Basic (Combat)`, `Race`, `Religion`, `Region`, …
- `category` = the in-page **Category** label.

### 5.3 `drawbacks.tsv` (66)
**Columns:** `name | source | requirements | description | url`

### 5.4 `mythic_spells.tsv` (287)
**Columns:** `name | school | level | casting_time | components | range | target | area | effect | duration | saving_throw | spell_resistance | description | mythic | source | url`
- `mythic` = the **mythic augmentation** text.
- **CAVEAT / TODO:** the `school` cell may include **subschool / descriptors** plus a trailing `;`. Splitting `school` into `school | subschool | descriptors` is a refinement TODO (see §7.7).

### 5.5 `classes.tsv` (49 = 44 base + 5 NPC)
**Columns:** `name | category | source | hit_die | alignment | role | starting_wealth | class_skills | skill_points_per_level | proficiencies | description | url`
- `category` ∈ {`Main`, `NPC`}.

### 5.6 `class_progression.tsv` (49)
**Columns:** `class | json_data`
- `json_data` = the level table ("Table 2-1") as a **JSON array-of-arrays** string, **header rows included**.

### 5.7 `class_features.tsv` (416)
**Columns:** `class | feature | type | description`
- `type` ∈ {`Ex`, `Su`, `Sp`} (the parenthetical tag).
- **CAVEAT / TODO (priority):** **only features whose title carries an `(Ex)`/`(Su)`/`(Sp)` tag were captured.** Untagged features (e.g. **Sneak Attack**, **Trapfinding**) are **MISSING**. Completing this is a priority TODO, and features should be **linked to the level gained** via the progression "Special" column (see §7.2).

### 5.8 `prestige_classes.tsv` (118)
**Columns:** `name | source | hit_die | alignment | role | requirements | description | url`
- `requirements` = the **entry requirements**.

### 5.9 `prestige_progression.tsv` (118)
**Columns:** `class | json_data`

### 5.10 `races.tsv` (77)
**Columns:** `name | category | source | details | url`
- `category` ∈ {`Core`, `Other`}.
- `details` = the **FULL racial text** as one `<br>`-joined blob.
- **CAVEAT / TODO (priority):** not yet broken into structured fields. Decompose into structured race tables (see §7.5).

### 5.11 `archetypes.tsv` (1,318)
**Columns:** `name | class | source | description | url`
- `description` = the full **altered-features** text blob.
- **CAVEAT / TODO:** replaced/added features are **not yet separated**. Split them into `archetype_features.tsv` (see §7.4).

---

## 6) AoN HTML Parsing Reference (how to extend the parser)

The parser is **regex-based, stdlib-only**. AoN display pages are structurally consistent; learn these patterns and reuse them.

### 6.1 Page anchors & the name
- A display page's content starts at:
  ```html
  <h1 class="title">NAME (tags)</h1>
  ```
- A **PFS-legal `<img>`** precedes the name text inside the `<h1>` — **strip tags** to get the clean name; the trailing `(tags)` are type tags (see Feats below).

### 6.2 Source citation
- Pattern:
  ```html
  <b>Source</b> <a ...><i>Book pg. N</i></a>
  ```
- **Variants add more `<b>Source</b>` blocks; the FIRST one is the base.** Use the first for the row's primary `source`; the `<a href>` gives the **source url**.

### 6.3 The general field pattern
- Most fields look like:
  ```html
  <b>Label</b> value
  ```
  where **`value` runs until the next `<b>` / `<h2>` / `<h3>`**.
- **Exception — single-line labels:** for `Category`, `Requirement(s)`, and **spell stat lines**, stop at the **next `<br>`** instead of the next bold/heading. (This prevents the value from swallowing the description that follows.)

### 6.4 Feats
- Trailing **`(Combat)` / `(Teamwork)` / `(Achievement)`** etc. in the `<h1>` are the **type tags**.
- Bold labels: **`Prerequisite(s)`**, **`Benefit`**, **`Normal`**, **`Special`**.
- **Flavor text** sits between the **Source** line and the **first bold label**.
- **Variant sections begin at `<h2 class="title">`** — notably **"Combat Trick (from Combat Stamina)"** and **"Mythic `<Feat>`"**.

### 6.5 Spells
- `<b>School</b> …` ; `<b>Level</b> …`
- then `<h3 class="framing">Casting</h3>` → **Casting Time**, **Components**
- then `<h3 class="framing">Effect</h3>` → **Range**, **Target/Area/Effect**, **Duration**, **Saving Throw**, **Spell Resistance**
- then `<h3 class="framing">Description</h3>` → body
- **Mythic augmentation** is in a trailing **Mythic** section.

### 6.6 Classes & Races
- Per-page **sub-navigation to subpages** is inside:
  ```html
  <span id="MainContent_MainClassLabel"> … </span>
  ```
  (Use this to discover which option subpages a class has.)
- Class **core** uses bold labels **Role / Alignment / Hit Die / Starting Wealth**, the sentence **"class skills are …"**, **"Skill Points at each Level"**, **"Weapon and Armor Proficiency"**; the **first `<table>`** is the level progression.

### 6.7 Class OPTION aggregate pages (the long-pole TODO)
- Saved at: `Classes\Main Classes\<Class>\<Sub>.html`
- Examples of `<Sub>`: **Rogue Talents, Discoveries, Rage Powers, Bloodlines, Arcane Schools, Domains, Mysteries, Revelations, Hexes, Wild Talents, Evolutions** (and more).
- **Each page lists MANY entries inline** — typically a **bold/heading name + Source + description** per entry. You must iterate the entries within the page (not one entry per page). See §7.3.

---

## 7) Remaining Tables to Build (detailed specs)

This is **the bulk of your job.** For each table: produce a `.tsv` in `PFcore Update\csv\` with the columns below (lower_snake_case header), following §4 conventions, with a slug/id, source citation, and url on every row.

> **General column rule for all new tables:** every row also gets a **`slug`** (stable id; see §10.3). Where a row belongs to a parent (class/race/archetype), include the parent name column exactly as specified so it can be joined.

### 7.1 `feats.tsv` — finish (Combat Trick variant)
- Add a column to capture the **"Combat Trick (from Combat Stamina)"** variant text (parsed from the `<h2 class="title">` section).
- Suggested column: **`combat_trick`** (append after `mythic`, before `source` — but keep existing columns in their current order; **only append** so existing importers don't break).
- Resulting order: `name | types | source | description | prerequisites | benefit | normal | special | mythic | combat_trick | url`.

### 7.2 `class_features.tsv` — complete (priority)
Replace the partial extraction with a complete one.
- **Capture untagged features too** (e.g. **Sneak Attack**, **Trapfinding**) — not just `(Ex)/(Su)/(Sp)`-tagged ones.
- **Add a `level` column** linking each feature to the level it's gained, derived from the progression **"Special"** column in `class_progression.tsv` (match feature name → the level cell that names it).
- **Flag features added/removed by archetypes** — add a boolean/marker column tying into archetype data (or leave the join to `archetype_features.tsv`; see §7.4).
- **Proposed columns:** `class | feature | type | level | description | added_by_archetype | replaced_by_archetype | source | url`
  - `type` stays `Ex/Su/Sp` **or empty** for untagged features.
  - `level` may be a single int, a comma-list, or empty if not tied to a level.
  - `added_by_archetype` / `replaced_by_archetype` may name the archetype(s) or be empty (cross-reference §7.4).

### 7.3 `class_options.tsv` — NEW (parse the option aggregate subpages)
Parse the per-class aggregate subpages in `Classes\Main Classes\<Class>\<Sub>.html` (see §6.7). **Iterate every entry inline on each page.**
- **Columns:** `class | option_type | name | prerequisites_or_level | source | description | url`
- **`option_type` controlled vocabulary** (use these exact labels; extend as needed but keep them stable):
  `Rogue Talent`, `Advanced Talent`, `Discovery`, `Grand Discovery`, `Rage Power`, `Bloodline`, `Bloodline Power`, `Sorcerer Bloodline Spell`, `Arcane School`, `Domain`, `Subdomain`, `Mystery`, `Revelation`, `Hex`, `Major Hex`, `Grand Hex`, `Wild Talent`, `Order`, `Mercy`, `Inquisition`, `Blessing`, `Phantom Focus`, `Eidolon Evolution`, … (and any other option families discovered in the subpages).
- `prerequisites_or_level` holds whatever gating the entry states (a required level, a prerequisite talent, "advanced talent" status, etc.). If none, leave empty.
- **Slug** must be unique per (`class`, `option_type`, `name`) so e.g. two different "Greater" powers under different bloodlines don't collide (see §10.3).

### 7.4 `archetype_features.tsv` — NEW (split the archetype blob)
Decompose the `description` blob in `archetypes.tsv` into per-feature rows.
- **Columns:** `archetype | class | feature_added | features_replaced | level | text | source | url`
  - `feature_added` = the name of the new/altered class feature this entry introduces.
  - `features_replaced` = the standard feature(s) this entry **replaces/alters** (AoN states this explicitly, usually "This ability replaces …" / "alters …"); may be a list joined by `; `.
  - `level` = level gained/altered, if stated.
  - `text` = the **exact** altered-feature text (verbatim; `<br>` for breaks).
- Keep `archetypes.tsv` as-is (the full blob remains useful); this table is the structured derivative.

### 7.5 Race decomposition (priority) — NEW set of tables
Decompose `races.tsv` `details` (or fetch race subpages if a field is only present there) into structured tables.

**7.5.1 `race_traits.tsv`** — the *standard* racial profile + named standard racial traits.
- **Columns:** `race | ability_score_modifiers | size | type | subtypes | base_speed | senses | languages | bonus_languages | trait_name | trait_text | source | url`
  - Capture the top-line stats once per race **and** one row per **named standard racial trait** (`trait_name` + verbatim `trait_text`). If you prefer one "profile" row plus N trait rows, that's fine — but keep columns consistent.
  - `ability_score_modifiers` — verbatim, e.g. `+2 Dexterity, +2 Wisdom, –2 Strength` (preserve the en dash/minus AoN uses).
  - `senses` — e.g. `low-light vision`, `darkvision 60 feet`.
  - `languages` / `bonus_languages` — split the "begins play speaking …" vs "may choose from …" clauses.

**7.5.2 `alternate_racial_traits.tsv`** — the swappable alternates.
- **Columns:** `race | trait_name | replaces | trait_text | source | url`
  - `replaces` = the standard trait(s) this alternate swaps out (AoN states it).

**7.5.3 `favored_class_options.tsv`** — per-race, per-class favored-class bonuses.
- **Columns:** `race | class | benefit_text | source | url`
  - One row per (race, class) favored-class option.

> If any of these fields are not reliably present in `races.tsv`'s blob, **fetch the race subpages** via `races.py` (resumable) and parse those.

### 7.6 Cohorts & Companions — NEW set of tables
From `Cohorts and Companions\<X>\` subpages.
- **`companions.tsv`** — general companion/cohort entries: `name | companion_type | source | description | url` (`companion_type` e.g. animal companion, cohort, drake, phantom, familiar, eidolon — as the section dictates).
- **`animal_companions.tsv`** — statblock-style companions: `name | starting_stats | size | speed | ac_natural | attacks | abilities | special_qualities | json_data | source | url` (use `json_data` for any embedded stat table / level advancement table per §4 rule 5).
- **`familiars.tsv`** — `name | granted_benefit | source | url` (the bonus a given familiar grants its master).
- **`eidolon_base_forms.tsv`** — base form (biped/quadruped/serpentine/etc.): `name | base_stats | starting_evolutions | free_evolutions | json_data | source | url`.
- **`eidolon_evolutions.tsv`** — `name | evolution_point_cost | prerequisites | description | source | url`.
  - **Note:** if eidolon evolutions are *also* reachable from a Summoner class-option subpage, capture them once and **dedupe**; prefer the Cohorts-and-Companions source if the text is richer, and record both URLs only if needed. Keep `option_type = Eidolon Evolution` consistent if you also surface them in `class_options.tsv`.

### 7.7 Mythic — NEW tables
- **`mythic_paths.tsv`** — `name | source | description | json_data | url` (the path overview; `json_data` for any path progression table).
- **`mythic_path_abilities.tsv`** — `path | name | tier_or_level | prerequisites | type | description | source | url` (path abilities / path features).
- **Note:** **mythic feats are already represented** via `feats.tsv` `mythic` — **do not** create a separate mythic-feats table; reuse that column.
- **Refinement (from §5.4):** split `mythic_spells.tsv` `school` into `school | subschool | descriptors` (strip the trailing `;`). Keep the original `school` cell content recoverable (if you split destructively, do it in a new column set and keep base `school` faithful).

### 7.8 `feat_prerequisites.tsv` — NEW (normalized prereqs)
Parse `feats.tsv` `prerequisites` into normalized rows.
- **Columns:** `feat | req_type | req_value`
  - `req_type` ∈ {`feat`, `ability`, `bab`, `skill`, `class_feature`, `level`, `other`}.
  - Examples:
    - `Power Attack` → `feat | feat | Power Attack`
    - `Str 13` → `Power Attack | ability | Str 13` (keep the ability + threshold together in `req_value`, or split to `ability` + `13` if you add a `req_threshold` column — your call, but be consistent).
    - `base attack bonus +1` → `… | bab | +1`
    - `Climb 3 ranks` → `… | skill | Climb 3 ranks`
    - `character level 7th` → `… | level | 7`
    - anything unparseable → `… | other | <verbatim>` (**never drop it**).
- **One row per atomic prerequisite.** "A, B, C" becomes three rows. Preserve "or" alternatives (either encode an `other` row with the verbatim "X or Y", or add a `group`/`alt` marker column — but do not silently collapse alternatives into a single AND).

### 7.9 Automation / effects (optional, **high value**) — NEW tables
Encode **machine-readable** automation for the **common, deterministic** feats/features so the sheet auto-applies them through the formula engine (§2.2).
- **`feats_effects.tsv`** — `feat | target | op | value_or_formula | bonus_type | notes`
- **`features_effects.tsv`** — `class | feature | target | op | value_or_formula | bonus_type | notes`
- **Contract:** `op` ∈ {`add`, `subtract`}; `value_or_formula` is a literal number **or** a `@{…}` DSL formula using only the allow-listed functions; `bonus_type` is the PF1e bonus type (e.g. `dodge`, `untyped`, `enhancement`, `morale`, …) so the stacking engine treats it correctly; `target` is a character path the engine understands (e.g. `@{ac}`, `@{hp.max}`, `@{saves.fort}`, `@{attack.melee}`).
- **Seed set (do these first):**
  - **Toughness** → `+3 hp` at ≤3 HD, then **+1 hp per HD beyond 3** → `target: hp.max`, `op: add`, `value_or_formula: @{max(3, level)}` (verify exact phrasing against `feats.tsv`; encode the official "max(3, HD)" behavior), `bonus_type: untyped`.
  - **Dodge** → `+1 dodge bonus to AC` → `target: ac`, `op: add`, `value_or_formula: 1`, `bonus_type: dodge`.
  - **Weapon Focus** → `+1 to attack rolls with the chosen weapon` → `target: attack` (note it's weapon-specific in `notes`), `op: add`, `value_or_formula: 1`, `bonus_type: untyped`.
  - **Power Attack** → conditional; encode the trade (penalty to attack, bonus to damage scaling with BAB) and put the conditional nature in `notes` (it's a toggle; the engine may model it as an optional effect).
- **Scope discipline:** **only** encode feats/features whose effect is **unambiguous and deterministic.** Anything situational, choice-dependent beyond a simple pick, or narrative goes in `notes` (or is skipped) rather than being forced into a wrong formula. **Leaving a feat out of the effects table is acceptable; encoding it wrong is not.**

### 7.10 Cross-cutting requirements for every new table
- **Stable slug/id** on every row (§10.3).
- **Normalize/repeat source citations** — every derived row carries the **same** book+page+url as its parent page (don't lose provenance when you split a blob).
- **Dedup across categories** — especially feats (cross-listed 6,474 → ~3,337). Dedup by stable identity, not by row position.

---

## 8) Suggested Supabase DDL + Import Workflow

### 8.1 Representative `CREATE TABLE` (the compendium contract in SQL)
Use this as the **template** for each new table. Shown for feats; replicate the **shape** (id, data columns as `text`, `source`, generated `search` tsvector, RLS public-read/service-write, GIN index) for every table.

```sql
-- Migration: 00XX_feat_compendium.sql   (number AFTER 0018; follow repo conventions)

create table if not exists public.feat_compendium (
  id            text primary key,          -- stable slug (see §10.3); or uuid default gen_random_uuid()
  name          text not null,
  types         text,                       -- e.g. 'Combat, Teamwork'
  description   text,                       -- flavor
  prerequisites text,
  benefit       text,
  normal        text,
  special       text,
  mythic        text,
  combat_trick  text,
  source        text not null,              -- 'Book pg. N'  (compendium contract)
  url           text,
  -- full-text search column (compendium contract):
  search tsvector generated always as (
    to_tsvector('english',
      coalesce(name,'')        || ' ' ||
      coalesce(description,'')  || ' ' ||
      coalesce(benefit,'')     || ' ' ||
      coalesce(prerequisites,'')
    )
  ) stored
);

-- GIN index on the search vector (compendium contract):
create index if not exists feat_compendium_search_idx
  on public.feat_compendium using gin (search);

-- RLS: PUBLIC read, service-role write (compendium contract):
alter table public.feat_compendium enable row level security;

create policy "feat_compendium public read"
  on public.feat_compendium for select
  using (true);

create policy "feat_compendium service write"
  on public.feat_compendium for all
  to service_role
  using (true)
  with check (true);

-- Search RPC (compendium contract): consistent FTS entrypoint for the app.
create or replace function public.search_feats(q text)
returns setof public.feat_compendium
language sql stable
as $$
  select *
  from public.feat_compendium
  where search @@ plainto_tsquery('english', q)
  order by ts_rank(search, plainto_tsquery('english', q)) desc
$$;
```

> **Per-table notes:**
> - For tables with a `json_data` column (class/prestige progression, animal companions, eidolon base forms, mythic paths), type that column as **`jsonb`** and load the JSON array-of-arrays string into it (Postgres will parse a valid JSON string on `\copy` if the column is `jsonb` — verify; otherwise load as `text` and cast).
> - For child tables (`class_options`, `archetype_features`, `class_features`, race tables, companion tables, mythic path abilities, `feat_prerequisites`, the effects tables) include the **parent name column(s)** and the **`slug`** id; keep the **`source`/`url`** on every row. Build the `search` vector over the most useful text columns (e.g., `name + description`, or `feature + text`).
> - **`feat_prerequisites`** and the **effects** tables are **relational/normalized** rather than browsable prose — they still get RLS public-read/service-write, but the tsvector/search-RPC is optional there (include it only if a column is worth searching).

### 8.2 Import options
**(a) Google Sheets round-trip** — paste the TSV into a Google Sheet, then **export** (and import into Supabase via the dashboard or a generated SQL insert). Good for spot-checking/edits.

**(b) `psql \copy` (preferred for bulk, repeatable):**
```bash
\copy public.feat_compendium (name,types,description,prerequisites,benefit,normal,special,mythic,combat_trick,source,url) \
  FROM 'feats.tsv' WITH (FORMAT csv, DELIMITER E'\t', HEADER true)
```
- **`FORMAT csv` with `DELIMITER E'\t'`** is the correct way to load a tab file via `\copy` (it handles quoting/embedded delimiters far better than `FORMAT text`).
- List the column names explicitly (as above) so a generated `id`/`search` column is skipped, **or** include `id` in both the file and the column list if you're loading precomputed slugs.
- Because every cell already had literal tabs/CRs/LFs stripped and newlines converted to `<br>` (§4), each record is exactly one line and will load cleanly.

### 8.3 Spells: important mapping note
- **Base spells are already covered by `public.spell_compendium`** (~3,034). **Do NOT** create a competing base-spell table.
- **`mythic_spells.tsv` maps to a *mythic augmentation* table keyed by spell name** (e.g. `mythic_spell_compendium` with `spell_name` + the mythic columns), to be **joined to `spell_compendium`** on name — not loaded as standalone spells. Keep the base spell stat columns in the mythic table only insofar as they help disambiguate; the authoritative base spell row stays in `spell_compendium`.

---

## 9) Running & Extending `aon_parse.py`

### 9.1 The parser
- Location: **`csv\parsers\aon_parse.py`** — **regex-based, stdlib only** (no third-party deps). Keep it that way unless there's a compelling reason; if you add a dependency, document it.
- **Run:**
  ```bash
  python aon_parse.py [ROOT]
  ```
  - `ROOT` defaults to the Windows project path (`C:\Users\bitte\Desktop\PFcore Update`). **Pass the path explicitly** when running elsewhere (e.g., under WSL/Linux/macOS the path will differ — point it at the mounted/copied archive).
- **Sample mode:** set env `LIMIT=N` → parse **N files per table** and **print sample rows instead of writing**. Use this constantly while developing a new extractor (fast feedback, no file churn).
- **Each table writer is independent and idempotent** — it rewrites its `.tsv` from scratch. Add new writers the same way; don't entangle them.

### 9.2 Performance note (read this before a full run)
- The parser reads **~10.7k small files**. On **Windows native this is very slow** — a full run can **stall**.
- **Mitigations (do at least one):**
  1. **Run under WSL / Linux / macOS** against a copy of the archive (dramatically faster small-file I/O). This is the recommended path.
  2. **Run in dataset batches** — invoke per-section so each writer processes only its folder, rather than walking everything at once.
  3. Use **`LIMIT=N`** sample mode while iterating; only do full writes when an extractor is finalized.
- You also have an isolated Linux workspace available; copying the archive there for parsing is a legitimate way to dodge the Windows small-file penalty.

### 9.3 How to add a new extractor (pattern)
1. Write a **pure function** `parse_<thing>(html, path) -> list[dict]` using the regex anchors in §6 (one display page may yield **many** rows — e.g., option aggregate pages).
2. Run it under **`LIMIT`** sample mode and eyeball the printed rows for: correct field boundaries (the `<b>Label</b> … until next <b>/<h2>/<h3>` rule, with the **single-line `<br>` exception** for Category/Requirements/spell stat lines), clean name (img/tags stripped), exact source/url, and `<br>`-collapsed text.
3. Add a **writer** that emits the `.tsv` with the header row, applying the **cell sanitizer** (strip `\t\r\n`, convert newlines→`<br>`) to **every** field, plus the **slug** and provenance columns.
4. Confirm **idempotency** (run twice → identical file) and **dedup** (no duplicate slugs).
5. Keep each writer independent so it can run in a section batch.

### 9.4 Shared helpers to centralize (if not already present)
- `clean_name(h1_html)` — strip the leading `<img>` and tags, return text + parsed `(tags)`.
- `first_source(html)` — return `(citation, url)` from the **first** `<b>Source</b>` block.
- `field(html, label, single_line=False)` — implement the §6.3 boundary rule, with the `single_line` variant stopping at the next `<br>`.
- `collapse_breaks(text)` — turn `<br>`, `<p>`, and newlines into the literal `<br>` token; strip residual tags; strip `\t\r\n`.
- `slugify(*parts)` — stable, collision-resistant slug (see §10.3).
- `table_to_json(table_html)` — parse an HTML `<table>` into a JSON array-of-arrays string (header rows included).

---

## 10) Quality Bar & Gotchas

### 10.1 Fidelity checklist (apply to every row)
- [ ] Mechanics text is **verbatim** — no summary, no paraphrase, no reordering.
- [ ] All internal newlines/paragraphs are the literal token **`<br>`**; the record is **one physical line**.
- [ ] **No literal tab / CR / LF** survives in any cell.
- [ ] **Base vs variant** text is in **separate columns** (feat base vs mythic vs combat_trick; spell base vs mythic; feature base vs archetype-altered).
- [ ] Embedded **tables → `json_data`** (array-of-arrays, headers included), not flattened prose.
- [ ] **Source citation (book + page)** and **source url** present.
- [ ] **Stable slug/id** present and unique within the table.
- [ ] Names have the **`<img>` and tag noise stripped**.

### 10.2 Parsing gotchas (learned from the existing run)
- **Field over-capture:** the default `<b>Label</b> … until next <b>/<h2>/<h3>` rule will **swallow the description** for **single-line** fields. Use the **`<br>` stop** for `Category`, `Requirement(s)`, and **spell stat lines** (§6.3). This is the #1 source of dirty cells.
- **Multiple `<b>Source</b>` blocks** on variant pages — always take the **first** for the base row (§6.2). When you split a variant into its own column/row, you may attach the **variant's** source if it differs, but the row's primary `source` is the base.
- **`<h2 class="title">` variant sections** (Combat Trick, Mythic) must be **peeled off before** parsing the base body, or they'll bleed into `benefit`/`description`.
- **Aggregate option pages yield many rows** — don't assume one-page-one-row. Iterate inline entries (bold/heading name + Source + description) (§6.7, §7.3).
- **Untagged class features are invisible** to an `(Ex)/(Su)/(Sp)`-only matcher (that's why Sneak Attack/Trapfinding are missing). Match feature **headings** generally, not just tagged ones (§7.2).
- **School cell pollution** in spells: subschool/descriptors + trailing `;` ride along in `school` — split deliberately (§7.7).
- **Glyphs:** AoN uses en dashes / minus signs (`–`/`−`) in ability modifiers and `×` in some text. Preserve them; don't ASCII-fold.
- **Cross-listed feats:** the same feat appears in many category folders → **dedupe** to ~3,337 (§3.2, §7.10).

### 10.3 Slug / id strategy
- Make slugs **stable** (re-running the parser yields the same id) and **collision-resistant**:
  - **Top-level entities** (feat, spell, class, race, archetype, prestige class): `slug = slugify(name)` — and if two distinct entities share a name across categories, disambiguate with a type/source qualifier.
  - **Child entities** (class option, archetype feature, race trait, path ability, evolution): `slug = slugify(parent, option_type_or_kind, name)` so e.g. a "Greater" power under two different bloodlines does **not** collide.
  - `slugify`: lowercase; trim; replace runs of non-alphanumerics with a single hyphen; strip leading/trailing hyphens. Keep it deterministic.
- This `slug` is both the TSV `slug` column and a natural candidate for the table's primary key `id` (§8.1).

### 10.4 Validation pass (run before declaring a table done)
1. **Line integrity:** number of lines in the file == number of records + 1 (header). (If not, a stray newline leaked — fix the sanitizer.)
2. **Column integrity:** every line has the **same tab count** == (columns − 1). (A mismatch means a literal tab leaked into a cell.)
3. **No empty `source`/`url`** where the page had them; spot-check 10 random rows against the source HTML for **verbatim** fidelity.
4. **Slug uniqueness:** no duplicate slugs within a table.
5. **Round-trip import:** a `\copy` into a scratch table succeeds with **0 rejected rows** (§8.2). If `\copy` complains, it's almost always a leaked tab or an unbalanced quote — re-sanitize.
6. **Spot-check the JSON columns** parse as valid JSON (and as `jsonb` if typed so).

### 10.5 Final deliverables
- Updated **`csv\parsers\aon_parse.py`** with new/extended extractors and writers (stdlib-only, idempotent, section-batchable).
- New/updated **`.tsv`** files in **`PFcore Update\csv\`** per §5 (fixes) and §7 (new tables), each passing §10.4.
- **Supabase migration(s)** after **0018**, one representative `CREATE TABLE` per table following the **compendium contract** (§2.3, §8.1), with RLS, generated `search` tsvector, GIN index, and a search RPC where the table is browsable.
- A short **import runbook** (the `\copy` commands per table, §8.2) and notes on the **spell mythic-augmentation mapping** (§8.3).
- **Do not** alter `spell_compendium`, the `sphere_*` tables, or migrations `0001–0018`.

> **Remember the prime directive:** extract **exactly**, normalize **cleanly**, follow the **TSV conventions** and the **compendium contract** to the letter, and wire automation only where the mechanics are **unambiguous**. Over-preserve text; never invent numbers.
