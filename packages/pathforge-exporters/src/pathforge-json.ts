import { CHARACTER_SCHEMA_VERSION } from "@pathforge/schema";
import type { ExportAdapter, ExportContext, ExportResult } from "./index";

/**
 * §13.1 PathForge canonical JSON export — the lossless, re-importable backup. Wraps
 * the full character document in an envelope with provenance metadata so the
 * PathForge-JSON importer (which accepts `{ character }`) can round-trip it.
 */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "character"
  );
}

export const pathforgeJsonExporter: ExportAdapter = {
  key: "pathforge_json",
  label: "PathForge JSON (full backup)",
  contentType: "application/json",

  async run(ctx: ExportContext): Promise<ExportResult> {
    const payload = {
      format: "pathforge-character-export",
      adapterVersion: "pathforge-json-export-v1",
      // NB: not a top-level `schemaVersion` — that key signals a RAW canonical
      // character to the importer's detector, which would extract this wrapper
      // instead of `.character`.
      characterSchemaVersion: CHARACTER_SCHEMA_VERSION,
      source: "PathForge",
      exportedAt: ctx.exportedAt ?? null,
      characterId: ctx.characterId ?? null,
      character: ctx.character,
      computedSummary: ctx.computedSummary ?? null,
    };
    return {
      type: "pathforge_json",
      contentType: "application/json",
      filename: `${slugify(ctx.character.identity.name)}.pathforge.json`,
      text: JSON.stringify(payload, null, 2),
      warnings: [],
    };
  },
};
