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

**V1 roadmap blitz — V1·2 → V1·6 (2026-06-29).** Eight commits, each gate-green (lint + typecheck +
unit + prod build) and pushed to `main`; the substantive ones shipped after an adversarial Workflow
review. **Unit tests 314 → 338. No new DB migrations** (still 0018; all changes additive/Zod-only).
- **V1·2·a** (`87b36e8`) — PWA raster icons: rasterized the brand mark → `icon-192/512.png` + full-bleed
  maskable variants + `apple-touch-icon.png` (180); manifest + root `metadata.icons` wired. Sources
  `icon-maskable.svg` / `icon-fullbleed.svg` kept for regen. Browser-verified.
- **V1·2·b** (`d93f68c`) — CSP **enforced** in production (env-gated: Report-Only in dev so HMR's eval
  isn't blocked). A grounded audit proved the directive string is already complete; **the Discord
  `frame-ancestors` carve-out was REJECTED** (Discord unfurls via OG-meta scraping, never iframes — the
  roadmap item was cargo-cult). Runtime-swept all public routes clean under enforcement.
- **V1·3·1** (`4b93d0e`) — **feat/feature/trait automation editor**: reusable `<AutomationEffectsEditor>`
  (target · add/subtract · value-or-ƒx · bonusType) wired into all three cards (was hardcoded
  `automation:[]`). Closed an engine gap: **HP is now a `classifyTarget` domain** (`summary.hp.max` +
  W&V vigor), so Toughness computes. Also widened the ability-target regex (custom keys >3 chars were
  dropped). [[pathforge-automation-editor]]
- **V1·3·2** (`754d25f`) — conditions engine 12 → 17: added blinded/deafened/pinned/squeezing/invisible
  (clean numerics); documented why nauseated/paralyzed/helpless stay display-only.
- **V1·3·3** (`f22ff81`) — **Mythic depth**: `mythic.abilityBoosts` now apply (+2 each, untyped/stacking)
  → ability scores; **Hard to Kill** (tier 1+) doubles the death threshold in `hpStatus`; `summary.mythic`
  + VM + dashboard gained boost/path-ability counts + a Hard-to-Kill chip. The `MythicEditor` got a real
  ability-boost editor + path-ability list (was a "later pass" stub).
- **V1·3·4** (`3c6f133`) — **Automatic Bonus Progression**: the deterministic big-six (resistance→saves,
  armor/weapon attunement→AC/attack, deflection, toughening) keyed off `identity.totalLevel`, each a
  distinct bonus type so they stack; **`abp` added to `IMPLEMENTED_MODULE_KEYS`** (un-gated). Prowess
  (player-chosen ability +2s) deferred → spawned task.
- **V1·4** (`ce58280`) — campaign GM writes: `updateCampaignModulesAction` (multi-select chip editor →
  `enabled_modules`, unlocks §17.2 adopt) + `updateCampaignDetailsAction` (name/desc). Gated to owner/gm
  (matches `campaigns_update_gm` RLS, excludes assistant_gm), `.select()` 0-row guard. **Invitation
  consent flow (the 3rd item, needs an RLS migration) deferred → spawned task.**
- **V1·5** (`fcfbcbb`) — **public E2E smoke + a11y now run on EVERY push**: new always-on `e2e-public` CI
  job boots the app with **placeholder Supabase env** (env.ts presence-only, sitemap try/caught, proxy
  `getUser()` null-on-failure) — no secrets/DB. Validated end-to-end locally. `accessibility.spec.ts`
  (@axe-core, was unused) caught + fixed a real serious a11y bug (non-focusable scrollable `<pre>` on
  `/developers`). The gated `e2e` job remains for authed `sheet.spec.ts`. Deferred: RLS integration tests.
- **V1·6** — **printable PDF** (§13.3): `packages/pathforge-exporters/printable-pdf.ts` draws a clean
  one-page (auto-flowing) reference sheet with **pdf-lib** (server-side, no headless browser); recomputes
  via the rules engine. Gated to owner/editor (full export); binary returned as base64, decoded
  client-side. `printable_pdf_modern`/`classic` both registered + offered in the export panel. Visually
  verified via a render-to-PNG loop; shipped after an adversarial review (1 must-fix applied: finite-guard
  a formula-valued BAB so the cell can't print "NaN"). Deferred: skills pagination past ~108 ranked skills
  (unreachable by real sheets) + a distinct "classic" layout.
- **Spawned follow-ups** (background tasks): DRY the buff/automation effect-row UI · inventory-item
  automation editor · ABP ability-prowess auto-apply · ~~the campaign invitation-consent flow~~ (DONE,
  see below).
- **Owner note:** the new `e2e-public` CI job runs on every push — glance at the first Actions run to
  confirm green (validated locally, but live CI couldn't be checked — `gh` not installed here).

**Campaign invitation / consent flow (2026-06-29).** The V1·4 deferred item — `inviteMemberAction` used
to force-add an invited player as `status: "active"` with no consent. Now a real pending → accept/decline
flow, shipped after an adversarial Workflow review (2 confirmed findings, both fixed) + a 16/16 RLS
branch-test (Supabase dev branch). **Migration `0020` → migrations now run through 0020.**
- **`inviteMemberAction`** inserts `status: "invited"` (pending). New **`acceptInvitationAction`** (CAS
  `invited`→`active`) + **`declineInvitationAction`** (deletes own `invited` row, scoped so it can't
  silently leave an active campaign) in `lib/actions/campaigns.ts`.
- **Migration `0020`**: `campaign_members.status` CHECK `in ('active','invited')`; **`members_accept_self`**
  RLS UPDATE policy (USING own+invited, WITH CHECK own+active); **`protect_member_self_update`** BEFORE-UPDATE
  trigger pinning `role`/`campaign_id`/`user_id` and requiring `invited→active` — the real escalation guard
  (WITH CHECK can't see OLD, so a pure-RLS policy would let an invitee `SET campaign_id=…` to join an
  arbitrary campaign). Trigger is **SECURITY INVOKER + no execute revoke** (matches `bump_sheet_version`
  0016/0017) — the review caught that revoking EXECUTE from `authenticated` would silently break EVERY
  `campaign_members` UPDATE, the exact 0003→0005 regression.
- **Access-control invariant (the point):** `is_campaign_member`/`has_campaign_role` already require
  `status='active'`, so an `invited` row grants ZERO access — the campaign isn't readable, no GM check
  passes, it's absent from the campaigns list, and the dashboard `notFound()`s. The invitee reads only
  their own pending row (`members_select`). Verified end-to-end on the branch (invited + non-member both
  blocked from reading; accept grants access; escalation/campaign-hop/user-reassign all blocked).
- **UI:** `PendingInvitations` (Accept/Decline) on `/campaigns`; campaign dashboard members list shows a
  **Pending** badge (GM gets Cancel). Pending-campaign names resolved via the admin client, gated by the
  viewer holding the invitation row. `decline` rides the existing `members_delete_gm` self-delete grant.

**PFcore / M12 — compendium-driven builder (planned 2026-06-29).** v1 + all spawned follow-ups are DONE;
the next major epic is the **compendium-driven builder** — tap to apply official PF1e content and the engine
auto-fills the mechanics. The owner supplied a complete normalized AoN dataset (`docs/PFcore Update/csv/` —
**25 TSVs / ~25.9k rows**: classes/progression/features/options, archetypes + 6k features *with `replaces`*,
feats + 7.6k normalized prereqs + automation-effect seeds in our `@{…}` DSL, traits/drawbacks, races + alt
traits + FCB, prestige + progression, mythic, animal-companions/familiars/eidolons). The raw ~11k-page HTML
mirror is **gitignored**; TSVs are versioned. Plan: **`docs/PFcore Update/PFCORE_MASTER_PLAN.md`** — a
10-phase, **additive-only** build (data load → browse → pickers + shared prereq engine → automation hooks →
progression class builder [keystone] → archetypes → prestige → races → mythic depth → linked-subsheet
companions), each table following the spell/sphere **compendium contract**. **Owner-signed:** companions =
**linked character rows** (`parent_character_id` + `companion_type`); ship the **thin slice (Phase 0→3)
first**.
**SHIPPED (2026-06-29, Ultracode):**
- **Phase 0 — data layer:** migrations `0021`–`0024` = 25 compendium tables on the spell/sphere **contract**
  (public-read RLS · service-role write · generated tsvector `search` + GIN · ranked `search_<t>(p_query,
  p_limit)` RPC · `compendium_distinct(table,col)` for filter dropdowns · explicit anon/auth grants).
  **25,924 rows loaded to prod** via the config-driven loader `docs/PFcore Update/csv/loader/pfcore.mjs`
  (`ddl`/`rpc`/`grants`/`load`/`counts`). `lib/supabase/types.ts` regenerated. Advisors clean.
- **Phase 1 — browse:** shared async-server `<CompendiumBrowser>` (`components/compendium/`) + thin config
  pages `/feats /traits /races /archetypes /prestige /class-options` + a `/compendium` hub; nav collapsed
  `/spells`+`/spheres` into one **Compendium** entry. Ranked-RPC when a query is present, alpha+paginated
  when browsing; `distinctValues` → `compendium_distinct` (un-truncated filter options). Reviewed+fixed.
- **Phase 2 — pickers + prereq engine:** the pure **prereq engine** `packages/pathforge-rules-pf1e/src/
  prerequisites.ts` (`evaluatePrerequisites` → met/unmet/manual; feat/ability/skill/bab/level/caster_level,
  7 tests). The **feat picker** (`components/character/editor/feat-picker.tsx`): a Browse button in the
  Feats editor → ranked `search_feat_compendium` + per-result `feat_prerequisite` rows evaluated against
  the live `ed.computed` → green ✓ / amber ✗ / muted-manual chips; "Add anyway" never blocks. A reusable
  **`<EntryPicker>`** (`entry-picker.tsx`, search→list→add, no prereqs) drives the **trait picker**.
  `FeatEntry`/`FeatureEntry`/`TraitEntry` gained an additive optional `compendiumId` (links the sheet entry
  back to the compendium row; dedup key). Both verified live in the editor; the feat picker shipped after
  an adversarial review (15 confirmed → fixed chip WCAG contrast on parchment, reused `ed.computed` instead
  of recomputing, paren-stripped skill-rank matching). **Migrations now through `0024`; 364 unit tests.**

- **Phase 3 — automation hooks:** applying a compendium feat now pre-fills its `automation[]` from the
  `feat_effect` seeds so the mechanics compute. The mapper `packages/pathforge-rules-pf1e/src/effect-seeds.ts`
  (`seedsToAutomationEffects`, exported) bridges the seed DSL onto the engine: **target normalization**
  (`saves.fort`→`saves.fortitude`/`saves.ref`→`saves.reflex` — `classifyTarget`, now exported, substring-
  matches the full save name); **formula normalization** (`normalizeFormula` rewrites the author's
  `@{whole-expr}` convention → our `func(@{path})` DSL — `@{max(3,level)}`→`max(3,@{level})`,
  `@{wis.mod}`→`@{abilities.wis.mod}`; handles dice/uppercase-fns/bare-wraps); **conditional gating**
  (toggle/choice/situational + `damage.*` [no engine domain] come in with a `condition` so they're recorded
  but excluded from base totals — only clean unconditional effects auto-compute). The feat picker fetches
  `feat_effect` alongside prereqs + shows a ⚡ auto badge. **Verified live: Toughness raised a L20 char's Max
  HP 900→920.** Two adversarial reviews (15 + 11 confirmed → fixed); 375 tests incl. 2 end-to-end compute
  tests. **The thin slice (Phases 0→3, the owner-signed "ship first" target) is COMPLETE.**

- **Phase 4 — the keystone progression-driven class builder: COMPLETE** (6 steps; status doc
  `docs/PFcore Update/PHASE4_STATUS.md`). Additive, no-double-count architecture: the existing
  `recomputeClassDerived` does 100% of the class math, so Phase 4 is an **adapter** — `parseProgression` +
  `compendiumRowToPreset` (`packages/pathforge-schema/src/class-compendium.ts`) turn a `class_progression` row
  into a `ClassPreset` **cached on the row** (`CharacterClass.compendiumPreset`; `resolveClassPreset` resolves
  it — no session registry). Proven byte-identical to the catalog at L1/5/11/20. `applyCompendiumClass` +
  `grantClassFeatures` (`packages/pathforge-rules-pf1e/src/class-builder.ts`) reuse `applyClassPreset` + the
  Phase 3 `seedsToAutomationEffects` to apply the class + grant each level's `class_feature_compendium` features
  (automation from `feature_effect`). UI: `<ClassCompendiumPicker>` (Identity editor; `lib/character/
  class-compendium.ts` parsers), level-up regrant in `ClassRow`, `<ClassOptionsPicker>` (Features editor).
  **Verified live: Fighter L5 → BAB+5/saves/HP + 3 features; Oracle (non-catalog) parsed right.** Two adversarial
  reviews (the Step-4 one caught the critical `class_features`→`class_feature_compendium` table-name bug —
  features had silently failed; fixed + re-verified). 396 tests. **Deferred to polish:** cleaner names for
  book-ref option types, smarter non-core caster-stat defaults (the **per-level progression accordion viz
  shipped** in the post-M12 builder-UI polish pass — see below, `e3a3971`).

- **Phase 5 (archetypes) DONE** — `applyArchetype` (`packages/pathforge-rules-pf1e/src/class-builder.ts`):
  conflict-check (two archetypes can't both replace the same standard feature → block + explain), remove the
  replaced features, grant the archetype's features, record `replaces` on the row; `grantClassFeatures` gained
  `exclude` so a level-up doesn't re-grant a replaced feature. `<ArchetypePicker>` with live conflict blocking.
  Verified live (Acrobat→Rogue replaced Trapfinding/Trap Sense; Cutpurse blocked; Burglar stacked). A review
  fixed the level-up regrant race (capture classId + exclude at click time; match the row by id, not index).
- **Phase 6 (prestige) DONE** — `<PrestigePicker>` reuses `applyCompendiumClass` for BAB/saves/HP with
  `suppressCaster` (prestige casting is "+N level of existing class", not a new caster). Honest scope given the
  data: all 118 `requirements` are empty → no auto-gating (show the description for self-assessment); no
  prestige feature table. Fixed `parseProgression` save inference for prestige (good saves start at +1 not +2 →
  any positive L1 base is "good"; base classes unaffected). Verified live (Arcane Trickster: ½ BAB, good
  Ref/Will, no spurious caster). 402 tests.

- **Phase 7 (races) DONE** — `<RacePicker>` ("Browse races" in Identity); `applyRace`
  (`packages/pathforge-rules-pf1e/src/race-builder.ts`) adds ability mods (parseAbilityMods handles every dash
  incl. the data's EN-DASH penalty; sign now required so prose numbers can't over-match) to the base score, sets
  size + speed, grants standard traits as a feature, records `identity.raceApplied` for revert-on-reapply; alt-
  traits added as features. Verified live (Dwarves → +2 Con/+2 Wis/-2 Cha). Review found edge cases (point-buy
  interaction, manual-edit-between-races, size revert) — **spawned as a polish follow-up**; common path works.
- **Phase 8 (mythic depth) — NOT BUILT (honest skip).** The mythic CORE already shipped (S4 + V1·3·3:
  tier/path/pool/surge/ability-boosts/Hard-to-Kill/manual path abilities). A compendium picker isn't viable:
  ALL 431 `mythic_path_ability_compendium.name` values are book references (the scrape lost the real names) —
  unusable for selection. Documented; no low-value picker built on bad data.
- **Phase 9 (companions) DONE** — **migration 0025** (characters gains `parent_character_id` self-FK [ON DELETE
  SET NULL] + `companion_type` + not-own-parent CHECK + partial index; owner RLS covers it — advisors clean).
  `createCompanionAction` (`lib/actions/characters.ts`) + `<CompanionsCard>` on the character overview (owner-
  only): list linked companions (each a real, separately-editable character) + create one (6 types) → jumps to
  its sheet. Verified live (Test Wolf → linked row → appears in the parent's card). **Migrations now through 0025.**

**M12 (PFcore compendium-driven builder) is COMPLETE** — 9 of 10 phases shipped + reviewed + live-verified;
Phase 8's compendium picker honestly skipped (data + the core already exists). 408 tests. See
[[pathforge-pfcore-epic]] + `docs/PFcore Update/PFCORE_MASTER_PLAN.md`.

**Post-M12 builder-UI polish (2026-06-29, "UI polish pt.1–4", `e3a3971`→`13c51ac`).** Right after M12 shipped,
a hybrid "shared bones + bespoke detail" pass unified the seven M12 builder pickers onto a shared toolkit
`components/character/editor/picker-shell.tsx` — `PickerShell`/`PickerSearch`/`PickerError`/`PickerList`/
`PickerRow`/`PickerDetail` + `FeatureTypeChip` (Su=rune / Ex=green / Sp=gold, WCAG-safe foreground text) — so
class/feat/trait/race/archetype/prestige/class-option pickers share one chrome + state model, each keeping its
bespoke detail. Marquee: the **`<ClassCompendiumPicker>` now renders a per-level PROGRESSION ACCORDION**
(`parseProgressionTable`) — every level shows BAB + Fort/Ref/Will + the feature(s) gained (expand → Su/Ex/Sp
chips), levels above the chosen one dimmed as a preview; features fetched-on-select (this is the Phase-4
"deferred per-level accordion viz", now done). The race picker's ability mods became sign-tinted **tiles**
(WCAG-safe). This is the foundation the 2026-06-30 chip+disclosure redesign built `<EntryCard>` on top of.

**Editor "mega polish" + mobile-nav overhaul + read-view completeness + compendium accordion (2026-06-30 →
07-01).** A large post-M12 UI/UX pass, each increment shipped after an adversarial Workflow review + a
real-browser verify (localhost prod on :3100; the dev browser window clamps to ~660px, so true <640px mobile
is class-guaranteed, not pixel-verified). See [[pathforge-editor-chip-disclosure]] + [[pathforge-mobile-first-ui]].
- **Editor chip+disclosure redesign** — the whole EDIT UI moved to a unifying pattern: *beautiful chips as
  the default display + a show/hide disclosure to customize every aspect + tap-to-open on mobile*, all on the
  existing schema. Shared `<StatChip>`/`<Segmented>` (`picker-shell.tsx`) + `<EntryCard>` (`entry-card.tsx`;
  collapsed name+chips → expand-to-edit; render-phase open-on-signal). **Classes** (`9417b52`) — killed "From
  catalog"; per-class **Archetype** button auto-scoped to that class + multiple; **Prestige** folded into the
  Compendium picker as a filter; editable Good/Bad Fort/Ref/Will + BAB + caster type + custom HD; halved name
  box + an accordion of every aspect; **Favored-class checkbox(es)** + FCB +1 HP / +1 skill steppers.
  **Feats/Features/Traits** (`692a929`) — rich chips + expand-to-edit (the "custom is too basic" fix).
  **Race + Spells** (`69df796`) — a disclosure to view/set every racial-trait effect (ability mods, speed,
  base height); spells on the same chips+disclosure pattern.
- **Mobile nav overhaul (A→B→C, `docs/MOBILE_NAV_AND_POLISH_PLAN.md`)** — **A** killed the redundant mobile
  sidebar drawer → an `<AccountMenu>` avatar (settings/theme/sign-out), the section switcher became a
  hamburger bottom-sheet, live-stats locked to a sticky `top-14` strip + a floating back-to-top
  (`893d00c`/`0b3b6e7`); **B** a 44px touch-target sweep (Button `sm`/`icon`/`default` now touch-first
  responsive `h-11 … sm:h-X`; ~40 inline controls; toolbar/profile stacks) (`842a441`); **C** read-view
  completeness — feat/feature/trait rules text expands via a new `<EntryDetailRow>`/`<DetailPara>`
  (`entry-detail-row.tsx`, SpellRow-style); per-class archetypes header; at-will spell badge + FCB skill
  ranks (`1eed610`); SLA caster-level + owner-only notes + a racial ability-mod line on the scores card
  (`40708e8`). VM gained `header.classes[]`, `racialMods` (abilities-gated), `advancement.favoredClassSkill`,
  `SpellView.atWill`, `slas.casterLevel/notes`(owner). **A+B+C all pushed to prod.**
- **Dashboard compendium card** (`a87ec98`) — the "Spell Compendium" quick-link (→ `/spells`, spells-only,
  predated M12) is relabeled **"Compendium"**, broadened, and repointed to the unified **`/compendium`** hub.
- **Compendium: Classes page + full-detail accordion** (`3c658ff`) — (1) the missing **`/classes`** browse
  page (`class_compendium` + `search_class_compendium` already existed) + added as the FIRST `/compendium`
  hub card (new `Helmet` game-icon → `caro-asercion/warlord-helmet`). (2) Replaced the `line-clamp`
  truncation on EVERY compendium browse page with a native `<details>`/`<summary>` **accordion** (zero client
  JS — the pages stay pure Server Components): collapsed = name + badges + key meta, expand = the full
  untruncated rules text. `CompendiumConfig`: `renderRow` → `renderSummary` + `renderDetail` + `hasDetail`;
  new shared `<Prose>` (`<br>`→newline, `whitespace-pre-wrap`) + trim-aware `hasText()` helpers in
  `compendium-browser.tsx`. Applied to the 6 `CompendiumBrowser` configs + classes AND the bespoke `/spells`
  + `/spheres`. Review fixes (2 LOW): `hasText`-gated expandability (no chevron over an empty body on future
  imports) + a terse `aria-label` on each `<summary>` so its a11y name is the entry name, not
  "Fighter Base d10 Core Rulebook". See [[pathforge-icon-pack]].

**"Finish PFSheet" session (2026-07-01).** Six owner-requested passes, each gate-green
(lint/typecheck/483 tests/prod build), the big ones shipped after adversarial Workflow reviews.
**Migrations now run through `0026`.**
- **Compendium search fix** (`5489fb2`, migration `0026`): all 19 PFcore search RPCs only matched
  complete words ("Wiza" never found Wizard). Regenerated on the spell/sphere ILIKE pattern
  (substring WHERE + prefix-ranked ORDER, FTS kept for multi-word); CompendiumBrowser's
  filtered-search mode got matching `or(ilike,wfts)` semantics. Live-verified on prod.
- **Mobile section navigator + Settings split** (`96f6733`): the editor's bottom-2/3 section sheet
  is now a FULL-SCREEN navigator (every section with its sub-panels, 1-tap deep nav, safe-area,
  `pf-sheet-in` animation); Settings split into "Optional rules & 3pp" | "Privacy & sharing" subtabs.
- **Saves + AC full editors** (`7a5cb4a`): chip+disclosure rows exposing base/key-ability override
  (SaveEntry.abilityKey WIRED through the engine via stored-formula ref rewrite), typed modifier
  lists (`<ModifierListEditor>`), equipped-armor + Max-Dex summary, show-math. Engine:
  `modifierEntryToMod` evaluates string values as formulas; the parser accepts `[[…]]` inline-roll
  brackets.
- **Skills overhaul** (`cac237a`): per-skill `abilityOverride` (every row gets an ability select),
  buff/automation targets for single skills + `skill.<ability>.all` groups + per-skill buff-preview
  deltas (namespaced keys), dual-mode number-or-ƒx Misc. Review fixes: stale `resolver.local` in ƒx
  skill-misc (locals now set BEFORE misc eval, `@{misc}` pinned 0), direct save/AC ƒx modifiers
  evaluate against the FULL resolver (deferred pass), classifyTarget anchors namespaced targets
  before fuzzy substring matching, imported flat-formula saves get a "fixed total" banner +
  one-click Rebuild.
- **Mythic completed** (`38ffc3e`): the 431 path-ability names were RECOVERED from the live AoN
  pages (description-match; TSV updated + prod repaired in place by slug — `repair-mythic-names.mjs`;
  0 book-ref names remain). `<MythicAbilityPicker>` (path/Universal scope), tier-gated base
  abilities (`MYTHIC_BASE_ABILITIES` → `summary.mythic.baseAbilities` → editor list + dashboard
  chips), mythic FEATS (feat_compendium.mythic text → picker badge + `featEntry.mythicBenefit` on
  mythic characters → read-view "Mythic" detail), spell augments fetch-on-expand in SpellRow.
- **Companion system** (`1bfb64a`): `character.companion` block + cached master stats; familiar
  master-link ENGINE rules (HP half / BAB master's via the single `summary.bab` source / saves +
  skills better-of / Int + NA tables, all ARCHETYPE-aware via `FAMILIAR_ARCHETYPE_ALTERS`); 20
  familiar archetypes extracted from d20pfsrd (workflow) with replaces-driven granted-ability
  swaps; statblock autofill from the 214/187-row compendiums; master-save + edit-page-load sync
  (admin client, sheet_version CAS, stale-review flip); nested /characters; §15 "companion"
  privacy section. See `lib/character/companion-sync.ts` + [[pathforge-companion-system]].
- **Import verification wizard SHIPPED** (`ad60fb7`; plan + full status banner in
  `docs/IMPORT_VERIFICATION_PLAN.md`): every assertion an import makes becomes a CLAIM the player
  confirms/corrects/keeps/skips in a new wizard **Verify step**, then commit applies confirmed
  links through the M12 appliers (class builder / archetypes / race / feat automation seeds).
  Pure claims engine (`lib/character/import-claims.ts`: gestalt "A/B || C" per-segment tracks, UC
  spellings, notes MINING with junk filters) + server candidate resolution (`import-candidates.ts`:
  chunked quote-safe batched exacts keeping ALL same-name rows, capped ranked-search fallback) +
  `import-verify.tsx` (questions panel — the core-vs-Unchained toggle re-picks the class row LIVE;
  candidate radios + per-claim search; level gating blocks commit) + `import-apply.ts` (order-
  correct apply; claims re-read from the job row). **Header context steers matching**
  (`classifyHeader`: "##### Rogue Class Features #####" / "CASTING TALENTS" / "MYTHIC" / "RACE
  TRAITS:" re-order each probe's tables) across 11 targets incl. `sphere_talents`,
  `mythic_path_ability_compendium`, `alternate_racial_trait_compendium` (each with an apply
  branch); multi-match with no tie-break (context > slot kind > linked-class-owns-feature) is
  AMBIGUOUS — never auto-linked, all candidates in a selector. A 28-agent adversarial review
  confirmed 23 findings, all fixed (gestalt-track error path, dead unchained toggle, spell-slot
  re-file no-ops, classLevels NaN → bricked sheet, skipped-class data loss, postgrest quote-key
  batch poisoning…). Live-verified on the real Anise fixture: totalLevel 20, both classes →
  (Unchained) rows on tracks a/b, 25 features granted, 5 mined traits linked. 483 unit tests
  (fixture-driven claims tests + fake-Supabase apply tests). Deferred: P4 archetype-depth
  matching; PoW/Akashic/Psionics detectors (warn-only until those systems ship).

**The big 3pp update (S4 flagship) — COMPLETE (2026-07-02, Ultracode).** Plan: `docs/3PP_MASTER_PLAN.md`
(phases 0–9, D1 gating). The owner's 20-TSV / 14,350-row dataset (`docs/3pp Update/csv/`, versioned;
raw mirror gitignored) → **migrations `0027`/`0028`** (18 compendium tables + 16 search RPCs on the
spell/sphere contract). Migrations now run through **0028**. Gating model **D1** (`lib/character/
threepp.ts` `enabledThreeppSystems`): 3pp rows appear in editor pickers + import matching ONLY when the
character's module is on; public `/compendium` keeps 3pp on separate Third-party browse pages; `other`/
`rune_magic` rows are browse-only forever. Each phase shipped after an adversarial Workflow review +
live browser verify; 731 unit tests. **Four new character SYSTEMS** un-gated in `IMPLEMENTED_MODULE_KEYS`,
each = engine `summary.<x>` gated by `isModuleKeyEnabled` → `gate("<key>")` view-model + privacy section →
own-file editor → dashboard card → import ClaimKind (module-off → features fallback, never drops):
- **Psionics** (ce6832c): PP pool/ML/powers/focus; `power-picker.tsx` (junction class-list); import
  detector w/ PSIONIC FEATS carve-out. **Path of War** (56885dc): initiators (IL = class + ⌊other/2⌋,
  IL→max-maneuver-level table, DC = 10 + `@{maneuverLevel}` + `@{initiationMod}`), maneuvers/stances w/
  lifecycle booleans, ACTIVE stances ingest automation like buffs, favored-weapon +2, `@{initiatorLevel}`
  resolver path; `readPowProgressionMaxes` reads all prod header shapes (bare "Stances", Mystic "N (M)"
  granted, prestige per-level-gain summing). **Akashic** (51f7fa6): essence INVESTED-not-spent pool,
  capacity cap 1/2/3/4 bands + `capacityBonus`→effectiveCap, per-veil DC w/ `@{essenceInvested}` local,
  singular/plural-tolerant bindValid, warn-only; `VeilPicker` PAGED full-table fetch (fixed a PostgREST
  1000-row SILENT TRUNCATION latent in maneuver/power pickers too → shared `lib/character/fetch-all-rows.ts`).
  **Oaths** (85536b0): oath-points budget (earned/spent/available, warn-only overspend); + **Drawbacks &
  Flaws** (gated Traits Browse → `traits.list` type-tagged, no schema change) + **Backgrounds &
  Occupations** (occupation "Bonus Feat: Choose X/Y" → one-click Add-feat).
- **Phase 7 Spheres depth** (d09c9fe): the feat/archetype/practitioner-trait picker unions already shipped
  in Phase 2b; added the 3pp class-options picker union + `/threepp-class-options` + `/threepp-traits`
  browse pages + hub cards, and merged `threepp_racial_trait_compendium` Spheres alt-racial-traits into
  the CORE-race picker (review caught the plural/singular race-name mismatch — core `race_compendium.name`
  is "Elves", 3pp keys to "Elf"; fixed via `.in("race", [plural, singular])`).
- **Phase 8** (3a7b730): consolidated detector coexistence sweep — audit found NO mis-routes; added
  `import-fixtures-e2e.test.ts` locking the full `classifyHeader` precedence matrix + Vehti/Anise
  multi-system detection fingerprints.
- **Data notes:** `rajah`-akashic + Rajah PoW progressions lost a header tier at scrape (degrade gracefully);
  `threepp_race_compendium` is akashic-only (Spheres alt-racial-traits key to CORE races, not 3pp races).
  **Real-device mobile pass is the one deferred Phase 9 item** — editors are mobile-first by construction
  (`grid-cols-1 lg:grid-cols-2`, 44px targets) but the dev browser clamps ~660px, so true <640px is
  class-guaranteed not pixel-verified. See [[pathforge-3pp-epic]].

**Collapsible list grouping (2026-07-03, `74c5fe2`).** Long spell/power/maneuver/talent lists now
collapse into accordion sections in BOTH the read view and the editor, mobile-first. Shared primitive
`components/character/collapsible-group.tsx` `<CollapsibleGroup>` (chevron + count-badge header, 44px
tap target, aria-expanded/controls; `COLLAPSE_WHEN_OVER = 12`) — extracted from the PoW `DisciplineGroup`.
Convention everywhere: a group's `defaultOpen = total <= COLLAPSE_WHEN_OVER` (short lists open, long lists
collapse to a scannable header index). **Spells** group by level (`spell-list-viewer.tsx` read +
`spellcasting-editor.tsx`; `lib/character/spell-groups.ts`; read view auto-expands groups with a search
match). **Psionic powers** by level (`psionic-power-list.tsx` read + `PsionicsEditor`). **Maneuvers** by
discipline (`maneuver-list.tsx` `DisciplineGroup` refactored onto the primitive + PoW editor). **Spheres**
by sphere + a Base/Advanced/Legendary tier subheader per sphere (only when a sphere spans >1 tier;
`character-dashboard.tsx` `SpheresCard` + `SpheresEditor`; `lib/character/sphere-talents.ts` from the
cached `talent.category`). Adversarial review caught + fixed one bug (3 editors, same cause): adding into a
>12-item list (all groups collapsed) dropped the new entry into a collapsed group and swallowed the
auto-open signal — fixed with a `forceOpen` escape hatch on `<CollapsibleGroup>` (render-phase
adjust-on-prop-change, the `EntryCard` idiom; preserves a manual collapse) + each editor force-opens the
group holding the just-added id. Live-verified all surfaces. **746 unit tests**; no schema/DB changes.

**Gestalt track-collapse fix (2026-07-07, `656f7f7`).** Owner-reported: clicking Recompute/rebuild on
saving throws for a two-class **gestalt** character (fractional irrelevant) "treats all levels as actual
class levels rather than A/B." Root cause (reproduced): under gestalt, class rows default to
`track: undefined` ⇒ treated as track A, so `recomputeClassDerived`'s `Math.max(trackA, trackB)` with an
empty track B just returns track A's **SUM** → character level 40 (not 20), BAB/saves/HP summed across both
class lines. The engine was already correct for distinct a/b tracks; the bug is the silent collapse when a
sheet's tracks were never split (every existing 2+ class char is `track: undefined` on all rows, so simply
enabling gestalt collapses). **Fix** (engine `packages/pathforge-schema` — `gestalt.ts` + `class-catalog.ts`
— + editor `character-editor.tsx`): `gestaltTracksCollapsed` (PRESET-AWARE via `gestaltLinkedTrackCounts`,
so a preset-less class parked on the otherwise-empty track can't mask a genuine two-preset sum) +
`splitGestaltTracks` (alternate a,b,a…) + `gestaltTrackClassCounts`; `recomputeClassDerived` now pushes a
collapse warning instead of silently summing. Editor: a reusable **`<GestaltCollapseBanner>`** (warning +
one-click **"Split into A / B"**, which also HEALS an auto-computed Max HP but leaves a hand-entered one
untouched) rendered on **Classes / Health / Optional-rules**; **enabling gestalt now AUTO-SPLITS** a
collapsed sheet (the dominant 2-class build lands correct by default); the Health "Apply to Max HP" is
disabled while collapsed; new Custom classes default onto the empty track. Shipped after a 13-agent
adversarial Workflow review — 6 confirmed findings (the dominant: the gestalt toggle in the Optional-rules
panel collapsed silently with its only warning on an unmounted section; also the preset-less mask, the
Health inflated-write, stale HP after split, and the hard-coded "track A" copy) — all fixed + each locked by
a test. **760 unit tests**; no schema/DB migration (additive/Zod-only). See [[pathforge-gestalt-collapse]].

**Authed-nav performance pass (2026-07-08, migration `0029`).** Owner-reported 1-2s per page swap in the
authed shell on PROD (not local dev). A grounded 5-agent Workflow audit (measured against prod) found the
cost is **round-trip COUNT × cross-region latency, made fully visible by missing loading states** — NOT
bandwidth or DB (browse queries 7-12ms, counts <1ms, `computeCharacter` 0.16ms). Vercel functions ran in
**iad1 (Virginia)** while Supabase is **us-west-2 (Oregon)**; `proxy.ts` called `supabase.auth.getUser()` (a
GoTrue NETWORK call) on every request incl. RSC nav/prefetch, and `requireUser()` pages hit it again
(React `cache()` can't span the middleware vs render invocation) → 1-2 serial cross-country auth RTTs per
swap; and 33/36 `(app)` routes had no `loading.tsx`, so the OLD page stayed frozen for the whole render.
Fixes (gate-green: lint/typecheck/**760 tests**/prod build; getClaims live-smoke-tested, no crashes):
(1) **`getUser()`→`getClaims()`** in `lib/supabase/middleware.ts` + `lib/auth/session.ts` — verifies the JWT
LOCALLY via the project's **ES256** signing key (JWKS cached module-globally), zero network per request;
getClaims still refreshes the session under the hood so cookie rotation is preserved. (2) **`app/(app)/
loading.tsx`** — one skeleton covers all 33 uncovered routes (instant paint + re-enables prefetch). (3)
**`experimental.staleTimes {dynamic:30,static:300}`** — instant re-visits from the Router Cache. (4)
**Compendium caching** — `lib/supabase/public.ts` cookie-free anon client + `unstable_cache` around browse
(1h) + `distinctValues` (24h) in `compendium-browser.tsx` (search stays live); anon read grants/policies +
RPC EXECUTE verified. Reseed → `revalidateTag("compendium")` or wait out the TTL. (5) Migration **0029** —
btree `name` indexes on 18 browse compendium tables (browse 4ms→0.16ms; applied to prod, advisors clean).
(6) Removed unused **`@tanstack/react-query`** (dead ~130KB gzip). (7) Compendium Prev/Next `<a>`→`<Link>`.
(8) **`vercel.json` `regions:["pdx1"]`** — co-locate functions with Supabase (Oregon), was iad1. Deferred:
editor bundle code-split (doesn't affect the swap symptom; core-dep-dominated; RSC-boundary risk). See
[[pathforge-nav-perf]]. **Migrations now run through `0029`.**

**Motion system — "lively & characterful" (2026-07-08, branch `feat/motion-system`).** Built right after
the perf pass ("now we can afford animations"). A cohesive, tokenized motion layer, gated by a user
preference with reduced-motion fallbacks, desktop/mobile-aware. No new deps; gate-green (lint/typecheck/
760 tests/prod build). See [[pathforge-motion-system]].
- **Preference system:** `data-motion` on `<html>` (`system` default / `full` / `off`) — SSR default +
  no-flash inline script (app/layout.tsx) + a 3-way toggle in Settings (`components/settings/
  motion-settings.tsx`, useSyncExternalStore, no global provider). CSS gates everything: OS
  `prefers-reduced-motion` collapses motion UNLESS `data-motion="full"`; `data-motion="off"` always
  collapses. All in `app/globals.css`.
- **Token layer (globals.css):** `--pf-dur*`/`--pf-ease*`/`--pf-stagger-step` + `@utility` primitives
  `pf-fade-in` / `pf-rise` / `pf-scale-in` / `pf-stagger` (auto-staggers first 12 children via nth-child +
  `--pf-i`) / `pf-hover-lift` (pointer-only `@media (hover:hover)`, gold-glow) / `pf-shimmer`.
- **Page transitions (Phase 1):** `<RouteTransition>` (`components/motion/route-transition.tsx`, keyed by
  usePathname) wraps the (app) + marketing layout children → each nav replays `.pf-route` (desktop
  rise+fade, mobile app-like slide via a custom-prop offset the media query swaps). **NOT the browser
  View Transitions API** — Next's `experimental.viewTransition` only wires it on the EXPERIMENTAL React
  runtime, and this app is on stable React 19.2.4 (verified `startViewTransition` never fires), so the
  flag was removed and the CSS keyed-remount approach used instead (robust, dep-free). Live-verified on
  public routes (desktop + mobile, gating, no overflow).
- **Applied (Phases 2-4):** stagger entrances on dashboard / characters / campaigns / compendium lists;
  hover-lift on the clickable list cards; global button press (`active:scale-[0.97]` + `transition` in
  `components/ui/button.tsx`, live-verified); `<Skeleton>` → shimmer; character-dashboard sections cascade
  in (`pf-stagger` on the top container).
- **Gotcha locked:** Tailwind v4 / Lightning CSS DROPS `@keyframes` defined inside `@media` (silently) —
  use one keyframe reading CSS custom props the media query swaps, never a media-nested `@keyframes`.
- **Deferred/needs owner eyes:** the authed-page FEEL (entrances/hover/sheet reveal) couldn't be
  browser-verified without a session — primitives verified to compile+apply + gate-green, but the taste
  wants a real look. Marketing feature-card stagger/hover-lift is an easy verifiable follow-up.

**S6 UX overhaul — ALL FOUR PILLARS COMPLETE (2026-07-09, 12 commits de9cb67…89d0d0c).** Plan:
`docs/S6_UX_OVERHAUL/` (locked handoff). Every slice gate-green + adversarially Workflow-reviewed
(~7 panels, every confirmed finding fixed); 803→867 unit tests; NO DB migrations (all additive/Zod).
- **P1 Companion sheets** (`de9cb67`/`68e01cf`/`057acba`): `CompanionSheet` read view + 3-way
  `SheetViewSwitch` (server-computed default; `isCompanion` derives from the GATED vm — raw-sheet
  reads leaked "is a companion" through the pill on privacy-hidden shares); the companion Simple
  EDITOR layout (`EditLayout` 3-way, ClassicZone stacks, conflict-locked Advanced escape hatches);
  the **Motion bridge** (motion@12.42.2, `components/motion/` useShouldAnimate/PfMotionConfig/tokens).
  TWO VERIFIED MOTION GOTCHAS (in ANIMATION_SYSTEM.md): AnimatePresence EXITING children have FROZEN
  props (interactive content = enter-only animation), and `reducedMotion="always"` does NOT gate
  opacity (per-component useShouldAnimate branch required).
- **P2 Modern editor** (`d5e034f`/`abd3590`/`8ffb499`): Stage 0 pure-move extraction (7,236→5,372
  lines; 8 optional-system editors to own files); Stage 1 `<EditorCanvas>` (entrance only on panel
  CHANGE — never first mount: no SSR opacity:0, no nav-restore double-play); Stage 2 chip-summary
  canvas (`section-summary.tsx`; every section a live StatChip card, expand-in-place, LayoutGroup +
  `layoutDependency` so keystrokes don't re-measure; jumpToSection focuses+scrolls the panel; W&V
  HP fork + total-gp wealth). **Stage 3's fixed bottom command bar SUPERSEDED by ground truth** (the
  app-level `MobileBottomNav` already owns bottom-0; the Stage-2 stack IS the mobile section index) —
  swipe gestures + shared-element layoutId FLIP deferred (need device/session eyes).
- **P3 Create-a-character wizard** (`b42b029`/`89c7961`/`809902f`): `metadata.custom.wizard` flag
  (`packages/pathforge-schema/src/wizard.ts`), `/characters/new` Guided-vs-Blank, 8 real steps over
  ONE `useCharacterEditor` (hand-off = navigation), engine-predicate Next-gates with VISIBLE hints
  (a `title` on a disabled button is unreachable everywhere), conflict HOLDS exit-navigation,
  exit waits for status "saved"/"offline" (plain router.push drops the debounced flag flip).
  GOTCHAS: point-buy seeds `racial[]` from `identity.raceApplied.abilityMods` (race step runs first
  and bakes mods into score — recomposes erased them); never force-re-enable a disabled point-buy;
  `SaveStatusBadge` lives in its own file (importing from character-editor.tsx drags ~1.2MB).
- **P4 Viewers design language** (`fff6133`/`89d0d0c`): shared `stat-tile.tsx`/`section-card.tsx`
  (accent/className)/`severity-pill.tsx` (byte-identical extraction commit, then restyle);
  `ShareHero` on `/c/[publicSlug]` (+#full-sheet anchor CTAs), AuditReport severity strip + GM
  status pills, Combat-only accent bar, CONDITIONAL hover-lift (only when the owner-only master
  link renders). Privacy+RSC review angles clean.
- **Owner checklist (no local session — authed surfaces are jsdom-verified only):** companion
  read+edit feel · editor canvas animations under the 3 data-motion states · full wizard run on
  desktop + phone · share hero on a real slug · GM audit pills · rule on the superseded mobile
  command bar + deferred FLIP/swipe.

**S6 follow-ups + wizard v2 + ITEMS OVERHAUL framework (2026-07-10 → 07-11, 5 commits
`3a437f1`…`725c17c`, all pushed).** Owner-driven session; every slice gate-green + adversarially
reviewed; 903→950 unit tests; NO DB migrations.
- **Owner-quirk fixes** (`3a437f1`): the Modern editor's sub-tab tablist moved INTO the active
  card's header (top-pinned it sat ~10 cards from a low section; heading = the ITEM label); the
  companion editor gained a **statblock picker** (`companion-statblock-picker.tsx` + unified
  `lib/character/companion-statblock.ts` apply, createCompanionAction refactored onto it) — for
  creature companions the statblock IS the "race" (cohorts keep the PC race picker). Patterns:
  `applyCompanionStatblock` stamps `raceApplied {name, abilityMods:{}}` (kills the "race not
  applied" false-nag + stale PC-race revert corruption); additive `companion.statblockName`;
  companion-sync helpers idempotent-by-replacement via `cstat_` id prefixes.
- **Wizard v2** (`a43bf57`): Systems step (optional-rule toggles; gestalt auto-split WITH HP heal),
  PB budget presets 10/15/20/25 + sticky Custom (5-60) + unspent nudge, owner step order
  welcome→systems→abilities→race→class→skills→feats→hp→gear→details→done (abilities-before-race
  rides RacePicker's pb.racial mirror), Feats&Traits + HP steps, class-step archetypes + gestalt
  hints. **`resumeStepFor` + wizardMeta `order` stamp — any future step reorder MUST bump
  WIZARD_ORDER_VERSION or old checkpoints silently skip inserted steps forever.**
- **Items Overhaul Stages 1-3** (`53202a4`/`c7352e4`/`725c17c`; plan `docs/ITEMS_OVERHAUL/`):
  slot schema (13 equip + 11 tattoo slots, FREE STRINGS — an auraStrength enum failed the whole
  document parse on "Faint"; compendium-alignment fields compendiumId/weaponGroup/armorType),
  always-on warn-only `summary.equipmentSlots` (quantity-aware; shields cost a hand, buckler
  name-heuristic exception), §15-gated read-view paper-doll (`slot-doll.tsx`; wondrous via explicit
  allowlist NOT spread — spreads skip TS excess-property checks), EntryCard inventory editor with
  slot/tattoo/wondrous disclosures + LIVE `pf:weapon:<id>` "Linked attack ⚡" chips (the sync
  already existed — badge not button; all 4 states honest) + gated doll mirror + handsAvailable.
  GOTCHA: `<details open={derived}>` is CONTROLLED — only ever force-OPEN (EntryCard idiom).
  **Stage 4 (magic-item compendium) is DATA-BLOCKED on the owner's dataset — the biggest yet;
  schema fields are shaped and waiting.**

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
