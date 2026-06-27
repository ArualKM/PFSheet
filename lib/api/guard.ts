import "server-only";
import type { NextResponse } from "next/server";
import { apiError } from "./response";
import { checkRateLimit } from "./rate-limit";
import { resolveApiAccess, hasScope, recordKeyUsage, type ApiScope } from "./auth";
import { loadOwnedById, type OwnedLoad } from "./load";

type SuccessLoad = Exclude<OwnedLoad, { error: string }>;
type GuardResult = { ok: true; load: SuccessLoad } | { ok: false; response: NextResponse };

/**
 * Full authenticated-endpoint guard: resolve the caller (key or session), check the
 * scope, apply a per-key/per-user rate limit, then load the character with an
 * ownership check. Returns either the loaded view-model or a ready-to-return error.
 */
export async function guardOwnedCharacter(
  request: Request,
  characterId: string,
  scope: ApiScope,
): Promise<GuardResult> {
  const access = await resolveApiAccess(request);
  if (!access) {
    return { ok: false, response: apiError("unauthorized", "Provide a valid API key (Bearer) or sign in.", 401) };
  }
  if (!hasScope(access, scope)) {
    return { ok: false, response: apiError("forbidden", `Your key lacks the ${scope} scope.`, 403) };
  }
  const bucket = access.keyId ? `key:${access.keyId}` : `user:${access.ownerId}`;
  if (!(await checkRateLimit(bucket, 240, 60))) {
    return { ok: false, response: apiError("rate_limited", "Too many requests — slow down.", 429) };
  }
  // Record key usage only after the request clears scope + rate-limit checks.
  if (access.via === "key" && access.keyId) {
    await recordKeyUsage(access.keyId, access.ownerId, new URL(request.url).pathname);
  }
  const load = await loadOwnedById(access, characterId);
  if ("error" in load) {
    const code = load.status === 404 ? "not_found" : load.status === 422 ? "invalid_character" : "forbidden";
    return { ok: false, response: apiError(code, load.error, load.status) };
  }
  return { ok: true, load };
}
