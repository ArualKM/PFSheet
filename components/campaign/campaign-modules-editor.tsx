"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OPTIONAL_RULE_MODULES, isModuleComingSoon } from "@pathforge/schema";
import { updateCampaignModulesAction } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GROUPS = [
  { key: "paizo", label: "Paizo optional" },
  { key: "subsystem", label: "Subsystems" },
  { key: "thirdparty", label: "Third-party" },
] as const;

const GROUPED = {
  paizo: OPTIONAL_RULE_MODULES.filter((m) => m.group === "paizo"),
  subsystem: OPTIONAL_RULE_MODULES.filter((m) => m.group === "subsystem"),
  thirdparty: OPTIONAL_RULE_MODULES.filter((m) => m.group === "thirdparty"),
};

/**
 * GM/owner editor for the campaign's enabled optional-rule modules (§17.2). Toggle chips build a local
 * selection; Save persists it. "soon" marks modules whose sheet support isn't built yet — a campaign may
 * still declare them.
 */
export function CampaignModulesEditor({
  campaignId,
  enabledKeys,
}: {
  campaignId: string;
  enabledKeys: string[];
}) {
  const router = useRouter();
  // Order/dup-insensitive signature of the persisted set.
  const sig = useMemo(() => [...new Set(enabledKeys)].sort().join("|"), [enabledKeys]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(enabledKeys));
  const [seenSig, setSeenSig] = useState(sig);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-sync the local selection when the persisted set changes from another source (a concurrent GM
  // edit or the §17.2 adopt flow) — adjust-state-on-prop-change, not an effect.
  if (sig !== seenSig) {
    setSeenSig(sig);
    setSelected(new Set(enabledKeys));
  }

  const dirty = useMemo(() => [...selected].sort().join("|") !== sig, [selected, sig]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateCampaignModulesAction(campaignId, [...selected]);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {GROUPS.map((g) => (
        <div key={g.key} className="space-y-1.5">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {GROUPED[g.key].map((m) => {
              const on = selected.has(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggle(m.key)}
                  disabled={pending}
                  aria-pressed={on}
                  title={m.description}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-60",
                    on
                      ? "border-rune/50 bg-rune/15 text-rune"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.name}
                  {isModuleComingSoon(m.key) && <span className="ml-1 opacity-60">soon</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save modules"}
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  );
}
