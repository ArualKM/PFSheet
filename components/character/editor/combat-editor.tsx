"use client";

import { Plus, Trash2, Swords, Gauge } from "lucide-react";
import { DEFAULT_FORMULAS, type AttackEntry } from "@pathforge/schema";
import { SelectField, TextField } from "./fields";
import type { CharacterEditorApi } from "./use-character-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatModifier } from "@/lib/utils";

const ATTACK_TYPES: AttackEntry["attackType"][] = ["melee", "ranged", "natural", "cmb", "special"];

const DEFAULT_ATTACK_FORMULA: Record<AttackEntry["attackType"], string> = {
  melee: DEFAULT_FORMULAS.attack.melee,
  natural: DEFAULT_FORMULAS.attack.melee,
  ranged: DEFAULT_FORMULAS.attack.ranged,
  cmb: DEFAULT_FORMULAS.attack.cmb,
  special: DEFAULT_FORMULAS.attack.melee,
};

const SPEED_MODES: { key: "base" | "withArmor" | "fly" | "swim" | "climb" | "burrow"; label: string }[] = [
  { key: "base", label: "Base (land)" },
  { key: "withArmor", label: "With armor" },
  { key: "fly", label: "Fly" },
  { key: "swim", label: "Swim" },
  { key: "climb", label: "Climb" },
  { key: "burrow", label: "Burrow" },
];

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Movement speeds — a Core/movement trait, surfaced in the editor's Core section (not under Attacks). */
export function SpeedEditor({ ed }: { ed: CharacterEditorApi }) {
  const speed = ed.draft.combat.speed;
  const computedSpeed = ed.computed.summary.speed;
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Gauge className="size-4" /> Speed
        {computedSpeed.bonus !== 0 && (
          <Badge variant="gold">
            {computedSpeed.total} ft {computedSpeed.bonus >= 0 ? "+" : ""}
            {computedSpeed.bonus} from buffs
          </Badge>
        )}
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {SPEED_MODES.map((m) => (
          <TextField
            key={m.key}
            label={m.label}
            value={speed[m.key] ?? ""}
            onChange={(v) =>
              ed.update((c) => {
                if (m.key === "base") c.combat.speed.base = v;
                else c.combat.speed[m.key] = v || undefined;
              })
            }
            placeholder={m.key === "base" ? "30 ft" : "—"}
          />
        ))}
      </div>
    </section>
  );
}

export function CombatEditor({ ed }: { ed: CharacterEditorApi }) {
  const attacks = ed.draft.combat.attacks;
  // Only manual attacks are editable rows here; weapon-generated computed attacks (id "pf:weapon:…")
  // are excluded so they can never shadow a manual row's computed values.
  const computedById = new Map(
    ed.computed.attacks.filter((a) => !a.id.startsWith("pf:weapon:")).map((a) => [a.id, a]),
  );

  const addAttack = () =>
    ed.update((c) =>
      c.combat.attacks.push({
        id: newId("atk"),
        name: "New attack",
        attackType: "melee",
        attackFormula: DEFAULT_ATTACK_FORMULA.melee,
        damageFormula: "1d6",
        enabled: true,
        conditionalModifiers: [],
        showInCombat: true,
      }),
    );

  const updateAttack = (i: number, patch: Partial<AttackEntry>) =>
    ed.update((c) => {
      const a = c.combat.attacks[i];
      if (a) Object.assign(a, patch);
    });

  return (
    <div className="space-y-6">

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Swords className="size-4" /> Attacks
          </h3>
          <Button size="sm" variant="secondary" onClick={addAttack}>
            <Plus className="size-4" /> Add attack
          </Button>
        </div>

        {attacks.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No attacks yet. Add a weapon or natural attack; the to-hit bonus is computed from your BAB,
            ability modifier, size, and any buffs.
          </p>
        )}

        <div className="space-y-2">
          {attacks.map((a, i) => {
            const computed = computedById.get(a.id);
            return (
              <div key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <TextField
                    label="Name"
                    value={a.name}
                    onChange={(v) => updateAttack(i, { name: v })}
                    className="min-w-[9rem] flex-1"
                  />
                  <SelectField
                    label="Type"
                    value={a.attackType}
                    options={ATTACK_TYPES.map((t) => ({ value: t, label: t }))}
                    onChange={(v) => {
                      const attackType = v as AttackEntry["attackType"];
                      // Only swap in the matching default if the user hasn't customized the formula.
                      const wasDefault =
                        !a.attackFormula ||
                        Object.values(DEFAULT_ATTACK_FORMULA).includes(a.attackFormula);
                      updateAttack(i, {
                        attackType,
                        ...(wasDefault ? { attackFormula: DEFAULT_ATTACK_FORMULA[attackType] } : {}),
                      });
                    }}
                    className="w-[8rem]"
                  />
                  <div className="flex h-10 items-center gap-2">
                    <Badge variant="rune">{a.enabled === false ? "—" : formatModifier(computed?.attackBonus ?? 0)}</Badge>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={a.enabled !== false}
                        aria-label={`${a.name} enabled`}
                        onChange={(e) => updateAttack(i, { enabled: e.target.checked })}
                        className="size-4 accent-[var(--pf-gold)]"
                      />
                      On
                    </label>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => ed.update((c) => c.combat.attacks.splice(i, 1))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <TextField label="Damage" value={a.damageFormula ?? ""} onChange={(v) => updateAttack(i, { damageFormula: v })} placeholder="1d8+3" />
                  <TextField label="Damage type" value={a.damageType ?? ""} onChange={(v) => updateAttack(i, { damageType: v })} placeholder="S / P / B" />
                  <TextField label="Crit" value={a.critRange ?? ""} onChange={(v) => updateAttack(i, { critRange: v })} placeholder="19-20/x2" />
                  <TextField label="Range" value={a.range ?? ""} onChange={(v) => updateAttack(i, { range: v })} placeholder="—" />
                </div>
                <TextField
                  label="To-hit formula"
                  value={a.attackFormula ?? ""}
                  onChange={(v) => updateAttack(i, { attackFormula: v })}
                  className="mt-2 font-mono"
                  hint={computed?.warnings.length ? computed.warnings.join("; ") : undefined}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
