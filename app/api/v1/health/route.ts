import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** §3 Health check endpoint. */
export async function GET() {
  return NextResponse.json({
    data: { status: "ok", service: "pathforge", time: new Date().toISOString() },
    meta: { requestId: crypto.randomUUID(), version: "v1" },
  });
}
