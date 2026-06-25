"use server";

import { revalidatePath } from "next/cache";
import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Json = Database["public"]["Tables"]["character_snapshots"]["Insert"]["sheet_data"];

/**
 * Snapshot actions (§16.1). A snapshot freezes the current sheet + computed values
 * so changes can be diffed later. RLS (snapshots_insert_editor) lets only an
 * owner/editor create one; deletes are owner-only.
 */
async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export type SnapshotState = { error?: string; ok?: boolean };

export async function createSnapshotAction(characterId: string, label?: string): Promise<SnapshotState> {
  const { supabase, user } = await authedClient();
  if (!user) return { error: "You must be signed in." };

  const { data: char, error: readError } = await supabase
    .from("characters")
    .select("name, sheet_data")
    .eq("id", characterId)
    .single();
  if (readError || !char) return { error: "Couldn't read the character to snapshot." };

  // Freeze accurate computed values with the sheet. The live characters row only
  // persists computed_summary, so recompute the full breakdown here rather than
  // copying the (empty) computed_values column.
  const parsed = safeParseCharacter(char.sheet_data);
  if (!parsed.ok) return { error: "The sheet failed validation and can't be snapshotted." };
  const computed = computeCharacter(parsed.character);

  const { error } = await supabase.from("character_snapshots").insert({
    character_id: characterId,
    created_by: user.id,
    label: label?.trim() || "Manual snapshot",
    reason: "manual",
    sheet_data: char.sheet_data,
    computed_summary: computed.summary as unknown as Json,
    computed_values: computed as unknown as Json,
  });
  if (error) return { error: error.message };

  revalidatePath(`/characters/${characterId}/history`);
  return { ok: true };
}

export async function deleteSnapshotAction(characterId: string, snapshotId: string): Promise<SnapshotState> {
  const { supabase, user } = await authedClient();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.from("character_snapshots").delete().eq("id", snapshotId);
  if (error) return { error: error.message };
  revalidatePath(`/characters/${characterId}/history`);
  return { ok: true };
}
