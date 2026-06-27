"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Crown, Trash2 } from "lucide-react";
import {
  inviteMemberAction,
  updateMemberRoleAction,
  removeMemberAction,
} from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type CampaignMember = {
  userId: string;
  name: string;
  handle: string | null;
  role: string;
  isOwner: boolean;
  isSelf: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  gm: "Game Master",
  assistant_gm: "Assistant GM",
  player: "Player",
  viewer: "Viewer",
};

const ASSIGNABLE_ROLES = ["gm", "assistant_gm", "player", "viewer"] as const;

export function CampaignMembers({
  campaignId,
  members,
  canManage,
}: {
  campaignId: string;
  members: CampaignMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const invite = () => {
    setError(null);
    startTransition(async () => {
      const res = await inviteMemberAction(campaignId, handle);
      if (res.error) {
        setError(res.error);
        return;
      }
      setHandle("");
      router.refresh();
    });
  };

  const changeRole = (userId: string, role: string) => {
    setError(null);
    startTransition(async () => {
      const res = await updateMemberRoleAction(campaignId, userId, role);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  const remove = (userId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await removeMemberAction(campaignId, userId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised/40 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                {m.isOwner && <Crown className="size-3.5 text-gold" />}
                {m.name}
                {m.isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
              </div>
              {m.handle && <div className="text-xs text-muted-foreground">@{m.handle}</div>}
            </div>
            <div className="flex items-center gap-2">
              {canManage && !m.isOwner ? (
                <>
                  <label className="sr-only" htmlFor={`role-${m.userId}`}>
                    Role for {m.name}
                  </label>
                  <select
                    id={`role-${m.userId}`}
                    value={ASSIGNABLE_ROLES.includes(m.role as (typeof ASSIGNABLE_ROLES)[number]) ? m.role : "player"}
                    disabled={pending}
                    onChange={(e) => changeRole(m.userId, e.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-2 text-xs text-foreground disabled:opacity-60 md:h-10"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    onClick={() => remove(m.userId)}
                    aria-label={`Remove ${m.name}`}
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </>
              ) : (
                <Badge variant={m.isOwner ? "gold" : "default"}>
                  {ROLE_LABELS[m.role] ?? m.role}
                </Badge>
              )}
            </div>
          </li>
        ))}
      </ul>

      {canManage && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Invite by @handle"
              className="h-9 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  invite();
                }
              }}
            />
            <Button type="button" size="sm" variant="secondary" onClick={invite} disabled={pending || !handle.trim()}>
              <UserPlus className="size-4" /> Invite
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Players are found by the handle on their profile.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
