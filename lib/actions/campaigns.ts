"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { OPTIONAL_RULE_MODULES } from "@pathforge/schema";
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
  if (name.length > 120) return { error: "Name is too long (120 character max)." };
  const description = ((formData.get("description") as string | null) ?? "").trim().slice(0, 2000) || null;

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

/**
 * Edit a campaign's name/description. RLS (`campaigns_update_gm`) limits this to the owner or a
 * GM-role member; the `.select()` confirms a row actually changed so an RLS-filtered 0-row write
 * can't report false success.
 */
export async function updateCampaignDetailsAction(
  campaignId: string,
  name: string,
  description: string,
): Promise<MutationState> {
  const { supabase } = await authedClient();
  const clean = name.trim();
  if (!clean) return { error: "Give your campaign a name." };
  if (clean.length > 120) return { error: "Name is too long (120 character max)." };
  const { data, error } = await supabase
    .from("campaigns")
    .update({ name: clean, description: description.trim().slice(0, 2000) || null })
    .eq("id", campaignId)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "You don't have permission to edit this campaign." };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

/**
 * Set a campaign's enabled optional-rule modules (§17.2). Keys are validated against the catalog
 * (junk dropped) and de-duped before persisting as the `enabled_modules` jsonb array. Same RLS +
 * 0-row guard as the details edit.
 */
export async function updateCampaignModulesAction(
  campaignId: string,
  moduleKeys: string[],
): Promise<MutationState> {
  const { supabase } = await authedClient();
  const valid = new Set(OPTIONAL_RULE_MODULES.map((m) => m.key));
  const clean = [...new Set(moduleKeys)].filter((k) => valid.has(k));
  const { data, error } = await supabase
    .from("campaigns")
    .update({ enabled_modules: clean })
    .eq("id", campaignId)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "You don't have permission to edit this campaign." };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
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

/**
 * Invite a member by their public handle. RLS requires the actor to be a GM. The
 * row is inserted as `status: "invited"` (pending) — it grants NO access until the
 * invitee accepts (see migration 0020): a pending member can't read the campaign,
 * passes no GM check, and isn't on the roster. Consent is the invitee's to give.
 */
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
    .insert({ campaign_id: campaignId, user_id: profile.id, role: "player", status: "invited" });
  if (error) {
    // A unique (campaign_id, user_id) collision means there's already an active
    // member OR an outstanding invitation for this player.
    if (error.code === "23505") return { error: "That player is already invited or in this campaign." };
    return { error: error.message };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

/**
 * Accept a pending invitation: flip the caller's OWN membership from `invited`
 * to `active`. A compare-and-swap (`.eq("status","invited")`) makes this a no-op
 * if the invitation was already accepted or withdrawn. RLS (`members_accept_self`)
 * + the `protect_member_self_update` trigger guarantee this can ONLY ever be a
 * clean accept — role/campaign are pinned, so no privilege escalation is possible.
 */
export async function acceptInvitationAction(campaignId: string): Promise<MutationState> {
  const { supabase, user } = await authedClient();
  const { data, error } = await supabase
    .from("campaign_members")
    .update({ status: "active" })
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .eq("status", "invited")
    .select("campaign_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That invitation is no longer available." };
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

/**
 * Decline a pending invitation: delete the caller's OWN `invited` row. Scoped to
 * `status: "invited"` so it can never silently remove an already-accepted (active)
 * membership — leaving an active campaign is a separate, deliberate action.
 */
export async function declineInvitationAction(campaignId: string): Promise<MutationState> {
  const { supabase, user } = await authedClient();
  const { data, error } = await supabase
    .from("campaign_members")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .eq("status", "invited")
    .select("campaign_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That invitation is no longer available." };
  revalidatePath("/campaigns");
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
