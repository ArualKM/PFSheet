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
  | "psionic_power"
  | "pow_maneuver"
  | "akashic_veil"
  | "oath"
  | "mythic_ability"
  | "racial_trait";

/** The compendium tables a probe may be matched against, in preference order per kind. */
export const KIND_TABLES: Record<ClaimKind, string[]> = {
  class: ["class_compendium"],
  archetype: ["archetype_compendium"],
  race: ["race_compendium"],
  feat: ["feat_compendium", "class_feature_compendium", "trait_compendium", "drawback_compendium"],
  trait: ["trait_compendium", "feat_compendium", "drawback_compendium"],
  feature: ["class_feature_compendium", "feat_compendium"],
  spell: ["spell_compendium", "feat_compendium", "class_feature_compendium"],
  // Paizo drawbacks (Umbral Unmasking, Sentimental) live in the PFcore drawback_compendium and
  // must keep winning same-name ties; the 3pp Drawbacks & Flaws table (Noncombatant, Feeble,
  // Nonathletic — flaw|major_drawback) is second so DRAWBACKS & FLAWS sections probe it too.
  drawback: ["drawback_compendium", "threepp_drawback_compendium", "trait_compendium"],
  sphere_talent: ["sphere_talents", "feat_compendium", "class_feature_compendium"],
  psionic_power: ["psionic_power_compendium", "spell_compendium", "feat_compendium"],
  pow_maneuver: ["pow_maneuver_compendium", "feat_compendium", "class_feature_compendium"],
  akashic_veil: ["akashic_veil_compendium", "feat_compendium", "class_feature_compendium"],
  // Oath slots grant real feats in the fixtures ("Oath 2) Extra Hex") — feat_compendium third.
  oath: ["oath_compendium", "oath_boon_compendium", "feat_compendium"],
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
  threepp_drawback_compendium: "drawback",
  sphere_talents: "sphere_talent",
  psionic_power_compendium: "psionic_power",
  pow_maneuver_compendium: "pow_maneuver",
  akashic_veil_compendium: "akashic_veil",
  oath_compendium: "oath",
  oath_boon_compendium: "oath",
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
  /** Header/section context the probe carried ("RACIAL TRAITS" divider above a feat slot) —
   * commit re-files context-classified as-written entries into the right bucket. */
  context?: ClaimKind;
  /** A comma/semicolon LINE ITEM of a multi-entry slot (the slot's draftEntryId). Additive like
   * mined; when EVERY item of a slot links, the slot itself is removed as covered. */
  partOf?: string;
  /** How many line items the slot SPLIT into (guard-filtered ones included) — the slot is only
   * "covered" when the LINKED items account for all of them. */
  partCount?: number;
};

export type ImportQuestion = {
  id: string;
  kind: "gestalt" | "mythic" | "unchained" | "psionics" | "path_of_war" | "akashic" | "oaths";
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
  /** A line item of a multi-entry slot (see ImportClaim.partOf / partCount). */
  partOf?: string;
  partCount?: number;
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

/** A divider / header row a power user typed into a slot ("#### Feats ####", "=== DRUID ==="). */
export const isDivider = (s: string): boolean => /#{3,}|={3,}/.test(s) || s.trim().length === 0;

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
    // Parenthetical asides don't drive the classification ("TRAITS (4 + 5th via 2nd drawback)").
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/:\s*$/, "")
    .trim()
    .toLowerCase();
  if (!t) return null;
  if (/\brac(?:e|ial)\b/.test(t)) return "racial_trait";
  if (/\bdrawbacks?\b|\bflaws?\b/.test(t)) return "drawback";
  if (/\bmythic\b/.test(t)) return "mythic_ability";
  // "PSIONIC FEATS" / "Psionic Bonus Feats" are FEAT sections (standard Ultimate Psionics
  // statblock vocabulary) — they must win BEFORE the psionic rule so a mined feat can't be
  // steered into the powers table (7 real feat/power name collisions in prod, e.g. Sidestep).
  if (/\bpsionics?\b.*\bfeats?\b/.test(t)) return "feat";
  // Above sphere ("MANIFESTING TALENTS") AND the generic powers?→feature rule ("PSIONIC POWERS"
  // must not fall through to feature the way "MONK KI POWERS" deliberately does).
  if (/\bpsionic|\bmanifest|\bpower points?\b|\bpsion\b|\bpsychic warriors?\b|\bwilders?\b/.test(t)) return "psionic_power";
  if (/\bspheres?\b|\btalents?\b|\bcasting\b/.test(t)) return "sphere_talent";
  // "MARTIAL FEATS" / "PATH OF WAR FEATS" are FEAT sections — they must win BEFORE the
  // maneuver rule (mirrors the psionic-feats carve-out above).
  if (/\b(?:martial|path of war)\b.*\bfeats?\b/.test(t)) return "feat";
  // "MARTIAL TRADITION" is Spheres of Might vocabulary first (every SoM practitioner has one —
  // the divider is literally in the Anise grounding fixture; PoW's same-named organizations
  // subsystem is niche): its tradition-granted talents steer into sphere_talents.
  if (/\bmartial traditions?\b/.test(t)) return "sphere_talent";
  // "COMBAT MANEUVERS" / "COMBAT MANEUVER BONUS" is the CMB/CMD stat-block caption on ordinary
  // 1pp sheets, never a PoW maneuvers section — deliberately unclassified.
  if (/\bcombat maneuvers?\b/.test(t)) return null;
  // Path of War sections ("MANEUVERS KNOWN", "STANCES", "MARTIAL DISCIPLINES", "INITIATOR
  // LEVEL"). Deliberately BELOW psionic ("PSIONIC MANEUVERS" stays psionic) and BELOW
  // sphere_talent — "MARTIAL TALENTS" is Spheres of Might vocabulary (a real Anise-fixture
  // divider) and must keep steering into sphere_talents. Only initiator/initiation/initiating
  // count — "INITIATIVE" must never classify as a maneuver section. Bare \bdisciplines?\b is
  // deliberately OUT: "Discipline: Telepathy" is standard Ultimate Psionics bookkeeping whose
  // label-value line must never flip a running psionic context (prod has real psionic/maneuver
  // name collisions — Expose Weakness, Blinding Shot); "martial disciplines" stays as a phrase.
  // Bare \bmartial\b is OUT too: "MARTIAL ARTS" / "MARTIAL FLEXIBILITY" / "SELF-DISCIPLINE" are
  // 1pp vocabulary.
  if (/\bmaneuvers?\b|\bstances?\b|\bmartial disciplines?\b|\bpath of war\b|\binitiat(?:ors?|ions?|ing)\b/.test(t)) return "pow_maneuver";
  // "AKASHIC FEATS" sections are FEAT sections — they must win BEFORE the veil rule (mirrors
  // the psionic-/martial-feats carve-outs above).
  if (/\bakashic\b.*\bfeats?\b/.test(t)) return "feat";
  // Akashic sections ("VEILS", "VEILS SHAPED", "CHAKRA BINDS", "ESSENCE RECEPTACLES",
  // "VEILWEAVING"). \bveils?\b never matches "VEILED", so the PoW discipline "Veiled Moon"
  // divider keeps steering into maneuvers via powDisciplineContext. Bare \bessence\b is
  // deliberately OUT ("elemental essence" is kineticist/psionic-crystal 1pp vocabulary) — only
  // "essence receptacle(s)" counts; bare \bchakra\b is OUT too (real-world yoga notes) — only
  // "chakra bind(s)".
  if (/\bveils?\b|\bveilweav\w*\b|\bchakra binds?\b|\bakashic\b|\bessence receptacles?\b/.test(t)) return "akashic_veil";
  // "OATH FEATS" / "OATH BONUS FEATS" sections are FEAT sections (the Bonus Feats oath boon
  // grants real feats) — they must win BEFORE the oath rule (mirrors the psionic-/martial-/
  // akashic-feats carve-outs above).
  if (/\boaths?\b.*\bfeats?\b/.test(t)) return "feat";
  // CORE (1pp) Paladin/Antipaladin oath vocabulary collides with the 3pp oath word — carve it out
  // BEFORE the oath rule (mirrors the "Combat Maneuvers → null" / "*FEATS → feat" guards above) so
  // only the 3pp bookkeeping shapes ("OATHS", "OATH BOONS", "OATH POINTS") reach the oath rule.
  // "Oath Spells" / "Antipaladin Oath Spells" is the paladin/antipaladin spell list; "Sacred Oath"
  // and "Oath of <x>" ("Oath of Vengeance", "Oath of Vengeance Class Features") are paladin
  // class-feature headers — steering a "Spell Resistance"/"Damage Reduction" line beneath them into
  // oath_boon_compendium (both are real oath-boon names) would mis-file a real spell/class feature.
  if (/\boath spells?\b/.test(t)) return "spell";
  if (/\bsacred oaths?\b|\boath of\b/.test(t)) return "feature";
  // Oath sections ("OATHS", "OATH BOONS", "OATH POINTS") — 3pp oaths. \boaths?\b never matches
  // mid-word ("OATHBOW" the magic weapon, the "Oathbound Paladin" archetype), and a NUMBERED
  // label must stay silent: "Oath 2" is the fixtures' slot bookkeeping for feats granted VIA an
  // oath ("Oath 2) Extra Hex", "Oath 10: Implausible Deniability") — flipping a running context
  // to oath there would steer real feats into the oath tables.
  if (/\boaths?\b(?!\s*\d)/.test(t)) return "oath";
  if (/\bclass features?\b|\bki powers?\b|\bclass abilit/.test(t)) return "feature";
  if (/\bfeats?\b/.test(t)) return "feat";
  if (/\btraits?\b/.test(t)) return "trait";
  if (/\bspells?\b/.test(t)) return "spell";
  if (/\bfeatures?\b|\babilit(?:y|ies)\b|\bpowers?\b/.test(t)) return "feature";
  return null;
}

/** The 23 Path of War discipline names (mirrors prod `pow_discipline_compendium`). A header or
 * divider naming one ("##### BROKEN BLADE #####") is a maneuvers grouping header in the natural
 * PoW notes layout — keyword-less, so classifyHeader alone would CLEAR a running pow context and
 * the maneuvers bulleted beneath would never probe the maneuvers table. */
const POW_DISCIPLINES = [
  "black seraph",
  "broken blade",
  "cursed razor",
  "elemental flux",
  "eternal guardian",
  "fool's errand",
  "golden lion",
  "iron tortoise",
  "mithral current",
  "piercing thunder",
  "primal fury",
  "radiant dawn",
  "riven hourglass",
  "scarlet throne",
  "shattered mirror",
  "silver crane",
  "sleeping goddess",
  "solar wind",
  "steel serpent",
  "tempest gale",
  "thrashing dragon",
  "unquiet grave",
  "veiled moon",
] as const;
const POW_DISCIPLINE_RE = new RegExp(
  `\\b(?:${POW_DISCIPLINES.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

/** `pow_maneuver` when a header/divider names a PoW discipline ("##### BROKEN BLADE #####",
 * "VEILED MOON:"), else null. Checked AFTER classifyHeader in every header-context path, so the
 * real keyword rules ("MARTIAL DISCIPLINES", "MYTHIC …", class-feature captions) keep winning. */
export function powDisciplineContext(raw: string): "pow_maneuver" | null {
  return POW_DISCIPLINE_RE.test(raw) ? "pow_maneuver" : null;
}

/** Strip leading slot bookkeeping ("Rogue 9. ", "Oath 10: ", "LVL 1) ", "Flaw) ", "1[Monk]. ",
 * "9th: ", bullets) so the entry text remains. */
export function stripSlotPrefix(raw: string): string {
  let s = raw.trim().replace(/^[•>*\-–]\s*/, "");
  s = s.replace(/^\d+\s*\[[^\]]*\]\s*[.:]\s*/, ""); // "1[Monk]. "
  s = s.replace(/^[A-Za-z' ]{0,16}\d+\s*[.:)]\s*/, ""); // "Rogue 9. " / "Oath 10: " / "LVL 1) " / "0: "
  s = s.replace(/^[A-Za-z']{2,10}\)\s*/, ""); // "Flaw) " / "MD) " / "BG) "
  s = s.replace(/^\d+(st|nd|rd|th)\s*[.:)]?\s*/i, ""); // "9th: "
  return s.trim();
}

type SepHit = { pre: string; post: string; arrow: boolean };

/** Find the first TOP-LEVEL name/description separator: " -> ", "→", " - ", " — ", or ": ".
 * "Toughness - +3 HP" → name "Toughness"; "Aquatic: breathe water; …" → name "Aquatic";
 * "Nature Bond -> HERBALISM: …" → name "Nature Bond" (arrow: the post half may ALSO name an
 * ability, e.g. "Spirit (Lore) -> Monstrous Insight (Su): …"). */
function findTopLevelSep(s: string): SepHit | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth > 0) continue;
    if (ch === "→" || (ch === "-" && s[i + 1] === ">") || (ch === "=" && s[i + 1] === ">")) {
      const len = ch === "→" ? 1 : 2;
      return { pre: s.slice(0, i).trim(), post: s.slice(i + len).trim(), arrow: true };
    }
    if (ch === ":" && s[i + 1] === " ") {
      return { pre: s.slice(0, i).trim(), post: s.slice(i + 2).trim(), arrow: false };
    }
    if ((ch === "-" || ch === "–" || ch === "—") && s[i - 1] === " " && s[i + 1] === " ") {
      return { pre: s.slice(0, i - 1).trim(), post: s.slice(i + 2).trim(), arrow: false };
    }
  }
  return null;
}

/** Split a slot line into its NAME half and description ("LVL 1) Toughness - +3 HP" →
 * { name: "Toughness", detail: "+3 HP" }). Used by entryKeys and the commit-time re-file of
 * context-classified as-written entries (racial traits / class features keep their rules text). */
export function splitEntryText(raw: string): { name: string; detail?: string } {
  const s = stripSlotPrefix(raw);
  const sep = findTopLevelSep(s);
  if (sep && sep.pre.length >= 3 && sep.pre.length <= 60 && sep.post) {
    return { name: sep.pre, detail: sep.post };
  }
  return { name: s };
}

/**
 * Match keys for a slot line, most-specific first. Handles the fixtures' real patterns:
 * prefix bookkeeping ("Rogue 9.", "LVL 1)", "Flaw)"), trailing "(...)"/"[...]" qualifiers, and
 * name/description separators — "Toughness - +3 HP" must match the feat Toughness, "Hex ->
 * Benefit of Wisdom: …" the class feature Hex. The LAST key is the most-stripped NAME half
 * (the best ranked-search query). Keys keep the SOURCE's casing (the server's fast exact-match
 * pass is case-sensitive; real entries are usually typed with the book's capitalization).
 */
export function entryKeys(raw: string): string[] {
  const s = stripSlotPrefix(raw);
  if (!s) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  const push = (k: string) => {
    const t = k.trim();
    const n = normalizeKey(t);
    if (n.length >= 3 && t.length <= 80 && !seen.has(n)) {
      seen.add(n);
      keys.push(t);
    }
  };
  // Progressive qualifier stripping: "Improved Critical (Close)" → "Improved Critical";
  // "Mass Teleport [mass]" → "Mass Teleport".
  const pushWithStrips = (base: string) => {
    push(base);
    let stripped = base;
    for (let i = 0; i < 3; i++) {
      const next = stripped.replace(/\s*(\([^()]*\)|\[[^\][]*\])\s*$/, "").trim();
      if (next === stripped) break;
      stripped = next;
      push(stripped);
    }
  };
  pushWithStrips(s);
  const sep = findTopLevelSep(s);
  if (sep && sep.pre.length >= 3 && sep.pre.length <= 60) {
    if (sep.arrow && sep.post) {
      // "Spirit (Lore) -> Monstrous Insight (Su): …" — the post half names an ability too.
      const postSep = findTopLevelSep(sep.post);
      const postName = postSep ? postSep.pre : sep.post;
      if (postName.length >= 3 && postName.length <= 60) pushWithStrips(postName);
    }
    pushWithStrips(sep.pre);
  }
  // The books invert qualified spell names ("Lesser Restoration" is printed "Restoration,
  // Lesser") — offer the comma-inverted form for every key collected so far.
  for (const k of [...keys]) {
    const m = k.match(/^(Lesser|Greater|Mass|Communal|Improved) (.{3,50})$/i);
    if (m) push(`${m[2]}, ${m[1]}`);
  }
  return keys;
}

/* --------------------------------------------------------------------------- */
/* Class-line parsing                                                           */
/* --------------------------------------------------------------------------- */

const UNCHAINED_CLASSES = ["barbarian", "monk", "rogue", "summoner"];

/** Dreamscarred Press manifester/psionic base classes — a class-line hit is a psionics marker
 * (docs/3PP_MASTER_PLAN.md Phase 3: the detector goes live now that the system is LIVE).
 * Matched against parsed segment BASE names so an archetype like "(Dread Vanguard)" can't trip it. */
const PSIONIC_CLASS_RE =
  /\b(?:psion|psychic warrior|wilder|soulknife|vitalist|aegis|tactician|marksman|cryptic|dread)s?\b/i;
/** Psionic bookkeeping in the preserved notes dump ("Power Points: 37", "Manifester Level 7",
 * "21 PP/day", a literal "PSIONIC POWERS" section). The PP marker requires an adjacent "/day" or
 * "per day" so platinum-piece ledgers can't trip it — neither via bare amounts ("32 pp, 14 gp")
 * nor via same-line day-words ("12 pp each today", "pp spent on payday"). */
const PSIONIC_NOTES_RE = /power points?|manifester level|\bpsionics?\b|\bpp\b\s*(?:\/|per\s+)day\b/i;

/** Dreamscarred Press initiator base classes (Path of War) — a class-line hit is a PoW marker
 * (docs/3PP_MASTER_PLAN.md Phase 4 track C: the detector goes live now that the schema is).
 * Matched by FULL baseName equality per parsed segment — the same base-name scoping that keeps
 * PSIONIC_CLASS_RE off archetypes, tightened one step further: a substring test over the joined
 * line fires on "Mystic Theurge" (a classic 1pp Wizard/Cleric prestige class) and
 * "Stalker Vigilante", enabling the module on pure-1pp sheets. Standalone "Mystic" stays a
 * marker — acceptable: the question is declinable and only ENABLES the module. */
const POW_CLASS_NAMES = new Set(["stalker", "warder", "warlord", "zealot", "harbinger", "medic", "mystic"]);
/** Path of War bookkeeping in the preserved notes dump ("Maneuvers Known: 12", "Stances Known 4",
 * "Initiator Level 7", a literal "Path of War" / "Martial Disciplines" mention). Deliberately
 * TIGHT: bare "maneuvers"/"stance"/"martial" must not fire — the grounding fixtures carry the
 * feat "Deft Maneuvers", a Spheres "MARTIAL TRADITION"/"MARTIAL TALENTS" section, and "+2
 * initiative" traits, and ALL must stay silent (locked by regression tests). */
const POW_NOTES_RE =
  /\bmaneuvers?\s+(?:known|readied)\b|\bstances?\s+known\b|\binitiator level\b|\bpath of war\b|\bmartial disciplines?\b/i;

/** Dreamscarred Press veilweaver base classes — the 15 `akashic_veil_class_list` junction lists.
 * Matched by FULL baseName equality per parsed segment, exactly like POW_CLASS_NAMES: "Radiant"
 * fires only as the whole class name (the CLASS LINE parser never sees the PoW discipline
 * "Radiant Dawn" as a base name), and "Guru Kandari" / "Storm Bound" don't fire because the full
 * segment doesn't equal a listed name. */
const AKASHIC_CLASS_NAMES = new Set([
  "vizier",
  "daevic",
  "nexus",
  "stormbound",
  "guru",
  "promethean",
  "helmsman",
  "huay",
  "eclipse",
  "volur",
  "kheshig",
  "radiant",
  "soulforge",
  "lunar",
  "rajah",
]);
/** Akashic bookkeeping in the preserved notes dump ("Veils Shaped: 3", "Chakra Binds: Hands",
 * "Essence Receptacles", a literal "Akashic" / "Veilweaving" mention, or a bare "VEILS" section
 * header on its own line). Deliberately TIGHT like POW_NOTES_RE: bare "essence"/"chakra" and
 * mid-prose "veils" ("wears seven veils") must not fire — only the header/bookkeeping shapes. */
const AKASHIC_NOTES_RE =
  /\bveils?\s+(?:known|shaped)\b|\bveilweav\w*\b|\bchakra binds?\b|\bessence receptacles?\b|\bakashic\b|^[#=*\s]*veils?\s*:?\s*[#=*\s]*$/im;

/** Oath bookkeeping in the preserved notes dump ("(4 Oath Points)", "Oath Boons", "Oath Points:
 * 9", or a bare "OATHS" section header on its own line). Deliberately TIGHT like
 * AKASHIC_NOTES_RE: mid-prose "oath" ("swore an oath of vengeance") and the OATHBOW magic weapon
 * must not fire — only the points/boons bookkeeping and the header shape do. There is no class
 * marker: oaths are class-agnostic pacts, so the notes shapes are the whole signal. */
const OATH_NOTES_RE = /\boath points?\b|\boath boons?\b|^[#=*\s]*oaths?\s*:?\s*[#=*\s]*$/im;

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
    // A divider naming a PoW DISCIPLINE ("##### BROKEN BLADE #####" — the natural per-discipline
    // grouping under "MANEUVERS KNOWN:") keeps steering into the maneuvers table instead of
    // clearing the running pow context.
    if (/^#/.test(line) || isDivider(line)) {
      context = classifyHeader(line) ?? powDisciplineContext(line) ?? undefined;
      continue;
    }
    // Section captions inside the text ("RACE TRAITS:", "CHARACTER TRAITS:") aren't entries —
    // but they ARE context ("VEILED MOON:" is a discipline grouping caption).
    if (/^[A-Z .]+:$/.test(line)) {
      context = classifyHeader(line) ?? powDisciplineContext(line) ?? context;
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
    // OATHS sections list entries WITHOUT bullets, the "(N Oath Points)" cost closing the NAME
    // half ("Forbidden Knowledge [Death Wish {Greater}] (4 Oath Points)   - bound to seek …").
    // Under an oath context that cost marker IS the entry signal — keep the name half
    // (qualifiers kept; entryKeys strips them progressively); the cost + description stay
    // behind in the preserved notes. Without it the dash-description lines judge as prose.
    if (context === "oath") {
      const m = text.match(/^(.{3,60}?)\s*[([](?:\d+|see\s+text)\s*oath\s*points?[)\]]/i);
      if (m?.[1]) text = m[1].trim();
    }
    // A bulleted "Name: description" / "Name - description" entry ("• Reactionary: +2
    // initiative", "• Umbral Unmasking - she casts a monstrous shadow") — the name half is the
    // entry; the description stays behind in the preserved notes.
    if (bullet) {
      const sep = splitEntryText(text);
      if (sep.detail && sep.name.length >= 3 && sep.name.length <= 48) text = sep.name;
    }
    // Judge prose-ness on the entry NAME (bracket/paren qualifiers stripped): "Child of Time
    // [Planar Infusion (Conduit) [Time], …]" is an entry however long its qualifiers run.
    let bare = text;
    for (let i = 0; i < 3; i++) bare = bare.replace(/\s*(\([^()]*\)|\[[^\][]*\])/g, " ");
    bare = bare.replace(/\s+/g, " ").trim();
    const words = bare.split(/\s+/).length;
    // A short non-bulleted category header ("Mythic Drawbacks", "MONK KI POWERS") updates the
    // context instead of becoming an entry: ALL-CAPS, or Title Case ending in a plural grouping
    // word. An ALL-CAPS PoW discipline name ("BROKEN BLADE") is the same grouping-caption layout
    // without hashes — context, never a mined entry.
    if (!bullet && words <= 4) {
      const allCaps = /[A-Z]/.test(bare) && !/[a-z]/.test(bare);
      const pluralGroup = /\b(drawbacks|flaws|qualities|boons|feats|traits|talents|powers|spells|features|abilities)$/i.test(bare);
      const kind = classifyHeader(bare) ?? (allCaps ? powDisciplineContext(bare) : null);
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
  const allSegments: ParsedClassSegment[] = [];
  const totalLevel = character.identity.totalLevel ?? 0;
  for (const cls of character.identity.classes) {
    if (cls.compendiumId) continue; // already structured (e.g. a PathForge re-import)
    const parsed = parseClassLine(cls.name);
    classLine = classLine ?? parsed;
    allSegments.push(...parsed.segments);
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

  // ── Psionics detection (the deferred detector, live now the system is) ─────
  // Markers: an adapter-flagged psionics module entry, a manifester class on the class line, or
  // power-point bookkeeping in the notes dump. The question only ENABLES the module — header
  // context steering into psionic_power_compendium works regardless of the answer. Already
  // enabled → nothing to ask (refileLinked files powers into character.psionics as-is).
  if (!character.rules.modules.some((m) => m.key === "psionics" && m.enabled)) {
    const flagged = character.rules.modules.some((m) => m.key === "psionics");
    const classHit = PSIONIC_CLASS_RE.test(allSegments.map((s) => s.baseName).join(" | "));
    const notesHit = PSIONIC_NOTES_RE.test(character.notes.player ?? "");
    if (flagged || classHit || notesHit) {
      questions.push({
        id: pid("q-psionics"),
        kind: "psionics",
        text: "Psionic content was detected — enable the Psionics module and link powers?",
        defaultAnswer: true,
      });
    }
  }

  // ── Path of War detection (the psionics detector's exact mirror) ───────────
  // Markers: an adapter-flagged path_of_war module entry, an initiator class on the class line,
  // or maneuver bookkeeping in the notes dump. The question only ENABLES the module — header
  // context steering into pow_maneuver_compendium works regardless of the answer. Already
  // enabled → nothing to ask (refileLinked files maneuvers into character.pathOfWar as-is).
  if (!character.rules.modules.some((m) => m.key === "path_of_war" && m.enabled)) {
    const flagged = character.rules.modules.some((m) => m.key === "path_of_war");
    const classHit = allSegments.some((s) => POW_CLASS_NAMES.has(s.baseName.trim().toLowerCase()));
    const notesHit = POW_NOTES_RE.test(character.notes.player ?? "");
    if (flagged || classHit || notesHit) {
      questions.push({
        id: pid("q-pow"),
        kind: "path_of_war",
        text: "Path of War content was detected — enable the module and link maneuvers?",
        defaultAnswer: true,
      });
    }
  }

  // ── Akashic detection (the Path of War detector's exact mirror) ────────────
  // Markers: an adapter-flagged akashic module entry, a veilweaver class on the class line, or
  // veil bookkeeping in the notes dump. The question only ENABLES the module — header context
  // steering into akashic_veil_compendium works regardless of the answer. Already enabled →
  // nothing to ask (refileLinked files veils into character.akashic as-is).
  if (!character.rules.modules.some((m) => m.key === "akashic" && m.enabled)) {
    const flagged = character.rules.modules.some((m) => m.key === "akashic");
    const classHit = allSegments.some((s) => AKASHIC_CLASS_NAMES.has(s.baseName.trim().toLowerCase()));
    const notesHit = AKASHIC_NOTES_RE.test(character.notes.player ?? "");
    if (flagged || classHit || notesHit) {
      questions.push({
        id: pid("q-akashic"),
        kind: "akashic",
        text: "Akashic content was detected — enable the module and link veils?",
        defaultAnswer: true,
      });
    }
  }

  // ── Oaths detection (the akashic detector's mirror, minus the class marker) ─
  // Oaths are class-agnostic pacts, so there's no class-line signal: the markers are an
  // adapter-flagged oaths module entry or oath bookkeeping in the notes dump ("(4 Oath
  // Points)", an "OATHS" section header). The question only ENABLES the module — header context
  // steering into oath_compendium works regardless of the answer. Already enabled → nothing to
  // ask (refileLinked files oaths into character.oaths as-is).
  if (!character.rules.modules.some((m) => m.key === "oaths" && m.enabled)) {
    const flagged = character.rules.modules.some((m) => m.key === "oaths");
    const notesHit = OATH_NOTES_RE.test(character.notes.player ?? "");
    if (flagged || notesHit) {
      questions.push({
        id: pid("q-oaths"),
        kind: "oaths",
        text: "Oaths were detected — enable the Oaths module and link them?",
        defaultAnswer: true,
      });
    }
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

  // A section divider naming one of the sheet's own classes ("#### DRUID (Reincarnated) ####")
  // labels that class's FEATURES section.
  const classNames = new Set(
    (classLine?.segments ?? []).map((s) => normalizeKey(s.baseName)).filter((n) => n.length >= 3),
  );
  const headerContext = (raw: string): ClaimKind | undefined => {
    const known = classifyHeader(raw);
    if (known) return known;
    // A divider naming a PoW discipline ("#### BROKEN BLADE ####") labels a maneuvers group.
    const disc = powDisciplineContext(raw);
    if (disc) return disc;
    const words = normalizeKey(raw.replace(/[#=*_\-—–]+/g, " "));
    for (const cls of classNames) {
      if (words.includes(cls)) return "feature";
    }
    return undefined;
  };

  // Multi-entry slots ("0: Create Water, Detect Magic, Guidance", "Nature Sense (+2 …); Wild
  // Empathy (1d20+1); Druidic") get a sub-probe per LINE ITEM — additive like mined entries, so
  // junk items can't self-promote, and a fully-linked slot is removed as covered at commit.
  const emitParts = (
    slotRaw: string,
    slotId: string,
    kind: ClaimKind,
    sourceLabel: string,
    ctx: ClaimKind | undefined,
    slotLevel?: number,
  ) => {
    const base = stripSlotPrefix(slotRaw);
    const sep = findTopLevelSep(base);
    // An arrow line ("Nature Bond -> HERBALISM: …") is ONE entry with a description, not a list.
    if (sep?.arrow) return;
    const listSrc = sep && sep.pre.length <= 60 ? sep.post : base;
    const parts = splitTopLevel(listSrc, /[;,]/);
    if (parts.length < 2) return;
    for (const part of parts.slice(0, 12)) {
      const t = part.trim();
      // Name-ish items only (Title-case start, short, no arrows/equations/measurements) —
      // "breathe water; no Swim checks", "Toad (familiar) -> grants you +3 HP", and
      // "Darkvision 60 ft" aren't list entries.
      if (!t || t.length > 48 || !/^[A-Z\d]/.test(t.replace(/^[•>*\-–\s]+/, ""))) continue;
      if (/->|→|=>|\s=\s|\d+\s*(?:ft|feet|lbs?|gp|sp|cp)\b/i.test(t)) continue;
      const keys = entryKeys(t);
      if (!keys.length) continue;
      // Spell items may carry their own level ("Identify (1st)"), else the slot's ("1st: A, B").
      const ownLevel = kind === "spell" ? t.match(/\((\d)(?:st|nd|rd|th)?\)/)?.[1] : undefined;
      const level = ownLevel !== undefined ? parseInt(ownLevel, 10) : slotLevel;
      probes.push({
        id: pid("part"),
        kind,
        sourceText: t,
        sourceLabel,
        keys,
        ...(ctx && ctx !== kind ? { context: ctx } : {}),
        ...(level !== undefined ? { level } : {}),
        mined: true,
        partOf: slotId,
        partCount: parts.length,
      });
    }
  };

  // ── Feat slots (dividers become CONTEXT for the entries below them) ────────
  let featCtx: ClaimKind | undefined;
  for (const f of character.feats.list) {
    if (f.compendiumId) continue;
    if (isDivider(f.name)) {
      featCtx = headerContext(f.name);
      continue;
    }
    const keys = entryKeys(f.name);
    if (keys.length) {
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
    // Even a slot too long/odd to probe whole may be a LIST of real entries.
    emitParts(f.name, f.id, "feat", "Feat slot · line item", featCtx);
  }

  // ── Spell slots (whatever the compendium hunt didn't already link) ─────────
  // Only compendiumId marks "already linked" — adapters (Foundry) legitimately set `school`
  // on unlinked spells, and those still deserve verification.
  let spellCtx: ClaimKind | undefined;
  for (const s of character.spellcasting.knownSpells) {
    if (isDivider(s.name)) {
      // classifyHeader first; a PoW-discipline divider labels a maneuvers group. Deliberately NOT
      // headerContext: a class-name divider under SPELLS (the Vehti "DRUID (Reincarnated)"
      // grouping) must keep spell probes, not flip them to feature.
      spellCtx = classifyHeader(s.name) ?? powDisciplineContext(s.name) ?? undefined;
      continue;
    }
    if ((s as { compendiumId?: string }).compendiumId) continue;
    const keys = entryKeys(s.name);
    if (keys.length) {
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
    const slotLevel = s.name.trim().match(/^(\d)(?:st|nd|rd|th)?\s*[.:)]/)?.[1];
    emitParts(
      s.name,
      s.id,
      "spell",
      "Spells field · line item",
      spellCtx,
      slotLevel !== undefined ? parseInt(slotLevel, 10) : (s as { level?: number }).level,
    );
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

/** Crude singular fold so "Beings of Ib" (the compendium row) matches "Being of Ib" (the sheet). */
const singularWords = (s: string): string =>
  normalizeKey(s)
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");

/** Does an alternate-racial-trait row's race match the sheet's race text? */
function groupMatchesRace(group: string, raceText: string): boolean {
  if (!raceText) return false;
  const g = singularWords(group);
  const r = singularWords(raceText.replace(/\s*\([^)]*\)\s*/g, " "));
  return g === r || g.includes(r) || r.includes(g);
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
  const raceText = report.probes.find((p) => p.kind === "race")?.sourceText ?? "";
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

    // GROUP-OWNED tables can't auto-link across owners: a single exact "Low-Light Vision" row
    // belongs to the DWARVES alternate racial traits — a Being of Ib must not inherit it by
    // default. Mismatched-group picks demote to a suggestion the player confirms.
    if (chosen?.group) {
      if (chosen.table === "alternate_racial_trait_compendium" && !groupMatchesRace(chosen.group, raceText)) {
        chosen = undefined;
      } else if (
        (chosen.table === "class_feature_compendium" || chosen.table === "archetype_compendium") &&
        linkedClassNames.size > 0 &&
        !groupMatchesClass(chosen.group, linkedClassNames)
      ) {
        chosen = undefined;
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
      ...(probe.context ? { context: probe.context } : {}),
      ...(probe.partOf ? { partOf: probe.partOf } : {}),
      ...(probe.partCount !== undefined ? { partCount: probe.partCount } : {}),
    });
  }

  // Keep the original probe order (classes were assembled first but belong at their probe slots).
  const order = new Map(report.probes.map((p, i) => [p.id, i]));
  claims.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { claims, questions: report.questions };
}
