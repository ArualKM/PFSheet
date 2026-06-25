import { AlertTriangle, Info, FlaskConical, Puzzle, Sparkles, Sigma, Flag, EyeOff } from "lucide-react";
import type { CharacterAudit } from "@/lib/character/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Presentational GM audit summary (§10). Pure render of a {@link CharacterAudit}:
 * math warnings, formula overrides, custom/3pp content, enabled modules, and
 * active buffs. Read-only — no actions, no sheet mutation.
 */
export function AuditReport({ audit }: { audit: CharacterAudit }) {
  const warnings = audit.warnings.filter((w) => w.severity === "warning");
  const infos = audit.warnings.filter((w) => w.severity === "info");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sigma className="size-4 text-gold" /> Math &amp; content audit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {audit.hiddenSections.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-raised/40 px-3 py-2 text-xs text-muted-foreground">
            <EyeOff className="mt-0.5 size-3.5 shrink-0" />
            Hidden by the player&rsquo;s privacy settings: {audit.hiddenSections.join(", ")}. These
            sections aren&rsquo;t audited.
          </p>
        )}

        {/* Warnings */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Audit warnings</h3>
          {warnings.length === 0 && infos.length === 0 ? (
            <p className="text-sm text-success">No anomalies detected in the computed values.</p>
          ) : (
            <ul className="space-y-1.5">
              {warnings.map((w) => (
                <li key={w.id} className="flex items-start gap-2 text-sm text-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>{w.message}</span>
                </li>
              ))}
              {infos.map((w) => (
                <li key={w.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0 text-rune" />
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* GM-flagged entries */}
        {audit.flaggedEntries.length > 0 && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Flag className="size-4 text-danger" /> Previously flagged
            </h3>
            <ul className="space-y-1">
              {audit.flaggedEntries.map((e, i) => (
                <li key={`${e.kind}-${e.name}-${i}`} className="text-sm text-foreground">
                  <span className="text-muted-foreground">{e.kind}:</span> {e.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Formula overrides */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <FlaskConical className="size-4 text-gold" /> Formula overrides
          </h3>
          {audit.formulaOverrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No formula overrides{audit.customFormulaCount > 0 ? `; ${audit.customFormulaCount} custom named formula(s).` : "."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {audit.formulaOverrides.map((o) => (
                <li key={o.targetPath} className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs text-rune">{o.targetPath}</code>
                    {o.gmRecommended && <Badge variant="warning">Review</Badge>}
                    {!o.enabled && <Badge variant="default">Disabled</Badge>}
                  </div>
                  <code className="mt-1 block break-all text-xs text-muted-foreground">{o.formula}</code>
                  {o.note && <p className="mt-1 text-xs text-muted-foreground">{o.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Custom / 3pp content */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-gold" /> Custom &amp; third-party content
          </h3>
          {audit.customContent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No homebrew or third-party content detected.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {audit.customContent.map((c, i) => (
                <Badge key={`${c.kind}-${c.name}-${i}`} variant={c.flagged ? "danger" : "default"} title={c.detail}>
                  {c.kind}: {c.name}
                </Badge>
              ))}
            </div>
          )}
        </section>

        {/* Modules */}
        {audit.modules.length > 0 && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Puzzle className="size-4 text-gold" /> Rule modules
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {audit.modules.map((m) => (
                <Badge key={m.key} variant="rune" title={m.publisher}>
                  {m.name}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Active buffs */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Active buffs</h3>
          {audit.activeBuffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No buffs currently active.</p>
          ) : (
            <ul className="space-y-1">
              {audit.activeBuffs.map((b, i) => (
                <li key={`${b.name}-${i}`} className="flex items-center justify-between gap-2 text-sm text-foreground">
                  <span>
                    {b.name}
                    {b.custom && <span className="ml-1.5 text-xs text-warning">custom</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{b.effectCount} effect{b.effectCount === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
