import "server-only";
import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCharacterViewModel, type CharacterViewModel } from "@/lib/character/view-model";
import { env } from "@/lib/env";
import { canAccessCharacter, type ApiAccess } from "./auth";

/**
 * Character loaders for the API. Both read via the admin client (an API request
 * carries no RLS session) but enforce access in code: the public loader only
 * serves public/unlisted slugs and filters through the `anonymous` view-model
 * (public-safe only); the owned loader checks the caller owns the character before
 * building the full `owner` view-model.
 */
function shareUrlFor(slug: string | null): string | undefined {
  return slug ? `${env.appUrl.replace(/\/$/, "")}/c/${slug}` : undefined;
}

export async function loadPublicBySlug(
  slug: string,
): Promise<{ vm: CharacterViewModel; shareUrl?: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("characters")
    .select("id, visibility, public_slug, sheet_data")
    .eq("public_slug", slug)
    .maybeSingle();
  if (!data) return null;
  if (data.visibility !== "public" && data.visibility !== "unlisted") return null;
  const parsed = safeParseCharacter(data.sheet_data);
  if (!parsed.ok) return null;
  const computed = computeCharacter(parsed.character);
  return {
    vm: buildCharacterViewModel(parsed.character, computed, "anonymous", data.visibility),
    shareUrl: shareUrlFor(data.public_slug),
  };
}

export type OwnedLoad =
  | { vm: CharacterViewModel; shareUrl?: string; publicSlug: string | null; visibility: string }
  | { error: string; status: number };

export async function loadOwnedById(access: ApiAccess, characterId: string): Promise<OwnedLoad> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("characters")
    .select("id, owner_id, visibility, public_slug, sheet_data")
    .eq("id", characterId)
    .maybeSingle();
  if (!data) return { error: "Character not found.", status: 404 };
  if (!canAccessCharacter(access, data.owner_id, data.id)) {
    return { error: "This key isn't authorized for that character.", status: 403 };
  }
  const parsed = safeParseCharacter(data.sheet_data);
  if (!parsed.ok) return { error: "Character data failed validation.", status: 422 };
  const computed = computeCharacter(parsed.character);
  return {
    vm: buildCharacterViewModel(parsed.character, computed, "owner", data.visibility),
    shareUrl: shareUrlFor(data.public_slug),
    publicSlug: data.public_slug,
    visibility: data.visibility,
  };
}
