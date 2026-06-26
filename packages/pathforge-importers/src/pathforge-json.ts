import { safeParseCharacter, createDefaultCharacter, CHARACTER_SCHEMA_VERSION } from "@pathforge/schema";
import type {
  ImportAdapter,
  ImportInput,
  DetectionResult,
  ParsedImport,
  NormalizedCharacterDraft,
  ImportValidationResult,
} from "./index";

/**
 * §12.3 PathForge JSON import — the cleanest format. Accepts a raw canonical
 * character document, a wrapped export ({ character }), a snapshot row
 * ({ sheet_data }), or a generic { data } wrapper. Since the payload is already
 * canonical, normalization is just validation; anything that fails to parse is
 * preserved verbatim rather than dropped.
 */
function getJson(input: ImportInput): unknown {
  if (input.json !== undefined) return input.json;
  if (input.text) {
    try {
      return JSON.parse(input.text);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function extractCharacter(json: unknown): unknown {
  if (!json || typeof json !== "object") return undefined;
  const o = json as Record<string, unknown>;
  if (o.schemaVersion === CHARACTER_SCHEMA_VERSION) return o;
  if (o.character && typeof o.character === "object") return o.character;
  if (o.sheet_data && typeof o.sheet_data === "object") return o.sheet_data;
  if (o.data && typeof o.data === "object") return o.data;
  return undefined;
}

function looksCanonical(c: unknown): boolean {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return o.schemaVersion === CHARACTER_SCHEMA_VERSION || (o.system === "pf1e" && "identity" in o);
}

export const pathforgeJsonAdapter: ImportAdapter = {
  key: "pathforge_json",
  label: "PathForge JSON",

  async detect(input: ImportInput): Promise<DetectionResult> {
    const candidate = extractCharacter(getJson(input));
    const matched = looksCanonical(candidate);
    return {
      matched,
      confidence: matched ? 1 : 0,
      sourceType: "pathforge_json",
      notes: matched ? ["Canonical PathForge character document."] : undefined,
    };
  },

  async parse(input: ImportInput): Promise<ParsedImport> {
    const raw = getJson(input);
    return { sourceType: "pathforge_json", raw, sourceMetadata: { filename: input.filename } };
  },

  async normalize(parsed: ParsedImport): Promise<NormalizedCharacterDraft> {
    const candidate = extractCharacter(parsed.raw);
    const result = safeParseCharacter(candidate);
    if (result.ok) {
      const character = result.character;
      character.metadata.importSource = "pathforge_json";
      return { character, unmapped: {}, warnings: [] };
    }
    // Best-effort: don't throw the data away — preserve it under unmapped.
    const character = createDefaultCharacter({ name: "Imported character" });
    character.metadata.importSource = "pathforge_json";
    const raw = (candidate ?? parsed.raw) as Record<string, unknown>;
    character.metadata.unmapped = { raw };
    return {
      character,
      unmapped: { raw },
      warnings: [
        {
          code: "schema_mismatch",
          message:
            "This PathForge JSON didn't match the current schema and may need migration; the raw data was preserved under metadata.unmapped.",
        },
      ],
    };
  },

  async validate(draft: NormalizedCharacterDraft): Promise<ImportValidationResult> {
    const result = safeParseCharacter(draft.character);
    return {
      ok: result.ok,
      warnings: draft.warnings,
      errors: result.ok ? [] : [{ code: "invalid_character", message: "The imported sheet failed schema validation." }],
    };
  },
};
