"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Campaign + membership server actions (§17). All writes run through the
 * request-scoped (RLS) client, so the database — not app code — is the final
 * authority on who may do what: a GM can build a roster and review, but never
 * edits a player's canonical sheet. The "GM cannot edit" rule lives in RLS
 * (see migration 0002); these actions never touch the `characters` table.
 */
async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function userDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> }): string {
  const meta =
    user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  return user.email?.split("@")[0] ?? "Game Master";
}

const MANAGEABLE_ROLES = ["gm", "assistant_gm", "player", "viewer"] as const;
type ManageableRole = (typeof MANAGEABLE_ROLES)[number];

export type CreateCampaignState = { error?: string };

/**
 * Create a campaign and seat the creator as its `owner` member (so campaign-role
 * checks treat them as a GM). Redirects to the new campaign on success.
 */
export async function createCampaignAction(
  _prev: CreateCampaignState,
  formData: FormData,
): Promise<CreateCampaignState> {
  const { supabase, user } = await authedClient();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) return { error: "Give your campaign a name." };
  const description = ((formData.get("description") as string | null) ?? "").trim() || null;

  // Backstop: ensure the owner has a profile row (the FK target).
  await supabase
    .from("profiles")
    .upsert(
      { id: user.id, display_name: userDisplayName(user) },
      { onConflict: "id", ignoreDuplicates: true },
    );

  const { data, error } = await supabase
    .from("campaigns")
    .insert({ owner_id: user.id, name, description, system_key: "pf1e" })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the campaign." };

  // Seat the owner as a member so has_campaign_role() recognizes them as GM.
  const { error: memberError } = await supabase
    .from("campaign_members")
    .insert({ campaign_id: data.id, user_id: user.id, role: "owner", status: "active" });
  if (memberError && memberError.code !== "23505") {
    return { error: `Campaign created, but seating you as GM failed: ${memberError.message}` };
  }

  redirect(`/campaigns/${data.id}`);
}

export async function deleteCampaignAction(campaignId: string): Promise<{ error?: string }> {
  const { supabase } = await authedClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);
  if (error) return { error: error.message };
  redirect("/campaigns");
}

export type MutationState = { error?: string; ok?: boolean };

/** Attach a character to a campaign's roster. RLS lets the character's owner or a
 * campaign GM do this; the new row starts `unreviewed`. */
export async function addCharacterToCampaignAction(
  campaignId: string,
  characterId: string,
): Promise<MutationState> {
  const { supabase, user } = await authedClient();
  const { error } = await supabase
    .from("campaign_characters")
    .insert({ campaign_id: campaignId, character_id: characterId, added_by: user.id });
  if (error) {
    if (error.code === "23505") return { error: "That character is already in this campaign." };
    return { error: error.message };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function removeCharacterFromCampaignAction(
  campaignId: string,
  characterId: string,
): Promise<MutationState> {
  const { supabase } = await authedClient();
  const { error } = await supabase
    .from("campaign_characters")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("character_id", characterId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

const ARCHIVE_REASONS = ["dead", "on_break", "retired", "left", "other"] as const;

/**
 * Archive a roster character (§17 — dead PC, player on break, retired, left)
 * instead of removing it, keeping its review status + history. RLS lets a GM or
 * the character owner do this.
 */
export async function archiveRosterCharacterAction(
  campaignId: string,
  characterId: string,
  reason: string,
): Promise<MutationState> {
  const archiveReason = (ARCHIVE_REASONS as readonly string[]).includes(reason) ? reason : "other";
  const { supabase } = await authedClient();
  const { error } = await supabase
    .from("campaign_characters")
    .update({ archived_at: new Date().toISOString(), archive_reason: archiveReason })
    .eq("campaign_id", campaignId)
    .eq("character_id", characterId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/gm`);
  return { ok: true };
}

export async function restoreRosterCharacterAction(
  campaignId: string,
  characterId: string,
): Promise<MutationState> {
  const { supabase } = await authedClient();
  const { error } = await supabase
    .from("campaign_characters")
    .update({ archived_at: null, archive_reason: null })
    .eq("campaign_id", campaignId)
    .eq("character_id", characterId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/gm`);
  return { ok: true };
}

/** Invite a member by their public handle. RLS requires the actor to be a GM. */
export async function inviteMemberAction(
  campaignId: string,
  handle: string,
): Promise<MutationState> {
  const { supabase } = await authedClient();
  // Handles are stored lowercased (see updateProfileAction) — match case-insensitively.
  const clean = handle.trim().replace(/^@/, "").toLowerCase();
  if (!clean) return { error: "Enter a player's handle." };

  const { data: profile, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("handle", clean)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!profile) return { error: `No player found with the handle @${clean}.` };

  const { error } = await supabase
    .from("campaign_members")
    .insert({ campaign_id: campaignId, user_id: profile.id, role: "player", status: "active" });
  if (error) {
    if (error.code === "23505") return { error: "That player is already in this campaign." };
    return { error: error.message };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function updateMemberRoleAction(
  campaignId: string,
  userId: string,
  role: string,
): Promise<MutationState> {
  if (!MANAGEABLE_ROLES.includes(role as ManageableRole)) return { error: "Invalid role." };
  const { supabase } = await authedClient();
  const { error } = await supabase
    .from("campaign_members")
    .update({ role })
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function removeMemberAction(
  campaignId: string,
  userId: string,
): Promise<MutationState> {
  const { supabase } = await authedClient();
  const { error } = await supabase
    .from("campaign_members")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}
