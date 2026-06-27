import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiKeyManager } from "@/components/settings/api-key-manager";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiSettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: keyRows } = await supabase
    .from("api_keys")
    .select("id, label, scopes, allowed_character_ids, created_at, last_used_at, revoked_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  const { data: chars } = await supabase
    .from("characters")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("name");

  const keys = (keyRows ?? []).map((k) => ({
    id: k.id,
    label: k.label,
    scopes: Array.isArray(k.scopes) ? (k.scopes as string[]) : [],
    allowedCharacterCount: Array.isArray(k.allowed_character_ids)
      ? (k.allowed_character_ids as string[]).length
      : 0,
    created_at: k.created_at,
    last_used_at: k.last_used_at,
    revoked_at: k.revoked_at,
  }));
  const characters = (chars ?? []).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/settings">
          <ArrowLeft className="size-4" /> Settings
        </Link>
      </Button>
      <PageHeader
        title="API keys"
        description="Create scoped, revocable keys to pull your character data from the PathForge API."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            New to the API? See what each scope unlocks and how to call the endpoints.
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/developers">
              <BookOpen className="size-4" /> API docs
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <ApiKeyManager keys={keys} characters={characters} />
        </CardContent>
      </Card>
    </div>
  );
}
