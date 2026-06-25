import { Plus, Minus, ArrowRight } from "lucide-react";
import type { CharacterDiff } from "@/lib/character/diff";

/** Presentational render of a {@link CharacterDiff} (§16.2). Read-only. */
export function DiffView({ diff }: { diff: CharacterDiff }) {
  if (!diff.hasChanges) {
    return <p className="text-sm text-muted-foreground">No differences.</p>;
  }
  return (
    <div className="space-y-4">
      {diff.values.length > 0 && (
        <div className="space-y-1">
          {diff.values.map((v) => (
            <div key={v.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{v.label}</span>
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground line-through">{v.before}</span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="font-medium text-foreground">{v.after}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {diff.lists.map((l) => (
        <div key={l.label} className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{l.label}</h4>
          <ul className="space-y-0.5 text-sm">
            {l.added.map((x, i) => (
              <li key={`a-${x}-${i}`} className="flex items-center gap-1.5 text-success">
                <Plus className="size-3.5 shrink-0" /> {x}
              </li>
            ))}
            {l.removed.map((x, i) => (
              <li key={`r-${x}-${i}`} className="flex items-center gap-1.5 text-danger">
                <Minus className="size-3.5 shrink-0" /> <span className="line-through">{x}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
