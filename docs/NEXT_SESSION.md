# PathForge — where we are & what's next

_Last updated: 2026-07-01, END OF DAY (the "finish PFSheet" session — see CLAUDE.md Status for the
full six-pass log: compendium-search prefix fix [migration 0026] · full-screen mobile section
navigator + Settings subtabs · Saves/AC full editors · skills overhaul [ability overrides,
skill-scoped buff targets, ƒx misc with [[…]] support] · Mythic COMPLETED [431 ability names
recovered from AoN + picker/feats/base-abilities/spell-augments] · the COMPANION system [familiar
master link, 20 archetypes, statblock autofill, nested /characters]). 458 unit tests. The next
recommended epic is the import verification wizard — design ready in
[`IMPORT_VERIFICATION_PLAN.md`](IMPORT_VERIFICATION_PLAN.md)._

_Previous update: 2026-07-01 (end of the editor-polish / mobile-nav / read-view / compendium-accordion pass)._
Quick "resume here" doc; the authoritative milestone log is [`../CLAUDE.md`](../CLAUDE.md) Status, and the
grounded plan-to-1.0 is [`V1_ROADMAP.md`](V1_ROADMAP.md). The S4 3pp flagship
([`S4_OPTIONAL_RULES_PLAN.md`](S4_OPTIONAL_RULES_PLAN.md)) is **post-1.0**._

## Current state

- **Live in production** at https://pfsheet.org — auto-deploys from `main` via Vercel. Zero runtime errors.
- **Milestones M0–M12 complete.** **M12** = the **compendium-driven builder** (data load → browse pages →
  tap-to-apply pickers + a shared prereq engine → automation hooks → the keystone class-progression builder →
  archetypes → prestige → races → linked-subsheet companions; Phase 8's mythic picker was honestly skipped —
  the scraped path-ability names are unusable, and the mythic core already shipped).
- **Secondary:** **S1, S2, S3, S5a** done; **S5b** web side done (Phases 0–2); the **full sheet audit** done.
  **S4:** ~11 optional systems shipped; **Spheres of Power / Might / Guile are all LIVE** (Path of War +
  Akashic are post-1.0, gated on sourcing their datasets the way Spheres was).
- **Plan to 1.0:** **V1·1–V1·6 DONE** + all four spawned follow-ups merged. The web app + PWA is **v1-complete.**
- **Health:** lint + **408 unit tests** + typecheck + production build all green. **Migrations at `0025`.**

## What shipped the last few sessions (editor polish → mobile → read-view → compendium)

_Full detail in [`../CLAUDE.md`](../CLAUDE.md) Status; the quick version:_

1. **Post-M12 builder-UI polish → editor "mega polish".** First (`e3a3971`→`13c51ac`) all seven M12 builder
   pickers were unified onto a shared `picker-shell.tsx` toolkit, the `<ClassCompendiumPicker>` gained a
   **per-level progression accordion**, and the race picker got sign-tinted ability-mod tiles. Then
   (`9417b52`/`692a929`/`69df796`) the whole EDIT UI moved to one pattern: *beautiful chips as the default
   display + a show/hide disclosure to edit every aspect + tap-to-open on mobile* (shared `<StatChip>`/
   `<Segmented>` + `<EntryCard>` in `entry-card.tsx`). Redesigned Classes (per-class archetypes, editable
   BAB/saves/HD/caster, favored-class checkbox + FCB steppers, Prestige folded into the picker),
   Feats/Features/Traits, Race, and Spells.
2. **Mobile nav overhaul (A→B→C, `MOBILE_NAV_AND_POLISH_PLAN.md`)** — killed the redundant sidebar drawer →
   an account-menu avatar; section switcher → hamburger bottom-sheet; sticky live-stats `top-14` + a floating
   back-to-top (`893d00c`/`0b3b6e7`); a **44px touch-target sweep** (`842a441`); and read-view completeness
   (feat/feature/trait rules text expands via `<EntryDetailRow>`; at-will badge, FCB skill, SLA CL + owner
   notes, racial ability-mod line — `1eed610`/`40708e8`). All pushed to prod.
3. **Dashboard compendium card** (`a87ec98`) — the old spells-only "Spell Compendium" quick-link is
   relabeled **"Compendium"** and repointed to the unified **`/compendium`** hub.
4. **Compendium: Classes page + full-detail accordion** (`3c658ff`) — added the missing **`/classes`** browse
   page (first card on the hub, new `Helmet` icon), and replaced the `line-clamp` truncation on EVERY
   compendium browse page (feats/traits/races/archetypes/class-options/prestige/classes + `/spells` +
   `/spheres`) with a native `<details>` **accordion** (zero client JS): collapsed = name + badges + key meta,
   expand = full untruncated rules text. Shared `<Prose>` + trim-aware `hasText()` in `compendium-browser.tsx`.

## 🚀 What's next — pick a thread (nothing is blocking)

v1 **and** M12 are done, so the next work is a **menu**, not a critical path. In rough priority:

### 1. Compendium `<OptionPicker>` add-flow + the S4 3pp flagship  _(post-1.0, the biggest named epic)_
- The compendium browse pages exist for every entity; the **class/feat/trait/archetype/prestige/race pickers**
  already apply from the compendium in the editor (M12). The remaining "reference → apply" gap is the
  **Spheres/options `<OptionPicker>`**: let players add spheres/talents/traditions/drawbacks from the
  `sphere_*` compendium (search RPC exists) instead of by hand, then generalize the pattern.
- Then the **XL 3pp systems**: **Path of War** → **Akashic** — each needs its dataset **sourced + normalized
  the way Spheres was** (TSVs in `docs/Tables/…`, a migration of `*_compendium` tables on the spell/sphere
  contract, a browse page, then the character system math). See [[pathforge-modularity-roadmap]] +
  [`S4_OPTIONAL_RULES_PLAN.md`](S4_OPTIONAL_RULES_PLAN.md).

### 2. M12 polish tails  _(small, high-polish; deferred during the epic)_
- **Class builder:** cleaner display names for book-ref option types; smarter caster-stat defaults for
  non-core classes. _(The per-level progression accordion viz already shipped — `e3a3971`.)_
- **Race picker edge cases** (spawned as a follow-up): point-buy interaction, manual ability edits between
  race swaps, size revert-on-reapply. The common path works; these are corner cases.
- **Prestige** has no feature/requirement tables in the data (all `requirements` empty) → no auto-gating; it
  shows the description for self-assessment. Only actionable if a better dataset appears.

### 3. Deferred / needs attention  _(not blocking; each is self-contained)_
- **SECURITY DEFINER RPC exposure** (Supabase advisor WARN, low sev) — 8 RLS-helper fns are callable via
  PostgREST. The only safe fix is a schema-move of all helpers + re-point every policy; its own careful
  branch-tested migration.
- **Read-view completeness leftovers** — custom resource pools (`resources.list`, no editor), per-class
  psionic detail, mythic path abilities (need an engine seam), a few profile sub-field inputs.
- **Optional-systems privacy** — spheres is now a real §15 privacy section; the OTHER optional systems
  (psionics/mythic/honor/…) were §15-gated in `0960ee5`, but re-audit any newly-surfaced field.
- **RLS integration tests** + printable-PDF "classic"/multi-page polish (both post-1.0).

## Owner actions (outside the code)

- **Regenerate the 1 prod API key** at `/settings/api` — the V1·1 pepper invalidated the old hash.
- **New 3pp datasets** (Path of War, Akashic) need sourcing/normalizing before their epics can start — same
  shape as the Spheres TSVs in `docs/Tables/Spheres Supabase Project/`.

## Working cadence (confirmed)

Build a pass → adversarial multi-agent Workflow review → fix confirmed findings →
`pnpm lint && pnpm test && pnpm typecheck` (+ `pnpm build`) → commit/push to `main` → verify prod runtime
clean. **UI changes get a real-browser check** (Tailwind v4 silently drops invalid container-query/variant
classes; `next build` won't catch it) — run a prod build + `preview_start`/Chrome against `localhost:3100`;
the dev browser window clamps to ~660px, so true <640px mobile is class-guaranteed, not pixel-verified.
Production DB changes need explicit owner sign-off; risky RLS changes get branch-tested first. **Ultracode is
on** — use Workflows on substantive tasks.
