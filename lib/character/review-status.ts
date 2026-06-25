/**
 * GM review status (§17) — the lifecycle of a character within a campaign, as
 * stored on `campaign_characters.gm_review_status`. Shared by the campaign
 * roster, the GM Audit View, and the player's change-request surface so the
 * label + badge styling stay consistent everywhere a status is shown.
 */
export const GM_REVIEW_STATUSES = [
  "unreviewed",
  "in_review",
  "changes_requested",
  "approved",
  "approved_with_notes",
  "rejected",
  "stale_after_changes",
] as const;

export type GmReviewStatus = (typeof GM_REVIEW_STATUSES)[number];

type StatusVariant = "default" | "warning" | "danger" | "success" | "rune";

export type ReviewStatusMeta = {
  label: string;
  /** Compact label for tight spaces (roster chips). */
  short: string;
  variant: StatusVariant;
  /** One-line explanation shown in tooltips / the audit header. */
  hint: string;
};

export const REVIEW_STATUS_META: Record<GmReviewStatus, ReviewStatusMeta> = {
  unreviewed: {
    label: "Unreviewed",
    short: "Unreviewed",
    variant: "default",
    hint: "The GM hasn't opened this sheet for review yet.",
  },
  in_review: {
    label: "In review",
    short: "In review",
    variant: "rune",
    hint: "The GM is currently reviewing this sheet.",
  },
  changes_requested: {
    label: "Changes requested",
    short: "Changes",
    variant: "danger",
    hint: "The GM asked for changes before this sheet can be approved.",
  },
  approved: {
    label: "Approved",
    short: "Approved",
    variant: "success",
    hint: "The GM approved this sheet as it stood at approval time.",
  },
  approved_with_notes: {
    label: "Approved with notes",
    short: "Approved *",
    variant: "success",
    hint: "Approved, with notes the player should read.",
  },
  rejected: {
    label: "Rejected",
    short: "Rejected",
    variant: "danger",
    hint: "The GM rejected this sheet for this campaign.",
  },
  stale_after_changes: {
    label: "Changed since approval",
    short: "Stale",
    variant: "warning",
    hint: "The player edited the sheet after it was approved — re-review needed.",
  },
};

export function reviewStatusMeta(status: string | null | undefined): ReviewStatusMeta {
  return REVIEW_STATUS_META[(status ?? "unreviewed") as GmReviewStatus] ?? REVIEW_STATUS_META.unreviewed;
}

/** Statuses that count as "needs the GM's attention" for queue ordering/badges. */
export function needsReview(status: string | null | undefined): boolean {
  const s = (status ?? "unreviewed") as GmReviewStatus;
  return s === "unreviewed" || s === "in_review" || s === "stale_after_changes";
}
