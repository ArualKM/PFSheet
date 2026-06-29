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
pnpm test:e2e     # Playwright (real-browser smoke tests — catches RSC-boundary crashes)
```

Always run `pnpm lint && pnpm test && pnpm typecheck` before considering work done.

**E2E (`tests/e2e/`):** `public.spec.ts` smoke-tests every public route + the API in a real
browser (no auth/data needed). `sheet.spec.ts` is the regression guard for the RSC server→client
crash — it logs in and opens a character to prove `<CharacterDashboard>` renders; it's skipped
unless `E2E_EMAIL` + `E2E_PASSWORD` (a confirmed account owning ≥1 character) are set. Locally,
run a server first (`pnpm build && pnpm start`) — Playwright reuses it. CI is wired in
`.github/workflows/ci.yml`: `checks` (lint/typecheck/unit) always runs; the `e2e` job is opt-in
(set repo var `RUN_E2E=true` + the Supabase secrets) so it never reddens a push until configured.
Unit tests + `next build` do NOT exercise the RSC boundary — see [[pathforge-rsc-function-props]].

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

**M10 (PWA/offline) complete** — privacy-safe service worker (`public/sw.js`: network-first
navigations never cached; cache-first only for `/_next/static/` + the icon; /api never
intercepted), `/offline` fallback, `ServiceWorkerRegister` (prod-only) in the root layout,
`proxy.ts` excludes sw.js/offline. Full offline EDIT/sync deferred to S5b.

**M11 (polish/QA/launch — in progress).** Landed: Playwright E2E harness (`tests/e2e/` +
`.github/workflows/ci.yml` — checks always run; e2e opt-in via repo var `RUN_E2E`); **S2 /view
polish** (dashboard viewer-aware empty states + `profile.appearance` render + CMB·CMD + section
landmark regions; public `/c/[slug]` OG/Twitter cards from the gated portrait + chrome); and a
**Supabase security/perf pass**: migration `0014` (15 FK indexes) + `0015` (wrapped `auth.uid()`/
`auth.role()` in 52 RLS policies for the initplan optimization — branch-tested, behavior-identical).
Migrations now run through `0015`. **Deferred (advisor items):** (1) leaked-password protection —
a manual Auth-dashboard toggle (no API); (2) 8 RLS-helper `SECURITY DEFINER` fns callable via
PostgREST RPC — branch-test proved revoking EXECUTE breaks RLS, so the only safe fix is a
schema-move of all helpers + re-point every policy; low severity, deferred as its own careful task;
(3) `multiple_permissive_policies` on `rule_modules`/`spell_compendium` (low value; spell_compendium
is guardrailed); (4) the one remaining initplan WARN is spell_compendium's policy, left by design.
Leaked-password protection is now **enabled** (owner toggled it).

**S5b (native apps + real-time sync + concurrent-edit conflicts — in progress).** Design in
`docs/S5b_NATIVE_APP_PLAN.md` (start there; `docs/NEXT_SESSION.md` is the quick resume). Decisions:
version-guarded save + 3-way merge for v1 (not live multi-cursor); web stays at repo root.
- **Phase 0** — `lib/character/merge.ts` `threeWayMerge(base, mine, theirs)`: pure, structural,
  id-aware merge (entity arrays merge by stable `id`; value arrays set-merge; conflicts default to
  mine). 11 tests. Proved field-level merge is viable on the real schema.
- **Phase 1** — silent last-write-wins is fixed on web. Migration `0016` (`sheet_version` column +
  `bump_sheet_version` trigger — bumps only on real `sheet_data` change). `saveCharacterSheetAction`
  is a compare-and-swap returning the server sheet on a version conflict; `useCharacterEditor` runs a
  single serialized save-loop (draftRef synced in handlers, not a lagging effect) that auto-merges
  disjoint concurrent edits + surfaces a `ConflictBanner` for true collisions (editing locked while
  open). Two adversarial review cycles. Tests: `tests/unit/use-character-editor.test.tsx`. **Migrations
  now run through `0016`.** Phase 2 (deferred): per-field conflict UI + offline outbox + the
  offline→reconnect→merge integration test.

**Sheet-depth audit (pre-S4) — COMPLETE.** A 10-agent grounded audit (`docs/SHEET_AUDIT_AND_PLAN.md`,
110 findings) found the dominant pattern "data modeled + editable but never reaches the engine or read
sheet." Every P0 + the P1 health cluster was wired engine→view-model→read-sheet, each shipped after an
adversarial review: languages (Int/Linguistics budget), skills depth (Craft/Perform/Profession +
misc/ACP), combat/iterative full-attack, **conditions ENGINE** (fear/fatigue tracks via stackingGroup),
**armor→AC** (+ Max-Dex cap via `@{ac.maxDexPenalty}`) + **ACP→skills** (injects `@{armorCheckPenalty}`
into legacy stored formulas), **weapon→attack** (BAB+ability+grip damage, `pf:weapon:<id>` ids),
**metamagic→effective spell level**, conditional defenses, identity/size `<select>`, **negative levels +
nonlethal→hpStatus + quick HP control**, **HP-from-Hit-Dice + Con + FCB** (`computeMaxHpFromLevels`),
class daily-resource uses tracker, the owner-reported portrait-image fix (plain `<img>`, not next/image)
+ spell-list search/sort/collapse, and a **real-browser verification** that caught a mobile grid blowout
(`min-w-0`). New engine seams: broad `save.all`/`skill.all` buckets; `allInventory()`; `summary.hp`
gained nonlethal/negativeLevels/status.

**S4 — optional rules & 3pp (in progress).** Plan: `docs/S4_OPTIONAL_RULES_PLAN.md` +
`docs/S4_SYSTEM_DESIGNS.md` (11-agent grounded research). The toggle framework (`optional-rules.ts`)
already existed; S4 builds the fields/calcs/UI behind each toggle. **Pattern:** optional
`character.<system>` block → `isModuleKeyEnabled`-gated engine computation emitting `summary.<system>` →
count-only view-model + dashboard card → editor panel in the gated **"Optional"** section group.
**Done:** Hero Points, Background Skills (Adv/BG rank split + Artistry/Lore), Honor (0-100 + dishonor
−2), Stamina & Combat Tricks; **core-math variants** (Fractional BAB/saves, Wounds & Vigor [sibling
`summary.woundsVigor`, never mutates `summary.hp`], Gestalt [best-of-two-tracks; `gestaltLevel` = higher
track NOT the sum; sole writer of `recomputeClassDerived`]); **Mythic core** (`mythic.ts` tier/path/pool/
surge/Amazing-Initiative); **Psionics core** (`psionics.ts` PP pool/ML/powers/focus) + the **paste-parser**
(`parsePsionicPowers`, lenient + never-discard, the copy/paste mega-stretch). **Remaining:** the seeded
options-compendium (migration `0017` generic `<domain>_compendium` + search RPC + `<OptionPicker>` — gated
on sourcing the OGL datasets); Path of War → Spheres → Akashic (XL each, reuse the parser+compendium);
Mythic depth (ability-boosts→scores, path abilities, Hard-to-Kill). See `docs/NEXT_SESSION.md`.

**Read-view overhaul + reliability + privacy (2026-06-28).** A polish/QA session on top of the audit;
each pass shipped after an adversarial Workflow review, gate-green, prod clean.
- **Read-view IA** (`character-dashboard.tsx`): a **wiki infobox** (large portrait + facts `<dl>`)
  replaces the old hero banner; sections regrouped into **Combat** (BAB/CMB/CMD + attacks) and
  **Defenses** (`DefensesCard({ saves, defenses })` — saves + DR/resist/immunity/conditions, always
  rendered); **content-first** rebalance moves Spellcasting/Inventory/Feats/etc. into the wide
  `lg:col-span-2` main column, trackers (hero points/mythic/honor/psionics/advancement/senses/
  milestones/languages/wealth) into the right rail; narrative → a **Background** card; **Speed moved
  Attacks→Core**. **Mobile:** `InfoBox` takes `variant="banner"` and dual-renders — a wide top banner
  (`lg:hidden`, portrait + 2-col facts) on mobile, the tall sidebar card (`hidden lg:block`) on desktop
  — so identity isn't buried at the bottom when columns stack.
- **Read-view completeness** — surfaced ~18 "typed-but-hidden" gaps in the view-model (`view-model.ts`):
  profile sub-fields (affiliations/family/ideals/likes/dislikes/flaws/phobias/uniqueTraits + skin/hair/
  eyes/features), inventory item notes(owner)/cost/weight/weapon-stats + `carriedWeight`, alternate
  `vitals.movement`, spell-like abilities (`spellcasting.slas`), psionic `powers`, an `advancement`
  block (XP — owner-only, hidden under Milestone Leveling), and `senses`.
- **Privacy** — `DEFAULT_SECTION_PRIVACY` now defaults **inventory + wealth to `public`** (owner call:
  "most things should be public"); the share view NAMES the hidden sections (`vm.hiddenSections`); and a
  **Privacy & sharing** panel in the Settings editor (`character-editor.tsx`) writes per-section levels
  into `c.privacy.sections` (was modeled but had no UI). Same gating drives the read view AND `/api/v1`.
- **Editable profile** — `lib/actions/profile.ts` `updateProfileAction` (display name + globally-unique
  handle, RLS self-scoped, 23505→"handle taken", mirrors name to auth metadata) + `profile-form.tsx`;
  `inviteMemberAction` lowercases the handle so invite-by-handle works end-to-end.
- **Autosave hardening** (`use-character-editor.ts`; see [[pathforge-autosave-livelock]]) — fixed the
  fast-typing FREEZE: the mid-save re-arm called `setStatus("unsaved")`, a no-op when already "unsaved",
  so the debounce effect (keyed on `status`) never re-fired and no flush was scheduled. Fix: a
  `flushKick` counter added to the effect deps. Plus a 20s `Promise.race` save-timeout and a try/catch
  around the editor's `computeCharacter` useMemo (a compute throw can no longer white-screen the editor).
- **Milestone Leveling** optional system (`milestone-leveling.ts`) rebuilt on the owner's real campaign
  tables (cumulative per-level requirement ladder + 4-difficulty job-reward matrix); `summary.milestoneLeveling`
  guards `readyToLevel` on `nextThreshold > currentThreshold` (kills the L1–2 false positive).

**Road to v1 (2026-06-28).** A grounded 7-domain readiness assessment → **`docs/V1_ROADMAP.md`** (the
authoritative plan to 1.0; **native apps shelved, the PWA is the mobile story**). The core is
essentially v1-complete; remaining = **V1·1** launch-blockers → **V1·2** polish/trust → **V1·3** sheet
depth → **V1·4** campaign writes → **V1·5** QA gate → **V1·6** printable-PDF. **The S4 flagship 3pp
(Spheres/PoW/Akashic + compendium infra) is now post-1.0.** Also shipped this session: the **game-icon
foundation** (`components/ui/game-icons.tsx` — `<GameIcon>` renders game-icons.net glyphs as a CSS mask
over `currentColor` so they theme correctly; drop-in wrappers swap lucide 1:1; applied to the read-view
dashboard + inventory category icons — finishing the swap across the other thematic surfaces is V1·2)
and the **inventory Equipped/Carried split** (`InventoryList`).
- **V1·1 COMPLETE:** password-reset flow (`lib/actions/auth.ts` request/update + `/reset-password[/update]`
  + a "Forgot password?" link; anti-enumeration; the update is recovery-session-gated), styled
  `app/not-found.tsx`, error boundaries for the public/auth/share groups (`components/route-error.tsx`)
  + `app/global-error.tsx`, **"Coming soon" gating** of the ~11 un-built optional-rule toggles
  (`isModuleComingSoon` / `IMPLEMENTED_MODULE_KEYS` in `optional-rules.ts` — locked unless already on),
  the **API-key pepper** (HMAC-SHA256 via `getServerEnv().apiKeyPepper`; **invalidated the old key
  hashes — existing keys must be regenerated**), and **migration `0017`** (pin `bump_sheet_version`
  search_path; advisor WARN cleared). Each shipped after an adversarial Workflow review (0 confirmed
  defects). **Migrations now run through `0017`.**

**Spheres compendium (2026-06-28) — the S4 flagship's data long-pole is RESOLVED.** The owner sourced +
normalized the complete Spheres of Power/Might/Guile dataset (6 TSVs in `docs/Tables/Spheres Supabase
Project/`). **Phase 1 (compendium-first) shipped:** migration **`0018`** = 6 `sphere_*` reference tables
(spell_compendium contract — public-read, service-role-write, tsvector search) + imported all 4,756 rows
to prod (68 spheres / 3,938 talents / 225 traditions / 489 drawbacks / 29 boons / 20 rules tables; each
row carries a `source` citation). Regenerated `lib/supabase/types.ts`. **`/spheres` browser** is live
(talent search + sphere/category filters, mirrors `/spells`; sidebar nav, Orbit icon). The raw scraped
wiki HTML is gitignored; the TSVs are the versioned import source. **Migrations now run through `0018`.**
Data note: sphere `base_description` is the full wiki page (verbose, TOC prefix) — trim is future polish.
**Spheres Phase 2 (POWER character system) — SHIPPED** (migration-free; commit 535f4b6): `spheres.ts`
(`character.spheres`) → `computeSpheres` (`summary.spheres`) → dashboard Spheres card → `SpheresEditor`
(Optional section, manual entry + SP tracker). **`spheres_of_power` toggle is now LIVE.** Caster level
(High=level/Mid=⌊3L/4⌋/Low=⌊L/2⌋) drives effect scaling + save DC (10+½CL+ability); SP = class level +
casting ability mod; **MSB = total casting-CLASS levels (NOT caster level — a separate quantity like
BAB), MSD = 11+MSB** (a review caught this RAW bug; locked with a multiclass test). 8 tests, 290 total.
**Next — Spheres Phase 2b:** the search RPC + `<OptionPicker>` (add spheres/talents from the compendium
instead of by hand) → **Spheres of Might / Guile** math (un-gate those toggles). Path of War + Akashic
still need their datasets sourced like Spheres was. See [[pathforge-modularity-roadmap]].

**Spheres + optional-rules UX overhaul (2026-06-28).** A 9-pass redesign of the Spheres editor + read
view, each shipped after an adversarial Workflow review (gate-green, prod-clean). **Spheres of Might +
Guile math is now LIVE** (combat/skill talents known/spent; same Full/¾/½ rate as casting via
`sphereCasterLevel`). See [[pathforge-spheres-architecture]].
- **Editor — per-system, self-contained.** `SpheresEditor` is ONE card per enabled system (`SYSTEM_CARDS`:
  Power/Might/Guile, shown if enabled OR it has data), each carrying its OWN stat tiles, SP control
  (Power) / martial-focus (Might), tradition block, and collapsible sub-sections (`SphereSubsection` —
  count badge + chevron; lists > 6 start collapsed) for practitioner classes / spheres / talents /
  drawbacks / boons. The compendium picker (`sphere-picker.tsx`) is now 5-mode (talents · spheres ·
  traditions · drawbacks · boons), parent-CONTROLLED (no remount), and SYSTEM-SCOPED (filters spheres/
  drawbacks/boons by their `system` column; talents client-filtered via a sphere→system map — no migration).
- **Schema (all additive, NO DB migration; migrations still at 0019).** `sphereTalentRefSchema.system`
  (optional; else inferred via `talentSystem(talent, spheres)`). `drawbackMeta`/`boonMeta` — per-NAME
  side-tables `{ system?, appliesTo? }` (drawbacks/boons STAY `string[]`, so the 3-way merge + tradition
  provenance are untouched); `grantSystem` groups them, `grantsTargeting` powers the per-sphere/talent
  "drawback applies here" flag. **Per-system traditions:** `traditions: Record<system,{name,custom?,grants?}>`
  (legacy `tradition`/`traditionCustom`/`traditionGrants` kept ONLY as a Magic fallback); helpers
  `systemTradition` / `applySystemTradition` (replaces just that system's grants, tags them, clears legacy
  Magic once) / `setSystemTraditionFields`.
- **Read view (`character-dashboard.tsx`).** Spheres moved OUT of the right rail INTO the wide main column.
  New `<SpheresCard>`: an overarching card with a COLOR-CODED block per subsystem (Power=rune, Might=gold,
  Guile=green — color on the ICON + border/tint, label stays foreground for WCAG AA on the light theme),
  grouping its spheres with talents nested beneath them (sphereless → "Other"). Talents expand in place via
  `<TalentRow>` (fetch-on-expand from `sphere_talents` by `compendiumId` — no sheet bloat) — the spell-style
  detail rows, now for talents.
- **Privacy fix (pre-existing gap closed):** the spheres section bypassed §15 gating (capability-only). Now
  "spheres" is a real privacy section (`DEFAULT_SECTION_PRIVACY` + `PRIVACY_EDIT_SECTIONS`, default public)
  gated via `gate("spheres", …)` + controllable in the Settings privacy panel. The OTHER optional systems
  (psionics/mythic/honor/…) still have the same capability-only gap — spun off as a follow-up task.
- **App chrome (every page).** `CollapsibleSidebar` (`components/app-shell/`): the main nav + the editor's
  "Sheet Sections" rail collapse to icons-only, hover/keyboard-focus OVERLAY-expand (no reflow), pin to
  lock (localStorage; desktop-only, mobile drawer unchanged). The editor's **Live Values** is now a sticky
  TOP BAR — the lg right column is gone, so the editing column gets full width.
- **Compendium browse ranking:** `/spheres` + `/spells` rank by relevance when a query is present (RPC),
  alpha-paginate when browsing. **Import hunt** (`lib/character/compendium-hunt.ts`): the Myth-Weavers/
  Foundry parsers link talents/spheres/spells to the compendiums on import.
- **Infra:** ESLint now ignores `**/.next/**` + `.claude/**` (stray agent-worktree `.next` output was being
  linted). 304 unit tests. Next Spheres work = the seeded-compendium `<OptionPicker>` add-flow, then Path
  of War / Akashic (datasets need sourcing like Spheres was).

**Chip redesign + privacy gate + sidebar overhaul (2026-06-28).** Each pass shipped after an adversarial
Workflow review; gate-green, prod-clean. **314 unit tests; NO new migrations (all schema changes additive/
Zod-only).**
- **Spheres chip editor + read view** (`deaf148`/`c95a6ac`) — adopted the owner's mockup: the `SpheresEditor`
  tradition card holds drawback / boon / bonus-talent **chips** (click a drawback/boon → an inline target +
  `note` editor, e.g. "Draining Casting → +1 talent"); spheres + talents are chips (Browse or +name); a ★
  marks a talent `bonus` (free — excluded from the spent budget, shown in its own row). The read-view
  `<SpheresCard>` mirrors the chips. Schema additive (`sphereGrantMetaSchema.note`, `sphereTalentRefSchema.bonus`).
  Review fix: `<SphereChip>` renders a `<span>` (not a disabled `<button>`) when non-clickable; `<AddByName>`
  uses a sync ref so Enter-then-blur can't double-add.
- **§15-gate the optional-rules systems** (`0960ee5`) — hero points / honor / stamina / mythic / psionics /
  milestone leveling were emitted RAW from `view-model.ts` → they leaked on public `/c/[slug]` shares
  (psionics even exposed its powers list to non-owners). Now each is `gate("<key>", …)` with a
  `DEFAULT_SECTION_PRIVACY` entry (default public) + `SECTION_LABELS` + a privacy-editor row that shows only
  when the system is enabled OR a non-default level is already set (so a setting is never trapped after a
  module toggle-off). `woundsVigor` (core-vitals, like hp), `senses` (core trait; only its notes are
  owner-only), and `advancement`/XP (owner-only) are deliberately NOT section-gated — locked with invariant
  tests. 6 gate tests + 3 invariant tests.
- **Game-icons swap finished** (`002835c`) — extended the thematic→game-icons swap to the authed dashboard,
  characters/campaigns lists + campaign dashboard, `/spells` + `/spheres` (Orbit→ConcentrationOrb), the
  Buff/Combat/Spellcasting/Inventory/Class-preset editors, and the GM `audit-report`. CC-BY attribution
  already lives in the marketing footer AND the privacy page; sphere `base_description` is not rendered
  anywhere (nothing to trim). Real-browser tint check across obsidian/parchment/high_contrast passed
  (icons render via CSS mask + tint to currentColor; labels stay high-contrast foreground; no overflow).
- **Collapsible-sidebar overhaul** (`04b1261`/`03b8cde`/`500eeba`) — see [[pathforge-collapsible-sidebar]].
  Fixed the unprofessional "peeking label text" on the collapsed rails: label visibility is now driven by a
  **container query** (`@container/sb` on the rail + `@min-[8rem]/sb:` on each label) tied to the rail's real
  width — collapsed shows clean icons, expanded reveals labels (keeps Logo/UserMenu as Server Components — no
  client state). The rail is now **4-state** (persisted): **auto** (hover/focus overlay-expand) · **open**
  (pinned wide, reflows) · **closed** (icons-only, no hover; instead styled hover **tooltips** — label +
  short description, rendered via a portal with `position:fixed` so they escape the rail's overflow) ·
  **hidden** (hard-close → the rail unmounts, a floating "Open sidebar" button restores the prior mode).
  Controls: top `<<` pins closed, bottom pin-open, a Hide button. Same treatment on the editor "Sheet
  sections" rail (3 states — no hidden). a11y: aria-label on every icon-only control, aria-describedby links
  the tooltip to its trigger, focus moves to the replacement control on hide/unhide (only on user toggles).
  **Mobile drawer fix:** the drawer reuses `<SidebarNav>`, whose labels are gated on the rail's
  `@container/sb` (absent in the drawer) → it showed icons only; added a `compact` mode (always-visible
  left-aligned labels, short "Spells"/"Spheres" for the compendiums, aria-label dropped so the name matches
  the visible text — WCAG 2.5.3).

**Secondary milestones** are designed in `docs/SECONDARY_MILESTONES.md` (S1–S7) and being built
interleaved with M10/M11. **Done: S1** (point-buy calculator), **S3** (S3b prebuilt classes +
`class-catalog.ts`; S3a spells — `spell-tables.ts`, `computeSpellcasting`, gated `vm.spellcasting`,
detail rows, prepared/cast/rest), **S5a** (mobile overhaul — drawer nav, responsive editor,
density). **Next: S2** `/view` polish (inside **M11** polish/QA/launch), then **S5b** (native
Android/iPhone apps + real-time sync/conflict — XL), **S4** (3pp content), **S6** (more features),
**S7** (final review). Deferred tails: M8 — Myth-Weavers HTML mapper, Hero Lab `.por`, statblock
parser; M9 — printable-PDF export (§13.3), Foundry round-trip fidelity, `campaigns:read` endpoints;
S5a — touch-height sweep of raw inputs; M10 — per-theme manifest color, custom install prompt.

**Server/Client boundary gotcha:** never pass a function prop from a Server Component to a Client
Component (build + jsdom tests don't catch it; it crashes at request time). Components used by
Server Components take serializable props + `children` only. (Caused the 2026-06-27 character-view
outage; `<ShowMore>` is now children-based.)

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
