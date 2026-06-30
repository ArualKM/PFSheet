"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Loader2, PawPrint } from "lucide-react";
import { createCompanionAction } from "@/lib/actions/characters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const TYPES: { value: string; label: string }[] = [
  { value: "animal_companion", label: "Animal Companion" },
  { value: "familiar", label: "Familiar" },
  { value: "eidolon", label: "Eidolon" },
  { value: "cohort", label: "Cohort" },
  { value: "mount", label: "Mount" },
  { value: "other", label: "Other" },
];
const LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

export type CompanionRow = { id: string; name: string; companion_type: string | null };

/**
 * Phase 9 — linked-row companions. Lists the parent's companions (each a real, separately-editable character)
 * and creates a new one via the server action, then jumps to its sheet. Owner-only (rendered only for the owner).
 */
export function CompanionsCard({ parentId, companions }: { parentId: string; companions: CompanionRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("animal_companion");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    setError(null);
    startTransition(async () => {
      const res = await createCompanionAction(parentId, type, name);
      if (res.error) {
        setError(res.error);
        return;
      }
      setName("");
      if (res.id) router.push(`/characters/${res.id}/edit`);
    });
  };

  return (
    <Card className="mt-4">
      <CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <PawPrint className="size-4 text-gold" /> Companions
        </h2>

        {companions.length === 0 ? (
          <p className="mb-3 text-sm text-muted-foreground">
            No companions yet. Animal companions, familiars, eidolons, and cohorts are their own full character
            sheets, linked here.
          </p>
        ) : (
          <ul className="mb-3 space-y-1.5">
            {companions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                <Link href={`/characters/${c.id}`} className="truncate text-sm font-medium text-foreground hover:underline">
                  {c.name}
                </Link>
                {c.companion_type && <Badge variant="gold">{LABEL[c.companion_type] ?? c.companion_type}</Badge>}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Shadow the wolf"
              aria-label="Companion name"
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label="Companion type"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" disabled={pending} onClick={create}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add companion
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}
