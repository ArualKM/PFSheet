/**
 * @pathforge/exporters
 *
 * Adapter pipeline for exporting characters to external formats
 * (PathForge canonical/public JSON, Foundry PF1e Actor JSON, printable PDF,
 * Discord embed JSON, minimal API card). Adapters are added in Milestone 9;
 * this package currently defines the shared export contract.
 */
import type { PathForgeCharacterV1 } from "@pathforge/schema";

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

/** Registry of available exporters. Populated in Milestone 9. */
export const exportAdapters: ExportAdapter[] = [];
