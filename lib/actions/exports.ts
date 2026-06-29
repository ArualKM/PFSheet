"use server";

import { safeParseCharacter } from "@pathforge/schema";
import { computeCharacter } from "@pathforge/rules-pf1e";
import { runExport, type ExportType } from "@pathforge/exporters";
import { createClient } from "@/lib/supabase/server";
import { buildCharacterViewModel } from "@/lib/character/view-model";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Export server actions (§13). Exports run server-side and return the artifact text
 * for the client to download. FULL exports (canonical / Foundry) contain private
 * sections, so they require edit rights; the PUBLIC JSON export is privacy-filtered
 * through the §15 view-model and is safe for anyone who can view the sheet. Every
 * export is logged to export_jobs (owner-scoped RLS).
 */
type Json = Database["public"]["Tables"]["export_jobs"]["Insert"]["metadata"];

const FULL_EXPORTS = new Set<ExportType>(["pathforge_json", "foundry_pf1_actor_json"]);
const PDF_EXPORTS = new Set<ExportType>(["printable_pdf_modern", "printable_pdf_classic"]);

async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  return { supabase, user };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "character";
}

export type ExportResultState = {
  error?: string;
  filename?: string;
  contentType?: string;
  text?: string;
  /** base64-encoded binary payload (e.g. PDF); the client decodes it for download. */
  base64?: string;
};

export async function exportCharacterAction(
  characterId: string,
  exportType: string,
): Promise<ExportResultState> {
  const { supabase, user } = await authedClient();
  if (!user) return { error: "You must be signed in." };

  const { data: char } = await supabase
    .from("characters")
    .select("id, name, owner_id, visibility, public_slug, sheet_data")
    .eq("id", characterId)
    .single();
  if (!char) return { error: "Character not found." };

  const parsed = safeParseCharacter(char.sheet_data);
  if (!parsed.ok) return { error: "This sheet failed validation and can't be exported." };
  const sheet = parsed.character;
  const computed = computeCharacter(sheet);
  const exportedAt = new Date().toISOString();

  const shareUrl = char.public_slug ? `${env.appUrl.replace(/\/$/, "")}/c/${char.public_slug}` : undefined;
  let out: ExportResultState;

  if (exportType === "pathforge_public_json") {
    // Privacy-filtered public export — safe for any viewer that can see the sheet.
    const vm = buildCharacterViewModel(sheet, computed, "public", char.visibility);
    out = {
      filename: `${slugify(char.name)}.public.json`,
      contentType: "application/json",
      text: JSON.stringify({ format: "pathforge-public", exportedAt, character: vm }, null, 2),
    };
  } else if (FULL_EXPORTS.has(exportType as ExportType) || PDF_EXPORTS.has(exportType as ExportType)) {
    // Full exports (canonical / Foundry / printable PDF) render every section → require edit rights.
    let canEdit = char.owner_id === user.id;
    if (!canEdit) {
      const { data: collab } = await supabase
        .from("character_collaborators")
        .select("role")
        .eq("character_id", characterId)
        .eq("user_id", user.id)
        .maybeSingle();
      canEdit = collab?.role === "editor" || collab?.role === "co_owner";
    }
    if (!canEdit) return { error: "Only the character's owner or an editor can export the full sheet." };

    const ex = await runExport(exportType as ExportType, {
      character: sheet,
      computedSummary: computed.summary as unknown as Record<string, unknown>,
      exportedAt,
      characterId: char.id,
      shareUrl,
    });
    if (!ex) return { error: "That export format isn't available yet." };
    if (ex.bytes) {
      // Binary (PDF): base64-encode for transport; the client decodes + downloads.
      out = {
        filename: ex.filename,
        contentType: ex.contentType,
        base64: Buffer.from(ex.bytes).toString("base64"),
      };
    } else if (ex.text !== undefined) {
      out = { filename: ex.filename, contentType: ex.contentType, text: ex.text };
    } else {
      return { error: "That export format isn't available yet." };
    }
  } else {
    return { error: "That export format isn't available yet." };
  }

  // Log the export (best-effort; owner-scoped RLS).
  await supabase.from("export_jobs").insert({
    owner_id: user.id,
    character_id: char.id,
    export_type: exportType,
    status: "completed",
    metadata: { filename: out.filename } as Json,
  });

  return out;
}
