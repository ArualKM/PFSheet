"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { InventoryEditor } from "../../editor/inventory-editor";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/**
 * §4.3 "gear-step.tsx" — wraps `InventoryEditor` verbatim (a separate file from
 * `character-editor.tsx`, safe to import — takes exactly `{ ed }`). Above it: a starting-wealth
 * SUGGESTION pulled from the chosen class's `class_compendium.starting_wealth` (e.g. "5d6 × 10 gp").
 * Fetched once, client-side, by the class's NAME (the compendium builder writes
 * `identity.classes[i].name = <compendium row's name>` — see `applyCompendiumClass` /
 * `compendiumRowToPreset` — so matching on name is exact for any compendium-applied class; a custom
 * class with no compendium match just shows nothing). Never auto-applied to `wealth` — display only.
 */
export function GearStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  const className = ed.draft.identity.classes[0]?.name?.trim();
  // Keyed by the class it was fetched for — a stale suggestion for a different class filters out
  // at render (no synchronous setState-in-effect reset needed).
  const [suggestion, setSuggestion] = useState<{ className: string; text: string } | null>(null);

  useEffect(() => {
    if (!className) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("class_compendium")
          .select("starting_wealth")
          .eq("name", className)
          .maybeSingle();
        if (!cancelled && data?.starting_wealth) setSuggestion({ className, text: data.starting_wealth });
      } catch {
        // Best-effort suggestion only — a lookup failure just means no hint is shown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [className]);

  const wealthSuggestion = suggestion && suggestion.className === className ? suggestion.text : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Gear &amp; wealth</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          A rough starting-gold suggestion for your class, plus the full inventory editor — add
          weapons, armor, and gear, and set your coin totals.
        </p>
        {wealthSuggestion && (
          <p className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-xs text-foreground">
            Typical starting wealth for a {className}: <strong>{wealthSuggestion}</strong> — a
            suggestion only, nothing here is applied automatically.
          </p>
        )}
      </div>

      <InventoryEditor ed={ed} />
    </div>
  );
}
