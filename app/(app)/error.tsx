"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured client log; server logs capture the digest separately.
    console.error("App route error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <h1 className="text-lg font-semibold text-foreground">Something went sideways</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred while loading this page. You can try again, or head back to
            your dashboard.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p>
          )}
          <div className="mt-2 flex gap-2">
            <Button onClick={reset} variant="secondary">
              <RotateCcw className="size-4" /> Try again
            </Button>
            <Button asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
