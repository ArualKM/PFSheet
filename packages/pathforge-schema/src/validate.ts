import { z } from "zod";
import {
  CHARACTER_SCHEMA_VERSION,
  pathForgeCharacterV1Schema,
  type PathForgeCharacterV1,
} from "./character";

export type CharacterValidationResult =
  | { ok: true; character: PathForgeCharacterV1 }
  | { ok: false; errors: z.ZodError };

/** Parse + validate, throwing on failure. Use at trust boundaries. */
export function parseCharacter(data: unknown): PathForgeCharacterV1 {
  return pathForgeCharacterV1Schema.parse(data);
}

/** Non-throwing validation with a discriminated result. */
export function safeParseCharacter(data: unknown): CharacterValidationResult {
  const result = pathForgeCharacterV1Schema.safeParse(data);
  if (result.success) return { ok: true, character: result.data };
  return { ok: false, errors: result.error };
}

export function isPathForgeCharacterV1(data: unknown): data is PathForgeCharacterV1 {
  return pathForgeCharacterV1Schema.safeParse(data).success;
}

/**
 * Migrate an unknown character document to the current schema version.
 * Only `pathforge-character-v1` exists today; this is the seam where future
 * versioned migrations are chained (v1 -> v2 -> ...). Unknown shapes are
 * rejected rather than silently coerced.
 */
export function migrateCharacter(data: unknown): CharacterValidationResult {
  if (typeof data !== "object" || data === null) {
    return { ok: false, errors: new z.ZodError([]) };
  }
  const version = (data as { schemaVersion?: unknown }).schemaVersion;

  switch (version) {
    case CHARACTER_SCHEMA_VERSION:
      return safeParseCharacter(data);
    // case "pathforge-character-v0": return safeParseCharacter(upgradeV0toV1(data));
    default:
      // Best effort: attempt current-schema validation so partially-shaped
      // imports still surface useful field-level errors instead of a bare fail.
      return safeParseCharacter(data);
  }
}
