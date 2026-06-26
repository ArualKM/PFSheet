"use client";

import { useState, useTransition } from "react";
import { Upload, FileJson, AlertTriangle, Info, ArrowRight, Check, RotateCcw } from "lucide-react";
import {
  previewImportAction,
  commitImportAction,
  type ImportPreview,
  type CommitTarget,
} from "@/lib/actions/imports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const textareaClass =
  "flex w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground shadow-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

export function ImportWizard({
  characters,
  defaultMergeId,
}: {
  characters: { id: string; name: string }[];
  defaultMergeId?: string;
}) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | undefined>();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<"new" | "merge">(defaultMergeId ? "merge" : "new");
  const [mergeId, setMergeId] = useState(defaultMergeId ?? characters[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onFile = (file: File) => {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setText(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  };

  const doPreview = () => {
    setError(null);
    startTransition(async () => {
      const res = await previewImportAction({ text, filename });
      if (res.error) setError(res.error);
      else if (res.preview) setPreview(res.preview);
    });
  };

  const doCommit = () => {
    if (!preview) return;
    setError(null);
    const target: CommitTarget = mode === "merge" ? { mode: "merge", characterId: mergeId } : { mode: "new" };
    startTransition(async () => {
      const res = await commitImportAction(preview.jobId, target);
      // Success redirects to the character; only an error returns here.
      if (res?.error) setError(res.error);
    });
  };

  const reset = () => {
    setPreview(null);
    setText("");
    setFilename(undefined);
    setError(null);
  };

  // ── Step 1: source ─────────────────────────────────────────────────────────
  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="size-4 text-gold" /> Choose a character file
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-raised/40 px-6 py-8 text-center transition-colors hover:border-gold/40">
            <Upload className="size-6 text-gold" />
            <span className="text-sm font-medium text-foreground">
              {filename ? filename : "Upload a .json export"}
            </span>
            <span className="text-xs text-muted-foreground">
              PathForge, Myth-Weavers, or Foundry VTT PF1e JSON
            </span>
            <input
              type="file"
              accept=".json,.txt,application/json,text/plain"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>

          <div className="space-y-1.5">
            <label htmlFor="import-paste" className="text-sm font-medium text-foreground">
              …or paste the JSON
            </label>
            <textarea
              id="import-paste"
              rows={6}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFilename(undefined);
              }}
              placeholder='{ "schemaVersion": "...", ... }  or a Myth-Weavers / Foundry export'
              className={textareaClass}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end">
            <Button type="button" onClick={doPreview} disabled={pending || !text.trim()}>
              {pending ? "Reading…" : "Preview import"} <ArrowRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Step 2: preview + target ───────────────────────────────────────────────
  const s = preview.summary;
  const warns = preview.warnings;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Check className="size-4 text-success" /> Detected: {preview.label}
          </CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-4" /> Start over
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-lg font-semibold text-foreground">{s.name}</div>
            <div className="text-sm text-muted-foreground">
              Level {s.totalLevel}
              {s.classLine ? ` · ${s.classLine}` : ""}
              {s.race ? ` · ${s.race}` : ""}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[
              ["Skills", s.skills],
              ["Feats", s.feats],
              ["Spells", s.spells],
              ["Buffs", s.buffs],
              ["Items", s.items],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2 text-center">
                <div className="tnum text-lg font-semibold text-foreground">{n as number}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label as string}</div>
              </div>
            ))}
          </div>

          {s.modules.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Modules:</span>
              {s.modules.map((m) => (
                <Badge key={m} variant="rune">
                  {m}
                </Badge>
              ))}
            </div>
          )}
          {s.unmappedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {s.unmappedCount} source field(s) couldn&rsquo;t be auto-mapped and are preserved as
              notes / under metadata for you to re-file.
            </p>
          )}
        </CardContent>
      </Card>

      {(warns.length > 0 || preview.errors.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Review before importing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {preview.errors.map((e, i) => (
              <p key={`e-${i}`} className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {e.message}
              </p>
            ))}
            {warns.map((w, i) => (
              <p key={`w-${i}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-warning" /> {w.message}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Where should it go?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="target" checked={mode === "new"} onChange={() => setMode("new")} className="mt-1 accent-gold" />
            <span>
              <span className="font-medium text-foreground">Create a new character</span>
              <span className="block text-muted-foreground">Adds “{s.name}” to your roster.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="target"
              checked={mode === "merge"}
              onChange={() => setMode("merge")}
              disabled={characters.length === 0}
              className="mt-1 accent-gold"
            />
            <span className="flex-1">
              <span className="font-medium text-foreground">Replace an existing character</span>
              <span className="block text-muted-foreground">
                Snapshots the current version first, so it&rsquo;s reversible from History.
              </span>
              {mode === "merge" && characters.length > 0 && (
                <select
                  value={mergeId}
                  onChange={(e) => setMergeId(e.target.value)}
                  className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground"
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>

          {preview.errors.length > 0 && (
            <p className="text-sm text-danger">
              This export has validation errors and can&rsquo;t be imported as-is — fix the source and re-upload.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={doCommit}
              disabled={pending || preview.errors.length > 0 || (mode === "merge" && !mergeId)}
            >
              {pending ? "Importing…" : mode === "new" ? "Create character" : "Snapshot & replace"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
