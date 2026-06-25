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
| Server state     | TanStack Query                                      |
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
    pathforge-importers/   Import adapter contracts (Foundry/Hero Lab/Myth-Weavers/PDF)
    pathforge-exporters/   Export adapter contracts (Foundry/Discord/PDF/JSON)
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
pnpm test:e2e      # Playwright end-to-end
pnpm typecheck     # tsc across app + packages
pnpm lint          # ESLint
```

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
- **Import/export** — adapter pipelines (contracts defined; adapters land in later milestones).
- **API** — versioned under `/api/v1`, typed `ApiResponse<T>`.

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
silently discard data — unmapped source fields are preserved under `metadata.unmapped`. Planned
sources: PathForge JSON, FoundryVTT PF1e, Hero Lab (Classic/Online), Myth-Weavers (best-effort),
fillable PDF. Exports: PathForge JSON (canonical/public), Foundry Actor JSON, Discord card,
printable PDF.

## Security / RLS notes

- RLS is enabled on every public table; the service/secret key is used only in trusted server code.
- Formulas are never executed as JavaScript.
- Imports validate MIME/extension/size and are parsed server-side; imported HTML is sanitized,
  never rendered directly.
- API keys are stored as salted hashes and shown only once.

## Legal

PathForge stores user-entered and imported content. Built-in content is limited to generic sheet
fields and the mechanics needed for calculation. It is compatible with Pathfinder 1e but is not an
official Paizo product and uses no Paizo logos or protected trade dress.

## Contributing

- Keep game rules out of React components — put them in `@pathforge/rules-pf1e`.
- Validate all external input with Zod; never use `eval` for formulas.
- Add tests for calculation behavior. Run `pnpm lint && pnpm test && pnpm typecheck` before pushing.
