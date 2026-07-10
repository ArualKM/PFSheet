"use client";

import { ChevronDown } from "lucide-react";
import { maxHeroPoints, type HeroPointsBlock } from "@pathforge/schema";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField } from "./fields";
import { StatChip } from "./picker-shell";
import { Button } from "@/components/ui/button";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function HeroPointsEditor({ ed }: { ed: CharacterEditorApi }) {
  const hp = ed.draft.heroPoints;
  const max = maxHeroPoints(hp ?? {});
  const current = Math.min(hp?.current ?? 1, max);

  const ensure = (mut: (h: HeroPointsBlock) => void) =>
    ed.update((c) => {
      if (!c.heroPoints) c.heroPoints = { current: 1, bonusMax: 0, log: [] };
      mut(c.heroPoints);
    });
  const adjust = (delta: number, kind: HeroPointsBlock["log"][number]["kind"], reason: string) =>
    ensure((h) => {
      const m = maxHeroPoints(h);
      const next = Math.max(0, Math.min(m, h.current + delta));
      if (next === h.current) return;
      h.current = next;
      h.log = [{ id: newId("hp"), delta, kind, reason }, ...(h.log ?? [])].slice(0, 20);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Hero points don&apos;t renew on rest — spend them for a +8 bonus, a reroll, an extra action, or to
        cheat death.
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <span className="text-sm font-medium text-foreground">Hero points</span>
        <StatChip label="current" value={current} tone="gold" />
        <StatChip label="max" value={max} />
        {hp?.heroesFortune && <StatChip value={"Hero's Fortune"} tone="rune" />}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={current <= 0} onClick={() => adjust(-1, "special", "Spent a hero point")}>
            − Spend
          </Button>
          <Button size="sm" variant="outline" disabled={current >= max} onClick={() => adjust(1, "award", "Awarded a hero point")}>
            + Award
          </Button>
        </div>
      </div>
      <details className="group">
        <summary className="tap-target flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          Adjust maximum
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          <label className="flex h-11 items-center gap-1.5 text-sm text-foreground sm:h-9">
            <input
              type="checkbox"
              checked={!!hp?.heroesFortune}
              onChange={(e) => ensure((h) => (h.heroesFortune = e.target.checked || undefined))}
              className="size-4 accent-[var(--pf-gold)]"
            />
            Hero&apos;s Fortune feat (+1 max)
          </label>
          <NumberField
            label="Other bonus to max"
            value={hp?.bonusMax ?? 0}
            min={0}
            onChange={(v) => ensure((h) => (h.bonusMax = v))}
            className="w-32"
          />
        </div>
      </details>
      {hp?.log && hp.log.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</h4>
          <ul className="space-y-0.5 text-sm">
            {hp.log.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-baseline gap-2">
                <span className={e.delta >= 0 ? "tnum text-gold" : "tnum text-danger"}>
                  {e.delta >= 0 ? `+${e.delta}` : e.delta}
                </span>
                <span className="text-muted-foreground">{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
