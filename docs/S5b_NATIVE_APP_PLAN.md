<!-- Generated 2026-06-27 via a 7-agent design fan-out grounded in the codebase, then synthesized. A design starting point, not a final spec. -->

# S5b — Native Apps + Real-Time Sync & Conflict Handling (Design)

PathForge's game logic already lives in four pure, dependency-light `@pathforge/*` workspace packages (Zod schema, no-eval rules engine, importers, exporters) that import no UI, server, React, or DOM code — so the hard part of a Pathfinder app is already portable to native with effectively zero changes. This document specifies S5b: ship native Android + iPhone apps from one Expo/React Native codebase that reuses that core verbatim, layer a local-first sync engine over Supabase, and replace today's silent last-write-wins autosave with a deterministic, privacy-aware conflict-resolution model. The central insight: the only genuinely hard problem is concurrency — `saveCharacterSheetAction` currently does an unconditional whole-`sheet_data` JSONB overwrite with no version guard — so the plan front-loads all conflict risk into a web-only spike and three web-only phases that fix a real existing bug before any app-store exposure.

## Recommended architecture at a glance

- **Shared core, no fork.** Keep the single pnpm workspace. The native app is a second consumer of `@pathforge/schema`, `@pathforge/rules-pf1e`, `@pathforge/importers`, `@pathforge/exporters` via `workspace:*` — never reimplement game logic in Swift/Kotlin. Promote the pure `lib/character/{view-model,diff}.ts` into a shared package so native renders and merges identically to web.
- **Expo (managed) + React Native**, one TypeScript codebase for iOS + Android, on the Expo SDK that ships React 19 to match the web app. EAS Build/Submit/Update for cloud builds and OTA JS pushes. expo-router mirrors the existing App Router tree.
- **Local-first store.** expo-sqlite as the durable on-device document + spell cache; react-native-mmkv for hot state (live draft, outbox, prefs). `@supabase/supabase-js` with `expo-secure-store` token storage and a deep-link PKCE OAuth flow — `@supabase/ssr` is web-only and must not enter the native bundle.
- **Sync transport.** A durable, idempotent mutation **outbox** flushed against an optimistic-concurrency `version` guard, plus Supabase **Realtime** — `postgres_changes`/patch-row notifications for the truth channel, Broadcast for ephemeral co-edit hints, Presence for "who's editing."
- **Conflict strategy: optimistic-concurrency gate + deterministic, id-aware, source-only structural 3-way merge**, escalating to a small per-field "keep mine / keep theirs / merge" UI **only** on true same-field divergence. Explicitly **not** a whole-document CRDT/OT — that would upend the canonical "one Zod-validated JSON document" the entire codebase depends on. Snapshot the pre-merge remote state on every merge so loss is structurally impossible. The same merge doubles as the offline-sync reconciler.

---

## 1. Shared logic core (code reuse across web + native)

### What the codebase already gives us (verified by reading)

The four `@pathforge/*` packages are already the "headless core" S5b needs. Every manifest and source tree was grepped for platform leaks; the situation is better than the spec implies:

| Package | Runtime deps (manifest) | Platform leaks found in `src/**` | Verdict |
|---|---|---|---|
| `@pathforge/schema` | `zod` only | one: `globalThis.crypto?.randomUUID?.()` in `class-catalog.ts:242`, **already guarded** with a `Math.random()` fallback | Portable as-is |
| `@pathforge/rules-pf1e` | `@pathforge/schema` only | none (no-eval formula engine — `formula.test.ts:89` even asserts `parse("globalThis.foo")` throws) | Portable as-is |
| `@pathforge/exporters` | `@pathforge/schema` only | none | Portable as-is |
| `@pathforge/importers` | `@pathforge/schema` + **`pdf-lib`** | one: `fillable-pdf.ts:52` uses `atob` with a `Buffer.from(...,'base64')` fallback | Portable, with a PDF caveat (below) |

No package imports `next`, `react`, `fs`, `node:*`, `window`, or `document` in shipped code. The only `fs`/`process.cwd()` hits are in `*.test.ts` fixtures — test-only, never bundled. Every package is `"type": "module"`, ESM, `main`/`types` → `./src/index.ts` (raw TS, no build step), `target: ES2022`. The schema package's own header comment already states the intent: *"Designed to be reused by the web app and future native apps without pulling in any UI or server code."* **Honor that; do not fork the game logic.** A second copy of `computeCharacter` is how the web and native sheets silently diverge.

### One pnpm workspace, Expo as a second consumer

**Keep the single pnpm workspace.** Do **not** split into a separate repo or a separately-published npm package. The packages are private and consumed via `workspace:*`; that already works for the Next app and works identically for an Expo app added as another workspace member. A polyrepo would force a version-publish of the core on every rules tweak and reintroduce the drift we're trying to avoid.

**Use managed Expo (React Native)** for both Android and iPhone from one TypeScript codebase. The decisive factor for THIS code: the core is pure TS + Zod + (one) `pdf-lib`, which Hermes runs. The alternative — two native codebases (Kotlin/Swift) — would require *reimplementing the no-eval formula engine and stacking rules twice*, violating the "don't rewrite game logic" mandate.

### The clean line: "shared core" vs "platform shells"

Everything that is **pure data + math + adapters** is shared core and lives in `packages/`. Everything that **talks to a screen, the OS, the network, or secret storage** is a platform shell.

**Shared core (in `packages/`, imported by both shells — no changes needed to move to native):**
- `@pathforge/schema` — the one versioned JSONB document (`character.ts`), `createDefaultCharacter`, `parseCharacter`/`safeParseCharacter`, `class-catalog`, `spell-tables`, `optional-rules`, buff templates.
- `@pathforge/rules-pf1e` — `computeCharacter`, the formula engine, stacking, point-buy, buff deltas.
- `@pathforge/importers` / `@pathforge/exporters` — the adapter pipelines.
- **Newly extracted:** the pure parts of `lib/character/` — `buildCharacterViewModel` (§15 privacy gate), `diffCharacters` (privacy-aware diff), and `api-shapes.ts`. These import only the three pure packages, never `next/*`/`server-only`/React, and must move into a shared package (call it `@pathforge/view`) so native renders, diffs, and merges **identically** to web. This is non-negotiable for the privacy guarantee — the §15 gate must never be re-implemented client-side.

**Platform shells (web = the existing Next `app/`; native = new `apps/native/`):**
- UI (`components/`, RN screens), navigation, theming.
- **Supabase access.** `lib/supabase/client.ts` builds a *browser* client via `@supabase/ssr`; `server.ts`/`admin.ts` are server-only. None of that is reusable in RN. Native uses plain `@supabase/supabase-js` `createClient` with `expo-secure-store`/AsyncStorage as the auth storage adapter and `detectSessionInUrl:false`. **`@supabase/ssr` must not be imported in the native shell.**
- The autosave/persist path. `saveCharacterSheetAction` is a Next **Server Action** — not callable from RN. Native re-issues the same write through an RPC, but the **validation/recompute** half (`parseCharacter` + `computeCharacter`) comes from the shared core, so the native write path reuses the exact same guards.

Keep the dependency arrow one-way: **shells → core, never core → shells.**

### Metro/Expo config: two concrete tasks, not a research project

The packages export **raw `.ts`** and are symlinked via pnpm. Two things Metro needs that Next/Turbopack handle for free:

1. **Transpile the workspace packages.** Metro doesn't transpile `node_modules` by default and the core ships TS source, so `apps/native/metro.config.js` must: set `watchFolders` to include the repo root + `packages/`, enable `resolver.unstable_enableSymlinks = true`, add `resolver.nodeModulesPaths` for the root `node_modules`, and ensure `'ts'`/`'tsx'` are in `resolver.sourceExts` with `babel-preset-expo` compiling them. This is standard Expo-monorepo wiring (`@expo/metro-config`).

   > Tooling note: pnpm + Metro needs `unstable_enableSymlinks` (and may want `nodeLinker: node-modules` / hoisting) because Metro can't resolve pnpm's nested symlinks by default. Budget roughly half a day for the resolver setup; it is a known, solved problem.

2. **Keep shipping `src`, no `dist` build, no project references.** Today the root `tsconfig.json` resolves `@pathforge/*` via **path aliases to `src/index.ts`** with `noEmit:true` — nothing is built. Keep that model: both Turbopack and Metro compile the TS source directly. Adding a `tsup`/`tsc` `dist` build would add build-ordering burden and a `dist`/`src` drift surface for no benefit. Hoist the `@pathforge/*` `paths` block into `tsconfig.base.json` so both `apps/web/tsconfig.json` and `apps/native/tsconfig.json` extend it and resolve the core identically; native adds `jsx: react-jsx` + the Expo TS base. `pnpm -r typecheck` continues to fan out across packages and both shells.

### The thin platform-abstraction layer (mostly already implicit)

Because the core is so clean, very little abstraction is needed — and the code already half-solves two of three seams:

1. **ID generation (already guarded).** `class-catalog.ts:242` already does `globalThis.crypto?.randomUUID?.() ?? Math.random()…`. Hermes lacks `crypto.randomUUID`, so the fallback fires — functional but lower-entropy. Fix in the **native shell** by polyfilling `globalThis.crypto.getRandomValues`/`randomUUID` via `react-native-get-random-values` + `expo-crypto` at app entry, **before** importing the core. **No core change required.**

2. **Base64 / binary for PDF import (already guarded, plus a `pdf-lib` caveat).** `fillable-pdf.ts:52` already falls back from `atob` to `Buffer`. RN's Hermes has neither by default, so the native entry must polyfill one before the core runs — **no core change**. Separately, `pdf-lib` is the one heavyweight dep; **lazy-import the `fillable-pdf` adapter** (dynamic `import()` inside the import flow) so it doesn't bloat startup, and treat PDF import as "nice to have" on mobile for v1.

3. **Crypto for API-key hashing — keep it OUT of the core.** API keys are minted/hashed server-side in `lib/api/*`, not in any `@pathforge/*` package. There is **no crypto hashing in the shared core to port**; native authenticates with the user's Supabase session, never hashing keys locally. Flagged explicitly so we don't invent a `crypto` abstraction the core doesn't need.

The one genuinely new interface is **persistence/network**, and it belongs to the shells, not the core: a small `CharacterGateway`/`CharacterStore` (load by id, save sheet, subscribe to changes), implemented twice — web (Server Action + `@supabase/ssr`) and native (`@supabase/supabase-js` + Realtime). The core never imports it; shells inject already-validated `PathForgeCharacterV1` documents into `computeCharacter`.

### Target folder layout

Promote the implicit `app = web shell` into an explicit `apps/` tier so the two shells are peers over a shared `packages/` core:

```
PathForge/
├─ pnpm-workspace.yaml        # packages: ["packages/*", "apps/*"]
├─ tsconfig.base.json         # shared compilerOptions + @pathforge/* path aliases
│
├─ packages/                  # ── SHARED CORE (pure: no DOM/Next/server) ──
│  ├─ pathforge-schema/       # zod canonical doc + factory/validate/catalogs
│  ├─ pathforge-rules-pf1e/   # computeCharacter + no-eval formula engine
│  ├─ pathforge-importers/    # adapters (pdf-lib lazy-loaded by shells)
│  ├─ pathforge-exporters/    # adapters
│  └─ pathforge-view/         # NEW: buildCharacterViewModel + diffCharacters +
│                             #   api-shapes + merge.ts + sync engine (all pure)
├─ apps/
│  ├─ web/                    # the existing Next app (moved here when convenient)
│  └─ native/                 # NEW — Expo (Android + iOS), one RN codebase
│     ├─ app/                 #   expo-router screens
│     ├─ src/supabase/        #   @supabase/supabase-js + secure-store adapter
│     ├─ src/gateway/         #   native CharacterGateway (Realtime + RLS update)
│     ├─ src/store/           #   sqlite + mmkv draft + outbox + debounced autosave
│     ├─ src/polyfills.ts     #   crypto.getRandomValues + atob/Buffer, imported FIRST
│     ├─ metro.config.js · babel.config.js · app.json · package.json
│
└─ supabase/migrations/       # 0001–0015 unchanged; S5b adds 0016+
```

**Minimal-churn path:** for the de-risking spike, keep the Next app at the repo root exactly as-is and add only `apps/native/` (workspace glob `["packages/*", "apps/native"]`). This avoids touching every `@/…` import and the Vercel build config now. Then promote web into `apps/web/` as a separate, mechanical PR once native is proven. Either way, **`packages/` does not move and does not change.**

**Bottom line:** the game logic is already a clean, dependency-light, platform-free core. S5b's "shared core" work is ~90% configuration (Expo/Metro monorepo wiring + two tiny entry-point polyfills the core's *existing guards* already anticipate) and ~10% extracting `lib/character/{view-model,diff}` into a package + defining a persistence/sync gateway interface that lives in the shells, not the core.

---

## 2. Native app architecture (Expo, navigation, local store, parity)

### Managed Expo, not bare React Native — and it's not close

| Concern | Managed Expo (recommended) | Bare RN |
|---|---|---|
| **OTA updates** (an explicit S5b requirement) | `expo-updates` / EAS Update ships JS-only fixes without an App Store round-trip | You wire CodePush/expo-updates yourself |
| iOS+Android builds without local toolchain churn | EAS Build (cloud) | You own the native toolchains |
| Native modules needed here (SQLite, MMKV, secure-store, notifications, deep links) | First-party / well-maintained Expo modules + config plugins | Manual `pod install` / Gradle edits |
| Solo/small-team maintenance burden | Low | High |

The classic reason to go bare — a native module Expo can't express — does not apply: every capability S5b wants (encrypted token storage, SQLite, MMKV, push, share sheet, widgets) is covered by Expo's config-plugin system or the `expo prebuild` escape hatch. **Use managed Expo with EAS Build + EAS Update.** Pin to the Expo SDK shipping **React 19 + the New Architecture** so the native React major matches the web app (`react@19` in `package.json`), keeping the shared pure packages on one React/TS version and avoiding a dual peer-dep tree.

### Navigation: expo-router mirroring the App Router

expo-router (file-based, built on React Navigation) deliberately mirrors Next's App Router, so the route tree maps almost 1:1:

| Web route (App Router) | Native route (expo-router) |
|---|---|
| `app/(app)/dashboard/page.tsx` | `app/(app)/dashboard.tsx` |
| `app/(app)/characters/page.tsx` | `app/(app)/characters/index.tsx` |
| `app/(app)/characters/[characterId]/page.tsx` (read view) | `app/(app)/characters/[characterId]/index.tsx` |
| `app/(app)/characters/[characterId]/edit/page.tsx` | `app/(app)/characters/[characterId]/edit.tsx` (tabbed) |
| `app/(app)/spells/page.tsx` | `app/(app)/spells.tsx` |
| `app/(app)/campaigns/[campaignId]/page.tsx` | `app/(app)/campaigns/[campaignId]/index.tsx` |
| `app/c/[publicSlug]/page.tsx` (public share) | deep-link target → `app/c/[publicSlug].tsx` |
| `app/(auth)/login`, `signup`, `auth/callback` | `app/(auth)/login.tsx`, OAuth via deep link |

Use a **bottom tab navigator** for the top-level authenticated shell (Dashboard / Characters / Campaigns / Spells / Settings), replacing the web's S5a drawer with the platform-native pattern. The multi-tab character editor maps to a **top tab bar / segmented control** *inside* the edit screen, matching the web's "Sheet Sections" sidebar (Core/Defenses/Attacks/Abilities/Skills/Spells/Equipment/Buffs/Story/Settings).

### Offline-first local persistence: MMKV for hot state + expo-sqlite for the document store

This is the most consequential local decision, evaluated against what's actually stored: **one self-contained JSONB document per character** (`characters.sheet_data`, validated by `parseCharacter`), plus small lists and a spell-search cache. The character is *not* relational on the client — the whole document is read, mutated in a draft, recomputed, and written back as a unit (exactly how `useCharacterEditor` + `saveCharacterSheetAction` work today).

| Option | Fit for this app |
|---|---|
| **MMKV** (`react-native-mmkv`) | Synchronous, very fast key-value, hardware-encryption support. Perfect for the active draft, last-saved snapshot, the sync outbox, and UI prefs. Synchronous reads = no flash-of-empty on the editor. **Not** a query store. |
| **expo-sqlite** | First-party, stable, transactional. Ideal as the durable store for the character list + per-character document rows (`id`, `sheet_data` JSON text, `updated_at`, `server_version`, `dirty`, `base_snapshot` for 3-way merge) + the spell-compendium cache. Queryable for the dashboard without loading every full document. |
| **WatermelonDB** | A reactive ORM for **large relational** datasets with row-level sync. Massive overkill — the model is "one JSON blob per character," and its sync engine assumes row-level deltas while our writes are whole-document. **Reject.** |
| **op-sqlite** | Faster JSI SQLite; a reasonable drop-in upgrade if the spell cache (~3,034 rows) or import parsing ever needs heavy queries. **Defer** until profiling shows expo-sqlite is the bottleneck. |

**Recommendation: MMKV + expo-sqlite, layered.** expo-sqlite is the durable on-device source of truth (a `characters` table holding `sheet_data` JSON text, `computed_summary`, `server_version`, `dirty`, and the `base_snapshot` for merge; a `spell_cache` table). MMKV holds hot/ephemeral state (the live editor draft, the pending-write **outbox**, theme/density prefs, the undo stack — the web caps at `MAX_UNDO = 50`). The editor flow ports cleanly: load the document row from SQLite → hold a draft in MMKV/React state → recompute live with `computeCharacter` (pure, on-device, no network) → debounced write to SQLite + mark `dirty` → background sync pushes to Supabase. This is the native analogue of the existing ~900 ms debounce in `use-character-editor.ts`.

### Supabase auth on native

The web app uses `@supabase/ssr` cookie sessions (`lib/supabase/server.ts`, `client.ts`). **None of that applies on native** — there are no cookies. Use **`@supabase/supabase-js` directly** with a custom storage adapter:

- **Token storage:** `auth.storage` backed by **`expo-secure-store`** (Keychain on iOS, Keystore-backed EncryptedSharedPreferences on Android). The refresh token is a long-lived credential and must not sit in plain AsyncStorage/MMKV. Set `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`.
- **OAuth (Google/Discord SSO):** the web flow uses `app/(auth)/auth/callback/route.ts` → `exchangeCodeForSession(code)`. Native replaces this with **`expo-auth-session` / `expo-web-browser`** opening the Supabase OAuth URL via a **PKCE deep link** (`pathforge://auth/callback`) carrying the `code`, exchanged with the same `exchangeCodeForSession`. Register the redirect in Supabase Auth + the app scheme. Email/password and magic-link work directly through `supabase.auth`.
- **Session refresh:** wire `AppState` (active/background) to `supabase.auth.startAutoRefresh()/stopAutoRefresh()` so tokens refresh on resume — the documented Expo pattern.
- **RLS is unchanged.** Native calls hit Supabase as the authenticated user; the existing policies (`characters_select` / `characters_update_editor` via `can_view_character` / `can_edit_character`) govern native reads/writes exactly as they govern web. The "GM cannot edit a player's sheet" guarantee remains structural — no native code path can bypass it.

### Feature-parity map (v1 vs later)

**v1 (ship first) — make a player's own character fully usable at the table:**
- **Auth** — email/password + Google/Discord SSO (deep-link OAuth).
- **Dashboard** + **Characters list** — read from SQLite cache, sync in background.
- **Character read view** (`/characters/[id]`) — render `buildCharacterViewModel` with `viewer="owner"`; the most-used at-the-table screen, reusing the exact web view-model.
- **The multi-tab editor** — the core value prop. All current tabs (Identity, Abilities, Health, Saves, AC, Combat, Skills, Feats, Buffs, Spells, Inventory, Profile). Live recompute via `computeCharacter`. This is the bulk of the v1 build (reuse the field-coercion/clearable-draft behavior from `fields.tsx`).
- **Buff Center** — toggling buffs + live deltas is a core in-session action (`activeBuffDelta`, `detectStackingConflicts` already in the rules package).
- **Spells browser** — backed by `search_spell_compendium`, plus an offline SQLite cache of the player's known/prepared spells.
- **Public share view** (`/c/[slug]`) as a deep-link target.
- **Offline read + edit + background sync** (the headline S5b feature).

**Later (v1.x / v2):** Campaigns dashboard + roster (read-only first); GM Audit View (desk-heavy, low phone priority); Imports (`expo-document-picker` → server-only parse path); Exports (pairs with the native share sheet); History/snapshots/diff; Settings → API keys.

### Native-only opportunities (high ROI, hard/impossible on web)

- **Dice roller** — a first-class screen + a quick-roll affordance on the read view (tap a save/attack to roll d20+mod). Pure on-device, `expo-haptics` + a roll-history log in SQLite, trivially built on the already-computed `vm.vitals`/`vm.attacks`. The single biggest "why install the app" differentiator and a strong **first-submission native-only feature** (avoids App Store thin-wrapper rejection).
- **Push notifications for GM reviews** (`expo-notifications`) — notify a player on approve / changes-requested (`campaign_characters.gm_review_status` transitions) and a GM when a character enters the review queue. Backend: a Supabase **Edge Function** on `gm_reviews` / `campaign_characters` changes sending to Expo Push tokens stored per device. Privacy-respecting: a GM-only note never pushes to players.
- **Share sheet** (`expo-sharing`) — share a `/c/[slug]` link or exported JSON to Discord/Messages.
- **Home-screen widget** — a character card (HP/AC/saves from `computed_summary`) using the `discordCard`/`characterSummary` shapes already in `api-shapes.ts`. Requires a little Swift (WidgetKit) + Kotlin (Glance) via a config plugin; scope as v2 polish.

### Platform specifics

- **Deep links / Universal Links:** register `pathforge://` + the iOS `apple-app-site-association` and Android `assetlinks.json` for the production domain so `https://<domain>/c/{slug}` opens in-app and the OAuth callback resolves. The Next app serves the AASA/assetlinks files from `public/`.
- **iOS App Store:** Apple Developer Program ($99/yr), App Store Connect listing, privacy nutrition labels (declare account creation, no tracking), and **Sign in with Apple is mandatory** if you offer Google/Discord sign-in — budget for adding the Apple provider to Supabase Auth. TestFlight for beta.
- **Google Play:** Play Console ($25 one-time), data-safety form, current `targetSdkVersion`, internal-testing track for beta.
- **EAS:** `eas build` / `eas submit` / `eas update` channels (preview/production). OTA ships JS/asset changes only — anything touching native modules still needs a store build.

---

## 3. Real-time sync engine (local-first write queue + Supabase Realtime)

### What today's code does, and why it can't be the native model

The web edit path is one client hook, `use-character-editor.ts`, feeding one server action, `saveCharacterSheetAction`:

- `useState<PathForgeCharacterV1>(draft)` → `useMemo(() => computeCharacter(draft))` recomputes on every keystroke.
- A ~900 ms `setTimeout` debounce serializes the **whole** `draft` and, if it differs from `lastSaved.current`, calls `saveCharacterSheetAction(characterId, draft)`.
- The action does `safeParseCharacter` → `computeCharacter` → a single `UPDATE public.characters SET sheet_data = <whole doc>, computed_summary = …, last_calculated_at = now() WHERE id = …` (RLS-gated), then best-effort flips `campaign_characters.gm_review_status` to `stale_after_changes` via the admin client.

Three properties matter:

1. **It is whole-document, last-write-wins.** The `UPDATE` replaces all of `sheet_data` with no precondition — two editors racing the debounce silently clobber each other.
2. **It assumes the network is up and synchronous.** On failure it sets `status: "error"` and stops — no retry, no queue, no persistence. The `beforeunload` guard doesn't survive the process kill that is normal on mobile.
3. **The transport is a Next Server Action over the cookie session.** Native has no Next server and no cookie jar; it holds a Supabase session and talks to PostgREST/Realtime via `supabase-js`. The action boundary cannot be the shared sync primitive.

The domain core, however, is already pure: `@pathforge/schema`, `@pathforge/rules-pf1e`, and `diffCharacters` have zero UI/server deps. The sync engine is **a new pure module in `@pathforge/view`** (driven by injected platform adapters: web IndexedDB + native SQLite), keeping "all game math in the rules package" intact and letting web and native share one tested state machine.

### Sync granularity: patches, not whole documents (the load-bearing decision)

| | Whole `sheet_data` doc (today) | **Patch / op stream (recommended)** |
|---|---|---|
| Concurrent edits | Last-write-wins; silent clobber | Per-field merge; only true same-field edits conflict |
| Offline replay | Replays a stale full doc → overwrites others' work | Replays only *my* field deltas onto latest server doc |
| Bandwidth | Re-sends ~50–200 KB sheet per debounce (bad on mobile data) | A few hundred bytes per change |
| Conflict facet | Has nothing to work with | Has exactly the per-field granularity it needs |

**Decision: field-level JSON-Pointer patches** as the sync unit, with the whole document as the durable *materialized* state. The schema is a deep but bounded object; most edits are scalar field writes or list add/remove, and JSON-Pointer (`/abilities/scores/str/base`, `/feats/list/3/name`) maps cleanly onto it. List items need **stable ids** to reconcile concurrent inserts (see §5 — this is the one schema change S5b requires).

> **Not a whole-document CRDT.** A PF1e sheet is a structured tree of typed fields, not collaborative prose. CRDTs add a large dependency, opaque last-writer-wins-per-register merge semantics, and a second source of truth competing with Zod. Use CRDT/text-merge semantics **only** for genuinely text-y fields (backstory, `notes.*`); everything else is per-field with explicit conflict detection — which is what players expect ("you changed Str, I changed Dex, both stick; we both changed max HP, surface it").

A patch carries `{ id (uuid, idempotency key), characterId, path (RFC6901), op (set|insert|remove|text), value?, baseVersion, lamport, deviceId, actorId, schemaVersion, createdAt }`. `applyPatch(doc, patch)` is pure; after applying, `safeParseCharacter` rejects an invalid patch locally before it ever leaves the device — the same validation gate the server uses.

### The local-first model (data flow)

```
┌─────────────────────────── one client (web OR native) ───────────────────────────┐
│  UI edit ─update─► draft ─computeCharacter()─► live values                         │
│            │ derive field-level patch(es)                                          │
│            ▼                                                                       │
│        OUTBOX (IndexedDB / SQLite)  status: pending|inflight|acked|conflict        │
│            │ flush loop (online, backoff)                                          │
│            ▼                                                                       │
│   apply_character_patches RPC ──────►  Supabase (Postgres + RLS)                   │
│            ▲  ack {version, applied[], rejected[]}                                 │
│  Realtime postgres_changes / broadcast ◄──────────────────────────────────────    │
│                                                                                   │
│  Durable local: serverDoc + serverVersion + outbox; localDoc = serverDoc ⊕ outbox │
└───────────────────────────────────────────────────────────────────────────────────┘
```

The durable local store per character holds `serverDoc` (last server-confirmed), `serverVersion`, the `outbox`, and a materialized `localDoc = serverDoc ⊕ outbox` the UI binds to. This is what makes the app correct offline. **Web store:** IndexedDB (the existing PWA service worker abstains from `/api`, so it won't fight this). **Native store:** SQLite. Both implement the same `SyncStore` interface so the engine is identical.

### How the autosave debounce evolves

The 900 ms timer does two jobs today — *coalescing* keystrokes and *triggering* the network write. **Split them:**

1. **Coalescing stays local and becomes patch generation.** A short (~400 ms) debounce per field, on settle, appends a patch to the durable outbox (survives a process kill). The outbox write is the new "save."
2. **The network flush decouples** into a background loop that drains the outbox whenever online, with exponential backoff + jitter. It is not tied to the debounce. The debounce can't "miss" a save because the durable record already exists.

The surfaced status becomes a superset of today's enum: `"synced"` (outbox empty, localDoc===serverDoc), `"queued"` (offline/waiting), `"syncing"` (flush in flight), `"conflict"` (server rejected a patch → handed to the conflict resolver), `"error"` (non-recoverable: RLS denied / schema drift / validation). The `beforeunload` guard is **downgraded to advisory** ("you have unsynced changes") since data is now durable; on native it's irrelevant.

### Transport: Supabase Realtime channel selection

One Realtime channel per character, `character:<id>`, carrying three mechanisms for three jobs:

- **`postgres_changes` (the truth channel)** — fires after a write commits and **respects RLS** (Supabase only delivers changes a subscriber may SELECT). To avoid streaming the full ~50–200 KB row per flush *and* to avoid leaking raw `sheet_data` to a viewer, subscribe to **`character_patches` INSERTs** (or a content-free version-bump notification) rather than the `characters` row, then pull deltas on demand.
- **Broadcast (ephemeral)** — optimistic "I just typed in `/abilities/scores/dex`" relays for live co-edit echo + cursor/field-focus highlights. Fire-and-forget, never authoritative until the patch-row ack confirms it.
- **Presence** — "who else is on this sheet" (`{actorId, displayName, viewer, editingPath}`), driving avatars, "GM is viewing," and **UX-layer soft-locks** (warn before two people edit the same list item) without a hard DB lock.

One channel keeps subscription count low and ordering simple.

### Server write path: a patch-apply RPC + a patches table

The primary write becomes a `SECURITY DEFINER` RPC **`apply_character_patches(p_character_id, p_base_version, p_patches)`** that, in one transaction: `SELECT … FOR UPDATE`s the row (serializing writers — no lost updates at the DB); re-checks the caller's permission against the same predicate RLS uses (owner OR editor/co_owner — **never** bypassing "GM cannot edit"); applies non-overlapping patches and returns overlapping ones as `rejected` with the current server value; bumps `version`, writes `sheet_data`/`computed_summary`, inserts each applied patch into `character_patches`, and returns `{ version, applied[], rejected[] }`. Because each patch id is the table PK, a retried flush is a no-op conflict → **at-least-once delivery with exactly-once effect**, which is what the offline outbox needs. `saveCharacterSheetAction` is retained as the full-document fallback (import-commit, "force overwrite") and gains the same `version` guard.

> **Reconciling the two server-side strategies.** Two facets independently proposed the write path: a **patch-stream RPC** (`apply_character_patches` + a `character_patches` log, this section) and a **whole-document version-gated CAS** that sends `{base, mine, baseVersion}` and runs a structural 3-way merge server-side (§5). **Recommendation: ship the version-gated whole-document CAS + 3-way merge first (it is the MVP, §6), and treat the patch-stream RPC as the v2 evolution for true live co-editing.** Rationale: the CAS path is a one-column migration plus reusing the merge module, keeps `saveCharacterSheetAction`'s existing validate→recompute→persist→stale-flip flow nearly intact, and needs **no** schema-wide id migration to ship. The patch-stream is strictly better for sub-second multi-cursor collaboration and mobile bandwidth, but it is a larger build (patches table, Realtime on patch rows, outbox rebasing) and depends on the array-id migration landing first. Both share the same merge logic and the same RPC permission re-check, so the v2 upgrade is additive, not a rewrite. The state machine, outbox, and failure-mode handling below apply to **both**; where they differ, the CAS path simply batches "all my pending changes" into one whole-document submission instead of N patches.

### The sync engine state machine (applies to both write paths)

```
COLD START: load durable {serverDoc, serverVersion, outbox}; open channel; presence join
   │
   ▼
RECONCILE ◄──────────────────────────────────────────────────────┐
   pull row (version V_srv); if unchanged → serverDoc stays       │
   else replay/rebase outbox onto V_srv, re-validate, route       │
   true conflicts to resolver; set serverDoc/serverVersion        │
   │ outbox empty            │ outbox non-empty                    │
   ▼                         ▼                                     │
 IDLE ◄── ack ──── FLUSHING ── rejected(conflict) ─► CONFLICT ─────┘ (resolve → enqueue
 (synced)         (syncing)  ── error(RLS/schema/validation) ─► ERROR   correcting patches)
   ▲ realtime patch from another client → apply to serverDoc, rebase outbox, recompute
OFFLINE → suspend flush; edits keep landing in outbox (queued).  ONLINE → always RECONCILE first.
```

Key transitions: a **local edit** derives a patch → optimistic `applyPatch(localDoc)` (instant) → durable outbox append → ephemeral broadcast → if online, kick FLUSHING (UI never waits on the network). A **flush** drains the outbox in `lamport` order against `base_version = serverVersion`; on ack it drops applied patches and advances `serverVersion`; on `rejected` it enters CONFLICT. An **inbound realtime patch** applies to `serverDoc`, **rebases the local outbox** onto the new base, re-validates, recomputes — the live-collab merge moment. **Reconnect / cold start always RECONCILE before flushing**, so an hour of offline edits replays onto the *current* server doc, not a stale base.

### Failure modes and exactly how each is handled

- **Offline:** flush suspends; edits land durably (`queued`); `localDoc` stays correct as `serverDoc ⊕ outbox`; reconnect → RECONCILE → FLUSH. This is the entire reason for the outbox.
- **Partial write / lost ack:** the RPC is transactional and patch ids are idempotency keys; a retried flush returns already-applied ids. No double-apply, no gap; patches leave the outbox only on a confirmed ack containing their id.
- **Concurrent edit / version mismatch:** detected via `FOR UPDATE` + `base_version` (patch path) or the `WHERE version = :expected` CAS (whole-doc path); non-overlapping changes auto-apply, overlapping ones return with `serverValue` → CONFLICT → resolver produces *correcting* writes through the normal flush. **No silent loss** — a rejected change is never dropped.
- **RLS rejection (GM or downgraded collaborator tries to write):** the RPC returns a structured `forbidden` reason, the engine quarantines the change to a `blocked` bucket, sets `status: error` ("you no longer have edit access"), rolls the optimistic apply back to `serverDoc`, and **does not** fall back to the admin client — preserving "GMs cannot edit canonical sheets" structurally.
- **Schema-version drift:** every patch carries `schemaVersion`; a mismatch is rejected with `schema_drift`. The client migrates its local doc via `@pathforge/schema`'s migration seam, re-derives outbox changes against the migrated doc, then resumes. (Semantic JSON-Pointer paths re-validate loudly rather than corrupting — a key reason patches are semantic, not opaque byte diffs.)
- **Invalid change:** caught **locally** by `safeParseCharacter` before queueing, so a bad client can't poison the queue; the RPC re-validates server-side as defense-in-depth.
- **Outbox poison / one stuck change:** independent paths can apply out of order; a repeatedly-failing change is quarantined to a dead-letter bucket and surfaced rather than blocking later good changes.
- **Stale-after-changes / snapshot side effects:** the `campaign_characters.gm_review_status = stale_after_changes` flip and `character_snapshots` creation move **server-side into the write RPC / a trigger**, so they fire regardless of which client (web or native) wrote — instead of living only in the web server action. `diffCharacters` is unchanged and still powers history/GM-compare.

### Where this leaves the existing code

`use-character-editor.ts` is refactored to delegate to a `useSyncedCharacter(characterId)` hook backed by the shared engine: the same `{ draft, computed, status, update, undo }` surface (so `character-editor.tsx` barely changes), but `update` emits to the outbox and `status` is the richer enum. Undo becomes "emit an inverse change" (durable + visible to collaborators) rather than an in-memory stack swap. `saveCharacterSheetAction` stays as the documented fallback. The engine is pure (consumes `@pathforge/schema` + `@pathforge/rules-pf1e`, no Supabase import — the client and the IndexedDB/SQLite stores are injected adapters), so the **same engine runs in the browser and in React Native** and is Vitest-testable like the other packages.

---

## 4. Concurrent-edit conflict handling (THE core requirement)

### The problem, precisely

`saveCharacterSheetAction` does `update({ sheet_data }).eq("id", characterId)` — an unconditional whole-document overwrite. There is **no `WHERE version = …`**, no version column, no merge. The client's only concurrency awareness is `lastSaved.current` (a stringify of the last *locally* saved draft), which knows nothing about another device. So today: desktop loads V0 and edits HP; phone loads V0 and edits Strength; phone autosaves (`V0 + str`); desktop autosaves 1 s later → DB becomes `V0 + hp`, **silently erasing Strength** with no warning, snapshot, or trace. This must not happen.

### Strategy comparison

| Option | Fit | Verdict |
|---|---|---|
| **(a) Optimistic concurrency (version/etag) + blanket conflict prompt** | Trivial (`updated_at` already exists), but the doc is coarse — any concurrent save forces a full "your copy is stale, reload?" prompt even for unrelated sections. | **Necessary as the *trigger*, insufficient as the *resolution*.** |
| **(b) Field/path LWW via per-path timestamps** | Auto-merges independent fields but needs a timestamp on every leaf (schema bloat) and **silently** clobbers same-field edits — the exact nightmare, finer-grained. | **No — silent loss is what we're eliminating.** |
| **(c) CRDT (Yjs/Automerge) over the whole doc** | Changes the source of truth from "one Zod-validated JSON document" to "a CRDT binary + a materialized view" that every server action, importer, exporter, the rules engine, the §15 view-model, and RLS would have to cross; and it still does last-writer-wins-per-register for scalars (Str 14 vs 16) — a silent winner, not a prompt. Huge dependency for near-zero benefit on character arithmetic. | **No, not for the canonical doc.** Reconsider only for free-text notes. |
| **(d) Operational transform** | OT shines for linear text with a central transformer; a structured typed tree is the wrong shape, high-effort, near-zero benefit over a structural 3-way merge. | **No.** |

### Recommendation: version-gated optimistic save + structural 3-way merge, escalating to a per-field UI only on true same-field divergence

This is (a) as the *gate* + a deterministic structural 3-way merge as the *resolver* + a conflict UI as the *escape hatch*. It auto-resolves the common case (different sections / different array items), never silently loses a same-field edit, requires **one migration and no rewrite of the document model**, and keeps `sheet_data` as plain validated JSON — so the rules engine, view-model, importers, exporters, and RLS are untouched. The merge runs **server-side** (authoritative, identical for web/native/API) with a thin client surface for the conflict UI.

### The data-model change (one migration: `0016`)

Add a monotonic integer version (cleaner than the clock-skew-prone `updated_at`) and bump it via a `BEFORE UPDATE` trigger keyed on `sheet_data is distinct from old.sheet_data` (so visibility/slug flips and `computed_summary`-only refreshes don't burn versions or trip OCC). The client holds the `sheet_version` it loaded as the **base version** and retains the **base sheet** (the last server-confirmed document) so it can supply *base, mine* to the merge while the server supplies *theirs*.

```sql
-- 0016_character_concurrency.sql
alter table public.characters
  add column if not exists sheet_version bigint not null default 1,
  add column if not exists last_editor_id uuid references public.profiles(id) on delete set null,
  add column if not exists last_saved_device text;

create or replace function public.bump_sheet_version()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.sheet_data is distinct from old.sheet_data then
    new.sheet_version := old.sheet_version + 1;
    new.last_editor_id := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists bump_sheet_version on public.characters;
create trigger bump_sheet_version before update on public.characters
  for each row execute function public.bump_sheet_version();
```

The trigger makes the increment atomic and unforgeable by a stale client. One caveat to verify against the existing `protect_character_owner` BEFORE-UPDATE trigger: Postgres fires same-event triggers in **alphabetical name order** (`bump_sheet_version` < `protect_character_owner`), each seeing the prior's mutated `NEW`; they touch disjoint columns so order is harmless — but name deliberately and comment it. Run `get_advisors` after the DDL; the new `SECURITY DEFINER` trigger fn needs no PostgREST EXECUTE, so `revoke execute … from anon, authenticated` to avoid a new advisor hit.

### The save protocol

`saveCharacterSheetAction(characterId, { base, draft, baseVersion })`:

1. **Validate** `draft` with `safeParseCharacter`.
2. **Read** current `{ sheet_data: theirs, sheet_version: currentVersion }` via the RLS client.
3. **Fast path:** if `currentVersion === baseVersion`, do a CAS update `.eq("sheet_version", baseVersion).select("sheet_version").single()`. The `.eq` makes it a compare-and-swap — a write sneaking in between read and write matches 0 rows and falls to step 4. On success, return the new version; the client sets `baseVersion = version`, `baseSheet = draft`.
4. **Concurrent write** (`currentVersion !== baseVersion`, or the CAS hit 0 rows): run `merge(base, mine, theirs)`. **Clean** → persist `merged` with a CAS on `currentVersion`, snapshot `theirs` first, return `{ ok, merged, version, autoMerged: true }`. **Conflicts** → do **not** write; return `{ ok: false, conflicts, theirs, base, version }` and open the conflict UI (nothing lost because nothing was written).
5. **Retry-once guard:** loop step 4 at most 2–3 times if a third write lands; otherwise surface the UI with the latest `theirs`.

This is the `0007` `RETURNING`-visibility gotcha but for UPDATE — safe because `characters_select` short-circuits on `owner_id = auth.uid()` (the `0007` fix), and the committed-row snapshot is visible to editor collaborators on UPDATE (unlike the not-yet-committed INSERT case). The 0-row CAS treated as "concurrent write" mirrors the `.select()`-verified-write pattern the M8 import-merge already uses, so a silent 0-row success is impossible.

### The 3-way merge algorithm (`merge.ts` in `@pathforge/view`)

`diffCharacters` is a **display** diff (privacy-gated, recomputes both sides, human labels) — the right *mental model* and the right tool for the conflict-UI presentation, but the merge itself needs a **structural, path-level, value-true** merge over raw JSON. Build it as a new pure module (no UI/server deps, unit-testable like schema/rules):

**Core rule:** at every leaf, compare *mine* and *theirs* against *base*; only one side changed → take it; both changed to the same value → take it; both changed differently → conflict.

```
mergeValue(base, mine, theirs):
  if deepEqual(mine, theirs):  return mine     // agree (incl. both unchanged)
  if deepEqual(mine, base):    return theirs    // only theirs changed
  if deepEqual(theirs, base):  return mine      // only mine changed
  if both plain objects:       recurse key-by-key (union of keys)
  if both arrays of {id}:       merge by id
  else:                         CONFLICT(path, base, mine, theirs)
```

- **Objects** recurse over the union of keys; an add (key absent in base) keeps it, a delete-vs-edit is itself a conflict (raise, don't drop).
- **Arrays — the critical part.** Every game-content array carries a stable `id` (this is the schema change in §5). **Merge by id, never by index** (index merge is what destroys data on concurrent insert/remove): add-vs-add keeps both, delete-vs-unchanged drops, delete-vs-edit conflicts, both-edited recurses. Preserve mine's ordering then append theirs-only adds; reorder-only never conflicts.
- **Primitive sets** (`languages.known`, `metadata.tags`) → set-union merge. **Free-text** (`notes.*`, descriptions, backstory) → single-leaf conflict in v1 (shown side-by-side, loser one-click-restorable); a scoped line-level `diff3` is the *only* place a CRDT-ish text merge earns its keep — defer it, don't let it block the structural merge.
- **Records/maps** (`abilities.custom`, `privacy.sections`, `formulas.overrides`, `spellsPerDay`) → recurse by key.

**Source vs. derived — only ever merge SOURCE.** The codebase makes this easy: derived numbers live in `computed_summary`/`computed_values`, produced by `computeCharacter` and written by the server, never sent up by the client merge — so a "conflict" there is impossible by construction, and the server **always recomputes** after merging. A small static **`DERIVED_PATHS` ignore-list** (e.g. `abilities.primary.*.score`, `identity.totalLevel`, cached spell-detail fields, auto spell slots) covers the few stored-but-recomputed fields: take *mine* unconditionally there (recompute overwrites it) and never raise a conflict. Merge the *source inputs* (`baseScore`, `pointBuy.allocations`, `classes[].level`, `casterType`) and let recompute settle the derived values.

### Conflict UX

The merge already auto-resolved everything resolvable, so the UI appears only for genuine same-field divergence — typically 1–3 fields:

1. **Non-blocking toast** on `autoMerged: true`: *"Merged changes from another device."* + Undo/Review (the pre-merge `theirs` was snapshotted, so Review is just a diff). No modal in the common case.
2. **Conflict modal** on `clean: false`: a per-field three-way table, each row labeled with the *human* label from `diff.ts`'s vocabulary ("abilities.primary.str.score" → **"Strength"**), with per-field Mine/Theirs radios, bulk *Keep all mine* / *Keep all theirs*, and a **Merge** option for text fields. Default to Theirs for purely-additive/remote-newer rows but always require explicit confirmation — never an auto-pick that destroys.
3. **Resolve** rebuilds the final sheet from the clean-merged base plus the user's picks, validates, and re-saves with the current `sheet_version` CAS; if another write landed during the modal, re-merge against the newest `theirs` and re-prompt only for *new* collisions (old picks remembered) — this converges.
4. **Realtime pre-emption (ties to §3):** subscribe to the row; on a remote version bump while editing, fetch `theirs`, merge in the background, and either silently apply a clean merge (with the quiet toast) or surface the modal *before* the next save — the difference between "no silent clobber" (met by the CAS gate alone) and "feels collaborative" (met by Realtime + background merge).

### How snapshots + the stale flag fit in

`character_snapshots` + `lib/actions/snapshots.ts` are the **safety net and audit trail** — reuse, don't reinvent. **Snapshot-before-overwrite:** any merge that discards remote bytes first inserts a `character_snapshots` row of `theirs` with `reason: "pre_merge"` (extending the existing free-text `reason`), via the admin client (like the approval-snapshot path) so it isn't blocked by who's saving. This makes the product owner's invariant *structurally unviolable*: even a buggy merge is recoverable. **Diff/history reuse:** `/characters/[id]/history` + `diffCharacters` already render snapshot diffs, so "Review" and "what changed" are just `diffCharacters(theirs, merged)` / `(base, merged)` — already privacy-aware. **Stale flag is orthogonal:** `gm_review_status = "stale_after_changes"` means "changed since GM approval," not "concurrent edit" — flip it on the *final* committed sheet exactly as a normal save does; never persist conflict state to campaign tables.

### Edge cases (all handled by the rules above)

Recompute-derived vs source (covered by `DERIVED_PATHS`); arrays by stable id (add/add keeps both, delete/untouched drops, delete/edit conflicts); primitive set-union; reorder-only never conflicts; empty/0-row CAS treated as concurrent write; and — critically — **the offline native app uses the identical server merge on reconnect against the now-newer `theirs`. The structural 3-way merge *is* the offline-sync reconciler** — one algorithm serves both concurrent-online and offline-then-sync, which is exactly why this beats a CRDT bolt-on for *this* codebase.

---

## 5. Backend + data-model changes for sync

This consolidates the Postgres/Supabase work. The MVP needs **one migration**; the patch-stream and realtime pieces are additive later migrations.

### 5.1 Concurrency columns — migration `0016` (MVP)

As specified in §4: `sheet_version bigint`, `last_editor_id uuid`, `last_saved_device text`, and the `bump_sheet_version` trigger. This is the single migration the MVP conflict handling requires. The guarded UPDATE in `saveCharacterSheetAction` becomes a `.eq("sheet_version", expectedVersion).select("id, sheet_version").maybeSingle()` CAS that **verifies the row count** — 0 rows = version mismatch **or** RLS denial, disambiguated by a follow-up read (visible row → version conflict; invisible → forbidden). `useCharacterEditor` threads `expectedVersion` from a ref alongside `lastSaved`, and `SaveSheetState` gains `conflict?`, `serverVersion?`, `version?`.

### 5.2 The required schema change: stable array ids

The id-aware array merge in §4 depends on every game-content array element having a stable id. **Audit finding to resolve in the spike:** the schema currently uses plain `z.string()` ids (via a `slugId` helper) on object arrays — confirm coverage across `feats.list`, `features.list`, `inventory.*`, `buffs.active`, `spellcasting.*` (casters / prepared / known), `resources.list`, `modifiers`, `automation`. Any array lacking an id gets an **additive, backward-compatible** id field (v1.1 schema): `createDefaultCharacter` and the importers backfill ids; `parseCharacter` tolerates absence and assigns on load; exporters round-trip it (they already preserve unmapped data). This is the one schema migration S5b requires, and it must land in Phase 1 before the merge can correctly handle concurrent list inserts.

### 5.3 Realtime enablement — migration `0017`

Add `public.characters` to the `supabase_realtime` publication with `replica identity full` (so UPDATE payloads carry old+new). Realtime respects RLS, so `characters_select` (`can_view_character`) already gates who receives changes.

**The one real privacy risk:** Realtime row payloads carry the **raw `sheet_data` column**, which does **not** pass through the §15 view-model. A *viewer*-role collaborator passes `can_view_character` and would receive sections the owner marked private. **Mitigation (recommended): only open `postgres_changes` on `characters` for the edit surface (owner/editor — full visibility is correct for them); for read-only viewers, push a content-free `{characterId, version}` Broadcast ping and have the viewer re-fetch through the normal RLS+view-model server path.** Document this in the view-model's privacy contract: *Realtime row payloads bypass §15; never wire a viewer-role client to `postgres_changes` on `characters`.*

Use one **private** Realtime channel per character (`character:<uuid>`) for presence + cursors + the version ping, authorized via a `realtime.messages` policy reusing `can_view_character`:

```sql
create policy "rt_character_presence" on realtime.messages for select to authenticated
  using (public.can_view_character(split_part(realtime.topic(), ':', 2)::uuid, (select auth.uid())));
```

(Presence reveals only "user X is viewing," not sheet content, so `can_view_character` is the right grain; both editors and viewers can see who's present.) Match the `0015` `(select auth.uid())` initplan convention for every new policy.

### 5.4 The patch log — migration `0018` (DEFERRED, v2 co-editing)

Only if true real-time co-editing is greenlit. A `character_patches` table (PK = `Patch.id` for idempotency; `character_id`, `actor_id`, `device_id`, `version`, `base_version`, `path`, `op`, `value jsonb`, `lamport`, `created_at`; indexed on `(character_id, version)`; added to `supabase_realtime`) plus the `apply_character_patches` RPC from §3. RLS **reuses the existing helpers verbatim** so "GM cannot edit" stays structural:

```sql
create policy "patches_select" on public.character_patches for select to authenticated
  using (public.can_view_character(character_id, (select auth.uid())));
create policy "patches_insert_editor" on public.character_patches for insert to authenticated
  with check (actor_id = (select auth.uid()) and public.can_edit_character(character_id, (select auth.uid())));
-- no client UPDATE/DELETE; the RPC folds patches; prune applied rows via the 0012 opportunistic pattern
```

Prefer **section-scoped or field patches over per-field CRDT**; two changes to different paths auto-merge (apply both, one version bump), same-path falls to the §4 merge/UI. Prune with the opportunistic delete-on-write pattern from `0012`.

### 5.5 Compatibility with existing invariants

- **"GM cannot edit" stays structural** — no new write path to `sheet_data` for GMs; OCC UPDATE still goes through `characters_update_editor` (`can_edit_character`, which excludes campaign roles); the deferred patch insert also gates on `can_edit_character`. A GM receiving a version ping is read-only.
- **Privacy view-model** unchanged for all server/API reads; the only new bypass is the raw Realtime payload, fenced off in §5.3.
- **Snapshots / diff / stale flag** — `sheet_version` is complementary to snapshots (per-write counter vs. point-in-time freeze); the existing `stale_after_changes` admin flip is untouched and fires after the guarded update. Optionally stamp `character_snapshots` with `source_version bigint` so "compare to approved" shows the version delta.
- **Computed columns** — `bump_sheet_version` keys off `sheet_data is distinct from old.sheet_data`, so a future recompute-only write won't burn a version or trip a concurrent editor's OCC guard.

### 5.6 Migration sequencing + types regeneration

Apply each via the Supabase MCP `apply_migration` against project `ldhpdstmgvcsiiupckqx`, mirroring the SQL into `supabase/migrations/` (current head `0015`): **`0016`** (concurrency columns + trigger, MVP), **`0017`** (realtime + presence policy), **`0018`** (deferred patch log). After **every** DDL migration: run Supabase MCP **`get_advisors`** (security + perf) per the CLAUDE.md convention — verify the new `SECURITY DEFINER` trigger fn has EXECUTE revoked from `anon`/`authenticated`, and that new policies use `(select auth.uid())` to avoid an initplan WARN. Then **regenerate `lib/supabase/types.ts`** via `generate_typescript_types` (required — the `characters` Row must gain `sheet_version: number` and `last_editor_id: string | null` before `saveCharacterSheetAction` can read `data.sheet_version` type-safely) and run `pnpm typecheck` to catch callers of the changed Row/Update types.

---

## 6. Phased delivery plan, MVP cut, risks, effort

The governing principle: **everything that can ship on the web — and pay off immediately — ships before the app stores are ever touched.** App-store risk is isolated to the final phase, and all conflict risk is front-loaded into a web-only spike + three web-only phases that fix a real existing bug (silent last-write-wins).

### Phase 0 — De-risking spike — **S · web-only · no store · gate before anything else**

A throwaway spike that proves the conflict-merge is tractable on *this* schema.
- [ ] Take 2–3 real fixtures (`packages/pathforge-schema/src/fixtures/` + the Mythweavers/Foundry exports in `docs/`).
- [ ] Prototype a pure `threeWayMerge(base, mine, theirs)` over `PathForgeCharacterV1`, walking the tree like `diffCharacters` does.
- [ ] Hand-test the four cases: disjoint scalar edits (HP vs feat add) → auto-merge; same field same value → no conflict; same field different value → true conflict; **array divergence** (two devices append a feat).
- [ ] **The make-or-break output: a concrete list of arrays lacking a stable per-entry `id`** (grep `feats.list`, `skills`, `features.list`, inventory blocks, `buffs.active`, etc.), which becomes the §5.2 additive-id change in Phase 1.
- [ ] Add a **golden cross-runtime parity check**: `computeCharacter` on a fixture in Node, assert byte-identical `ComputedCharacter` — the cheap proof for the later "Hermes math is identical" claim, runnable now with zero app code.

**Exit:** auto-merge works for disjoint edits, true conflicts are identified, and there's a written id-stability decision for every array. If id-keyed array merge proves intractable, the documented fallback is **document/section-level conflict** for array-heavy sections — better to know now.

### Phase 1 — Shared-core extraction + `sheet_version` + guarded save — **M · web-only · no store · ships independently**

The highest-ROI phase; the web app gets safer immediately. 
- [ ] Promote `lib/character/{view-model,diff,api-shapes}.ts` into `@pathforge/view` so native imports the **same §15 privacy gate**, never re-implementing it client-side.
- [ ] Extract a pure `applySheetSave(sheet) → { parsed, computedSummary }` (the `safeParseCharacter` + `computeCharacter` core) shared by the web action and the future native client.
- [ ] **Migration `0016`** (`sheet_version` + trigger) + the guarded CAS UPDATE; `get_advisors`; regenerate types.
- [ ] Apply the **additive array-`id`** schema change from Phase 0 (importers/exporters round-trip it).
- [ ] Refactor web `saveCharacterSheetAction` onto the CAS; extend `useCharacterEditor` to carry `baseVersion`/`baseSheet` and add `"conflict"` to `SaveStatus`. Keep the §16.3 stale-flag step intact.

**Independence:** ships entirely on web; two browser tabs now get a real conflict signal instead of lost work.

### Phase 2 — Shared sync core: outbox + 3-way merge (web-first, behind a flag) — **L · web-only · no store · ships independently**

Prove conflict handling end-to-end on the web (the same machinery M10's PWA/offline needs) before any app-store risk.
- [ ] Build `threeWayMerge` + `DERIVED_PATHS` into a real, unit-tested module in `@pathforge/view` (disjoint / same-value / true-conflict / id-keyed-array cases, including the "phone edits Str, desktop edits HP → both survive" fixture).
- [ ] Build the pure outbox abstraction (pending change + `baseVersion`) shared by web + native.
- [ ] Wire the conflict path into `useCharacterEditor`: clean merge re-flushes at the new base; true conflict → `status: "conflict"` + the **privacy-aware** per-field banner (Keep mine / Take theirs / Keep-all) reusing the M7 stale-flag visual language.
- [ ] Two-tab manual test + automated offline→reconnect→merge test.

### Phase 3 — Expo skeleton + auth + read-only sheet parity — **L · native · dev builds only**

First native code; proves the shared engine + view-model run on-device.
- [ ] Add the Expo app as a second `workspace:*` consumer; wire Metro (watchFolders, `unstable_enableSymlinks`, TS paths) + the entry-point polyfills (`crypto.getRandomValues`, `atob`/`Buffer`).
- [ ] **Auth:** `@supabase/supabase-js` + `expo-secure-store` + PKCE deep-link (`pathforge://auth/callback`); same project, users, and RLS; configure the redirect in Supabase Auth.
- [ ] **Read-only sheet render** via `computeCharacter` + the shared `buildCharacterViewModel`; run the **Hermes golden parity test** to confirm no float/`Intl` divergence vs Node before any native write is trusted.
- [ ] Character list + read-only dashboard. Distributable via TestFlight/internal track — no public listing, no review risk.

### Phase 4 — Native editor parity + offline persistence + conflict UI — **XL · native · no store yet** (the MVP line)

- [ ] **Local persistence:** expo-sqlite for the durable document + outbox hydration on launch (instant, offline-first open) + MMKV for the hot draft; mirror `baseVersion` on disk.
- [ ] **Native editor screens** at parity with the web tabs (Identity…Profile), same live-recompute + debounced-autosave model, calling the same shared `applySheetSave` + guarded write.
- [ ] Wire the shared outbox + 3-way merge from Phase 2; surface the same conflict banner.
- [ ] Native writes go through the guarded RPC / a thin `/api/v1/characters/{id}/sheet` PUT — the same auth/rate-limit/audit treatment M9's API got.

### Phase 5 — Realtime presence + proactive conflict hinting — **M · native+web · no store**

- [ ] Migration `0017`: Realtime on `public.characters`, per-row filtered; **broadcast version-only + pull-on-demand** (avoid streaming/leaking `sheet_data` to non-owners); `get_advisors` to verify RLS withholds rows from unauthorized viewers.
- [ ] Proactive "updated on another device" hint so a long session sees the warning before a hard conflict.

### Phase 6 — Store submission + EAS + OTA — **L · APP-STORE GATED (the only phase exposed to review)**

- [ ] EAS Build (cloud iOS + Android) + EAS Submit + EAS Update channels (preview/production); extend the `pnpm lint && pnpm test && pnpm typecheck` CI gate to the Expo app; **OTA runtime-version guard** so the shared engine ships OTA but native-module changes force a store build.
- [ ] **Ship at least one native-only feature in the first submission** (dice-with-haptics or a Quick-Combat HUD — both reuse existing `ComputedCharacter` values, no new game math) so Apple doesn't reject a thin wrapper.
- [ ] Push notifications (`device_push_tokens` migration + an Edge Function on the existing M7 events) — privacy-respecting; can land post-launch, not a first-submission blocker.

### MVP cut — smallest shippable native app

**MVP = Phases 0 → 4 + the store-submission half of Phase 6**, with these scope cuts:

| In MVP | Deferred to fast-follow |
|---|---|
| Auth (PKCE deep-link), read-only + **editable** sheet parity | Realtime presence (Phase 5) — sync still works via guarded-write-on-save; "instant" follows |
| Offline draft persistence + outbox + guarded-write sync | Push notifications |
| **Conflict handling** — MVP may use the Phase-0 **document/section-level** banner if array merge proved hard | Field-level auto-merge for array-heavy sections; the patch-stream RPC (§5.4) |
| **One native-only feature** (dice+haptics *or* Quick-Combat HUD) so it's a real app, not a wrapper | Widgets, share-sheet import, offline spell reference |
| iOS + Android via EAS | Live Activities, voice-to-note |

The MVP deliberately keeps full field-level merge optional: document/section-level conflict resolution is honest ("someone else edited Feats — keep yours or theirs") and avoids lost work, which is the actual user-facing promise. **Full parity** = MVP + Phase 5 + push + field-level/patch-stream merge + the ranked mobile extras.

**Ships independently of the app stores:** Phases **0, 1, 2** (and the web side of 5) are 100% web-only and deliver standalone value — the web app stops silently losing concurrent edits and the offline/conflict machinery is reused by M10's PWA. **Recommendation: ship Phases 0–2 to web as their own release regardless of native timeline.**

### Top risks (ranked) + mitigations

1. **Array merge / conflict granularity (highest-risk detail).** Index-keyed leaf merge mis-handles concurrent inserts/reorders. *Mitigation:* the Phase-0 spike decides id-stability per array **before** app work; additive `id`s land in Phase 1; MVP fallback is document/section-level conflict.
2. **CRDT-vs-3-way-merge complexity.** *Mitigation:* explicitly reject full CRDT (it would re-model the entire Zod doc and break the clean canonical JSON the engine/view-model/importers/exporters/snapshots depend on); prove the structural merge on web (Phase 2) before native.
3. **Schema migration under live sync.** *Mitigation:* keep the authoritative version in the **DB column**, not the JSON, so snapshots/exports stay clean; chain through the existing `migrateCharacter` seam; never bump the doc schema and the sync protocol in the same release.
4. **Realtime RLS leak + scale/cost.** A non-owner must not receive `sheet_data`. *Mitigation:* broadcast version-only + pull-on-demand; verify with `get_advisors`; gate subscriptions to "open on >1 device" to bound fan-out.
5. **App-store review (thin-wrapper rejection).** *Mitigation:* isolate store risk to Phase 6; ship a genuine native-only feature in the first submission; everything prior already delivered value on web + internal native builds.
6. **Web + native drift.** *Mitigation:* the shared `workspace:*` packages are the parity guarantee (same `computeCharacter`, same `buildCharacterViewModel`); the golden Node-vs-Hermes test guards float/`Intl` divergence; EAS OTA + runtime-version guard keep the shared engine in sync; extend CI to the Expo app.

---

## Open questions for the product owner

1. **Live co-editing depth — MVP or v2?** The recommended MVP ships version-gated whole-document CAS + 3-way merge (no sub-second multi-cursor). The patch-stream RPC + `character_patches` log (§3, §5.4) adds true real-time co-editing but is a materially larger build that depends on the array-id migration. Is "your edits never get lost, and you see a clean merge within a second or two" enough for v1, or is Google-Docs-style live multi-cursor a launch requirement?
2. **Conflict granularity fallback.** If the Phase-0 spike finds id-keyed array merge intractable for some sections, is **document/section-level** conflict ("Feats changed on another device — keep mine / take theirs") acceptable for those sections in v1, with field-level auto-merge as a fast-follow?
3. **Free-text notes merge.** v1 treats each notes/backstory field as a single-leaf conflict (loser's text shown + one-click restorable). Is that acceptable, or is concurrent paragraph-level text merge (scoped `diff3`) needed at launch?
4. **Sign in with Apple.** Offering Google/Discord SSO makes **Sign in with Apple mandatory** on iOS — confirm budget to add the Apple provider to Supabase Auth and the App Store listing.
5. **Native write endpoint.** Should native writes go through a guarded Postgres **RPC** or a new **`/api/v1/characters/{id}/sheet` PUT** (reusing M9's API-key/rate-limit/audit stack)? Affects how much of the API surface S5b touches.
6. **Realtime to read-only viewers.** Confirm the privacy stance: read-only viewers get only a content-free version-ping + a re-fetch through the §15 gate (recommended), never a raw `postgres_changes` payload. Acceptable, or is live push to viewers a requirement (which would require a separate filtered broadcast)?
7. **`apps/web` move.** Do the mechanical "move Next app into `apps/web/`" refactor now, or keep web at the repo root and only nest `apps/native/` until native is proven (recommended minimal-churn path)?
8. **Store accounts + cadence.** Apple Developer Program ($99/yr) and Play Console ($25 one-time) need to be provisioned; confirm who owns the accounts and the expected OTA-vs-store-build release cadence.

## First spike to de-risk

**Build the pure `threeWayMerge(base, mine, theirs)` over `PathForgeCharacterV1` and run it against 2–3 real fixtures (Phase 0) — before any Expo, Metro, or app code.**

This is the single most valuable prototype because the entire milestone's risk concentrates in one place: conflict handling is *the* core requirement, and the one detail that can sink it — whether the schema's arrays (`feats.list`, `inventory.*`, `buffs.active`, `spellcasting.*`) carry stable per-entry ids so concurrent inserts merge by id instead of by index — is answerable in a few hours of pure TypeScript with zero native toolchain. The spike has three concrete deliverables: (1) a working merge that auto-resolves disjoint edits and correctly flags true same-field conflicts on real character documents; (2) a written, per-array **id-stability decision** that directly scopes the §5.2 schema change and tells you whether the MVP can promise field-level merge or must fall back to section-level conflict; and (3) a **golden cross-runtime parity assertion** (`computeCharacter` byte-identical in Node) that pre-validates the "shared core runs identically in Hermes" assumption the native plan rests on. Everything else — Expo/Metro wiring, expo-sqlite, deep-link auth — is known, solved engineering; the merge correctness on *this* document shape is the only true unknown, so it goes first.