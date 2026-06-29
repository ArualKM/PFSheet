/**
 * @pathforge/exporters
 *
 * Adapter pipeline for exporting characters to external formats
 * (PathForge canonical/public JSON, Foundry PF1e Actor JSON, printable PDF,
 * Discord embed JSON, minimal API card). Adapters are added in Milestone 9;
 * this package currently defines the shared export contract.
 */
import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { pathforgeJsonExporter } from "./pathforge-json";
import { foundryPf1ActorJsonExporter } from "./foundry-pf1-actor-json";
import { printablePdfModernExporter, printablePdfClassicExporter } from "./printable-pdf";

export type ExportType =
  | "pathforge_json"
  | "pathforge_public_json"
  | "foundry_pf1_actor_json"
  | "printable_pdf_modern"
  | "printable_pdf_classic"
  | "discord_embed_json"
  | "minimal_api_card";

export type ExportContext = {
  character: PathForgeCharacterV1;
  computedSummary?: Record<string, unknown>;
  shareUrl?: string;
  /** ISO timestamp to stamp into the export (passed in so exporters stay pure). */
  exportedAt?: string;
  /** The character's DB id, for provenance metadata (e.g. Foundry flags.pathforge). */
  characterId?: string;
};

export type ExportResult = {
  type: ExportType;
  /** MIME type of the produced artifact. */
  contentType: string;
  /** Suggested download filename. */
  filename: string;
  /** Text payload (JSON), if applicable. */
  text?: string;
  /** Binary payload (PDF), if applicable. */
  bytes?: Uint8Array;
  warnings: string[];
};

export type ExportAdapter = {
  key: ExportType;
  label: string;
  contentType: string;
  run(ctx: ExportContext): Promise<ExportResult>;
};

export { pathforgeJsonExporter } from "./pathforge-json";
export { foundryPf1ActorJsonExporter } from "./foundry-pf1-actor-json";
export { printablePdfModernExporter, printablePdfClassicExporter } from "./printable-pdf";

/** Registry of available exporters. */
export const exportAdapters: ExportAdapter[] = [
  pathforgeJsonExporter,
  foundryPf1ActorJsonExporter,
  printablePdfModernExporter,
  printablePdfClassicExporter,
];

/** Run a specific exporter by type. Returns null if the type isn't implemented. */
export async function runExport(type: ExportType, ctx: ExportContext): Promise<ExportResult | null> {
  const adapter = exportAdapters.find((a) => a.key === type);
  if (!adapter) return null;
  return adapter.run(ctx);
}
