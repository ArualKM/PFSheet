"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createDefaultCharacter, safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const computed = computeCharacter(parsed.character);
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
