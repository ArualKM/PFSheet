import { Skeleton } from "@/components/ui/skeleton";

/** Generic route-loading placeholder shown via loading.tsx while a server page fetches. */
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
