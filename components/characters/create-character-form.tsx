"use client";

import { useActionState } from "react";
import { createCharacterAction, type CreateCharacterState } from "@/lib/actions/characters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateCharacterForm() {
  const [state, formAction, pending] = useActionState<CreateCharacterState, FormData>(
    createCharacterAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Character name</Label>
        <Input id="name" name="name" placeholder="Seraphina Vale" autoFocus required maxLength={120} />
        <p className="text-xs text-muted-foreground">
          You can change this — and everything else — afterwards.
        </p>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Forging…" : "Create character"}
      </Button>
    </form>
  );
}
