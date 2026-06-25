import "server-only";

import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ApiKeyMode, ApiRequestLogResponse } from "@/types/api";

/**
 * Per-request capture for the public API → `apiRequestLogs/{logId}`.
 *
 * What we store:
 *   - request: method, path, query, sanitized headers, body excerpt
 *   - response: status, body excerpt, errorCode if present
 *   - timings: createdAt, latencyMs
 *   - identity: keyId, prefix, mode (`live` / `test` for the UI filter)
 *   - requestId: matches the `X-Request-Id` response header — operators
 *     paste this into support tickets to find the row
 *
 * Mode-segregated so the request log viewer (slice 8) can show live and
 * test traffic in separate tabs. 30-day TTL via the `expiresAt` field —
 * declare a Firestore TTL policy on `expiresAt` to enable background
 * reaping; reads tolerate expired entries gracefully because the viewer
 * filters by createdAt window.
 *
 * Writes are fire-and-forget from `auth.ts::withApiAuth` — a slow log
 * write must NEVER delay the API response back to the caller.
 *
 * Redaction:
 *   - `Authorization` header is dropped entirely (never persist Bearer
 *     tokens; the `lsk_*` redactor catches them in transit anyway).
 *   - Bodies are capped at 2KB. Anything longer is truncated with a
 *     `…(truncated, N bytes)` marker so operators can see what happened.
 *   - Cookies and other auth headers are also dropped.
 */

const BODY_EXCERPT_LIMIT = 2048;
const HEADERS_EXCERPT_LIMIT = 1024;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const REDACT_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "leadstack-signature",
  "idempotency-key",
]);

export interface ApiRequestLogInput {
  subAccountId: string;
  agencyId: string;
  keyId: string;
  keyPrefix: string;
  mode: ApiKeyMode;
  requestId: string;
  method: string;
  path: string;
  query: string;
  requestHeaders: Headers;
  requestBody: string;
  responseStatus: number;
  responseBodyJson: unknown;
  errorCode: string | null;
  latencyMs: number;
}

function sanitizeHeaders(headers: Headers): string {
  const out: Record<string, string> = {};
  let bytes = 0;
  for (const [name, value] of headers.entries()) {
    if (REDACT_HEADERS.has(name.toLowerCase())) continue;
    const line = `${name}: ${value}`;
    if (bytes + line.length > HEADERS_EXCERPT_LIMIT) break;
    out[name] = value;
    bytes += line.length;
  }
  return JSON.stringify(out);
}

function truncate(input: string): string {
  if (input.length <= BODY_EXCERPT_LIMIT) return input;
  return `${input.slice(0, BODY_EXCERPT_LIMIT)}…(truncated, ${input.length} bytes)`;
}

function stringifyResponse(bodyJson: unknown): string {
  if (bodyJson === null || bodyJson === undefined) return "";
  try {
    return JSON.stringify(bodyJson);
  } catch {
    return "[unserializable]";
  }
}

/**
 * Write the log entry. Caller invokes via `void` — never await on the hot
 * request path. Errors are logged and dropped; never re-thrown.
 */
export async function captureRequestLog(input: ApiRequestLogInput): Promise<void> {
  try {
    await getAdminDb()
      .collection("subAccounts")
      .doc(input.subAccountId)
      .collection("apiRequestLogs")
      .add({
        agencyId: input.agencyId,
        subAccountId: input.subAccountId,
        keyId: input.keyId,
        keyPrefix: input.keyPrefix,
        mode: input.mode,
        requestId: input.requestId,
        method: input.method,
        path: input.path,
        query: input.query,
        requestHeaders: sanitizeHeaders(input.requestHeaders),
        requestBody: truncate(input.requestBody),
        responseStatus: input.responseStatus,
        responseBody: truncate(stringifyResponse(input.responseBodyJson)),
        errorCode: input.errorCode,
        latencyMs: input.latencyMs,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + TTL_MS),
      });
  } catch (err) {
    console.warn("[api/logs] captureRequestLog failed", err);
  }
}

function tsToIso(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return new Date(0).toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (typeof (ts as Timestamp).toDate === "function") {
    return (ts as Timestamp).toDate().toISOString();
  }
  return new Date(0).toISOString();
}

/**
 * Read recent API request logs for the Logs → API viewer, newest first.
 *
 * Orders by `createdAt` desc (single-field index, auto-created) and filters
 * `mode` in memory so no composite index is required. `limit` is clamped to
 * [1, 200]; the viewer fetches a window and the client filters live/test
 * client-side too, so this is just the hard ceiling.
 */
export async function listRequestLogs(
  subAccountId: string,
  opts: { limit?: number } = {},
): Promise<ApiRequestLogResponse[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const snap = await getAdminDb()
    .collection("subAccounts")
    .doc(subAccountId)
    .collection("apiRequestLogs")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      requestId: (data.requestId as string) ?? "",
      mode: (data.mode as ApiKeyMode) ?? "live",
      keyPrefix: (data.keyPrefix as string) ?? "",
      method: (data.method as string) ?? "",
      path: (data.path as string) ?? "",
      query: (data.query as string) ?? "",
      responseStatus: (data.responseStatus as number) ?? 0,
      errorCode: (data.errorCode as string | null) ?? null,
      latencyMs: (data.latencyMs as number) ?? 0,
      createdAt: tsToIso(data.createdAt),
      requestHeaders: (data.requestHeaders as string) ?? "",
      requestBody: (data.requestBody as string) ?? "",
      responseBody: (data.responseBody as string) ?? "",
    };
  });
}
