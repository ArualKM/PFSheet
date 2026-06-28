import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-dashed">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="font-display text-4xl font-semibold text-gold">404</p>
          <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            This page doesn&rsquo;t exist — or a shared character link has expired or been made private.
          </p>
          <div className="mt-2 flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/">Home</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
