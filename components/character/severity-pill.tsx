import { Badge, type BadgeProps } from "@/components/ui/badge";

// New shared primitive per docs/S6_UX_OVERHAUL/04_VIEWERS_DESIGN_LANGUAGE.md §5 item 4 — the
// `sev-chip`/`status-pill` treatment from `docs/S6_UX_OVERHAUL/mockups/viewer.html` (GM audit
// severity strip + review-status pills). Built ON `Badge` (its `success`/`warning`/`danger`/`rune`
// variants already give WCAG-safe foreground-colored text over a low-opacity tint, not
// colored-on-colored — the same discipline the SpheresCard subsystem blocks use) instead of a
// fourth from-scratch pill implementation. Pure presentational, tokens only.

export type SeverityTone = "success" | "warning" | "danger" | "info";

const TONE_VARIANT: Record<SeverityTone, NonNullable<BadgeProps["variant"]>> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  // The mockup's `.sev-chip.info` tone reads from `--pf-rune` (see viewer.html) — Badge's "rune"
  // variant is the same token, so "info" maps to it rather than adding a fifth Badge variant.
  info: "rune",
};

export function SeverityPill({
  tone,
  label,
  count,
  title,
}: {
  tone: SeverityTone;
  label: string;
  count?: number;
  /** Optional explanatory hover text — Badge call sites this replaces carried `title` hints
   *  (e.g. reviewStatusMeta.hint); dropping them silently was a review finding. */
  title?: string;
}) {
  return (
    <Badge variant={TONE_VARIANT[tone]} title={title}>
      {label}
      {count != null && <span className="tnum font-extrabold">{count}</span>}
    </Badge>
  );
}
