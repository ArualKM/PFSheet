"use server";

import { redirect } from "next/navigation";
import { createDefaultCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";

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
