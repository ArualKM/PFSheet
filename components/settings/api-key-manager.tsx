"use client";

import { useState, useTransition } from "react";
import { Copy, Check, KeyRound, Trash2, ShieldAlert } from "lucide-react";
import { createApiKeyAction, revokeApiKeyAction } from "@/lib/actions/api-keys";
import { API_SCOPE_INFO } from "@/lib/api/catalog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type KeyRow = {
  id: string;
  label: string;
  scopes: string[];
  allowedCharacterCount: number;
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};
type CharOption = { id: string; name: string };

// Reuse the catalog's scope list so this UI can't drift from the docs/API.
const SCOPES = API_SCOPE_INFO.map((s) => ({ key: s.scope, label: s.scope, desc: s.description }));

function fmt(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function ApiKeyManager({ keys, characters }: { keys: KeyRow[]; characters: CharOption[] }) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<string[]>(["characters:summary"]);
  const [restrict, setRestrict] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleScope = (s: string) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const toggleChar = (id: string) =>
    setAllowed((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const create = () => {
    setError(null);
    setToken(null);
    if (restrict && allowed.length === 0) {
      setError("Pick at least one character, or turn off the restriction.");
      return;
    }
    startTransition(async () => {
      const res = await createApiKeyAction({
        label,
        scopes,
        allowedCharacterIds: restrict ? allowed : undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setToken(res.token ?? null);
      setLabel("");
      setScopes(["characters:summary"]);
      setRestrict(false);
      setAllowed([]);
    });
  };

  const revoke = (id: string) => startTransition(() => revokeApiKeyAction(id).then(() => {}));

  const copy = () => {
    if (!token) return;
    void navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      {/* One-time token reveal */}
      {token && (
        <div className="rounded-lg border border-gold/50 bg-gold/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldAlert className="size-4 text-gold" /> Copy your key now — it won&apos;t be shown again.
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-surface-sunken px-3 py-2 font-mono text-sm text-foreground">
              {token}
            </code>
            <Button type="button" size="sm" variant="secondary" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      {/* Create form */}
      <div className="rounded-lg border border-border bg-surface-raised/40 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <KeyRound className="size-4 text-gold" /> Create an API key
        </h3>
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="key-label">
          Label
        </label>
        <input
          id="key-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Discord bot"
          maxLength={80}
          className="mb-4 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-gold/50"
        />

        <div className="mb-1 text-xs font-medium text-muted-foreground">Scopes</div>
        <div className="mb-4 space-y-1.5">
          {SCOPES.map((s) => (
            <label key={s.key} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={scopes.includes(s.key)}
                onChange={() => toggleScope(s.key)}
                className="mt-0.5"
              />
              <span>
                <code className="text-xs text-foreground">{s.label}</code>
                <span className="ml-2 text-xs text-muted-foreground">{s.desc}</span>
              </span>
            </label>
          ))}
        </div>

        {characters.length > 0 && (
          <div className="mb-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={restrict} onChange={(e) => setRestrict(e.target.checked)} />
              Restrict this key to specific characters
            </label>
            {restrict && (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-surface p-2">
                {characters.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={allowed.includes(c.id)} onChange={() => toggleChar(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <Button type="button" size="sm" onClick={create} disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </Button>
      </div>

      {/* Existing keys */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Your keys</h3>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <ul className="space-y-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{k.label}</span>
                    {k.revoked_at && <Badge variant="danger">Revoked</Badge>}
                    {k.allowedCharacterCount > 0 && (
                      <Badge variant="outline">{k.allowedCharacterCount} character{k.allowedCharacterCount === 1 ? "" : "s"}</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <code key={s} className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {s}
                      </code>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Created {fmt(k.created_at)} · Last used {fmt(k.last_used_at)}
                  </div>
                </div>
                {!k.revoked_at && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => revoke(k.id)} disabled={pending}>
                    <Trash2 className="size-4" /> Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
