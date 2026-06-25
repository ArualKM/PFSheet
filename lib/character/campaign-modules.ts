import { OPTIONAL_RULE_MODULES } from "@pathforge/schema";

/**
 * Helpers for a campaign's `enabled_modules` jsonb (§17.2). The column may hold
 * bare key strings or `{ key }` objects, so normalize to keys, and resolve keys
 * to display names via the optional-rules catalog.
 */
export function enabledModuleKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m): string | null => {
      if (typeof m === "string") return m || null;
      if (m && typeof m === "object" && "key" in m) {
        const v = (m as { key: unknown }).key;
        // Only accept a non-empty string key — don't stringify null/undefined/junk
        // into phantom "null"/"undefined" keys.
        return typeof v === "string" && v ? v : null;
      }
      return null;
    })
    .filter((k): k is string => Boolean(k));
}

export function moduleName(key: string): string {
  return OPTIONAL_RULE_MODULES.find((m) => m.key === key)?.name ?? key;
}
