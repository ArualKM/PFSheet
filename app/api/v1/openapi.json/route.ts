import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";

/** Machine-readable OpenAPI 3.1 spec (raw, not wrapped in the API envelope). */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json(buildOpenApiSpec(origin));
}
