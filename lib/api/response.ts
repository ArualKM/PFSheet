import { NextResponse } from "next/server";

/**
 * §14.1 API response envelope. Every /api/v1 response is `{ data | error, meta }`
 * with a requestId + version, so consumers get a consistent shape.
 */
export type ApiErrorBody = { code: string; message: string; details?: unknown };

function meta() {
  return { requestId: crypto.randomUUID(), version: "v1" };
}

export function apiOk<T>(data: T, init?: { status?: number; headers?: HeadersInit }): NextResponse {
  return NextResponse.json({ data, meta: meta() }, { status: init?.status ?? 200, headers: init?.headers });
}

export function apiError(code: string, message: string, status: number, details?: unknown): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) }, meta: meta() },
    { status },
  );
}
