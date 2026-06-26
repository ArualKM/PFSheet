import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFRadioGroup,
  PDFOptionList,
} from "pdf-lib";
import { createDefaultCharacter, DEFAULT_SKILLS } from "@pathforge/schema";
import type {
  ImportAdapter,
  ImportInput,
  DetectionResult,
  ParsedImport,
  NormalizedCharacterDraft,
  ImportValidationResult,
  ImportWarning,
} from "./index";

/**
 * §12.8 Fillable PDF import — read AcroForm field names + values (no OCR). PDF
 * sheets are wildly non-standard (Paizo official, Neceros, dozens of community
 * sheets each name fields differently), so this maps a best-effort set by
 * fuzzy field-name matching (abilities, HP, BAB, saves, speed, identity) and
 * PRESERVES every extracted field under metadata.unmapped — never discarding
 * data. Derived values (saves) are imported as fixed totals; everything is
 * heavily flagged for review.
 */
const PDF_MAGIC = "%PDF";
const MAX_PDF_BYTES = 3_000_000; // PF1e fillable sheets are well under this.

/**
 * Bound parse time so a pathological PDF can't hang the request. This catches
 * async hangs; a purely CPU-bound parse bomb is additionally bounded by the
 * serverless function invocation limit (and the byte cap above).
 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function bytesOf(input: ImportInput): Uint8Array | undefined {
  if (input.bytes && input.bytes.byteLength) return input.bytes;
  // A base64 / data-URL payload may arrive via the text channel.
  if (input.text) {
    const t = input.text.trim();
    const b64 = t.startsWith("data:") ? t.slice(t.indexOf(",") + 1) : t;
    if (/^JVBER/i.test(b64) || /^[A-Za-z0-9+/=\s]+$/.test(b64.slice(0, 64))) {
      try {
        const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        if (String.fromCharCode(arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 0) === PDF_MAGIC) return arr;
      } catch {
        /* not base64 */
      }
    }
  }
  return undefined;
}

function looksLikePdf(input: ImportInput): boolean {
  if (input.sourceType === "fillable_pdf") return true;
  if (input.filename?.toLowerCase().endsWith(".pdf")) return true;
  return bytesOf(input) !== undefined;
}

async function extractFields(bytes: Uint8Array): Promise<Record<string, string | boolean>> {
  const out: Record<string, string | boolean> = {};
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const name = field.getName();
    try {
      if (field instanceof PDFTextField) out[name] = field.getText() ?? "";
      else if (field instanceof PDFCheckBox) out[name] = field.isChecked();
      else if (field instanceof PDFDropdown) out[name] = field.getSelected().join(", ");
      else if (field instanceof PDFRadioGroup) out[name] = field.getSelected() ?? "";
      else if (field instanceof PDFOptionList) out[name] = field.getSelected().join(", ");
    } catch {
      out[name] = "";
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const toInt = (v: string | boolean): number | undefined => {
  const m = String(v).match(/-?\d+/);
  return m ? Number.parseInt(m[0], 10) : undefined;
};

const ABILITY_NAMES: Record<string, string> = {
  str: "str",
  strength: "str",
  dex: "dex",
  dexterity: "dex",
  con: "con",
  constitution: "con",
  int: "int",
  intelligence: "int",
  wis: "wis",
  wisdom: "wis",
  cha: "cha",
  charisma: "cha",
};

function normalizePdf(fields: Record<string, string | boolean>, filename?: string): NormalizedCharacterDraft {
  const warnings: ImportWarning[] = [];
  const warn = (code: string, message: string) => warnings.push({ code, message });
  const unmapped: Record<string, unknown> = {};

  const character = createDefaultCharacter({ name: "Imported Character" });
  character.metadata.importSource = "fillable_pdf";

  const str = (v: string | boolean) => String(v).trim();
  const setStr = (apply: (v: string) => void, v: string | boolean) => {
    const s = str(v);
    if (s) apply(s);
  };

  const skillByLabel = new Map(DEFAULT_SKILLS.map((d) => [norm(d.label), d.key] as const));

  for (const [rawName, value] of Object.entries(fields)) {
    const n = norm(rawName);
    let mapped = true;

    // Identity
    if (/^(charactername|charname|name)$/.test(n)) setStr((v) => (character.identity.name = v), value);
    else if (/^playername?$/.test(n)) setStr((v) => (character.identity.playerName = v), value);
    else if (n === "race") setStr((v) => (character.identity.race = v), value);
    else if (n === "alignment" || n === "align") setStr((v) => (character.identity.alignment = v), value);
    else if (n === "deity") setStr((v) => (character.identity.deity = v), value);
    else if (n === "size") setStr((v) => (character.identity.size = v), value);
    else if (n === "gender") setStr((v) => (character.identity.gender = v), value);
    else if (n === "age") setStr((v) => (character.identity.age = v), value);
    else if (n === "height") setStr((v) => (character.identity.height = v), value);
    else if (n === "weight") setStr((v) => (character.identity.weight = v), value);
    else if (n === "speed" || n === "basespeed") setStr((v) => (character.combat.speed.base = /^\d+$/.test(v) ? `${v} ft` : v), value);
    // Abilities (the SCORE, not the modifier)
    else if (ABILITY_NAMES[n] || ABILITY_NAMES[n.replace(/(score)$/, "")]) {
      const key = (ABILITY_NAMES[n] ?? ABILITY_NAMES[n.replace(/(score)$/, "")]) as keyof typeof character.abilities.primary;
      const score = toInt(value);
      if (score !== undefined) character.abilities.primary[key].score = score;
      else mapped = false;
    }
    // Vital totals
    else if (/^(hp|totalhp|hpmax|maxhp|hitpoints)$/.test(n)) {
      const hp = toInt(value);
      if (hp !== undefined) character.health.maxHp = hp;
      else mapped = false;
    } else if (/^(bab|baseattack(bonus)?)$/.test(n)) {
      const bab = toInt(value);
      if (bab !== undefined) character.combat.bab.total = bab;
      else mapped = false;
    }
    // Saves → fixed totals (PathForge would otherwise add the ability mod).
    else if (/^(fort|fortitude)(save|total)?$/.test(n)) setSaveFixed(character, "fortitude", value, () => (mapped = false));
    else if (/^(ref|reflex)(save|total)?$/.test(n)) setSaveFixed(character, "reflex", value, () => (mapped = false));
    else if (/^(will)(save|total)?$/.test(n)) setSaveFixed(character, "will", value, () => (mapped = false));
    // Skills by name → ranks
    else if (skillByLabel.has(n) || skillByLabel.has(n.replace(/(ranks?|total|mod)$/, ""))) {
      const key = skillByLabel.get(n) ?? skillByLabel.get(n.replace(/(ranks?|total|mod)$/, ""));
      const ranks = toInt(value);
      const entry = key ? character.skills.list.find((s) => s.key === key) : undefined;
      if (entry && ranks !== undefined && ranks > 0 && /ranks?$/.test(n)) entry.ranks = ranks;
      else mapped = false;
    } else {
      mapped = false;
    }

    if (!mapped) {
      const v = typeof value === "boolean" ? value : str(value);
      if (v !== "" && v !== false) unmapped[rawName] = value;
    }
  }

  warn("pdf_best_effort", "PDF field names aren't standardized — only common fields were mapped (abilities, HP, BAB, saves, speed, identity). Review everything.");
  warn("saves_fixed", "Saving throws were imported as fixed totals; rebuild their formulas to make them dynamic.");
  if (Object.keys(unmapped).length) {
    character.metadata.unmapped = unmapped;
    warn("unmapped_preserved", `${Object.keys(unmapped).length} PDF field(s) couldn't be auto-mapped and were preserved under metadata.unmapped.`);
  }
  // Provenance goes in metadata.custom (a reserved namespace) so it can't clobber a
  // preserved PDF field that happens to be named the same.
  if (filename) character.metadata.custom = { ...character.metadata.custom, sourceFilename: filename };

  return { character, unmapped, warnings };
}

function setSaveFixed(
  character: ReturnType<typeof createDefaultCharacter>,
  key: "fortitude" | "reflex" | "will",
  value: string | boolean,
  onFail: () => void,
) {
  const total = toInt(value);
  if (total === undefined) {
    onFail();
    return;
  }
  // Pin the formula to the imported total (so the ability mod isn't double-added).
  // Leave base at 0 — stuffing the total into base would double-count if the user
  // later restores the default save formula.
  character.defenses.savingThrows[key].formula = String(total);
}

export const fillablePdfAdapter: ImportAdapter = {
  key: "fillable_pdf",
  label: "Fillable PDF",

  async detect(input: ImportInput): Promise<DetectionResult> {
    const matched = looksLikePdf(input);
    return {
      matched,
      confidence: matched ? 0.85 : 0,
      sourceType: "fillable_pdf",
      notes: matched ? ["Fillable PDF (AcroForm)."] : undefined,
    };
  },

  async parse(input: ImportInput): Promise<ParsedImport> {
    const bytes = bytesOf(input);
    let fields: Record<string, string | boolean> = {};
    let error: string | undefined;
    if (!bytes) {
      error = "No PDF data found.";
    } else if (bytes.byteLength > MAX_PDF_BYTES) {
      error = "That PDF is too large (max ~3 MB).";
    } else {
      try {
        fields = await withTimeout(extractFields(bytes), 8000, "Reading the PDF timed out.");
      } catch (e) {
        error = e instanceof Error ? e.message : "Couldn't read the PDF form.";
      }
    }
    return {
      sourceType: "fillable_pdf",
      raw: fields,
      sourceMetadata: { filename: input.filename, fieldCount: Object.keys(fields).length, error },
    };
  },

  async normalize(parsed: ParsedImport): Promise<NormalizedCharacterDraft> {
    const fields = (parsed.raw ?? {}) as Record<string, string | boolean>;
    if (Object.keys(fields).length === 0) {
      return {
        character: createDefaultCharacter({ name: "Imported Character" }),
        unmapped: {},
        warnings: [
          {
            code: "no_fields",
            message:
              typeof parsed.sourceMetadata.error === "string"
                ? parsed.sourceMetadata.error
                : "No fillable form fields were found in this PDF (scanned/flattened PDFs aren't supported).",
          },
        ],
      };
    }
    return normalizePdf(fields, parsed.sourceMetadata.filename as string | undefined);
  },

  async validate(draft: NormalizedCharacterDraft): Promise<ImportValidationResult> {
    return { ok: true, warnings: draft.warnings, errors: [] };
  },
};
