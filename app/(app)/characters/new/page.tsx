import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { CreateCharacterForm } from "@/components/characters/create-character-form";

export const metadata: Metadata = { title: "New character" };

export default async function NewCharacterPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="New character"
        description="Start with a blank Pathfinder 1e sheet — abilities, skills, and default formulas are ready to go."
      />
      <Card>
        <CardContent className="p-6">
          <CreateCharacterForm />
        </CardContent>
      </Card>
    </div>
  );
}
