# PathForge — where we are & what's next

_Last updated: 2026-06-27 (end of the big "sheet audit + S4 optional-rules" session). Quick
"resume here" doc; the authoritative milestone log is [`../CLAUDE.md`](../CLAUDE.md) Status, and the
S4 plan is [`S4_OPTIONAL_RULES_PLAN.md`](S4_OPTIONAL_RULES_PLAN.md) + [`S4_SYSTEM_DESIGNS.md`](S4_SYSTEM_DESIGNS.md)._

## Current state

- **Live in production** at https://pfsheet.org — auto-deploys from `main` via Vercel. Zero runtime errors.
- **Milestones M0–M11 complete.** Secondary: **S1, S2, S3, S5a** done; **S5b** web side done (Phases 0–2);
  the **full sheet audit** done; **S4 (3pp/optional rules)** in progress (see below).
- **Health:** lint + **283 unit tests** + typecheck + production build all green. Migrations at **0016**
  (S4 systems are optional character-JSON blocks — no new migrations yet; the first comes with the
  options-compendium, below).

## What shipped this session (a very large run)

1. **The full sheet audit** (`docs/SHEET_AUDIT_AND_PLAN.md`) — every P0 + the P1 health cluster wired
   engine→view-model→read-sheet, each shipped after an adversarial review: languages, skills depth,
   combat/iterative attacks, defenses + conditions ENGINE, armor→AC (+ Max-Dex cap) + ACP→skills,
   weapon→attack, metamagic-on-spell, conditional defenses, identity/size, negative levels + nonlethal
   status + quick HP, HP-from-Hit-Dice + FCB, class daily-resource uses tracker, and the
   image-URL + spell-list-UX fixes the owner reported.
2. **Real-browser verification (Pass 8)** — DOM-verified the public `/c/[slug]` at desktop + mobile on a
   seeded throwaway demo; caught + fixed a mobile grid-blowout (`min-w-0`). (Note: `preview_screenshot`
   hangs on this app — use `preview_eval` DOM inspection.)
3. **S4 research/design** — 11-agent grounded study → the two `S4_*` docs.
4. **S4 Phase B — quick wins:** Hero Points · Background Skills · Honor · Stamina (+ a crash fix).
5. **S4 Phase C — core-math variants:** Fractional · Wounds & Vigor · Gestalt (+ 3 gestalt-consistency
   fixes from the review).
6. **S4 Phase D·1 — Mythic core** (tier/path · power pool · surge die · Amazing Initiative).
7. **S4 Phase E·1 — Psionics core** + **E·3 — the paste-parser** (`parsePsionicPowers`, the copy/paste
   mega-stretch; lenient, never-discard; generalizes to maneuvers/talents/veils).

The S4 optional-system **pattern** (reuse it): optional `character.<system>` block →
`isModuleKeyEnabled`-gated engine computation emitting `summary.<system>` → count-only view-model +
dashboard card → an editor panel in the gated **"Optional"** section group. **Every system must be in
`OPTIONAL_RULE_MODULES` or `isModuleKeyEnabled` returns false.** Every derived `max` that feeds
`Array.from({length})` must floor at 0.

## Immediate next steps — finishing S4 (in order)

1. **The seeded options-compendium (Phase E·2)** — migration `0017`: a generic `<domain>_compendium`
   table + `search_<domain>` RPC cloned from `spell_compendium`/`search_spell_compendium`
   (migrations `0006`/`0008`/`0009`), plus a generic `optionRefSchema` + an `<OptionPicker>`
   generalizing `spell-picker.tsx`, so pasted/picked powers reconcile against the compendium. **BLOCKED
   on the long pole: sourcing the OGL datasets** (hundreds of powers/maneuvers/talents/veils — Dreamscarred/
   DDS; confirm distributability + get a data source, or author a starter set). The owner has approved
   applying additive compendium migrations to prod.
2. **Path of War core** → **Spheres (Power/Might/Guile)** → **Akashic** — XL each; reuse the Psionics
   pattern + the parser (each needs its per-domain parser grammar). Spheres is XL/last (Caster Level ≠
   class level; three parallel systems).
3. **Mythic depth** — tier ability-score boosts applied to scores, path abilities + mythic feats list,
   Hard-to-Kill death threshold.
4. Then **S6** (dice roller, encounter tracker, more compendiums), **S7** (final review → 1.0).

## Deferred / needs attention (not blocking)

- **Authed E2E in CI** — `tests/e2e/sheet.spec.ts` skips until the owner adds a test account + CI
  secrets + repo var `RUN_E2E=true`.
- **Custom icon pack** — owner has a large black-on-transparent SVG pack to swap in for the generic
  lucide set at final polish; NOT in `public/icons/` yet (only `icon.svg`). See [[pathforge-icon-pack]].
- **SECURITY DEFINER RPC exposure** (Supabase WARN, low sev) — fix = move 8 RLS-helper fns to a
  non-exposed schema + re-point every policy; its own careful branch-tested migration.
- **S4 play-time depth deferred (noted in-UI):** Wounds & Vigor crit/Con-damage wound rules; Mythic
  ability-boost application; multi-class-track gestalt + skill-points union; per-domain compendium seeding.

## Working cadence (confirmed)

Build a pass → adversarial multi-agent Workflow review → fix confirmed findings →
`pnpm lint && pnpm test && pnpm typecheck` (+ build) → commit/push to `main`. Production DB changes
need explicit owner sign-off; risky RLS changes get branch-tested first.
