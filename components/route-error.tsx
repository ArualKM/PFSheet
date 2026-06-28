"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shared route-level error boundary for the public/auth/share route groups (each group's error.tsx
 * re-exports this). Recovery links Home rather than /dashboard since these groups are reachable when
 * signed out. The authenticated app keeps its own error.tsx (links to /dashboard).
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <h1 className="text-lg font-semibold text-foreground">Something went sideways</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred while loading this page. You can try again, or head home.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p>
          )}
          <div className="mt-2 flex gap-2">
            <Button onClick={reset} variant="secondary">
              <RotateCcw className="size-4" /> Try again
            </Button>
            <Button asChild>
              <Link href="/">Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
