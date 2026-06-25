/**
 * @pathforge/importers
 *
 * Adapter pipeline for importing characters from external formats
 * (PathForge JSON, Foundry PF1e, Hero Lab, Myth-Weavers, fillable PDF, statblock).
 *
 * Each adapter implements the {@link ImportAdapter} contract. Adapters are added
 * in Milestone 8; this package currently defines the shared pipeline contract.
 */
import type { PathForgeCharacterV1 } from "@pathforge/schema";

export type ImportSourceType =
  | "pathforge_json"
  | "mythweavers_json"
  | "mythweavers_html"
  | "herolab_classic_xml"
  | "herolab_classic_por"
  | "herolab_online_json"
  | "foundry_pf1_actor_json"
  | "fillable_pdf"
  | "statblock"
  | "manual"
  | "unknown";

export type ImportInput = {
  sourceType?: ImportSourceType;
  filename?: string;
  /** Raw text content (JSON, HTML, XML, statblock). */
  text?: string;
  /** Raw binary content (PDF, .por archive). */
  bytes?: Uint8Array;
  /** Arbitrary already-parsed object (e.g. uploaded JSON). */
  json?: unknown;
};

export type DetectionResult = {
  matched: boolean;
  confidence: number; // 0..1
  sourceType: ImportSourceType;
  notes?: string[];
};

export type ImportWarning = { path?: string; code: string; message: string };
export type ImportError = { path?: string; code: string; message: string };

export type ParsedImport = {
  sourceType: ImportSourceType;
  raw: unknown;
  sourceMetadata: Record<string, unknown>;
};

export type NormalizedCharacterDraft = {
  /** Best-effort canonical character. May be partial; never throws away data. */
  character: Partial<PathForgeCharacterV1>;
  /** Source fields we could not map, preserved verbatim for the user. */
  unmapped: Record<string, unknown>;
  warnings: ImportWarning[];
};

export type ImportValidationResult = {
  ok: boolean;
  warnings: ImportWarning[];
  errors: ImportError[];
};

export type ImportAdapter = {
  key: ImportSourceType;
  label: string;
  detect(input: ImportInput): Promise<DetectionResult>;
  parse(input: ImportInput): Promise<ParsedImport>;
  normalize(parsed: ParsedImport): Promise<NormalizedCharacterDraft>;
  validate(draft: NormalizedCharacterDraft): Promise<ImportValidationResult>;
};

/** Registry of available adapters. Populated in Milestone 8. */
export const importAdapters: ImportAdapter[] = [];
