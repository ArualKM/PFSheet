"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createDefaultCharacter, safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";

const VISIBILITIES = ["private", "campaign", "unlisted", "public"] as const;
type Visibility = (typeof VISIBILITIES)[number];

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
  const user = await requireUser();
  const name = ((formData.get("name") as string | null) ?? "").trim() || "New Character";

  const sheet = createDefaultCharacter({ name, playerName: user.displayName });
  const computed = computeCharacter(sheet);

  const supabase = await createClient();
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
  await requireUser();
  if (!VISIBILITIES.includes(visibility)) return { error: "Invalid visibility." };

  const supabase = await createClient();
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

export type SaveSheetState = { ok: boolean; error?: string; savedAt?: string };

/**
 * Persist an edited sheet. Validates against the canonical schema, recomputes the
 * dashboard summary, and updates the row. RLS guarantees only an owner/editor can
 * write; the owner_id column is locked at the DB layer.
 */
export async function saveCharacterSheetAction(
  characterId: string,
  sheet: unknown,
): Promise<SaveSheetState> {
  await requireUser();

  const parsed = safeParseCharacter(sheet);
  if (!parsed.ok) {
    return { ok: false, error: "The sheet has validation errors and was not saved." };
  }

  const computed = computeCharacter(parsed.character);
  const supabase = await createClient();
  const { error } = await supabase
    .from("characters")
    .update({
      name: parsed.character.identity.name,
      sheet_data: parsed.character as unknown as Json,
      computed_summary: computed.summary as unknown as Json,
      last_calculated_at: new Date().toISOString(),
    })
    .eq("id", characterId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, savedAt: new Date().toISOString() };
}
