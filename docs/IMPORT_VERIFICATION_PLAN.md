# Import Verification & Compendium Linking — design (2026-07-01)

> **STATUS (2026-07-01, same day): P1+P2+P3 SHIPPED + the ROBUSTNESS UPGRADE + a 28-agent
> adversarial review (23 confirmed findings, all fixed).** The claims engine
> (`lib/character/import-claims.ts`), server candidate resolution (`import-candidates.ts`),
> the wizard Verify step (`components/character/import/import-verify.tsx`), and commit
> application (`import-apply.ts`) are live — including the gestalt/mythic/unchained questions,
> cross-table re-filing, and NOTES MINING (real traits dug out of the free-text areas).
>
> **Robustness upgrade (owner request):** sheet ORGANIZATION is now a matching signal —
> `classifyHeader()` turns slot dividers ("##### Rogue Class Features #####"), notes captions
> ("RACE TRAITS:"), and section headers ("MYTHIC", "CASTING TALENTS") into a running CONTEXT
> that re-orders each probe's tables (`probeTables`). Three new claim kinds match against
> `sphere_talents`, `mythic_path_ability_compendium`, and `alternate_racial_trait_compendium`
> (each with a commit-time apply branch: talents → `character.spheres` + module enable, mythic
> abilities → `mythic.pathAbilities` [or a plain feature when the module's off], racial traits →
> `features.list`). When a name matches MULTIPLE rows and nothing breaks the tie (context, the
> slot's own kind, or the linked class owning a same-name class feature), the claim is
> **ambiguous**: medium confidence, NOT auto-linked, every candidate listed for the player's
> selector. Same-name rows are all kept server-side (class_feature "Evasion" ×5 classes — was
> last-write-wins).
>
> **Review-driven fixes (the big ones):** gestalt tracks survive the class-apply ERROR path and
> `"A/B || C"` multiclass tracks parse per-segment (totalLevel=40 regression class killed in
> both spots); skipped class segments are preserved under `metadata.unmapped` (+ the Skip button
> is gone for classes); the core-vs-Unchained toggle actually re-picks the class row (live in the
> panel + consumed server-side); spell-slot claims linked to non-spell tables re-file instead of
> no-op'ing; parsed traits link IN PLACE (no dupes); class levels are clamped server-side and the
> wizard blocks commit while a linked class has no level; notes mining junk-filters bookkeeping
> (ledgers, "Label: N", empty labels, markdown wrappers) before the cap and reports truncation;
> question-only commits still apply answers; the ApplyReport persists to the job row; batched
> `.in()` queries chunk, skip unserializable quoted keys, and surface PostgREST errors.
>
> Verified end-to-end against the owner's real Anise sheet (pre- and post-upgrade): 21
> auto-linked, both classes → the (Unchained) rows, gestalt tracks a/b, totalLevel 20, 25 class
> features granted, 5 traits mined + linked, noise rows (GP ledgers, stat lines, empty labels)
> filtered from the panel. Unit coverage: `tests/unit/import-claims.test.ts` +
> `tests/unit/import-apply.test.ts` (fake-Supabase apply tests).
> Remaining from this doc: P4 archetype matching depth (3pp archetypes stay "as written").
> See "Deferred detectors" at the bottom for Path of War / Akashic / Psionics.

_Owner request (2026-07-01 session): now that the PFcore compendiums exist (M12: 25 tables,
~25.9k rows), a Myth-Weavers (or any) import shouldn't stop at "text preserved" — it should
**hunt for everything the sheet names, propose official compendium matches, ask the clarifying
questions a human would ask, and let the player verify each link before anything goes live**.
This document is the plan; implementation is its own epic (M13 candidate)._

## What exists today (build on, don't replace)

- **The import pipeline** (`packages/pathforge-importers`, M8): detect → parse → normalize →
  validate; adapters never silently discard data. The wizard (`/characters/import` +
  `lib/actions/imports.ts`) is already two-phase: `previewImportAction` (server parse →
  `import_jobs` row `status: "previewed"`, draft stored in `mapping_preview`) →
  `commitImportAction` (import-as-new or snapshot-then-merge). **The verification step slots
  exactly between these two phases** — the job row is the natural home for its state.
- **`lib/character/compendium-hunt.ts`**: pure, format-agnostic matcher that already links
  sphere talents + spells by normalized name against a prebuilt `CompendiumIndex`, silently, at
  preview time. The verification step is this idea, generalized to every entity type and made
  **interactive instead of silent**.
- **The M12 appliers** — these are the "make it real" half. A confirmed link doesn't just tag a
  `compendiumId`; it runs the SAME apply path the editor pickers use:
  - class → `applyCompendiumClass` (BAB/saves/HP + per-level features + automation)
  - archetype → `applyArchetype` (conflict-check, replace features)
  - race → `applyRace` (ability mods, size, speed, traits)
  - feat → the feat picker's add path (`feat_effect` seeds → `seedsToAutomationEffects`)
  - trait / class option / spell / sphere talent → their pickers' add paths
- **Search RPCs** (0026: prefix-capable) for every table — the "correct the match" search boxes
  are free.

## The verification model

After parsing (and BEFORE commit), build a **Verification Report**: a tree of *claims* the
import makes about the sheet, each with a proposed resolution the player can accept, correct,
or downgrade.

```ts
type ImportClaim = {
  id: string;
  kind: "class" | "archetype" | "race" | "feat" | "trait" | "spell" | "talent" | "feature";
  /** The raw text the source sheet had (never lost). */
  sourceText: string;
  /** Ranked candidate compendium rows (slug, name, table, score, why). */
  candidates: Candidate[];
  /** The current resolution. */
  resolution:
    | { mode: "linked"; slug: string }        // apply from the compendium (default when confident)
    | { mode: "generic" }                     // keep as free-text entry, exactly as parsed today
    | { mode: "skipped" };                    // drop (player said it's junk/divider)
  confidence: "high" | "medium" | "low";      // drives default checked-state + grouping
};
```

### Matching (server, pure + testable like compendium-hunt)

1. **Normalize** the source text with the existing `candidateKeys` tricks (strip slot
   bookkeeping, `[tags]`, `(parens)`), plus new class-name heuristics:
   - **Unchained variants — all four**: Barbarian, Monk, Rogue, and Summoner each exist in
     `class_compendium` as BOTH a core row and an `X (Unchained)` row (slug `x-unchained` —
     verified against prod). Define `UNCHAINED_CLASSES = ["Barbarian", "Monk", "Rogue",
     "Summoner"]` and normalize every spelling players actually type —
     `UCRogue | UC Monk | U.Barbarian | Unchained Summoner | X (Unchained) | X (UC)` — to
     candidates for **both** rows. A BARE `Rogue`/`Monk`/`Barbarian`/`Summoner` also produces
     both candidates (core ranked first) because the source sheet usually doesn't say which
     the table uses — that's what the clarifying question resolves.
   - `Skald 7 / Dragon Disciple 3` → split multiclass strings; prestige detection by table.
2. **Score**: exact-normalized = high; prefix/substring via the search RPC = medium (top 5 as
   candidates); nothing = low (candidates from a loose FTS query, may be empty).
3. **Clarifying questions** are just claims of a special kind, generated by detectors:
   - ≥2 base classes at similar levels + total level ≈ max(track) → *"Is this a gestalt game?"*
     (accepting toggles the module + recomputes via `gestaltLevel`).
   - Any "tier/mythic" text in notes/slots → *"Is this a mythic game?"* (enable + seed tier).
   - Any class in `UNCHAINED_CLASSES` detected → *"Which {Rogue} does your table use — core or
     unchained?"* Asked ONCE as a game-level question when possible ("This game uses the
     Pathfinder Unchained classes") with per-class overrides, since tables usually adopt
     unchained wholesale; the answer re-ranks the class claim AND its class-feature claims
     (unchained rogue/monk/barbarian have different feature tables). **Summoner note:** the
     unchained answer also matters to the companion system — the eidolon subsheet built from
     `eidolon_base_form_compendium` differs between the two, so the eidolon companion claim
     (if any) must inherit the summoner variant answer.
   - Spheres/psionics markers (the adapters already flag these) → module questions.

### UI (the owner's ask: hierarchical, beautiful, correctable)

A new **Verify step** in the import wizard between Preview and Commit:

- **Sections by kind** (Classes · Race · Feats · Traits · Spells · Talents · Features), each a
  collapsible group with counts: `Feats — 11 linked · 2 to review · 1 generic`.
- **Per-claim row** = the chip+disclosure pattern (`EntryCard`-style): source text + the proposed
  match chip (green=high, amber=review, muted=generic) + expand →
  - the candidate list (radio) with each candidate's compendium detail (the browse pages'
    `renderSummary`/`renderDetail` are reusable),
  - a **search box** (the entity's search RPC — same UX as the pickers) to find the right row,
  - **"Keep as written"** (generic) and **"Skip"** actions.
- **Bulk controls**: "Accept all high-confidence", per-section accept-all, and a global
  "everything generic" escape hatch (today's behavior, one click).
- **Questions panel** pinned at top (gestalt/mythic/unchained/module questions) since their
  answers can re-run matching (e.g. answering "unchained" re-ranks every class-feature claim).
- Mobile: same one-column list; the disclosure pattern already works at 380px.

### Commit semantics

- `commitImportAction` gains the resolved claims: for each `linked` claim it calls the M12
  applier; `generic` claims flow through the current adapter output untouched; `skipped` are
  dropped from the draft but **preserved in `metadata.unmapped`** (never silently discard).
- Ordering matters: race → classes (level by level, features auto-granted) → archetypes (replace)
  → feats/traits (automation seeds) → spells/talents (link ids). Where an applier GRANTS a
  feature the adapter also parsed as text, the granted row wins and the parsed text lands in the
  feature's description if it differs (no dupes, no loss).
- The `import_jobs` row records the full claim set + resolutions (`mapping_preview.claims`) —
  auditability + "re-run verification" later.

### Phasing (each its own reviewed pass)

1. **P1 — claim engine + classes/race.** Pure `buildImportClaims(draft, index)` +
   tests against the real Myth-Weavers fixtures in `docs/`; wizard Verify step with
   Classes + Race sections; commit applies via `applyCompendiumClass`/`applyRace`.
   *This alone turns a Myth-Weavers import into a computed sheet (BAB/saves/HP from class).*
2. **P2 — feats/traits/spells/talents** (reuse compendium-hunt for the latter two; the silent
   hunt becomes claims with `linked` defaults so behavior only gets MORE visible).
3. **P3 — questions** (gestalt/mythic/unchained/modules) + re-ranking on answers.
4. **P4 — archetypes + class features** (hardest matching: 6k archetype features with
   `replaces`; propose archetypes from feature-name clusters).

### Risks / notes

- Claim building must stay **pure** (index in, claims out) — same testability contract as
  compendium-hunt; the fixtures in `docs/` are the regression corpus.
- Never auto-apply a `medium/low` claim: wrong automation is worse than none. Default only
  `high` to linked.
- The Verify step must be skippable ("import as-is") so the current fast path survives.
- Applier collisions (imported HP vs class-computed HP): show a delta preview per accepted
  class claim (the M12 pickers already display this pattern) — the player chooses recompute vs
  keep-imported (maps to the existing `hpMethod: "manual"` seam).

## Field-misuse reality (from the owner's real sheets — drives the mining design)

The Anise fixture confirms misuse is the NORM: the class line packs gestalt + UC abbreviations +
parenthesized archetype lists; feat slots hold `####` dividers, class features (several per
slot), and level-prefixed bookkeeping (`Rogue 9.`, `9th:`, `Oath 10:`); spell slots hold sphere
talents (`1[Monk]. Pouncing Teleport`); and the free-text areas hold REAL compendium traits
("Fate's Favored", "Magical Knack") buried between prose race traits and the entire mythic
build. Hence: every feat/spell probe matches against MULTIPLE tables (re-filing beats forcing),
and `mineNotesEntries` promotes entry-shaped lines from the preserved notes dump into additive
claims (default SKIPPED unless an exact compendium match is found — junk can't self-promote).

## Deferred detectors — Path of War · Akashic · Psionics (plan only, gated on their systems)

These follow the SAME detector→question→claims pattern, but each is gated on its character
system being implemented (psionics core EXISTS; PoW/Akashic are post-1.0 pending datasets):

- **Psionics (system LIVE, detector deferred):** markers — "power points", "manifester",
  "psion/soulknife/aegis/vitalist", `N PP` costs in spell slots. Question: *"This sheet uses
  psionics — enable the module and re-file these as powers?"* → linked claims against a future
  `psionic_power_compendium` (not yet seeded; the paste-parser `parsePsionicPowers` already
  handles the free-text half and should become the probe generator).
- **Path of War (system NOT built):** markers — "maneuver/stance/initiator", disciplines
  (Primal Fury, Solar Wind, …), "readied/known maneuvers". Until the system + dataset exist,
  the detector should only WARN ("Path of War content detected — it will import as written")
  rather than claim.
- **Akashic (system NOT built):** markers — "veil/veilweaving/essence", akashic classes
  (Vizier, Guru, Daevic). Same warn-only treatment until the system ships.

Wiring point when ready: add marker scans to `collectProbes` (a new question kind per system),
a compendium table per system to `KIND_TABLES`, and an apply branch — the architecture needs no
changes.
