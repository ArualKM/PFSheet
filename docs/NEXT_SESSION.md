# PathForge — where we are & what's next

_Last updated: 2026-07-03 — **the big 3pp flagship epic is COMPLETE** (all 9 phases) + a
**collapsible-list-accordion** UX pass. See CLAUDE.md Status for the full per-phase log. **746 unit
tests. Migrations at `0028`.**_

Quick "resume here" doc; the authoritative milestone log is [`../CLAUDE.md`](../CLAUDE.md) Status, and the
grounded plan-to-1.0 is [`V1_ROADMAP.md`](V1_ROADMAP.md). The S4 3pp flagship
([`3PP_MASTER_PLAN.md`](3PP_MASTER_PLAN.md)) is **DONE** — it is no longer post-1.0 pending work.

## Current state

- **Live in production** at https://pfsheet.org — auto-deploys from `main` via Vercel. Zero runtime errors.
- **Milestones M0–M12 complete.** **M12** = the compendium-driven builder (data → browse → tap-to-apply
  pickers + prereq engine → automation hooks → class-progression builder → archetypes → prestige → races →
  linked companions; Phase 8's mythic picker honestly skipped — scraped names unusable, mythic core already
  shipped).
- **S4 3pp flagship — COMPLETE.** Migrations `0027`/`0028` (18 compendium tables + 16 search RPCs). **Four
  new character SYSTEMS are LIVE** (in `IMPLEMENTED_MODULE_KEYS`): **Psionics**, **Path of War**, **Akashic**,
  **Oaths** — plus **Drawbacks & Flaws** and **Backgrounds & Occupations**. Each = engine `summary.<x>` →
  gated view-model + privacy section → own-file editor → dashboard card → import ClaimKind (module-off →
  features fallback). **Spheres of Power / Might / Guile** stay LIVE with the Phase-7 depth (class-options +
  practitioner-traits pickers, Spheres alt-racial-traits in the core-race picker). Gating model **D1**
  (`lib/character/threepp.ts` — 3pp rows in pickers/import only when the module is on; public `/compendium`
  keeps 3pp on separate Third-party pages). See [[pathforge-3pp-epic]].
- **Collapsible list grouping (`74c5fe2`).** Long spell/power/maneuver/sphere-talent lists now collapse into
  accordion sections in BOTH the read view and the editor, mobile-first (shared `<CollapsibleGroup>`;
  Spheres get a Base/Advanced/Legendary tier subheader). See [[pathforge-list-accordions]].
- **Secondary:** **S1, S2, S3, S5a** done; **S5b** web side done (Phases 0–2); the full sheet audit done.
- **Plan to 1.0:** **V1·1–V1·6 DONE** + all spawned follow-ups merged. The web app + PWA is **v1-complete.**
- **Health:** lint + **746 unit tests** + typecheck + production build all green. **Migrations at `0028`.**

## What shipped this session (2026-07-02 → 07-03)

_Full detail in [`../CLAUDE.md`](../CLAUDE.md) Status; the quick version:_

1. **The big 3pp update (S4 flagship) — all 9 phases** (`9478de3`…`3a7b730`). The owner's 20-TSV / 14,350-row
   dataset → migrations `0027`/`0028`. Phases: 0 data · 1 loader/migrations · 2 browse pages + gated picker
   unions · 3 **Psionics** (`ce6832c`) · 4 **Path of War** (`56885dc`) · 5 **Akashic** (`51f7fa6`) · 6
   **Oaths + Drawbacks/Flaws + Backgrounds/Occupations** (`85536b0`) · 7 **Spheres depth** (`d09c9fe`) · 8
   consolidated import-detector coexistence sweep (`3a7b730`) · 9 docs (`a0b7a3e`). Each shipped after an
   adversarial Workflow review + live browser verify.
2. **Collapsible list accordions** (`74c5fe2`) — shared `components/character/collapsible-group.tsx`
   `<CollapsibleGroup>` (`COLLAPSE_WHEN_OVER = 12`); spells/powers by level, maneuvers by discipline,
   spheres by sphere + tier. Review caught + fixed the "add-into-a-collapsed-group swallows the auto-open"
   bug via a `forceOpen` escape hatch.

## 🚀 What's next

**The owner has a list of found quirks/bugs to work on next** — start there. Beyond that, in rough priority
(nothing is blocking; v1 + M12 + the 3pp flagship are all done):

### 1. 3pp / Spheres follow-ups  _(the compendium add-flow is the main remaining "reference → apply" gap)_
- **Spheres/options `<OptionPicker>` add-flow** — the sphere pickers exist (`sphere-picker.tsx`, 5-mode) and
  the 3pp systems have their own pickers; generalize the "add from the seeded compendium" pattern where any
  system still relies on manual entry. See [[pathforge-modularity-roadmap]].
- **Akashic / PoW data quirks** — `rajah`-akashic + Rajah PoW progressions lost a header tier at scrape
  (degrade gracefully; someday repair). `threepp_race_compendium` is akashic-only.
- **Real-device mobile pass** — the one deferred Phase-9 item. Editors are mobile-first by construction
  (`grid-cols-1 lg:grid-cols-2`, 44px targets) but the dev browser clamps ~660px, so true <640px is
  class-guaranteed, not pixel-verified. Check on an actual phone.

### 2. M12 polish tails  _(small; deferred during the epic)_
- Class builder: cleaner display names for book-ref option types; smarter caster-stat defaults for non-core
  classes. Race-picker edge cases (point-buy interaction, manual edits between race swaps, size revert).
  Prestige has no feature/requirement tables in the data → no auto-gating.

### 3. Deferred / needs attention  _(not blocking; each self-contained)_
- **SECURITY DEFINER RPC exposure** (Supabase advisor WARN, low sev) — 8 RLS-helper fns callable via
  PostgREST; the only safe fix is a schema-move of all helpers + re-point every policy (its own careful
  branch-tested migration).
- **Read-view completeness leftovers** — custom resource pools (`resources.list`, no editor), a few profile
  sub-field inputs.
- **RLS integration tests** + printable-PDF "classic"/multi-page polish (both post-1.0).

## Owner actions (outside the code)

- **Regenerate the 1 prod API key** at `/settings/api` — the V1·1 pepper invalidated the old hash (if not
  already done).

## Working cadence (confirmed)

Build a pass → adversarial multi-agent Workflow review → fix confirmed findings →
`pnpm lint && pnpm test && pnpm typecheck` (+ `pnpm build`) → commit/push to `main` → verify prod runtime
clean. **UI changes get a real-browser check** (Tailwind v4 silently drops invalid container-query/variant
classes; `next build` won't catch it) — the dev browser window clamps to ~660px, so true <640px mobile is
class-guaranteed, not pixel-verified. Production DB changes need explicit owner sign-off; risky RLS changes
get branch-tested first. `pnpm lint` intermittently segfaults (native, node v22) — retry up to 3×; a
completing run is authoritative. **Ultracode is on** — use Workflows on substantive tasks.
