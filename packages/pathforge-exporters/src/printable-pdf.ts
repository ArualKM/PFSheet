import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PathForgeCharacterV1 } from "@pathforge/schema";
import { computeCharacter, type ComputedCharacter } from "@pathforge/rules-pf1e";
import type { ExportAdapter, ExportContext, ExportResult } from "./index";

/**
 * §13.3 printable-PDF export. A clean, B&W-print-friendly one-page (auto-flowing) character reference
 * sheet generated with pdf-lib — no headless browser, so it runs anywhere the server does. Renders the
 * COMPUTED values (final AC/saves/attacks/skills), so it matches the live sheet. This is a FULL export
 * (the action gates it to owner/editor), so no privacy filtering is applied here.
 */

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(0.11, 0.13, 0.16);
const MUTED = rgb(0.42, 0.45, 0.49);
const RULE = rgb(0.78, 0.79, 0.82);
const BAND = rgb(0.93, 0.94, 0.96);

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "character";
}

/** Replace smart punctuation + drop glyphs pdf-lib's WinAnsi standard fonts can't draw (would throw). */
function san(s: string | undefined | null): string {
  return (s ?? "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function mod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

type Doc = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
};

function addPage(doc: Doc): void {
  doc.page = doc.pdf.addPage([PAGE_W, PAGE_H]);
  doc.y = PAGE_H - MARGIN;
}

function ensure(doc: Doc, needed: number): void {
  if (doc.y - needed < MARGIN) addPage(doc);
}

function text(doc: Doc, s: string, x: number, size: number, opts: { bold?: boolean; color?: typeof INK } = {}): void {
  doc.page.drawText(san(s), { x, y: doc.y, size, font: opts.bold ? doc.bold : doc.font, color: opts.color ?? INK });
}

/** Truncate a string with an ellipsis to fit maxWidth at the given size. */
function fit(doc: Doc, s: string, size: number, maxWidth: number, bold = false): string {
  const font = bold ? doc.bold : doc.font;
  s = san(s);
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && font.widthOfTextAtSize(out + "...", size) > maxWidth) out = out.slice(0, -1);
  return out + "...";
}

function wrap(font: PDFFont, s: string, size: number, maxWidth: number): string[] {
  const words = san(s).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function sectionHeader(doc: Doc, title: string): void {
  ensure(doc, 26);
  doc.y -= 18;
  text(doc, title.toUpperCase(), MARGIN, 9, { bold: true, color: MUTED });
  doc.y -= 5;
  doc.page.drawLine({ start: { x: MARGIN, y: doc.y }, end: { x: PAGE_W - MARGIN, y: doc.y }, thickness: 0.75, color: RULE });
  doc.y -= 10;
}

/** A bordered stat cell with a label above a value. Draws at (x, top); returns nothing. */
function statCell(doc: Doc, x: number, top: number, w: number, h: number, label: string, value: string): void {
  doc.page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: RULE, borderWidth: 0.75 });
  doc.page.drawText(san(label.toUpperCase()), { x: x + 5, y: top - 12, size: 6.5, font: doc.bold, color: MUTED });
  const vSize = 13;
  const vw = doc.bold.widthOfTextAtSize(san(value), vSize);
  doc.page.drawText(san(value), { x: x + (w - vw) / 2, y: top - h + 8, size: vSize, font: doc.bold, color: INK });
}

function header(doc: Doc, character: PathForgeCharacterV1, computed: ComputedCharacter): void {
  const id = character.identity;
  // Title band.
  const bandH = 40;
  doc.page.drawRectangle({ x: MARGIN, y: doc.y - bandH, width: CONTENT_W, height: bandH, color: BAND });
  doc.page.drawText(fit(doc, id.name || "Character", 20, CONTENT_W - 16, true), {
    x: MARGIN + 10,
    y: doc.y - 26,
    size: 20,
    font: doc.bold,
    color: INK,
  });
  doc.y -= bandH + 14;

  const classLine = (id.classes ?? []).map((c) => `${san(c.name)} ${c.level}`).join(" / ");
  const bits = [
    `Level ${computed.summary.totalLevel}`,
    classLine,
    id.race,
    id.alignment,
    id.size,
    id.deity ? `Deity: ${id.deity}` : "",
  ].filter(Boolean);
  for (const line of wrap(doc.font, bits.join("   |   "), 10, CONTENT_W)) {
    text(doc, line, MARGIN, 10, { color: MUTED });
    doc.y -= 13;
  }
}

function abilities(doc: Doc, computed: ComputedCharacter): void {
  sectionHeader(doc, "Abilities");
  const keys = ["str", "dex", "con", "int", "wis", "cha"];
  const labels: Record<string, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
  const gap = 8;
  const w = (CONTENT_W - gap * 5) / 6;
  const h = 48;
  ensure(doc, h);
  const top = doc.y;
  keys.forEach((k, i) => {
    const a = computed.abilities[k];
    const x = MARGIN + i * (w + gap);
    const score = a ? String(a.effectiveScore) : "-";
    const m = a ? mod(a.modifier) : "";
    doc.page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: RULE, borderWidth: 0.75 });
    doc.page.drawText(labels[k]!, { x: x + 6, y: top - 12, size: 7, font: doc.bold, color: MUTED });
    const sw = doc.bold.widthOfTextAtSize(score, 16);
    doc.page.drawText(score, { x: x + (w - sw) / 2, y: top - 31, size: 16, font: doc.bold, color: INK });
    const mw = doc.font.widthOfTextAtSize(m, 9);
    doc.page.drawText(m, { x: x + (w - mw) / 2, y: top - h + 7, size: 9, font: doc.font, color: MUTED });
  });
  doc.y = top - h;
}

function statRow(doc: Doc, cells: { label: string; value: string }[]): void {
  const gap = 8;
  const n = cells.length;
  const w = (CONTENT_W - gap * (n - 1)) / n;
  const h = 34;
  ensure(doc, h);
  const top = doc.y;
  cells.forEach((c, i) => statCell(doc, MARGIN + i * (w + gap), top, w, h, c.label, c.value));
  doc.y = top - h;
}

function combat(doc: Doc, character: PathForgeCharacterV1, computed: ComputedCharacter): void {
  const s = computed.summary;
  // bab.total may be a formula object (numberOrFormula) — guard to a finite number, matching the
  // engine's num() fallback to 0, so the cell never prints "NaN".
  const babRaw = Number(character.combat?.bab?.total ?? 0);
  const bab = Number.isFinite(babRaw) ? babRaw : 0;
  sectionHeader(doc, "Combat & Defenses");
  statRow(doc, [
    { label: "HP", value: String(s.hp.max) },
    { label: "AC", value: String(s.ac) },
    { label: "Touch", value: String(s.touch) },
    { label: "Flat-Footed", value: String(s.flatFooted) },
    { label: "Init", value: mod(s.initiative) },
  ]);
  doc.y -= 8;
  statRow(doc, [
    { label: "Fort", value: mod(s.fortitude) },
    { label: "Ref", value: mod(s.reflex) },
    { label: "Will", value: mod(s.will) },
    { label: "BAB", value: mod(bab) },
    { label: "CMB", value: mod(computed.attackBonuses.cmb.value) },
    { label: "CMD", value: String(s.cmd) },
    { label: "Speed", value: `${s.speed.total} ft` },
  ]);
}

function attacks(doc: Doc, computed: ComputedCharacter): void {
  if (!computed.attacks.length) return;
  sectionHeader(doc, "Attacks");
  const nameW = CONTENT_W * 0.48;
  const atkW = CONTENT_W * 0.16;
  for (const a of computed.attacks) {
    ensure(doc, 14);
    text(doc, fit(doc, a.name, 10, nameW - 6, true), MARGIN, 10, { bold: true });
    text(doc, mod(a.attackBonus), MARGIN + nameW, 10);
    if (a.damage) text(doc, fit(doc, a.damage, 10, CONTENT_W - nameW - atkW, false), MARGIN + nameW + atkW, 10, { color: MUTED });
    doc.y -= 14;
  }
}

function skills(doc: Doc, character: PathForgeCharacterV1, computed: ComputedCharacter): void {
  const list = character.skills?.list ?? [];
  // Skills the player invested ranks in (the table-relevant subset), with their computed totals.
  const rows = list
    .filter((s) => Number(s.ranks ?? 0) > 0)
    .map((s) => ({ label: s.label || s.key, total: computed.skills[s.key]?.value ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (!rows.length) return;
  sectionHeader(doc, "Skills (ranked)");
  const colGap = 24;
  const colW = (CONTENT_W - colGap) / 2;
  const half = Math.ceil(rows.length / 2);
  const cols = [rows.slice(0, half), rows.slice(half)];
  const rowsNeeded = Math.max(cols[0]!.length, cols[1]!.length);
  ensure(doc, rowsNeeded * 13);
  const top = doc.y;
  cols.forEach((col, ci) => {
    const x = MARGIN + ci * (colW + colGap);
    col.forEach((r, ri) => {
      const yLine = top - ri * 13;
      doc.page.drawText(fit(doc, r.label, 9, colW - 34, false), { x, y: yLine, size: 9, font: doc.font, color: INK });
      const tv = mod(r.total);
      const tw = doc.bold.widthOfTextAtSize(tv, 9);
      doc.page.drawText(tv, { x: x + colW - tw, y: yLine, size: 9, font: doc.bold, color: INK });
    });
  });
  doc.y = top - rowsNeeded * 13 + 4;
}

function feats(doc: Doc, character: PathForgeCharacterV1): void {
  const names = (character.feats?.list ?? []).map((f) => f.name).filter(Boolean);
  if (!names.length) return;
  sectionHeader(doc, "Feats");
  for (const line of wrap(doc.font, names.map(san).join(", "), 10, CONTENT_W)) {
    ensure(doc, 13);
    text(doc, line, MARGIN, 10);
    doc.y -= 13;
  }
}

function footer(doc: Doc, ctx: ExportContext): void {
  const stamp = `Generated by PathForge - pfsheet.org${ctx.exportedAt ? ` - ${ctx.exportedAt.slice(0, 10)}` : ""}`;
  for (let i = 0; i < doc.pdf.getPageCount(); i++) {
    const p = doc.pdf.getPage(i);
    p.drawText(san(stamp), { x: MARGIN, y: 24, size: 7.5, font: doc.font, color: MUTED });
    if (ctx.shareUrl) {
      const url = san(ctx.shareUrl);
      const uw = doc.font.widthOfTextAtSize(url, 7.5);
      p.drawText(url, { x: PAGE_W - MARGIN - uw, y: 24, size: 7.5, font: doc.font, color: MUTED });
    }
  }
}

async function buildPdf(ctx: ExportContext): Promise<Uint8Array> {
  const character = ctx.character;
  const computed = computeCharacter(character);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${character.identity.name || "Character"} - PathForge`);
  pdf.setCreator("PathForge (pfsheet.org)");
  const doc: Doc = {
    pdf,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  header(doc, character, computed);
  abilities(doc, computed);
  combat(doc, character, computed);
  attacks(doc, computed);
  skills(doc, character, computed);
  feats(doc, character);
  footer(doc, ctx);

  return pdf.save();
}

function makeExporter(key: "printable_pdf_modern" | "printable_pdf_classic", label: string): ExportAdapter {
  return {
    key,
    label,
    contentType: "application/pdf",
    async run(ctx: ExportContext): Promise<ExportResult> {
      const bytes = await buildPdf(ctx);
      return {
        type: key,
        contentType: "application/pdf",
        filename: `${slugify(ctx.character.identity.name || "character")}.pdf`,
        bytes,
        warnings: [],
      };
    },
  };
}

export const printablePdfModernExporter = makeExporter("printable_pdf_modern", "Printable PDF (Modern)");
export const printablePdfClassicExporter = makeExporter("printable_pdf_classic", "Printable PDF (Classic)");
