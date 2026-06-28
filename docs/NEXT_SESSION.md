# PathForge — where we are & what's next

_Last updated: 2026-06-28. Quick "resume here" doc; the authoritative milestone log is
[`../CLAUDE.md`](../CLAUDE.md) Status. **The plan to 1.0 is now [`V1_ROADMAP.md`](V1_ROADMAP.md)**
(grounded 7-domain assessment → prioritized V1·1–V1·6). The S4 3pp plan
([`S4_OPTIONAL_RULES_PLAN.md`](S4_OPTIONAL_RULES_PLAN.md) + [`S4_SYSTEM_DESIGNS.md`](S4_SYSTEM_DESIGNS.md))
is now **post-1.0** (the XL flagship systems are deferred past v1)._

## Current state

- **Live in production** at https://pfsheet.org — auto-deploys from `main` via Vercel. Zero runtime errors.
- **Milestones M0–M11 complete.** Secondary: **S1, S2, S3, S5a** done; **S5b** web side done (Phases
  0–2); the **full sheet audit** done; **S4 (3pp/optional rules)** in progress (~11 systems + paste-parser
  shipped — see [[pathforge-modularity-roadmap]]).
- **Health:** lint + **283 unit tests** + typecheck + production build all green. Migrations at **0016**.

## What shipped this session (read-view + reliability)

1. **Autosave reliability** (3 layers; see [[pathforge-autosave-livelock]]): the real fast-typing FREEZE
   fix — the mid-save re-arm did `setStatus("unsaved")`, a no-op when already "unsaved", so no flush was
   ever rescheduled → frozen. Fixed with a `flushKick` counter the debounce depends on. Plus a 20s
   save-timeout (hung-save recovery) and a try/catch around the editor's `computeCharacter` useMemo (a
   compute throw can't crash the sheet). Diagnosed by reading the user's real character from the DB.
2. **Milestone Leveling** rebuilt on the user's real campaign tables (cumulative requirement ladder +
   4-difficulty job matrix, verified cell-by-cell).
3. **UI polish pass** — 33 verified findings across editor/view/GM/campaigns (mobile touch targets,
   overflow guards, empty states, the class-adder + skills-table mobile reflow, etc.).
4. **Editable profile** — Settings → display name + globally-unique handle (`lib/actions/profile.ts`);
   `inviteMemberAction` lowercases to match, so the invite-by-handle loop now works end-to-end.
5. **Read-view completeness** — a 4-area audit found 23 "typed-but-hidden" gaps; surfaced ~18: profile
   sub-fields, inventory notes/cost/weight/weapon-stats, alternate movement, spell-like abilities, the
   psionic powers list, an Advancement (XP) card, a Senses card, feat type.
6. **Read-view IA overhaul** — regrouped into **Combat** (BAB/CMB/CMD + attacks) and **Defenses** (saves
   + DR/resist/immunity/conditions); a **wiki infobox** (large portrait + facts panel) replaces the hero
   banner; **content-first rebalance** (Spellcasting/Inventory/etc. moved into the wide main column);
   narrative split into a **Background** card; **mobile** renders the infobox as a top banner (it was at
   the bottom). Speed moved from Attacks → Core.
7. **Privacy** — a per-section **Privacy & sharing** editor in Settings (was unreachable before); the
   share view now NAMES hidden sections; **Inventory + Wealth are public by default** now (per owner
   call). The same `privacy.sections` gating drives the read view AND the `/api/v1/.../stats` endpoint.

## Immediate next steps — the road to v1 (see [`V1_ROADMAP.md`](V1_ROADMAP.md))

The 7-domain readiness assessment found the core (sheet math, campaigns/GM, imports/exports/API, QA
architecture) **essentially v1-complete**. What's left is a tight, mostly-cheap set. **Next: V1·2.**

1. **V1·1 — launch-blockers — ✅ DONE** (commits through `8a5403a`): password-reset flow · styled
   `not-found.tsx` · `global-error.tsx` + public/auth/share error boundaries · "Coming soon" gating of
   the ~11 dead optional-rule toggles · API-key pepper (HMAC) · migration `0017` (pin search_path).
   **⚠ The pepper invalidated existing API-key hashes — the 1 prod key must be regenerated at
   `/settings/api`.** Migrations now run through `0017`.
2. **V1·2 — polish/trust:** finish the **icon overhaul** (GameIcon foundation shipped — extend to the
   remaining thematic surfaces + add CC-BY attribution) · PWA raster icons · robots/sitemap ·
   privacy+terms pages · security headers (CSP/HSTS).
3. **V1·3 — sheet depth:** feat/feature/trait **automation editor** (highest value) · more conditions ·
   Mythic depth (boosts→scores, path abilities) · ABP math.
4. **V1·4 — campaign writes:** GM-set enabled modules · edit campaign name/desc · invite consent.
5. **V1·5 — QA gate:** E2E in CI (public smoke + seeded account) · a11y/axe pass.
6. **V1·6:** printable-PDF export (§13.3).

**Post-1.0 (deferred):** the S4 flagship 3pp (compendium infra → Spheres ×3 → Path of War → Akashic;
OGL-data + licensing gated) · spellcasting subsystems (domains/bloodlines/mysteries) · sheet tails
(encumbrance, per-maneuver CMB, race catalog) · native apps + S5b Phase 2 · perf gate. Full detail +
rationale in [`V1_ROADMAP.md`](V1_ROADMAP.md).

## Deferred / needs attention (not blocking)

- **Read-view completeness leftovers** (need engine/editor work, not just display): custom **resource
  pools** (`resources.list` — modeled but no editor at all), **per-class psionic** manifester detail +
  **mythic path abilities** (need engine changes), editor inputs for a few profile sub-fields (family,
  appearance detail). Lower-priority renders: honor code/deeds, stamina combat-tricks list, buff
  effect/duration detail.
- **Mobile ordering tail** — the infobox now banners up top, but the sidebar *trackers* (hero points,
  mythic, …) + Languages/Wealth still stack at the very bottom on mobile; could reorder/prioritize.
- **Campaign privacy prompt** (owner idea) — when attaching a character to a campaign, offer to set
  Inventory/Wealth to Party. Needs campaign context in the view-model (not there today).
- **API** — could add `topSkills` to `/summary` (skills currently only on `/stats`).
- **Custom icon pack** — game-icons.net set IS now in `public/icons/000000/...` (4,133 SVGs, CC-BY,
  hardcoded `fill="#000"`). Swap planned for final polish via a `<GameIcon>` that maps to currentColor.
  See [[pathforge-icon-pack]].
- **Authed E2E in CI** — `tests/e2e/sheet.spec.ts` skips until a test account + CI secrets + `RUN_E2E=true`.
- **SECURITY DEFINER RPC exposure** (Supabase WARN, low sev) — move 8 RLS-helper fns to a non-exposed
  schema + re-point every policy; its own careful branch-tested migration.

## Working cadence (confirmed)

Build a pass → adversarial multi-agent Workflow review → fix confirmed findings →
`pnpm lint && pnpm test && pnpm typecheck` (+ build) → commit/push to `main`. Production DB changes
need explicit owner sign-off; risky RLS changes get branch-tested first.
