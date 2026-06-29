import Link from "next/link";
import { cn } from "@/lib/utils";

function ForgeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("size-7", className)}
      role="img"
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M256 96 L392 168 V312 L256 416 L120 312 V168 Z"
        stroke="var(--pf-gold)"
        strokeWidth="26"
        strokeLinejoin="round"
      />
      <path d="M256 168 V416" stroke="var(--pf-rune)" strokeWidth="24" strokeLinecap="round" />
      <path d="M256 168 L344 216" stroke="var(--pf-gold)" strokeWidth="24" strokeLinecap="round" />
      <path d="M256 256 L168 304" stroke="var(--pf-gold)" strokeWidth="24" strokeLinecap="round" />
      <circle cx="256" cy="168" r="30" fill="var(--pf-gold)" />
    </svg>
  );
}

export function Logo({
  href = "/",
  showWordmark = true,
  className,
  wordmarkClassName,
}: {
  href?: string;
  showWordmark?: boolean;
  className?: string;
  /** Extra classes on the wordmark — e.g. a container query so it hides when the sidebar collapses. */
  wordmarkClassName?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="PathForge"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ForgeMark />
      {showWordmark && (
        <span
          className={cn(
            "font-display text-lg font-semibold tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          PathForge
        </span>
      )}
    </Link>
  );
}

export { ForgeMark };
