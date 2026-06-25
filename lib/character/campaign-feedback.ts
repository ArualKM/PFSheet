import "server-only";
import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { isModuleKeyEnabled } from "@pathforge/schema";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabledModuleKeys, moduleName } from "./campaign-modules";

/**
 * Player-facing GM feedback for a character (§17.3 review loop, §17.2 module
 * inheritance). Loads — for every campaign the character is on — its review
 * status, the GM's open change requests, player-visible notes, the latest review
 * summary, and any campaign rule modules the character hasn't adopted. Read as the
 * character owner (RLS), with campaign names/modules read via the admin client
 * since a player isn't necessarily a member of a campaign their character is in.
 */
export type FeedbackRequest = { id: string; body: string; targetPath: string | null; createdAt: string };
export type FeedbackNote = { id: string; body: string; createdAt: string };

export type CampaignFeedbackItem = {
  campaignId: string;
  campaignName: string;
  status: string;
  reviewSummary: string | null;
  openRequests: FeedbackRequest[];
  playerNotes: FeedbackNote[];
  missingModules: { key: string; name: string }[];
};

export async function loadCampaignFeedback(
  characterId: string,
  userId: string,
  character: PathForgeCharacterV1,
): Promise<CampaignFeedbackItem[]> {
  const supabase = await createClient();

  const { data: ccRows } = await supabase
    .from("campaign_characters")
    .select("campaign_id, gm_review_status")
    .eq("character_id", characterId);
  if (!ccRows || ccRows.length === 0) return [];

  const campaignIds = ccRows.map((r) => r.campaign_id);

  const [{ data: comments }, { data: notes }, { data: reviews }, campaigns] = await Promise.all([
    supabase
      .from("character_comments")
      .select("id, body, target_path, author_id, campaign_id, created_at")
      .eq("character_id", characterId)
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("gm_notes")
      .select("id, body, campaign_id, created_at")
      .eq("character_id", characterId)
      .eq("visibility", "player_visible")
      .order("created_at", { ascending: false }),
    supabase
      .from("gm_reviews")
      .select("campaign_id, summary, created_at")
      .eq("character_id", characterId)
      .order("created_at", { ascending: false }),
    createAdminClient().from("campaigns").select("id, name, enabled_modules").in("id", campaignIds),
  ]);

  const campById = new Map((campaigns.data ?? []).map((c) => [c.id, c]));

  // Latest review summary per campaign (rows already sorted newest-first).
  const latestSummary = new Map<string, string | null>();
  for (const r of reviews ?? []) {
    if (!latestSummary.has(r.campaign_id)) latestSummary.set(r.campaign_id, r.summary);
  }

  return ccRows.map((cc) => {
    const camp = campById.get(cc.campaign_id);
    const campModuleKeys = enabledModuleKeys(camp?.enabled_modules);
    const missingModules = campModuleKeys
      .filter((k) => !isModuleKeyEnabled(character, k))
      .map((k) => ({ key: k, name: moduleName(k) }));

    return {
      campaignId: cc.campaign_id,
      campaignName: camp?.name ?? "Campaign",
      status: cc.gm_review_status,
      reviewSummary: latestSummary.get(cc.campaign_id) ?? null,
      openRequests: (comments ?? [])
        // GM change requests addressed to the player (not the player's own comments).
        .filter((c) => c.campaign_id === cc.campaign_id && c.author_id !== userId)
        .map((c) => ({ id: c.id, body: c.body, targetPath: c.target_path, createdAt: c.created_at ?? "" })),
      playerNotes: (notes ?? [])
        .filter((n) => n.campaign_id === cc.campaign_id)
        .map((n) => ({ id: n.id, body: n.body, createdAt: n.created_at ?? "" })),
      missingModules,
    };
  });
}
