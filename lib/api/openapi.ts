import { API_BASE, API_ENDPOINTS, API_VERSION } from "./catalog";

/** Build an OpenAPI 3.1 document from the endpoint catalog (importable into Postman/Swagger). */
function pathParameters(path: string) {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1]!,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

export function buildOpenApiSpec(origin: string) {
  const paths: Record<string, { get: Record<string, unknown> }> = {};

  for (const ep of API_ENDPOINTS) {
    const fullPath = `${API_BASE}${ep.path}`;
    const parameters = [
      ...pathParameters(ep.path),
      ...(ep.query ?? []).map((q) => ({
        name: q.name,
        in: "query",
        required: q.required,
        description: q.description,
        schema: { type: "string" },
      })),
    ];
    // "mixed" endpoints (e.g. the Discord card) accept a public path OR a keyed path,
    // so they document optional bearer auth plus the keyed-path error responses.
    const keyed = ep.auth === "key" || ep.auth === "mixed";
    paths[fullPath] = {
      get: {
        summary: ep.summary,
        description: ep.returns,
        tags: [ep.group],
        ...(parameters.length ? { parameters } : {}),
        responses: {
          "200": { description: ep.returns },
          ...(ep.query ? { "400": { description: "Missing or invalid query parameters." } } : {}),
          "404": { description: "Character not found." },
          "429": { description: "Rate limited." },
          ...(keyed
            ? {
                "401": { description: "Missing or invalid API key." },
                "403": { description: "Key lacks the required scope, or the character isn't yours." },
              }
            : {}),
        },
        ...(ep.auth === "key" ? { security: [{ bearerAuth: [] }] } : {}),
        // Empty {} = auth optional: the public (?slug=) path needs no key.
        ...(ep.auth === "mixed" ? { security: [{}, { bearerAuth: [] }] } : {}),
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "PathForge API",
      version: API_VERSION,
      description:
        "Read-only access to PathForge character data. Public endpoints respect each character's privacy settings; authenticated endpoints read your own characters with a scoped API key.",
    },
    servers: [{ url: origin }],
    tags: [{ name: "Public" }, { name: "Authenticated" }, { name: "Discord" }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "pf_live_...",
          description: "PathForge API key. Create one under Settings → API keys.",
        },
      },
    },
  };
}
