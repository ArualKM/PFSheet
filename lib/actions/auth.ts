"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type AuthState = { error?: string; message?: string };

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/**
 * The origin to send Supabase for OAuth/email redirects. Derived from the actual
 * request host so the callback returns to the exact host the user is on (e.g.
 * www.pfsheet.org) — which must also be in Supabase's redirect allowlist. Falls
 * back to NEXT_PUBLIC_APP_URL only if no host headers are present.
 */
async function authRedirectOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return env.appUrl.replace(/\/+$/, "");
}

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  // Only allow same-site relative paths to avoid open-redirects.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

/** Map Supabase auth errors to friendly, non-leaky copy for the most common cases. */
function friendlyAuthError(error: { message?: string; code?: string; status?: number }): string {
  const code = error.code ?? "";
  const msg = error.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) {
    return "That email or password doesn't match. Double-check and try again.";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) {
    return "Please confirm your email first — check your inbox for the confirmation link.";
  }
  if (code === "user_already_exists" || /already registered|user already/i.test(msg)) {
    return "An account with this email already exists. Try signing in instead.";
  }
  // Leaked-password protection (HaveIBeenPwned) is enabled, so an 8+ char password that passes the
  // client schema can still be rejected here — keep the actionable message instead of the catch-all.
  if (code === "weak_password" || /weak|pwned|breach|easy to guess|known to be/i.test(msg)) {
    return "That password is too weak or has appeared in a known data breach — please choose a different one.";
  }
  if (error.status === 429 || /rate limit|too many/i.test(msg)) {
    return "Too many attempts — please wait a minute and try again.";
  }
  return "Something went wrong. Please try again.";
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid credentials." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendlyAuthError(error) };

  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const displayName = (formData.get("displayName") as string | null)?.trim() || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await authRedirectOrigin()}/auth/callback`,
      data: displayName ? { display_name: displayName } : undefined,
    },
  });
  if (error) return { error: friendlyAuthError(error) };

  // If email confirmation is required, there is no active session yet.
  if (!data.session) {
    return { message: "Check your email to confirm your account, then sign in." };
  }
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signInWithOAuthAction(provider: "google" | "discord"): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${await authRedirectOrigin()}/auth/callback` },
  });
  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "OAuth unavailable")}`);
  }
  redirect(data.url);
}

const emailSchema = z.object({ email: z.string().email("Enter a valid email address.") });

/**
 * Step 1 of password recovery: email a reset link. The link returns through the existing
 * /auth/callback (PKCE `code` → session), then lands on /reset-password/update. We always return the
 * same message regardless of whether the email exists, to avoid account-enumeration.
 */
export async function requestPasswordResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  }
  const supabase = await createClient();
  const redirectTo = `${await authRedirectOrigin()}/auth/callback?next=${encodeURIComponent(
    "/reset-password/update",
  )}`;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
  if (error) console.error("resetPasswordForEmail error:", error.message);
  return { message: "If that email has an account, a password-reset link is on its way." };
}

const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords don't match.", path: ["confirm"] });

/**
 * Step 2 of password recovery: set the new password. Requires the recovery session established by the
 * emailed link (via /auth/callback), so a stale/missing link is rejected rather than silently no-op'd.
 */
export async function updatePasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your reset link is invalid or has expired. Request a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}
