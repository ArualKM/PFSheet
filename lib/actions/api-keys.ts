"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { API_SCOPES, hashApiKey } from "@/lib/api/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * API key management (§21.4). Keys are `pf_live_…`; only the SHA-256 hash is stored,
 * so the plaintext is returned exactly once at creation. All writes are RLS-gated to
 * the owner (apikeys_all policy).
 */
export async function createApiKeyAction(input: {
  label: string;
  scopes: string[];
  allowedCharacterIds?: string[];
}): Promise<{ error?: string; token?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const label = input.label.trim().slice(0, 80);
  if (!label) return { error: "Give the key a label so you can recognize it later." };

  const allowedScopes = new Set<string>(API_SCOPES);
  const scopes = [...new Set(input.scopes)].filter((s) => allowedScopes.has(s as never));
  if (!scopes.length) return { error: "Pick at least one scope." };

  // Validate the character allow-list. When the caller restricts a key it must name
  // at least one of their OWN characters: garbage/foreign ids are dropped (UUID-shape
  // filter + ownership intersect), and a restricted-but-empty request is rejected so
  // an empty array can only ever mean "unrestricted".
  let allowedCharacterIds: string[] = [];
  if (input.allowedCharacterIds !== undefined) {
    const requested = [...new Set(input.allowedCharacterIds)].filter((id) => UUID_RE.test(id)).slice(0, 200);
    if (requested.length === 0) {
      return { error: "Pick at least one character, or leave the key unrestricted." };
    }
    const { data: owned } = await supabase
      .from("characters")
      .select("id")
      .eq("owner_id", user.id)
      .in("id", requested);
    allowedCharacterIds = (owned ?? []).map((c) => c.id);
    if (allowedCharacterIds.length === 0) {
      return { error: "None of those are your characters. Pick your own, or leave the key unrestricted." };
    }
  }

  const token = `pf_live_${randomBytes(24).toString("base64url")}`;
  const { error } = await supabase.from("api_keys").insert({
    owner_id: user.id,
    label,
    key_hash: hashApiKey(token),
    scopes,
    allowed_character_ids: allowedCharacterIds,
  });
  if (error) return { error: "Could not create the key. Please try again." };

  revalidatePath("/settings/api");
  return { token };
}

export async function revokeApiKeyAction(keyId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("owner_id", user.id);
  if (error) return { error: "Could not revoke the key." };

  revalidatePath("/settings/api");
  return {};
}
