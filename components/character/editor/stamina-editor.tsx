"use client";

import { ChevronDown } from "lucide-react";
import { COMBAT_TRICKS, type StaminaBlock } from "@pathforge/schema";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField } from "./fields";
import { StatChip } from "./picker-shell";
import { Button } from "@/components/ui/button";

export function StaminaEditor({ ed }: { ed: CharacterEditorApi }) {
  const stamina = ed.draft.stamina;
  const max = ed.computed.summary.stamina?.max ?? 0;
  const current = Math.min(stamina?.current ?? 0, max);
  const featNames = new Set(ed.draft.feats.list.map((f) => f.name.toLowerCase()));
  const tricks = COMBAT_TRICKS.filter((t) => featNames.has(t.feat.toLowerCase()));

  const ensure = (mut: (s: StaminaBlock) => void) =>
    ed.update((c) => {
      if (!c.stamina) c.stamina = { current: 0, bonusMax: 0 };
      mut(c.stamina);
    });
  const spend = (delta: number) => ensure((s) => (s.current = Math.max(0, Math.min(max, s.current + delta))));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Stamina pool = base attack bonus + Con modifier + bonus ({max}). Spend it to power combat tricks
        tied to your combat feats; it refreshes fully on a rest and partially after a full attack.
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <span className="text-sm font-medium text-foreground">Stamina</span>
        <StatChip label="current" value={current} tone="rune" />
        <StatChip label="max" value={max} />
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={current <= 0} onClick={() => spend(-1)}>
            − Spend
          </Button>
          <Button size="sm" variant="outline" disabled={current >= max} onClick={() => spend(1)}>
            + Regain
          </Button>
          <Button size="sm" variant="ghost" onClick={() => ensure((s) => (s.current = max))}>
            Rest
          </Button>
        </div>
      </div>
      <details className="group">
        <summary className="tap-target flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          Adjust maximum
        </summary>
        <NumberField
          label="Bonus to max"
          value={stamina?.bonusMax ?? 0}
          min={0}
          onChange={(v) => ensure((s) => (s.bonusMax = v))}
          className="mt-2 w-32"
        />
      </details>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Combat tricks</h4>
        {tricks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No combat feats with a known stamina trick yet. Add combat feats on the Feats tab.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tricks.map((t) => (
              <li key={t.feat}>
                <span className="font-medium text-foreground">{t.feat}</span>{" "}
                <span className="text-xs text-muted-foreground">({t.cost} stamina)</span> — {t.effect}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
