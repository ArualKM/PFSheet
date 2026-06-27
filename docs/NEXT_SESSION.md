# PathForge — where we are & what's next

_Last updated: 2026-06-27 (end of the M11 session). This is the quick "resume here" doc;
the authoritative milestone log is in [`../CLAUDE.md`](../CLAUDE.md) Status section._

## Current state

- **Live in production** at https://pfsheet.org — auto-deploys from `main` via Vercel.
- **Milestones M0–M11 complete.** Secondary milestones **S1, S2, S3, S5a** done; **S5b** in design.
- **Health:** lint + unit tests (161) + typecheck + build all green. No production runtime errors.
- **Supabase advisors:** security is clean except the documented deferral below; leaked-password
  protection is **ON**. Migrations run through **0015**.

## What shipped most recently (this session)

1. **Hotfix** — character-view crash (a function prop crossed the RSC server→client boundary in
   `<ShowMore>`). Now children-based. Lesson + guard in [[pathforge-rsc-function-props]].
2. **M10 (PWA)** — privacy-safe service worker, offline fallback, prod-only registration.
3. **M11 E2E harness** — Playwright (`tests/e2e/`), runs the production build in CI; public smoke
   tests + a gated character-view regression guard; CI in `.github/workflows/ci.yml`.
4. **S2 /view polish** — viewer-aware empty states, `profile.appearance` render fix, CMB·CMD,
   section landmark regions; public `/c/{slug}` OG/Twitter cards + chrome.
5. **Supabase security/perf pass** — migration `0014` (15 FK indexes) + `0015` (initplan: wrapped
   `auth.uid()`/`auth.role()` in 52 RLS policies; branch-tested, behavior-identical).

## Immediate next steps (in order)

1. **S5b — native apps + real-time sync + concurrent-edit conflict handling (XL).**
   The design doc is being generated this session → **`docs/S5b_NATIVE_APP_PLAN.md`**. Start there.
   Recommended first move: the conflict-merge **spike** the plan calls out (de-risk before any app work).
2. **S4** — 3pp / optional-rules content (build on the optional-rules framework already in the editor).
3. **S6** — additional high-value features (dice roller, encounter tracker, more compendiums…).
4. **S7** — full feature review + final pass before a 1.0 tag.

## Deferred / needs attention (not blocking)

- **Authed E2E in CI** — `tests/e2e/sheet.spec.ts` (the RSC regression guard) only runs when
  `E2E_EMAIL` + `E2E_PASSWORD` (a confirmed account owning ≥1 character) and the Supabase secrets +
  repo var `RUN_E2E=true` are set in GitHub. **Needs the owner to add a dedicated test account +
  CI secrets.** Until then it skips (green).
- **SECURITY DEFINER RPC exposure** (Supabase security WARN, low severity) — 8 RLS-helper functions
  are callable via PostgREST RPC. Branch-testing **proved** that revoking EXECUTE breaks RLS
  ("permission denied for function" when a policy evaluates it), so the only safe fix is moving all
  helpers to a non-exposed schema + re-pointing every policy + the `protect_character_owner` trigger.
  Worth doing as its own careful, branch-tested migration; low urgency.
- **Other advisor items:** `multiple_permissive_policies` on `rule_modules` (low value) and
  `spell_compendium` (guardrailed — never alter); `api_rate_limits` RLS-enabled-no-policy is the
  intended deny-all for a service-role-only table; 1 residual initplan WARN is spell_compendium's
  policy, left by design.
- **Deferred feature tails:** M8 — Myth-Weavers HTML mapper, Hero Lab `.por` (shelved), statblock
  parser. M9 — printable-PDF export (§13.3), Foundry round-trip fidelity, `campaigns:read` endpoints.
  S5a — touch-height sweep of raw inputs. M10 — per-theme manifest color, custom install prompt.

## Working cadence (confirmed)

Build a pass → adversarial multi-agent Workflow review → fix confirmed findings →
`pnpm lint && pnpm test && pnpm typecheck` (+ build) → commit/push to `main`. Production DB changes
need explicit owner sign-off; risky RLS changes get branch-tested first.
