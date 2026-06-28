# PathForge — Road to v1

_Created 2026-06-28 from a grounded 7-domain readiness assessment (`v1-readiness-assessment` workflow)
cross-checked against the codebase. This is the authoritative "what's left for 1.0" plan; the running
status log is [`../CLAUDE.md`](../CLAUDE.md) and the quick resume is [`NEXT_SESSION.md`](NEXT_SESSION.md)._

## What "v1" means here

A **polished, correct, complete WEB app + PWA**. Decisions baked into this plan:

- **Native iOS/Android apps are shelved.** Not worth the Apple fee for a free app; the **PWA is the
  mobile story**. S5b's native work is out of v1; the web-side sync/conflict tail (offline outbox,
  per-field conflict UI) is nice-to-have, not blocking.
- PathForge stays **free, ad-free, zero-cost**. No feature is gated behind payment.

## Where we are

Per the assessment, the foundation is strong: **core PF1e math is complete and tested** (283 unit
tests), **campaigns/GM workflow is essentially v1-complete and deep**, **imports/exports/API are
essentially v1-complete**, and **QA/security architecture is sound** (RLS + privacy view-model proven
by anti-leak tests). The remaining work clusters into **launch-readiness gaps**, **sheet-depth
completeness**, **a few campaign-management writes**, **the dead-toggle UX**, and **polish** (icons,
SEO, a11y, PWA icons). Nothing outstanding is a data-loss or auth-bypass blocker.

---

## The route (recommended order)

Ordered for **best ROI + dependency flow**: cheap launch-blockers first, then the trust/polish layer,
then PF1e depth, then the QA gate, then the one big player-facing export.

### V1·1 — Launch-blocking essentials  _(MUST · ~1 short pass)_

Small, high-impact, mostly S/M. None of these can ship a credible 1.0 without.

| Item | Effort | Why |
|---|---|---|
| **Password-reset / forgot-password flow** | M | Email+password is first-class but a forgotten password = permanent lockout. Needs request-reset page + `resetPasswordForEmail` + set-new-password screen (`lib/actions/auth.ts`, `app/(auth)`). |
| **Styled `not-found.tsx`** (root + `/c`) | S | A dead/expired share link currently hits Next's unbranded white 404 — bad for a link-sharing app. |
| **`global-error.tsx` + public/auth/share error boundaries** | S | `error.tsx` only covers `(app)`. A throw on the landing page, login, or a shared sheet shows Next's default error screen. |
| **Dead optional-rule toggles → "coming soon"** | S | ~10 of 21 `OPTIONAL_RULE_MODULES` toggles (Spheres, Path of War, Akashic, ABP, Sanity, …) do nothing when enabled — reads as broken. Add a `comingSoon` flag to the catalog; gate/badge unbuilt systems so the UI never offers a no-op toggle. |
| **Apply the API-key pepper** | S | `PATHFORGE_API_KEY_PEPPER` is a required env var + the docs claim "peppered SHA-256", but `hashApiKey` never mixes it in (`lib/api/auth.ts`). Either apply it (preferred) or drop the dead required env + fix docs. |
| **Pin `bump_sheet_version` search_path** | S | New advisor WARN from migration 0016 (`function_search_path_mutable`). One-line migration `0017`. |

### V1·2 — Polish & trust layer  _(SHOULD · the "feels like 1.0" pass)_

| Item | Effort | Why |
|---|---|---|
| **Finish the icon overhaul** (#3) | M | `<GameIcon>` foundation + dashboard/inventory shipped. Extend game-icons to the remaining *thematic* surfaces where they fit (nav, editor section nav, campaign/feature cards) — leaving functional chrome (chevrons/close/check/spinners) on lucide. Add the CC-BY attribution (`/about` or footer) per licence. Real-browser tint check across obsidian/parchment/high_contrast. |
| **PWA raster icons** | S | `manifest.ts` ships only `icon.svg`; iOS ignores SVG manifest icons. Add 192/512 PNGs (+ maskable) + apple-touch-icon so installed-app icons aren't blank. |
| **`robots.ts` + `sitemap.ts`** | S | Public, indexable, link-shareable app with neither. Cover landing + `/developers` + public `/c/[slug]`. |
| **Privacy policy + terms pages + footer links** | M | App collects emails + OAuth + user data; OAuth consent screens normally reference a privacy URL. Add static pages + footer links (also link the orphaned `/developers`). |
| **Security headers (CSP / HSTS / X-Frame-Options / Permissions-Policy)** | M | `next.config.ts` sets only a few; its own comment promises a CSP that never landed. Defense-in-depth (Discord-embed route needs a `frame-ancestors` carve-out). |
| **Friendly auth errors + route `loading.tsx` skeletons** | M | Auth surfaces raw Supabase messages; awaited server pages flash blank frames. Both are perceived-quality wins. |

### V1·3 — Sheet completeness  _(SHOULD · the "complete PF1e sheet" layer)_

| Item | Effort | Why |
|---|---|---|
| **Feat/feature/trait automation editor** | M | The engine already consumes `automation[]`, but the editor hardcodes `automation: []` — a custom feat (Weapon Focus +1, Toughness, racial +2) can't affect any computed value. Highest-value sheet item; static-bonus feats are baseline 1.0. |
| **Conditions engine expansion** | M | Only ~12 of ~35 conditions are modeled. Add blinded / deafened / nauseated / paralyzed-helpless / pinned / squeezing / invisible (additive table; infra exists in `conditions.ts`). |
| **Mythic depth** | M | `mythic.ts` models ability boosts + path abilities but the engine ignores them — boosts don't raise scores, path abilities are display-only, no Hard-to-Kill. Wire `computeAbilities` + summary. |
| **Automatic Bonus Progression math** | M | `rules.variants.automaticBonusProgression` toggle exists with zero engine math. Purely additive per-level "big six" bonuses → fits existing modifier buckets. |

### V1·4 — Campaign management finish  _(SHOULD · small writes that unlock shipped reads)_

| Item | Effort | Why |
|---|---|---|
| **GM sets campaign enabled modules** | M | `enabled_modules` is read everywhere (incl. the player adopt-modules surface) but has **no write path** — so §17.2 "campaign mandates a module → player adopts" is entirely inert. RLS already allows it; needs a multi-select editor + action. |
| **Edit campaign name/description** | S | Only create/delete exist; a typo'd name forces delete+recreate (losing roster + history). |
| **Invitation consent flow** | M | `inviteMemberAction` force-adds members as `active` (schema clearly anticipated a `pending` state). Add invited→accept/decline so users aren't dropped into campaigns they never joined. |

### V1·5 — QA gate  _(SHOULD · lock the invariants before calling it 1.0)_

| Item | Effort | Why |
|---|---|---|
| **E2E actually runs in CI** | M | The Playwright job is fully gated behind `RUN_E2E`; even the no-auth public smoke tests never run, and the RSC-crash regression guard is double-gated on a test account. Run public smoke on every push + seed a test account for `sheet.spec.ts`. Highest-leverage QA gap (only thing exercising the real RSC boundary). |
| **Accessibility tests** | M | `@axe-core/playwright` is installed but never imported. Axe-scan the public routes + the editor; do a 3-theme contrast pass. |
| **Server-action / RLS integration tests** | L _(nice)_ | Pure logic is well-tested; a few Supabase-branch tests would lock "GM can't edit", "public share never leaks private", "cross-owner read denied". |

### V1·6 — Player-facing export  _(SHOULD · the one export players ask for)_

| Item | Effort | Why |
|---|---|---|
| **Printable-PDF export (§13.3)** | L | The export a casual player most expects for table use. UI already says "planned"; `ExportType` reserves `printable_pdf_modern/classic`. |

---

## Post-1.0 (deferred — explicitly out of v1)

- **S4 flagship 3pp** — the shared options-compendium + `<OptionPicker>` + parser infra (Phase A, XL,
  gated on sourcing OGL datasets), then **Spheres ×3**, **Path of War**, **Akashic** (each XL, licensing-
  gated). Plus minor Paizo subsystems (Sanity, Fame & Prestige, Kineticist Burn, Words of Power,
  Elephant in the Room). See [[pathforge-modularity-roadmap]] + `docs/S4_*`.
- **Spellcasting class subsystems** — domains / bloodlines / mysteries / patrons / wizard
  specialization+opposition (L; several daily-resource models). Today: inert "features".
- **Sheet depth tails** — encumbrance/carrying-capacity math, per-maneuver CMB, race/age catalog +
  auto racial mods.
- **Campaign extras** — notifications/badges for review actions + stale flips; attach-character
  onboarding polish.
- **Import/export tails** — Myth-Weavers HTML, Hero Lab `.por`, statblock parser; Foundry round-trip
  fidelity; field-level import review; `campaigns:read` API scope.
- **Native apps** (shelved) + **S5b Phase 2** (offline outbox, per-field conflict UI).
- **Perf gate** — Lighthouse CI / web-vitals / bundle budget.

## Sequencing rationale

V1·1 is cheap and unblocks a credible launch (no lockout, branded errors, no broken-looking toggles).
V1·2 makes it *feel* like 1.0 and satisfies OAuth/SEO/PWA expectations. V1·3 closes the most-felt PF1e
correctness gaps. V1·4 is small writes that activate already-built campaign reads. V1·5 is the safety
net before declaring done. V1·6 is the one heavy export players will ask for — last because it's L and
non-blocking. Everything in Post-1.0 is breadth/licensing-gated and doesn't change whether the core app
is "done."
