"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCampaignRole, isCharacterInRoster } from "@/lib/character/gm-access";
import type { Database } from "@/lib/supabase/types";

/**
 * GM review actions (§17.3). Authorization is enforced two ways, by design:
 *  - The RLS-gated inserts (gm_reviews / gm_notes / character_comments) only
 *    succeed for an actual campaign GM, so they double as the access check.
 *  - Privileged admin-client work (snapshot on approve, reading a private sheet to
 *    duplicate it) runs ONLY after that gated check passes, or behind an explicit
 *    GM-role check. No action ever writes to the player's `characters` row.
 */
type Json = Database["public"]["Tables"]["characters"]["Insert"]["sheet_data"];

async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const DECISIONS = ["in_review", "changes_requested", "approved", "approved_with_notes", "rejected"] as const;
type Decision = (typeof DECISIONS)[number];

const NOTE_VISIBILITIES = ["gm_only", "player_visible", "party_visible"] as const;
type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

export type ReviewState = { error?: string; ok?: boolean };

export type SubmitReviewInput = {
  campaignId: string;
  characterId: string;
  decision: Decision;
  checklist: Record<string, boolean>;
  summary: string;
};

/**
 * Record a GM decision: writes a gm_reviews row, sets the roster status, and — for
 * approvals — captures an "approved" snapshot via the admin client (RLS blocks GM
 * snapshot inserts because the GM isn't an editor; that block is intentional).
 */
export async function submitReviewAction(input: SubmitReviewInput): Promise<ReviewState> {
  const { campaignId, characterId, decision, checklist, summary } = input;
  if (!DECISIONS.includes(decision)) return { error: "Invalid review decision." };
  const { supabase, user } = await authedClient();

  // RLS-gated: only a campaign GM whose roster includes this character passes.
  const { error: reviewError } = await supabase.from("gm_reviews").insert({
    campaign_id: campaignId,
    character_id: characterId,
    reviewer_id: user.id,
    status: decision,
    checklist: checklist as Json,
    summary: summary.trim() || null,
  });
  if (reviewError) return { error: reviewError.message };

  let approvedSnapshotId: string | null = null;
  if (decision === "approved" || decision === "approved_with_notes") {
    // The gm_reviews insert above already proved GM authorization. Capture the
    // "approved" snapshot now; if we can't, abort BEFORE marking the roster
    // approved — an approval must never exist without its snapshot, which the
    // §16.3 stale-after-changes detection depends on.
    const admin = createAdminClient();
    const { data: char, error: charError } = await admin
      .from("characters")
      .select("name, sheet_data")
      .eq("id", characterId)
      .single();
    if (charError || !char) {
      return { error: "Couldn't read the sheet to capture an approval snapshot. Please retry." };
    }
    const parsedSheet = safeParseCharacter(char.sheet_data);
    if (!parsedSheet.ok) {
      return { error: "The sheet failed validation, so it can't be approved." };
    }
    const computedSnap = computeCharacter(parsedSheet.character);
    const { data: snap, error: snapError } = await admin
      .from("character_snapshots")
      .insert({
        character_id: characterId,
        created_by: user.id,
        label: `Approved — ${char.name}`,
        reason: "gm_approval",
        sheet_data: char.sheet_data,
        computed_summary: computedSnap.summary as unknown as Json,
        computed_values: computedSnap as unknown as Json,
      })
      .select("id")
      .single();
    if (snapError || !snap) {
      return { error: "Couldn't capture the approval snapshot. Please retry." };
    }
    approvedSnapshotId = snap.id;
  }

  const update: { gm_review_status: Decision; approved_snapshot_id?: string } = {
    gm_review_status: decision,
  };
  if (approvedSnapshotId) update.approved_snapshot_id = approvedSnapshotId;

  const { error: rosterError } = await supabase
    .from("campaign_characters")
    .update(update)
    .eq("campaign_id", campaignId)
    .eq("character_id", characterId);
  if (rosterError) return { error: rosterError.message };

  revalidatePath(`/campaigns/${campaignId}/gm/${characterId}`);
  revalidatePath(`/campaigns/${campaignId}/gm`);
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

export async function createGmNoteAction(
  campaignId: string,
  characterId: string,
  body: string,
  visibility: string,
): Promise<ReviewState> {
  const text = body.trim();
  if (!text) return { error: "Write a note first." };
  const vis = (NOTE_VISIBILITIES.includes(visibility as NoteVisibility) ? visibility : "gm_only") as NoteVisibility;
  const { supabase, user } = await authedClient();
  const { error } = await supabase.from("gm_notes").insert({
    campaign_id: campaignId,
    character_id: characterId,
    author_id: user.id,
    visibility: vis,
    body: text,
  });
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}/gm/${characterId}`);
  return { ok: true };
}

export type CreateCommentInput = {
  campaignId: string;
  characterId: string;
  targetPath?: string;
  body: string;
};

/** Flag a field / comment on a specific value (a player-visible change request). */
export async function createCommentAction(input: CreateCommentInput): Promise<ReviewState> {
  const text = input.body.trim();
  if (!text) return { error: "Describe the change you want first." };
  const { supabase, user } = await authedClient();
  const { error } = await supabase.from("character_comments").insert({
    character_id: input.characterId,
    campaign_id: input.campaignId,
    author_id: user.id,
    target_path: input.targetPath?.trim() || null,
    body: text,
    status: "open",
  });
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${input.campaignId}/gm/${input.characterId}`);
  revalidatePath(`/characters/${input.characterId}`);
  return { ok: true };
}

export async function setCommentStatusAction(
  commentId: string,
  status: string,
  paths: { campaignId: string; characterId: string },
): Promise<ReviewState> {
  if (!["open", "resolved", "dismissed", "archived"].includes(status)) return { error: "Invalid status." };
  const { supabase } = await authedClient();
  const { error } = await supabase.from("character_comments").update({ status }).eq("id", commentId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${paths.campaignId}/gm/${paths.characterId}`);
  revalidatePath(`/characters/${paths.characterId}`);
  return { ok: true };
}

/**
 * Duplicate a roster character into the GM's own account as an editable private
 * sandbox (§10). Authorized explicitly (GM role + on roster) before the admin read,
 * because the source sheet may be private and otherwise invisible to the GM.
 */
export async function duplicateToSandboxAction(
  campaignId: string,
  characterId: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await authedClient();

  const ctx = await resolveCampaignRole(supabase, campaignId, user.id);
  if (!ctx?.isGm) return { error: "Only a campaign GM can duplicate a sheet." };
  if (!(await isCharacterInRoster(supabase, campaignId, characterId))) {
    return { error: "That character isn't on this campaign's roster." };
  }

  const admin = createAdminClient();
  const { data: source } = await admin.from("characters").select("sheet_data").eq("id", characterId).single();
  if (!source) return { error: "Character not found." };

  const parsed = safeParseCharacter(source.sheet_data);
  if (!parsed.ok) return { error: "The sheet failed validation and can't be duplicated." };
  const sheet = parsed.character;
  sheet.identity.name = `${sheet.identity.name} (GM sandbox)`;
  const computed = computeCharacter(sheet);

  // Backstop the GM's own profile row (FK target), then create THEIR character.
  await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: user.email?.split("@")[0] ?? "Game Master" }, { onConflict: "id", ignoreDuplicates: true });

  const { data: created, error } = await supabase
    .from("characters")
    .insert({
      owner_id: user.id,
      name: sheet.identity.name,
      system_key: "pf1e",
      schema_version: sheet.schemaVersion,
      sheet_data: sheet as unknown as Json,
      computed_summary: computed.summary as unknown as Json,
      visibility: "private",
      last_calculated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "Could not duplicate the character." };

  redirect(`/characters/${created.id}`);
}
