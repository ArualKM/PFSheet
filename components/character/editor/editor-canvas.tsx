"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { useShouldAnimate } from "@/components/motion/use-should-animate";
import { pfDurFast, pfEase } from "@/components/motion/tokens";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CharacterEditorApi } from "./use-character-editor";

/**
 * The Modern layout's section panel — S6 Pillar 2 Stage 1 (docs/S6_UX_OVERHAUL/02_MODERN_EDITOR.md).
 * Same one-section-at-a-time behavior as before, but a section/sub change now plays a Motion
 * fade+rise entrance on the incoming content instead of an instant swap.
 *
 * Shaped by the Stage 1 adversarial review — each choice below closes a confirmed finding:
 * - The Card/CardContent `role="tabpanel"` container is NOT keyed: it stays the same DOM node for
 *   the layout's lifetime (as pre-Stage-1), so focus held on it survives a section switch. Only
 *   the inner content wrapper remounts per `panelKey`.
 * - The entrance plays ONLY when `panelKey` CHANGES after mount (adjust-state-during-render
 *   prev-key tracking). The initial panel renders at rest: SSR never bakes `opacity:0` into the
 *   active section for reduced-motion users; the localStorage nav-restore swap doesn't double-play
 *   a default-section entrance first; and mounting the layout doesn't stack this entrance on the
 *   outer `.pf-view-fade` wrapper's own fade+rise.
 * - `motion.div` renders in BOTH motion states (gated via `initial`, not a div↔motion.div type
 *   swap), so a live OS reduced-motion flip can't force-remount the panel mid-edit. With
 *   `initial={false}` there is no transition at all — data-motion="off" stays a hard guarantee
 *   (the animation includes opacity, which MotionConfig reducedMotion="always" does NOT gate —
 *   see ANIMATION_SYSTEM.md).
 * - ENTER-only, no AnimatePresence exit: exiting Motion children render from cached elements with
 *   frozen props and would stay interactive while fading (ANIMATION_SYSTEM.md).
 */
export function EditorCanvas({
  ed,
  panelKey,
  panelLabelId,
  children,
}: {
  ed: CharacterEditorApi;
  /** Changes when the active section/sub changes — remounts the inner content with an entrance. */
  panelKey: string;
  panelLabelId: string;
  children: ReactNode;
}) {
  const shouldAnimate = useShouldAnimate();
  const locked = ed.status === "conflict";

  // Adjust-state-during-render (the sanctioned derived-state form of the EntryCard idiom):
  // `hasChanged` flips true the first time panelKey differs from the previous render's, so the
  // INITIAL panel mounts at rest and only genuine section/sub switches play the entrance.
  const [prevKey, setPrevKey] = useState(panelKey);
  const [hasChanged, setHasChanged] = useState(false);
  if (prevKey !== panelKey) {
    setPrevKey(panelKey);
    if (!hasChanged) setHasChanged(true);
  }

  return (
    <Card>
      <CardContent
        id="editor-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={panelLabelId}
        className="p-5"
      >
        {/* While a conflict is open, lock the fields so an edit can't race the resolution
            (which is keyed to the snapshot shown in the banner). Resolve first, then edit. */}
        <fieldset
          disabled={locked}
          className={cn("m-0 min-w-0 border-0 p-0", locked && "opacity-60")}
        >
          <motion.div
            key={panelKey}
            initial={shouldAnimate && hasChanged ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: pfDurFast, ease: pfEase }}
          >
            {children}
          </motion.div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
