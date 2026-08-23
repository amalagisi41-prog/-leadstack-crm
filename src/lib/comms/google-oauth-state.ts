import "server-only";

import crypto from "node:crypto";

/**
 * CSRF state for the Google Workspace connect flow.
 *
 * HMAC-signed with the existing AUTOMATIONS_TOKEN_SECRET so the callback can
 * trust that `state` came from our connect route — and names the sub-account
 * the admin actually started the flow from — without persisting anything.
 *
 * Directly mirrors lib/comms/meta.ts::signMetaState / verifyMetaState. The
 * `googlestate:` domain prefix keeps a signature minted for one integration
 * from validating against the other.
 */

function stateSecret(): string {
  return process.env.AUTOMATIONS_TOKEN_SECRET ?? "";
}

export function signGoogleOAuthState(
  subAccountId: string,
  nonce: string,
): string {
  const payload = `${subAccountId}.${nonce}`;
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(`googlestate:${payload}`)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyGoogleOAuthState(
  state: string,
): { subAccountId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [subAccountId, nonce, sig] = parts;

  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(`googlestate:${subAccountId}.${nonce}`)
    .digest("hex");

  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }

  return { subAccountId };
}
