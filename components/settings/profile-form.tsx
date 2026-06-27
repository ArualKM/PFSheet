"use client";

import { useActionState, useState } from "react";
import { updateProfileAction, type ProfileFormState } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({
  displayName,
  handle,
}: {
  displayName: string;
  handle: string;
}) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    updateProfileAction,
    {},
  );

  // Controlled so the displayed value always matches what will be stored (the handle is normalized live;
  // both fields snap to the server's canonical values after a save).
  const [dn, setDn] = useState(displayName);
  const [h, setH] = useState(handle);
  const [lastValues, setLastValues] = useState(state.values);
  if (state.values !== lastValues) {
    setLastValues(state.values);
    if (state.values) {
      setDn(state.values.displayName);
      setH(state.values.handle);
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="display_name">Display name</Label>
        <Input
          id="display_name"
          name="display_name"
          value={dn}
          onChange={(e) => setDn(e.target.value)}
          maxLength={80}
          placeholder="Your name"
          autoComplete="name"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="handle">Handle</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">@</span>
          <Input
            id="handle"
            name="handle"
            value={h}
            onChange={(e) => setH(e.target.value.replace(/^@/, "").toLowerCase())}
            maxLength={32}
            placeholder="yourhandle"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="handle-hint"
            className="flex-1"
          />
        </div>
        <p id="handle-hint" className="text-xs text-muted-foreground">
          3–32 characters: lowercase letters, numbers, or underscores. GMs invite you to campaigns by
          your handle. Leave blank to clear it.
        </p>
      </div>
      <div aria-live="polite" className="min-h-[1.25rem]">
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.ok && !state.warning && <p className="text-sm text-success">Profile saved.</p>}
        {state.warning && <p className="text-sm text-warning">{state.warning}</p>}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
