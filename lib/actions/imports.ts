"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeParseCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import {
  runImportPipeline,
  type ImportSourceType,
  type ImportWarning,
  type ImportError,
} from "@pathforge/importers";
import { createClient } from "@/lib/supabase/server";
import { loadCompendiumIndex } from "@/lib/character/compendium-index";
import { huntCompendium } from "@/lib/character/compendium-hunt";
import {
  collectProbes,
  assembleClaims,
  type ImportClaim,
  type ImportQuestion,
} from "@/lib/character/import-claims";
import { resolveProbeCandidates } from "@/lib/character/import-candidates";
import { applyImportResolutions, type ClaimAnswers } from "@/lib/character/import-apply";
import type { Database } from "@/lib/supabase/types";

/**
 * Import pipeline server actions (§12.1, §21.3). The adapter pipeline runs ONLY on
 * the server (never trust the client to parse). `previewImportAction` detects +
 * normalizes a source into a draft, sanitizes it, stores it in an `import_jobs`
 * row, and returns a preview + warnings — without touching any character.
 * `commitImportAction` re-reads the draft server-side and either creates a new
 * character or, for a merge, snapshots the target first (§16.1) then replaces it.
 */
type Json = Database["public"]["Tables"]["characters"]["Insert"]["sheet_data"];

const MAX_SOURCE_BYTES = 6_000_000;

const SOURCE_LABELS: Record<string, string> = {
  pathforge_json: "PathForge JSON",
  mythweavers_json: "Myth-Weavers JSON",
  foundry_pf1_actor_json: "Foundry VTT PF1e Actor",
};

async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Defense-in-depth: strip script/handler vectors from imported strings (React
 * also escapes at render). Recursive over the draft. */
function sanitize<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<\/?(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript:/gi, "") as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v);
    return out as unknown as T;
  }
  return value;
}

export type ImportSummary = {
  name: string;
  totalLevel: number;
  classLine: string;
  race?: string;
  skills: number;
  feats: number;
  spells: number;
  buffs: number;
  items: number;
  modules: string[];
  unmappedCount: number;
};

function buildSummary(draft: Partial<PathForgeCharacterV1>): ImportSummary {
  const inv = draft.inventory;
  const items =
    (inv?.weapons?.length ?? 0) +
    (inv?.armorAndShields?.length ?? 0) +
    (inv?.gear?.length ?? 0) +
    (inv?.potionsScrollsMagicItems?.length ?? 0) +
    (inv?.otherItems?.length ?? 0);
  const modules: string[] = [];
  if (draft.rules?.variants?.mythic) modules.push("mythic");
  for (const m of draft.rules?.modules ?? []) modules.push(m.key);
  return {
    name: draft.identity?.name ?? "Imported character",
    totalLevel: draft.identity?.totalLevel ?? 0,
    classLine: (draft.identity?.classes ?? []).map((c) => `${c.name} ${c.level}`).join(" / "),
    race: draft.identity?.race,
    skills: (draft.skills?.list ?? []).filter((s) => (s.ranks ?? 0) > 0).length,
    feats: draft.feats?.list?.length ?? 0,
    spells: draft.spellcasting?.knownSpells?.length ?? 0,
    buffs: draft.buffs?.active?.length ?? 0,
    items,
    modules,
    unmappedCount: Object.keys(draft.metadata?.unmapped ?? {}).length,
  };
}

export type ImportPreview = {
  jobId: string;
  sourceType: string;
  label: string;
  summary: ImportSummary;
  warnings: ImportWarning[];
  errors: ImportError[];
  /** Verification claims + clarifying questions (docs/IMPORT_VERIFICATION_PLAN.md). */
  claims: ImportClaim[];
  questions: ImportQuestion[];
  /** Verification-engine notices (e.g. notes mining hit its cap). */
  notices: string[];
};

export type PreviewState = { error?: string; preview?: ImportPreview };

export async function previewImportAction(input: {
  text?: string;
  dataBase64?: string;
  filename?: string;
  sourceType?: string;
}): Promise<PreviewState> {
  const { supabase, user } = await authedClient();
  const text = input.text ?? "";
  const isBinary = Boolean(input.dataBase64);
  const size = isBinary ? input.dataBase64!.length : text.length;
  if (!isBinary && !text.trim()) return { error: "Paste or upload a character export first." };
  if (size > MAX_SOURCE_BYTES) return { error: "That file is too large (max ~6 MB)." };

  let result: Awaited<ReturnType<typeof runImportPipeline>>;
  try {
    const pipelineInput = isBinary
      ? {
          bytes: new Uint8Array(Buffer.from(input.dataBase64!, "base64")),
          sourceType: input.sourceType as ImportSourceType | undefined,
          filename: input.filename,
        }
      : { text, sourceType: input.sourceType as ImportSourceType | undefined, filename: input.filename };
    result = await runImportPipeline(pipelineInput);
  } catch {
    return { error: "Couldn't parse that file." };
  }
  if (!result) {
    return {
      error:
        "That file doesn't look like a supported character export yet (PathForge, Myth-Weavers, or Foundry VTT JSON).",
    };
  }

  // Hunt the seeded compendiums to LINK sphere talents / spells the source dumped as free text
  // (e.g. a Myth-Weavers "2[Monk]. Mass Teleport [mass]" slot → a structured sphere talent). Pure
  // enrichment — wrapped so a compendium hiccup can never fail the import.
  try {
    const index = await loadCompendiumIndex(supabase);
    // The adapter always returns a full createDefaultCharacter (the draft type is Partial only to
    // allow lossy sources); the hunt needs the full shape and mutates it in place.
    const hunt = huntCompendium(result.draft.character as PathForgeCharacterV1, index);
    if (hunt.talentsLinked || hunt.spellsLinked || hunt.spheresAdded) {
      const parts = [
        hunt.talentsLinked ? `${hunt.talentsLinked} sphere talent${hunt.talentsLinked === 1 ? "" : "s"}` : "",
        hunt.spellsLinked ? `${hunt.spellsLinked} spell${hunt.spellsLinked === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      result.draft.warnings.push({
        code: "compendium_linked",
        message:
          `Linked ${parts.join(" and ")} to the compendium` +
          (hunt.spheresAdded ? `; detected ${hunt.spheresAdded} sphere${hunt.spheresAdded === 1 ? "" : "s"}` : "") +
          (hunt.modulesEnabled.length ? ` and enabled ${hunt.modulesEnabled.join(", ")}` : "") +
          ". Review them in the Spheres section after importing.",
      });
    }
  } catch {
    // Enrichment only — leave the parsed draft as-is if the lookup fails.
  }

  const draft = sanitize(result.draft.character) as Partial<PathForgeCharacterV1>;
  const parsed = safeParseCharacter(draft);
  const summary = buildSummary(draft);

  // Verification claims (docs/IMPORT_VERIFICATION_PLAN.md): what the import ASSERTS
  // (classes/race/feats/traits/spells + entries mined from the notes dump), each matched against
  // the compendiums for the player to confirm, correct, or keep as written. Enrichment only —
  // a lookup failure degrades to zero claims, never a failed import.
  let claims: ImportClaim[] = [];
  let questions: ImportQuestion[] = [];
  const notices: string[] = [];
  if (parsed.ok) {
    try {
      const report = collectProbes(parsed.character);
      const candidates = await resolveProbeCandidates(supabase, report.probes);
      const assembled = assembleClaims(report, candidates);
      claims = assembled.claims;
      questions = assembled.questions;
      if (report.miningTruncated) {
        notices.push(
          "Your notes held more entry-like lines than the miner scans — the rest stayed in the imported notes untouched.",
        );
      }
    } catch {
      claims = [];
      questions = [];
    }
  }

  const { data: job, error } = await supabase
    .from("import_jobs")
    .insert({
      owner_id: user.id,
      source_type: result.sourceType,
      status: "previewed",
      original_filename: input.filename ?? null,
      source_metadata: { shape: result.sourceMetadata?.shape ?? null, length: size } as Json,
      mapping_preview: {
        draft: parsed.ok ? parsed.character : draft,
        summary,
        claims,
        questions,
      } as unknown as Json,
      warnings: result.draft.warnings as unknown as Json,
      errors: result.validation.errors as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !job) return { error: error?.message ?? "Couldn't create the import job." };

  return {
    preview: {
      jobId: job.id,
      sourceType: result.sourceType,
      label: SOURCE_LABELS[result.sourceType] ?? result.sourceType,
      summary,
      warnings: result.draft.warnings,
      errors: result.validation.errors,
      claims,
      questions,
      notices,
    },
  };
}

export type CommitTarget = { mode: "new" } | { mode: "merge"; characterId: string };

export async function commitImportAction(
  jobId: string,
  target: CommitTarget,
  /** Verification answers from the wizard's Verify step (absent = the old import-as-is path). */
  answers?: ClaimAnswers,
): Promise<{ error?: string }> {
  const { supabase, user } = await authedClient();

  const { data: job } = await supabase
    .from("import_jobs")
    .select("id, mapping_preview, original_filename, warnings")
    .eq("id", jobId)
    .single();
  if (!job) return { error: "That import session expired — please re-upload." };

  const preview = job.mapping_preview as {
    draft?: unknown;
    claims?: ImportClaim[];
    questions?: ImportQuestion[];
  } | null;
  const parsed = safeParseCharacter(preview?.draft);
  if (!parsed.ok) return { error: "The imported sheet failed validation and wasn't saved." };
  let sheet = parsed.character;

  // Apply verified claims (linked compendium rows, re-filed entries, module answers) on top of
  // the stored draft. The claims come from the JOB ROW, not the client — the client only picks
  // resolutions. Best-effort per claim; a failed apply keeps that entry as written. Question
  // answers apply even with zero claims (a re-import can be questions-only, e.g. mythic on/off).
  let applyReport: { applied: string[]; warnings: string[] } | null = null;
  if (answers && ((preview?.claims?.length ?? 0) > 0 || (preview?.questions?.length ?? 0) > 0)) {
    try {
      applyReport = await applyImportResolutions(supabase, sheet, preview?.claims ?? [], preview?.questions ?? [], answers);
      // Defense-in-depth: the mutated sheet must still validate — no code path may persist
      // schema-invalid sheet_data. On failure, fall back to the untouched stored draft.
      const reparsed = safeParseCharacter(sheet);
      if (reparsed.ok) {
        sheet = reparsed.character;
      } else {
        const fallback = safeParseCharacter(preview?.draft);
        if (fallback.ok) sheet = fallback.character;
        applyReport = {
          applied: [],
          warnings: ["Verification changes didn't validate — the sheet was imported exactly as parsed."],
        };
      }
    } catch {
      // The unverified draft still imports fine — verification is enrichment.
      applyReport = { applied: [], warnings: ["Verification couldn't be applied — the sheet was imported as written."] };
    }
  }

  const computed = computeCharacter(sheet);
  const nowIso = new Date().toISOString();

  await supabase
    .from("profiles")
    .upsert(
      { id: user.id, display_name: user.email?.split("@")[0] ?? "Adventurer" },
      { onConflict: "id", ignoreDuplicates: true },
    );

  let characterId: string;
  if (target.mode === "new") {
    const { data: created, error } = await supabase
      .from("characters")
      .insert({
        owner_id: user.id,
        name: sheet.identity.name,
        system_key: "pf1e",
        schema_version: sheet.schemaVersion,
        sheet_data: sheet as unknown as Json,
        computed_summary: computed.summary as unknown as Json,
        last_calculated_at: nowIso,
      })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Couldn't create the character." };
    characterId = created.id;
  } else {
    // Merge = snapshot the current version (§16.1 "before import"), then replace.
    const { data: existing } = await supabase
      .from("characters")
      .select("sheet_data")
      .eq("id", target.characterId)
      .single();
    if (!existing) return { error: "Couldn't find that character." };

    // Snapshot UNCONDITIONALLY (even if the current sheet doesn't parse) so the
    // merge is always reversible, AND so this can_edit-gated insert authorizes the
    // operation — never relying on it being conditional.
    const cur = safeParseCharacter(existing.sheet_data);
    const curComputed = cur.ok ? computeCharacter(cur.character) : null;
    const { error: snapError } = await supabase.from("character_snapshots").insert({
      character_id: target.characterId,
      created_by: user.id,
      label: `Before import${job.original_filename ? ` (${job.original_filename})` : ""}`,
      reason: "import",
      sheet_data: existing.sheet_data,
      computed_summary: (curComputed?.summary ?? {}) as unknown as Json,
      computed_values: (curComputed ?? {}) as unknown as Json,
    });
    if (snapError) {
      return { error: "Couldn't snapshot the current sheet before merging — you may not have permission to edit that character." };
    }

    // Verify the replace actually landed: an RLS-filtered UPDATE affects 0 rows
    // and returns NO error, so don't treat error===null as success.
    const { data: updated, error } = await supabase
      .from("characters")
      .update({
        name: sheet.identity.name,
        sheet_data: sheet as unknown as Json,
        computed_summary: computed.summary as unknown as Json,
        last_calculated_at: nowIso,
      })
      .eq("id", target.characterId)
      .select("id");
    if (error) return { error: error.message };
    if (!updated || updated.length === 0) {
      return { error: "You don't have permission to replace that character." };
    }
    characterId = target.characterId;
  }

  // Record what verification actually did (applied list + warnings) on the job row — the
  // imports page is the audit trail, and apply warnings must not vanish into a redirect.
  const priorWarnings = Array.isArray(job.warnings) ? (job.warnings as unknown[]) : [];
  await supabase
    .from("import_jobs")
    .update({
      status: "completed",
      character_id: characterId,
      ...(applyReport
        ? {
            warnings: [
              ...priorWarnings,
              ...applyReport.warnings.map((w) => ({ code: "verification", message: w })),
            ] as unknown as Json,
          }
        : {}),
    })
    .eq("id", jobId);
  revalidatePath("/characters");
  redirect(`/characters/${characterId}`);
}
