"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, Loader2, Cloud, Undo2, Plus, Trash2, ExternalLink } from "lucide-react";
import { ABILITY_KEYS, type PathForgeCharacterV1, type AbilityKey } from "@pathforge/schema";
import { useCharacterEditor, type SaveStatus } from "./use-character-editor";
import { NumberField, TextField, TextAreaField } from "./fields";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatModifier } from "@/lib/utils";

const TABS = ["Identity", "Abilities", "Health", "Saves", "Profile"] as const;
type Tab = (typeof TABS)[number];

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export function CharacterEditor({
  characterId,
  initial,
}: {
  characterId: string;
  initial: PathForgeCharacterV1;
}) {
  const ed = useCharacterEditor(characterId, initial);
  const [tab, setTab] = useState<Tab>("Identity");

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-current={tab === t ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === t
                    ? "bg-surface-raised text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={ed.undo}
              disabled={!ed.canUndo}
              title="Undo last change"
            >
              <Undo2 className="size-4" /> Undo
            </Button>
            <SaveStatusBadge status={ed.status} error={ed.error} />
          </div>
        </div>

        <Card>
          <CardContent className="p-5">
            {tab === "Identity" && <IdentityEditor ed={ed} />}
            {tab === "Abilities" && <AbilitiesEditor ed={ed} />}
            {tab === "Health" && <HealthEditor ed={ed} />}
            {tab === "Saves" && <SavesEditor ed={ed} />}
            {tab === "Profile" && <ProfileEditor ed={ed} />}
          </CardContent>
        </Card>
      </div>

      <aside className="h-fit lg:sticky lg:top-20">
        <LivePreview ed={ed} characterId={characterId} />
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Editors                                                                    */
/* -------------------------------------------------------------------------- */

type EditorApi = ReturnType<typeof useCharacterEditor>;

function IdentityEditor({ ed }: { ed: EditorApi }) {
  const id = ed.draft.identity;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" value={id.name} onChange={(v) => ed.update((c) => (c.identity.name = v))} />
        <TextField label="Race" value={id.race ?? ""} onChange={(v) => ed.update((c) => (c.identity.race = v))} />
        <TextField label="Alignment" value={id.alignment ?? ""} onChange={(v) => ed.update((c) => (c.identity.alignment = v))} placeholder="LG, N, CE…" />
        <TextField label="Size" value={id.size ?? ""} onChange={(v) => ed.update((c) => (c.identity.size = v))} placeholder="Medium" />
        <TextField label="Deity" value={id.deity ?? ""} onChange={(v) => ed.update((c) => (c.identity.deity = v))} />
        <TextField label="Homeland" value={id.homeland ?? ""} onChange={(v) => ed.update((c) => (c.identity.homeland = v))} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Classes</h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              ed.update((c) => {
                c.identity.classes.push({
                  id: `class_${c.identity.classes.length + 1}_${Date.now().toString(36)}`,
                  name: "Class",
                  level: 1,
                });
                c.identity.totalLevel = c.identity.classes.reduce((s, cl) => s + cl.level, 0);
              })
            }
          >
            <Plus className="size-4" /> Add class
          </Button>
        </div>
        <div className="space-y-2">
          {id.classes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No classes yet. Add a class to set your level and hit dice.
            </p>
          )}
          {id.classes.map((cl, i) => (
            <div key={cl.id} className="flex items-end gap-2 rounded-lg border border-border p-2">
              <TextField
                label="Class"
                value={cl.name}
                onChange={(v) =>
                  ed.update((c) => {
                    const target = c.identity.classes[i];
                    if (target) target.name = v;
                  })
                }
                className="flex-1"
              />
              <NumberField
                label="Level"
                value={cl.level}
                min={0}
                onChange={(v) =>
                  ed.update((c) => {
                    const target = c.identity.classes[i];
                    if (target) target.level = v;
                    c.identity.totalLevel = c.identity.classes.reduce((s, x) => s + x.level, 0);
                  })
                }
                className="w-24"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove class"
                onClick={() =>
                  ed.update((c) => {
                    c.identity.classes.splice(i, 1);
                    c.identity.totalLevel = c.identity.classes.reduce((s, x) => s + x.level, 0);
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Total level: <span className="font-semibold text-foreground">{id.totalLevel}</span>
        </p>
      </div>

      <NumberField
        label="Base attack bonus (BAB)"
        value={typeof ed.draft.combat.bab.total === "number" ? ed.draft.combat.bab.total : 0}
        min={0}
        onChange={(v) => ed.update((c) => (c.combat.bab.total = v))}
        hint="Drives melee/ranged attack and CMB/CMD."
        className="max-w-xs"
      />
    </div>
  );
}

function AbilitiesEditor({ ed }: { ed: EditorApi }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter each ability score; modifiers update live and flow into AC, saves, attacks, and skills.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {ABILITY_KEYS.map((key) => {
          const score = ed.draft.abilities.primary[key];
          const mod = ed.computed.abilities[key]?.modifier ?? 0;
          return (
            <div key={key} className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{ABILITY_NAMES[key]}</span>
                <Badge variant="gold">{formatModifier(mod)}</Badge>
              </div>
              <NumberField
                label="Score"
                value={score?.score ?? 10}
                min={0}
                onChange={(v) =>
                  ed.update((c) => {
                    c.abilities.primary[key].score = v;
                  })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HealthEditor({ ed }: { ed: EditorApi }) {
  const h = ed.draft.health;
  const maxHp = typeof h.maxHp === "number" ? h.maxHp : 0;
  return (
    <div className="grid max-w-md gap-4 sm:grid-cols-3">
      <NumberField label="Max HP" value={maxHp} min={0} onChange={(v) => ed.update((c) => (c.health.maxHp = v))} />
      <NumberField label="Current HP" value={h.currentHp} onChange={(v) => ed.update((c) => (c.health.currentHp = v))} />
      <NumberField label="Temp HP" value={h.tempHp} min={0} onChange={(v) => ed.update((c) => (c.health.tempHp = v))} />
    </div>
  );
}

function SavesEditor({ ed }: { ed: EditorApi }) {
  const s = ed.draft.defenses.savingThrows;
  const total = ed.computed.saves;
  const rows: Array<{ key: "fortitude" | "reflex" | "will"; label: string }> = [
    { key: "fortitude", label: "Fortitude" },
    { key: "reflex", label: "Reflex" },
    { key: "will", label: "Will" },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Enter the class base save; the ability modifier is added automatically.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{r.label}</span>
              <Badge variant="rune">{formatModifier(total[r.key].value)}</Badge>
            </div>
            <NumberField
              label="Base"
              value={s[r.key].base}
              onChange={(v) =>
                ed.update((c) => {
                  c.defenses.savingThrows[r.key].base = v;
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileEditor({ ed }: { ed: EditorApi }) {
  const p = ed.draft.profile;
  return (
    <div className="space-y-4">
      <TextField label="Quote" value={p.quote ?? ""} onChange={(v) => ed.update((c) => (c.profile.quote = v))} />
      <TextAreaField label="Backstory" value={p.backstory ?? ""} rows={6} onChange={(v) => ed.update((c) => (c.profile.backstory = v))} />
      <TextAreaField
        label="Appearance"
        value={p.appearance.description ?? ""}
        rows={3}
        onChange={(v) => ed.update((c) => (c.profile.appearance.description = v))}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Live preview + status                                                      */
/* -------------------------------------------------------------------------- */

function LivePreview({ ed, characterId }: { ed: EditorApi; characterId: string }) {
  const s = ed.computed.summary;
  const cells: Array<{ label: string; value: string | number }> = [
    { label: "AC", value: s.ac },
    { label: "Touch", value: s.touch },
    { label: "Flat", value: s.flatFooted },
    { label: "CMD", value: s.cmd },
    { label: "HP", value: `${s.hp.current}/${s.hp.max}` },
    { label: "Init", value: formatModifier(s.initiative) },
    { label: "Fort", value: formatModifier(s.fortitude) },
    { label: "Reflex", value: formatModifier(s.reflex) },
    { label: "Will", value: formatModifier(s.will) },
  ];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Live values
          </h2>
          <Link
            href={`/characters/${characterId}`}
            className="inline-flex items-center gap-1 text-xs text-rune hover:underline"
          >
            Overview <ExternalLink className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {cells.map((c) => (
            <div key={c.label} className="rounded-lg border border-border bg-surface-raised p-2 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {c.label}
              </div>
              <div className="tnum text-base font-semibold text-foreground">{c.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_META: Record<SaveStatus, { label: string; icon: typeof Check; className: string }> = {
  saved: { label: "Saved", icon: Check, className: "text-success" },
  unsaved: { label: "Unsaved", icon: Cloud, className: "text-muted-foreground" },
  saving: { label: "Saving…", icon: Loader2, className: "text-rune" },
  error: { label: "Save failed", icon: CircleAlert, className: "text-danger" },
};

function SaveStatusBadge({ status, error }: { status: SaveStatus; error: string | null }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.className)}
      title={error ?? undefined}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("size-3.5", status === "saving" && "animate-spin")} />
      {meta.label}
    </span>
  );
}
