# PathForge — Road to v1

_Created 2026-06-28 from a grounded 7-domain readiness assessment (`v1-readiness-assessment` workflow)
cross-checked against the codebase. This is the authoritative "what's left for 1.0" plan; the running
status log is [`../CLAUDE.md`](../CLAUDE.md) and the quick resume is [`NEXT_SESSION.md`](NEXT_SESSION.md)._

> **✅ v1 COMPLETE (shipped 2026-07-01; everything below is now HISTORICAL).** **V1·1 through V1·6 all
> shipped** — password reset / error boundaries / coming-soon gating / API-key pepper (V1·1); PWA raster
> icons + enforced CSP (V1·2); feat/feature/trait **automation editor** + conditions 12→17 + **Mythic
> depth** + **ABP** (V1·3); campaign GM module/detail writes + invitation-consent flow (V1·4, migration
> `0020`); public E2E smoke + a11y on every push (V1·5); **printable one-page PDF** (V1·6). All four
> spawned follow-ups merged too.
>
> **Everything this doc calls "Post-1.0" has since shipped too.** The S4 3pp flagship (Spheres/Path of
> War/Akashic/Oaths + the options-compendium infra) is **complete** (2026-07-02); **M12** (the PFcore
> compendium-driven class/archetype/prestige/race/companion builder) is **complete**; the **S6 UX
> overhaul** (companion sheets, Modern editor, new-player wizard, unified viewers design language) is
> **complete** (2026-07-09); a **guided level-up wizard** (7 stages) plus **character deletion +
> wizard-reopen** shipped 2026-07-12. The Items Overhaul is the one thing still mid-flight (Stages 1-3
> done; Stage 4's magic-item compendium is data-blocked on the owner's dataset). **1046 unit tests;
> migrations through `0029`.** The per-item detail below is the HISTORICAL plan of record; live status is
> [`../CLAUDE.md`](../CLAUDE.md).

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

### V1·1 — Launch-blocking essentials  _(✅ DONE — commits through `8a5403a` + migration `0017`)_

Small, high-impact, mostly S/M. None of these can ship a credible 1.0 without. **All shipped:**
password-reset · styled `not-found` · `global-error` + error boundaries · "coming soon" toggle gating ·
API-key pepper (⚠ the 1 prod key must be regenerated at `/settings/api`) · `bump_sheet_version` search_path.

| Item | Effort | Why |
|---|---|---|
| **Password-reset / forgot-password flow** | M | Email+password is first-class but a forgotten password = permanent lockout. Needs request-reset page + `resetPasswordForEmail` + set-new-password screen (`lib/actions/auth.ts`, `app/(auth)`). |
| **Styled `not-found.tsx`** (root + `/c`) | S | A dead/expired share link currently hits Next's unbranded white 404 — bad for a link-sharing app. |
| **`global-error.tsx` + public/auth/share error boundaries** | S | `error.tsx` only covers `(app)`. A throw on the landing page, login, or a shared sheet shows Next's default error screen. |
| **Dead optional-rule toggles → "coming soon"** | S | ~10 of 21 `OPTIONAL_RULE_MODULES` toggles (Spheres, Path of War, Akashic, ABP, Sanity, …) do nothing when enabled — reads as broken. Add a `comingSoon` flag to the catalog; gate/badge unbuilt systems so the UI never offers a no-op toggle. |
| **Apply the API-key pepper** | S | `PATHFORGE_API_KEY_PEPPER` is a required env var + the docs claim "peppered SHA-256", but `hashApiKey` never mixes it in (`lib/api/auth.ts`). Either apply it (preferred) or drop the dead required env + fix docs. |
| **Pin `bump_sheet_version` search_path** | S | New advisor WARN from migration 0016 (`function_search_path_mutable`). One-line migration `0017`. |

### V1·2 — Polish & trust layer  _(◑ ~80% done · 2 items + 1 optional left)_

| Item | Status | Effort | Why / what's left |
|---|---|---|---|
| **Finish the icon overhaul** | ✅ done | M | Shipped across read-view/nav/editor/browse-list/dashboard + GM audit; CC-BY in footer **and** privacy page; 3-theme tint check passed. |
| **PWA raster icons** | ☐ todo | M | `manifest.ts` still ships only `icon.svg`; iOS ignores SVG manifest icons. Add `icon-192/512.png` + maskable variants + `apple-touch-icon` (180) so installed icons aren't blank. **(Start here — self-contained.)** |
| **`robots.ts` + `sitemap.ts`** | ✅ done | S | Both present; auth routes disallowed, public routes + ≤5000 shared `/c/[slug]` URLs indexed. |
| **Privacy policy + terms pages + footer links** | ✅ done | M | `/(marketing)/privacy` + `/terms` exist, dated, comprehensive; footer links privacy/terms/developers; all in sitemap. |
| **Security headers (CSP / HSTS / …)** | ◑ partial | M | `next.config.ts` ships a full **CSP-Report-Only** + HSTS + X-Frame-Options + Permissions-Policy + nosniff + Referrer-Policy. **Left:** clear violations → promote `Report-Only` → enforcing; change `frame-ancestors 'self'` → `'self' https://*.discord.com` for rich Discord embeds. |
| **Friendly auth errors** | ✅ done | S | `friendlyAuthError()` maps Supabase codes to non-leaky text in `lib/actions/auth.ts`. |
| **Route `loading.tsx` skeletons** | ◑ optional | S | 4 of ~27 routes have them (dashboard/characters/campaigns/`/c`). Add to character detail/edit, campaign detail/gm, settings if perceived-speed matters. Non-blocking. |

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
