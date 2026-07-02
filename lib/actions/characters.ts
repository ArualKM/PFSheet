"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createDefaultCharacter, safeParseCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";
import { computeCharacter, type ComputedCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyCompanionStatblock,
  buildMasterCache,
  masterCacheEquals,
  type CompanionStatblockRow,
} from "@/lib/character/companion-sync";
import type { Database } from "@/lib/supabase/types";

const VISIBILITIES = ["private", "campaign", "unlisted", "public"] as const;
type Visibility = (typeof VISIBILITIES)[number];

/**
 * Returns a Supabase client with the user's session already loaded, plus the
 * user. Loading the session on the SAME client used for writes guarantees the
 * access token (and thus auth.uid()) is attached — otherwise a fresh client can
 * race the session load and write as `anon`, tripping RLS. Redirects if signed out.
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
  const meta = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  return user.email?.split("@")[0] ?? "Adventurer";
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "character"}-${randomBytes(3).toString("hex")}`;
}

type Json = Database["public"]["Tables"]["characters"]["Insert"]["sheet_data"];

export type CreateCharacterState = { error?: string };

export async function createCharacterAction(
  _prev: CreateCharacterState,
  formData: FormData,
): Promise<CreateCharacterState> {
  const { supabase, user } = await authedClient();
  const name = ((formData.get("name") as string | null) ?? "").trim() || "New Character";
  const displayName = userDisplayName(user);

  // Backstop: ensure the owner has a profile row (the FK target), in case the
  // signup trigger ever fails to create one.
  await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: displayName }, { onConflict: "id", ignoreDuplicates: true });

  const sheet = createDefaultCharacter({ name, playerName: displayName });
  const computed = computeCharacter(sheet);

  const { data, error } = await supabase
    .from("characters")
    .insert({
      owner_id: user.id,
      name,
      system_key: "pf1e",
      schema_version: sheet.schemaVersion,
      sheet_data: sheet as unknown as Json,
      computed_summary: computed.summary as unknown as Json,
      last_calculated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create character." };
  }

  redirect(`/characters/${data.id}`);
}

const COMPANION_TYPES = ["animal_companion", "familiar", "eidolon", "cohort", "mount", "other"] as const;
type CompanionType = (typeof COMPANION_TYPES)[number];

/**
 * Phase 9 (PFcore M12): create a linked companion — a normal character owned by the same user, linked to its
 * parent via parent_character_id. RLS (owner-based) covers it; we also verify the caller owns the parent.
 *
 * `options` (all optional): autofill from a companion compendium statblock, choose a familiar
 * archetype, and enable the familiar master link (HP/BAB/saves/skills/Int synced from the parent).
 */
export async function createCompanionAction(
  parentId: string,
  companionType: string,
  name: string,
  options?: {
    compendiumTable?: "animal_companion_compendium" | "familiar_compendium";
    compendiumSlug?: string;
    archetype?: string;
    linkToMaster?: boolean;
  },
): Promise<{ error?: string; id?: string }> {
  const { supabase, user } = await authedClient();
  if (!COMPANION_TYPES.includes(companionType as CompanionType)) return { error: "Invalid companion type." };

  const { data: parent } = await supabase
    .from("characters")
    .select("id, owner_id, sheet_data, parent_character_id")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent || parent.owner_id !== user.id) return { error: "Parent character not found." };
  // No companion-of-companion chains — they'd render ambiguously on /characters and have no
  // rules meaning (a familiar doesn't get its own familiar).
  if (parent.parent_character_id) return { error: "A companion can't have its own companions." };

  const finalName = name.trim() || "Companion";
  const sheet = createDefaultCharacter({ name: finalName, playerName: userDisplayName(user) });

  // Compendium autofill: copy the statblock (abilities/size/speed/natural armor/attacks) and
  // preserve the full source text as features. Failure to find the row is non-fatal.
  if (options?.compendiumTable && options.compendiumSlug) {
    const { data: row } = await supabase
      .from(options.compendiumTable)
      .select("*")
      .eq("slug", options.compendiumSlug)
      .maybeSingle();
    if (row) applyCompanionStatblock(sheet, row as unknown as CompanionStatblockRow);
  }

  // The companion block: rules-side linkage. The master cache is seeded from the parent's sheet
  // so a familiar computes correctly from the first render.
  const parentParsed = safeParseCharacter(parent.sheet_data);
  sheet.companion = {
    type: companionType as CompanionType,
    compendiumId: options?.compendiumSlug,
    archetype: options?.archetype?.trim() || undefined,
    syncEnabled: options?.linkToMaster ?? companionType === "familiar",
    master: parentParsed.ok
      ? buildMasterCache(parentId, parentParsed.character, computeCharacter(parentParsed.character))
      : undefined,
  };

  const computed = computeCharacter(sheet);

  const { data, error } = await supabase
    .from("characters")
    .insert({
      owner_id: user.id,
      name: finalName,
      system_key: "pf1e",
      schema_version: sheet.schemaVersion,
      sheet_data: sheet as unknown as Json,
      computed_summary: computed.summary as unknown as Json,
      last_calculated_at: new Date().toISOString(),
      parent_character_id: parentId,
      companion_type: companionType,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create companion." };
  revalidatePath(`/characters/${parentId}`);
  return { id: data.id };
}

export type VisibilityState = { error?: string; slug?: string | null; visibility?: Visibility };

/**
 * Set a character's visibility. Generates a public slug the first time it
 * becomes public/unlisted. RLS guarantees only an owner/editor can update.
 */
export async function setCharacterVisibilityAction(
  characterId: string,
  visibility: Visibility,
): Promise<VisibilityState> {
  if (!VISIBILITIES.includes(visibility)) return { error: "Invalid visibility." };

  const { supabase } = await authedClient();
  const { data: existing, error: readError } = await supabase
    .from("characters")
    .select("id, name, public_slug")
    .eq("id", characterId)
    .single();
  if (readError || !existing) return { error: "Character not found." };

  let slug = existing.public_slug;
  if ((visibility === "public" || visibility === "unlisted") && !slug) {
    slug = slugify(existing.name);
  }

  const { error } = await supabase
    .from("characters")
    .update({ visibility, public_slug: slug })
    .eq("id", characterId);
  if (error) return { error: error.message };

  revalidatePath(`/characters/${characterId}`);
  return { slug, visibility };
}

/**
 * Refresh the cached master stats on every master-linked companion of `masterId` and recompute
 * them. Runs through the ADMIN client (the same pattern as the §16.3 stale flip below): the
 * caller has already proven edit rights on the MASTER via the RLS-gated save, and the saver may
 * be an editor collaborator with no RLS grant on the owner's companion rows — a user-client
 * sync would silently no-op for them. Scoped to this master's linked familiars only.
 *
 * Each write is a compare-and-swap on the sheet_version that was read: a concurrent companion
 * save between our read and write would otherwise be wholesale overwritten (the silent
 * last-write-wins class migration 0016 eliminated). On a CAS miss we skip — the companion
 * edit-page load and the master's next save both re-sync. Companions whose cache actually
 * changed get their approved campaign reviews flipped stale (their computed numbers changed),
 * mirroring what a manual edit through saveCharacterSheetAction would do.
 */
async function syncCompanionCaches(
  masterId: string,
  masterSheet: PathForgeCharacterV1,
  masterComputed: ComputedCharacter,
): Promise<void> {
  const admin = createAdminClient();
  const { data: companions } = await admin
    .from("characters")
    .select("id, sheet_data, sheet_version")
    .eq("parent_character_id", masterId);
  if (!companions || companions.length === 0) return;
  const cache = buildMasterCache(masterId, masterSheet, masterComputed);
  const changedIds: string[] = [];
  for (const row of companions) {
    const parsed = safeParseCharacter(row.sheet_data);
    if (!parsed.ok) continue;
    const comp = parsed.character.companion;
    if (!comp?.syncEnabled || comp.type !== "familiar") continue;
    if (masterCacheEquals(comp.master, cache)) continue;
    comp.master = cache;
    const computed = computeCharacter(parsed.character);
    const { data: updated } = await admin
      .from("characters")
      .update({
        sheet_data: parsed.character as unknown as Json,
        computed_summary: computed.summary as unknown as Json,
        last_calculated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("sheet_version", row.sheet_version)
      .select("id")
      .maybeSingle();
    if (updated) changedIds.push(row.id);
    else console.warn(`syncCompanionCaches: CAS miss for companion ${row.id} (concurrent save) — skipped`);
  }
  if (changedIds.length > 0) {
    await admin
      .from("campaign_characters")
      .update({ gm_review_status: "stale_after_changes" })
      .in("character_id", changedIds)
      .in("gm_review_status", ["approved", "approved_with_notes"]);
  }
}

export type SaveSheetState = {
  ok: boolean;
  error?: string;
  savedAt?: string;
  /** The new sheet_version after a successful save (for optimistic-concurrency tracking). */
  version?: number;
  /**
   * Set when an optimistic-concurrency save was rejected because the row advanced
   * underneath us (another device saved). The client 3-way-merges against this and retries.
   */
  conflict?: { serverSheet: unknown; serverVersion: number };
};

/**
 * Persist an edited sheet. Validates against the canonical schema, recomputes the
 * dashboard summary, and updates the row. RLS guarantees only an owner/editor can
 * write; the owner_id column is locked at the DB layer.
 *
 * Optimistic concurrency (S5b): when `expectedVersion` is supplied, the UPDATE is a
 * compare-and-swap on `sheet_version`. If another device saved in the meantime the CAS
 * matches 0 rows; we re-read the current row to distinguish a real conflict (returned for
 * the client to merge) from a permission failure. Omitting `expectedVersion` keeps the old
 * unconditional behavior for any legacy caller.
 */
export async function saveCharacterSheetAction(
  characterId: string,
  sheet: unknown,
  expectedVersion?: number,
): Promise<SaveSheetState> {
  const parsed = safeParseCharacter(sheet);
  if (!parsed.ok) {
    return { ok: false, error: "The sheet has validation errors and was not saved." };
  }

  // A compute error must not throw out of the action (an opaque server-action rejection the client
  // can only treat as a transient/offline failure + retry forever). Surface it as a clean error.
  let computed;
  try {
    computed = computeCharacter(parsed.character);
  } catch (e) {
    console.error("saveCharacterSheetAction: computeCharacter failed", e);
    return { ok: false, error: "The sheet has an invalid value (likely a formula) and was not saved." };
  }
  const { supabase } = await authedClient();
  let updateQuery = supabase
    .from("characters")
    .update({
      name: parsed.character.identity.name,
      sheet_data: parsed.character as unknown as Json,
      computed_summary: computed.summary as unknown as Json,
      last_calculated_at: new Date().toISOString(),
    })
    .eq("id", characterId);
  if (typeof expectedVersion === "number") {
    updateQuery = updateQuery.eq("sheet_version", expectedVersion);
  }
  const { data: updated, error } = await updateQuery.select("sheet_version").maybeSingle();

  if (error) return { ok: false, error: error.message };

  if (!updated) {
    // CAS matched 0 rows: either the version advanced (conflict) or RLS blocked the write.
    // A plain RLS-gated read tells us which.
    const { data: current } = await supabase
      .from("characters")
      .select("sheet_data, sheet_version")
      .eq("id", characterId)
      .maybeSingle();
    if (!current) {
      return { ok: false, error: "You don't have access to this character." };
    }
    if (typeof expectedVersion === "number" && current.sheet_version !== expectedVersion) {
      return { ok: false, conflict: { serverSheet: current.sheet_data, serverVersion: current.sheet_version } };
    }
    return { ok: false, error: "The sheet could not be saved — you may not have edit access." };
  }

  // Master→companion sync: a save on a character that has master-linked companions refreshes
  // each companion's cached master stats (level/BAB/hp/saves/skill ranks) and recomputes it, so
  // a familiar's halved hp and borrowed BAB track the master without a manual step. Best-effort —
  // never blocks the master's save.
  try {
    await syncCompanionCaches(characterId, parsed.character, computed);
  } catch (e) {
    console.error("saveCharacterSheetAction: companion sync failed", e);
  }

  // §16.3 stale detection: editing an approved sheet marks it "changed since
  // approval" in every campaign that approved it. The RLS sheet update above
  // already proved the saver can edit this character (owner OR editor/co_owner);
  // since campaign_characters RLS (campchar_update) covers owners + GMs but NOT
  // editor collaborators, flip the status via the admin client — scoped to this
  // character's approved rows only. Best-effort: never block the save on it.
  try {
    const admin = createAdminClient();
    await admin
      .from("campaign_characters")
      .update({ gm_review_status: "stale_after_changes" })
      .eq("character_id", characterId)
      .in("gm_review_status", ["approved", "approved_with_notes"]);
  } catch {
    // Staleness also surfaces via the GM's compare-to-approved diff, so a failure
    // here is non-fatal.
  }

  return { ok: true, savedAt: new Date().toISOString(), version: updated.sheet_version };
}
