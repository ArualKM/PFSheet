import { apiOk } from "@/lib/api/response";
import { API_BASE, API_ENDPOINTS, API_SCOPE_INFO, API_VERSION } from "@/lib/api/catalog";

export const dynamic = "force-dynamic";

/** §14 discovery index — a self-describing entry point for the API. */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return apiOk({
    name: "PathForge API",
    version: API_VERSION,
    documentation: `${origin}/developers`,
    openapi: `${origin}${API_BASE}/openapi.json`,
    scopes: API_SCOPE_INFO,
    endpoints: API_ENDPOINTS.map((e) => ({
      method: e.method,
      path: `${API_BASE}${e.path}`,
      auth: e.auth,
      scope: e.scope ?? null,
      summary: e.summary,
    })),
  });
}
