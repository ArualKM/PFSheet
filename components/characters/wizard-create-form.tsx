"use client";

import { useActionState } from "react";
import { createWizardCharacterAction, type CreateCharacterState } from "@/lib/actions/characters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The guided-setup twin of `<CreateCharacterForm>` (S6 Pillar 3 §4.1) — same one-field contract,
 *  posts to `createWizardCharacterAction` instead, which redirects into `/characters/{id}/wizard`
 *  rather than the read view. Kept as its own component (not a prop-driven variant of
 *  `CreateCharacterForm`) so the existing blank-create flow's behavior/tests stay untouched. */
export function WizardCreateForm() {
  const [state, formAction, pending] = useActionState<CreateCharacterState, FormData>(
    createWizardCharacterAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="wizard-name">Character name</Label>
        <Input id="wizard-name" name="name" placeholder="Seraphina Vale" required maxLength={120} />
        <p className="text-xs text-muted-foreground">
          You can change this — and everything else — as you go.
        </p>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Forging…" : "Begin guided setup"}
      </Button>
    </form>
  );
}
