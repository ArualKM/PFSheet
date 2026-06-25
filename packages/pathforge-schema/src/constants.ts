import { z } from "zod";

/**
 * Platform-level enums shared between the database layer, RLS helpers, and the
 * app. These describe ownership/visibility/roles around a character — distinct
 * from the canonical sheet document itself.
 */

export const CHARACTER_VISIBILITY = ["private", "campaign", "unlisted", "public"] as const;
export const characterVisibilitySchema = z.enum(CHARACTER_VISIBILITY);
export type CharacterVisibility = z.infer<typeof characterVisibilitySchema>;

export const COLLABORATOR_ROLES = ["viewer", "commenter", "co_owner", "editor"] as const;
export const collaboratorRoleSchema = z.enum(COLLABORATOR_ROLES);
export type CollaboratorRole = z.infer<typeof collaboratorRoleSchema>;

export const CAMPAIGN_ROLES = ["owner", "gm", "assistant_gm", "player", "viewer"] as const;
export const campaignRoleSchema = z.enum(CAMPAIGN_ROLES);
export type CampaignRole = z.infer<typeof campaignRoleSchema>;

export const REVIEW_STATUSES = [
  "unreviewed",
  "in_review",
  "changes_requested",
  "approved",
  "approved_with_notes",
  "rejected",
  "stale_after_changes",
] as const;
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const SHARE_VISIBILITY_PRESETS = [
  "public_sheet",
  "party_sheet",
  "gm_review",
  "minimal_card",
  "custom",
] as const;
export const shareVisibilityPresetSchema = z.enum(SHARE_VISIBILITY_PRESETS);
export type ShareVisibilityPreset = z.infer<typeof shareVisibilityPresetSchema>;

/** §15 Viewer contexts for building filtered view models. */
export const VIEWER_CONTEXTS = [
  "owner",
  "editor",
  "gm",
  "campaign_player",
  "party_viewer",
  "public",
  "anonymous",
  "api",
  "discord_public",
] as const;
export const viewerContextSchema = z.enum(VIEWER_CONTEXTS);
export type ViewerContext = z.infer<typeof viewerContextSchema>;

export const API_SCOPES = [
  "characters:read",
  "characters:summary",
  "characters:portrait",
  "characters:public",
  "campaigns:read",
  "discord:embed",
] as const;
export const apiScopeSchema = z.enum(API_SCOPES);
export type ApiScope = z.infer<typeof apiScopeSchema>;
