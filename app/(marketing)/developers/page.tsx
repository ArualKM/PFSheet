import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import {
  API_BASE,
  API_ENDPOINTS,
  API_RATE_LIMITS,
  API_SCOPE_INFO,
  API_VERSION,
  type ApiEndpoint,
} from "@/lib/api/catalog";

export const metadata: Metadata = {
  title: "API & Developers",
  description: "Pull your PathForge character data with the read-only PathForge API.",
};

const BASE = `${env.appUrl.replace(/\/$/, "")}${API_BASE}`;

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>
  );
}

function Block({ children }: { children: string }) {
  return (
    // tabIndex + region/label so keyboard users can focus and scroll the overflow (axe
    // scrollable-region-focusable); focus-visible ring gives the focus a visible indicator.
    <pre
      tabIndex={0}
      role="region"
      aria-label="Code sample"
      className="overflow-x-auto rounded-lg border border-border bg-surface-sunken p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <code className="font-mono text-foreground">{children}</code>
    </pre>
  );
}

function EndpointRow({ ep }: { ep: ApiEndpoint }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-xs font-semibold text-success">
          {ep.method}
        </span>
        <code className="font-mono text-sm text-foreground">
          {API_BASE}
          {ep.path}
        </code>
        {ep.auth === "key" ? (
          <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[11px] text-gold">scope: {ep.scope}</span>
        ) : ep.auth === "mixed" ? (
          <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[11px] text-gold">
            public · or scope: {ep.scope}
          </span>
        ) : (
          <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] text-muted-foreground">public</span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{ep.summary}</p>
      {ep.query && ep.query.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {ep.query.map((q) => (
            <li key={q.name}>
              <Code>{q.name}</Code> {q.required ? "(required)" : "(optional)"} — {q.description}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Returns:</span> {ep.returns}
      </p>
    </div>
  );
}

const ERROR_CODES: { status: number; code: string; when: string }[] = [
  { status: 400, code: "bad_request", when: "Required query parameters are missing." },
  { status: 401, code: "unauthorized", when: "No valid API key (or session) was supplied." },
  { status: 403, code: "forbidden", when: "The key lacks the scope, or the character isn't yours." },
  { status: 404, code: "not_found", when: "No public character with that slug, or character not found." },
  { status: 422, code: "invalid_character", when: "The character data failed validation." },
  { status: 429, code: "rate_limited", when: "Too many requests in the current window." },
];

export default function DevelopersPage() {
  const groups: ApiEndpoint["group"][] = ["Public", "Authenticated", "Discord"];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-foreground">PathForge API</h1>
      <p className="mt-2 text-muted-foreground">
        A read-only JSON API for your character data — build Discord bots, embeds, companion apps, or
        your own dashboards. Public endpoints respect each character&apos;s privacy settings; authenticated
        endpoints read your own characters with a scoped key.
      </p>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-raised/40 p-3 text-sm">
          <div className="text-xs text-muted-foreground">Base URL</div>
          <code className="font-mono text-foreground">{BASE}</code>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised/40 p-3 text-sm">
          <div className="text-xs text-muted-foreground">Version / discovery</div>
          <Link href={API_BASE} className="font-mono text-gold hover:underline">
            GET {API_BASE}
          </Link>
          <span className="text-muted-foreground"> · </span>
          <Link href={`${API_BASE}/openapi.json`} className="font-mono text-gold hover:underline">
            openapi.json
          </Link>
        </div>
      </div>

      {/* Quick start */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">Quick start</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Public data needs no auth — just a character&apos;s public slug (from its share link):
        </p>
        <div className="mt-3">
          <Block>{`curl ${BASE}/public/characters/{publicSlug}/summary`}</Block>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          For your own characters, create a key under{" "}
          <Link href="/settings/api" className="text-gold hover:underline">
            Settings → API keys
          </Link>{" "}
          and send it as a Bearer token:
        </p>
        <div className="mt-3">
          <Block>{`curl -H "Authorization: Bearer pf_live_..." \\\n  ${BASE}/characters/{characterId}/summary`}</Block>
        </div>
      </section>

      {/* Auth + scopes */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">Authentication &amp; scopes</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Keys look like <Code>pf_live_…</Code> and are shown once at creation — store them securely. A
          key only ever reads its owner&apos;s characters, and you can restrict a key to specific
          characters. Each scope unlocks a slice of data:
        </p>
        <div className="mt-3 space-y-2">
          {API_SCOPE_INFO.map((s) => (
            <div key={s.scope} className="rounded-lg border border-border bg-surface-raised/40 p-3 text-sm">
              <code className="font-mono text-foreground">{s.scope}</code>
              <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Response shape */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">Response shape</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Every response is wrapped in a consistent envelope with a request id and version:
        </p>
        <div className="mt-3">
          <Block>{`// success\n{ "data": { /* ... */ }, "meta": { "requestId": "…", "version": "${API_VERSION}" } }\n\n// error\n{ "error": { "code": "not_found", "message": "…" }, "meta": { "requestId": "…", "version": "${API_VERSION}" } }`}</Block>
        </div>
      </section>

      {/* Endpoints */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">Endpoints</h2>
        {groups.map((g) => (
          <div key={g} className="mt-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</h3>
            <div className="space-y-2">
              {API_ENDPOINTS.filter((e) => e.group === g).map((e) => (
                <EndpointRow key={e.path + (e.scope ?? "")} ep={e} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Rate limits */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">Rate limits</h2>
        <div className="mt-3 space-y-2">
          {API_RATE_LIMITS.map((r) => (
            <div key={r.bucket} className="rounded-lg border border-border bg-surface-raised/40 p-3 text-sm">
              <span className="font-medium text-foreground">{r.bucket}:</span>{" "}
              <span className="text-muted-foreground">
                {r.limit} (per {r.scopedBy})
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Over the limit returns <Code>429 rate_limited</Code>. Limits are a safety valve and may change.
        </p>
      </section>

      {/* Errors */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">Errors</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_CODES.map((e) => (
                <tr key={e.code} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-mono text-foreground">{e.status}</td>
                  <td className="py-2 pr-4 font-mono text-muted-foreground">{e.code}</td>
                  <td className="py-2 text-muted-foreground">{e.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Privacy */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">Privacy</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Public endpoints serve only what a character&apos;s share settings expose — the same privacy
          model as the public sheet. Sections a viewer can&apos;t see come back <Code>null</Code> or empty,
          never as raw data. Private and campaign-only characters aren&apos;t reachable through the public
          API at all.
        </p>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        Ready to build?{" "}
        <Link href="/settings/api" className="text-gold hover:underline">
          Create an API key →
        </Link>
      </p>
    </div>
  );
}
