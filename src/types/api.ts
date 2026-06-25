/**
 * Public API v1 — sub-account-scoped Bearer API keys.
 *
 * Keys are minted as one of two modes:
 *   - `live` — `lsk_live_<prefix>_<secret>`, hits production data.
 *   - `test` — `lsk_test_<prefix>_<secret>`, hits a parallel namespace
 *     (`_test` subcollections under the sub-account doc) and short-circuits
 *     every external side-effect (no Resend send, no Twilio send, no
 *     outbound webhook delivery). Lets agencies build / preview Zapier +
 *     Make integrations without polluting real contact data or burning
 *     SMS/email credits.
 *
 * Persisted doc lives at `subAccounts/{subAccountId}/apiKeys/{keyId}` and
 * stores only the SHA-256 hash of the full key — the raw secret is shown
 * to the operator once at creation and never recoverable thereafter.
 */
export type ApiKeyMode = "live" | "test";

/**
 * Permission tiers a key can be minted with. Stored as a list (not a single
 * scope) so v1.1 fine-grained scopes ("contacts:read", "deals:write", …)
 * can be added without a schema migration.
 *
 *   - `admin`        — full CRUD across every resource in the sub-account.
 *                      Server-to-server only (Zapier connections, Make.com,
 *                      internal automations). Never embed in a browser.
 *   - `forms-ingest` — write-only, restricted to `POST /api/v1/forms/{id}/
 *                      submissions`. Safe to embed in client-side JS on a
 *                      custom landing page (CORS open for this scope only).
 */
export type ApiKeyScope = "admin" | "forms-ingest";

/**
 * Firestore doc at `subAccounts/{subAccountId}/apiKeys/{keyId}`. Server-only
 * read/write (Firestore rules deny clients); the operator UI talks to the
 * Admin-SDK-backed `/api/sub-accounts/{id}/api-keys` routes instead.
 */
export interface ApiKeyDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  /** Operator-supplied label, e.g. "Zapier production", "Webflow form". */
  name: string;
  mode: ApiKeyMode;
  /**
   * First 8 chars of the secret portion (after `lsk_<mode>_`). Indexed for
   * O(log n) lookup at auth time — the middleware finds the candidate doc
   * by prefix and then constant-time-compares the full SHA-256 hash. Stored
   * unhashed because the prefix alone gives zero forgery utility (32^8 ≈
   * 10^12 prefixes; finding the matching 32-char secret is still infeasible).
   *
   * Useful side-effect: the prefix is what we render in the UI + audit logs,
   * so an operator can identify "which key is this?" from a Vercel log line
   * without needing to look at the full secret.
   */
  prefix: string;
  /** SHA-256 hex of the full key string. The raw key is never persisted. */
  hashedSecret: string;
  scopes: ApiKeyScope[];
  /**
   * API version this key was minted against. Used as the fallback when a
   * request omits the `LeadStack-Version` header. Pins the key to the
   * version snapshot it was issued against so we can roll new versions
   * without breaking old integrations. Optional for backwards-compat —
   * keys minted before versioning shipped fall back to latest.
   */
  defaultVersion?: string;
  createdByUid: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedByUid: string | null;
}

/**
 * Wire shape for the API. Mirrors `ApiKeyDoc` but omits `hashedSecret`
 * (never leaves the server). Returned by the list + create endpoints.
 *
 * `secret` is populated ONLY on the create response — the one moment the
 * operator sees the raw key. Every subsequent fetch returns it as
 * `undefined`. The UI uses that to render the "copy now, you won't see
 * this again" banner.
 */
export interface ApiKeyResponse {
  id: string;
  name: string;
  mode: ApiKeyMode;
  prefix: string;
  scopes: ApiKeyScope[];
  defaultVersion?: string;
  createdByUid: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** Full `lsk_<mode>_<prefix>_<secret>` — present ONLY in the create response. */
  secret?: string;
}

/**
 * Wire shape for one row of the API request log viewer (Logs → API).
 * Serialized from `subAccounts/{id}/apiRequestLogs/{logId}` by
 * `listRequestLogs()`. Timestamps are ISO strings; the header/body
 * excerpts are already sanitized + truncated at capture time.
 */
export interface ApiRequestLogResponse {
  id: string;
  requestId: string;
  mode: ApiKeyMode;
  keyPrefix: string;
  method: string;
  path: string;
  query: string;
  responseStatus: number;
  errorCode: string | null;
  latencyMs: number;
  createdAt: string;
  /** JSON string of the sanitized request headers (auth headers dropped). */
  requestHeaders: string;
  /** Truncated request body excerpt (≤2KB). */
  requestBody: string;
  /** Truncated response body excerpt (≤2KB). */
  responseBody: string;
}
