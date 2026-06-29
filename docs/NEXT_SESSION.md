# PathForge — where we are & what's next

_Last updated: 2026-06-28 (end of the chip-redesign / privacy / sidebar session). Quick "resume here"
doc; the authoritative milestone log is [`../CLAUDE.md`](../CLAUDE.md) Status, and the full grounded
plan-to-1.0 is [`V1_ROADMAP.md`](V1_ROADMAP.md). The S4 3pp flagship
([`S4_OPTIONAL_RULES_PLAN.md`](S4_OPTIONAL_RULES_PLAN.md)) is **post-1.0**._

## Current state

- **Live in production** at https://pfsheet.org — auto-deploys from `main` via Vercel. Zero runtime errors.
- **Milestones M0–M11 complete.** Secondary: **S1, S2, S3, S5a** done; **S5b** web side done (Phases
  0–2); the **full sheet audit** done. **S4:** ~11 optional systems shipped; **Spheres of Power / Might /
  Guile are all LIVE** (the rest of S4 — Path of War, Akashic — is post-1.0, gated on sourcing datasets).
- **Health:** lint + **338 unit tests** + typecheck + production build all green. Migrations at **0020**.
- **Plan to 1.0:** **V1·1–V1·6 DONE** + all four spawned follow-ups merged (campaign invite-consent
  [`497a9b2`, migration `0020`], ABP prowess [`7cd435b`], inventory automation [`342e2d1`], effect-row DRY
  [`f826f3e`]). The web app + PWA is **v1-complete**.
- **🚀 NEXT MAJOR WORK — PFcore (M12, compendium-driven builder):** the owner dropped a complete normalized
  PF1e dataset (`docs/PFcore Update/csv/`, 25 TSVs / ~25.9k rows) + a hyper-detailed plan
  → **[`docs/PFcore Update/PFCORE_MASTER_PLAN.md`](PFcore%20Update/PFCORE_MASTER_PLAN.md)**. See "What's next" below.

## What shipped THIS session (chip redesign + privacy + sidebar)

1. **Spheres chip editor + read view** (`deaf148`/`c95a6ac`) — the owner's mockup: tradition card with
   drawback/boon/bonus-talent **chips** (click → inline target + `note`), spheres/talents as chips, ★ marks
   a free `bonus` talent. Additive schema (grant `note`, talent `bonus`).
2. **§15-gate the optional-rules systems** (`0960ee5`) — hero points / honor / stamina / mythic / psionics /
   milestone leveling were leaking on public shares (psionics exposed its powers list). Now each is
   `gate("<key>", …)` + a privacy-editor row (shown only when the system is enabled / has a non-default
   level). `woundsVigor`/`senses`/`advancement` deliberately left ungated (locked with invariant tests).
3. **Game-icons swap finished** (`002835c`) — browse/list/dashboard pages + editor sub-editors + GM audit.
   CC-BY attribution already in footer + privacy page. 3-theme tint check passed.
4. **Collapsible-sidebar overhaul** (`04b1261`/`03b8cde`/`500eeba`) — see [[pathforge-collapsible-sidebar]].
   Fixed peeking label text via **container queries**; **4-state** rail (auto / open / closed-with-tooltips /
   hidden-with-reopen); same on the editor section rail; **mobile drawer** now shows labels (`compact` mode).

## 🚀 What's next — PFcore (M12, the compendium-driven builder)

v1 + all follow-ups are done. The next major epic turns PathForge from hand-entered into a **compendium-
driven builder**: tap to apply official PF1e content and the engine auto-fills the mechanics. The data is
loaded (`docs/PFcore Update/csv/` — 25 TSVs), the plan is written, and the key decisions are owner-signed.

**START HERE → [`docs/PFcore Update/PFCORE_MASTER_PLAN.md`](PFcore%20Update/PFCORE_MASTER_PLAN.md)** (the
full 10-phase plan, grounded in a 4-agent code assessment; the data-side spec is
`docs/PFcore Update/csv/INSTRUCTIONS_FOR_CLAUDE_ULTRACODE.md`).

**Owner-signed decisions:** companions = **linked character rows** (Option A) · ship the **thin slice
(Phase 0→3) first** · gitignore the HTML / version the TSVs (done).

**The thin slice (do in this order):**
1. **Phase 0 — DATA LOAD** ⚠ needs owner DB sign-off. 25 TSVs → ~24 Supabase compendium tables (spell/sphere
   contract: public-read · service-write · tsvector · `search_*` RPC · GIN), new migrations after `0020`.
   Recommended bulk load: owner-run `psql \copy … FORMAT csv, DELIMITER E'\t', HEADER true` (INSTRUCTIONS §8.2).
   Regenerate `lib/supabase/types.ts` + `get_advisors`. **Blocks everything below.**
2. **Phase 1 — Browse pages** (`/feats`, `/traits`, `/races`, `/archetypes`, `/prestige`, `/class-options`) —
   clone the `/spells` + `/spheres` pattern. Low risk.
3. **Phase 2 — Pickers + the shared prereq engine** — tap-to-apply into the existing `FeatEntry`/`FeatureEntry`/
   `TraitEntry`; flag unmet prereqs (ranger/monk waivers; "force-take / ignore prerequisites" setting).
4. **Phase 3 — Automation hooks** — applied feats/features auto-apply their seeded `automation[]` effects
   (the `feats_effects`/`features_effects` seeds already speak our DSL); expand the seed for common feats.

Then reassess before the keystone **Phase 4 — progression-driven class builder** (level-by-level auto-features
+ choice prompts + good/bad-save/BAB/skill progressions + gestalt), and the breadth phases (5 archetypes ·
6 prestige · 7 races · 8 mythic depth · 9 linked-subsheet companions).

**Still post-1.0 (unchanged):** S4 3pp flagship (Spheres `<OptionPicker>` → Path of War → Akashic) · RLS
integration tests · printable-PDF "classic"/multi-page polish.

The detailed pre-blitz V1 plan below is kept as the record of what shipped.

---

## (Historical) The V1·2→V1·6 plan as scoped before the blitz (GROUNDED — `v1-remaining-audit`, 2026-06-28)

The audit found several V1·2 items already done (robots/sitemap, privacy+terms+footer, friendly auth
errors, the icon overhaul). **V1·2 remaining is just two items + an optional one:**

### V1·2·a — PWA raster icons  _(M — start here, fully self-contained)_
- **State:** `app/manifest.ts` ships only `/icons/icon.svg` for both `any` + `maskable`; iOS ignores SVG
  manifest icons → blank installed-app icon. No `apple-touch-icon`.
- **Steps:** (1) rasterize `public/icons/icon.svg` → `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`,
  `icon-maskable-512.png` (maskable needs ~20% safe-zone padding). (2) add PNG entries (sizes/type/purpose)
  to the `icons` array in `app/manifest.ts`. (3) add `apple-touch-icon` (180×180) via the root `metadata`
  export (or a `<link>` in the marketing layout). (4) verify: DevTools → Application → Manifest; add-to-home
  on iOS/Android shows a crisp icon.
- **Accept:** manifest serves 192/512 + maskable PNGs; apple-touch-icon linked; installed PWA icon is crisp.

### V1·2·b — Promote CSP to enforcing + Discord embed carve-out  _(M)_
- **State:** `next.config.ts` already ships a full **`Content-Security-Policy-Report-Only`** + HSTS +
  X-Frame-Options + Permissions-Policy + nosniff + Referrer-Policy. Two gaps: it's REPORT-ONLY (not
  enforced), and `frame-ancestors 'self'` blocks Discord's preview crawler.
- **Steps:** (1) run the app, exercise login/dashboard/sheet/settings, collect CSP-Report-Only violations
  in DevTools. (2) tighten the policy to clear them (watch `'unsafe-inline'` on script/style). (3) rename
  the header `Content-Security-Policy-Report-Only` → `Content-Security-Policy`. (4) change `frame-ancestors`
  to `'self' https://*.discord.com` (the Discord card route needs framing for rich embeds). (5) verify:
  post a public `/c/[slug]` link in Discord → rich preview renders; no console CSP errors.
- **Accept:** CSP enforced with zero violations; Discord embeds render.

### V1·2·c — (optional, low) more `loading.tsx` skeletons
- Only 4 of ~27 routes have them (dashboard, characters, campaigns, `/c/[slug]`). Add to character
  detail/edit, campaign detail/gm, settings if perceived-speed matters. Non-blocking.

### V1·3 — sheet completeness  _(the "complete PF1e sheet" layer; do the automation editor first)_
1. **Feat/feature/trait automation editor** _(M — highest value)_. The engine already consumes
   `automation[]`, but `character-editor.tsx` hardcodes `automation: []` when adding a feat/feature/trait
   (~lines 3949/4009/4128). Build an effect sub-editor (add/edit/delete rows: target · operation · value ·
   bonusType) reused across the three. **Accept:** a custom feat (e.g. Weapon Focus +1, Toughness, racial
   +2) changes the computed value live. Ship after an adversarial review per cadence.
2. **Conditions engine expansion** _(M)_. ~14 of ~35 conditions modeled; add blinded/deafened/nauseated/
   paralyzed/pinned/etc. as an additive `CONDITION_EFFECTS` table (infra exists in `conditions.ts`).
3. **Mythic depth** _(L)_. `mythic.abilityBoosts` are never applied in `computeAbilities`; path abilities are
   display-only. Wire boosts → scores + a path-abilities block + Hard-to-Kill.
4. **Automatic Bonus Progression** _(M)_. `automaticBonusProgression` is NOT in `IMPLEMENTED_MODULE_KEYS`
   (shows "coming soon") and has no engine math. Add the per-level "big six" bonuses into existing modifier
   buckets, then un-gate the toggle.

### V1·4 — campaign writes · V1·5 — QA gate · V1·6 — PDF  (full grounded detail in `V1_ROADMAP.md`)
- **V1·4:** `enabled_modules` has NO write path (M, blocks §17.2 adopt-modules) · edit campaign name/desc
  (S, only create/delete today) · invitation consent / `pending` state (L).
- **V1·5:** un-gate the **public** E2E smoke so it runs on every push (S — cheap, highest QA leverage;
  currently double-gated behind `RUN_E2E`) · `@axe-core/playwright` is installed but unused → add
  `tests/e2e/accessibility.spec.ts` (M).
- **V1·6:** printable-PDF export (L) — `ExportType` reserves `printable_pdf_modern/classic`; no implementer.
  The repo already uses `pdf-lib` (imports), so a template-fill or HTML-render approach fits.

## Deferred / needs attention (not blocking)

- **Editor section rail hard-close** — the main nav has the 4th "hidden" state; the editor "Sheet sections"
  rail has only auto/open/closed (+ tooltips). Could add hidden there too if wanted.
- **Owner action:** the 1 prod API key must be regenerated at `/settings/api` (the V1·1 pepper invalidated
  old hashes).
- **Read-view completeness leftovers** — custom resource pools (`resources.list`, no editor), per-class
  psionic detail, mythic path abilities (need engine), a few profile sub-field inputs.
- **SECURITY DEFINER RPC exposure** (Supabase WARN, low sev) — move 8 RLS-helper fns to a non-exposed schema
  + re-point every policy; its own careful branch-tested migration.
- **Post-1.0:** S4 flagship 3pp (compendium `<OptionPicker>` → Path of War → Akashic; dataset+licensing
  gated) · spellcasting subsystems (domains/bloodlines/mysteries) · native apps + S5b Phase 2 · perf gate.

## Working cadence (confirmed)

Build a pass → adversarial multi-agent Workflow review → fix confirmed findings →
`pnpm lint && pnpm test && pnpm typecheck` (+ build) → commit/push to `main` → verify prod runtime clean.
UI changes get a **real-browser check** (Tailwind v4 silently drops invalid container-query/variant classes;
`next build` won't catch it). Production DB changes need explicit owner sign-off; risky RLS changes get
branch-tested first. **Ultracode is on** — use Workflows on substantive tasks.
