# Animation system — Motion (`motion/react`) integration spec

Part of the S6 UX overhaul (see the sibling plan docs in this folder for the companion-sheet,
editor-overhaul, and create-wizard specs). This doc is the animation *substrate* all three build
on. It is a practical implementation spec, not a survey — Fable should be able to execute it
directly.

## 0. What exists today (do not throw this away)

`app/globals.css` already ships a full CSS-only motion system, added in the
`feat/motion-system` work (see CLAUDE.md "Motion system" + memory `pathforge-motion-system.md`):

- **Preference gate**: `data-motion` on `<html>` — `"system"` (default, SSR) / `"full"` / `"off"`.
  Set via `components/settings/motion-settings.tsx` (a `useSyncExternalStore` control, no
  provider) and mirrored to `localStorage` under the key `pf-motion`. `app/layout.tsx` inlines a
  `MOTION_INIT` script before `<Providers>` that applies a stored `full`/`off` value pre-paint
  (no-flash), same pattern as next-themes.
- **CSS gating** (`app/globals.css` ~line 160-190): `@media (prefers-reduced-motion: reduce)`
  collapses all `animation`/`transition` durations+delays to `0.001ms` and iteration-count to 1
  **unless** `data-motion="full"` is set. A separate always-on rule collapses everything when
  `data-motion="off"`, regardless of OS setting. Both rules zero `animation-delay` too (required
  for `pf-stagger`, whose children sit invisible at their `from`-keyframe until their delay
  elapses — an un-gated delay would freeze staggered content off-screen).
- **Token layer**: `--pf-dur-fast: 140ms`, `--pf-dur: 240ms`, `--pf-dur-slow: 360ms`,
  `--pf-ease: cubic-bezier(0.22, 1, 0.36, 1)` (soft settle, for entrances), `--pf-ease-spring:
  cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot, for press/pop), `--pf-stagger-step: 45ms`.
- **`@utility` primitives**: `pf-fade-in`, `pf-rise` (translateY 10px + fade), `pf-scale-in`
  (scale 0.96 + fade), `pf-stagger` (auto-tags first 12 direct children via `nth-child` +
  `--pf-i`, only *then* falls back to manual `--pf-i` for longer/virtualized lists),
  `pf-hover-lift` (pointer-only `@media (hover: hover)`, translateY(-3px) + gold glow shadow),
  `pf-shimmer` (skeleton sheen).
- **Bespoke keyframe classes**: `.pf-route` / `pf-route-in` (route transitions, desktop
  fade+rise vs. mobile horizontal slide via swapped `--pf-route-x`/`--pf-route-y` custom props —
  **not** a media-nested `@keyframes`, because Tailwind v4 / Lightning CSS silently drops those),
  `.pf-sheet-in` (mobile full-screen section navigator), `.pf-view-fade` (Modern/Classic
  `SheetViewSwitch` cross-fade).
- **`<RouteTransition>`** (`components/motion/route-transition.tsx`): a tiny client wrapper, keyed
  by `usePathname()`, that re-mounts a `<div className="pf-route">` around already-rendered
  Server Component `children` on every navigation. No function props cross the RSC boundary — it
  just wraps a `ReactNode`.

**This CSS layer is correct and stays.** It is cheap (no JS, no bundle, RSC-safe by construction),
already tokenized, already gated, and covers "does something animate on entrance" everywhere in
the app (dashboard/characters/campaigns/compendium list staggers, button press
`active:scale-[0.97]`, skeleton shimmer). Motion is being added **only** where CSS genuinely can't
do the job — see §1. Do not port `pf-fade-in`/`pf-stagger`/`pf-hover-lift`/`pf-shimmer` usages to
Motion; leave them as CSS.

## 1. Why Motion (`motion/react`), and where it earns its bundle cost

Three things the current CSS system structurally cannot do, all of which the three S6 pillars
need:

1. **Spring physics with interruption.** CSS `transition`/`animation` restart from their *current*
   computed value on a mid-flight prop change, but they can't be driven by a physical spring model
   (mass/stiffness/damping) that responds naturally to being interrupted — e.g. a companion-sheet
   drawer being dragged, released, and re-grabbed mid-animation, or a chip's expand animation being
   cancelled by a fast second tap. Motion's spring physics interrupt and reverse naturally without
   a visible "jump."
2. **Shared-element / layout transitions.** The editor's chip→expanded-edit pattern
   (`entry-card.tsx` `<EntryCard>`, `picker-shell.tsx` `<StatChip>`) currently expands with a plain
   conditional render (`{open && <div>…</div>}`) — content pops in with no positional continuity.
   Motion's `layout` prop + `layoutId` (the shared-element primitive, ~FLIP under the hood) let a
   collapsed chip visually **become** its expanded card — the exact "fluid, animated, human" feel
   the editor-overhaul pillar calls for. CSS has no equivalent without hand-rolled FLIP math.
3. **Gesture recognition.** `drag`, `whileTap`, `whileHover` with velocity-aware `dragConstraints`/
   `dragElastic` are needed for the mobile section navigator, the companion sheet's mobile
   Simple/Advanced toggle, and (per the wizard spec) swipeable wizard steps. CSS `:active`/`:hover`
   give binary press states, not continuous gesture tracking.

**Why not React's `ViewTransition`:** it only activates under Next's
`experimental.viewTransition` flag, which requires the **experimental** React channel. This app is
pinned to **stable React 19.2.4** (verified in the motion-system work: `startViewTransition` never
fires). Adopting it would mean forking the React version for one feature — rejected, locked
decision.

**Why not "more CSS":** the CSS system does entrances, hover, and route-level transitions well.
What it cannot do is (a) coordinate a transition *across* a DOM remount (shared element), (b)
resolve interrupted mid-gesture state without jank, or (c) express drag/swipe. That gap is exactly
Motion's job. Using CSS for what CSS does well and Motion only for spring/shared-element/gesture
keeps the bundle cost proportional to the actual visual payoff.

### Dependency

Add `motion` (the package is called `motion`, imported as `motion/react` for the React bindings —
this **is** the Framer Motion successor, same team, same API surface as `framer-motion` post-v11
rename):

```bash
pnpm add motion
```

No `@types` package needed (ships its own types). Confirm peer-dep compatibility with React 19.2.4
before landing (Motion has supported React 19 since its v11 line; verify `pnpm ls motion` reports
no peer-warning after install).

## 2. The bridge: keeping `data-motion` authoritative over Motion

Motion has its own reduced-motion primitive (`useReducedMotion()`, which reads
`prefers-reduced-motion` directly) and its own `<MotionConfig reducedMotion="...">` provider. If
adopted as-is, it would **only** see the OS setting and would ignore the app's `data-motion`
preference — breaking the existing "Off always collapses, Full always animates" contract and
silently diverging from the CSS system on the same page. The bridge below makes `data-motion` the
single source of truth for both engines.

### `useShouldAnimate()` hook

Create `components/motion/use-should-animate.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

/**
 * Single source of truth for "should decorative motion play right now", shared by the CSS motion
 * system (data-motion + prefers-reduced-motion, see app/globals.css) and Motion (motion/react).
 * Mirrors the exact collapse logic already in globals.css:
 *   - data-motion="off"          -> never animate
 *   - data-motion="full"         -> always animate (ignores OS reduce-motion)
 *   - data-motion="system" (default) -> animate unless the OS requests reduced motion
 * Reads the DOM attribute + a MediaQueryList via useSyncExternalStore so it never needs a
 * useEffect+setState round trip and is SSR-safe (server snapshot = true, matching the CSS
 * default which always renders content, just possibly without motion on the client).
 */
function subscribe(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributeFilter: ["data-motion"] });
  mql.addEventListener("change", callback);
  return () => {
    observer.disconnect();
    mql.removeEventListener("change", callback);
  };
}

function getSnapshot(): boolean {
  const pref = document.documentElement.dataset.motion;
  if (pref === "off") return false;
  if (pref === "full") return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot(): boolean {
  return true; // SSR default mirrors data-motion="system" pre-hydration; CSS still gates the paint.
}

export function useShouldAnimate(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

Use this hook **everywhere** a Motion component is authored — never call `motion.div` with
hard-coded transitions unconditionally.

### `<PfMotionConfig>` wrapper (app-wide default)

Create `components/motion/pf-motion-config.tsx` and mount it once, high in the client tree (e.g.
inside `app/providers.tsx`, alongside whatever else lives there — confirm the exact file before
wiring; do not add a new provider layer if `Providers` already composes cleanly):

```tsx
"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { useShouldAnimate } from "./use-should-animate";

/**
 * App-wide Motion default: when data-motion/prefers-reduced-motion says "don't animate", every
 * motion.* component under this provider skips straight to its animate-target state (Motion's
 * reducedMotion="user" + our own resolved boolean via `never`/`always` — see below) instead of
 * running its transition. This is the Motion-side mirror of the CSS `@media
 * (prefers-reduced-motion: reduce)` block in globals.css; both must agree.
 */
export function PfMotionConfig({ children }: { children: ReactNode }) {
  const shouldAnimate = useShouldAnimate();
  return (
    <MotionConfig reducedMotion={shouldAnimate ? "never" : "always"} transition={{ duration: 0.24 }}>
      {children}
    </MotionConfig>
  );
}
```

Note the inverted-sounding prop: `MotionConfig`'s `reducedMotion` prop name describes *when
Motion should reduce motion*, so `"always"` means "always skip animation" (our collapsed state)
and `"never"` means "never force-skip" (our animating state) — confirm this against the installed
Motion version's docs/types at implementation time (`reducedMotion?: "user" | "always" | "never"`),
since API shape can shift across major versions. If a future Motion version exposes both a
"respect OS" and "respect this boolean" mode, prefer the explicit boolean derived from
`useShouldAnimate()` over Motion's own OS listener, so `data-motion` stays the one gate.

`MotionConfig`'s reduced-motion behavior degrades layout/opacity-only transforms to instant but by
default still tries to run `x`/`y`/`scale` — verify empirically (a quick manual test with
`data-motion="off"` + a `layoutId` chip expand) that it fully collapses; if any transform leaks
through, wrap the specific animated value in a ternary keyed on `useShouldAnimate()` instead of
relying solely on `MotionConfig` (e.g. `transition={shouldAnimate ? spring : { duration: 0 }}`).
**Always verify with the browser, don't assume the library's default is airtight** — the whole
point of this bridge is that `data-motion="off"` must be a hard guarantee, not "usually true."

> **VERIFIED (2026-07-09, motion-dom@12.42.2 source):** it is NOT airtight — the inverse of the
> guess above. `reducedMotion="always"` force-instants only `positionalKeys`
> (width/height/top/left/…) **plus transforms** (x/y/scale/rotate/…); **non-positional values —
> notably `opacity` — keep their full transition.** So the §3.1/§3.2 example patterns (which mix
> `opacity` with `x`/`height`) would still visibly fade under `data-motion="off"` if they relied
> on `<PfMotionConfig>` alone. RULE: every Motion component that animates `opacity` (or any other
> non-positional value) must ALSO branch on `useShouldAnimate()` per-component — render plain DOM
> or force `transition={{ duration: 0 }}` when it returns false. `ClassicZone`'s `animated` branch
> (character-editor.tsx) is the reference implementation.

**AnimatePresence exit + frozen props (2026-07-09, learned in Pillar 1):** an exiting child is
rendered from a **cached element with frozen props** — state changes (e.g. `disabled={!open}`)
never reach it, so an exit-animated form region stays interactive for the whole exit duration
(Tab lands inside the visually-collapsing content and can mutate fields). Until a pattern with
owned focus management exists (Pillar 2), prefer **enter-only** animation for interactive
content: omit `exit` so AnimatePresence unmounts synchronously, keeping `initial={false}` for
first-mount suppression.

### Per-component fallback pattern

For any component that can't rely solely on `<PfMotionConfig>` (e.g. it needs different variants
when motion is off, not just faster/instant ones — like skipping a `layoutId` shared-element
entirely and rendering both states as plain conditional DOM), call `useShouldAnimate()` directly
and branch:

```tsx
const shouldAnimate = useShouldAnimate();
return shouldAnimate ? (
  <motion.div layout layoutId={`entry-${id}`} transition={spring}>{content}</motion.div>
) : (
  <div>{content}</div>
);
```

## 3. Animation vocabulary — standardize these, don't invent per-component

All spring/duration tokens below should live in one file, `components/motion/tokens.ts`, imported
by every Motion consumer (mirrors the CSS `--pf-*` tokens so the two systems stay visually
consistent):

```ts
// components/motion/tokens.ts
export const pfSpring = { type: "spring", stiffness: 380, damping: 32 } as const; // snappy UI pop
export const pfSpringSoft = { type: "spring", stiffness: 260, damping: 30 } as const; // gentle settle
export const pfEase = [0.22, 1, 0.36, 1] as const; // matches --pf-ease
export const pfDurFast = 0.14; // seconds, matches --pf-dur-fast
export const pfDur = 0.24; // matches --pf-dur
export const pfDurSlow = 0.36; // matches --pf-dur-slow
export const pfStaggerStep = 0.045; // matches --pf-stagger-step
```

Tune the spring constants empirically against the CSS `--pf-ease`/`--pf-ease-spring` curves side
by side (open a page with both a CSS `pf-rise` element and a Motion spring element and eyeball
they read as "the same design system") — the numbers above are a reasonable starting point, not
gospel.

### 3.1 Section enter/exit — `AnimatePresence`

Use for content that mounts/unmounts conditionally where a plain CSS entrance (`pf-rise` on mount)
isn't enough because the element also needs an **exit** animation (CSS can't animate unmounting
DOM at all — this is Motion's core value-add over `pf-fade-in`/`pf-rise`). Candidates:
- Editor section switches inside the classic continuous-sheet zones (jump-to-section) — if the
  overhaul introduces exit transitions between panels.
- The mobile full-screen section navigator (`pf-sheet-in` today handles *entrance* only; if the
  overhaul wants a matching *exit* slide-down when dismissed, that requires `AnimatePresence`).
- Conflict banners / validation errors appearing and disappearing (`GestaltCollapseBanner`-style
  UI) — currently these likely just conditionally render with no exit.
- Wizard step transitions (forward/back) — see the wizard's own plan doc, but the mechanism is
  this one: `AnimatePresence mode="wait"` + `initial={false}` wrapping a `motion.div` keyed by
  step index, `x` slide direction chosen by whether moving forward or backward.

Pattern:

```tsx
<AnimatePresence mode="wait" initial={false}>
  <motion.div
    key={activeStepId}
    initial={{ opacity: 0, x: direction > 0 ? 24 : -24 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: direction > 0 ? -24 : 24 }}
    transition={{ duration: pfDurFast, ease: pfEase }}
  >
    {stepContent}
  </motion.div>
</AnimatePresence>
```

Keep `mode="wait"` for anything where overlapping enter/exit would look like double content
(wizard steps); use the default (simultaneous) mode for independent list items leaving a list
(e.g. removing a chip from a chip strip).

### 3.2 Shared-element / layout transitions — chip → expanded edit

This is the highest-value Motion use in the editor overhaul. Today `<EntryCard>`
(`components/character/editor/entry-card.tsx`) toggles `open` state and conditionally renders the
edit body below the header row — a hard cut, no continuity. Convert the header row + chip strip
into a `motion.div` with a stable `layoutId` per entry (e.g. `` `entry-${name}` ``, or better, a
real stable id off the underlying schema entity if one exists — check whether feats/features/
traits/inventory items carry a stable `id` field before falling back to `name`, since `name` isn't
guaranteed unique) so the collapsed chip and the expanded card are recognized by Motion as *the
same element* across the layout change, animating position/size instead of popping:

```tsx
<motion.div layout transition={pfSpring}>
  <motion.div layout="position" className="flex items-center justify-between …">
    {/* chip strip + Edit/Done button, unchanged content */}
  </motion.div>
  <AnimatePresence>
    {open && (
      <motion.div
        key="body"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: pfDur, ease: pfEase }}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
</motion.div>
```

Wrap the **parent list** (the accordion of `<EntryCard>`s) in `<LayoutGroup>` so siblings
reflow smoothly when one expands/collapses (Motion's `layout` prop on a sibling automatically
animates its position shift when a neighbor's height changes, instead of snapping).

Apply the same pattern to `picker-shell.tsx`'s `<StatChip>` if/when it gains an expand-in-place
mode, and to the companion sheet's Simple↔Advanced toggle if that swaps sections in place rather
than navigating.

**Do not** apply `layoutId` shared-element transitions across a route boundary /
`SheetViewSwitch`'s Modern⇄Classic swap — that swap crosses two independently server-rendered
`ReactNode`s with no shared component identity, so there's no element for Motion to track; keep
`.pf-view-fade` (CSS) for that cross-fade.

### 3.3 List stagger

CSS `pf-stagger` already handles *static* lists that fully re-render on mount (dashboard cards,
characters/campaigns lists). Reach for Motion's stagger only when the list is **dynamic** — items
are added/removed at runtime and need individual enter/exit (e.g. adding a talent chip to the
Spheres editor, adding a feat via the feat picker, removing a buff). Use
`AnimatePresence` + `layout` on each list item with a `staggerChildren`/`delayChildren` transition
on the parent `motion.ul`/`motion.div` via `variants`, keeping the numeric stagger step in sync
with `pfStaggerStep` above (45ms) so it reads identically to the CSS system:

```tsx
const listVariants = {
  visible: { transition: { staggerChildren: pfStaggerStep } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

<motion.ul variants={listVariants} initial="hidden" animate="visible">
  <AnimatePresence>
    {items.map((item) => (
      <motion.li key={item.id} layout variants={itemVariants} exit={{ opacity: 0, height: 0 }}>
        {/* ... */}
      </motion.li>
    ))}
  </AnimatePresence>
</motion.ul>
```

### 3.4 Press feedback

The global CSS `active:scale-[0.97]` on `components/ui/button.tsx` already covers plain button
press feedback app-wide — **leave it alone**. Reach for Motion's `whileTap`/`whileHover` only on
elements that need velocity-aware or draggable press feedback (e.g. a draggable chip, a swipeable
wizard-step card, a companion-sheet section that expands via a drag handle):

```tsx
<motion.div whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.02 }} transition={pfSpring}>
```

### 3.5 Page/route transitions — keep `<RouteTransition>` as CSS

Do **not** migrate `<RouteTransition>` to Motion. It works, is dependency-free, RSC-safe (wraps
opaque `children`), and a page-level fade+rise or slide has no shared-element or physics need that
CSS doesn't already satisfy. Reserve Motion's route-level tooling (`AnimatePresence` wrapping a
route tree) for a case CSS can't do — e.g. if the wizard needs its OWN internal step transitions
distinct from the outer route transition, that's `AnimatePresence` **inside** the wizard page, not
a replacement for `<RouteTransition>` itself. If a future need arises for exit animations on route
change (Next's App Router does not await a client-side exit animation before swapping RSC output,
so a true route exit transition needs more plumbing than `<RouteTransition>` provides today) — flag
it as a separate, scoped follow-up rather than folding it into this pass.

## 4. SSR / hydration / bundle-size notes

- **Every Motion consumer is a Client Component.** `motion/react` uses hooks, refs, and DOM
  measurement (`layout`) — it cannot render in a Server Component. Existing server-rendered
  content (view-model driven read views, `SheetViewSwitch`'s two `ReactNode`s) must **only** be
  wrapped by a Motion component the same way `<RouteTransition>` already wraps `children` today —
  never given a function prop, never itself converted to a Motion-authored component. If a
  read-view element wants motion (e.g. the dashboard's Companion card), wrap it exactly like
  `RouteTransition` wraps `children`: a thin client boundary that takes serializable/`ReactNode`
  props only. This is the same HARD RSC GOTCHA already governing the codebase — Motion doesn't
  relax it, it just adds one more place the mistake can happen.
- **First paint**: `motion/react`'s `initial`/`animate` props mean the *first* client render can
  briefly show the `initial` state before layout/paint settles, which on a server-rendered page
  can flash content that was already visible via SSR. Where a Motion-wrapped element also has SSR
  content (unlikely for editor-only surfaces, since those are already client-only, but relevant if
  applied to read-view cards), pass `initial={false}` so it skips the mount animation and starts
  at `animate` state immediately — reserve the mount animation for genuinely new client-side
  content (wizard steps, expand/collapse, list adds).
- **Bundle size**: `motion/react`'s core is tree-shakeable; import only `motion`, `AnimatePresence`,
  `MotionConfig`, `LayoutGroup` from `motion/react` (not the full `motion` umbrella export, which
  pulls in the vanilla/mini bundles too). Since every Motion consumer is already a Client Component
  living in an already-code-split route (editor pages, wizard pages), Next's route-level chunking
  keeps this from bloating the shared app shell — Motion is not imported from any Server Component
  or from `app/layout.tsx`/`app/providers.tsx`'s eagerly-shared surface beyond the thin
  `<PfMotionConfig>` wrapper (which itself only imports `MotionConfig`, the smallest piece).
  Do not import Motion inside `components/ui/*` primitives that are shared by both marketing
  (public, unauthenticated, must stay fast) and app routes unless a specific primitive's animation
  need is confirmed to justify it — prefer keeping Motion scoped to `components/character/editor/*`
  and the wizard's own component tree.
- **`useReducedMotion` / hydration mismatch risk**: because `useShouldAnimate()` (§2) reads
  `document.documentElement.dataset.motion` which is only reliably set after the `MOTION_INIT`
  inline script runs (pre-paint but technically before React hydrates), the hook's
  `getServerSnapshot` returns `true` unconditionally (matching `data-motion="system"`'s default
  animate-unless-OS-reduces behavior) — this can only under-animate on the very first client
  paint if the stored preference is `"off"`/`"full"` diverging from `"system"`, never crash or
  produce a hydration warning, since `useSyncExternalStore`'s contract explicitly allows the
  client snapshot to differ from the server snapshot on the first paint. Verify this in practice:
  set `data-motion="off"` via localStorage, hard-reload an editor page, confirm no transform
  flashes before settling to instant.
- **Testing**: Vitest/jsdom does not run real layout/animation frames. Existing tests for
  `use-character-editor.ts` etc. must keep working unchanged (Motion components render their
  children synchronously in jsdom; assert on final DOM state, not on animation timing). Do not add
  `waitFor`-style animation-completion assertions to unit tests — if a test needs to assert on
  post-animation state, render with `data-motion="off"` (or mock `useShouldAnimate` to return
  `false`) so transitions collapse to instant and the assertion is deterministic.

## 5. Coexistence: CSS `pf-*` utilities + Motion, side by side

Rule of thumb for every future PR: **default to the CSS utility; reach for Motion only when the
CSS system provably can't express the interaction** (spring interruption, shared-element,
gesture). Concretely:

| Need | Use |
|---|---|
| Entrance on mount (fade/rise/scale) for static content | CSS `pf-fade-in`/`pf-rise`/`pf-scale-in` |
| Staggered entrance, static list | CSS `pf-stagger` |
| Staggered entrance/exit, dynamic list (add/remove items) | Motion `AnimatePresence` + `layout` + stagger `variants` |
| Hover lift on a card | CSS `pf-hover-lift` |
| Button press feedback | CSS `active:scale-[0.97]` (already global) |
| Draggable / swipeable / velocity-aware press | Motion `drag`/`whileTap`/`whileHover` |
| Skeleton shimmer | CSS `pf-shimmer` |
| Route-level page transition | CSS `.pf-route` / `<RouteTransition>` (unchanged) |
| Modern/Classic sheet-view cross-fade | CSS `.pf-view-fade` (unchanged) |
| Chip ↔ expanded-edit shared element | Motion `layout`/`layoutId` |
| Mount+unmount transition (conditional render with exit) | Motion `AnimatePresence` |
| Wizard step forward/back transition | Motion `AnimatePresence mode="wait"` |

Both systems read the **same** preference (`data-motion`) via two independent but behaviorally
identical gates — the CSS `@media`/`[data-motion="off"]` rules for CSS animations, and
`useShouldAnimate()` → `<PfMotionConfig reducedMotion>` for Motion ones. When adding a new Motion
component, sanity-check it against all three `data-motion` states (`system` with OS reduce-motion
on/off, `full`, `off`) exactly as the existing CSS system already requires MotionSettings-driven
manual verification — there is no automated test that can catch a Motion component silently
ignoring the app preference, so this must be caught in adversarial review, not assumed correct
because `<PfMotionConfig>` exists in the tree.

## 6. Rollout sequencing (matches the locked pillar order)

1. **Companion sheets** (pillar 1, smallest/self-contained): land the dependency + `useShouldAnimate`
   + `<PfMotionConfig>` bridge here first, since it's the smallest surface to prove the bridge on.
   Likely Motion uses: Simple/Advanced toggle transition, statblock section expand/collapse.
2. **Editor overhaul** (pillar 2): the chip→expanded-edit `layoutId` pattern (§3.2) is the
   marquee use case — apply to `<EntryCard>` first (highest reuse: feats/features/traits/
   inventory/buffs all go through it), then `<StatChip>`/picker rows if they gain inline expand.
   Mobile section-navigator exit animation (§3.1) is a nice-to-have in the same pass.
3. **Create-character wizard** (pillar 3, built on the editor's section components per the locked
   "evolve in place" decision): step transitions (§3.1 `AnimatePresence mode="wait"`), plus reuse
   of whatever shared-element patterns pillar 2 established for any wizard step that previews a
   chip the way the editor does.

Each pillar's Motion usage should ship behind the same adversarial-review + gate discipline as
every other PathForge change: verify all three `data-motion` states in a real browser (motion
system has no automated coverage for "does the preference actually gate this new component" —
that's a manual/reviewer check every time), confirm no Server Component received a function prop,
and confirm `pnpm lint && pnpm test && pnpm typecheck` plus `pnpm build` stay green.
