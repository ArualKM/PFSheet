import { Skeleton } from "@/components/ui/skeleton";

/**
 * Group-level loading boundary for the authenticated shell. Covers every (app) route that lacks its
 * own loading.tsx (the ~20 compendium pages, character view/edit, settings, campaign detail, …). Its
 * real job is perceived speed: it paints INSTANTLY on a <Link> click while the dynamic server render
 * runs, turning what used to be a frozen old page into an immediate response — and it re-enables
 * Next's prefetch for these dynamic routes (prefetch caches up to the nearest loading boundary).
 * Shaped like the common case (a page header + a search bar + a list) so it reads as the page filling
 * in rather than a generic spinner.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl" aria-hidden="true">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="mb-6 h-10 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
