# PathForge

The modern Pathfinder 1e virtual character sheet and campaign-integrated character
command center for [PFSheet.org](https://pfsheet.org).

PathForge is **not a PDF clone**. It is a dashboard-first, formula-aware, mobile-friendly,
GM-verifiable, import/export-capable Pathfinder 1e character platform.

> A player can build, customize, share, and play a Pathfinder 1e character from any device,
> while a GM can verify the sheet, inspect math, approve content, and reference character data
> **without ever being able to modify the player's canonical sheet unless explicitly granted
> edit access.**

---

## Status

**Live in production** at [pfsheet.org](https://pfsheet.org) (auto-deploys from `main` via Vercel).
Milestones **M0–M12** are complete (M12 = the **compendium-driven builder**), **S4 (optional rules &
3pp)** is complete (Psionics, Path of War, Akashic, Oaths + Spheres of Power/Might/Guile all live), and
the **v1 launch checklist is done** — the web app + PWA is the mobile story (native apps shelved).
Current work is post-1.0: a July 2026 pass shipped a **guided character-creation wizard**, a **guided
level-up wizard**, an **items/equipment-slots overhaul** (paper-doll read view), owner-only **character
deletion**, **companion character sheets**, a second **"Classic" all-in-one editor layout** alongside the
chip-based "Modern" one, and an app-wide **motion/animation system**.

What's shipped:

- **Character sheet** — dashboard-first read view, full edit workspace (Identity, Abilities, Health,
  Saves, AC, Combat, Skills, Feats, Buffs, Spells, Inventory, Profile) with live recompute, debounced
  autosave, undo, and a "Show Math" formula inspector.
- **Point-buy calculator**, **prebuilt PF1e class catalog** (tap-to-apply class skills / BAB / saves /
  HD / caster entry), and **deep spellcasting** (slots-per-day, bonus spells, save DCs, concentration,
  prepared/cast/rest workflow, compendium-backed spell detail).
- **Compendium-driven builder (M12)** — a browsable PF1e reference hub at `/compendium` (**classes**,
  feats, traits, races, archetypes, class options, prestige, spells, spheres — every page a
  search-and-expand accordion) plus tap-to-apply pickers that auto-fill the mechanics: a class-progression
  builder (BAB/saves/HP + per-level features), archetypes (with conflict detection), prestige, races
  (ability mods/size/speed), and feats with a prerequisite engine + seeded automation effects. Companions
  (familiars/mounts/eidolons) are linked, separately-editable character rows.
- **Buff Center** — toggleable effects with live affected-value deltas, stacking-conflict detection,
  duration tracking, and a PF1e buff library.
- **Privacy & sharing** — a per-section privacy view-model; public share pages at `/c/{slug}` with
  OpenGraph/Twitter cards; visibility controls.
- **GM audit + campaigns** — read-only GM audit view, approval workflow, snapshots + privacy-aware
  diffs, change requests, roster management/archiving — GM can never edit a player's canonical sheet.
- **Imports** — PathForge JSON, FoundryVTT PF1e, Myth-Weavers JSON, and fillable PDF, via a wizard
  (import-as-new or merge-with-snapshot). Imports never silently discard data.
- **Exports + REST API** — PathForge/Foundry JSON exports; a versioned read-only `/api/v1` (public by
  share slug, key- or session-authed for owners, Discord card), API-key management, rate limiting, and
  developer docs at `/developers` (+ OpenAPI 3.1).
- **PWA** — installable, offline fallback, privacy-safe service worker.
- **Mobile** — responsive overhaul (account-menu nav, hamburger section switcher, sticky live-stats
  header, 44px touch targets, tap-to-open chip editors).
- **Full PF1e sheet depth** — the rules engine now drives equipped armor→AC (+ Max-Dex cap) and
  armor-check-penalty→skills, equipped weapons→attacks, conditions (fear/fatigue tracks, dishonor,
  negative levels), metamagic→effective spell level, HP from Hit Dice + Con + favored-class bonus,
  nonlethal→staggered/unconscious status, and class daily-resource uses — each surfaced on the read
  sheet and privacy-gated.
- **Optional rules & 3pp (S4, complete)** — Hero Points, Background Skills, Honor, Stamina &
  Combat Tricks, Fractional BAB/Saves, Wounds & Vigor, Gestalt, Automatic Bonus Progression, Mythic
  (tier/path/pool/surge + path abilities + mythic feats), **Psionics**, **Path of War** (initiators,
  maneuvers/stances with active-stance automation), **Akashic** (essence + veils), and **Oaths** —
  each a full character system behind a per-character toggle — plus a **copy/paste statblock parser**
  that turns pasted powers/maneuvers into structured entries.
- **Spheres of Power / Might / Guile** — the deepest 3pp system: a 4,756-row compendium browser at
  `/spheres`, and a per-subsystem character editor + read view (each system gets its own caster level /
  spell points / talents, its own tradition, and its own drawbacks/boons — with a "drawback applies here"
  flag you can pin to a specific sphere/talent). A system-scoped compendium picker adds talents/spheres/
  traditions/drawbacks/boons; imports hunt for matching compendium entries; talents expand in the read
  view for their full rules text.
- **Guided onboarding** — `/characters/new` offers a Guided-setup wizard (8 steps: systems toggles, point-
  buy with budget presets, race, class with archetype/gestalt awareness, skills, feats, HP, gear) or a
  blank sheet; an abandoned wizard resumes where it left off, or can be reopened later from the character
  overview. A companion **guided level-up wizard** (`/characters/[id]/level-up`) walks Class → HP → Skills →
  [Feats] → [ASI] → [Spells] → Review, showing only the steps a given level actually owes.
- **Character lifecycle** — an owner-only "Danger zone" on the character overview supports type-the-name-
  to-confirm **deletion**; companion characters (familiars/mounts/eidolons) get their own linked, purpose-
  built read view and a simplified "Simple" editor layout alongside the full Advanced editor.
- **Equipment & items** — a full equipment-slot model (13 gear slots + 11 tattoo slots) with a warn-only
  slot-conflict engine, a paper-doll read view, and an inventory editor with slot/tattoo/wondrous-item
  disclosures and live linked-attack chips for equipped weapons. (A magic-item compendium is planned but
  blocked on sourcing the item dataset.)
- **Two editor layouts** — the chip-based "Modern" editor (collapsed stat-chip summaries that expand in
  place) and a continuous single-page "Classic" editor, switchable per user.
- **Motion system** — app-wide page transitions, staggered list entrances, and hover-lift, gated by a
  user animation preference (`system` / `full` / `off`) with reduced-motion fallbacks.

See [`CLAUDE.md`](CLAUDE.md) for the detailed milestone log, `docs/SECONDARY_MILESTONES.md` for the
S1–S7 roadmap, and `docs/S4_OPTIONAL_RULES_PLAN.md` for the optional-rules/3pp plan.

---

## Tech stack

| Layer            | Choice                                              |
| ---------------- | --------------------------------------------------- |
| Hosting          | Vercel                                              |
| Database / Auth  | Supabase (Postgres + Auth + Storage), strict RLS    |
| Framework        | Next.js 16 App Router, React 19                     |
| Language         | TypeScript (strict)                                 |
| Styling          | Tailwind CSS v4 + CSS-variable theming              |
| Components       | shadcn/ui style + Radix primitives                  |
| Validation       | Zod                                                 |
| Forms            | React Hook Form                                     |
| Animation        | Motion (`motion/react`), user-gated preference       |
| Testing          | Vitest (unit) + Playwright (e2e)                    |
| Package manager  | pnpm (workspaces)                                   |

## Monorepo layout

```
pathforge/
  app/                     Next.js App Router routes
    (marketing)/           Public landing
    (auth)/                Login / signup / OAuth callback
    (app)/                 Authenticated app shell (dashboard, characters, spells…)
    api/v1/                Versioned REST API
  components/              UI primitives, app shell, feature components
  lib/                     auth, supabase clients, env, actions, utils
  packages/
    pathforge-schema/      Canonical PF1e character schema (Zod) + factory + validation
    pathforge-rules-pf1e/  Safe formula engine, bonus stacking, character computation
    pathforge-importers/   Import adapters (PathForge/Foundry/Myth-Weavers/fillable-PDF)
    pathforge-exporters/   Export adapters (PathForge JSON, Foundry Actor JSON, Discord)
  supabase/migrations/     SQL migrations (schema + RLS)
  docs/                    Build spec + design mockups
  tests/                   unit / e2e
```

The `packages/*` are pure (no UI/server deps) so a future Expo/React Native app can reuse the
schema, rules engine, and adapters without rewriting game logic.

## Local setup

```bash
pnpm install
cp .env.example .env.local   # fill in values (see below)
pnpm dev                     # http://localhost:3000
```

### Environment variables

| Variable                              | Description                                              |
| ------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`            | Supabase project URL                                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`| Client-safe publishable key (`sb_publishable_…`)         |
| `SUPABASE_SECRET_KEY`                 | Server-only secret key (`sb_secret_…`). **Never** client |
| `NEXT_PUBLIC_APP_URL`                 | Public base URL (share links, OG, OAuth redirects)      |
| `PATHFORGE_API_KEY_PEPPER`            | Server-only pepper for API-key hashing                  |

In production these are configured in the Vercel project settings.

## Supabase setup

Migrations live in `supabase/migrations/` and were applied to the project via the Supabase MCP.
To run them against a fresh project with the CLI:

```bash
supabase db push                 # apply migrations
supabase gen types typescript --project-id <ref> > lib/supabase/types.ts
```

The **Spell Compendium** (`public.spell_compendium`, 3,000+ spells) predates this build and is
preserved as-is; new tables are additive and never touch it.

## Running tests

```bash
pnpm test          # Vitest unit tests (schema + formula engine)
pnpm test:e2e      # Playwright end-to-end (real browser)
pnpm typecheck     # tsc across app + packages
pnpm lint          # ESLint
```

**E2E (`tests/e2e/`).** `public.spec.ts` smoke-tests every public route + the API in a real browser
(no auth/data needed) — it catches render-time crashes that `next build` and jsdom unit tests miss
(notably function props passed across the React Server→Client boundary). `sheet.spec.ts` logs in and
opens a character as a regression guard for that boundary; it's skipped unless `E2E_EMAIL` +
`E2E_PASSWORD` (a confirmed account owning ≥1 character) are set. CI (`.github/workflows/ci.yml`) runs
lint/typecheck/unit on every push; the e2e job is opt-in via repo var `RUN_E2E` + the Supabase secrets,
and runs the **production** build (where the RSC boundary is actually exercised).

## Deployment

The GitHub repo is connected to Vercel; pushes to `main` deploy automatically. Set the
environment variables above in the Vercel project before the first deploy. The custom domain
`pfsheet.org` is pointed at the Vercel project when ready.

## Architecture overview

- **UI layer** — App Router routes + composable components; game rules never live in components.
- **Auth/session** — Supabase Auth via `@supabase/ssr`; session refresh in `proxy.ts`.
- **Permission/RLS** — every table has RLS; SECURITY DEFINER helper functions (`can_view_character`,
  `can_edit_character`, …) keep policies recursion-free. A GM can view/audit/comment but cannot
  edit a player's canonical sheet.
- **Character schema** — one versioned JSONB document (`pathforge-character-v1`) defined in
  `@pathforge/schema`.
- **Formula engine** — see below.
- **Import/export** — adapter pipelines (PathForge / Foundry / Myth-Weavers / PDF in, PathForge /
  Foundry / Discord out), each preserving unmapped data.
- **API** — versioned read-only REST under `/api/v1`, typed `ApiResponse<T>`, key- or session-authed,
  rate-limited; public reference at `/developers` + OpenAPI 3.1.
- **PWA** — installable with an offline fallback via a privacy-safe service worker (`public/sw.js`).

## Formula engine overview

`@pathforge/rules-pf1e` implements a **safe, no-`eval` formula language**:

- A tokenizer + recursive-descent parser produce a plain AST — no JavaScript is ever generated
  or executed. The lexer only accepts a fixed alphabet, numbers, an allow-listed operator set,
  function calls, and `@{path}` references.
- An evaluator resolves references against a character context, applies an allow-listed function
  set (`floor`, `ceil`, `round`, `min`, `max`, `clamp`, `abs`, `sum`, `if`, `exists`), and never
  throws (errors/warnings are returned).
- A **bonus stacking engine** implements PF1e rules (typed bonuses don't stack — keep highest;
  dodge/untyped stack; penalties stack; stacking groups override).
- A **dependency graph** with topological sort detects circular dependencies.
- `computeCharacter()` turns a canonical sheet into computed AC, saves, initiative, CMB/CMD,
  ability modifiers, and skills — each with a math breakdown for the formula inspector.

## Import/export overview

Adapters implement a shared contract (`detect → parse → normalize → validate`). Imports never
silently discard data — unmapped source fields are preserved under `metadata.unmapped`.

- **Import (shipped):** PathForge JSON, FoundryVTT PF1e Actor JSON, Myth-Weavers JSON, fillable PDF
  (AcroForm). Run through a server-side wizard (`/characters/import`) that sanitizes + size-caps input
  and supports import-as-new or merge (snapshots the target first). _Deferred:_ Myth-Weavers HTML,
  Hero Lab `.por` (shelved — HL Online has no PF1e), statblock parser.
- **Export (shipped):** PathForge JSON (lossless canonical + privacy-filtered public), Foundry Actor
  JSON, Discord card, a **printable one-page PDF** (§13.3, server-side via `pdf-lib`), plus the REST API
  shapes. _Deferred:_ a distinct "classic" PDF layout + skills pagination past ~108 ranked skills.

## Security / RLS notes

- RLS is enabled on every public table; the service/secret key is used only in trusted server code.
  Policies wrap `auth.uid()`/`auth.role()` in a scalar subselect (per-statement, not per-row).
- Leaked-password protection (HaveIBeenPwned) is enabled in Supabase Auth.
- Formulas are never executed as JavaScript.
- Imports validate MIME/extension/size and are parsed server-side; imported HTML is sanitized,
  never rendered directly. The fillable-PDF parser is bounded by a byte cap + wall-clock timeout.
- API keys are stored as salted (peppered) SHA-256 hashes and shown only once; the API is rate-limited.
- The service worker never caches navigations or `/api` — authenticated HTML can't leak via the cache.

## Legal

PathForge stores user-entered and imported content. Built-in content is limited to generic sheet
fields and the mechanics needed for calculation. It is compatible with Pathfinder 1e but is not an
official Paizo product and uses no Paizo logos or protected trade dress.

## Contributing

- Keep game rules out of React components — put them in `@pathforge/rules-pf1e`.
- Validate all external input with Zod; never use `eval` for formulas.
- Add tests for calculation behavior. Run `pnpm lint && pnpm test && pnpm typecheck` before pushing.
