import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** §21.4 API scopes. */
export const API_SCOPES = [
  "characters:read",
  "characters:summary",
  "characters:portrait",
  "campaigns:read",
  "discord:embed",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export type ApiAccess = {
  ownerId: string;
  via: "session" | "key";
  scopes: string[];
  /** null = all of the owner's characters; otherwise the key's allow-list. */
  allowedCharacterIds: string[] | null;
  keyId?: string;
};

/** API keys are stored as a SHA-256 hash; the plaintext is shown once at creation. */
export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getBearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

/**
 * Resolve the caller: a `pf_…` API key (Bearer) or a signed-in session. Returns
 * null when neither is present/valid. Key lookup runs via the admin client (an API
 * request carries no Supabase session). Usage tracking is deliberately NOT done here
 * — see recordKeyUsage, which the guard calls only after rate-limiting passes so a
 * single key can't drive unthrottled admin writes or pollute the audit trail.
 */
export async function resolveApiAccess(request: Request): Promise<ApiAccess | null> {
  const token = getBearer(request);
  if (token && token.startsWith("pf_")) {
    const admin = createAdminClient();
    const { data: key } = await admin
      .from("api_keys")
      .select("id, owner_id, scopes, allowed_character_ids, revoked_at")
      .eq("key_hash", hashApiKey(token))
      .maybeSingle();
    if (!key || key.revoked_at) return null;

    const allowed = Array.isArray(key.allowed_character_ids) ? (key.allowed_character_ids as string[]) : [];
    return {
      ownerId: key.owner_id,
      via: "key",
      scopes: Array.isArray(key.scopes) ? (key.scopes as string[]) : [],
      // An empty allow-list means "unrestricted" — createApiKeyAction rejects a
      // restricted-but-empty key, so [] can only ever mean "never restricted".
      allowedCharacterIds: allowed.length ? allowed : null,
      keyId: key.id,
    };
  }

  // Fall back to a signed-in session (the owner using their own cookies).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return { ownerId: user.id, via: "session", scopes: [...API_SCOPES], allowedCharacterIds: null };
  }
  return null;
}

/**
 * Record key usage (last_used_at + an audit_events row) AFTER the request has passed
 * scope + rate-limit checks. Best-effort: never throws into the request path.
 */
export async function recordKeyUsage(keyId: string, ownerId: string, path: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);
    await admin.from("audit_events").insert({
      actor_id: ownerId,
      event_type: "api_request",
      event_data: { keyId, path },
    });
  } catch {
    // Usage tracking is non-critical.
  }
}

/** Whether the access grants a scope. `characters:read` implies the narrower character scopes. */
export function hasScope(access: ApiAccess, required: ApiScope): boolean {
  if (access.scopes.includes(required)) return true;
  if (required.startsWith("characters:") && access.scopes.includes("characters:read")) return true;
  return false;
}

/** Whether the access may read a specific character (owner + allow-list). */
export function canAccessCharacter(access: ApiAccess, characterOwnerId: string, characterId: string): boolean {
  if (access.ownerId !== characterOwnerId) return false;
  return access.allowedCharacterIds === null || access.allowedCharacterIds.includes(characterId);
}
