/**
 * Single source of truth for the public API surface — consumed by the developer
 * docs page, the /api/v1 discovery index, and the OpenAPI spec, so they can never
 * drift from each other.
 */
export const API_VERSION = "v1";
export const API_BASE = "/api/v1";

export type ApiQueryParam = { name: string; required: boolean; description: string };

export type ApiEndpoint = {
  method: "GET";
  path: string;
  group: "Public" | "Authenticated" | "Discord";
  /** "none" = public, "key" = requires a scoped key, "mixed" = public OR keyed. */
  auth: "none" | "key" | "mixed";
  scope?: string;
  summary: string;
  query?: ApiQueryParam[];
  returns: string;
};

export const API_SCOPE_INFO: { scope: string; description: string }[] = [
  { scope: "characters:read", description: "Full read of your characters — every section you can see (implies the narrower character scopes)." },
  { scope: "characters:summary", description: "Computed summary: level, HP, AC, CMD, saves, initiative, speed." },
  { scope: "characters:portrait", description: "Character name and portrait URL only." },
  { scope: "discord:embed", description: "Discord character cards for your own characters." },
  { scope: "campaigns:read", description: "Read your campaigns. Reserved — no endpoints use it yet." },
];

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    method: "GET",
    path: "/health",
    group: "Public",
    auth: "none",
    summary: "Liveness check — confirms the API is up.",
    returns: "{ status, service, time }.",
  },
  {
    method: "GET",
    path: "/public/characters/{publicSlug}/summary",
    group: "Public",
    auth: "none",
    summary: "Public character summary (public-safe values only).",
    returns:
      "Summary: name, classLine, level, race, alignment, hp, ac, cmd, saves, initiative, speed, spellcasting (roll-up: casterCount/highestLevel/slotsRemaining).",
  },
  {
    method: "GET",
    path: "/public/characters/{publicSlug}/stats",
    group: "Public",
    auth: "none",
    summary: "Public stats — summary plus abilities, and skills/attacks/spellcasting if the share settings allow.",
    returns: "Summary + abilities[] + skills[]|null + attacks[]|null + spellcasting|null (casters/slots/prepared/known/spellbook/counts).",
  },
  {
    method: "GET",
    path: "/public/characters/{publicSlug}/portrait",
    group: "Public",
    auth: "none",
    summary: "Public portrait reference.",
    returns: "{ name, portraitUrl }.",
  },
  {
    method: "GET",
    path: "/public/characters/{publicSlug}/opengraph",
    group: "Public",
    auth: "none",
    summary: "OpenGraph metadata for link embeds.",
    returns: "{ title, description, image }.",
  },
  {
    method: "GET",
    path: "/characters/{characterId}/summary",
    group: "Authenticated",
    auth: "key",
    scope: "characters:summary",
    summary: "Summary for one of your own characters (full values).",
    returns: "Summary (same shape as the public summary).",
  },
  {
    method: "GET",
    path: "/characters/{characterId}/stats",
    group: "Authenticated",
    auth: "key",
    scope: "characters:read",
    summary: "Full stats for your character — abilities, skills, attacks, spellcasting.",
    returns: "Summary + abilities[] + skills[] + attacks[] + spellcasting (casters/slots/prepared/known/spellbook/counts).",
  },
  {
    method: "GET",
    path: "/characters/{characterId}/portrait",
    group: "Authenticated",
    auth: "key",
    scope: "characters:portrait",
    summary: "Portrait reference for your character.",
    returns: "{ name, portraitUrl }.",
  },
  {
    method: "GET",
    path: "/characters/{characterId}/share",
    group: "Authenticated",
    auth: "key",
    scope: "characters:read",
    summary: "Share metadata for your character.",
    returns: "{ visibility, publicSlug, shareUrl }.",
  },
  {
    method: "GET",
    path: "/discord/character-card",
    group: "Discord",
    auth: "mixed",
    scope: "discord:embed",
    summary:
      "Discord character card. Use ?slug= for a public character (no auth), or ?characterId= with a key that has discord:embed.",
    query: [
      { name: "slug", required: false, description: "Public slug — returns the public-safe card, no auth." },
      { name: "characterId", required: false, description: "Your character's id — requires a key with discord:embed." },
    ],
    returns: "Card: name, subtitle, portraitUrl, level, hp, ac, saves, initiative, speed, topSkills[], activeBuffs[], preparedHighlights[], shareUrl.",
  },
];

/** Per-bucket fixed-window rate limits (requests / 60s). */
export const API_RATE_LIMITS = [
  { bucket: "Public endpoints", limit: "120 requests / minute", scopedBy: "client IP" },
  { bucket: "Authenticated endpoints", limit: "240 requests / minute", scopedBy: "API key (or signed-in user)" },
];
