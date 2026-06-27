/**
 * @pathforge/schema — the canonical PathForge PF1e character schema.
 *
 * Single source of truth for the character document shape (Zod + TypeScript),
 * platform-level enums, default formulas, the default-character factory, and
 * validation/migration helpers. Designed to be reused by the web app and future
 * native apps without pulling in any UI or server code.
 */
export * from "./common";
export * from "./constants";
export * from "./identity";
export * from "./abilities";
export * from "./vitals";
export * from "./combat";
export * from "./skills";
export * from "./feats";
export * from "./spellcasting";
export * from "./inventory";
export * from "./buffs";
export * from "./buff-templates";
export * from "./formulas";
export * from "./rules";
export * from "./optional-rules";
export * from "./class-catalog";
export * from "./spell-tables";
export * from "./metamagic-catalog";
export * from "./hero-points";
export * from "./meta";
export * from "./default-formulas";
export * from "./character";
export * from "./factory";
export * from "./validate";
