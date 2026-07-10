"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { LayoutGroup, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { useShouldAnimate } from "@/components/motion/use-should-animate";
import { pfDurFast, pfEase, pfSpringSoft } from "@/components/motion/tokens";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SectionSummary } from "./section-summary";
import type { CharacterEditorApi } from "./use-character-editor";

/**
 * The Modern layout's section canvas — S6 Pillar 2 (docs/S6_UX_OVERHAUL/02_MODERN_EDITOR.md).
 *
 * Stage 2: a vertical stack over EVERY section, in order — the ACTIVE section renders the full
 * tabpanel (Stage 1's exact ids/roles/fieldset/keyed inner entrance), every OTHER section collapses
 * to a cheap, read-only `<SectionSummary>` chip row. Tapping a summary card calls the SAME
 * `onSelectSection` the desktop rail uses.
 *
 * Review-driven constraints (Stage 1 + Stage 2 adversarial panels — each line closes a confirmed
 * finding; do not regress these):
 * - The `role="tabpanel"` container is NOT keyed (focus held on it survives sub switches); only the
 *   inner content wrapper remounts per panelKey.
 * - Entrance tracking lives HERE (EditorCanvas persists across section switches), not in the active
 *   card (which remounts per section and would reset it — cross-section switches must play the
 *   entrance too). The initial panel still renders at rest (no SSR opacity:0, no double-play with
 *   the localStorage nav restore, no stacking on .pf-view-fade).
 * - motion.div is ALWAYS mounted in both card types; motion is gated via the `layout` prop value
 *   and the entrance `initial`, never a div↔motion.div type swap (a live reduced-motion flip must
 *   not remount the panel mid-edit and eat uncommitted field state).
 * - `layoutDependency={activeSection}` so Motion re-measures the ~11 layout cards only on a section
 *   switch, not on every keystroke re-render of the draft.
 * - The active card renders an INERT header row with the same geometry as the summary button, so
 *   the second click of a double-click on a summary card lands on the header, not on whatever form
 *   control mounted underneath the cursor.
 * - Summary buttons carry `aria-label="Open <label>"` — without it the accessible name would
 *   concatenate the entire live chip row.
 * - ENTER-only, no AnimatePresence exit (frozen-props rule); `layout` animates position/size only,
 *   never opacity.
 * - Shared-element `layoutId` between the summary card and the expanded panel is DEFERRED to the
 *   Stage 4 polish: FLIP scale-distorts a full form panel mid-spring, and that trade-off needs
 *   real-browser verification (no authed session available when this shipped).
 */

/** Minimal structural shape the canvas needs from a sheet section. Deliberately NOT importing
 *  `SheetSection` from `character-editor.tsx` (which imports `EditorCanvas`) to avoid a module
 *  cycle — `character-editor.tsx`'s richer `SheetSection[]` (each item also carries a `render`
 *  closure) satisfies this structurally, so it passes straight through with no adapter. */
export type EditorCanvasSection = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  items: { key: string; label: string }[];
};

export function EditorCanvas({
  ed,
  sections,
  activeSection,
  activeSub,
  panelLabelId,
  onSelectSection,
  children,
}: {
  ed: CharacterEditorApi;
  sections: EditorCanvasSection[];
  activeSection: string;
  activeSub: string;
  panelLabelId: string;
  onSelectSection: (sectionKey: string, subKey: string) => void;
  children: ReactNode;
}) {
  const shouldAnimate = useShouldAnimate();
  const panelKey = `${activeSection}-${activeSub}`;

  // Adjust-state-during-render prev-key tracking, hoisted from the active card so it survives
  // cross-section remounts: `hasChanged` flips true on the first panel change after mount, and
  // every later panel (sub OR section switch) plays the entrance.
  const [prevKey, setPrevKey] = useState(panelKey);
  const [hasChanged, setHasChanged] = useState(false);
  if (prevKey !== panelKey) {
    setPrevKey(panelKey);
    if (!hasChanged) setHasChanged(true);
  }

  const activeMeta = sections.find((s) => s.key === activeSection);

  return (
    <LayoutGroup>
      <div className="space-y-3">
        {sections.map((section) =>
          section.key === activeSection ? (
            <ActiveSectionCard
              key={section.key}
              ed={ed}
              section={activeMeta ?? section}
              panelKey={panelKey}
              panelLabelId={panelLabelId}
              shouldAnimate={shouldAnimate}
              animateEntrance={shouldAnimate && hasChanged}
              layoutDependency={activeSection}
            >
              {children}
            </ActiveSectionCard>
          ) : (
            <SummaryCard
              key={section.key}
              section={section}
              ed={ed}
              shouldAnimate={shouldAnimate}
              layoutDependency={activeSection}
              onSelect={onSelectSection}
            />
          ),
        )}
      </div>
    </LayoutGroup>
  );
}

/** The active section's full editor — Stage 1's exact tabpanel body, plus an inert header row
 *  mirroring the summary button's geometry (double-click landing zone + visual continuity with the
 *  collapsed cards around it). */
function ActiveSectionCard({
  ed,
  section,
  panelKey,
  panelLabelId,
  shouldAnimate,
  animateEntrance,
  layoutDependency,
  children,
}: {
  ed: CharacterEditorApi;
  section: EditorCanvasSection;
  panelKey: string;
  panelLabelId: string;
  shouldAnimate: boolean;
  animateEntrance: boolean;
  layoutDependency: string;
  children: ReactNode;
}) {
  const locked = ed.status === "conflict";
  const Icon = section.icon;

  return (
    <motion.div layout={shouldAnimate} layoutDependency={layoutDependency} transition={pfSpringSoft}>
      <Card>
        {/* Inert header (NOT a button): same px-4 py-3 min-h-11 geometry as SummaryCard's button, so
            a double-click's second hit lands here instead of a freshly-mounted form control. */}
        <div className="flex min-h-11 items-center gap-3 border-b border-border/60 px-4 py-3">
          <Icon className="size-4 shrink-0 text-gold" />
          <span className="font-medium text-foreground">{section.label}</span>
        </div>
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
              initial={animateEntrance ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: pfDurFast, ease: pfEase }}
            >
              {children}
            </motion.div>
          </fieldset>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** A collapsed section: one 44px-tall button (icon + label + live chip summary + chevron) that
 *  jumps straight to that section's first sub-item. Plain button, no `aria-expanded` — activating
 *  it MOVES the expansion elsewhere rather than disclosing content in place, so it isn't a
 *  disclosure widget. `aria-label` keeps the accessible name to "Open <label>" instead of the
 *  entire concatenated chip row. */
function SummaryCard({
  section,
  ed,
  shouldAnimate,
  layoutDependency,
  onSelect,
}: {
  section: EditorCanvasSection;
  ed: CharacterEditorApi;
  shouldAnimate: boolean;
  layoutDependency: string;
  onSelect: (sectionKey: string, subKey: string) => void;
}) {
  const Icon = section.icon;
  const firstItemKey = section.items[0]?.key ?? section.key;

  return (
    <motion.div layout={shouldAnimate} layoutDependency={layoutDependency} transition={pfSpringSoft}>
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => onSelect(section.key, firstItemKey)}
          aria-label={`Open ${section.label}`}
          className="flex min-h-11 w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-raised/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
        >
          <Icon className="size-4 shrink-0 text-gold" />
          <span className="shrink-0 font-medium text-foreground">{section.label}</span>
          <SectionSummary sectionKey={section.key} ed={ed} />
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Card>
    </motion.div>
  );
}
