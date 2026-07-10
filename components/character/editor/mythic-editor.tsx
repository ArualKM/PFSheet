"use client";

import { useState } from "react";
import { Plus, Search, Trash2, ChevronDown } from "lucide-react";
import { MYTHIC_PATHS, maxMythicPower, mythicSurgeDie, type MythicBlock } from "@pathforge/schema";
import type { CharacterEditorApi } from "./use-character-editor";
import { NumberField, SelectField } from "./fields";
import { StatChip } from "./picker-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MythicAbilityPicker, type MythicAbilityRow } from "./mythic-ability-picker";
import { cn } from "@/lib/utils";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function MythicEditor({ ed }: { ed: CharacterEditorApi }) {
  const mythic = ed.draft.mythic;
  const tier = mythic?.tier ?? 0;
  const max = maxMythicPower(tier);
  const current = Math.min(mythic?.mythicPowerCurrent ?? max, max);
  const boosts = mythic?.abilityBoosts ?? [];
  const pathAbilities = mythic?.pathAbilities ?? [];
  const [boostAbility, setBoostAbility] = useState("str");
  const [newAbilityName, setNewAbilityName] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const baseAbilities = ed.computed.summary.mythic?.baseAbilities ?? [];

  const ensure = (mut: (m: MythicBlock) => void) =>
    ed.update((c) => {
      if (!c.mythic) c.mythic = { tier: 0, path: "none", abilityBoosts: [], pathAbilities: [] };
      mut(c.mythic);
    });
  const spendPower = (delta: number) =>
    ensure((m) => {
      m.mythicPowerCurrent = Math.max(0, Math.min(maxMythicPower(m.tier), current + delta));
    });
  const addBoost = () =>
    ensure((m) => m.abilityBoosts.push({ id: newId("mboost"), tier: m.tier, ability: boostAbility }));
  const removeBoost = (id: string) =>
    ensure((m) => {
      m.abilityBoosts = m.abilityBoosts.filter((b) => b.id !== id);
    });
  const addPathAbility = () => {
    const name = newAbilityName.trim();
    if (!name) return;
    ensure((m) => m.pathAbilities.push({ id: newId("mpath"), name, category: "path" }));
    setNewAbilityName("");
  };
  const addFromCompendium = (row: MythicAbilityRow) =>
    ensure((m) => {
      const p = (row.path ?? "").toLowerCase();
      m.pathAbilities.push({
        id: newId("mpath"),
        name: row.name,
        category: p === "universal" ? "universal" : "path",
        path: (MYTHIC_PATHS as readonly string[]).includes(p) ? (p as MythicBlock["path"]) : undefined,
        tierGained: m.tier > 0 ? m.tier : undefined,
        description: row.description ?? undefined,
      });
    });
  const removePathAbility = (id: string) =>
    ensure((m) => {
      m.pathAbilities = m.pathAbilities.filter((a) => a.id !== id);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mythic layers a tier track on your class levels. Spend mythic power on the Surge ({mythicSurgeDie(tier) || "—"})
        and path abilities. Amazing Initiative adds +tier to initiative at tier 2+.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <NumberField
          label="Tier"
          value={tier}
          min={0}
          onChange={(v) => ensure((m) => (m.tier = Math.max(0, Math.min(10, v))))}
          className="w-20"
        />
        <SelectField
          label="Path"
          value={mythic?.path ?? "none"}
          onChange={(v) => ensure((m) => (m.path = v as MythicBlock["path"]))}
          options={MYTHIC_PATHS.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))}
          className="w-36"
        />
        <div className="pb-1 text-sm text-muted-foreground">
          +½ tier ={" "}
          <span className="font-semibold text-foreground">+{Math.floor(tier / 2)}</span> effective level
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <span className="text-sm font-medium text-foreground">Mythic power</span>
        <StatChip label="current" value={current} tone="gold" />
        <StatChip label="max" value={max} />
        <StatChip label="surge" value={mythicSurgeDie(tier) || "—"} tone="rune" />
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={current <= 0} onClick={() => spendPower(-1)}>
            − Spend
          </Button>
          <Button size="sm" variant="outline" disabled={current >= max} onClick={() => spendPower(1)}>
            +
          </Button>
          <Button size="sm" variant="ghost" onClick={() => ensure((m) => (m.mythicPowerCurrent = maxMythicPower(m.tier)))}>
            Rest
          </Button>
        </div>
      </div>
      <div className="space-y-2 border-t border-border/40 pt-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">Ability boosts (+2 each)</span>
          <div className="flex items-end gap-2">
            <select
              value={boostAbility}
              aria-label="Ability to boost"
              onChange={(e) => setBoostAbility(e.target.value)}
              className="h-11 rounded-md border border-border bg-background px-2 text-sm uppercase text-foreground sm:h-9"
            >
              {["str", "dex", "con", "int", "wis", "cha"].map((a) => (
                <option key={a} value={a}>
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={addBoost}>
              <Plus className="size-4" /> Add boost
            </Button>
          </div>
        </div>
        {boosts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No mythic ability increases yet. Each boost is a permanent +2 to the chosen ability.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {boosts.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs text-gold"
              >
                +2 {String(b.ability).toUpperCase()}
                <button
                  type="button"
                  aria-label={`Remove +2 ${String(b.ability).toUpperCase()} boost`}
                  onClick={() => removeBoost(b.id)}
                  className="text-gold/70 hover:text-gold"
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {baseAbilities.length > 0 && (
        <div className="space-y-2 border-t border-border/40 pt-3">
          <span className="text-sm font-semibold text-foreground">Base abilities (tier {tier})</span>
          <div className="space-y-1">
            {baseAbilities.map((a) => (
              <div key={a.name} className="rounded-md border border-border px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{a.name}</span>
                  <StatChip label="tier" value={a.tier} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 border-t border-border/40 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">Path &amp; universal abilities</span>
          <Button size="sm" variant="secondary" onClick={() => setShowPicker((v) => !v)}>
            <Search className="size-4" /> Browse abilities
          </Button>
        </div>
        {showPicker && (
          <MythicAbilityPicker
            characterPath={mythic?.path ?? "none"}
            addedNames={new Set(pathAbilities.map((a) => a.name.toLowerCase()))}
            onAdd={addFromCompendium}
            onClose={() => setShowPicker(false)}
          />
        )}
        <div className="flex items-center gap-2">
          <Input
            value={newAbilityName}
            aria-label="Path or universal ability name"
            placeholder="Or type a name by hand…"
            onChange={(e) => setNewAbilityName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPathAbility();
              }
            }}
            className="flex-1"
          />
          <Button size="sm" onClick={addPathAbility} disabled={!newAbilityName.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
        {pathAbilities.length === 0 ? (
          <p className="text-xs text-muted-foreground">No path or universal abilities recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {pathAbilities.map((a) => (
              <MythicAbilityRowItem key={a.id} ability={a} onRemove={() => removePathAbility(a.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One recorded path/universal ability: name + chips, with the rules text behind a disclosure. */
function MythicAbilityRowItem({
  ability,
  onRemove,
}: {
  ability: { id: string; name: string; category?: string; tierGained?: number; description?: string };
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border px-2 py-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          disabled={!ability.description}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-left text-foreground",
            ability.description && "hover:text-gold",
          )}
        >
          <span className="truncate">{ability.name}</span>
          {ability.category === "universal" && <StatChip value="universal" />}
          {ability.tierGained ? <StatChip label="tier" value={ability.tierGained} /> : null}
          {ability.description && (
            <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
          )}
        </button>
        <Button variant="ghost" size="icon" aria-label={`Remove ${ability.name}`} onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      {open && ability.description && (
        <p className="whitespace-pre-wrap border-t border-border/40 py-1.5 text-xs text-muted-foreground">
          {ability.description}
        </p>
      )}
    </div>
  );
}
