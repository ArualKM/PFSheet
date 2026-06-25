/**
 * Centralised environment access. Public values are safe in the browser;
 * `serverEnv` must only be imported from server code (it is never bundled into
 * client components because it reads non-`NEXT_PUBLIC_` variables).
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    // Surface a clear error during build/runtime instead of a cryptic Supabase failure.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export function getServerEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    supabaseSecretKey: required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    apiKeyPepper: required("PATHFORGE_API_KEY_PEPPER", process.env.PATHFORGE_API_KEY_PEPPER),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
}
