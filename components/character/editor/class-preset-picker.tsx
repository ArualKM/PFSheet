"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  CLASS_CATALOG,
  applyClassPreset,
  skillRanksForLevel,
  type HpMethod,
  type ClassApplyReport,
} from "@pathforge/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NumberField } from "./fields";
import type { CharacterEditorApi } from "./use-character-editor";

const HP_LABELS: Record<HpMethod, string> = { manual: "Manual", average: "Average", max: "Max" };

export function ClassPresetPicker({
  ed,
  onApplied,
}: {
  ed: CharacterEditorApi;
  onApplied: (report: ClassApplyReport) => void;
}) {
  const maxHpNum = typeof ed.draft.health.maxHp === "number" ? ed.draft.health.maxHp : 0;
  const inPlay = maxHpNum > 0 || ed.draft.health.hitDice.length > 0;

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [level, setLevel] = useState(1);
  const [hpMethod, setHpMethod] = useState<HpMethod>(inPlay ? "manual" : "average");

  const preset = selectedKey ? CLASS_CATALOG.find((c) => c.key === selectedKey) ?? null : null;
  const intMod = ed.computed.abilities.int?.modifier ?? 0;

  // Preview the report on a clone so "this will…" matches exactly what Apply writes.
  let preview: ClassApplyReport | null = null;
  if (preset) {
    try {
      preview = applyClassPreset(structuredClone(ed.draft), { preset, level, hpMethod });
    } catch {
      preview = null;
    }
  }

  const apply = () => {
    if (!preset) return;
    const report = preview ?? { wrote: [], skipped: [], warnings: [], skillRankBudget: 0 };
    ed.update((c) => {
      applyClassPreset(c, { preset, level, hpMethod });
    });
    setSelectedKey(null);
    onApplied(report);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-raised/30 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-gold" />
        <span className="text-sm font-semibold text-foreground">Add a class from the catalog</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CLASS_CATALOG.map((c) => (
          <Button
            key={c.key}
            size="sm"
            variant={selectedKey === c.key ? "default" : "outline"}
            aria-pressed={selectedKey === c.key}
            onClick={() => setSelectedKey(c.key)}
          >
            {c.name}
          </Button>
        ))}
      </div>

      {preset && (
        <div className="space-y-3 rounded-md border border-border/70 p-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="gold">d{preset.hitDie}</Badge>
            <Badge variant="outline">BAB {preset.bab.replace("_", "-")}</Badge>
            <Badge variant="outline">Fort {preset.saves.fortitude}</Badge>
            <Badge variant="outline">Ref {preset.saves.reflex}</Badge>
            <Badge variant="outline">Will {preset.saves.will}</Badge>
            <Badge variant="outline">{preset.skillRanksPerLevel} ranks/lvl</Badge>
            {preset.caster && (
              <Badge variant="rune">
                {preset.caster.casterType} · {preset.caster.castingAbility.toUpperCase()}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Marks {preset.classSkillKeys.length} class skills (your existing ranks and marks are kept).
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-24">
              <NumberField label="Level" value={level} min={1} onChange={(v) => setLevel(Math.max(1, v))} />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Hit points</span>
              <div className="flex gap-1.5" role="group" aria-label="Hit point method">
                {(["manual", "average", "max"] as HpMethod[]).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={hpMethod === m ? "default" : "outline"}
                    aria-pressed={hpMethod === m}
                    onClick={() => setHpMethod(m)}
                  >
                    {HP_LABELS[m]}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {inPlay && hpMethod !== "manual" && (
            <p className="text-[11px] text-warning">
              This character already has HP — an auto HP method will overwrite its max HP.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            Skill ranks to spend at this level:{" "}
            <span className="text-foreground">{skillRanksForLevel(preset.skillRanksPerLevel, intMod, level)}</span>{" "}
            (assign these yourself — they&apos;re never auto-distributed).
          </p>

          {preview && (
            <div className="rounded bg-surface-sunken p-2 text-[11px]">
              <span className="font-medium text-foreground">This will:</span>
              <ul className="ml-4 list-disc text-muted-foreground">
                {preview.wrote.map((w, i) => (
                  <li key={`w${i}`}>{w}</li>
                ))}
                {preview.skipped.map((s, i) => (
                  <li key={`s${i}`}>{s}</li>
                ))}
              </ul>
              {preview.warnings.length > 0 && (
                <ul className="ml-4 mt-1 list-disc text-warning">
                  {preview.warnings.map((w, i) => (
                    <li key={`warn${i}`}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Button size="sm" onClick={apply}>
            Apply {preset.name} {level}
          </Button>
        </div>
      )}
    </div>
  );
}
