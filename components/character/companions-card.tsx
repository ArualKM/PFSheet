"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Loader2, PawPrint, Search, X } from "lucide-react";
import { FAMILIAR_ARCHETYPES } from "@pathforge/schema";
import { createCompanionAction } from "@/lib/actions/characters";
import { STATBLOCK_SOURCES } from "@/lib/character/companion-statblock";
import { createClient } from "@/lib/supabase/client";
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

type StatblockPick = { slug: string; name: string };

/**
 * Phase 9 — linked-row companions, now with compendium statblock autofill (214 animal companions /
 * 187 familiars), familiar archetypes, and the master link (familiar stats synced from this
 * character). Each companion is a real, separately-editable character. Owner-only.
 */
export function CompanionsCard({ parentId, companions }: { parentId: string; companions: CompanionRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("animal_companion");
  const [statblock, setStatblock] = useState<StatblockPick | null>(null);
  const [archetype, setArchetype] = useState("");
  const [linkToMaster, setLinkToMaster] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const statblockCfg = STATBLOCK_SOURCES[type];
  const isFamiliar = type === "familiar";

  const create = () => {
    setError(null);
    startTransition(async () => {
      const res = await createCompanionAction(parentId, type, name, {
        compendiumTable: statblock && statblockCfg ? statblockCfg.table : undefined,
        compendiumSlug: statblock?.slug,
        archetype: isFamiliar ? archetype || undefined : undefined,
        linkToMaster: isFamiliar ? linkToMaster : false,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setName("");
      setStatblock(null);
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
              className="h-11 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground sm:h-9"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-muted-foreground">Type</span>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setStatblock(null);
              }}
              aria-label="Companion type"
              className="h-11 rounded-lg border border-border bg-background px-2 text-sm text-foreground sm:h-9"
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

        {statblockCfg && (
          <div className="mt-2">
            <StatblockSearch
              key={type}
              rpc={statblockCfg.rpc}
              hint={statblockCfg.hint}
              picked={statblock}
              onPick={setStatblock}
            />
          </div>
        )}

        {isFamiliar && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Archetype (optional)</span>
              <select
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
                aria-label="Familiar archetype"
                className="h-11 rounded-lg border border-border bg-background px-2 text-sm text-foreground sm:h-9"
              >
                <option value="">Standard familiar</option>
                {FAMILIAR_ARCHETYPES.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 pt-4 text-xs text-foreground">
              <input
                type="checkbox"
                checked={linkToMaster}
                onChange={(e) => setLinkToMaster(e.target.checked)}
                className="size-4 accent-[var(--pf-gold)]"
              />
              Link stats to this character (HP · BAB · saves · skills · Int)
            </label>
          </div>
        )}

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}

/** Inline debounced compendium statblock search — pick one to autofill the new companion's sheet. */
function StatblockSearch({
  rpc,
  hint,
  picked,
  onPick,
}: {
  rpc: string;
  hint: string;
  picked: StatblockPick | null;
  onPick: (p: StatblockPick | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<StatblockPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (term.length < 2) {
        if (!cancelled) {
          setRows([]);
          setError(null);
          setLoading(false); // an in-flight fetch may have been cancelled with the spinner on
        }
        return;
      }
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await (supabase as any).rpc(rpc, { p_query: term, p_limit: 8 });
      if (!cancelled) {
        // Surface the error instead of rendering a real failure as an indistinguishable "no results".
        if (rpcError) {
          setError(rpcError.message ?? "Search failed.");
          setRows([]);
        } else {
          setError(null);
          setRows(((data ?? []) as { slug: string; name: string }[]).map((r) => ({ slug: r.slug, name: r.name })));
        }
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, rpc, supabase]);

  if (picked) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-muted-foreground">Statblock:</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-foreground">
          {picked.name}
          <button type="button" aria-label="Clear statblock" onClick={() => onPick(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <span className="mb-1 block font-medium text-muted-foreground">
        Statblock (optional — fills in the creature&rsquo;s stats)
      </span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={hint}
          aria-label="Search companion statblocks"
          className="h-11 w-full rounded-lg border border-border bg-background pl-7 pr-2 text-sm text-foreground sm:h-9 sm:max-w-xs"
        />
        {loading && <Loader2 className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="mt-1 text-danger">{error}</p>}
      {rows.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface sm:max-w-xs">
          {rows.map((r) => (
            <li key={r.slug}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="block w-full px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-surface-raised"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
