# S4 — Optional Rules & 3pp Systems: Master Plan

> **STATUS (2026-07-12): SHIPPED.** Every system in the table below is live — Hero Points,
> Background Skills, Honor, Stamina & Combat Tricks, Wounds & Vigor, Gestalt, and Mythic shipped
> under S4 itself; Path of War, Akashic Magic, and Psionics shipped as part of the 3pp epic
> (`docs/3PP_MASTER_PLAN.md`); Spheres of Power/Might/Guile shipped as their own epic (see
> CLAUDE.md's "Spheres compendium" + "Spheres + optional-rules UX overhaul" entries). One
> divergence from this plan: the "generic `<domain>_compendium` template" below became, in
> practice, one proven-contract table PER domain (`sphere_talents`, `psionic_power_compendium`,
> `pow_maneuver_compendium`, `akashic_veil_compendium`, plus the 25-table PFcore compendium) —
> same contract/RPC/picker pattern, not one literal parameterized table. This doc remains the
> design record for the shared-infrastructure reasoning; see `docs/S4_SYSTEM_DESIGNS.md` for
> per-system detail and `docs/3PP_MASTER_PLAN.md` / `docs/PFcore Update/PFCORE_MASTER_PLAN.md`
> for how the compendium long-pole actually got solved.

Grounded design plan for layering the optional/third-party rulesets onto PathForge. Produced by an
11-agent research workflow (each agent fetched the canonical source) + a synthesis pass. The detailed
per-system designs are archived in the workflow output; this doc is the build reference.

## What already exists (the seam S4 plugs into)

PathForge already ships the **toggle framework**: `packages/pathforge-schema/src/optional-rules.ts`
(`OPTIONAL_RULE_MODULES`) lists every system below with a toggle stored in `rules.variants` (typed) or
`rules.modules[]`, gated by `isRuleEnabled` / `isModuleKeyEnabled`. The DB has `content_packs` +
`rule_modules` (manifest) + `enabled_modules`. **S4 = building the fields + calculations + UI behind
those toggles.** Reusable primitives: `resourceRefSchema` (pools), the modifier buckets +
`buildModifierIndex`/`classifyTarget`/`effectToMod` (bonuses, formula-aware), the §15 privacy
view-model, and the **proven `spell_compendium` pattern** (3,034-row table + `search_*` RPC + cached
refs on the character) — the model for the talent/veil/power/maneuver compendium.

## The systems (scope at a glance)

| System | Scope | Pool / core | Compendium? |
|---|---|---|---|
| **Hero Points** | S | small pool (max 3, no rest renew) | no (closed enum) |
| **Background Skills** | S | +2 bg ranks/level, separate budget | no (skill split) |
| **Honor** | M | 0–100 score + event ledger | no (static catalog) |
| **Stamina & Combat Tricks** | M | BAB+Con pool, per-feat tricks | no (per-feat library) |
| **Wounds & Vigor** | M | replaces HP (Vigor + Wound pools) | no |
| **Gestalt** | M | best-of-two-class-tracks math | no |
| **Mythic Adventures** | L | mythic power pool + surge die + path | light (mythic abilities) |
| **Path of War** | L | maneuvers/stances/initiator level | **yes** (maneuvers) |
| **Akashic Magic** | L | essence pool + veils + chakra binds | **yes** (veils) |
| **Psionics** | XL | power-point pool + powers known | **yes** (powers) |
| **Spheres (Power/Might/Guile)** | XL | spell points + caster level + talents | **yes** (talents) |

## Shared infrastructure — build FIRST (Phase A)

Five cross-cutting seams that Spheres/Akashic/Psionics/Path-of-War/Mythic all reuse, turning each
XL/L system into mostly data-modeling + seeding:

1. **Generic options-compendium template** — ONE migration shape (mirrors `0006` + `0008/0009/0013`
   hardening) for `public.<domain>_compendium` (id, system, category, name, level/tier, keys[], cost,
   prerequisites, body, automation jsonb, source, `search_tsv`), instantiated as `sphere_talents`,
   `veil_compendium`, `power_compendium`, `maneuver_compendium`, `mythic_compendium`. Each gets a
   `search_<domain>` RPC cloned verbatim from `search_spell_compendium` (wildcard-safe, SECURITY
   INVOKER, public-read RLS, never-dropped guardrails). New migrations land at **`0017`+**.
2. **Generic `optionRefSchema` + `<OptionPicker>`** — one ref type in `common.ts`
   (`{ id, compendiumId?, system, name, level?, keys[], cost?, cached body fields, source,
   grantsModifiers?: ModifierEntry[], grantsResources?: ResourceRef[] }`) that sphere-talent / veil /
   power / maneuver / mythic-ability refs all extend; one `<OptionPicker>` generalizing `spell-picker.tsx`
   (filter by system+keys+level, debounced search RPC, paste-time cache of detail onto the ref). The
   `grantsModifiers[]` → `buildModifierIndex` hook is the **single engine integration point** for ALL
   option-granted bonuses (verified: `effectToMod` already resolves formula values, so no new buckets/
   stacking code).
3. **Generic resource-pool surface** — standardize on `resourceRefSchema` for every pool; one shared
   `<ResourcePoolCard>` (read) + `<ResourcePoolEditor>` (stepper, formula max with Show-Math). The
   `per` field is the reset discriminator: hero-points/essence `per:"custom"` (never renew on rest),
   spell/power points `per:"rest"`, martial focus `per:"encounter"`.
4. **Engine pass registry** — uniform `computeX(character, abilities, resolver)` gated by the toggle,
   no-op + no summary when off (mirrors `computeSpellcasting`). Central resolver-path additions
   (`@{mythic.tier}`, `@{spheres.power.casterLevelTotal}`, `@{stamina.max}`, `@{essenceInvested}`).
5. **Privacy-section checklist** — register each new section key in `PRIVACY_SECTIONS` (`meta.ts`) and
   gate `vm.<system>` in the view-model re-applying viewer gating; public/API exposes at most COUNTS
   (hero-point pips, sphere/veil/maneuver counts), never the tactical lists/logs/loadouts. (The exact
   leak class M7/M9 fixed — a checklist gate, not improvisation.)

## The talent compendium + paste-parser (the mega-stretch)

One generic searchable options compendium + `parseOptionBlock(rawText, domain)` serving Spheres
talents, Akashic veils, Psionic powers, PoW maneuvers, and Mythic abilities. Two-stage parser
(import-adapter "never silently discard" contract): (a) per-domain line/section regex grammar →
structured fields; (b) reconcile against the compendium by normalized name (fuzzy: lowercase, strip
punctuation, trigram/Levenshtein) — on match link `compendiumId` + pull cached automation; on no-match
emit a custom ref with the full raw text preserved (never discarded); unmapped lines → notes. Surface
as an in-editor "paste a block" textarea AND, where useful, an `ImportAdapter`. **Only per-domain code
is (i) the migration enum/keys flavor, (ii) the regex grammar, (iii) the picker filter facets** —
everything else is shared. **Automation discipline:** only clean numeric typed bonuses (a +essence
natural-armor veil, +tier init, a +AC stance) get pre-authored `automation`; prose-heavy options stay
informational cached text (avoid over-promising). **Licensing:** Spheres/Akashic/Psionics/PoW are
Dreamscarred/DDS 3pp — confirm OGL/community-use distributability before seeding each dataset (same
care as the preserved `spell_compendium`); seeding is the long pole, sequenced per system.

## Recommended build sequence

- **Phase A — Shared infrastructure** (above). Build once; unblocks everything.
- **Phase B — Quick wins** (S/M, no compendium): **Hero Points, Background Skills, Honor, Stamina &
  Combat Tricks.** Exercise the resource-pool + privacy + modifier-injection seams on low-risk systems,
  proving the infra before the XL builds.
- **Phase C — Core-math variants** (settle the replace-core-math architecture together): **Fractional
  BAB/Saves, Gestalt, Wounds & Vigor** (+ Background-Skills budget split). These rewrite the
  `recomputeClassDerived` / health paths and must share one precedence rule.
- **Phase D — Mythic** (L, mostly additive): power pool, surge die, Amazing Initiative, paths/abilities.
- **Phase E — Big subsystems** (XL/L, full compendium consumers): **Psionics → Path of War → Spheres
  (Power/Might/Guile) → Akashic** (Psionics & PoW are the cleanest second-mover compendium consumers;
  Spheres is XL/last — Caster Level ≠ class level + three parallel systems).

## Cross-cutting decisions (settle before building)

- **One writer for class-derived math.** BAB/saves/HP/skill-budget are STORED fields written by
  `recomputeClassDerived` (class-catalog.ts), not computed in compute.ts. Background Skills, Fractional,
  and Gestalt all rewrite this. Decide one ordered pipeline; when Gestalt is on it is the SOLE writer;
  declare Gestalt+Fractional composed-in-order or mutually exclusive in v1.
- **Replace-core-math integrates via a sibling, never by mutating shared shapes.** Wounds & Vigor ADDS
  `summary.woundsVigor` and marks `summary.hp` inactive — never mutates `summary.hp`'s shape (every
  dashboard/API/import consumer keeps working).
- **One generic options model** — one `optionRefSchema`, one compendium template, one `<OptionPicker>`,
  one `parseOptionBlock`; instantiate per domain by enum/keys/grammar only.
- **Spendable/conditional bonuses are NEVER always-on modifiers.** Hero-point +8, Combat-Stamina +X,
  mythic surge, PoW boosts, psionic augmentation → helpers / declared preview-buffs / display values.
  Only clean always-on typed bonuses (stance +AC, veil +essence natural armor, +tier init) feed buckets.
- **Stacking edge cases:** mythic tier ability boosts stack RAW (verify untyped stacks or add a `mythic`
  always-stacking bonusType); Honor/Hero luck bonuses must be luck-typed (don't stack with each other).
- **Display-only numbers** (Mythic +½ tier, gestalt power rating) must NOT feed `@{level.total}` or any
  level-derived formula — CR/display only.
- **Class-type gap:** budgets keyed off "PC class levels" (Background Skills, Stamina) have no
  PC-vs-racial-HD tag today — approximate via `identity.classes[].level` (fallback totalLevel), document
  it, add a class-type flag as shared future work.

## Per-system phase outlines

Each system's design (data model, engine math, editor, read surface, phases, risks) lives in the
research output. Standard ship order per system: **schema+engine core (manual entry) → editor+read+
privacy → compendium+picker → paste-parser**. Every pass ships after an adversarial review + the gate.
