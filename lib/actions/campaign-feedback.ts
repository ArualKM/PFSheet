"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeParseCharacter, OPTIONAL_RULE_MODULES } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabledModuleKeys } from "@/lib/character/campaign-modules";
import type { Database } from "@/lib/supabase/types";

type Json = Database["public"]["Tables"]["characters"]["Insert"]["sheet_data"];

async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * Adopt a campaign's enabled rule modules onto the character (§17.2). Edits the
 * character, so RLS (characters_update_editor → can_edit) is the authority — only
 * the owner/editor can apply it. Campaign modules are read via the admin client
 * (just module keys; the player owns a roster character there).
 */
export async function adoptCampaignModulesAction(
  characterId: string,
  campaignId: string,
): Promise<{ error?: string; ok?: boolean }> {
  const { supabase } = await authedClient();

  const { data: cc } = await supabase
    .from("campaign_characters")
    .select("character_id")
    .eq("campaign_id", campaignId)
    .eq("character_id", characterId)
    .maybeSingle();
  if (!cc) return { error: "That character isn't in this campaign." };

  const { data: char } = await supabase
    .from("characters")
    .select("sheet_data")
    .eq("id", characterId)
    .single();
  if (!char) return { error: "Character not found." };

  const { data: camp } = await createAdminClient()
    .from("campaigns")
    .select("enabled_modules")
    .eq("id", campaignId)
    .single();
  const keys = enabledModuleKeys(camp?.enabled_modules);
  if (keys.length === 0) return { error: "This campaign hasn't enabled any modules." };

  const parsed = safeParseCharacter(char.sheet_data);
  if (!parsed.ok) return { error: "The sheet failed validation and can't be updated." };
  const sheet = parsed.character;

  for (const key of keys) {
    const mod = OPTIONAL_RULE_MODULES.find((m) => m.key === key);
    if (!mod) continue;
    if (mod.variantKey) {
      sheet.rules.variants[mod.variantKey] = true;
    } else if (!sheet.rules.modules.some((m) => m.key === key)) {
      sheet.rules.modules.push({ key, enabled: true, settings: {}, fromCampaign: true });
    }
  }

  const computed = computeCharacter(sheet);
  const { error } = await supabase
    .from("characters")
    .update({
      sheet_data: sheet as unknown as Json,
      computed_summary: computed.summary as unknown as Json,
      last_calculated_at: new Date().toISOString(),
    })
    .eq("id", characterId);
  if (error) return { error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}
