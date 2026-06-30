"use client";

import { type ReactNode } from "react";
import { Search, Loader2, X, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared chrome for the compendium builder pickers (feat / trait / class-options / class / archetype / prestige
 * / race). The "hybrid" model: these primitives standardize the BONES — outer card, header, search, result
 * list, row frame, detail-panel header, and the empty/loading/error states — while each picker supplies its own
 * bespoke row + detail content. Styling matches the feat picker (the reference).
 */

export function PickerShell({
  icon,
  title,
  onClose,
  children,
}: {
  icon: ReactNode;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-rune/40 bg-surface-raised p-3 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className="text-rune [&>*]:size-4">{icon}</span>
          {title}
        </h4>
        <Button variant="ghost" size="icon" aria-label={`Close ${title}`} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      {children}
    </div>
  );
}

export function PickerSearch({
  value,
  onChange,
  placeholder,
  label,
  loading,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  loading?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground transition-colors focus:border-rune/60 focus:outline-none"
      />
      {loading && (
        <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

export function PickerError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mt-2 rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-xs text-danger">{message}</p>;
}

/** The scrollable result-list container with a consistent empty/keep-typing state. */
export function PickerList({
  children,
  isEmpty,
  emptyText = "No matches found.",
  hint,
  className = "",
}: {
  children: ReactNode;
  isEmpty: boolean;
  emptyText?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <ul className={`mt-2 flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto pr-0.5 sm:max-h-96 ${className}`}>
      {isEmpty ? (
        <li className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
          {hint ?? emptyText}
        </li>
      ) : (
        children
      )}
    </ul>
  );
}

/** A result-row frame — consistent border/padding (+ hover when clickable). Frame only: the caller lays out
 * its own content inside (single-line flex, or multi-line like the feat prereq chips). */
export function PickerRow({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const base = "block w-full rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left transition-colors";
  if (onClick) {
    return (
      <li>
        <button type="button" onClick={onClick} aria-label={ariaLabel} className={`${base} hover:border-rune/50 hover:bg-surface-raised/40`}>
          {children}
        </button>
      </li>
    );
  }
  return <li className={base}>{children}</li>;
}

/** A small coloured chip for a class/archetype feature type (Su / Ex / Sp) — themed, WCAG-safe foreground text. */
export function FeatureTypeChip({ type }: { type?: string | null }) {
  if (!type) return null;
  const t = type.trim().toLowerCase();
  const tone =
    t === "su"
      ? "border-rune/50 bg-rune/10"
      : t === "sp"
        ? "border-gold/50 bg-gold/10"
        : t === "ex"
          ? "border-success/50 bg-success/10"
          : "border-border bg-surface-sunken";
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground ${tone}`}>
      {type}
    </span>
  );
}

/** The detail-panel wrapper: a back affordance + title, then the bespoke content. */
export function PickerDetail({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex items-center gap-0.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back
        </button>
        <span className="truncate text-sm font-semibold text-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
