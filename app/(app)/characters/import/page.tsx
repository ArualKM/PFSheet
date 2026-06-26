import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "@/components/character/import/import-wizard";

export const metadata: Metadata = { title: "Import a character" };

export default async function ImportPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("characters")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("is_archived", false)
    .order("name");

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/characters">
          <ArrowLeft className="size-4" /> All characters
        </Link>
      </Button>
      <PageHeader
        title="Import a character"
        description="Bring in a sheet from PathForge, Myth-Weavers, or Foundry VTT. You'll see a preview and any warnings before anything is saved."
      />
      <ImportWizard characters={data ?? []} />
    </div>
  );
}
