"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import {
  createDefaultCharacter,
  safeParseCharacter,
  writeWizardMeta,
  type PathForgeCharacterV1,
} from "@pathforge/schema";
import { computeCharacter, type ComputedCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMasterCache, masterCacheEquals } from "@/lib/character/companion-sync";
import { deleteConfirmMatches } from "@/lib/character/delete-confirm";
import { applyCompanionStatblock, type CompanionCompendiumRow } from "@/lib/character/companion-statblock";
import { syncMasterFamiliars } from "@/lib/character/companion-sync-server";
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

type ActionUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };

/**
 * Shared body of "create a fresh blank character row" — a `createDefaultCharacter()` sheet, an
 * owner profile backstop, and the insert. Used by both `createCharacterAction` (the existing
 * blank-sheet flow) and `createWizardCharacterAction` (S6 Pillar 3 §4.1) so the two paths can never
 * drift; they differ only in whether `metadata.custom.wizard` is stamped before insert and which
 * route they redirect into.
 */
async function createBlankCharacterRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: ActionUser,
  options: { name: string; playerName: string; wizard?: boolean },
): Promise<{ id?: string; error?: string }> {
  // Backstop: ensure the owner has a profile row (the FK target), in case the
  // signup trigger ever fails to create one.
  await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: options.playerName }, { onConflict: "id", ignoreDuplicates: true });

  const sheet = createDefaultCharacter({ name: options.name, playerName: options.playerName });
  if (options.wizard) {
    writeWizardMeta(sheet, { active: true, step: "welcome", startedAt: new Date().toISOString() });
  }
  const computed = computeCharacter(sheet);

  const { data, error } = await supabase
    .from("characters")
    .insert({
      owner_id: user.id,
      name: options.name,
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
  return { id: data.id };
}

export async function createCharacterAction(
  _prev: CreateCharacterState,
  formData: FormData,
): Promise<CreateCharacterState> {
  const { supabase, user } = await authedClient();
  const name = ((formData.get("name") as string | null) ?? "").trim() || "New Character";
  const displayName = userDisplayName(user);

  const result = await createBlankCharacterRow(supabase, user, { name, playerName: displayName });
  if (result.error || !result.id) {
    return { error: result.error ?? "Could not create character." };
  }

  redirect(`/characters/${result.id}`);
}

/**
 * S6 Pillar 3 (`docs/S6_UX_OVERHAUL/03_CHARACTER_WIZARD.md` §4.1) — same name-collection + blank-sheet
 * creation as `createCharacterAction`, but the fresh sheet is stamped with an active
 * `metadata.custom.wizard` flag before insert, and the redirect lands in the guided wizard instead
 * of the read view.
 */
export async function createWizardCharacterAction(
  _prev: CreateCharacterState,
  formData: FormData,
): Promise<CreateCharacterState> {
  const { supabase, user } = await authedClient();
  const name = ((formData.get("name") as string | null) ?? "").trim() || "New Character";
  const displayName = userDisplayName(user);

  const result = await createBlankCharacterRow(supabase, user, { name, playerName: displayName, wizard: true });
  if (result.error || !result.id) {
    return { error: result.error ?? "Could not create character." };
  }

  redirect(`/characters/${result.id}/wizard`);
}

/**
 * S6 Pillar 3 follow-up (2026-07-11) — reopen a finished/skipped/never-started wizard. The wizard
 * page redirects to `/edit` whenever `metadata.custom.wizard` is missing or `active: false`, which
 * made the guided flow permanently unreachable once a character left it. Bound to a form action
 * (`reopenWizardAction.bind(null, characterId)`, same shape as `signInWithOAuthAction`) from the
 * wizard page's own interstitial, so it always ends in a redirect rather than returning state.
 *
 * Reads `sheet_data` + `sheet_version` through the RLS-scoped client — same access model as every
 * other character action here (a non-owner/non-editor's read simply comes back empty; no separate
 * `owner_id` check needed, mirrors `saveCharacterSheetAction`). Safe-parses, then re-stamps
 * `writeWizardMeta(character, { active: true })` — the patch deliberately omits `step`, so
 * `writeWizardMeta`'s spread keeps whatever step was last stored (or defaults to "welcome" if the
 * character never had wizard meta at all); `resumeStepFor` in the wizard shell handles any stale
 * ordering on load. The write is a compare-and-swap on the version just read (the `bump_sheet_version`
 * trigger advances it); a CAS miss — a concurrent save landed between our read and write, e.g. the
 * overview's master-familiar cache refresh — lands BACK on the wizard page, whose interstitial
 * re-renders with the same "Reopen guided setup" button: the failure is visible and one click away
 * from a retry, instead of silently dropping the user in /edit as if they never asked (review LOW).
 * Unreadable/unparseable sheets still fall back to /edit, where the load-failure surfaces properly.
 */
export async function reopenWizardAction(characterId: string): Promise<void> {
  const { supabase } = await authedClient();

  const { data, error } = await supabase
    .from("characters")
    .select("sheet_data, sheet_version")
    .eq("id", characterId)
    .maybeSingle();
  if (error || !data) redirect(`/characters/${characterId}/edit`);

  const parsed = safeParseCharacter(data.sheet_data);
  if (!parsed.ok) redirect(`/characters/${characterId}/edit`);

  writeWizardMeta(parsed.character, { active: true });

  await supabase
    .from("characters")
    .update({ sheet_data: parsed.character as unknown as Json })
    .eq("id", characterId)
    .eq("sheet_version", data.sheet_version);

  // Success and CAS miss both land on the wizard page, which renders the truth: success
  // shows the (now active) wizard; a miss (or RLS-filtered write) means the flag did NOT
  // flip, so the page's interstitial re-renders with the same "Reopen guided setup"
  // button — the failure is visible and one click away from a retry.
  redirect(`/characters/${characterId}/wizard`);
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
  const isFamiliar = companionType === "familiar";

  // Compendium autofill — the same statblock→sheet apply the in-editor "Change statblock" picker uses
  // (`lib/character/companion-statblock.ts`), so the two paths can never drift. It sets identity.race,
  // the base body (ability scores/size/speed/attacks — from the row directly for animal_companion/
  // mount, or the hardcoded familiar-body catalog for familiars, since familiar_compendium ships no
  // statblock), companion.compendiumId, and — for familiars — companion.masterBenefit parsed from
  // granted_ability. Failure to find the row is non-fatal (falls through to a blank companion sheet).
  if (options?.compendiumTable && options.compendiumSlug) {
    const { data: row } = await supabase
      .from(options.compendiumTable)
      .select("*")
      .eq("slug", options.compendiumSlug)
      .maybeSingle();
    if (row) {
      applyCompanionStatblock(sheet, row as unknown as CompanionCompendiumRow, companionType as CompanionType);
    }
  }

  // The companion block: rules-side linkage. Merges onto whatever the statblock apply above already
  // set (compendiumId, masterBenefit) — archetype/syncEnabled/the master cache are create-only
  // concerns the picker never touches. The master cache is seeded from the parent's sheet so a
  // familiar computes correctly from the first render.
  const parentParsed = safeParseCharacter(parent.sheet_data);
  sheet.companion = {
    ...sheet.companion,
    type: companionType as CompanionType,
    compendiumId: options?.compendiumSlug,
    archetype: options?.archetype?.trim() || undefined,
    syncEnabled: options?.linkToMaster ?? isFamiliar,
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

  // Reverse familiar→master sync: a new familiar grants its master Alertness + a specific bonus.
  // Rebuild the master's cached familiar benefits so the owner's sheet reflects it. Best-effort.
  if (isFamiliar) {
    try {
      await syncMasterFamiliars(parentId);
    } catch (e) {
      console.error("createCompanionAction: master familiar sync failed", e);
    }
  }

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

  // Reverse familiar→master sync: if the saved character IS a familiar, refresh its master's cached
  // familiar benefits (name/archetype/bonus may have changed, or the stat-link was toggled). The
  // master id is on the familiar's own cached companion.master. Best-effort — never blocks the save.
  try {
    const comp = parsed.character.companion;
    const masterId = comp?.type === "familiar" ? comp.master?.characterId : undefined;
    if (masterId) await syncMasterFamiliars(masterId);
  } catch (e) {
    console.error("saveCharacterSheetAction: master familiar sync failed", e);
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

export type DeleteCharacterState = { ok: boolean; error?: string };

/**
 * Permanently delete a character. Owner-requested "type the name to confirm"
 * protection: the client dialog (`delete-character-dialog.tsx`) already disables its
 * confirm button until the typed value matches, but that's UI only — the server
 * independently re-verifies via the SAME shared `deleteConfirmMatches` (trimmed,
 * case-sensitive, DELETE fallback for blank names) against the row's REAL name
 * (defense in depth; never trust the client dialog alone).
 *
 * Companions link via `parent_character_id` with `ON DELETE SET NULL` (migration
 * 0025), so deleting a parent unlinks its companions rather than cascading the
 * delete to them — they become ordinary standalone characters.
 *
 * The delete is `.select("id")`-verified: RLS (`characters_delete_owner`) scopes
 * deletes to the owner, so anyone else's delete silently matches 0 rows, which is
 * treated as a failure here — never a false success (the codebase's standing
 * convention for RLS-gated writes; see `saveCharacterSheetAction`).
 */
export async function deleteCharacterAction(characterId: string, confirmName: string): Promise<DeleteCharacterState> {
  const { supabase, user } = await authedClient();

  const { data: row, error: readError } = await supabase
    .from("characters")
    .select("id, name, owner_id")
    .eq("id", characterId)
    .maybeSingle();
  if (readError || !row) return { ok: false, error: "Character not found." };
  if (row.owner_id !== user.id) return { ok: false, error: "Only the owner can delete this character." };
  if (!deleteConfirmMatches(confirmName, row.name)) {
    return { ok: false, error: "The typed name doesn't match — delete cancelled." };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("characters")
    .delete()
    .eq("id", characterId)
    .select("id")
    .maybeSingle();
  if (deleteError) return { ok: false, error: deleteError.message };
  if (!deleted) return { ok: false, error: "Could not delete — you may not have permission." };

  // With `experimental.staleTimes {dynamic: 30}` the /characters list is served from the
  // Router Cache for up to 30s — without this, the just-deleted character would still be
  // in the list we land on (same convention as lib/actions/imports.ts).
  revalidatePath("/characters");
  redirect("/characters");
}
