# PathForge — working notes for Claude

PathForge is a Pathfinder 1e character sheet + campaign platform. Full spec:
`docs/PathForge Full-Stack Build Instructions.docx` (33 sections, 11 milestones).
Design reference: `docs/mockups/`.

## Commands

```bash
pnpm dev          # dev server (Turbopack) on :3000
pnpm build        # production build
pnpm test         # Vitest unit tests (schema + rules engine)
pnpm typecheck    # tsc across app + all packages
pnpm lint         # ESLint
pnpm test:e2e     # Playwright
```

Always run `pnpm lint && pnpm test && pnpm typecheck` before considering work done.

## Layout

- `app/` — App Router. Route groups: `(marketing)` public, `(auth)` login/signup, `(app)` is the
  authenticated shell (gated by `requireUser()` in its layout + `proxy.ts`).
- `packages/pathforge-schema` — canonical character schema (Zod). **Source of truth** for the sheet
  shape. `createDefaultCharacter()` produces a valid sheet; `parseCharacter()` validates.
- `packages/pathforge-rules-pf1e` — the formula engine + `computeCharacter()`. All game math lives
  here, never in components.
- `lib/supabase/` — `client.ts` (browser), `server.ts` (RLS, per-request), `admin.ts` (secret key,
  bypasses RLS — trusted server only), `middleware.ts` (session refresh helper used by `proxy.ts`).
- `supabase/migrations/` — `0001` schema, `0002` RLS, `0003` cleanup/hardening.

## Conventions & gotchas

- **No `eval` for formulas, ever.** Use `@pathforge/rules-pf1e`'s parser/evaluator.
- **GMs cannot edit a player's canonical sheet** unless they're an `editor`/`co_owner`
  collaborator. RLS enforces this; don't add app-level bypasses.
- **Spell Compendium** (`public.spell_compendium`, ~3,034 rows) is preserved from the old DB.
  Never drop/alter it. It powers `/spells` and spellcasting.
- Next 16 uses **`proxy.ts`**, not `middleware.ts` (renamed convention).
- Supabase typed client needs `@supabase/ssr` ≥ 0.12 with `supabase-js` 2.108 — older `ssr` 0.5.x
  collapses query result types to `never`. `lib/supabase/types.ts` is generated; regenerate after
  migrations (Supabase MCP `generate_typescript_types`).
- Theme classes on `<html>`: `obsidian` (default dark), `parchment` (light), `high_contrast`.
  Tokens are `--pf-*` in `app/globals.css`, mapped to Tailwind colors via `@theme inline`.
- Supabase project ref: `zsopoqfzdjmfmckadkse`. Use the Supabase MCP for DB work; run
  `get_advisors` after DDL.

## Status

Milestone 0 (foundation) complete: scaffold, design system, app shell, auth, dashboard,
characters list + create + computed overview, spell browser, DB schema + RLS, schema & formula
packages with tests.

Milestone 4 (overview + share) complete: privacy view-model (`lib/character/view-model.ts`,
§15 `buildCharacterViewModel`), full mockup-faithful `CharacterDashboard`, public share view at
`/c/[publicSlug]` (admin-client + visibility gate, returns only the filtered model), share
controls + publish/visibility action. Privacy + render tests cover "public never leaks private".

Milestone 5 (edit workspace) — complete: `useCharacterEditor` (client draft + live recompute +
debounced autosave + undo + unsaved-changes guard), `CharacterEditor` with Identity/Abilities/
Health/Saves/AC/Skills/Feats/Profile tabs, a live-values preview, the Simple/Advanced toggle, and
a "Show Math" formula inspector (formula + resolved terms per value). `saveCharacterSheetAction`
validates + recomputes + persists (RLS-gated). Engine now resolves per-stat modifiers
(AC components, save misc, init) entered directly on the sheet, and exposes `ComputedValue.terms`
for the inspector. AC editor writes typed component bonuses into
`defenses.armorClass.conditionalModifiers`.

Pending later: inventory/wealth editor, spellcasting editor.

Next per spec after M5: Buff Center (M6), GM audit + campaign workflow (M7), imports (M8),
exports + API (M9), PWA/offline (M10), polish/QA (M11).
