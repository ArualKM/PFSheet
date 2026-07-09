import "server-only";
import { safeParseCharacter, type FamiliarBenefit, type PathForgeCharacterV1 } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFamiliarBenefit, familiarBenefitsEqual } from "@/lib/character/companion-sync";
import type { Database } from "@/lib/supabase/types";

type Json = Database["public"]["Tables"]["characters"]["Update"]["sheet_data"];

/**
 * Reverse familiar→master sync: rebuild `character.familiars` on a MASTER from its linked familiar
 * children (Alertness + each familiar's specific bonus) and recompute it, so the owner's sheet gains
 * the RAW master-side benefit. The mirror image of `syncCompanionCaches` (master→companion): runs
 * through the ADMIN client (the caller has already proven access to the master) with a sheet_version
 * CAS per write (skip on miss — self-heals on the next familiar save or master view). A changed cache
 * flips the master's approved reviews stale (its computed numbers moved).
 *
 * Server-only (not a server action) so it can be called from both the create/save actions AND the
 * master's page loads without being exposed to the client. Returns the freshly-built benefit list so a
 * page can display it without a re-read (persist-on-view also self-heals a deleted familiar, which has
 * no dedicated hook).
 */
export async function syncMasterFamiliars(masterId: string): Promise<FamiliarBenefit[]> {
  const admin = createAdminClient();
  const { data: master } = await admin
    .from("characters")
    .select("id, sheet_data, sheet_version")
    .eq("id", masterId)
    .maybeSingle();
  if (!master) return [];
  const masterParsed = safeParseCharacter(master.sheet_data);
  if (!masterParsed.ok) return [];

  const { data: children } = await admin
    .from("characters")
    .select("id, sheet_data")
    .eq("parent_character_id", masterId)
    .eq("companion_type", "familiar")
    .order("created_at");

  const benefits: FamiliarBenefit[] = [];
  for (const child of children ?? []) {
    const parsed = safeParseCharacter(child.sheet_data);
    if (!parsed.ok) continue;
    const b = buildFamiliarBenefit(parsed.character, child.id);
    if (b) benefits.push(b);
  }

  if (familiarBenefitsEqual(masterParsed.character.familiars, benefits)) return benefits;

  const next: PathForgeCharacterV1 = {
    ...masterParsed.character,
    familiars: benefits.length ? benefits : undefined,
  };
  const computed = computeCharacter(next);
  const { data: updated } = await admin
    .from("characters")
    .update({
      sheet_data: next as unknown as Json,
      computed_summary: computed.summary as unknown as Json,
      last_calculated_at: new Date().toISOString(),
    })
    .eq("id", masterId)
    .eq("sheet_version", master.sheet_version)
    .select("id")
    .maybeSingle();

  if (updated) {
    await admin
      .from("campaign_characters")
      .update({ gm_review_status: "stale_after_changes" })
      .eq("character_id", masterId)
      .in("gm_review_status", ["approved", "approved_with_notes"]);
  } else {
    console.warn(`syncMasterFamiliars: CAS miss for master ${masterId} (concurrent save) — skipped`);
  }
  return benefits;
}
