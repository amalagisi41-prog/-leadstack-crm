import "server-only";

import type { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  bumpApiKeyLastUsed,
  findApiKeyByPrefix,
} from "@/lib/firestore/api-keys";
import {
  hashApiKey,
  parseApiKey,
  safeEqualHash,
} from "@/lib/api/keys";
import {
  apiError,
  apiOk,
  newRequestId,
  type ResponseMeta,
} from "@/lib/api/responses";
import {
  LATEST_API_VERSION,
  resolveVersion,
} from "@/lib/api/versions";
import {
  fingerprintRequest,
  isValidIdempotencyKey,
  readIdempotencyCache,
  writeIdempotencyCache,
} from "@/lib/api/idempotency";
import {
  checkAndCount as checkRateLimit,
  snapshotRemaining,
} from "@/lib/api/rate-limit";
import { captureRequestLog } from "@/lib/api/logs";
import type { ApiKeyMode, ApiKeyScope } from "@/types/api";

/**
 * Public-API request lifecycle: auth → version resolve → (optional)
 * idempotency check → handler → response capture.
 *
 * Two entry points:
 *
 *   - `authenticateApiRequest(request)` — low-level. Returns either an
 *     `ApiAuthContext` (auth resolved, headers parsed, request id minted)
 *     OR a NextResponse with a Stripe-shaped error body. Use this when a
 *     route needs full control over body parsing or idempotency semantics.
 *
 *   - `withApiAuth(handler, opts)` — high-level. Composes auth + body
 *     parsing + idempotency cache + response headers. Most v1 routes
 *     should use this. The handler receives a typed input bundle and
 *     returns a NextResponse (built via `apiOk` / `apiError`).
 *
 * Tenancy enforcement: the resolved `ApiAuthContext` carries
 * `{agencyId, subAccountId}` from the key doc. Every downstream
 * Firestore write MUST stamp these onto the doc — the API layer does NOT
 * run inside Firestore rules (writes go via Admin SDK), so tenancy is
 * code-enforced. The cost of forgetting is a cross-tenant leak, so
 * subsequent slices ship `requireApiTenancy(ctx, doc)` guards that
 * compare `doc.subAccountId` to `ctx.subAccountId` before returning.
 */

export interface ApiAuthContext extends ResponseMeta {
  /** Identifies the key holder for this request. Tenancy keys for writes. */
  agencyId: string;
  subAccountId: string;
  keyId: string;
  /** First 8 chars of the key — surfaced in logs / errors, never secret. */
  keyPrefix: string;
  /** Live data plane or sandboxed test namespace. */
  mode: ApiKeyMode;
  /** Scopes granted to this key. Check before resource access. */
  scopes: ApiKeyScope[];
}

export interface WithApiAuthOptions {
  /** Required scope. Defaults to "admin". */
  requireScope?: ApiKeyScope;
  /**
   * Override the auto-detect for idempotency caching. Default behaviour:
   * cache when method is POST / PATCH / DELETE AND an `Idempotency-Key`
   * header is present. Set `false` to force-skip even when headers say
   * otherwise (rare — e.g. an internal admin endpoint that must always
   * re-execute).
   */
  idempotency?: boolean;
}

export interface ApiHandlerInput<P extends Record<string, string> = Record<string, string>> {
  request: Request;
  params: P;
  /** Parsed JSON body, or null when body is empty / not JSON. */
  body: unknown;
  /** Raw body string. Used by idempotency fingerprinting. */
  rawBody: string;
  ctx: ApiAuthContext;
}

const METHODS_WITH_IDEMPOTENCY = new Set(["POST", "PATCH", "DELETE", "PUT"]);

function readBearerToken(request: Request): string | null {
  const authz = request.headers.get("authorization") ?? "";
  const trimmed = authz.trim();
  if (!trimmed) return null;
  // Stripe-style: case-insensitive "Bearer", single space, then the token.
  const m = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!m) return null;
  return m[1]!.trim();
}

/**
 * Pure auth + version resolve. Returns either a fully-populated
 * `ApiAuthContext` OR a NextResponse with the appropriate error.
 *
 * Side-effects (intentional):
 *   - Fires `bumpApiKeyLastUsed` fire-and-forget on success. Never blocks
 *     the request on the Firestore write.
 */
export async function authenticateApiRequest(
  request: Request,
): Promise<ApiAuthContext | NextResponse> {
  const requestId = newRequestId();
  // Always set a temporary meta with the latest version — if the header
  // says something invalid we want the rejection response to still echo a
  // sane LeadStack-Version header.
  const tentativeMeta: ResponseMeta = {
    requestId,
    apiVersion: LATEST_API_VERSION,
  };

  const token = readBearerToken(request);
  if (!token) {
    return apiError(
      tentativeMeta,
      "authentication_error",
      "missing_api_key",
      "No API key provided. Pass it via the Authorization header as 'Bearer <key>'.",
    );
  }

  const parsed = parseApiKey(token);
  if (!parsed) {
    return apiError(
      tentativeMeta,
      "authentication_error",
      "malformed_api_key",
      "The API key is malformed. Keys must look like 'lsk_live_<8>_<32>' or 'lsk_test_<8>_<32>'.",
    );
  }

  const candidate = await findApiKeyByPrefix(parsed.prefix);
  if (!candidate || candidate.mode !== parsed.mode) {
    // Unknown prefix OR mode mismatch (someone replaced "live" with "test"
    // in a captured key, hoping the prefix collides). Constant-message
    // either way so callers can't distinguish.
    return apiError(
      tentativeMeta,
      "authentication_error",
      "invalid_api_key",
      "Invalid API key provided.",
    );
  }

  // Constant-time hash comparison BEFORE the lastUsedAt bump so a timing
  // attacker can't tell whether a key exists.
  const expected = candidate.hashedSecret;
  const actual = hashApiKey(token);
  if (!safeEqualHash(expected, actual)) {
    return apiError(
      tentativeMeta,
      "authentication_error",
      "invalid_api_key",
      "Invalid API key provided.",
    );
  }

  if (candidate.revokedAt) {
    return apiError(
      tentativeMeta,
      "authentication_error",
      "revoked_api_key",
      "This API key has been revoked. Mint a new one from Settings → API keys.",
    );
  }

  // Agency-level gate check. The agency owner can flip
  // `apiAccessEnabledByAgency` off to immediately block every /api/v1/*
  // request from a sub-account without revoking individual keys. One
  // extra Firestore read per request — well worth it for the kill-switch
  // capability. Default-deny on missing field (legacy docs / first run).
  const subSnap = await getAdminDb()
    .doc(`subAccounts/${candidate.subAccountId}`)
    .get();
  if (!subSnap.exists) {
    return apiError(
      tentativeMeta,
      "authentication_error",
      "invalid_api_key",
      "Invalid API key provided.",
    );
  }
  const subData = subSnap.data()!;
  if (subData.apiAccessEnabledByAgency !== true) {
    return apiError(
      tentativeMeta,
      "permission_error",
      "api_access_disabled",
      "API access has been disabled for this sub-account by your agency administrator. Contact them to re-enable.",
    );
  }

  // Resolve version. Caller pin (header) > key default > latest.
  const headerVersion = request.headers.get("leadstack-version");
  const resolved = resolveVersion({
    headerVersion: headerVersion ?? null,
    keyDefaultVersion: candidate.defaultVersion ?? null,
  });
  if ("error" in resolved) {
    return apiError(
      tentativeMeta,
      "invalid_request",
      "unsupported_version",
      resolved.error,
    );
  }

  // Best-effort lastUsedAt bump — never block on it.
  void bumpApiKeyLastUsed(candidate.subAccountId, candidate.id).catch((err) => {
    console.warn("[api/auth] bumpApiKeyLastUsed failed", err);
  });

  return {
    agencyId: candidate.agencyId,
    subAccountId: candidate.subAccountId,
    keyId: candidate.id,
    keyPrefix: candidate.prefix,
    mode: candidate.mode,
    scopes: candidate.scopes,
    requestId,
    apiVersion: resolved.version,
  };
}

/**
 * Check a required scope against the resolved ctx. Returns a NextResponse
 * if access is denied; null otherwise. Routes that don't use the
 * `withApiAuth` HOF call this directly after `authenticateApiRequest`.
 */
export function requireApiScope(
  ctx: ApiAuthContext,
  scope: ApiKeyScope,
): NextResponse | null {
  if (ctx.scopes.includes(scope)) return null;
  return apiError(
    ctx,
    "permission_error",
    "insufficient_scope",
    `This key is missing required scope '${scope}'. Mint a new key with the right scope.`,
  );
}

/**
 * Read the request body exactly once and parse to JSON. Returns
 * `{rawBody, body}` — `body` is null when the request has no body or the
 * body isn't valid JSON.
 *
 * The HOF below uses this once per request and forwards both forms to the
 * handler so a handler never accidentally re-consumes the stream.
 */
async function readBody(
  request: Request,
): Promise<{ rawBody: string; body: unknown }> {
  // GET / HEAD never carry a body in Next's Request shape.
  if (request.method === "GET" || request.method === "HEAD") {
    return { rawBody: "", body: null };
  }
  const rawBody = await request.text();
  if (!rawBody) return { rawBody: "", body: null };
  try {
    return { rawBody, body: JSON.parse(rawBody) };
  } catch {
    return { rawBody, body: null };
  }
}

/**
 * High-level wrapper. Use for nearly every v1 route handler — handles
 * auth, body parsing, scope check, idempotency, response headers.
 *
 * Usage:
 *   export const POST = withApiAuth<{ id: string }>(async (input) => {
 *     const { ctx, params, body } = input;
 *     // ... business logic
 *     return apiOk(ctx, { contact: serializeContactForApi(c) }, { status: 201 });
 *   }, { requireScope: "admin" });
 */
export function withApiAuth<P extends Record<string, string> = Record<string, string>>(
  handler: (input: ApiHandlerInput<P>) => Promise<NextResponse>,
  opts: WithApiAuthOptions = {},
): (
  request: Request,
  routeCtx: { params: Promise<P> },
) => Promise<NextResponse> {
  const requireScope: ApiKeyScope = opts.requireScope ?? "admin";

  return async (request, routeCtx) => {
    const start = Date.now();
    const url = new URL(request.url);

    const ctxOrErr = await authenticateApiRequest(request);
    if (!isAuthContext(ctxOrErr)) {
      // Auth failed — no ctx, no log capture (we don't know which sub-account
      // to write under). The 401 response itself is the audit record.
      return ctxOrErr;
    }
    const ctx = ctxOrErr;

    // Read the body BEFORE any other branching — every subsequent exit
    // point (scope-fail, rate-limit-fail, idempotency-replay, handler) needs
    // it in scope for the log capture. GET / HEAD short-circuit inside
    // readBody so this is essentially free for read paths.
    const params = await routeCtx.params;
    const { rawBody, body } = await readBody(request);

    // Helper that captures the log + returns the response. Used at every
    // exit point so every request makes it into the log viewer regardless
    // of how it ended (success, error, rate-limited, idempotency replay).
    const finalize = async (
      response: NextResponse,
      preReadBody?: unknown,
      errorCode?: string | null,
    ): Promise<NextResponse> => {
      const bodyJson =
        preReadBody !== undefined
          ? preReadBody
          : await response
              .clone()
              .json()
              .catch(() => null);
      void captureRequestLog({
        subAccountId: ctx.subAccountId,
        agencyId: ctx.agencyId,
        keyId: ctx.keyId,
        keyPrefix: ctx.keyPrefix,
        mode: ctx.mode,
        requestId: ctx.requestId,
        method: request.method,
        path: url.pathname,
        query: url.search,
        requestHeaders: request.headers,
        requestBody: rawBody,
        responseStatus: response.status,
        responseBodyJson: bodyJson,
        errorCode: errorCode ?? null,
        latencyMs: Date.now() - start,
      });
      return response;
    };

    const scopeErr = requireApiScope(ctx, requireScope);
    if (scopeErr) return finalize(scopeErr, undefined, "insufficient_scope");

    // Rate limit. Runs AFTER auth + scope check — failed-auth requests don't
    // burn the legitimate caller's per-key budget.
    const rl = checkRateLimit({
      keyId: ctx.keyId,
      mode: ctx.mode,
      scope: requireScope,
    });
    if (!rl.ok) {
      const rlResp = apiError(
        ctx,
        "rate_limit_error",
        "rate_limited",
        `Too many requests. Retry after ${rl.retryAfterSec}s.`,
        {
          extraHeaders: {
            "Retry-After": String(rl.retryAfterSec),
            "X-RateLimit-Limit": String(rl.limit ?? 0),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rl.retryAfterSec),
            "X-RateLimit-Window": rl.window ?? "",
          },
        },
      );
      return finalize(rlResp, undefined, "rate_limited");
    }

    // Idempotency check (POST/PATCH/DELETE + header present).
    const idempotencyKey = request.headers.get("idempotency-key");
    const useIdempotency =
      opts.idempotency !== false &&
      METHODS_WITH_IDEMPOTENCY.has(request.method) &&
      !!idempotencyKey;

    let fingerprint: string | null = null;
    if (useIdempotency) {
      if (!isValidIdempotencyKey(idempotencyKey!)) {
        return finalize(
          apiError(
            ctx,
            "invalid_request",
            "invalid_idempotency_key",
            "Idempotency-Key must be 1-255 characters of [A-Za-z0-9_-:.].",
          ),
          undefined,
          "invalid_idempotency_key",
        );
      }
      fingerprint = fingerprintRequest(request.method, url.pathname, rawBody);
      const cached = await readIdempotencyCache(
        ctx.subAccountId,
        ctx.mode,
        ctx.keyId,
        idempotencyKey!,
      );
      if (cached) {
        if (cached.requestFingerprint !== fingerprint) {
          return finalize(
            apiError(
              ctx,
              "idempotency_error",
              "idempotency_collision",
              "This Idempotency-Key was already used with a different request body. Use a new key for a new request.",
            ),
            undefined,
            "idempotency_collision",
          );
        }
        return finalize(
          apiOk(ctx, cached.bodyJson, { status: cached.status }),
          cached.bodyJson,
        );
      }
    }

    let response: NextResponse;
    try {
      response = await handler({ request, params, body, rawBody, ctx });
    } catch (err) {
      console.error("[api/v1] handler threw", err);
      return finalize(
        apiError(
          ctx,
          "internal_error",
          "internal_error",
          "Something went wrong on our end. Quote this request_id in support.",
        ),
        undefined,
        "internal_error",
      );
    }

    // Read response body ONCE, here, so both the idempotency cache writer
    // and the log capture see the same bytes without re-consuming the
    // response stream.
    const responseBodyJson = await response
      .clone()
      .json()
      .catch(() => null);

    // Cache successful responses only — never cache server errors so the
    // caller's retry-with-same-key actually hits the handler again.
    if (useIdempotency && fingerprint && response.status < 500) {
      try {
        await writeIdempotencyCache(
          ctx.subAccountId,
          ctx.mode,
          ctx.keyId,
          idempotencyKey!,
          {
            status: response.status,
            bodyJson: responseBodyJson,
            requestFingerprint: fingerprint,
          },
        );
      } catch (err) {
        // Cache write failures must not break the response. Log + return
        // the original response — the worst case is the next retry
        // re-executes (which is what would happen anyway without cache).
        console.warn("[api/v1] idempotency cache write failed", err);
      }
    }

    // Add per-key rate-limit snapshot headers so client libraries can pace
    // themselves without waiting for a 429. Computed AFTER the request was
    // counted so `remaining` reflects post-increment.
    const snapshot = snapshotRemaining({
      keyId: ctx.keyId,
      mode: ctx.mode,
      scope: requireScope,
    });
    response.headers.set("X-RateLimit-Limit", String(snapshot.limit));
    response.headers.set("X-RateLimit-Remaining", String(snapshot.remaining));
    response.headers.set("X-RateLimit-Reset", String(snapshot.resetSec));

    return finalize(response, responseBodyJson);
  };
}

function isAuthContext(v: ApiAuthContext | NextResponse): v is ApiAuthContext {
  // NextResponse has `status` numbers; ApiAuthContext has a `keyId` string.
  // Cheapest discriminator.
  return typeof (v as ApiAuthContext).keyId === "string";
}
