# PathForge — where we are & what's next

_Last updated: 2026-07-12 — **v1 has been done for weeks; the platform keeps shipping on top of
it.** Most recent: the **level-up wizard** (all 7 stages, 41-agent review) and guarded character
**deletion** + a **wizard-reopen** flow. See CLAUDE.md Status for the full per-entry log — that's
the authoritative source; this file is just the "resume here" pointer. **1046 unit tests.
Migrations at `0029`.**_

Quick "resume here" doc; the authoritative milestone log is [`../CLAUDE.md`](../CLAUDE.md) Status,
and the grounded plan-to-1.0 is [`V1_ROADMAP.md`](V1_ROADMAP.md) — all six slices shipped, so
that plan is now historical record, not a live task list.

## Current state

- **Live in production** at https://pfsheet.org — auto-deploys from `main` via Vercel.
- **Everything through M0–M12, V1·1–V1·6, and the S4 3pp flagship (Psionics/Path of War/Akashic/
  Oaths + Spheres Power/Might/Guile) is COMPLETE.** So is the sheet-depth audit and the **S6 UX
  overhaul** — all 4 pillars: companion sheets, the Modern editor (chip-summary canvas), the
  create-a-character wizard, and a unified viewers design language. See [[pathforge-s6-ux-overhaul]],
  [[pathforge-3pp-epic]], [[pathforge-pfcore-epic]].
- **Since S6 (2026-07-09 → 07-12):** wizard v2 (systems step, PB budgets, archetypes, owner step
  order); the **Items Overhaul** Stages 1-3 — slot schema, always-on slot engine, §15-gated
  paper-doll read view, EntryCard inventory editor with live linked-attack chips (see
  [[pathforge-items-epic]]); owner-only **character deletion** (Danger zone, type-name confirm) +
  a **wizard-reopen** interstitial; and the **level-up wizard**
  (`docs/LEVELUP_WIZARD/MASTER_PLAN.md`) — Class → HP → Skills → [Feats] → [ASI] → [Spells] →
  Review, with bracketed steps appearing only when a level-up actually owes them.
- **Health:** lint + **1046 unit tests** + typecheck + production build all green. **Migrations at
  `0029`** — nothing this stretch added a migration; deletion/reopen/level-up are all
  Zod/metadata-additive.

## 🚀 What's next

**The biggest open item: Items Overhaul Stage 4 (the magic-item compendium) is DATA-BLOCKED** on
the owner's Magic Item dataset — schema fields (compendiumId, weaponGroup, armorType, slot
metadata) are already shaped and waiting, the same pattern that unblocked Spheres/PFcore/3pp. If
you're starting a session cold, ask the owner for that dataset first.

Beyond that nothing is blocking. Pull from CLAUDE.md's Status log deferred tails, e.g.:
- **Real-device mobile pass** — editors are mobile-first by construction but the dev browser
  clamps ~660px, so true <640px stays class-guaranteed, never pixel-verified.
- **SECURITY DEFINER RPC exposure** (Supabase advisor WARN, low sev) — needs a careful
  schema-move migration touching every RLS policy.
- **S6 Pillar 2 leftovers** — swipe gestures + shared-element FLIP on the Modern editor canvas
  (need device/session eyes; the fixed bottom command bar itself was superseded by the existing
  `MobileBottomNav`).
- Smaller polish scattered through CLAUDE.md: class-builder display names for book-ref option
  types, race-picker edge cases, printable-PDF "classic" layout, RLS integration tests.
- Any **owner-reported quirks/bugs** take priority over all of the above — check first.

## Working cadence (confirmed)

Build a pass → adversarial multi-agent Workflow review → fix confirmed findings →
`pnpm lint && pnpm test && pnpm typecheck` (+ `pnpm build`) → commit/push to `main` → verify prod
runtime clean. **UI changes get a real-browser check** (Tailwind v4 silently drops invalid
container-query/variant classes; `next build` won't catch it) — the dev browser window clamps to
~660px, so true <640px mobile is class-guaranteed, not pixel-verified. Production DB changes need
explicit owner sign-off; risky RLS changes get branch-tested first. `pnpm lint` intermittently
segfaults (native, node v22) — retry up to 3×; a completing run is authoritative. **Ultracode is
on** — use Workflows on substantive tasks.
