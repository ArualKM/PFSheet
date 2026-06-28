import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <PageSkeleton />
    </div>
  );
}
