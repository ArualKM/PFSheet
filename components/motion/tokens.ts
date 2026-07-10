// Motion (motion/react) animation vocabulary — standardize on these, don't invent per-component
// tokens. Mirrors the CSS `--pf-*` tokens in app/globals.css so the two systems stay visually
// consistent. See docs/S6_UX_OVERHAUL/ANIMATION_SYSTEM.md §3.
export const pfSpring = { type: "spring", stiffness: 380, damping: 32 } as const; // snappy UI pop
export const pfSpringSoft = { type: "spring", stiffness: 260, damping: 30 } as const; // gentle settle
export const pfEase = [0.22, 1, 0.36, 1] as const; // matches --pf-ease
export const pfDurFast = 0.14; // seconds, matches --pf-dur-fast
export const pfDur = 0.24; // matches --pf-dur
export const pfDurSlow = 0.36; // matches --pf-dur-slow
export const pfStaggerStep = 0.045; // matches --pf-stagger-step
