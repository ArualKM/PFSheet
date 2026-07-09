import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // `pf-shimmer` sweeps an arcane sheen across the surface (nicer than a flat pulse); the motion
  // system freezes it when motion is off, leaving a plain placeholder.
  return (
    <div className={cn("pf-shimmer rounded-md bg-surface-raised", className)} {...props} />
  );
}

export { Skeleton };
