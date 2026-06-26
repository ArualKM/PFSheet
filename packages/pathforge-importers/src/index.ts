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
import { pathforgeJsonAdapter } from "./pathforge-json";
import { mythweaversJsonAdapter } from "./mythweavers-json";
import { foundryPf1ActorJsonAdapter } from "./foundry-pf1-actor-json";
import { fillablePdfAdapter } from "./fillable-pdf";

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

export { str, toInt, parseLeadingInt, isDivider, isPlaceholder, isRealValue } from "./util";
export { pathforgeJsonAdapter } from "./pathforge-json";
export { mythweaversJsonAdapter } from "./mythweavers-json";
export { foundryPf1ActorJsonAdapter } from "./foundry-pf1-actor-json";
export { fillablePdfAdapter } from "./fillable-pdf";

/** Registry of available adapters (Milestone 8). */
export const importAdapters: ImportAdapter[] = [
  pathforgeJsonAdapter,
  foundryPf1ActorJsonAdapter,
  mythweaversJsonAdapter,
  fillablePdfAdapter,
];

/** Pick the highest-confidence adapter that matches the input, if any. */
export async function detectAdapter(
  input: ImportInput,
): Promise<{ adapter: ImportAdapter; detection: DetectionResult } | null> {
  let best: { adapter: ImportAdapter; detection: DetectionResult } | null = null;
  for (const adapter of importAdapters) {
    const detection = await adapter.detect(input);
    if (detection.matched && (!best || detection.confidence > best.detection.confidence)) {
      best = { adapter, detection };
    }
  }
  return best;
}

export type ImportPipelineResult = {
  sourceType: ImportSourceType;
  detection: DetectionResult;
  draft: NormalizedCharacterDraft;
  validation: ImportValidationResult;
  sourceMetadata: Record<string, unknown>;
};

/**
 * Run the full §12.1 pipeline: detect (or honor an explicit sourceType) → parse →
 * normalize → validate. Returns null when no adapter recognizes the input.
 */
export async function runImportPipeline(input: ImportInput): Promise<ImportPipelineResult | null> {
  let adapter: ImportAdapter | undefined;
  let detection: DetectionResult | undefined;

  if (input.sourceType && input.sourceType !== "unknown") {
    adapter = importAdapters.find((a) => a.key === input.sourceType);
    if (adapter) detection = await adapter.detect(input);
  }
  if (!adapter) {
    const best = await detectAdapter(input);
    if (!best) return null;
    adapter = best.adapter;
    detection = best.detection;
  }

  const parsed = await adapter.parse(input);
  const draft = await adapter.normalize(parsed);
  const validation = await adapter.validate(draft);
  return {
    sourceType: adapter.key,
    detection: detection ?? { matched: true, confidence: 1, sourceType: adapter.key },
    draft,
    validation,
    sourceMetadata: parsed.sourceMetadata,
  };
}
