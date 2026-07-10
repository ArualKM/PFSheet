"use client";

import { ChevronDown } from "lucide-react";
import { HONOR_CODES, HONOR_EVENTS, honorBaseline, type HonorBlock } from "@pathforge/schema";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField, SelectField } from "./fields";
import { StatChip } from "./picker-shell";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function HonorEditor({ ed }: { ed: CharacterEditorApi }) {
  const honor = ed.draft.honor;
  const computed = ed.computed.summary.honor;
  const baseline = honorBaseline(ed.draft);

  const ensure = (mut: (h: HonorBlock) => void) =>
    ed.update((c) => {
      if (!c.honor) c.honor = { code: "general", events: [] };
      mut(c.honor);
    });
  const addEvent = (delta: number, reason: string) =>
    ensure((h) => {
      h.events = [{ id: newId("honor"), delta, reason }, ...(h.events ?? [])].slice(0, 50);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Honor runs 0–100, starting at your Charisma score + level ({baseline}). At 0 you are dishonored:
        −2 on Will saves and Charisma-based skills.
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <span className="text-sm font-medium text-foreground">Honor</span>
        <StatChip label="score" value={computed?.score ?? baseline} tone={computed?.dishonored ? "poor" : "gold"} />
        <StatChip label="tier" value={computed?.tier ?? "—"} />
        {computed?.dishonored && <StatChip value="dishonored" tone="poor" />}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          label="Honor code"
          value={honor?.code ?? "general"}
          onChange={(v) => ensure((h) => (h.code = v as HonorBlock["code"]))}
          options={HONOR_CODES.map((c) => ({ value: c, label: c[0]!.toUpperCase() + c.slice(1) }))}
          className="w-40"
        />
        <details className="group">
          <summary className="tap-target flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            Baseline override
          </summary>
          <NumberField
            label="Baseline override"
            value={honor?.baselineOverride ?? baseline}
            onChange={(v) => ensure((h) => (h.baselineOverride = v === baseline ? undefined : v))}
            className="mt-2 w-32"
          />
        </details>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record an event</h4>
        <div className="flex flex-wrap gap-1.5">
          {HONOR_EVENTS.map((e) => (
            <button
              key={e.label}
              type="button"
              onClick={() => addEvent(e.delta, e.label)}
              className="tap-target rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-gold/50"
            >
              {e.label} {e.delta >= 0 ? `+${e.delta}` : e.delta}
            </button>
          ))}
        </div>
      </div>

      {honor?.events && honor.events.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h4>
          <ul className="space-y-0.5 text-sm">
            {honor.events.slice(0, 8).map((e, i) => (
              <li key={e.id} className="flex items-baseline gap-2">
                <span className={e.delta >= 0 ? "tnum text-gold" : "tnum text-danger"}>
                  {e.delta >= 0 ? `+${e.delta}` : e.delta}
                </span>
                <span className="flex-1 text-muted-foreground">{e.reason}</span>
                <button
                  type="button"
                  aria-label="Remove event"
                  onClick={() => ed.update((c) => void c.honor?.events.splice(i, 1))}
                  className="tap-target -my-1 -mr-1 inline-flex size-6 items-center justify-center rounded text-xs text-muted-foreground hover:text-danger"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
