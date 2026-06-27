"use client";

import { useActionState } from "react";
import { X } from "lucide-react";
import { createCampaignAction, type CreateCampaignState } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Controlled create form — rendered full-width below the page header by CampaignsHeader. */
export function CampaignCreateForm({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState<CreateCampaignState, FormData>(
    createCampaignAction,
    {},
  );

  return (
    <Card className="mb-6 w-full">
      <CardContent className="p-5">
        <form action={formAction} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Create a campaign</h2>
            <Button type="button" variant="ghost" size="icon" onClick={onClose}>
              <X className="size-4" />
              <span className="sr-only">Cancel</span>
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Name</Label>
            <Input
              id="campaign-name"
              name="name"
              required
              autoFocus
              placeholder="The Shattered Star"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-description">Description (optional)</Label>
            <textarea
              id="campaign-description"
              name="description"
              rows={2}
              maxLength={500}
              placeholder="A Varisian treasure hunt for shards of the Sihedron."
              className="flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            />
          </div>
          {state.error && <p className="text-sm text-danger">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create campaign"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
