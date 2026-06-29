"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { exportCharacterAction } from "@/lib/actions/exports";
import { Button } from "@/components/ui/button";

const FORMATS = [
  {
    type: "pathforge_json",
    label: "PathForge JSON",
    desc: "Complete backup — re-imports losslessly into PathForge.",
  },
  {
    type: "foundry_pf1_actor_json",
    label: "Foundry VTT Actor JSON",
    desc: "Best-effort actor for the Foundry pf1 system (no guaranteed round-trip).",
  },
  {
    type: "pathforge_public_json",
    label: "Public JSON",
    desc: "Privacy-filtered to what your share settings allow — safe to hand out.",
  },
  {
    type: "printable_pdf_modern",
    label: "Printable PDF",
    desc: "A clean one-page character reference sheet for the table — prints well in black & white.",
  },
] as const;

export function ExportPanel({ characterId }: { characterId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const download = (type: string) => {
    setError(null);
    setBusy(type);
    startTransition(async () => {
      const res = await exportCharacterAction(characterId, type);
      setBusy(null);
      if (res.error || (!res.text && !res.base64)) {
        setError(res.error ?? "Export failed.");
        return;
      }
      // Binary (PDF) comes back base64-encoded; text exports come back as a string.
      let blob: Blob;
      if (res.base64) {
        const bin = atob(res.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], { type: res.contentType ?? "application/pdf" });
      } else {
        blob = new Blob([res.text!], { type: res.contentType ?? "application/json" });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename ?? "export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-3">
      {FORMATS.map((f) => (
        <div
          key={f.type}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised/40 px-4 py-3"
        >
          <div className="min-w-0">
            <div className="font-medium text-foreground">{f.label}</div>
            <div className="text-xs text-muted-foreground">{f.desc}</div>
          </div>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => download(f.type)}>
            <Download className="size-4" /> {busy === f.type ? "Preparing…" : "Download"}
          </Button>
        </div>
      ))}
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Foundry exports are best-effort — review the character after importing.
      </p>
    </div>
  );
}
