import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * GM authorization for the campaign audit flow. A campaign loads through RLS only
 * for its owner/members, so resolving a role here doubles as an access gate. The
 * helpers take whichever client the caller already has (RLS client in pages, the
 * authed action client in server actions) so the authorization logic lives in one
 * place. They never grant edit rights — the GM Audit View is read-only by design.
 */
const GM_ROLES = new Set(["owner", "gm", "assistant_gm"]);

type DB = SupabaseClient<Database>;

export type CampaignRoleContext = {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    owner_id: string;
    enabled_modules: Database["public"]["Tables"]["campaigns"]["Row"]["enabled_modules"];
  };
  role: string | null;
  isGm: boolean;
};

/** Resolve the user's role in a campaign, or null if the campaign isn't visible. */
export async function resolveCampaignRole(
  supabase: DB,
  campaignId: string,
  userId: string,
): Promise<CampaignRoleContext | null> {
  const [{ data: campaign }, { data: membership }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, description, owner_id, enabled_modules")
      .eq("id", campaignId)
      .single(),
    supabase
      .from("campaign_members")
      .select("role")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (!campaign) return null;
  const role = membership?.role ?? (campaign.owner_id === userId ? "owner" : null);
  return { campaign, role, isGm: role ? GM_ROLES.has(role) : false };
}

/** Whether a character is on a campaign's roster (visible to a member via RLS). */
export async function isCharacterInRoster(
  supabase: DB,
  campaignId: string,
  characterId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("campaign_characters")
    .select("character_id")
    .eq("campaign_id", campaignId)
    .eq("character_id", characterId)
    .maybeSingle();
  return Boolean(data);
}
