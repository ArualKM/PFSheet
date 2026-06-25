import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell/app-shell";

export const metadata: Metadata = { title: "Edit character" };

export default async function EditCharacterPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const { characterId } = await params;
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href={`/characters/${characterId}`}>
          <ArrowLeft className="size-4" /> Back to overview
        </Link>
      </Button>
      <PageHeader
        title="Edit workspace"
        description="Inline editing, the formula inspector, and Simple/Advanced modes are coming in the edit-workspace milestone."
      />
      <Card className="border-dashed">
        <CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">
          The character editor is under construction. The schema, formula engine, and autosave
          plumbing it builds on are already in place.
        </CardContent>
      </Card>
    </div>
  );
}
