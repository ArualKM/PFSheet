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
- Supabase project ref: `ldhpdstmgvcsiiupckqx` (org `sjyhdefqdeuifepkxotc`, "PFSheet"). The
  original project `zsopoqfzdjmfmckadkse` ("PathForge") was retired — see the Status note. Use
  the Supabase MCP for DB work; run `get_advisors` after DDL.
- Migrations: `0001` schema, `0002` security/RLS, `0003` cleanup/hardening, `0004` RLS hardening,
  `0005` restore trigger grants, `0006` spell_compendium (table; data seeded separately), `0007`
  fix `characters` SELECT-on-RETURNING, `0008` spell search RPC, `0009` spell-search hardening,
  `0010` campaign-character archive (`archived_at` / `archive_reason`).

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

Milestone 6 (Buff Center) — complete: `BuffCenter` "Buffs" tab (toggle cards with live affected-value
deltas, stacking-conflict warnings, duration + round countdown, bulk actions, library/custom/
duplicate/save-as-template); a 20-entry PF1e buff library (`buff-templates.ts`); engine ingests
ability-boost buffs into `computeAbilities` (with enhancement/inherent stacking), computes effective
speed (`summary.speed`), and exposes `detectStackingConflicts` / `activeBuffDelta` / `previewBuffEffects`.

Edit workspace now covers all of §6 — tabs: Identity, Abilities, Health, Saves, AC, Combat, Skills,
Feats, Buffs, Spells, Inventory, Profile (`combat-editor.tsx`, `spellcasting-editor.tsx`,
`inventory-editor.tsx`, plus deepened Identity/Abilities/Health/Profile in `character-editor.tsx`).
`NumberField` coerces ints, associates labels (useId/htmlFor), and keeps a clearable local draft.
Both M6 and the detailed editors shipped after adversarial Workflow reviews (findings verified + fixed).

Post-M6 additions (each shipped after an adversarial Workflow review):
- **Spell-compendium picker** (`spell-picker.tsx` + `search_spell_compendium` RPC, migrations `0008`/
  `0009`): class/level-aware, ranked (name→school→descriptor→description), debounced, wildcard-safe.
- **Formula-valued buff effects**: an effect's value may be a `@{...}` formula resolved against a base
  resolver (e.g. Divine Favor / Power Attack scale off level/BAB); the custom-buff form has a ƒx toggle.
- **§6 navigation reorg**: a left "Sheet Sections" sidebar (Core/Defenses/Attacks/Abilities/Skills/
  Spells/Equipment/Buffs/Story/Settings) with ARIA tab roles + roving-tabindex keyboard nav, and a
  Settings **Optional rules & 3pp** framework (`optional-rules.ts` — Mythic + ~17 modules toggled into
  `rules.variants` / `rules.modules`; `isRuleEnabled` / `isModuleKeyEnabled` let sections reveal a
  module's fields as it ships). See [[pathforge-modularity-roadmap]].

Deferred sheet depth: per-module field reveals for the optional-rules framework (Mythic tier/path,
hero points, psionics, spheres, path of war, … — toggles persist; fields come per module), feat/feature
+ equipped-item automation editing, level-plan rows, multiple Craft/Perform/Profession, Senses/
Languages/Resources tabs, spell resistance, ability-field a11y name context, **mobile overhaul** of the
new sidebar/3-column layout (ties into M10), and preserving in-progress form state across tab switches.

Milestone 7 (GM audit + campaign workflow) — complete (4 passes, each shipped after an adversarial
Workflow review). The data + RLS layer (campaigns / campaign_members / campaign_characters /
gm_reviews / gm_notes / character_comments / character_snapshots) already existed from M0/M1; M7 is
the UI + server actions + snapshot/diff logic on top.
- **Pass A** campaign foundation: create/list, `/campaigns/[id]` dashboard (roster + approval-status
  badges, members invite/role/remove, enabled modules), `lib/actions/campaigns.ts`,
  `lib/character/review-status.ts`. Roster details read via the admin client after the RLS-gated
  campaign load authorizes the viewer.
- **Pass B** GM Audit View (`/campaigns/[id]/gm` + `/gm/[characterId]`): the read-only `viewer="gm"`
  sheet (admin-client read authorized by GM role + roster membership) + the privacy-aware math/content
  audit engine (`lib/character/audit.ts`), approval checklist + decisions (approve / with-notes /
  request-changes / reject) writing `gm_reviews` + `campaign_characters.gm_review_status`,
  snapshot-on-approve (admin client — RLS intentionally blocks GM snapshot writes), GM notes,
  player-visible change requests, duplicate-to-sandbox. No write path to `characters` → "GM cannot
  edit" is structural.
- **Pass C** snapshots + diff: privacy-aware §16.2 diff (`lib/character/diff.ts`), manual snapshots
  (`lib/actions/snapshots.ts`), `/characters/[id]/history` (owner/editor-gated), GM "compare to
  approved", and persisted §16.3 stale-after-changes (flip via admin after the RLS sheet-save
  authorizes the editor). Snapshots store recomputed computed values.
- **Pass D** player change-request surface: `CampaignFeedback` on the character overview (owner-only)
  — per-campaign status, open GM change requests (mark-addressed), player-visible notes, review
  summary, and §17.2 campaign-module mismatch + adopt (`lib/actions/campaign-feedback.ts`).

Adversarial reviews caught + fixed a privacy-leak class (the audit + diff must re-apply the GM
viewer's §15 section gating, not read the raw sheet) and several data-integrity issues
(approval-snapshot error handling, editor-collaborator stale flagging, stale-banner false positives).

M7 addendum — **roster archiving** (migration `0010`): a campaign character can be archived (dead PC /
on break / retired / left / other) instead of removed, keeping its review status + history. Archived
characters drop out of the active roster, the GM review queue, and the awaiting-review counts; an
"Archived" section on the dashboard lets a GM (or the character owner) Restore or Remove. archive/
restore are `campaign_characters` updates gated by the existing `campchar_update` RLS (owner OR GM).

Milestone 8 (imports) — "deliver first" set complete. The §12 adapter pipeline + the import wizard, each shipped after
an adversarial review. `packages/pathforge-importers` defines the `ImportAdapter` contract +
`runImportPipeline` (detect → parse → normalize → validate); every adapter preserves unmapped source
(metadata.unmapped / labeled notes) — "import never silently discards data".
- **Pass A** — `pathforge-json` (canonical/wrapped/snapshot) + `mythweavers-json` (the user's real
  sheets; flat overloaded slots → resilient mapping: skips dividers/placeholders/budget-trackers,
  recomputes nothing it can't trust, dumps text areas to notes, flags Mythic/Spheres).
- **Pass C·1** — `foundry-pf1-actor-json`: modern (`system`, persisted-only → recomputes BAB/saves/HP
  from class items) + legacy (`data`), maps the 35 skill codes incl. nested `subSkills`, translates
  buff `changes[]` → effects, detects Mythic (class subType) + Spheres (`flags.pf1-pow`). Built against
  the user's two real Foundry exports.
- **Pass B** — import wizard (`/characters/import` + `/characters/[id]/imports`) + `lib/actions/
  imports.ts`: server-only parse, §21.3 sanitize + size cap, `import_jobs` rows, preview→commit;
  import-as-new OR merge (snapshots the target first, §16.1; the merge UPDATE is `.select()`-verified
  so an RLS-filtered 0-row write can't report false success).
- **Pass C·2** — `fillable-pdf` (AcroForm via `pdf-lib`): heuristic field-name mapping (abilities/HP/
  BAB/saves/speed/identity/skill-ranks) + full preservation of the rest; binary upload path (wizard
  reads the PDF as base64 → server decodes → bytes); parse bounded by a tighter byte cap + a wall-clock
  timeout (untrusted-PDF DoS guard).
Fixtures live in `docs/` (Mythweavers + Foundry exports). **Hero Lab is shelved** (deferred, low-prio):
HL Online has no PF1e; HL Classic is paywalled legacy. See [[pathforge-import-samples]].
M8's "deliver first" set is done (PathForge / Foundry / Myth-Weavers / PDF + wizard). Deferred/"then add":
Myth-Weavers HTML mapper, Hero Lab `.por`, statblock parser (post-MVP per spec).

Milestone 9 (exports + API) — complete (4 passes; the API pass shipped after an adversarial Workflow
review that found + fixed 11 issues). Two new packages/surfaces on top of the §15 privacy view-model.
- **Pass A** exporters (`packages/pathforge-exporters`): `ExportAdapter`/`runExport` + `pathforge-json`
  (lossless canonical envelope — uses `characterSchemaVersion`, NOT `schemaVersion`, so the importer's
  detector extracts `.character` not the wrapper) + `foundry-pf1-actor-json` (best-effort modern Actor;
  reverse 35-skill map; warnings list round-trip limits). Proven by export→import round-trip tests.
- **Pass B** export UI: `lib/actions/exports.ts` (`exportCharacterAction`) + `/characters/[id]/exports`.
  FULL exports (PathForge/Foundry JSON) require owner/editor; PUBLIC JSON is filtered through the
  `anonymous` view-model. Each export logged to `export_jobs`.
- **Pass C** the API (`/api/v1`): public endpoints by share slug (anonymous view-model → public-safe
  only) `/public/characters/{slug}/{summary,stats,portrait,opengraph}`; authenticated (key or session,
  owner's own characters) `/characters/{id}/{summary,stats,portrait,share}`; `/discord/character-card`
  (public `?slug=` or keyed `?characterId=`). API keys `pf_live_…` (SHA-256-hashed, shown once, scoped,
  revocable, optional per-character allow-list) at `/settings/api`. Fixed-window rate limiting
  (migrations `0011` table+RPC / `0012` index+opportunistic prune; service-role-only `check_rate_limit`).
  `lib/api/*` = response envelope / auth (key+session resolve, `recordKeyUsage` runs only after
  rate-limit) / guard / load / catalog / openapi. Shapes in `lib/character/api-shapes.ts`.
- **Pass D** developer docs: `/developers` (public reference) + `/api/v1` discovery + `/api/v1/openapi.json`
  (OpenAPI 3.1) — all driven by `lib/api/catalog.ts` (single source of truth so docs can't drift).
- Review fixes (all 11): abilities now gated in the view-model (was leaking ability scores when the
  abilities section was marked private); allow-list empty-array-means-all trap closed (reject
  restricted-but-empty + UUID-filter + ownership-intersect); `clientIp` prefers `x-real-ip` over
  spoofable XFF; rate-limit table prunes; key usage/audit moved past the rate limiter; OpenAPI models
  the Discord endpoint as mixed-auth; dead `characters:public` scope removed; `/health` catalogued;
  key-manager reuses the catalog scope list.

Migrations now run through `0012` (`0011` api_rate_limits table+RPC, `0012` prune+index).

Next per spec: PWA/offline (M10), polish/QA (M11). Deferred tails: M8 — Myth-Weavers HTML mapper,
Hero Lab `.por`, statblock parser; M9 — printable-PDF export (§13.3), Foundry export round-trip
fidelity, `campaigns:read`-scoped API endpoints (scope reserved).

### Infra note — character-create RLS fix + project migration (2026-06-25)

Symptom: every character create failed with "new row violates row-level security policy for
table characters" (live app + direct PostgREST). Root cause was **not** auth/JWT: the
`characters_select` policy used only `can_view_character(id, auth.uid())`, a SECURITY DEFINER
function that re-queries `characters` by id. PostgREST runs `INSERT ... RETURNING` for the app's
`.insert().select()`, and the just-inserted row isn't visible to that function's snapshot, so the
owner couldn't read back their own new row → reported as an RLS insert violation. A plain insert
(`return=minimal`) always succeeded; only the RETURNING path failed. Fix = migration `0007`: add a
direct `owner_id = auth.uid()` predicate (always visible in RETURNING) before the function call.

The original Supabase project's signing keys had been churned while mis-diagnosing this as a JWT
issue, so work moved to a fresh project (`ldhpdstmgvcsiiupckqx`). All 7 migrations were applied,
`spell_compendium` (3,034 rows) copied over, and the full create→edit→share + spell-browser flow
verified green. The old project can be deleted once the new one is confirmed in production.
