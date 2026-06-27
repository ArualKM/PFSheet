"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = {
  error?: string;
  ok?: boolean;
  /** Non-fatal note (e.g. the auth-metadata mirror lagged) shown after an otherwise-successful save. */
  warning?: string;
  /** The canonical stored values, fed back so the form reflects normalization (lowercased handle, etc.). */
  values?: { displayName: string; handle: string };
};

/** Lowercase letters, digits, underscores; 3–32 chars. Handles are case-insensitive + globally unique. */
const HANDLE_RE = /^[a-z0-9_]{3,32}$/;

/** Update the signed-in user's display name + handle. RLS scopes the write to the caller's own row
 * (profiles_update_self); the display name is mirrored into auth metadata so the app shell/session
 * reflect it. The handle feeds the campaign invite-by-handle lookup. */
export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 80) || null;
  const handleRaw = String(formData.get("handle") ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

  let handle: string | null = null;
  if (handleRaw) {
    if (!HANDLE_RE.test(handleRaw)) {
      return {
        error: "Handle must be 3–32 characters using lowercase letters, numbers, or underscores.",
      };
    }
    handle = handleRaw;
  }

  // Write the profile row FIRST — it's the source of truth for the handle (invites) + settings display,
  // and the only write that can fail on the unique constraint. RLS limits it to the caller's own row;
  // .select() makes an RLS-filtered 0-row write surface as an error rather than a false success.
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, handle, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { error: "That handle is already taken — try another." };
    console.error("updateProfileAction: profile update failed", error);
    return { error: "Could not update your profile. Please try again." };
  }
  if (!data) return { error: "Could not update your profile. Please try again." };

  // Mirror the display name into auth metadata so the session/app-shell name updates. Best-effort: the
  // profile row already committed, so a mirror failure is a (rare) cosmetic lag, not a lost save.
  const { error: metaError } = await supabase.auth.updateUser({
    data: { display_name: displayName ?? "" },
  });
  if (metaError) console.error("updateProfileAction: auth metadata mirror failed", metaError);

  revalidatePath("/settings");
  return {
    ok: true,
    values: { displayName: displayName ?? "", handle: handle ?? "" },
    ...(metaError
      ? { warning: "Saved — your display name may take a moment to appear in the sidebar. Refresh if needed." }
      : {}),
  };
}
