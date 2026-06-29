"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Check, X } from "lucide-react";
import {
  acceptInvitationAction,
  declineInvitationAction,
  type MutationState,
} from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type PendingInvitation = {
  campaignId: string;
  name: string;
  description: string | null;
  gmName: string;
};

/**
 * The invitee's consent surface (§17): campaigns they've been invited to, with
 * Accept (joins as an active member) / Decline (removes the pending invite). Until
 * they accept, the invitation grants no access — these campaigns don't appear in
 * the main list and aren't readable.
 */
export function PendingInvitations({ invitations }: { invitations: PendingInvitation[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (invitations.length === 0) return null;

  const act = (campaignId: string, fn: (id: string) => Promise<MutationState>) => {
    setError(null);
    setBusyId(campaignId);
    startTransition(async () => {
      const res = await fn(campaignId);
      if (res.error) {
        setError(res.error);
        setBusyId(null);
        return;
      }
      // Leave busyId set through the refresh so the buttons stay disabled until
      // the server-rendered list updates (the row disappears on success).
      router.refresh();
    });
  };

  return (
    <Card className="mb-6 border-gold/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-gold" /> Pending invitations
          <Badge variant="gold">{invitations.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {invitations.map((inv) => {
          const busy = busyId === inv.campaignId;
          return (
            <div
              key={inv.campaignId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised/40 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{inv.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  Invited by {inv.gmName}
                  {inv.description ? ` · ${inv.description}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => act(inv.campaignId, acceptInvitationAction)}
                  disabled={busy}
                >
                  <Check className="size-4" /> Accept
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => act(inv.campaignId, declineInvitationAction)}
                  disabled={busy}
                >
                  <X className="size-4" /> Decline
                </Button>
              </div>
            </div>
          );
        })}
        {error && <p className="text-sm text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}
