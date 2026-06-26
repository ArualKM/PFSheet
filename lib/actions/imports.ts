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
};

export type PreviewState = { error?: string; preview?: ImportPreview };

export async function previewImportAction(input: {
  text?: string;
  filename?: string;
  sourceType?: string;
}): Promise<PreviewState> {
  const { supabase, user } = await authedClient();
  const text = input.text ?? "";
  if (!text.trim()) return { error: "Paste or upload a character export first." };
  if (text.length > MAX_SOURCE_BYTES) return { error: "That file is too large (max ~6 MB)." };

  let result: Awaited<ReturnType<typeof runImportPipeline>>;
  try {
    result = await runImportPipeline({
      text,
      sourceType: input.sourceType as ImportSourceType | undefined,
      filename: input.filename,
    });
  } catch {
    return { error: "Couldn't parse that file." };
  }
  if (!result) {
    return {
      error:
        "That file doesn't look like a supported character export yet (PathForge, Myth-Weavers, or Foundry VTT JSON).",
    };
  }

  const draft = sanitize(result.draft.character) as Partial<PathForgeCharacterV1>;
  const parsed = safeParseCharacter(draft);
  const summary = buildSummary(draft);

  const { data: job, error } = await supabase
    .from("import_jobs")
    .insert({
      owner_id: user.id,
      source_type: result.sourceType,
      status: "previewed",
      original_filename: input.filename ?? null,
      source_metadata: { shape: result.sourceMetadata?.shape ?? null, length: text.length } as Json,
      mapping_preview: { draft: parsed.ok ? parsed.character : draft, summary } as unknown as Json,
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
    },
  };
}

export type CommitTarget = { mode: "new" } | { mode: "merge"; characterId: string };

export async function commitImportAction(
  jobId: string,
  target: CommitTarget,
): Promise<{ error?: string }> {
  const { supabase, user } = await authedClient();

  const { data: job } = await supabase
    .from("import_jobs")
    .select("id, mapping_preview, original_filename")
    .eq("id", jobId)
    .single();
  if (!job) return { error: "That import session expired — please re-upload." };

  const draftRaw = (job.mapping_preview as { draft?: unknown } | null)?.draft;
  const parsed = safeParseCharacter(draftRaw);
  if (!parsed.ok) return { error: "The imported sheet failed validation and wasn't saved." };
  const sheet = parsed.character;
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

  await supabase.from("import_jobs").update({ status: "completed", character_id: characterId }).eq("id", jobId);
  revalidatePath("/characters");
  redirect(`/characters/${characterId}`);
}
