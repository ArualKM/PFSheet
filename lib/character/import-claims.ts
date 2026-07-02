import type { PathForgeCharacterV1 } from "@pathforge/schema";

/**
 * Import verification claims (docs/IMPORT_VERIFICATION_PLAN.md): after an adapter parses a source
 * sheet, every assertion the import makes ("this feat slot is the feat Power Attack", "this class
 * line means Unchained Rogue 20 + Unchained Monk 20 gestalt", "this Traits-field line is the trait
 * Fate's Favored") becomes a CLAIM the player verifies before commit.
 *
 * Two pure phases so the whole engine is unit-testable against the real Myth-Weavers fixtures:
 *   1. collectProbes(character)      — what to look up (normalized match keys per entry), plus the
 *                                      clarifying questions (gestalt / mythic / unchained).
 *   2. assembleClaims(probes, hits)  — score the server-resolved candidates into claims with
 *                                      confidence + a safe default resolution.
 *
 * The server resolves probe keys against the compendiums between the phases (exact name matches in
 * one batched query per table, then ranked-search fallbacks). Nothing here touches the network.
 *
 * Source-field misuse is the norm, not the exception (owner-confirmed; visible in the fixtures):
 * feat slots hold class features and dividers, spell slots hold sphere talents, and the free-text
 * areas hold real traits/drawbacks/feats buried in prose. So feat/spell probes are matched against
 * MULTIPLE tables (a feat-slot entry that exactly matches a class feature is re-filed, not
 * force-linked as a feat), and entry-looking lines mined from the preserved notes dump become
 * additive claims of their own.
 *
 * SHEET ORGANIZATION AS SIGNAL: power users structure their slots and notes with headers
 * ("##### Rogue Class Features #####", "CASTING TALENTS", "MYTHIC"). classifyHeader() turns those
 * into a running CONTEXT that re-orders which tables a probe matches first (a line under a sphere
 * header probes sphere_talents before anything else) and breaks ties when a name exists in several
 * compendiums. When a name matches multiple rows and no context/slot signal disambiguates, the
 * claim is NOT auto-linked — it comes back medium-confidence with every candidate listed so the
 * player picks from the selector.
 */

export type ClaimKind =
  | "class"
  | "archetype"
  | "race"
  | "feat"
  | "trait"
  | "feature"
  | "spell"
  | "drawback"
  | "sphere_talent"
  | "mythic_ability"
  | "racial_trait";

/** The compendium tables a probe may be matched against, in preference order per kind. */
export const KIND_TABLES: Record<ClaimKind, string[]> = {
  class: ["class_compendium"],
  archetype: ["archetype_compendium"],
  race: ["race_compendium"],
  feat: ["feat_compendium", "class_feature_compendium", "trait_compendium"],
  trait: ["trait_compendium", "feat_compendium", "drawback_compendium"],
  feature: ["class_feature_compendium", "feat_compendium"],
  spell: ["spell_compendium", "feat_compendium", "class_feature_compendium"],
  drawback: ["drawback_compendium", "trait_compendium"],
  sphere_talent: ["sphere_talents", "feat_compendium", "class_feature_compendium"],
  mythic_ability: ["mythic_path_ability_compendium", "feat_compendium"],
  racial_trait: ["alternate_racial_trait_compendium", "trait_compendium", "feat_compendium"],
};

/** Which claim kind a match in a given table implies (drives re-filing misused slots). */
export const TABLE_KIND: Record<string, ClaimKind> = {
  class_compendium: "class",
  archetype_compendium: "archetype",
  race_compendium: "race",
  feat_compendium: "feat",
  trait_compendium: "trait",
  class_feature_compendium: "feature",
  spell_compendium: "spell",
  drawback_compendium: "drawback",
  sphere_talents: "sphere_talent",
  mythic_path_ability_compendium: "mythic_ability",
  alternate_racial_trait_compendium: "racial_trait",
};

export type Candidate = {
  table: string;
  slug: string;
  name: string;
  /** Short context shown under the name (source book / type / level). */
  meta?: string;
  /** The owning group — class for class features, sphere for talents, race for alt racial traits,
   * path for mythic abilities. Used to break same-name ties (prefer the linked class's row). */
  group?: string;
  /** "exact" = normalized-name equality; "search" = ranked-search suggestion. */
  match: "exact" | "search";
};

export type ClaimResolution =
  | { mode: "linked"; table: string; slug: string; name?: string }
  | { mode: "generic" }
  | { mode: "skipped" };

export type ImportClaim = {
  id: string;
  /** The kind the claim currently resolves to (matches the chosen candidate's table). */
  kind: ClaimKind;
  /** The kind the source PUT it in (feat slot vs spells field vs mined text). */
  sourceKind: ClaimKind;
  sourceText: string;
  /** Where the text came from ("Feat slot", "Spells field", "Traits field", "Class line"…). */
  sourceLabel: string;
  matchKey: string;
  candidates: Candidate[];
  confidence: "high" | "medium" | "low";
  resolution: ClaimResolution;
  /** Multiple same-strength matches and nothing to break the tie — the player picks from the list. */
  ambiguous?: boolean;
  /** Class claims: the level to apply at (0 = unknown — the player sets it in the Verify step). */
  level?: number;
  /** Gestalt: which track this class segment belongs to ("A/B || C" = A+B on a, C on b). */
  track?: "a" | "b";
  /** Class claims: the unchained question that steers this claim's core-vs-unchained pick. */
  unchainedQuestionId?: string;
  /** Archetype claims: the claim id of the class they modify. */
  parentClassClaimId?: string;
  /** Mined from the preserved notes dump — ADDS a new entry instead of replacing a parsed one. */
  mined?: boolean;
  /** The id of the draft entry this claim covers (feats.list / knownSpells / classes id). */
  draftEntryId?: string;
};

export type ImportQuestion = {
  id: string;
  kind: "gestalt" | "mythic" | "unchained";
  text: string;
  /** For unchained questions: which base class. */
  className?: string;
  defaultAnswer: boolean;
};

export type ClaimProbe = {
  id: string;
  kind: ClaimKind;
  sourceText: string;
  sourceLabel: string;
  /** Ordered normalized keys to try (first = most specific). */
  keys: string[];
  /** Header/section context ("##### Class Features #####" above this slot) — re-orders the tables. */
  context?: ClaimKind;
  level?: number;
  track?: "a" | "b";
  unchainedQuestionId?: string;
  parentClassProbeId?: string;
  mined?: boolean;
  draftEntryId?: string;
};

export type ProbeCandidates = Record<string, Candidate[]>;

/** The tables to match a probe against, context tables first (dedup'd, preference order kept). */
export function probeTables(probe: Pick<ClaimProbe, "kind" | "context">): string[] {
  const tables = probe.context
    ? [...KIND_TABLES[probe.context], ...KIND_TABLES[probe.kind]]
    : KIND_TABLES[probe.kind];
  return [...new Set(tables)];
}

/* --------------------------------------------------------------------------- */
/* Normalization                                                                */
/* --------------------------------------------------------------------------- */

export const normalizeKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    // Hyphens fold to spaces: players type "Two Weapon Fighting", the book says
    // "Two-Weapon Fighting" — same entry. (The ranked-search pass finds it; this
    // makes the equality check promote it to an exact auto-link.)
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Pre-fold normalization (hyphens KEPT). A few compendium pairs are genuinely DIFFERENT entries
 * whose names differ only by hyphenation ("Thrill Seeker" vs "Thrill-Seeker" traits) — when a
 * folded lookup matches several rows, the punctuation-faithful one wins. */
export const strictKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** A divider / header row a power user typed into a slot ("#### Feats ####"). */
export const isDivider = (s: string): boolean => /#{3,}/.test(s) || s.trim().length === 0;

/**
 * Classify a header / divider / caption line into the claim kind it announces, so entries under it
 * probe the right compendium first ("##### Rogue Class Features #####" → feature; "CASTING
 * TALENTS" → sphere_talent; "MYTHIC" → mythic_ability; "RACE TRAITS:" → racial_trait). Order
 * matters: "RACE TRAITS" must win over trait, "MYTHIC DRAWBACKS" over mythic.
 */
export function classifyHeader(raw: string): ClaimKind | null {
  const t = raw
    .replace(/[#*_=\-—–]+/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/:\s*$/, "")
    .trim()
    .toLowerCase();
  if (!t) return null;
  if (/\brac(?:e|ial)\b/.test(t)) return "racial_trait";
  if (/\bdrawbacks?\b|\bflaws?\b/.test(t)) return "drawback";
  if (/\bmythic\b/.test(t)) return "mythic_ability";
  if (/\bspheres?\b|\btalents?\b|\bcasting\b/.test(t)) return "sphere_talent";
  if (/\bclass features?\b|\bki powers?\b|\bclass abilit/.test(t)) return "feature";
  if (/\bfeats?\b/.test(t)) return "feat";
  if (/\btraits?\b/.test(t)) return "trait";
  if (/\bspells?\b/.test(t)) return "spell";
  if (/\bfeatures?\b|\babilit(?:y|ies)\b|\bpowers?\b/.test(t)) return "feature";
  return null;
}

/**
 * Strip slot bookkeeping so the bare entry name remains. Handles the fixtures' real patterns:
 * "Rogue 9. Improved Critical (Close)", "9th: Extra Rogue Talent", "Oath 10: X", "1[Monk]. Name",
 * "11th: Name", bullets ("• ", "> ", "- "), and trailing "(...)" / "[...]" qualifiers.
 */
export function entryKeys(raw: string): string[] {
  let s = raw.trim().replace(/^[•>*\-–]\s*/, "");
  s = s.replace(/^\d+\s*\[[^\]]*\]\s*[.:]\s*/, ""); // "1[Monk]. "
  s = s.replace(/^[A-Za-z' ]{0,16}\d+\s*[.:]\s*/, ""); // "Rogue 9. " / "Oath 10: " / "9. "
  s = s.replace(/^\d+(st|nd|rd|th)\s*[.:]?\s*/i, ""); // "9th: "
  s = s.trim();
  if (!s) return [];
  // Keys keep the SOURCE's casing (the server's fast exact-match pass is case-sensitive; real
  // entries are usually typed with the book's capitalization). Compare via normalizeKey().
  const keys: string[] = [];
  const seen = new Set<string>();
  const push = (k: string) => {
    const t = k.trim();
    const n = normalizeKey(t);
    if (n.length >= 3 && !seen.has(n)) {
      seen.add(n);
      keys.push(t);
    }
  };
  push(s);
  // Progressive qualifier stripping: "Improved Critical (Close)" → "Improved Critical";
  // "Mass Teleport [mass]" → "Mass Teleport".
  let stripped = s;
  for (let i = 0; i < 3; i++) {
    const next = stripped.replace(/\s*(\([^()]*\)|\[[^\][]*\])\s*$/, "").trim();
    if (next === stripped) break;
    stripped = next;
    push(stripped);
  }
  return keys;
}

/* --------------------------------------------------------------------------- */
/* Class-line parsing                                                           */
/* --------------------------------------------------------------------------- */

const UNCHAINED_CLASSES = ["barbarian", "monk", "rogue", "summoner"];

export type ParsedClassSegment = {
  raw: string;
  /** The base class name ("Rogue"), UC prefixes normalized away. */
  baseName: string;
  /** The source explicitly said unchained ("UCRogue", "Unchained Monk", "Rogue (Unchained)"). */
  unchainedHint: boolean;
  /** True when the base is one of the four classes with an unchained variant. */
  unchainedCapable: boolean;
  archetypes: string[];
  /** Parsed per-class level (undefined = not stated on the line). */
  level?: number;
  /** Gestalt track ("Fighter 5/Wizard 5 || Rogue 10" = Fighter+Wizard on a, Rogue on b). */
  track?: "a" | "b";
};

export type ParsedClassLine = { gestalt: boolean; segments: ParsedClassSegment[] };

/** Split on a separator, but only OUTSIDE parentheses/brackets. */
export function splitTopLevel(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && sep.test(ch)) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/**
 * Parse a Myth-Weavers class line. Real example (the owner's sheet):
 * "UCRogue (Time Thief/Talent Thief) || UCMonk (Drifting Lotus)" → gestalt, two segments, each
 * unchained-hinted with archetypes. Also handles "Skald 7 / Dragon Disciple 3" (levels per
 * segment) and a multiclassed gestalt track "Fighter 5/Wizard 5 || Rogue 10" (Fighter + Wizard
 * both on track a — every segment carries its track).
 */
export function parseClassLine(raw: string): ParsedClassLine {
  const gestalt = raw.includes("||");
  const sides = gestalt
    ? raw
        .split("||")
        .map((s) => s.trim())
        .filter(Boolean)
    : [raw];
  const segments: ParsedClassSegment[] = [];
  sides.forEach((side, sideIdx) => {
    // Each gestalt side may itself be a multiclass ("Fighter 5/Wizard 5").
    const parts = splitTopLevel(side, /[/|]/);
    for (const part of parts) {
      let s = part.trim();
      const archetypes: string[] = [];
      // Extract "(A/B)" archetype groups (any number of groups).
      s = s.replace(/\(([^()]*)\)/g, (_m, inner: string) => {
        for (const a of inner.split("/")) {
          const t = a.trim();
          // "(Unchained)" / "(UC)" is a variant marker, not an archetype.
          if (t && !/^(unchained|uc)$/i.test(t)) archetypes.push(t);
        }
        return " ";
      });
      const unchainedParen = /\((?:unchained|uc)\)/i.test(part);
      const levelMatch = s.match(/(\d+)\s*$/);
      const level = levelMatch ? parseInt(levelMatch[1]!, 10) : undefined;
      if (levelMatch) s = s.slice(0, levelMatch.index).trim();
      // UC prefixes: "UCRogue", "UC Rogue", "U.Rogue", "Unchained Rogue".
      let unchainedHint = unchainedParen;
      let baseName = s.replace(/\s+/g, " ").trim();
      const uc = baseName.match(/^(?:uc\s*|u\.\s*|unchained\s+)(.+)$/i);
      if (uc?.[1]) {
        unchainedHint = true;
        baseName = uc[1].trim();
      }
      const unchainedCapable = UNCHAINED_CLASSES.includes(baseName.toLowerCase());
      segments.push({
        raw: part.trim(),
        baseName,
        unchainedHint,
        unchainedCapable,
        archetypes,
        level,
        ...(gestalt ? { track: sideIdx === 0 ? ("a" as const) : ("b" as const) } : {}),
      });
    }
  });
  return { gestalt, segments };
}

/* --------------------------------------------------------------------------- */
/* Notes mining                                                                 */
/* --------------------------------------------------------------------------- */

export type MinedEntry = { sourceLabel: string; text: string; context?: ClaimKind };
export type MinedReport = { entries: MinedEntry[]; truncated: boolean };

/**
 * Mine entry-looking lines from the adapter's labeled notes dump ("# Imported from Myth-Weavers"
 * with "## <field label>" sections). Owners put real traits/drawbacks/feats in free-text areas
 * ("CHARACTER TRAITS: • Fate's Favored"), so short, non-prose lines become additive claims —
 * each tagged with the running header context ("MYTHIC", "MONK KI POWERS", "RACE TRAITS:") so
 * the server probes the right compendium first. Bookkeeping lines ("Total Points: 9",
 * "Mythic Tier: 10") are junk-filtered BEFORE they consume the cap, and hitting the cap is
 * reported (`truncated`) instead of silently dropping the rest.
 */
export function mineNotesEntries(notesDump: string, cap = 80): MinedReport {
  const entries: MinedEntry[] = [];
  let section = "Notes";
  let context: ClaimKind | undefined;
  const lines = notesDump.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!.trim();
    if (!line) continue;
    const heading = line.match(/^##\s+(.+)$/);
    if (heading?.[1]) {
      section = heading[1].trim();
      context = classifyHeader(section) ?? undefined;
      continue;
    }
    // Any other hash-prefixed line is a heading/divider, never an entry — classify it as context
    // ("################# MYTHIC #################", the adapter's "# Imported from …" title).
    if (/^#/.test(line) || isDivider(line)) {
      context = classifyHeader(line) ?? undefined;
      continue;
    }
    // Section captions inside the text ("RACE TRAITS:", "CHARACTER TRAITS:") aren't entries —
    // but they ARE context.
    if (/^[A-Z .]+:$/.test(line)) {
      context = classifyHeader(line) ?? context;
      continue;
    }
    // Entry-shaped: bulleted or short, without sentence-like prose.
    const bullet = /^[•>*\-–]\s*/.test(line) || /^\d+\s*[.:]\s+/.test(line);
    let text = line.replace(/^[•>*\-–]\s*/, "").replace(/^\d+\s*[.:]\s+/, "");
    // Markdown emphasis wrappers ("__**The Lover's Regalia**__") aren't part of the name.
    text = text.replace(/^[_*~`]+/, "").replace(/[_*~`]+$/, "").trim();
    // "Background: Child of Time [ ... ]" → "Child of Time"
    text = text.replace(/^(background|trait|drawback|feat)s?\s*:\s*/i, "");
    // An empty-value label ("Path Ability 8:", "Feat 5:") is bookkeeping, not an entry.
    if (!bullet && /^.{1,40}:$/.test(text)) {
      context = classifyHeader(text) ?? context;
      continue;
    }
    // Bookkeeping junk (non-bulleted): "Total Points: 9", "Mythic Tier: 10 (0 Trial)", GP ledgers.
    if (!bullet && /^[\w /()'+.-]{1,28}:\s*[+\-±]?\d/.test(text)) continue;
    // Other non-bulleted "Label: value" lines are stat bookkeeping too ("Magic Type: Divine",
    // "Casting Ability Modifier: Charisma") — classify the label as context, never an entry.
    const labelValue = !bullet && text.match(/^([^:•]{2,40}):\s+\S/);
    if (labelValue) {
      context = classifyHeader(labelValue[1]!) ?? context;
      continue;
    }
    // A bulleted "Name: description" entry ("• Reactionary: +2 initiative") — the name half is
    // the entry; the description stays behind in the preserved notes.
    const colonName = bullet ? text.match(/^([^:]{3,48}):\s+\S/) : null;
    if (colonName) text = colonName[1]!.trim();
    // Judge prose-ness on the entry NAME (bracket/paren qualifiers stripped): "Child of Time
    // [Planar Infusion (Conduit) [Time], …]" is an entry however long its qualifiers run.
    let bare = text;
    for (let i = 0; i < 3; i++) bare = bare.replace(/\s*(\([^()]*\)|\[[^\][]*\])/g, " ");
    bare = bare.replace(/\s+/g, " ").trim();
    const words = bare.split(/\s+/).length;
    // A short non-bulleted category header ("Mythic Drawbacks", "MONK KI POWERS") updates the
    // context instead of becoming an entry: ALL-CAPS, or Title Case ending in a plural grouping word.
    if (!bullet && words <= 4) {
      const allCaps = /[A-Z]/.test(bare) && !/[a-z]/.test(bare);
      const pluralGroup = /\b(drawbacks|flaws|qualities|boons|feats|traits|talents|powers|spells|features|abilities)$/i.test(bare);
      const kind = classifyHeader(bare);
      if (kind && (allCaps || pluralGroup)) {
        context = kind;
        continue;
      }
    }
    const prose = /[.!?]\s+[A-Z]/.test(bare) || bare.length > 64 || words > 8;
    if (!bullet && (prose || words < 2)) continue;
    if (prose) continue;
    if (bare.length < 4) continue;
    // Numeric-led lines are ledgers/stat lines ("+4500 (Quest) RT 7500", "24 Int"), never names.
    if (/^[+±-]?\d/.test(bare)) continue;
    if (entries.length >= cap) {
      // A real entry didn't fit — report the truncation instead of silently dropping the rest.
      return { entries, truncated: true };
    }
    entries.push({ sourceLabel: section, text, ...(context ? { context } : {}) });
  }
  return { entries, truncated: false };
}

/* --------------------------------------------------------------------------- */
/* Phase 1 — collect probes + questions                                         */
/* --------------------------------------------------------------------------- */

export type ProbeReport = {
  probes: ClaimProbe[];
  questions: ImportQuestion[];
  classLine?: ParsedClassLine;
  /** Notes mining hit its cap — some lines were never scanned. */
  miningTruncated?: boolean;
};

export function collectProbes(character: PathForgeCharacterV1): ProbeReport {
  const probes: ClaimProbe[] = [];
  const questions: ImportQuestion[] = [];
  let n = 0;
  const pid = (p: string) => `claim-${p}-${n++}`;

  // ── Class line(s) ──────────────────────────────────────────────────────────
  let classLine: ParsedClassLine | undefined;
  const totalLevel = character.identity.totalLevel ?? 0;
  for (const cls of character.identity.classes) {
    if (cls.compendiumId) continue; // already structured (e.g. a PathForge re-import)
    const parsed = parseClassLine(cls.name);
    classLine = classLine ?? parsed;
    if (parsed.gestalt) {
      questions.push({
        id: pid("q-gestalt"),
        kind: "gestalt",
        text: "The class line uses “||” — is this a gestalt game (both tracks at full level, best of each)?",
        defaultAnswer: true,
      });
    }
    const segmentsOnTrack = (t: "a" | "b" | undefined) => parsed.segments.filter((s) => s.track === t).length;
    for (const seg of parsed.segments) {
      const probeId = pid("class");
      const keys: string[] = [];
      if (seg.unchainedCapable) {
        // Both rows exist in the compendium; the unchained question / candidate pick decides.
        keys.push(`${seg.baseName} (Unchained)`);
        keys.push(seg.baseName);
      } else {
        keys.push(...entryKeys(seg.baseName));
      }
      // Default level: a lone segment (or the only class on its gestalt track) is the full
      // character level; a multiclass segment without a stated level is UNKNOWN (0) — the player
      // sets it in the Verify step rather than us guessing.
      const soleOnTrack = parsed.gestalt ? segmentsOnTrack(seg.track) === 1 : parsed.segments.length === 1;
      probes.push({
        id: probeId,
        kind: "class",
        sourceText: seg.raw,
        sourceLabel: "Class line",
        keys,
        level: seg.level ?? (soleOnTrack ? totalLevel : 0),
        ...(seg.track ? { track: seg.track } : {}),
        draftEntryId: cls.id,
      });
      if (seg.unchainedCapable) {
        const qId = pid("q-unchained");
        questions.push({
          id: qId,
          kind: "unchained",
          className: seg.baseName,
          text: `Which ${seg.baseName} does this table use — core or Unchained?`,
          defaultAnswer: seg.unchainedHint, // true = unchained
        });
        probes[probes.length - 1]!.unchainedQuestionId = qId;
      }
      for (const arch of seg.archetypes) {
        probes.push({
          id: pid("arch"),
          kind: "archetype",
          sourceText: arch,
          sourceLabel: `Class line (${seg.baseName})`,
          keys: entryKeys(arch),
          parentClassProbeId: probeId,
        });
      }
    }
  }

  // ── Mythic confirmation (the adapter flips the variant on "MTn") ───────────
  if (character.rules.variants.mythic) {
    questions.push({
      id: pid("q-mythic"),
      kind: "mythic",
      text: "Mythic content was detected — keep the Mythic module enabled?",
      defaultAnswer: true,
    });
  }

  // ── Race ───────────────────────────────────────────────────────────────────
  if (character.identity.race && !character.identity.raceApplied) {
    probes.push({
      id: pid("race"),
      kind: "race",
      sourceText: character.identity.race,
      sourceLabel: "Race",
      keys: entryKeys(character.identity.race),
    });
  }

  // ── Feat slots (dividers become CONTEXT for the entries below them) ────────
  let featCtx: ClaimKind | undefined;
  for (const f of character.feats.list) {
    if (f.compendiumId) continue;
    if (isDivider(f.name)) {
      featCtx = classifyHeader(f.name) ?? undefined;
      continue;
    }
    const keys = entryKeys(f.name);
    if (!keys.length) continue;
    probes.push({
      id: pid("feat"),
      kind: "feat",
      sourceText: f.name,
      sourceLabel: "Feat slot",
      keys,
      ...(featCtx && featCtx !== "feat" ? { context: featCtx } : {}),
      draftEntryId: f.id,
    });
  }

  // ── Spell slots (whatever the compendium hunt didn't already link) ─────────
  // Only compendiumId marks "already linked" — adapters (Foundry) legitimately set `school`
  // on unlinked spells, and those still deserve verification.
  let spellCtx: ClaimKind | undefined;
  for (const s of character.spellcasting.knownSpells) {
    if (isDivider(s.name)) {
      spellCtx = classifyHeader(s.name) ?? undefined;
      continue;
    }
    if ((s as { compendiumId?: string }).compendiumId) continue;
    const keys = entryKeys(s.name);
    if (!keys.length) continue;
    probes.push({
      id: pid("spell"),
      kind: "spell",
      sourceText: s.name,
      sourceLabel: "Spells field",
      keys,
      ...(spellCtx && spellCtx !== "spell" ? { context: spellCtx } : {}),
      draftEntryId: s.id,
    });
  }

  // ── Traits the adapter parsed (rare) + entries mined from the notes dump ───
  for (const t of character.traits.list) {
    if (t.compendiumId) continue;
    const keys = entryKeys(t.name);
    if (!keys.length) continue;
    probes.push({ id: pid("trait"), kind: "trait", sourceText: t.name, sourceLabel: "Traits", keys, draftEntryId: t.id });
  }
  let miningTruncated = false;
  if (character.notes.player?.includes("# Imported from")) {
    const mined = mineNotesEntries(character.notes.player);
    miningTruncated = mined.truncated;
    for (const entry of mined.entries) {
      probes.push({
        id: pid("mined"),
        kind: "trait",
        sourceText: entry.text,
        sourceLabel: entry.sourceLabel,
        keys: entryKeys(entry.text),
        ...(entry.context && entry.context !== "trait" ? { context: entry.context } : {}),
        mined: true,
      });
    }
  }

  return { probes, questions, classLine, miningTruncated };
}

/* --------------------------------------------------------------------------- */
/* Phase 2 — assemble claims from resolved candidates                           */
/* --------------------------------------------------------------------------- */

export type ClaimReport = { claims: ImportClaim[]; questions: ImportQuestion[] };

/** Pick between the "X (Unchained)" and "X" exact rows of a class claim. Shared by the preview
 * default, the Verify panel's unchained toggle, and the commit-time answer application. */
export function pickClassCandidate(candidates: Candidate[], wantUnchained: boolean | undefined): Candidate | undefined {
  const exacts = candidates.filter((c) => c.match === "exact");
  const unchainedRow = exacts.find((c) => /\(unchained\)/i.test(c.name));
  const coreRow = exacts.find((c) => !/\(unchained\)/i.test(c.name));
  return wantUnchained === undefined
    ? (coreRow ?? unchainedRow)
    : wantUnchained
      ? (unchainedRow ?? coreRow)
      : (coreRow ?? unchainedRow);
}

/** Does a candidate's owning group ("Rogue (Unchained)") match one of the linked class names?
 * Compares both the full name and the parenthetical-stripped base. */
function groupMatchesClass(group: string, classNames: Set<string>): boolean {
  const g = normalizeKey(group);
  if (classNames.has(g)) return true;
  const base = normalizeKey(group.replace(/\s*\([^)]*\)\s*$/, ""));
  return classNames.has(base);
}

/**
 * Turn probes + server-resolved candidates into claims with safe defaults:
 *  - a single exact match → high confidence, default LINKED (in another table = the claim is
 *    RE-FILED to that table's kind: a feat slot holding "Trapfinding" links as a class feature);
 *  - multiple exact matches → the header CONTEXT or the slot's own kind breaks the tie (first
 *    table in probeTables order with a hit); several same-name rows INSIDE that table prefer the
 *    row whose group matches a linked class; still tied → AMBIGUOUS: medium confidence, default
 *    generic (mined: skipped), every candidate listed for the player's selector;
 *  - search-only candidates → medium, default GENERIC (a wrong link is worse than none);
 *  - nothing → low; parsed entries default GENERIC, mined entries default SKIPPED (they already
 *    live in the preserved notes — only a confident match should promote them to real entries).
 * Unchained answers pre-pick the class candidate; the player can still override per claim.
 */
export function assembleClaims(report: ProbeReport, hits: ProbeCandidates): ClaimReport {
  const claims: ImportClaim[] = [];
  const unchainedDefault = new Map(
    report.questions.filter((q) => q.kind === "unchained").map((q) => [normalizeKey(q.className ?? ""), q.defaultAnswer]),
  );

  // Pass 1 — class claims first: their chosen rows break same-name class-feature ties below.
  const linkedClassNames = new Set<string>();
  const classClaimById = new Map<string, ImportClaim>();
  for (const probe of report.probes.filter((p) => p.kind === "class")) {
    const candidates = hits[probe.id] ?? [];
    const wantUnchained = unchainedDefault.get(
      normalizeKey(
        probe.sourceText
          .replace(/^(uc|u\.|unchained)\s*/i, "")
          .replace(/\(.*\)/g, "")
          .replace(/\d+\s*$/, "")
          .trim(),
      ),
    );
    const chosen = pickClassCandidate(candidates, wantUnchained);
    const claim: ImportClaim = {
      id: probe.id,
      kind: "class",
      sourceKind: "class",
      sourceText: probe.sourceText,
      sourceLabel: probe.sourceLabel,
      matchKey: probe.keys[0] ?? "",
      candidates,
      confidence: chosen ? "high" : candidates.length > 0 ? "medium" : "low",
      resolution: chosen ? { mode: "linked", table: chosen.table, slug: chosen.slug, name: chosen.name } : { mode: "generic" },
      level: probe.level,
      track: probe.track,
      unchainedQuestionId: probe.unchainedQuestionId,
      draftEntryId: probe.draftEntryId,
    };
    if (chosen) {
      linkedClassNames.add(normalizeKey(chosen.name));
      linkedClassNames.add(normalizeKey(chosen.name.replace(/\s*\([^)]*\)\s*$/, "")));
    }
    claims.push(claim);
    classClaimById.set(probe.id, claim);
  }

  // Pass 2 — everything else.
  for (const probe of report.probes) {
    if (probe.kind === "class") continue;
    const candidates = hits[probe.id] ?? [];
    const tables = probeTables(probe);
    const exacts = candidates.filter((c) => c.match === "exact");

    let resolution: ClaimResolution = { mode: probe.mined ? "skipped" : "generic" };
    let kind: ClaimKind = probe.kind;
    let confidence: ImportClaim["confidence"] = "low";
    let ambiguous = false;

    let chosen: Candidate | undefined;
    if (exacts.length === 1) {
      chosen = exacts[0];
    } else if (exacts.length > 1) {
      // Tie-break 1: the first table (context first, then the slot's own kind) with an exact hit.
      const firstTable = tables.find((t) => exacts.some((c) => c.table === t));
      const inFirst = exacts.filter((c) => c.table === firstTable);
      const crossTable = exacts.some((c) => c.table !== firstTable);
      if (inFirst.length === 1) {
        // Mined text has no slot signal — exact hits in SEVERAL tables with no header context is
        // a genuine ambiguity (a notes line matching both a trait and a feat name).
        if (probe.mined && crossTable && !probe.context) ambiguous = true;
        else chosen = inFirst[0];
      } else {
        // Several same-name rows in one table (class_feature "Evasion" ×5 classes): prefer the
        // row whose owning class is one this import actually linked.
        const own = inFirst.find((c) => c.group && groupMatchesClass(c.group, linkedClassNames));
        if (own) chosen = own;
        else ambiguous = true;
      }
    }

    if (chosen) {
      kind = TABLE_KIND[chosen.table] ?? probe.kind;
      confidence = "high";
      resolution = { mode: "linked", table: chosen.table, slug: chosen.slug, name: chosen.name };
    } else if (ambiguous) {
      // Multiple plausible rows, nothing to break the tie — the player picks from the selector.
      confidence = "medium";
      kind = probe.context ?? probe.kind;
    } else if (candidates.length > 0) {
      confidence = "medium";
    }

    claims.push({
      id: probe.id,
      kind,
      sourceKind: probe.kind,
      sourceText: probe.sourceText,
      sourceLabel: probe.sourceLabel,
      matchKey: probe.keys[0] ?? "",
      candidates,
      confidence,
      resolution,
      ...(ambiguous ? { ambiguous: true } : {}),
      level: probe.level,
      parentClassClaimId: probe.parentClassProbeId,
      mined: probe.mined,
      draftEntryId: probe.draftEntryId,
    });
  }

  // Keep the original probe order (classes were assembled first but belong at their probe slots).
  const order = new Map(report.probes.map((p, i) => [p.id, i]));
  claims.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { claims, questions: report.questions };
}
