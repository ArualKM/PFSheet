"use client";

import { SelectField, TextAreaField, TextField } from "../../editor/fields";
import type { CharacterEditorApi } from "../../editor/use-character-editor";

/**
 * §4.3 "details-step.tsx" — narrative fields only, wizard-native. `ProfileEditor` (backstory) AND
 * the alignment/deity/homeland fields on `IdentityEditor` both live INLINE in
 * `character-editor.tsx` — importing either drags the whole ~5,400-line editor graph into the wizard
 * bundle (the same rule the Skills/Gear steps follow), so this step writes `identity.*` /
 * `profile.backstory` directly, mirroring the exact `ed.update` shapes those inline editors use.
 */
const ALIGNMENTS = [
  { value: "", label: "Unset" },
  { value: "LG", label: "Lawful Good" },
  { value: "NG", label: "Neutral Good" },
  { value: "CG", label: "Chaotic Good" },
  { value: "LN", label: "Lawful Neutral" },
  { value: "N", label: "True Neutral" },
  { value: "CN", label: "Chaotic Neutral" },
  { value: "LE", label: "Lawful Evil" },
  { value: "NE", label: "Neutral Evil" },
  { value: "CE", label: "Chaotic Evil" },
];

export function DetailsStep({ ed }: { ed: CharacterEditorApi; characterId: string }) {
  const { identity, profile } = ed.draft;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Details</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Flavor — alignment, deity, backstory. None of this affects the math, and you can come back
          to it anytime.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" value={identity.name} onChange={(v) => ed.update((c) => (c.identity.name = v))} />
        <SelectField
          label="Alignment"
          value={identity.alignment ?? ""}
          onChange={(v) => ed.update((c) => (c.identity.alignment = v || undefined))}
          options={ALIGNMENTS}
        />
        <TextField label="Deity" value={identity.deity ?? ""} onChange={(v) => ed.update((c) => (c.identity.deity = v || undefined))} />
        <TextField
          label="Homeland"
          value={identity.homeland ?? ""}
          onChange={(v) => ed.update((c) => (c.identity.homeland = v || undefined))}
        />
      </div>

      <TextAreaField
        label="Backstory"
        value={profile.backstory ?? ""}
        rows={6}
        onChange={(v) => ed.update((c) => (c.profile.backstory = v || undefined))}
      />
    </div>
  );
}
